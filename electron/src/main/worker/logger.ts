import fs from 'fs';
import path from 'path';
import { getLogDir } from '../paths';

const LOG_DIR = getLogDir();

// Ensure log directory exists
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ok */ }

const sessionId = `${Date.now()}`;
const logPath = path.join(LOG_DIR, `worker-${sessionId}.log`);

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogEvent =
  | 'task:start' | 'task:context' | 'task:state' | 'task:complete' | 'task:error'
  | 'agent:spawn' | 'agent:stdout' | 'agent:stderr' | 'agent:parsed'
  | 'agent:close' | 'agent:error' | 'agent:kill' | 'agent:mcp-config-write-failed'
  | 'claude:session'
  | 'first-run:detected' | 'first-run:apikey-saved' | 'first-run:apikey-save-failed' | 'first-run:apikey-copied-from-resources' | 'first-run:apikey-copy-failed' | 'first-run:status'
  | 'mcp:init'
  | 'ui:push'
  | 'browser:navigate' | 'browser:state'
  | 'browser:cookie' | 'browser:storage-flush'
  | 'browser:view-event' | 'browser:window-open' | 'browser:webcontents-created' | 'browser:window-created'
  | 'quick-task:error'
  | 'search:preflight'
  | 'page:validate';

interface LogEntry {
  ts: string;
  session: string;
  event: LogEvent;
  level: LogLevel;
  data: Record<string, unknown>;
}

function now(): string {
  return new Date().toISOString();
}

function write(entry: LogEntry): void {
  const line = JSON.stringify(entry) + '\n';
  try {
    fs.appendFileSync(logPath, line, 'utf-8');
  } catch {
    // fail silently — don't crash the app over logging
  }
}

function log(level: LogLevel, event: LogEvent, data: Record<string, unknown> = {}): void {
  write({ ts: now(), session: sessionId, event, level, data });
}

export const logger = {
  debug: (event: LogEvent, data?: Record<string, unknown>) => log('debug', event, data),
  info:  (event: LogEvent, data?: Record<string, unknown>) => log('info',  event, data),
  warn:  (event: LogEvent, data?: Record<string, unknown>) => log('warn',  event, data),
  error: (event: LogEvent, data?: Record<string, unknown>) => log('error', event, data),

  /** Shortcut: log raw agent stdout chunk */
  stdout: (text: string) => log('debug', 'agent:stdout', { text: text.slice(0, 2000) }),

  /** Shortcut: log raw agent stderr chunk */
  stderr: (text: string) => log('warn', 'agent:stderr', { text: text.slice(0, 2000) }),

  /** Get current log file path for debugging */
  getLogPath: () => logPath,
  getSessionId: () => sessionId,
};
