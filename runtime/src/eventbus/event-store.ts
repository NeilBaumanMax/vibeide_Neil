import fs from 'node:fs';
import path from 'node:path';
import { RUNTIME_DIRS } from '../paths.js';
import type { HardboardRuntimeState, RuntimeEvent, RuntimeEventInput } from './event-types.js';

const EVENT_LOG_FILE = path.join(RUNTIME_DIRS.hardboardEvents, 'events.jsonl');
const EVENT_STATE_FILE = path.join(RUNTIME_DIRS.hardboardEvents, 'state.json');
const RECENT_LIMIT = 80;
const HEARTBEAT_STALE_MS = 15_000;

let lastSeq = readInitialSeq();
let state: HardboardRuntimeState = readInitialState();

export function appendRuntimeEvent(input: RuntimeEventInput): RuntimeEvent {
  ensureEventDir();
  const event: RuntimeEvent = {
    seq: nextSeq(),
    id: input.id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    time: input.time || Date.now(),
    source: input.source,
    kind: input.kind,
    taskId: input.taskId,
    pid: input.pid,
    toolName: input.toolName,
    projectDir: input.projectDir,
    message: input.message,
    payload: input.payload,
  };

  fs.appendFileSync(EVENT_LOG_FILE, `${JSON.stringify(event)}\n`, 'utf-8');
  state = reduceState(state, event);
  writeState(state);
  return event;
}

export function getRuntimeEventState(): HardboardRuntimeState {
  if (fs.existsSync(EVENT_STATE_FILE)) {
    try {
      return deriveRuntimeState(JSON.parse(fs.readFileSync(EVENT_STATE_FILE, 'utf-8')) as HardboardRuntimeState);
    } catch {
      return deriveRuntimeState(state);
    }
  }
  return deriveRuntimeState(state);
}

export function getRecentRuntimeEvents(sinceSeq = 0): RuntimeEvent[] {
  if (!fs.existsSync(EVENT_LOG_FILE)) return [];
  const lines = fs.readFileSync(EVENT_LOG_FILE, 'utf-8').split(/\r?\n/).filter(Boolean);
  const events: RuntimeEvent[] = [];
  for (const line of lines.slice(-500)) {
    try {
      const event = JSON.parse(line) as RuntimeEvent;
      if (event.seq > sinceSeq) events.push(event);
    } catch {
      // Ignore partially-written or manually edited lines.
    }
  }
  return events;
}

export function getRuntimeEventFiles() {
  ensureEventDir();
  return {
    eventsFile: EVENT_LOG_FILE,
    stateFile: EVENT_STATE_FILE,
  };
}

export function clearRuntimeEventHistory(): {
  ok: true;
  eventsRemoved: number;
  logsRemoved: number;
  state: HardboardRuntimeState;
} {
  let eventsRemoved = 0;
  if (fs.existsSync(EVENT_LOG_FILE)) {
    const lines = fs.readFileSync(EVENT_LOG_FILE, 'utf-8').split(/\r?\n/).filter(Boolean);
    eventsRemoved = lines.length;
    fs.unlinkSync(EVENT_LOG_FILE);
  }

  let logsRemoved = 0;
  if (fs.existsSync(RUNTIME_DIRS.hardboardLogs)) {
    for (const entry of fs.readdirSync(RUNTIME_DIRS.hardboardLogs, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.log')) continue;
      fs.unlinkSync(path.join(RUNTIME_DIRS.hardboardLogs, entry.name));
      logsRemoved += 1;
    }
  }

  lastSeq = 0;
  state = createInitialState();
  writeState(state);
  return { ok: true, eventsRemoved, logsRemoved, state };
}

function deriveRuntimeState(value: HardboardRuntimeState): HardboardRuntimeState {
  if (value.status !== 'running') return value;
  const heartbeatAt = value.lastHeartbeatAt || value.generatedAt;
  if (Date.now() - heartbeatAt <= HEARTBEAT_STALE_MS) return value;
  return {
    ...value,
    generatedAt: Date.now(),
    phase: 'stale',
    status: 'stale',
    lastError: `runtime task 心跳超时 ${Math.round((Date.now() - heartbeatAt) / 1000)}s`,
  };
}

function reduceState(previous: HardboardRuntimeState, event: RuntimeEvent): HardboardRuntimeState {
  const recent = [...previous.recent, event].slice(-RECENT_LIMIT);
  const next: HardboardRuntimeState = {
    ...previous,
    generatedAt: Date.now(),
    lastSeq: event.seq,
    activePid: event.pid ?? previous.activePid,
    recent,
  };

  if (event.kind === 'heartbeat') {
    next.lastHeartbeatAt = event.time;
    next.activeTaskId = event.taskId || next.activeTaskId;
    next.activePid = event.pid ?? next.activePid;
    return next;
  }

  if (event.kind === 'tool.started') {
    next.activeTaskId = event.taskId || null;
    next.activeToolName = event.toolName || null;
    next.activeProjectDir = event.projectDir || null;
    next.activePid = event.pid ?? null;
    next.phase = inferToolPhase(event.toolName);
    next.status = 'running';
    next.progress = 0;
    next.currentFile = null;
    next.currentPort = readString(event.payload?.port) || next.currentPort;
    next.lastError = null;
    return next;
  }

  if (event.kind === 'tool.completed') {
    next.status = readNumber(event.payload?.exitCode) === 0 ? 'completed' : 'failed';
    next.progress = next.status === 'completed' ? 100 : next.progress;
    next.lastError = next.status === 'failed' ? event.message || '工具执行失败' : null;
    next.activePid = null;
    return next;
  }

  if (event.kind === 'tool.failed') {
    next.status = 'failed';
    next.lastError = event.message || '工具执行失败';
    next.activePid = null;
    return next;
  }

  if (event.kind === 'process.started') {
    next.activeTaskId = event.taskId || next.activeTaskId;
    next.activePid = event.pid ?? next.activePid;
    next.status = 'running';
    return next;
  }

  if (event.kind === 'process.exited') {
    next.activePid = null;
    return next;
  }

  if (event.kind === 'hardboard.project.files') {
    next.files = Array.isArray(event.payload?.files) ? event.payload.files as HardboardRuntimeState['files'] : next.files;
    next.activeProjectDir = event.projectDir || next.activeProjectDir;
    return next;
  }

  if (event.kind === 'hardboard.build.started') {
    next.phase = 'build';
    next.status = 'running';
    next.progress = 0;
    next.activeTaskId = event.taskId || next.activeTaskId;
    next.activeProjectDir = event.projectDir || next.activeProjectDir;
    next.activePid = event.pid ?? next.activePid;
    next.currentFile = null;
    next.lastError = null;
    return next;
  }

  if (event.kind === 'hardboard.flash.started') {
    next.phase = 'flash';
    next.status = 'running';
    next.progress = 0;
    next.activeTaskId = event.taskId || next.activeTaskId;
    next.activeProjectDir = event.projectDir || next.activeProjectDir;
    next.activePid = event.pid ?? next.activePid;
    next.currentPort = readString(event.payload?.port) || next.currentPort;
    next.currentFile = null;
    next.lastError = null;
    return next;
  }

  if (event.kind.endsWith('.progress')) {
    const progress = readNumber(event.payload?.progress);
    next.progress = progress == null ? next.progress : Math.max(0, Math.min(100, progress));
    return next;
  }

  if (event.kind.endsWith('.file')) {
    next.currentFile = readString(event.payload?.file) || readString(event.payload?.relativePath) || next.currentFile;
    return next;
  }

  if (event.kind === 'hardboard.build.completed' || event.kind === 'hardboard.flash.completed') {
    const ok = event.payload?.ok === true || readNumber(event.payload?.exitCode) === 0;
    next.status = ok ? 'completed' : 'failed';
    next.progress = ok ? 100 : next.progress;
    next.lastError = ok ? null : event.message || 'hardboard 操作失败';
    next.activePid = null;
    return next;
  }

  return next;
}

function inferToolPhase(toolName?: string): HardboardRuntimeState['phase'] {
  if (toolName?.includes('idf_build')) return 'build';
  if (toolName?.includes('idf_flash') || toolName?.includes('idf_erase_flash')) return 'flash';
  if (toolName?.includes('serial')) return 'serial';
  return 'tool';
}

function readInitialSeq(): number {
  const existing = readInitialState();
  if (Number.isFinite(existing.lastSeq)) return existing.lastSeq;
  return 0;
}

function readInitialState(): HardboardRuntimeState {
  if (fs.existsSync(EVENT_STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(EVENT_STATE_FILE, 'utf-8')) as HardboardRuntimeState;
    } catch {
      // Fall through to a fresh state.
    }
  }
  return createInitialState();
}

function createInitialState(): HardboardRuntimeState {
  return {
    generatedAt: Date.now(),
    lastSeq: 0,
    lastHeartbeatAt: null,
    activeTaskId: null,
    activeToolName: null,
    activeProjectDir: null,
    activePid: null,
    phase: 'idle',
    status: 'idle',
    progress: null,
    currentFile: null,
    currentPort: null,
    files: [],
    recent: [],
    lastError: null,
  };
}

function nextSeq(): number {
  lastSeq += 1;
  return lastSeq;
}

function writeState(value: HardboardRuntimeState): void {
  ensureEventDir();
  fs.writeFileSync(EVENT_STATE_FILE, JSON.stringify(value, null, 2), 'utf-8');
}

function ensureEventDir(): void {
  fs.mkdirSync(RUNTIME_DIRS.hardboardEvents, { recursive: true });
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
