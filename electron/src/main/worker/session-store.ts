import fs from 'fs';
import path from 'path';
import { getRuntimeDataDir } from '../paths';
import { logger } from './logger';

export interface ClaudeSessionTurn {
  id: string;
  user: string;
  assistant: string;
  status: 'completed' | 'failed' | 'interrupted';
  createdAt: string;
  completedAt: string;
}

export interface ClaudeSessionState {
  id: string;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
  turns: ClaudeSessionTurn[];
}

const MAX_TURNS = 12;
const MAX_ASSISTANT_CHARS = 3000;
const SESSION_DIR = getRuntimeDataDir('claude-session');
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');

function nowIso(): string {
  return new Date().toISOString();
}

function createSession(): ClaudeSessionState {
  const now = nowIso();
  return {
    id: `vibeide-${now.replace(/[:.]/g, '-')}`,
    createdAt: now,
    updatedAt: now,
    turnCount: 0,
    turns: [],
  };
}

function ensureSessionDir(): void {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

function compactAssistantText(text: string): string {
  const normalized = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

  if (normalized.length <= MAX_ASSISTANT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_ASSISTANT_CHARS)}\n...[truncated]`;
}

export function loadClaudeSession(): ClaudeSessionState {
  ensureSessionDir();
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as ClaudeSessionState;
    if (parsed?.id && Array.isArray(parsed.turns)) {
      return {
        ...parsed,
        turns: parsed.turns.slice(-MAX_TURNS),
      };
    }
  } catch {
    // Missing or invalid session files are replaced below.
  }

  const session = createSession();
  saveClaudeSession(session);
  return session;
}

export function saveClaudeSession(session: ClaudeSessionState): void {
  ensureSessionDir();
  fs.writeFileSync(
    SESSION_FILE,
    JSON.stringify(
      {
        ...session,
        turns: session.turns.slice(-MAX_TURNS),
      },
      null,
      2
    ),
    'utf-8'
  );
}

export function appendClaudeSessionTurn(input: {
  user: string;
  assistant: string;
  status: ClaudeSessionTurn['status'];
}): ClaudeSessionState {
  const session = loadClaudeSession();
  const now = nowIso();
  const turn: ClaudeSessionTurn = {
    id: `turn-${session.turnCount + 1}`,
    user: input.user.trim(),
    assistant: compactAssistantText(input.assistant),
    status: input.status,
    createdAt: now,
    completedAt: now,
  };

  const next: ClaudeSessionState = {
    ...session,
    updatedAt: now,
    turnCount: session.turnCount + 1,
    turns: [...session.turns, turn].slice(-MAX_TURNS),
  };

  saveClaudeSession(next);
  logger.info('claude:session', {
    event: 'append-turn',
    sessionId: next.id,
    turnCount: next.turnCount,
    status: input.status,
  });
  return next;
}

export function buildClaudeSessionContext(): { session: ClaudeSessionState; text: string } {
  const session = loadClaudeSession();
  const turns = session.turns.slice(-8);
  const lines = [
    '【vibeide 软件会话上下文】',
    `会话 ID: ${session.id}`,
    `累计轮次: ${session.turnCount}`,
    '说明：用户希望软件打开期间始终处在同一个 Claude 会话下。下面是本软件会话中的最近上下文；回答当前任务时必须延续这些上下文，不要当作全新对话。',
  ];

  if (turns.length === 0) {
    lines.push('最近上下文: （暂无，这是本软件会话第一轮）');
  } else {
    lines.push('最近上下文:');
    turns.forEach((turn, index) => {
      lines.push(`--- 最近第 ${index + 1} 轮 / ${turn.status} ---`);
      lines.push(`用户: ${turn.user}`);
      if (turn.assistant) {
        lines.push(`Agent: ${turn.assistant}`);
      }
    });
  }

  lines.push('【当前任务开始】');
  return { session, text: lines.join('\n') };
}

export function getClaudeSessionFile(): string {
  return SESSION_FILE;
}
