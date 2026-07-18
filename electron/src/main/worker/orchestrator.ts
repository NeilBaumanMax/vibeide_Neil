import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { ensureAgentProcess, killAgent, getAgentProcess, sendAgentMessage } from '../agent';
import { loadURL, getBrowserView } from '../browser-view';
import { TaskStateMachine } from './task-state';
import { buildContext } from './context';
import { ChatBuffer, ParsedChunk } from './chat-buffer';
import { logger } from './logger';
import { isHtmlGameTask, validateCurrentPage } from './page-validator';
import { appendClaudeSessionTurn, loadClaudeSession, getClaudeSessionFile } from './session-store';

export type PushUIFn = (channel: string, data: unknown) => void;
export type TaskSubmitMode = 'auto' | 'guide' | 'queue';

export interface TaskSubmitResult {
  ok: boolean;
  disposition: 'started' | 'guided' | 'queued';
  taskId: string;
  activeTaskId: string | null;
  queueLength: number;
  guidanceCount: number;
}

interface QueuedTask {
  id: string;
  text: string;
}

interface TaskContinuation {
  kind: 'guidance' | 'validation' | 'resume';
  text: string;
}

export class Orchestrator {
  private mainWindow: BrowserWindow;
  private pushUI: PushUIFn;
  private state: TaskStateMachine;
  private buffer: ChatBuffer;
  private currentTask: string | null = null;
  private currentTaskId: string | null = null;
  private currentAgentTranscript = '';
  private currentAttempt = 0;
  private observedAgentPid: number | null = null;
  private queuedTasks: QueuedTask[] = [];
  private pendingGuidance: string[] = [];
  private currentUserTurns: string[] = [];
  private turnInFlight = false;
  private paused = false;
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
      this.pushUI('task:progress', { steps, taskId: this.currentTaskId });
    });

    logger.info('task:state', { phase: 'init', msg: 'Orchestrator created' });
    this.ensurePersistentAgent();
  }

  submitTask(task: string, mode: TaskSubmitMode = 'auto'): TaskSubmitResult {
    const text = task.trim();
    if (!text) throw new Error('任务内容不能为空');
    const request: QueuedTask = { id: randomUUID(), text };

    if (this.currentTask || this.turnInFlight || this.paused) {
      if (mode === 'queue') {
        this.queuedTasks.push(request);
        this.pushUI('chat:message', {
          text: `[Worker] 已排队为下一任务（队列 ${this.queuedTasks.length}）`,
          timestamp: Date.now(),
          taskId: request.id,
        });
        this.emitTaskStatus();
        return this.submitResult('queued', request.id);
      }

      this.pendingGuidance.push(text);
      this.pushUI('chat:message', {
        text: `[Worker] 已追加到当前任务，将在当前执行步骤结束后继续处理（追加 ${this.pendingGuidance.length}）`,
        timestamp: Date.now(),
        taskId: this.currentTaskId,
      });
      this.emitTaskStatus();
      return this.submitResult('guided', this.currentTaskId || request.id);
    }

    void this.startTask(request);
    return this.submitResult('started', request.id);
  }

  async handleTask(task: string): Promise<void> {
    this.submitTask(task, 'auto');
  }

  private async startTask(request: QueuedTask): Promise<void> {
    this.currentTask = request.text;
    this.currentTaskId = request.id;
    this.currentAttempt = 0;
    this.currentAgentTranscript = '';
    this.currentUserTurns = [request.text];
    this.paused = false;
    this.emitTaskStatus();
    try {
      await this.runTask(request.text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('task:error', { task: request.text, taskId: request.id, message });
      this.pushUI('chat:message', {
        text: `[Worker] 任务执行失败: ${message}`,
        timestamp: Date.now(),
        error: true,
        taskId: request.id,
      });
      this.state.fail();
      this.pushUI('task:complete', { code: 1, taskId: request.id });
      this.finishCurrentTask();
    }
  }

  private async runTask(task: string, continuation?: TaskContinuation): Promise<void> {
    logger.info('task:start', { task, taskId: this.currentTaskId, continuation: continuation?.kind });

    if (!continuation) {
      this.state.start(task);
    }

    let effectiveTask = task;
    if (continuation?.kind === 'validation') {
      effectiveTask = `${task}\n\n【上一版页面验收失败，必须修正后重新生成】\n${continuation.text}`;
    } else if (continuation?.kind === 'guidance') {
      effectiveTask = `${task}\n\n【用户在执行过程中追加的要求】\n${continuation.text}\n\n继续当前任务，不要把追加要求当成独立任务；检查已有工作并在完成后统一汇报。`;
    } else if (continuation?.kind === 'resume') {
      effectiveTask = `${task}\n\n【恢复此前暂停的任务】\n${continuation.text}`;
    }
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
    this.turnInFlight = true;
    this.turnStartedAt = Date.now();
    this.lastAgentOutputAt = this.turnStartedAt;
    this.startSilenceTimer();

    this.pushUI('chat:message', {
      text: `[Agent] PID ${proc.pid}${skillsFound.length ? ` · ${skillsFound.join(', ')}` : ''}`,
      timestamp: Date.now(),
      taskId: this.currentTaskId,
    });
    if (!continuation) {
      this.pushUI('chat:message', {
        text: this.describeExecutionPlan(task),
        timestamp: Date.now(),
        taskId: this.currentTaskId,
      });
    }

    sendAgentMessage(prompt);
    this.emitTaskStatus();
  }

  private ensurePersistentAgent(): NonNullable<ReturnType<typeof getAgentProcess>> {
    const proc = ensureAgentProcess();
    if (this.observedAgentPid === proc.pid) {
      return proc;
    }

    this.buffer = new ChatBuffer();

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
        this.pushUI('chat:message', { text, timestamp: Date.now(), error: true, taskId: this.currentTaskId });
      }
    });

    proc.on('close', (code) => {
      if (this.observedAgentPid !== (proc.pid ?? null)) return;
      this.stopSilenceTimer();
      this.observedAgentPid = null;
      if (this.currentTask || this.turnInFlight) {
        void this.handleAgentProcessExit(code ?? 1);
      }
    });

    proc.on('error', (err) => {
      if (this.observedAgentPid !== (proc.pid ?? null)) return;
      logger.error('agent:error', { message: err.message, stack: err.stack });
      this.pushUI('chat:message', {
        text: `[Agent] 启动失败: ${err.message}`,
        timestamp: Date.now(),
        error: true,
        taskId: this.currentTaskId,
      });
      this.state.fail();
      this.turnInFlight = false;
      this.finishCurrentTask();
    });

    this.observedAgentPid = proc.pid ?? null;
    logger.info('agent:spawn', { pid: proc.pid, started: !!proc.pid, persistent: true });
    return proc;
  }

  private async handleAgentTurnComplete(code: number, task: string): Promise<void> {
    if (!this.turnInFlight) {
      logger.warn('agent:turn-complete', { ignored: true, exitCode: code, task: task.slice(0, 100) });
      return;
    }
    this.turnInFlight = false;
    logger.info('agent:turn-complete', { exitCode: code, taskId: this.currentTaskId, task: task.slice(0, 100) });

    const remaining = this.buffer.flush();
    for (const p of remaining) {
      logger.info('agent:parsed', { type: p.type, tool: p.toolName, preview: p.content.slice(0, 200) });
      this.handleParsedChunk(p);
    }

    if (code === 0 && await this.continueWithPendingGuidance(task)) return;

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
            taskId: this.currentTaskId,
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
              taskId: this.currentTaskId,
            });

            await this.runTask(task, { kind: 'validation', text: feedback });
            return;
          }

          if (!validation.ok) {
            if (await this.continueWithPendingGuidance(task)) return;
            this.pushUI('chat:message', {
              text: `[Worker] 页面验收失败：${validation.reasons.join('；')}`,
              timestamp: Date.now(),
              error: true,
              taskId: this.currentTaskId,
            });
            this.state.fail();
            this.pushUI('task:complete', { code: 2, taskId: this.currentTaskId });
            this.finishCurrentTask();
            return;
          }
        }
      }
    }

    // 页面验收本身可能耗时；验收期间收到的追加要求也必须留在当前任务内。
    if (code === 0 && await this.continueWithPendingGuidance(task)) return;

    this.pushUI('chat:message', {
      text: code === 0 ? '[Agent] 任务完成' : `[Agent] 任务失败 (code: ${code})`,
      timestamp: Date.now(),
      taskId: this.currentTaskId,
    });

    if (code === 0) {
      this.state.complete();
      logger.info('task:complete', { exitCode: code });
      appendClaudeSessionTurn({
        user: this.currentUserTurns.join('\n\n追加要求：\n'),
        assistant: this.currentAgentTranscript || '[Agent] 任务完成',
        status: 'completed',
      });
    } else {
      this.state.fail();
      logger.error('task:complete', { exitCode: code, msg: 'Agent exited with error' });
      appendClaudeSessionTurn({
        user: this.currentUserTurns.join('\n\n追加要求：\n'),
        assistant: this.currentAgentTranscript || `[Agent] 任务失败 (code: ${code})`,
        status: 'failed',
      });
      this.pushUI('chat:message', {
        text: '当前 Agent 通道不可用，请检查 apikey.txt 和 Claude Code 进程日志。',
        timestamp: Date.now(),
        error: true,
        taskId: this.currentTaskId,
      });
    }

    this.pushUI('task:complete', { code, taskId: this.currentTaskId });
    this.finishCurrentTask();
  }

  private async continueWithPendingGuidance(task: string): Promise<boolean> {
    if (this.pendingGuidance.length === 0) return false;
    const guidance = this.pendingGuidance.splice(0);
    this.currentUserTurns.push(...guidance);
    this.pushUI('chat:message', {
      text: `[Worker] 正在应用 ${guidance.length} 条追加要求，继续当前任务...`,
      timestamp: Date.now(),
      taskId: this.currentTaskId,
    });
    this.emitTaskStatus();
    await this.runTask(task, { kind: 'guidance', text: guidance.map((entry, index) => `${index + 1}. ${entry}`).join('\n') });
    return true;
  }

  private async handleAgentProcessExit(code: number): Promise<void> {
    const taskId = this.currentTaskId;
    logger.info('agent:close', { exitCode: code, taskId, queueLength: this.queuedTasks.length });
    this.pushUI('chat:message', {
      text: `[Agent] Claude Code 进程已退出 (code: ${code})`,
      timestamp: Date.now(),
      error: code !== 0,
      taskId,
    });
    if (this.currentTask) {
      appendClaudeSessionTurn({
        user: this.currentUserTurns.length
          ? this.currentUserTurns.join('\n\n追加要求：\n')
          : this.currentTask,
        assistant: this.currentAgentTranscript || `[Agent] 进程退出 (code: ${code})`,
        status: code === 0 ? 'completed' : 'failed',
      });
    }
    if (code === 0) {
      this.state.complete();
    } else {
      this.state.fail();
    }
    this.turnInFlight = false;
    this.pushUI('task:complete', { code, taskId });
    this.finishCurrentTask();
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
          taskId: this.currentTaskId,
        });
        this.state.fail();
        killAgent();
        this.observedAgentPid = null;
        this.turnInFlight = false;
        this.pushUI('task:complete', { code: 1, taskId: this.currentTaskId });
        this.finishCurrentTask();
        return;
      }

      logger.info('mcp:init', { mcpServers: p.mcpServers });
      return;
    }

    if (p.type === 'thinking') {
      logger.debug('ui:push', {
        channel: 'chat:message',
        type: p.type,
        content: p.content.slice(0, 300),
        hidden: true,
      });
      return;
    }

    if (p.type === 'result') {
      const task = this.currentTask;
      if (p.isError && p.content) {
        this.currentAgentTranscript += `${p.content}\n`;
        this.pushUI('chat:message', {
          text: p.content,
          timestamp: Date.now(),
          error: true,
          taskId: this.currentTaskId,
        });
      }
      if (task) {
        void this.handleAgentTurnComplete(p.isError ? 1 : 0, task).catch((error) => {
          this.handleTurnFailure(error);
        });
      }
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
      taskId: this.currentTaskId,
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
      if (!this.currentTask || !this.turnInFlight) return;
      const now = Date.now();
      if (now - this.lastAgentOutputAt < 5000) return;
      const seconds = Math.floor((now - this.turnStartedAt) / 1000);
      this.lastAgentOutputAt = now;
      this.pushUI('chat:message', {
        text: `[Agent] 仍在执行，等待输出... ${seconds}s`,
        timestamp: now,
        taskId: this.currentTaskId,
      });
      logger.info('agent:silence', { seconds, task: this.currentTask.slice(0, 100) });
    }, 1000);
  }

  private stopSilenceTimer(): void {
    if (!this.silenceTimer) return;
    clearInterval(this.silenceTimer);
    this.silenceTimer = null;
  }

  getTaskStatus(): {
    busy: boolean;
    paused: boolean;
    activeTaskId: string | null;
    activeTask: string | null;
    queueLength: number;
    guidanceCount: number;
  } {
    return {
      busy: Boolean(this.currentTask || this.turnInFlight || this.paused),
      paused: this.paused,
      activeTaskId: this.currentTaskId,
      activeTask: this.currentTask,
      queueLength: this.queuedTasks.length,
      guidanceCount: this.pendingGuidance.length,
    };
  }

  private submitResult(disposition: TaskSubmitResult['disposition'], taskId: string): TaskSubmitResult {
    const status = this.getTaskStatus();
    return {
      ok: true,
      disposition,
      taskId,
      activeTaskId: status.activeTaskId,
      queueLength: status.queueLength,
      guidanceCount: status.guidanceCount,
    };
  }

  private emitTaskStatus(): void {
    this.pushUI('task:status', this.getTaskStatus());
  }

  private handleTurnFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('task:error', { taskId: this.currentTaskId, stage: 'turn-complete', message });
    this.pushUI('chat:message', {
      text: `[Worker] 当前执行步骤失败: ${message}`,
      timestamp: Date.now(),
      error: true,
      taskId: this.currentTaskId,
    });
    this.state.fail();
    this.turnInFlight = false;
    this.pushUI('task:complete', { code: 1, taskId: this.currentTaskId });
    this.finishCurrentTask();
  }

  private finishCurrentTask(): void {
    this.stopSilenceTimer();
    this.currentTask = null;
    this.currentTaskId = null;
    this.currentAgentTranscript = '';
    this.currentAttempt = 0;
    this.currentUserTurns = [];
    this.pendingGuidance = [];
    this.turnInFlight = false;
    this.paused = false;

    const next = this.queuedTasks.shift();
    if (next) {
      this.pushUI('chat:message', {
        text: `[Worker] 开始执行下一条排队任务（剩余 ${this.queuedTasks.length}）`,
        timestamp: Date.now(),
        taskId: next.id,
      });
      void this.startTask(next);
    } else {
      this.emitTaskStatus();
    }
  }

  private describeExecutionPlan(task: string): string {
    if (isHtmlGameTask(task)) {
      const shouldNotOpen = /(不要打开|先不打开|不用打开|别打开|只写|先写)/i.test(task);
      return [
        '[Worker] 执行计划',
        '1. 先在工作区创建可运行 HTML 骨架，让文件尽早落地。',
        '2. 分阶段补游戏逻辑、界面和操作控制，工具调用会逐条显示。',
        shouldNotOpen
          ? '3. 本轮按要求不打开、不截图，只汇报文件路径。'
          : '3. 打开到右侧 BrowserView 截图验收，发现显示问题就继续修。',
      ].join('\n');
    }

    if (/(打开|运行|看效果|预览|截图)/i.test(task)) {
      return '[Worker] 执行计划\n1. 定位目标文件或页面。\n2. 打开到右侧 BrowserView。\n3. 截图或读取状态确认结果。';
    }

    return '[Worker] 执行计划\n1. 读取必要上下文。\n2. 执行修改或工具操作。\n3. 汇报关键结果。';
  }

  pause(): void {
    logger.info('task:state', { action: 'pause' });
    if (!this.currentTask) return;
    killAgent();
    this.observedAgentPid = null;
    this.turnInFlight = false;
    this.paused = true;
    this.pushUI('chat:message', {
      text: '[Worker] 任务已暂停',
      timestamp: Date.now(),
      taskId: this.currentTaskId,
    });
    this.emitTaskStatus();
  }

  resume(): void {
    logger.info('task:state', { action: 'resume', task: this.currentTask?.slice(0, 100) });
    if (!this.currentTask || !this.paused) return;
    this.paused = false;
    this.pushUI('chat:message', {
      text: '[Worker] 恢复任务...',
      timestamp: Date.now(),
      taskId: this.currentTaskId,
    });
    void this.runTask(this.currentTask, { kind: 'resume', text: '继续暂停前尚未完成的工作，并结合此前已经产生的结果。' }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.pushUI('chat:message', { text: `[Worker] 恢复失败: ${message}`, timestamp: Date.now(), error: true, taskId: this.currentTaskId });
      this.state.fail();
      this.finishCurrentTask();
    });
  }

  stop(): void {
    logger.info('task:state', { action: 'stop' });
    const stoppedTaskId = this.currentTaskId;
    if (this.currentTask) {
      appendClaudeSessionTurn({
        user: this.currentUserTurns.length ? this.currentUserTurns.join('\n\n追加要求：\n') : this.currentTask,
        assistant: this.currentAgentTranscript || '[Worker] 任务已停止',
        status: 'interrupted',
      });
    }
    killAgent();
    this.observedAgentPid = null;
    this.state.reset();
    this.queuedTasks = [];
    this.pushUI('chat:message', {
      text: '[Worker] 任务已停止',
      timestamp: Date.now(),
      taskId: stoppedTaskId,
    });
    this.finishCurrentTask();
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
