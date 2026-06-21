import React, { useState, useEffect, useCallback, useRef } from 'react';
import ChatPanel from './components/ChatPanel';
import BrowserPanel from './components/BrowserPanel';
import TaskProgress from './components/TaskProgress';
import ResultPanel from './components/ResultPanel';
import type { BrowserTab, ChatMessage, RecordingSummary, TaskStep, WorkbenchOverview } from './types';

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [browserUrl, setBrowserUrl] = useState('about:blank');
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSummary, setRecordingSummary] = useState('未开始录制');
  const [activeRecordingName, setActiveRecordingName] = useState('');
  const [recordings, setRecordings] = useState<RecordingSummary[]>([]);
  const [workbench, setWorkbench] = useState<WorkbenchOverview | null>(null);
  const workbenchSmokeTriggered = useRef(false);

  const refreshWorkbench = useCallback(async () => {
    const [overview, recordingResult] = await Promise.all([
      window.electronAPI?.getWorkbenchOverview(),
      window.electronAPI?.listBrowserRecordingSummaries(),
    ]);
    if (overview) {
      setWorkbench(overview);
    }
    if (recordingResult) {
      setRecordings(recordingResult.recordings);
    }
  }, []);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onMessage((msg) => {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          text: msg.text,
          role: 'agent',
          timestamp: msg.timestamp,
          error: msg.error,
        }]);
      });

      window.electronAPI.onTaskProgress((result) => {
        setSteps(result.steps);
      });

      window.electronAPI.onTaskComplete((result) => {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          text: result.code === 0 ? '任务完成' : `任务失败 (code: ${result.code})`,
          role: 'agent',
          timestamp: Date.now(),
          error: result.code !== 0,
        }]);
      });

      window.electronAPI.onBrowserTabs((result) => {
        setTabs(result.tabs);
        const active = result.tabs.find((tab) => tab.active);
        if (active) {
          setBrowserUrl(active.url);
        }
      });

      window.electronAPI.listBrowserTabs().then((result) => {
        setTabs(result.tabs);
        const active = result.tabs.find((tab) => tab.active);
        if (active) {
          setBrowserUrl(active.url);
        }
      });

      void refreshWorkbench();
    }
  }, [refreshWorkbench]);

  const handleSend = useCallback((text: string) => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      text,
      role: 'user',
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, msg]);

    setSteps([]);

    window.electronAPI?.sendMessage(text);
  }, []);

  const handleNavigate = useCallback((url: string) => {
    setBrowserUrl(url);
    window.electronAPI?.navigateBrowser(url);
  }, []);

  const handleActivateTab = useCallback((id: string) => {
    window.electronAPI?.activateBrowserTab(id);
  }, []);

  const handleCloseTab = useCallback((id: string) => {
    window.electronAPI?.closeBrowserTab(id);
  }, []);

  const handleStartRecording = useCallback(async (label: string) => {
    await window.electronAPI?.startBrowserRecording();
    setActiveRecordingName(label);
    setIsRecording(true);
    setRecordingSummary(label ? `录制中: ${label}` : '录制中...');
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      text: label ? `浏览器录制已开始: ${label}` : '浏览器录制已开始',
      role: 'agent',
      timestamp: Date.now(),
    }]);
  }, []);

  const handleStopRecording = useCallback(async (label: string) => {
    const finalLabel = label || activeRecordingName || 'browser-recording';
    const result = await window.electronAPI?.stopBrowserRecording(finalLabel);
    setIsRecording(false);
    setActiveRecordingName('');
    if (!result) return;
    setRecordingSummary(`最近录制: ${finalLabel} · ${result.actionCount} 个动作`);
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      text: `录制已保存: ${finalLabel}\n${result.file} (${result.actionCount} 个动作)`,
      role: 'agent',
      timestamp: Date.now(),
    }]);
    void refreshWorkbench();
  }, [activeRecordingName, refreshWorkbench]);

  const handleReplayRecording = useCallback(async (target: string) => {
    const result = target
      ? await window.electronAPI?.replayBrowserRecording(target)
      : await window.electronAPI?.replayLatestBrowserRecording();
    if (!result) return;
    if (!result.ok) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        text: result.error ?? '回放失败',
        role: 'agent',
        timestamp: Date.now(),
        error: true,
      }]);
      return;
    }
    setRecordingSummary(`最近回放: ${result.actionCount} 个动作`);
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      text: `已回放录制: ${result.file} (${result.actionCount} 个动作)`,
      role: 'agent',
      timestamp: Date.now(),
    }]);
  }, []);

  const handleRefreshWorkbench = useCallback(async () => {
    await refreshWorkbench();
  }, [refreshWorkbench]);

  const handleOpenWorkbenchItem = useCallback(async (targetPath: string) => {
    const result = await window.electronAPI?.openWorkbenchItem(targetPath);
    if (!result) return;
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      text: result.ok
        ? `已打开工作台项目: ${result.path}`
        : `打开工作台项目失败: ${result.error}`,
      role: 'agent',
      timestamp: Date.now(),
      error: !result.ok,
    }]);
    if (window.electronAPI?.isWorkbenchSmokeTest) {
      await window.electronAPI.finishWorkbenchSmokeTest?.({
        source: 'workspace-item-click',
        targetPath,
        ...result,
      });
    }
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.isWorkbenchSmokeTest || workbenchSmokeTriggered.current || !workbench) {
      return;
    }
    const hasItem = workbench.sections.some((section) => section.items.length > 0);
    if (!hasItem) {
      void window.electronAPI.finishWorkbenchSmokeTest?.({
        ok: false,
        error: '工作台没有可点击项目',
      });
      return;
    }

    workbenchSmokeTriggered.current = true;
    window.setTimeout(() => {
      const button = document.querySelector<HTMLButtonElement>('.workspace-item-button');
      if (!button) {
        void window.electronAPI.finishWorkbenchSmokeTest?.({
          ok: false,
          error: '没有找到工作台项目按钮',
        });
        return;
      }
      button.click();
    }, 500);
  }, [workbench]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-icon-pixel" aria-hidden="true" />
          <span className="app-title">vibeide</span>
        </div>
        <span className="app-status nes-badge">
          <span className="is-primary">Runtime OK</span>
        </span>
      </header>
      <div className="app-body">
        <div className="left-panel">
          <ChatPanel messages={messages} onSend={handleSend} />
          <TaskProgress steps={steps} />
          <ResultPanel />
        </div>
        <div className="right-panel">
          <BrowserPanel
            url={browserUrl}
            onNavigate={handleNavigate}
            tabs={tabs}
            onActivateTab={handleActivateTab}
            onCloseTab={handleCloseTab}
            isRecording={isRecording}
            recordingSummary={recordingSummary}
            recordings={recordings}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            onReplayRecording={handleReplayRecording}
            workbench={workbench}
            onRefreshWorkbench={handleRefreshWorkbench}
            onOpenWorkbenchItem={handleOpenWorkbenchItem}
          />
        </div>
      </div>
    </div>
  );
}
