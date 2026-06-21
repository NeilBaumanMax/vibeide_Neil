import React from 'react';
import type { WorkbenchItem, WorkbenchOverview, WorkbenchSection } from '../types';

interface Props {
  overview: WorkbenchOverview | null;
  onRefresh: () => void;
  onOpenItem: (targetPath: string) => void;
}

function formatTime(value: number | null): string {
  if (!value) return '未知时间';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSize(value: number | null): string {
  if (value == null) return '目录';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function renderSection(section: WorkbenchSection, onOpenItem: (targetPath: string) => void) {
  return (
    <section key={section.id} className="workspace-section nes-container is-rounded">
      <div className="workspace-section-header">
        <div>
          <h3>{section.title}</h3>
          <p>{section.description}</p>
        </div>
        <code>{section.folderPath}</code>
      </div>
      <div className="workspace-items">
        {section.items.length ? section.items.map((item: WorkbenchItem) => (
          <button
            key={item.path}
            type="button"
            className="workspace-item workspace-item-button nes-container is-rounded"
            onClick={() => onOpenItem(item.path)}
            title={`打开 ${item.path}`}
            data-workbench-path={item.path}
          >
            <div className="workspace-item-kind">{item.kind === 'dir' ? 'DIR' : 'FILE'}</div>
            <div className="workspace-item-body">
              <strong title={item.summary || item.label || item.name}>{item.summary || item.label || item.name}</strong>
              <span title={item.detail || item.path}>{item.detail || item.path}</span>
              {item.sourceUrl ? <em title={item.sourceUrl}>{item.sourceUrl}</em> : null}
            </div>
            <div className="workspace-item-meta">
              <span>{formatSize(item.size)}</span>
              <span>{formatTime(item.updatedAt)}</span>
            </div>
          </button>
        )) : (
          <div className="workspace-empty">{section.emptyText}</div>
        )}
      </div>
    </section>
  );
}

export default function WorkspacePanel({ overview, onRefresh, onOpenItem }: Props) {
  return (
    <div className="workspace-panel">
      <div className="workspace-hero">
        <div>
          <span className="workspace-eyebrow">Workbench</span>
          <h2>右侧固定工作台</h2>
          <p>这里始终保留文件、工具、录制和重放入口。浏览页面改成独立页层，在上方切换，不再把工作台本身覆盖掉。</p>
        </div>
        <button className="nes-btn is-primary" type="button" onClick={onRefresh}>刷新目录</button>
      </div>
      <div className="workspace-grid">
        {overview?.sections.map((section) => renderSection(section, onOpenItem))}
      </div>
    </div>
  );
}
