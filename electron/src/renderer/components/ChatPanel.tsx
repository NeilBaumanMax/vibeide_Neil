import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentTaskStatus, ChatConversationSummary, ChatMessage, TaskStep, TaskSubmitMode } from '../types';
import MarkdownContent from './MarkdownContent';
import TaskProgress from './TaskProgress';

interface Props {
  messages: ChatMessage[];
  steps: TaskStep[];
  conversations: ChatConversationSummary[];
  activeConversationId: string;
  historyError: string;
  taskStatus: AgentTaskStatus;
  onSend: (text: string, mode: TaskSubmitMode) => void;
  onStop: () => void;
  onCreateConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  onToggleConversationPinned: (id: string, pinned: boolean) => void;
}

interface ExecutionGroup {
  key: string;
  messages: ChatMessage[];
}

const PROFESSIONAL_VIEW_KEY = 'vibeide.chat.professionalView';
const HISTORY_COLLAPSED_KEY = 'vibeide.chat.historyCollapsed';

function readProfessionalView(): boolean {
  try {
    return window.localStorage.getItem(PROFESSIONAL_VIEW_KEY) === 'true';
  } catch {
    return false;
  }
}

function readHistoryCollapsed(): boolean {
  try {
    return window.localStorage.getItem(HISTORY_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function conversationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function executionKey(message: ChatMessage): string {
  return message.taskId ? `task:${message.taskId}` : 'task:general';
}

function formatDuration(messages: ChatMessage[]): string {
  if (messages.length < 2) return '';
  const duration = Math.max(0, messages[messages.length - 1].timestamp - messages[0].timestamp);
  if (duration < 1000) return '';
  const seconds = Math.round(duration / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function compactExecutionLabel(message: ChatMessage): string {
  return message.text
    .replace(/^\[(?:Agent|Worker)\]\s*/, '')
    .replace(/^•\s*/, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function detailLabel(message: ChatMessage): string {
  if (message.error) return '错误';
  if (message.kind === 'status') return '状态';
  if (message.kind === 'progress') return '过程';
  if (message.toolName) return '工具';
  return '详情';
}

function ExecutionDetails({ group, professionalView }: { group: ExecutionGroup; professionalView: boolean }) {
  const [open, setOpen] = useState(professionalView);
  useEffect(() => setOpen(professionalView), [professionalView]);
  const duration = formatDuration(group.messages);
  const lastMeaningful = [...group.messages].reverse().find((message) => message.kind !== 'detail') ?? group.messages[group.messages.length - 1];
  const hasError = group.messages.some((message) => message.error);

  return (
    <details className={`chat-execution${hasError ? ' chat-execution--error' : ''}`} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span className="chat-execution-disclosure" aria-hidden="true" />
        <strong>执行过程</strong>
        <span>{group.messages.length} 条{duration ? ` · ${duration}` : ''}</span>
        <em title={lastMeaningful.text}>{compactExecutionLabel(lastMeaningful)}</em>
      </summary>
      <div className="chat-execution-list">
        {group.messages.map((message) => (
          <div key={message.id} className={`chat-execution-item chat-execution-item--${message.kind ?? 'detail'}${message.error ? ' is-error' : ''}`}>
            <div className="chat-execution-item-head">
              <span>{detailLabel(message)}</span>
              <time>{new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</time>
            </div>
            {message.kind === 'detail'
              ? <pre>{message.text}</pre>
              : <MarkdownContent text={message.text.replace(/^\[(?:Agent|Worker)\]\s*/, '')} />}
          </div>
        ))}
      </div>
    </details>
  );
}

export default function ChatPanel({
  messages,
  steps,
  conversations,
  activeConversationId,
  historyError,
  taskStatus,
  onSend,
  onStop,
  onCreateConversation,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onToggleConversationPinned,
}: Props) {
  const [input, setInput] = useState('');
  const [professionalView, setProfessionalView] = useState(readProfessionalView);
  const [historyCollapsed, setHistoryCollapsed] = useState(readHistoryCollapsed);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const cancelRenameRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, steps, taskStatus.busy, taskStatus.paused]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PROFESSIONAL_VIEW_KEY, String(professionalView));
    } catch {
      // The preference remains active for this session.
    }
  }, [professionalView]);

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_COLLAPSED_KEY, String(historyCollapsed));
    } catch {
      // The preference remains active for this session.
    }
  }, [historyCollapsed]);

  useEffect(() => {
    if (!openMenuId) return undefined;
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.chat-history-menu-wrap')) return;
      setOpenMenuId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenuId]);

  const startRename = (conversation: ChatConversationSummary) => {
    cancelRenameRef.current = false;
    setOpenMenuId(null);
    setPendingDeleteId(null);
    setRenamingId(conversation.id);
    setRenameValue(conversation.title);
  };

  const commitRename = (id: string) => {
    const title = renameValue.trim();
    if (!title) return;
    setRenamingId(null);
    onRenameConversation(id, title);
  };

  const executionGroups = useMemo(() => {
    const groups = new Map<string, ChatMessage[]>();
    messages.forEach((message) => {
      if (message.role !== 'agent' || !message.kind || message.kind === 'conversation') return;
      const key = executionKey(message);
      groups.set(key, [...(groups.get(key) ?? []), message]);
    });
    return groups;
  }, [messages]);

  const submit = (mode: TaskSubmitMode) => {
    const text = input.trim();
    if (!text) return;
    onSend(text, mode);
    setInput('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(taskStatus.busy ? 'guide' : 'auto');
  };

  const renderedExecutions = new Set<string>();
  const activeExecutionKey = taskStatus.activeTaskId ? `task:${taskStatus.activeTaskId}` : null;
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId);

  return (
    <div className={`chat-panel nes-container is-rounded${historyCollapsed ? ' chat-panel--history-collapsed' : ''}`}>
      <aside className="chat-history" aria-label="历史对话">
        <div className="chat-history-header">
          <strong>历史对话</strong>
          <button type="button" disabled={taskStatus.busy} onClick={onCreateConversation} title={taskStatus.busy ? 'Agent 工作结束后可新建对话' : '新建对话'} aria-label="新建对话">＋</button>
        </div>
        <div className="chat-history-list">
          {conversations.map((conversation) => (
            <div key={conversation.id} className={`chat-history-item${conversation.id === activeConversationId ? ' is-active' : ''}${conversation.pinned ? ' is-pinned' : ''}`}>
              <button
                type="button"
                className="chat-history-select"
                disabled={taskStatus.busy && conversation.id !== activeConversationId}
                onClick={() => onSelectConversation(conversation.id)}
                title={conversation.title}
              >
                <span>{conversation.pinned ? <i className="chat-history-pin" aria-hidden="true">●</i> : null}{conversation.title}</span>
                <small>{conversationTime(conversation.updatedAt)} · {conversation.messageCount} 条</small>
              </button>
              <div className="chat-history-menu-wrap">
                <button
                  type="button"
                  className="chat-history-more"
                  disabled={taskStatus.busy}
                  aria-label={`编辑对话：${conversation.title}`}
                  aria-haspopup="menu"
                  aria-expanded={openMenuId === conversation.id}
                  title={taskStatus.busy ? 'Agent 工作结束后可编辑' : '编辑对话'}
                  onClick={() => { setPendingDeleteId(null); setOpenMenuId((current) => current === conversation.id ? null : conversation.id); }}
                >
                  ⋯
                </button>
                {openMenuId === conversation.id ? (
                  <div className="chat-history-menu" role="menu" aria-label={`编辑 ${conversation.title}`}>
                    <button type="button" role="menuitem" onClick={() => startRename(conversation)}>重命名</button>
                    <button type="button" role="menuitem" onClick={() => { setOpenMenuId(null); onToggleConversationPinned(conversation.id, !conversation.pinned); }}>
                      {conversation.pinned ? '取消置顶' : '置顶'}
                    </button>
                    <span className="chat-history-menu-separator" />
                    <button type="button" role="menuitem" className="is-danger" onClick={() => { setOpenMenuId(null); setPendingDeleteId(conversation.id); }}>删除</button>
                  </div>
                ) : null}
              </div>
              {renamingId === conversation.id ? (
                <form className="chat-history-rename" onSubmit={(event) => event.preventDefault()}>
                  <input
                    autoFocus
                    maxLength={30}
                    value={renameValue}
                    aria-label="对话名称"
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
                      if (event.key === 'Escape') { cancelRenameRef.current = true; setRenamingId(null); }
                    }}
                    onBlur={() => {
                      if (cancelRenameRef.current) { cancelRenameRef.current = false; return; }
                      commitRename(conversation.id);
                    }}
                  />
                  <small>{renameValue.trim().length}/30</small>
                </form>
              ) : null}
              {pendingDeleteId === conversation.id ? (
                <div className="chat-history-confirm">
                  <span>删除后无法恢复</span>
                  <button type="button" onClick={() => setPendingDeleteId(null)}>取消</button>
                  <button type="button" className="is-danger" onClick={() => { setPendingDeleteId(null); onDeleteConversation(conversation.id); }}>删除</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {historyError ? <p className="chat-history-error" title={historyError}>{historyError}</p> : null}
      </aside>
      <section className="chat-conversation">
      <div className="chat-title">
        <div className="chat-title-main">
          <button
            type="button"
            className="chat-history-toggle"
            aria-label={historyCollapsed ? '展开历史对话' : '收起历史对话'}
            aria-expanded={!historyCollapsed}
            onClick={() => setHistoryCollapsed((current) => !current)}
          >
            <span aria-hidden="true">{historyCollapsed ? '›' : '‹'}</span>
          </button>
          <span title={activeConversation?.title}>{activeConversation?.title === '新对话' || !activeConversation ? 'Agent 对话' : activeConversation.title}</span>
        </div>
        <div className="chat-title-actions">
          <button
            type="button"
            className={`chat-professional-toggle${professionalView ? ' is-active' : ''}`}
            aria-pressed={professionalView}
            title="开启后自动展开每轮任务的工具、状态与诊断信息"
            onClick={() => setProfessionalView((current) => !current)}
          >
            专业视图
          </button>
          <i className={`chat-agent-status${taskStatus.busy ? ' chat-agent-status--busy' : ''}`}>
            {taskStatus.paused ? '已暂停' : taskStatus.busy ? '执行中' : '空闲'}
          </i>
        </div>
      </div>
      {taskStatus.busy ? (
        <div className="chat-task-strip" title={taskStatus.activeTask || ''}>
          <span>{taskStatus.activeTask || '当前任务正在执行'}</span>
          <em>追加 {taskStatus.guidanceCount} · 排队 {taskStatus.queueLength}</em>
        </div>
      ) : null}
      {historyCollapsed && historyError ? <div className="chat-history-inline-error">{historyError}</div> : null}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <strong>开始一段新对话</strong>
            <span>这段对话会自动保存在历史记录中，重新打开软件后仍可继续。</span>
          </div>
        ) : null}
        {messages.map((message) => {
          if (message.role === 'agent' && message.kind && message.kind !== 'conversation') {
            const key = executionKey(message);
            if (renderedExecutions.has(key)) return null;
            renderedExecutions.add(key);
            const showDashboard = taskStatus.busy && !taskStatus.paused && key === activeExecutionKey;
            return (
              <React.Fragment key={key}>
                <ExecutionDetails group={{ key, messages: executionGroups.get(key) ?? [message] }} professionalView={professionalView} />
                {showDashboard ? <TaskProgress steps={steps} /> : null}
              </React.Fragment>
            );
          }
          return (
            <div key={message.id} className={`chat-msg nes-container is-rounded chat-msg--${message.role}${message.error ? ' chat-msg--error is-error' : ''}`}>
              <span className="chat-msg-role">{message.role === 'user' ? 'You' : 'Agent'}</span>
              {message.role === 'agent'
                ? <MarkdownContent text={message.text} />
                : <p className="chat-msg-text">{message.text}</p>}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form className="chat-input" onSubmit={handleSubmit}>
        <textarea
          className="nes-input"
          rows={2}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit(taskStatus.busy ? 'guide' : 'auto');
            }
          }}
          placeholder={taskStatus.busy ? '输入对当前任务的追加要求；Shift+Enter 换行' : '描述要交给 Agent 的任务；Shift+Enter 换行'}
        />
        <div className="chat-input-actions">
          <button className="nes-btn is-primary" type="submit" disabled={!input.trim()}>{taskStatus.busy ? '追加要求' : '发送'}</button>
          {taskStatus.busy ? <button className="nes-btn is-warning" type="button" disabled={!input.trim()} onClick={() => submit('queue')}>排队</button> : null}
          {taskStatus.busy ? <button className="nes-btn is-error" type="button" onClick={onStop}>停止</button> : null}
        </div>
      </form>
      </section>
    </div>
  );
}
