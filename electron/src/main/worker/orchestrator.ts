import { BrowserWindow } from 'electron';
import { ensureAgentProcess, killAgent, getAgentProcess, sendAgentMessage } from '../agent';
import { loadURL, getBrowserView } from '../browser-view';
import { TaskStateMachine } from './task-state';
import { buildContext } from './context';
import { ChatBuffer, ParsedChunk } from './chat-buffer';
import { logger } from './logger';
import { isHtmlGameTask, validateCurrentPage } from './page-validator';
import { appendClaudeSessionTurn, loadClaudeSession, getClaudeSessionFile } from './session-store';

export type PushUIFn = (channel: string, data: unknown) => void;

export class Orchestrator {
  private mainWindow: BrowserWindow;
  private pushUI: PushUIFn;
  private state: TaskStateMachine;
  private buffer: ChatBuffer;
  private currentTask: string | null = null;
  private currentAgentTranscript = '';
  private currentAttempt = 0;
  private observedAgentPid: number | null = null;
  private pendingTasks: string[] = [];
  private silenceTimer: NodeJS.Timeout | null = null;
  private turnStartedAt = 0;
  private lastAgentOutputAt = 0;
  private readonly maxValidationRetries = 2;

  constructor(mainWindow: BrowserWindow, pushUI: PushUIFn) {
    this.mainWindow = mainWindow;
    this.pushUI = pushUI;
    this.state = new TaskStateMachine();
    this.buffer = new ChatBuffer();

    this.state.setProgressCallback((steps) => {
      logger.info('task:state', { phase: this.state.phase, steps });
      this.pushUI('task:progress', { steps });
    });

    logger.info('task:state', { phase: 'init', msg: 'Orchestrator created' });
    this.ensurePersistentAgent();
  }

  async handleTask(task: string): Promise<void> {
    this.currentTask = task;
    this.currentAttempt = 0;
    try {
      await this.runTask(task);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('task:error', { task, message });
      this.pushUI('chat:message', {
        text: `[Worker] 任务执行失败: ${message}`,
        timestamp: Date.now(),
        error: true,
      });
      this.state.fail();
      this.pushUI('task:complete', { code: 1 });
      this.currentTask = null;
    }
  }

  private async runTask(task: string, validationFeedback?: string): Promise<void> {
    logger.info('task:start', { task });
    this.currentAgentTranscript = '';

    if (!validationFeedback) {
      this.state.start(task);
    }

    const effectiveTask = validationFeedback
      ? `${task}\n\n【上一版页面验收失败，必须修正后重新生成】\n${validationFeedback}`
      : task;
    const session = loadClaudeSession();
    const { prompt, skillsFound } = buildContext(effectiveTask);
    logger.info('task:context', {
      skillsFound,
      promptLength: prompt.length,
      sessionId: session.id,
      sessionTurns: session.turnCount,
      sessionFile: getClaudeSessionFile(),
      promptPreview: prompt.slice(0, 500),
    });

    this.state.advanceTo('running');

    const proc = this.ensurePersistentAgent();
    this.pendingTasks.push(task);
    this.currentTask = this.pendingTasks[0] ?? task;
    this.turnStartedAt = Date.now();
    this.lastAgentOutputAt = this.turnStartedAt;
    this.startSilenceTimer();

    this.pushUI('chat:message', {
      text: `[Agent] PID ${proc.pid}${skillsFound.length ? ` · ${skillsFound.join(', ')}` : ''}`,
      timestamp: Date.now(),
    });

    sendAgentMessage(prompt);
  }

  private ensurePersistentAgent(): NonNullable<ReturnType<typeof getAgentProcess>> {
    const proc = ensureAgentProcess();
    if (this.observedAgentPid === proc.pid) {
      return proc;
    }

    proc.stdout?.on('data', (chunk: Buffer) => {
      this.lastAgentOutputAt = Date.now();
      const text = chunk.toString();
      logger.stdout(text);
      const parsed = this.buffer.feed(text);
      for (const p of parsed) {
        logger.info('agent:parsed', { type: p.type, tool: p.toolName, preview: p.content.slice(0, 200) });
        this.handleParsedChunk(p);
      }
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      this.lastAgentOutputAt = Date.now();
      const text = chunk.toString().trim();
      if (text) {
        logger.stderr(text);
        this.pushUI('chat:message', { text, timestamp: Date.now(), error: true });
      }
    });

    proc.on('close', (code) => {
      this.stopSilenceTimer();
      this.observedAgentPid = null;
      if (this.pendingTasks.length > 0 || this.currentTask) {
        void this.handleAgentProcessExit(code ?? 1);
      }
    });

    proc.on('error', (err) => {
      logger.error('agent:error', { message: err.message, stack: err.stack });
      this.pushUI('chat:message', {
        text: `[Agent] 启动失败: ${err.message}`,
        timestamp: Date.now(),
        error: true,
      });
      this.state.fail();
      this.currentTask = null;
    });

    this.observedAgentPid = proc.pid ?? null;
    logger.info('agent:spawn', { pid: proc.pid, started: !!proc.pid, persistent: true });
    return proc;
  }

  private async handleAgentTurnComplete(code: number, task: string): Promise<void> {
    logger.info('agent:turn-complete', { exitCode: code, task: task.slice(0, 100) });

    const remaining = this.buffer.flush();
    for (const p of remaining) {
      logger.info('agent:parsed', { type: p.type, tool: p.toolName, preview: p.content.slice(0, 200) });
      this.handleParsedChunk(p);
    }

    if (code === 0 && isHtmlGameTask(task)) {
      const browserView = getBrowserView();
      if (browserView) {
        const validation = await validateCurrentPage(browserView, task);
        if (validation) {
          logger.info('page:validate', {
            ok: validation.ok,
            reasons: validation.reasons,
            screenshotPath: validation.screenshotPath,
            url: validation.url,
            title: validation.title,
            metrics: validation.metrics,
            attempt: this.currentAttempt,
          });

          this.pushUI('chat:message', {
            text: `[Worker] 页面验收截图: ${validation.screenshotPath}`,
            timestamp: Date.now(),
          });

          if (!validation.ok && this.currentAttempt < this.maxValidationRetries) {
            this.currentAttempt += 1;
            const feedback = [
              `当前页面 URL: ${validation.url}`,
              `标题: ${validation.title}`,
              `验收失败原因: ${validation.reasons.join('；')}`,
              `当前尺寸指标: widthRatio=${validation.metrics.widthRatio}, heightRatio=${validation.metrics.heightRatio}, areaRatio=${validation.metrics.areaRatio}`,
              `失败截图: ${validation.screenshotPath}`,
              '要求：直接修改并重新打开当前 HTML，直到页面铺满 BrowserView 且打开后不处于失败状态。',
            ].join('\n');

            this.pushUI('chat:message', {
              text: `[Worker] 页面验收未通过，开始自动返工（第 ${this.currentAttempt} 次）`,
              timestamp: Date.now(),
              error: true,
            });

            this.pendingTasks.shift();
            this.currentTask = this.pendingTasks[0] ?? null;
            await this.runTask(task, feedback);
            return;
          }

          if (!validation.ok) {
            this.pushUI('chat:message', {
              text: `[Worker] 页面验收失败：${validation.reasons.join('；')}`,
              timestamp: Date.now(),
              error: true,
            });
            this.state.fail();
            this.pushUI('task:complete', { code: 2 });
            this.pendingTasks.shift();
            this.currentTask = this.pendingTasks[0] ?? null;
            if (!this.currentTask) {
              this.stopSilenceTimer();
            }
            return;
          }
        }
      }
    }

    this.pushUI('chat:message', {
      text: code === 0 ? '[Agent] 任务完成' : `[Agent] 任务失败 (code: ${code})`,
      timestamp: Date.now(),
    });

    if (code === 0) {
      this.state.complete();
      logger.info('task:complete', { exitCode: code });
      appendClaudeSessionTurn({
        user: task,
        assistant: this.currentAgentTranscript || '[Agent] 任务完成',
        status: 'completed',
      });
    } else {
      this.state.fail();
      logger.error('task:complete', { exitCode: code, msg: 'Agent exited with error' });
      appendClaudeSessionTurn({
        user: task,
        assistant: this.currentAgentTranscript || `[Agent] 任务失败 (code: ${code})`,
        status: 'failed',
      });
      this.pushUI('chat:message', {
        text: '当前 Agent 通道不可用，请检查 apikey.txt 和 Claude Code 进程日志。',
        timestamp: Date.now(),
        error: true,
      });
    }

    this.pushUI('task:complete', { code });
    this.pendingTasks.shift();
    this.currentTask = this.pendingTasks[0] ?? null;
    if (!this.currentTask) {
      this.stopSilenceTimer();
    } else {
      this.turnStartedAt = Date.now();
      this.lastAgentOutputAt = this.turnStartedAt;
    }
  }

  private async handleAgentProcessExit(code: number): Promise<void> {
    logger.info('agent:close', { exitCode: code, pendingTasks: this.pendingTasks.length });
    const task = this.pendingTasks[0] ?? this.currentTask ?? 'unknown';
    this.pushUI('chat:message', {
      text: `[Agent] Claude Code 进程已退出 (code: ${code})`,
      timestamp: Date.now(),
      error: code !== 0,
    });
    if (this.currentTask) {
      appendClaudeSessionTurn({
        user: this.currentTask,
        assistant: this.currentAgentTranscript || `[Agent] 进程退出 (code: ${code})`,
        status: code === 0 ? 'completed' : 'failed',
      });
    }
    if (code === 0) {
      this.state.complete();
    } else {
      this.state.fail();
    }
    this.pendingTasks = [];
    this.currentTask = null;
    this.pushUI('task:complete', { code });
  }

  private handleParsedChunk(p: ParsedChunk): void {
    if (p.type === 'init') {
      const failedMcp = p.mcpServers?.filter((server) => ['failed', 'needs-auth', 'disabled', 'blocked'].includes(server.status)) ?? [];
      if (failedMcp.length > 0) {
        const names = failedMcp.map((server) => server.name).join(', ');
        logger.error('mcp:init', { failedMcp });
        this.pushUI('chat:message', {
          text: `[Worker] MCP 服务连接失败: ${names}`,
          timestamp: Date.now(),
          error: true,
        });
        this.state.fail();
        killAgent();
        this.currentTask = null;
        return;
      }

      logger.info('mcp:init', { mcpServers: p.mcpServers });
      return;
    }

    if (p.type === 'result') {
      const task = this.pendingTasks[0] ?? this.currentTask;
      if (p.isError && p.content) {
        this.currentAgentTranscript += `${p.content}\n`;
        this.pushUI('chat:message', {
          text: p.content,
          timestamp: Date.now(),
          error: true,
        });
      }
      if (task) {
        void this.handleAgentTurnComplete(p.isError ? 1 : 0, task);
      }
      return;
    }

    const isError = p.type === 'error';
    if (p.content) {
      this.currentAgentTranscript += `${p.content}\n`;
    }

    logger.debug('ui:push', { channel: 'chat:message', type: p.type, tool: p.toolName, content: p.content.slice(0, 300) });
    this.pushUI('chat:message', {
      text: p.type === 'thinking' ? `[Agent 思考]\n${p.content}` : p.content,
      timestamp: Date.now(),
      error: isError,
    });

    if (p.type === 'tool_call' && p.toolName) {
      const tool = p.toolName;
      if (tool.includes('navigate') || tool.includes('goto')) {
        this.state.advanceTo('navigating');
      } else if (tool.includes('extract')) {
        this.state.advanceTo('extracting');
      } else if (tool.includes('save')) {
        this.state.advanceTo('cleaning');
      }
    }
  }

  private startSilenceTimer(): void {
    if (this.silenceTimer) return;
    this.silenceTimer = setInterval(() => {
      if (!this.currentTask || this.pendingTasks.length === 0) return;
      const now = Date.now();
      if (now - this.lastAgentOutputAt < 5000) return;
      const seconds = Math.floor((now - this.turnStartedAt) / 1000);
      this.lastAgentOutputAt = now;
      this.pushUI('chat:message', {
        text: `[Agent] 思考中... ${seconds}s`,
        timestamp: now,
      });
      logger.info('agent:silence', { seconds, task: this.currentTask.slice(0, 100) });
    }, 1000);
  }

  private stopSilenceTimer(): void {
    if (!this.silenceTimer) return;
    clearInterval(this.silenceTimer);
    this.silenceTimer = null;
  }

  pause(): void {
    logger.info('task:state', { action: 'pause' });
    if (this.currentTask) {
      appendClaudeSessionTurn({
        user: this.currentTask,
        assistant: this.currentAgentTranscript || '[Worker] 任务已暂停',
        status: 'interrupted',
      });
    }
    killAgent();
    this.pushUI('chat:message', {
      text: '[Worker] 任务已暂停',
      timestamp: Date.now(),
    });
  }

  resume(): void {
    logger.info('task:state', { action: 'resume', task: this.currentTask?.slice(0, 100) });
    if (this.currentTask) {
      this.pushUI('chat:message', {
        text: '[Worker] 恢复任务...',
        timestamp: Date.now(),
      });
      void this.handleTask(this.currentTask);
    }
  }

  stop(): void {
    logger.info('task:state', { action: 'stop' });
    killAgent();
    this.state.reset();
    this.currentTask = null;
    this.pushUI('chat:message', {
      text: '[Worker] 任务已停止',
      timestamp: Date.now(),
    });
  }

  navigateBrowser(url: string): void {
    logger.info('browser:navigate', { url });
    loadURL(url);
  }

  getBrowserState(): { url: string; title: string } {
    const bv = getBrowserView();
    if (!bv) {
      logger.warn('browser:state', { error: 'BrowserView not available' });
      return { url: '', title: '' };
    }
    const state = {
      url: bv.webContents.getURL(),
      title: bv.webContents.getTitle(),
    };
    logger.info('browser:state', state);
    return state;
  }
}
