import React from 'react';
import type { TaskStep } from '../types';

interface Props {
  steps: TaskStep[];
}

export default function TaskProgress({ steps }: Props) {
  if (steps.length === 0) return null;

  const completed = steps.filter((step) => step.done).length;
  const current = steps.find((step) => !step.done);
  const percent = Math.round((completed / steps.length) * 100);

  return (
    <div className="chat-task-dashboard" role="status" aria-live="polite" aria-label="Agent 运行仪表盘">
      <div className="chat-task-dashboard-head">
        <span className="chat-task-dashboard-state"><i aria-hidden="true" />正在工作</span>
        <strong>{current?.label ?? '正在完成任务'}</strong>
        <span className="chat-task-dashboard-count">{completed}/{steps.length}</span>
      </div>
      <div
        className="chat-task-dashboard-track"
        role="progressbar"
        aria-label="任务总体进度"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={completed}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="chat-task-dashboard-foot">
        <span>Agent 正在思考与执行</span>
        <span>{percent}%</span>
      </div>
    </div>
  );
}
