import { BrowserWindow } from 'electron';
import { spawnAgent, killAgent, getAgentProcess } from '../agent';
import { loadURL, getBrowserView } from '../browser-view';
import { TaskStateMachine } from './task-state';
import { buildContext } from './context';
import { ChatBuffer, ParsedChunk } from './chat-buffer';
import { logger } from './logger';
import { tryHandleQuickTask } from './quick-tasks';
import { isHtmlGameTask, validateCurrentPage } from './page-validator';
import { buildSearchPreflightPlan, buildSearchPreflightPrompt, SearchPreflightPlan } from './search-preflight';
import { appendClaudeSessionTurn, buildClaudeSessionContext, getClaudeSessionFile } from './session-store';

export type PushUIFn = (channel: string, data: unknown) => void;

export class Orchestrator {
  private mainWindow: BrowserWindow;
  private pushUI: PushUIFn;
  private state: TaskStateMachine;
  private buffer: ChatBuffer;
  private currentTask: string | null = null;
  private currentAgentTranscript = '';
  private currentAttempt = 0;
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

    if (getAgentProcess()) {
      logger.warn('agent:kill', { reason: 'new task, killing old agent' });
      killAgent();
    }

    if (!validationFeedback) {
      this.state.start(task);
    }

    const browserView = getBrowserView();
    if (!validationFeedback && browserView) {
      try {
        const quickResult = await tryHandleQuickTask(task, browserView);
        if (quickResult.handled) {
          logger.info('task:complete', {
            mode: 'quick-task',
            task,
            label: quickResult.label,
            url: quickResult.url,
            screenshotPath: quickResult.screenshotPath,
          });
          this.pushUI('chat:message', {
            text: `[Worker] 已通过 Electron 内置快捷流程完成：${quickResult.label}`,
            timestamp: Date.now(),
          });
          if (quickResult.message) {
            this.pushUI('chat:message', {
              text: quickResult.message,
              timestamp: Date.now(),
            });
          }
          if (quickResult.url) {
            this.pushUI('chat:message', {
              text: `[Worker] 当前页面: ${quickResult.url}`,
              timestamp: Date.now(),
            });
          }
          if (quickResult.screenshotPath) {
            this.pushUI('chat:message', {
              text: `[Worker] 截图已保存: ${quickResult.screenshotPath}`,
              timestamp: Date.now(),
            });
          }
          this.state.advanceTo('navigating');
          this.state.complete();
          appendClaudeSessionTurn({
            user: task,
            assistant: quickResult.message || `[Worker] 已通过 Electron 内置快捷流程完成：${quickResult.label}`,
            status: 'completed',
          });
          this.pushUI('task:complete', { code: 0 });
          this.currentTask = null;
          return;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('quick-task:error', { task, message });
        this.pushUI('chat:message', {
          text: `[Worker] 快捷打开失败，改走常规任务链路: ${message}`,
          timestamp: Date.now(),
          error: true,
        });
      }
    }

    const searchPreflight = !validationFeedback && browserView
      ? buildSearchPreflightPlan(task, browserView.webContents.getURL())
      : null;
    let appliedSearchPreflight: SearchPreflightPlan | null = null;

    if (searchPreflight && browserView) {
      try {
        await this.runSearchPreflight(searchPreflight, browserView);
        appliedSearchPreflight = searchPreflight;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('search:preflight', { ok: false, task, message, plan: searchPreflight });
        this.pushUI('chat:message', {
          text: `[Worker] 搜索预处理失败，改走常规 Agent 链路: ${message}`,
          timestamp: Date.now(),
          error: true,
        });
      }
    }

    this.pushUI('chat:message', {
      text: `[Worker] 构建任务上下文...`,
      timestamp: Date.now(),
    });

    const taskWithPreflight = appliedSearchPreflight
      ? `${task}\n\n${buildSearchPreflightPrompt(appliedSearchPreflight)}`
      : task;
    const effectiveTask = validationFeedback
      ? `${taskWithPreflight}\n\n【上一版页面验收失败，必须修正后重新生成】\n${validationFeedback}`
      : taskWithPreflight;
    const sessionContext = buildClaudeSessionContext();
    const taskForContext = `${sessionContext.text}\n${effectiveTask}`;
    const { prompt, skillsFound } = buildContext(taskForContext);
    logger.info('task:context', {
      skillsFound,
      promptLength: prompt.length,
      sessionId: sessionContext.session.id,
      sessionTurns: sessionContext.session.turnCount,
      sessionFile: getClaudeSessionFile(),
      promptPreview: prompt.slice(0, 500),
    });

    this.pushUI('chat:message', {
      text: `[Session] ${sessionContext.session.id} · ${sessionContext.session.turnCount} 轮上下文已接入`,
      timestamp: Date.now(),
    });

    if (skillsFound.length > 0) {
      this.pushUI('chat:message', {
        text: `[Worker] 已加载平台知识: ${skillsFound.join(', ')}`,
        timestamp: Date.now(),
      });
    }

    this.state.advanceTo('running');

    this.pushUI('chat:message', {
      text: `[Agent] 启动中...`,
      timestamp: Date.now(),
    });

    logger.info('agent:spawn', { task: task.slice(0, 100) });
    const proc = spawnAgent(prompt, { continueSession: sessionContext.session.turnCount > 0 });
    logger.info('agent:spawn', {
      pid: proc.pid,
      started: !!proc.pid,
      continueSession: sessionContext.session.turnCount > 0,
    });

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      logger.stdout(text);
      const parsed = this.buffer.feed(text);
      for (const p of parsed) {
        logger.info('agent:parsed', { type: p.type, tool: p.toolName, preview: p.content.slice(0, 200) });
        this.handleParsedChunk(p);
      }
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) {
        logger.stderr(text);
        this.pushUI('chat:message', { text, timestamp: Date.now(), error: true });
      }
    });

    proc.on('close', (code) => {
      void this.handleAgentClose(code ?? 1, task);
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
  }

  private async handleAgentClose(code: number, task: string): Promise<void> {
    logger.info('agent:close', { exitCode: code });

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
            this.currentTask = null;
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
        text: '当前远端 Agent 通道不可用。可先直接使用“打开网页 / B站 / 股票搜索 / 贪吃蛇”这类本地快捷能力。',
        timestamp: Date.now(),
        error: true,
      });
    }

    this.pushUI('task:complete', { code });
    this.currentTask = null;
  }

  private async runSearchPreflight(plan: SearchPreflightPlan, browserView: NonNullable<ReturnType<typeof getBrowserView>>): Promise<void> {
    logger.info('search:preflight', { ok: true, plan });
    this.state.advanceTo('navigating');
    this.pushUI('chat:message', {
      text: `[Worker] 搜索预处理：${plan.reason}，先打开 ${plan.platform} 搜索页（关键词：${plan.keyword}）`,
      timestamp: Date.now(),
    });

    try {
      await browserView.webContents.loadURL(plan.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('ERR_ABORTED')) {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2200));
    logger.info('search:preflight', {
      currentUrl: browserView.webContents.getURL(),
      title: browserView.webContents.getTitle(),
    });
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

    const isError = p.type === 'error';
    if (p.content) {
      this.currentAgentTranscript += `${p.content}\n`;
    }

    logger.debug('ui:push', { channel: 'chat:message', type: p.type, tool: p.toolName, content: p.content.slice(0, 300) });
    this.pushUI('chat:message', {
      text: p.content,
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
