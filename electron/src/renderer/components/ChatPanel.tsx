import React, { useState, useRef, useEffect } from 'react';
import type { AgentTaskStatus, ChatMessage, TaskSubmitMode } from '../types';

interface Props {
  messages: ChatMessage[];
  taskStatus: AgentTaskStatus;
  onSend: (text: string, mode: TaskSubmitMode) => void;
  onStop: () => void;
}

export default function ChatPanel({ messages, taskStatus, onSend, onStop }: Props) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  return (
    <div className="chat-panel nes-container is-rounded">
      <div className="chat-title">
        <span>Agent 对话</span>
        <i className={`chat-agent-status${taskStatus.busy ? ' chat-agent-status--busy' : ''}`}>
          {taskStatus.paused ? '已暂停' : taskStatus.busy ? '执行中' : '空闲'}
        </i>
      </div>
      {taskStatus.busy ? (
        <div className="chat-task-strip" title={taskStatus.activeTask || ''}>
          <span>{taskStatus.activeTask || '当前任务正在执行'}</span>
          <em>追加 {taskStatus.guidanceCount} · 排队 {taskStatus.queueLength}</em>
        </div>
      ) : null}
      <div className="chat-messages">
        {messages.map(msg => (
          <div key={msg.id} className={`chat-msg nes-container is-rounded chat-msg--${msg.role}${msg.error ? ' chat-msg--error is-error' : ''}`}>
            <span className="chat-msg-role">{msg.role === 'user' ? 'You' : 'Agent'}</span>
            <p className="chat-msg-text">{msg.text}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="chat-input" onSubmit={handleSubmit}>
        <textarea
          className="nes-input"
          rows={2}
          value={input}
          onChange={e => setInput(e.target.value)}
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
    </div>
  );
}
