import React from 'react';
import type { TaskStep } from '../types';

interface Props {
  steps: TaskStep[];
}

export default function TaskProgress({ steps }: Props) {
  if (steps.length === 0) return null;

  return (
    <div className="task-progress nes-container is-rounded">
      <div className="task-progress-title">任务进度</div>
      {steps.map(step => (
        <div key={step.id} className={`task-step${step.done ? ' task-step--done' : ''}`}>
          <span className="task-step-icon">{step.done ? 'OK' : '..'}</span>
          <span className="task-step-label">{step.label}</span>
        </div>
      ))}
    </div>
  );
}
