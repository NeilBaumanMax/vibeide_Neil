import React, { useEffect, useMemo, useRef, useState } from 'react';
import WorkspacePanel from './WorkspacePanel';
import type { BrowserTab, RecordingSummary, WorkbenchOverview } from '../types';

interface Props {
  url: string;
  onNavigate: (url: string) => void;
  tabs: BrowserTab[];
  onActivateTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  isRecording: boolean;
  recordingSummary: string;
  recordings: RecordingSummary[];
  onStartRecording: (label: string) => void;
  onStopRecording: (label: string) => void;
  onReplayRecording: (target: string) => void;
  workbench: WorkbenchOverview | null;
  onRefreshWorkbench: () => void;
  onOpenWorkbenchItem: (targetPath: string) => void;
}

const WORKBENCH_VIEW_ID = 'workbench';

function isPlaceholderTab(tab: BrowserTab, totalTabs: number): boolean {
  return totalTabs === 1 && tab.url === 'about:blank' && (!tab.title || tab.title === 'about:blank' || tab.title === '新页面');
}

export default function BrowserPanel({
  url,
  onNavigate,
  tabs,
  onActivateTab,
  onCloseTab,
  isRecording,
  recordingSummary,
  recordings,
  onStartRecording,
  onStopRecording,
  onReplayRecording,
  workbench,
  onRefreshWorkbench,
  onOpenWorkbenchItem,
}: Props) {
  const [inputUrl, setInputUrl] = useState('');
  const [recordingName, setRecordingName] = useState('');
  const [replayTarget, setReplayTarget] = useState('');
  const [selectedViewId, setSelectedViewId] = useState(WORKBENCH_VIEW_ID);
  const browserStageRef = useRef<HTMLDivElement | null>(null);
  const previousActiveTabId = useRef<string | null>(null);

  const visibleTabs = useMemo(
    () => tabs.filter((tab) => !isPlaceholderTab(tab, tabs.length)),
    [tabs]
  );

  const activeTab = visibleTabs.find((tab) => tab.active) ?? null;
  const selectedTab = visibleTabs.find((tab) => tab.id === selectedViewId) ?? null;
  const isWorkbenchActive = selectedViewId === WORKBENCH_VIEW_ID;

  useEffect(() => {
    if (!isWorkbenchActive) {
      setInputUrl(url);
    }
  }, [isWorkbenchActive, url]);

  useEffect(() => {
    if (!activeTab) {
      previousActiveTabId.current = null;
      setSelectedViewId((current) => (current === WORKBENCH_VIEW_ID ? current : WORKBENCH_VIEW_ID));
      return;
    }

    if (previousActiveTabId.current !== activeTab.id) {
      previousActiveTabId.current = activeTab.id;
      setSelectedViewId(activeTab.id);
      return;
    }

    setSelectedViewId((current) => {
      if (current === WORKBENCH_VIEW_ID) return current;
      if (!visibleTabs.some((tab) => tab.id === current)) return activeTab.id;
      return current;
    });
  }, [activeTab, visibleTabs]);

  useEffect(() => {
    const pushBounds = () => {
      if (isWorkbenchActive || !browserStageRef.current) {
        void window.electronAPI?.setBrowserBounds({ x: 0, y: 0, width: 0, height: 0 });
        return;
      }

      const rect = browserStageRef.current.getBoundingClientRect();
      void window.electronAPI?.setBrowserBounds({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    pushBounds();

    const stage = browserStageRef.current;
    const observer = stage ? new ResizeObserver(pushBounds) : null;
    if (stage && observer) {
      observer.observe(stage);
    }

    window.addEventListener('resize', pushBounds);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', pushBounds);
    };
  }, [isWorkbenchActive, selectedViewId, tabs]);

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    onNavigate(inputUrl.trim());
  };

  const handleSelectView = (nextViewId: string) => {
    if (nextViewId === WORKBENCH_VIEW_ID) {
      setSelectedViewId(WORKBENCH_VIEW_ID);
      return;
    }

    setSelectedViewId(nextViewId);
    onActivateTab(nextViewId);
  };

  const browserTitle = selectedTab?.title || activeTab?.title || '浏览页';
  const replayOptions = recordings.map((recording) => ({
    value: recording.file,
    label: `${recording.label || recording.file}${recording.actionCount == null ? '' : ` · ${recording.actionCount} 动作`}`,
  }));

  return (
    <div className="browser-panel nes-container is-rounded">
      <div className="browser-shell-header nes-container is-dark">
        <div className="browser-tabs">
          <button
            type="button"
            className={`browser-tab browser-tab--workspace nes-btn${isWorkbenchActive ? ' is-primary browser-tab--active' : ''}`}
            onClick={() => handleSelectView(WORKBENCH_VIEW_ID)}
          >
            工作台
          </button>
          {visibleTabs.map((tab) => (
            <div
              key={tab.id}
              className={`browser-tab nes-btn${selectedViewId === tab.id ? ' is-primary browser-tab--active' : ''}`}
              onClick={() => handleSelectView(tab.id)}
            >
              <span className="browser-tab-title">{tab.title || tab.url || '新页面'}</span>
              {visibleTabs.length > 0 ? (
                <button
                  type="button"
                  className="browser-tab-close nes-btn is-error"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                >
                  x
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <div className="browser-switcher">
          <span>页面</span>
          <select className="nes-select" value={selectedViewId} onChange={(e) => handleSelectView(e.target.value)}>
            <option value={WORKBENCH_VIEW_ID}>工作台 / 对话页</option>
            {visibleTabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.title || tab.url || tab.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isWorkbenchActive ? (
        <WorkspacePanel overview={workbench} onRefresh={onRefreshWorkbench} onOpenItem={onOpenWorkbenchItem} />
      ) : (
        <>
          <div className="browser-toolbar nes-container is-rounded">
            <span className="browser-label">{browserTitle}</span>
            <form onSubmit={handleNavigate}>
              <input
                className="nes-input"
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="输入 URL 导航..."
              />
              <button className="nes-btn is-primary" type="submit">Go</button>
            </form>
            <div className="browser-recording-controls">
              <input
                className="browser-recording-name nes-input"
                type="text"
                value={recordingName}
                onChange={(e) => setRecordingName(e.target.value)}
                placeholder="录制名"
              />
              {isRecording ? (
                <button className="nes-btn is-error" type="button" onClick={() => onStopRecording(recordingName.trim())}>Stop Rec</button>
              ) : (
                <button className="nes-btn is-success" type="button" onClick={() => onStartRecording(recordingName.trim())}>Start Rec</button>
              )}
              <select
                className="nes-select"
                value={replayTarget}
                onChange={(e) => setReplayTarget(e.target.value)}
                title="选择要重放的录制"
              >
                <option value="">最近录制</option>
                {replayOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <input
                className="browser-replay-target nes-input"
                type="text"
                value={replayTarget}
                onChange={(e) => setReplayTarget(e.target.value)}
                placeholder="重放名/文件"
              />
              <button className="nes-btn is-warning" type="button" onClick={() => onReplayRecording(replayTarget.trim())}>Play</button>
              <button type="button" className="browser-ghost-button nes-btn" onClick={() => handleSelectView(WORKBENCH_VIEW_ID)}>
                返回工作台
              </button>
            </div>
            <span className="browser-current-url">{url}</span>
          </div>
          <div className="browser-recording-status nes-container is-rounded">{recordingSummary}</div>
          <div ref={browserStageRef} className="browser-stage">
            <div className="browser-stage-frame">
              <div className="browser-stage-hint nes-container is-dark">
                当前浏览页在同一窗口中全尺寸显示。上方可切换到工作台或其他页面。
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
