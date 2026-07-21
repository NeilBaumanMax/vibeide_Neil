import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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

export type StoredChatMessageKind = 'conversation' | 'progress' | 'detail' | 'status';

export interface StoredChatMessage {
  id: string;
  text: string;
  role: 'user' | 'agent';
  timestamp: number;
  kind?: StoredChatMessageKind;
  toolName?: string;
  error?: boolean;
  taskId?: string | null;
}

export interface ChatConversation extends ClaudeSessionState {
  title: string;
  pinned: boolean;
  messages: StoredChatMessage[];
}

export interface ChatConversationSummary {
  id: string;
  title: string;
  pinned: boolean;
  preview: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  turnCount: number;
}

interface ConversationStore {
  version: 2;
  activeConversationId: string;
  conversations: ChatConversation[];
}

const MAX_TURNS = 24;
const MAX_ASSISTANT_CHARS = 6000;
const MAX_CONVERSATIONS = 50;
const MAX_MESSAGES = 500;
const MAX_MESSAGE_CHARS = 20_000;
const SESSION_DIR = getRuntimeDataDir('claude-session');
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');

function nowIso(): string {
  return new Date().toISOString();
}

function compactTitle(text: string): string {
  const title = text.replace(/\s+/g, ' ').trim();
  if (!title) return '新对话';
  return title.length > 30 ? `${title.slice(0, 30)}…` : title;
}

function createConversation(title = '新对话'): ChatConversation {
  const now = nowIso();
  return {
    id: `conversation-${randomUUID()}`,
    title,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    turnCount: 0,
    turns: [],
    messages: [],
  };
}

function ensureSessionDir(): void {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

function compactText(text: string, limit = MAX_ASSISTANT_CHARS): string {
  const normalized = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}\n...[truncated]`;
}

function normalizeMessage(message: StoredChatMessage): StoredChatMessage {
  return {
    id: typeof message.id === 'string' && message.id ? message.id : randomUUID(),
    text: compactText(String(message.text ?? ''), MAX_MESSAGE_CHARS),
    role: message.role === 'user' ? 'user' : 'agent',
    timestamp: Number.isFinite(message.timestamp) ? message.timestamp : Date.now(),
    kind: message.kind,
    toolName: typeof message.toolName === 'string' ? message.toolName : undefined,
    error: Boolean(message.error) || undefined,
    taskId: typeof message.taskId === 'string' || message.taskId === null ? message.taskId : undefined,
  };
}

function normalizeConversation(conversation: ChatConversation): ChatConversation {
  const now = nowIso();
  const turns = Array.isArray(conversation.turns) ? conversation.turns.slice(-MAX_TURNS) : [];
  const messages = Array.isArray(conversation.messages)
    ? conversation.messages.slice(-MAX_MESSAGES).map(normalizeMessage)
    : [];
  return {
    id: typeof conversation.id === 'string' && conversation.id ? conversation.id : `conversation-${randomUUID()}`,
    title: compactTitle(conversation.title || messages.find((message) => message.role === 'user')?.text || '新对话'),
    pinned: Boolean(conversation.pinned),
    createdAt: conversation.createdAt || now,
    updatedAt: conversation.updatedAt || now,
    turnCount: Number.isFinite(conversation.turnCount) ? conversation.turnCount : turns.length,
    turns,
    messages,
  };
}

function migrateLegacySession(parsed: ClaudeSessionState): ConversationStore {
  const conversation = createConversation(compactTitle(parsed.turns?.[0]?.user || '之前的对话'));
  conversation.id = parsed.id || conversation.id;
  conversation.createdAt = parsed.createdAt || conversation.createdAt;
  conversation.updatedAt = parsed.updatedAt || conversation.updatedAt;
  conversation.turnCount = Number.isFinite(parsed.turnCount) ? parsed.turnCount : parsed.turns?.length ?? 0;
  conversation.turns = Array.isArray(parsed.turns) ? parsed.turns.slice(-MAX_TURNS) : [];
  conversation.messages = conversation.turns.flatMap((turn) => {
    const timestamp = Date.parse(turn.completedAt || turn.createdAt) || Date.now();
    return [
      { id: `${turn.id}-user`, text: turn.user, role: 'user' as const, timestamp },
      { id: `${turn.id}-agent`, text: turn.assistant, role: 'agent' as const, timestamp: timestamp + 1, kind: 'conversation' as const, error: turn.status === 'failed' || undefined },
    ];
  });
  return { version: 2, activeConversationId: conversation.id, conversations: [conversation] };
}

function writeStore(store: ConversationStore): void {
  ensureSessionDir();
  const conversations = store.conversations
    .map(normalizeConversation)
    .sort((left, right) => Number(right.pinned) - Number(left.pinned) || Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, MAX_CONVERSATIONS);
  if (conversations.length === 0) conversations.push(createConversation());
  const activeConversationId = conversations.some((conversation) => conversation.id === store.activeConversationId)
    ? store.activeConversationId
    : conversations[0].id;
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ version: 2, activeConversationId, conversations }, null, 2), 'utf-8');
}

function readStore(): ConversationStore {
  ensureSessionDir();
  try {
    const parsed = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8')) as ConversationStore | ClaudeSessionState;
    if ('version' in parsed && parsed.version === 2 && Array.isArray(parsed.conversations)) {
      const store: ConversationStore = {
        version: 2,
        activeConversationId: parsed.activeConversationId,
        conversations: parsed.conversations.map(normalizeConversation),
      };
      if (store.conversations.length > 0) return store;
    }
    if ('id' in parsed && Array.isArray(parsed.turns)) {
      const migrated = migrateLegacySession(parsed);
      writeStore(migrated);
      return migrated;
    }
  } catch {
    // Missing or invalid session stores are replaced below.
  }

  const conversation = createConversation();
  const store: ConversationStore = { version: 2, activeConversationId: conversation.id, conversations: [conversation] };
  writeStore(store);
  return store;
}

function findConversation(store: ConversationStore, id?: string | null): ChatConversation {
  const targetId = id || store.activeConversationId;
  const conversation = store.conversations.find((entry) => entry.id === targetId);
  if (!conversation) throw new Error('对话不存在或已被删除');
  return conversation;
}

function summaryOf(conversation: ChatConversation): ChatConversationSummary {
  const last = [...conversation.messages].reverse().find((message) => message.kind !== 'detail');
  return {
    id: conversation.id,
    title: conversation.title,
    pinned: conversation.pinned,
    preview: compactTitle(last?.text || '暂无消息'),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    turnCount: conversation.turnCount,
  };
}

export function listChatConversations(): { activeConversationId: string; conversations: ChatConversationSummary[] } {
  const store = readStore();
  return {
    activeConversationId: store.activeConversationId,
    conversations: store.conversations
      .map(summaryOf)
      .sort((left, right) => Number(right.pinned) - Number(left.pinned) || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
  };
}

export function getChatConversation(id?: string | null): ChatConversation {
  const store = readStore();
  return structuredClone(findConversation(store, id));
}

export function createChatConversation(): ChatConversation {
  const store = readStore();
  const conversation = createConversation();
  store.conversations.unshift(conversation);
  store.activeConversationId = conversation.id;
  writeStore(store);
  logger.info('claude:session', { event: 'conversation-create', conversationId: conversation.id });
  return structuredClone(conversation);
}

export function activateChatConversation(id: string): ChatConversation {
  const store = readStore();
  const conversation = findConversation(store, id);
  store.activeConversationId = conversation.id;
  writeStore(store);
  logger.info('claude:session', { event: 'conversation-activate', conversationId: conversation.id });
  return structuredClone(conversation);
}

export function renameChatConversation(id: string, title: string): { activeConversationId: string; conversations: ChatConversationSummary[] } {
  const store = readStore();
  const conversation = findConversation(store, id);
  const nextTitle = compactTitle(title);
  if (nextTitle === '新对话' && !title.trim()) throw new Error('对话名称不能为空');
  conversation.title = nextTitle;
  writeStore(store);
  logger.info('claude:session', { event: 'conversation-rename', conversationId: id });
  return listChatConversations();
}

export function setChatConversationPinned(id: string, pinned: boolean): { activeConversationId: string; conversations: ChatConversationSummary[] } {
  const store = readStore();
  const conversation = findConversation(store, id);
  conversation.pinned = pinned;
  writeStore(store);
  logger.info('claude:session', { event: 'conversation-pin', conversationId: id, pinned });
  return listChatConversations();
}

export function deleteChatConversation(id: string): { activeConversationId: string; conversations: ChatConversationSummary[] } {
  const store = readStore();
  if (!store.conversations.some((conversation) => conversation.id === id)) throw new Error('对话不存在或已被删除');
  store.conversations = store.conversations.filter((conversation) => conversation.id !== id);
  if (store.conversations.length === 0) store.conversations.push(createConversation());
  if (store.activeConversationId === id) store.activeConversationId = store.conversations[0].id;
  writeStore(store);
  logger.info('claude:session', { event: 'conversation-delete', conversationId: id, activeConversationId: store.activeConversationId });
  return listChatConversations();
}

export function appendChatMessage(conversationId: string, input: StoredChatMessage): StoredChatMessage {
  const store = readStore();
  const conversation = findConversation(store, conversationId);
  const message = normalizeMessage(input);
  const statusIndex = message.role === 'agent' && message.kind === 'status'
    ? conversation.messages.findIndex((entry) => entry.role === 'agent' && entry.kind === 'status' && entry.taskId === message.taskId)
    : -1;
  if (statusIndex >= 0) {
    message.id = conversation.messages[statusIndex].id;
    conversation.messages[statusIndex] = message;
  } else {
    conversation.messages.push(message);
    conversation.messages = conversation.messages.slice(-MAX_MESSAGES);
  }
  if (message.role === 'user' && conversation.title === '新对话') conversation.title = compactTitle(message.text);
  conversation.updatedAt = nowIso();
  store.activeConversationId = conversation.id;
  writeStore(store);
  return message;
}

export function loadClaudeSession(conversationId?: string | null): ClaudeSessionState {
  const conversation = getChatConversation(conversationId);
  return {
    id: conversation.id,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    turnCount: conversation.turnCount,
    turns: conversation.turns,
  };
}

export function saveClaudeSession(session: ClaudeSessionState): void {
  const store = readStore();
  const conversation = findConversation(store, session.id);
  conversation.createdAt = session.createdAt;
  conversation.updatedAt = session.updatedAt;
  conversation.turnCount = session.turnCount;
  conversation.turns = session.turns.slice(-MAX_TURNS);
  writeStore(store);
}

export function appendClaudeSessionTurn(input: {
  user: string;
  assistant: string;
  status: ClaudeSessionTurn['status'];
}, conversationId?: string | null): ClaudeSessionState {
  const store = readStore();
  const conversation = findConversation(store, conversationId);
  const now = nowIso();
  const turn: ClaudeSessionTurn = {
    id: `turn-${conversation.turnCount + 1}`,
    user: input.user.trim(),
    assistant: compactText(input.assistant),
    status: input.status,
    createdAt: now,
    completedAt: now,
  };
  conversation.updatedAt = now;
  conversation.turnCount += 1;
  conversation.turns = [...conversation.turns, turn].slice(-MAX_TURNS);
  writeStore(store);
  logger.info('claude:session', {
    event: 'append-turn',
    sessionId: conversation.id,
    turnCount: conversation.turnCount,
    status: input.status,
  });
  return loadClaudeSession(conversation.id);
}

export function buildClaudeSessionContext(conversationId?: string | null): { session: ClaudeSessionState; text: string } {
  const session = loadClaudeSession(conversationId);
  const turns = session.turns.slice(-10);
  const lines = [
    '【奥德赛历史会话上下文】',
    `会话 ID: ${session.id}`,
    `累计轮次: ${session.turnCount}`,
    '说明：这是用户主动选择继续的历史对话。必须延续其中的工程目标、文件路径、约束和未完成事项；不要把当前请求当成全新项目。',
  ];
  if (turns.length === 0) {
    lines.push('最近上下文: （暂无，这是该对话的第一轮）');
  } else {
    lines.push('最近上下文:');
    turns.forEach((turn, index) => {
      lines.push(`--- 最近第 ${index + 1} 轮 / ${turn.status} ---`);
      lines.push(`用户: ${turn.user}`);
      if (turn.assistant) lines.push(`Agent: ${turn.assistant}`);
    });
  }
  lines.push('【历史会话上下文结束】');
  return { session, text: lines.join('\n') };
}

export function getClaudeSessionFile(): string {
  return SESSION_FILE;
}
