import React, { useState, useEffect, useCallback, useRef } from 'react';
import ChatPanel from './components/ChatPanel';
import BrowserPanel from './components/BrowserPanel';
import TaskProgress from './components/TaskProgress';
import type { BrowserTab, ChatMessage, HardboardDevice, RecordingSummary, TaskStep, WorkbenchOverview } from './types';

const LEFT_PANEL_WIDTH_KEY = 'vibeide.ui.leftPanelWidth';
const DEFAULT_LEFT_PANEL_WIDTH = 34;

function clampLeftPanelWidth(value: number): number {
  return Math.min(52, Math.max(24, value));
}

function readLeftPanelWidth(): number {
  const stored = Number(window.localStorage.getItem(LEFT_PANEL_WIDTH_KEY));
  return Number.isFinite(stored) && stored > 0
    ? clampLeftPanelWidth(stored)
    : DEFAULT_LEFT_PANEL_WIDTH;
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [browserUrl, setBrowserUrl] = useState('about:blank');
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSummary, setRecordingSummary] = useState('未开始录制');
  const [activeRecordingName, setActiveRecordingName] = useState('');
  const [recordings, setRecordings] = useState<RecordingSummary[]>([]);
  const [hardboardDevices, setHardboardDevices] = useState<HardboardDevice[]>([]);
  const [workbench, setWorkbench] = useState<WorkbenchOverview | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(readLeftPanelWidth);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const workbenchSmokeTriggered = useRef(false);

  useEffect(() => {
    window.localStorage.setItem(LEFT_PANEL_WIDTH_KEY, String(leftPanelWidth));
  }, [leftPanelWidth]);

  const handleDividerPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (leftPanelCollapsed || window.innerWidth <= 820) return;
    event.preventDefault();

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = (moveEvent.clientX / window.innerWidth) * 100;
      setLeftPanelWidth(clampLeftPanelWidth(nextWidth));
    };
    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.classList.remove('is-resizing-panels');
    };

    document.body.classList.add('is-resizing-panels');
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [leftPanelCollapsed]);

  const handleDividerKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? -2 : 2;
    setLeftPanelWidth((current) => clampLeftPanelWidth(current + delta));
  }, []);

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
    const deviceResult = await window.electronAPI?.listHardboardDevices();
    if (deviceResult) {
      setHardboardDevices(deviceResult.devices);
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

  const handleRefreshHardboardDevices = useCallback(async () => {
    const result = await window.electronAPI?.listHardboardDevices();
    if (!result) return;
    setHardboardDevices(result.devices);
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      text: result.devices.length
        ? `已发现硬件设备:\n${result.devices.map((device) => `${device.port} · ${device.label}`).join('\n')}`
        : '未发现串口设备，请确认 ESP32-S3 已连接并安装串口驱动。',
      role: 'agent',
      timestamp: Date.now(),
      error: result.devices.length === 0,
    }]);
  }, []);

  const handleHardboardBuild = useCallback(() => {
    handleSend('使用 hardboard.idf_build 编译当前 hardboard ESP32-S3 工程。先调用 hardboard.env_status 检查 ESP-IDF 5.4.3 环境，再选择 runtime/hardboard/projects 或示例工程执行构建，并把完整命令和结果摘要展示出来。');
  }, [handleSend]);

  const handleHardboardFlash = useCallback((port: string) => {
    const deviceHint = port ? `串口端口是 ${port}。` : '请先调用 hardboard.devices_list 选择可用串口。';
    handleSend(`使用 hardboard.idf_flash 烧录当前 hardboard ESP32-S3 工程。${deviceHint}烧录前先确认 ESP-IDF 5.4.3 环境和项目目录，失败时输出具体错误。`);
  }, [handleSend]);

  const handleRefreshWorkbench = useCallback(async () => {
    await refreshWorkbench();
  }, [refreshWorkbench]);

  const handleImportWorkbenchFolder = useCallback(async () => {
    const result = await window.electronAPI?.importWorkbenchFolder();
    if (!result || result.canceled) return;
    setWorkbench(result.overview);
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      text: result.ok ? '已导入文件夹到仓库视图。' : `导入文件夹失败: ${result.error}`,
      role: 'agent',
      timestamp: Date.now(),
      error: !result.ok,
    }]);
  }, []);

  const handleRemoveImportedWorkbenchFolder = useCallback(async (folderPath: string) => {
    const result = await window.electronAPI?.removeImportedWorkbenchFolder(folderPath);
    if (!result) return;
    setWorkbench(result.overview);
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      text: result.ok ? `已移除导入文件夹: ${folderPath}` : `移除导入文件夹失败: ${result.error}`,
      role: 'agent',
      timestamp: Date.now(),
      error: !result.ok,
    }]);
  }, []);

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
      <div
        className={`app-body${leftPanelCollapsed ? ' app-body--left-collapsed' : ''}`}
        style={{ '--left-panel-width': `${leftPanelWidth}%` } as React.CSSProperties}
      >
        {!leftPanelCollapsed ? (
          <div className="left-panel">
            <ChatPanel messages={messages} onSend={handleSend} />
            <TaskProgress steps={steps} />
          </div>
        ) : null}
        <div
          className="panel-divider"
          role="separator"
          aria-label="调整对话区宽度"
          aria-orientation="vertical"
          aria-valuemin={24}
          aria-valuemax={52}
          aria-valuenow={Math.round(leftPanelWidth)}
          tabIndex={leftPanelCollapsed ? -1 : 0}
          onPointerDown={handleDividerPointerDown}
          onKeyDown={handleDividerKeyDown}
        >
          <button
            className="panel-divider-toggle"
            type="button"
            title={leftPanelCollapsed ? '展开对话区' : '收起对话区'}
            aria-label={leftPanelCollapsed ? '展开对话区' : '收起对话区'}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setLeftPanelCollapsed((current) => !current)}
          >
            {leftPanelCollapsed ? '›' : '‹'}
          </button>
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
            hardboardDevices={hardboardDevices}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            onReplayRecording={handleReplayRecording}
            onRefreshHardboardDevices={handleRefreshHardboardDevices}
            onHardboardBuild={handleHardboardBuild}
            onHardboardFlash={handleHardboardFlash}
            workbench={workbench}
            onRefreshWorkbench={handleRefreshWorkbench}
            onImportWorkbenchFolder={handleImportWorkbenchFolder}
            onRemoveImportedWorkbenchFolder={handleRemoveImportedWorkbenchFolder}
            onOpenWorkbenchItem={handleOpenWorkbenchItem}
          />
        </div>
      </div>
    </div>
  );
}
