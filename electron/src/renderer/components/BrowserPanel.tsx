import React, { useEffect, useMemo, useRef, useState } from 'react';
import WorkspacePanel from './WorkspacePanel';
import type { BrowserTab, HardboardDevice, HardboardRuntimeState, RecordingSummary, RuntimeEvent, WorkbenchOverview } from '../types';

interface Props {
  url: string;
  onNavigate: (url: string) => void;
  tabs: BrowserTab[];
  onActivateTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  isRecording: boolean;
  recordingSummary: string;
  recordings: RecordingSummary[];
  hardboardDevices: HardboardDevice[];
  onStartRecording: (label: string) => void;
  onStopRecording: (label: string) => void;
  onReplayRecording: (target: string) => void;
  onRefreshHardboardDevices: () => void;
  onHardboardBuild: () => void;
  onHardboardFlash: (port: string) => void;
  workbench: WorkbenchOverview | null;
  onRefreshWorkbench: () => void;
  onImportWorkbenchFolder: () => void;
  onRemoveImportedWorkbenchFolder: (folderPath: string) => void;
  onOpenWorkbenchItem: (targetPath: string) => void;
}

type PanelMode = 'workbench' | 'repo' | 'monitor' | 'tasks' | 'editor';
type RuntimeCard = 'live' | 'full' | 'events';
const UI_BUILD_LABEL = '奥德赛0.4.0-7171';

interface SerialSample {
  x: number;
  value: number;
}

interface EditorTab {
  path: string;
  title: string;
  text: string;
  message: string;
  dirty: boolean;
}

interface ProjectOption {
  value: string;
}

interface TaskHistoryItem {
  taskId: string;
  kind: 'hardboard.build' | 'hardboard.flash';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  projectDir: string;
  port: string;
  startedAt: number;
  endedAt: number | null;
  exitCode: number | null;
}

interface TaskLogFocus {
  taskId: string;
  kind: TaskHistoryItem['kind'];
  status: TaskHistoryItem['status'];
}

function taskHistoryFromEvents(events: RuntimeEvent[]): TaskHistoryItem[] {
  const tasks = new Map<string, TaskHistoryItem>();
  for (const event of events) {
    const payloadTask = event.payload?.task;
    if (!payloadTask || typeof payloadTask !== 'object') continue;
    const task = payloadTask as Record<string, unknown>;
    const kind = task.kind;
    if (kind !== 'hardboard.build' && kind !== 'hardboard.flash') continue;
    const taskId = typeof task.taskId === 'string' ? task.taskId : event.taskId;
    if (!taskId) continue;
    const status = task.status;
    const normalizedStatus = status === 'running' || status === 'completed' || status === 'failed' || status === 'cancelled'
      ? status
      : 'pending';
    tasks.set(taskId, {
      taskId,
      kind,
      status: normalizedStatus,
      projectDir: typeof task.projectDir === 'string' ? task.projectDir : event.projectDir || '',
      port: typeof task.port === 'string' ? task.port : '',
      startedAt: typeof task.startedAt === 'number' ? task.startedAt : event.time,
      endedAt: typeof task.endedAt === 'number' ? task.endedAt : null,
      exitCode: typeof task.exitCode === 'number' ? task.exitCode : null,
    });
  }
  return [...tasks.values()]
    .sort((a, b) => (b.endedAt || b.startedAt) - (a.endedAt || a.startedAt));
}

function relativeProjectPath(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  const match = normalized.match(/(?:^|\/)hardboard\/projects\/([^/]+)|(?:^|\/)projects\/([^/]+)/i);
  const name = match?.[1] || match?.[2];
  return name ? `hardboard/projects/${name}` : value || 'unknown';
}

function taskStatusLabel(status: TaskHistoryItem['status']): string {
  if (status === 'completed') return '成功';
  if (status === 'failed') return '失败';
  if (status === 'running') return '运行中';
  if (status === 'cancelled') return '已取消';
  return '等待';
}

function taskDuration(task: TaskHistoryItem): string {
  const end = task.endedAt || (task.status === 'running' ? Date.now() : task.startedAt);
  const milliseconds = Math.max(0, end - task.startedAt);
  if (milliseconds < 1000) return `${milliseconds}ms`;
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function isPlaceholderTab(tab: BrowserTab, totalTabs: number): boolean {
  return totalTabs === 1 && tab.url === 'about:blank' && (!tab.title || tab.title === 'about:blank' || tab.title === '新页面');
}

function extractSamples(text: string, startIndex: number): SerialSample[] {
  const samples: SerialSample[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const values = line.match(/-?\d+(?:\.\d+)?/g);
    if (!values?.length) continue;
    const value = Number(values[values.length - 1]);
    if (Number.isFinite(value)) {
      samples.push({ x: startIndex + samples.length, value });
    }
  }
  return samples;
}

function SerialChart({ samples }: { samples: SerialSample[] }) {
  const width = 560;
  const height = 148;
  const visible = samples.slice(-180);
  const values = visible.map((sample) => sample.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const span = max === min ? 1 : max - min;
  const points = visible.map((sample, index) => {
    const x = visible.length <= 1 ? 0 : (index / (visible.length - 1)) * width;
    const y = height - ((sample.value - min) / span) * (height - 12) - 6;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div className="serial-chart">
      <div className="serial-chart-head">
        <span>实时曲线</span>
        <span>{values.length ? `${min.toFixed(2)} ~ ${max.toFixed(2)}` : '等待数值'}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="串口数值曲线">
        <path d={`M 0 ${height - 20} L ${width} ${height - 20}`} />
        <polyline points={points} />
      </svg>
    </div>
  );
}

function eventText(event: RuntimeEvent): string {
  const payload = event.payload || {};
  const progress = typeof payload.progress === 'number' ? ` ${payload.progress}%` : '';
  const port = typeof payload.port === 'string' ? ` port=${payload.port}` : '';
  const file = typeof payload.file === 'string' ? ` file=${payload.file}` : '';
  const exitCode = typeof payload.exitCode === 'number' ? ` exit=${payload.exitCode}` : '';
  const message = event.message ? ` ${event.message.replace(/\s+/g, ' ').slice(0, 220)}` : '';
  return `[${event.seq}] ${event.kind}${progress}${port}${file}${exitCode}${event.pid ? ` pid=${event.pid}` : ''}${event.toolName ? ` ${event.toolName}` : ''}${message}`;
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
  hardboardDevices,
  onStartRecording,
  onStopRecording,
  onReplayRecording,
  onRefreshHardboardDevices,
  onHardboardBuild,
  onHardboardFlash,
  workbench,
  onRefreshWorkbench,
  onImportWorkbenchFolder,
  onRemoveImportedWorkbenchFolder,
  onOpenWorkbenchItem,
}: Props) {
  const [mode, setMode] = useState<PanelMode>(() => window.electronAPI?.isWorkbenchSmokeTest ? 'repo' : 'monitor');
  const [inputUrl, setInputUrl] = useState('');
  const [recordingName, setRecordingName] = useState('');
  const [selectedReplay, setSelectedReplay] = useState('');
  const [selectedDevicePort, setSelectedDevicePort] = useState('');
  const [selectedTabId, setSelectedTabId] = useState('');
  const [serialPort, setSerialPort] = useState('');
  const [serialBaudRate, setSerialBaudRate] = useState(115200);
  const [serialEncoding, setSerialEncoding] = useState('utf-8');
  const [serialRunning, setSerialRunning] = useState(false);
  const [serialText, setSerialText] = useState('');
  const [serialSamples, setSerialSamples] = useState<SerialSample[]>([]);
  const [runtimeState, setRuntimeState] = useState<HardboardRuntimeState | null>(null);
  const [runtimeEvents, setRuntimeEvents] = useState<RuntimeEvent[]>([]);
  const [runtimeSeq, setRuntimeSeq] = useState(0);
  const [projectDir, setProjectDir] = useState('');
  const [runtimeMessage, setRuntimeMessage] = useState('');
  const [runtimeCard, setRuntimeCard] = useState<RuntimeCard | null>(null);
  const [taskLogFocus, setTaskLogFocus] = useState<TaskLogFocus | null>(null);
  const [liveLogClearedSeq, setLiveLogClearedSeq] = useState(0);
  const [fullLogClearedSeq, setFullLogClearedSeq] = useState(0);
  const [eventCardsClearedSeq, setEventCardsClearedSeq] = useState(0);
  const [taskHistoryClearedSeq, setTaskHistoryClearedSeq] = useState(0);
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([]);
  const [activeEditorFile, setActiveEditorFile] = useState('');
  const browserStageRef = useRef<HTMLDivElement | null>(null);
  const serialBottomRef = useRef<HTMLDivElement | null>(null);
  const focusedLogLineRef = useRef<HTMLDivElement | null>(null);

  const visibleTabs = useMemo(
    () => tabs.filter((tab) => !isPlaceholderTab(tab, tabs.length)),
    [tabs]
  );
  const activeTab = visibleTabs.find((tab) => tab.active) ?? null;
  const selectedTab = visibleTabs.find((tab) => tab.id === selectedTabId) ?? activeTab ?? null;
  const projectOptions = useMemo<ProjectOption[]>(() => {
    return (workbench?.hardboardProjects || [])
      .map((name) => ({ value: `hardboard/projects/${name}` }));
  }, [workbench]);
  const availableRuntimeEvents = runtimeEvents.length ? runtimeEvents : runtimeState?.recent || [];
  const visibleRuntimeEvents = useMemo(() => availableRuntimeEvents.slice(-500), [availableRuntimeEvents]);
  const liveLogEvents = useMemo(
    () => visibleRuntimeEvents.filter((event) => event.seq > liveLogClearedSeq),
    [liveLogClearedSeq, visibleRuntimeEvents]
  );
  const fullLogEvents = useMemo(
    () => visibleRuntimeEvents.filter((event) => event.seq > fullLogClearedSeq || event.taskId === taskLogFocus?.taskId),
    [fullLogClearedSeq, taskLogFocus, visibleRuntimeEvents]
  );
  const eventCardEvents = useMemo(
    () => visibleRuntimeEvents.filter((event) => event.seq > eventCardsClearedSeq),
    [eventCardsClearedSeq, visibleRuntimeEvents]
  );
  const runtimeLogLines = useMemo(() => liveLogEvents.map(eventText), [liveLogEvents]);
  const focusedLogEventIndex = useMemo(
    () => taskLogFocus ? fullLogEvents.findIndex((event) => event.taskId === taskLogFocus.taskId) : -1,
    [fullLogEvents, taskLogFocus]
  );
  const taskHistory = useMemo(
    () => taskHistoryFromEvents(availableRuntimeEvents.filter((event) => event.seq > taskHistoryClearedSeq)),
    [availableRuntimeEvents, taskHistoryClearedSeq]
  );
  const activeEditorTab = useMemo(
    () => editorTabs.find((tab) => tab.path === activeEditorFile) || editorTabs[0] || null,
    [activeEditorFile, editorTabs]
  );

  useEffect(() => {
    setInputUrl(url);
  }, [url]);

  useEffect(() => {
    if (!selectedDevicePort && hardboardDevices[0]) setSelectedDevicePort(hardboardDevices[0].port);
    if (!serialPort && hardboardDevices[0]) setSerialPort(hardboardDevices[0].port);
  }, [hardboardDevices, selectedDevicePort, serialPort]);

  useEffect(() => {
    if (activeTab && (!selectedTabId || !visibleTabs.some((tab) => tab.id === selectedTabId))) {
      setSelectedTabId(activeTab.id);
    }
  }, [activeTab, selectedTabId, visibleTabs]);

  useEffect(() => {
    const pushBounds = () => {
      if (mode !== 'workbench' || !browserStageRef.current) {
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
    if (stage && observer) observer.observe(stage);
    window.addEventListener('resize', pushBounds);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', pushBounds);
    };
  }, [mode, selectedTabId, tabs]);

  useEffect(() => {
    window.electronAPI?.getSerialMonitorStatus?.().then((result) => setSerialRunning(result.running));
    window.electronAPI?.onSerialData?.((chunk) => {
      setSerialText((current) => `${current}${chunk.text}`.slice(-30000));
      setSerialSamples((current) => {
        const next = extractSamples(chunk.text, current.length ? current[current.length - 1].x + 1 : 0);
        return next.length ? [...current, ...next].slice(-600) : current;
      });
    });
    window.electronAPI?.onSerialExit?.(() => {
      setSerialRunning(false);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const result = await window.electronAPI?.getHardboardRuntimeEvents?.(runtimeSeq);
      if (!result || cancelled) return;
      setRuntimeState(result.state);
      setRuntimeSeq(result.state.lastSeq);
      setRuntimeEvents((current) => [...current, ...result.events].slice(-500));
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [projectDir, runtimeSeq]);

  useEffect(() => {
    if (!projectDir && projectOptions[0]) {
      setProjectDir(projectOptions[0].value);
    }
  }, [projectDir, projectOptions]);

  useEffect(() => {
    serialBottomRef.current?.scrollIntoView({ block: 'end' });
  }, [serialText]);

  useEffect(() => {
    if (runtimeCard !== 'full' || !taskLogFocus) return;
    const frame = window.requestAnimationFrame(() => {
      focusedLogLineRef.current?.scrollIntoView({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [runtimeCard, taskLogFocus]);

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    setMode('workbench');
    onNavigate(inputUrl.trim());
  };

  const handleSelectTab = (tabId: string) => {
    setSelectedTabId(tabId);
    setMode('workbench');
    onActivateTab(tabId);
  };

  const handleCloseTab = (tabId: string) => {
    if (selectedTabId === tabId) setSelectedTabId('');
    onCloseTab(tabId);
  };

  const handleSerialStart = async () => {
    const result = await window.electronAPI?.startSerialMonitor?.({
      port: serialPort.trim(),
      baudRate: serialBaudRate,
      encoding: serialEncoding,
    });
    if (!result) return;
    setSerialRunning(result.running);
    if (!result.ok && result.error) {
      setSerialText((current) => `${current}\n[monitor] ${result.error}\n`);
    }
  };

  const handleSerialStop = async () => {
    const result = await window.electronAPI?.stopSerialMonitor?.();
    if (result) setSerialRunning(result.running);
  };

  const handleManualBuild = async () => {
    const result = await window.electronAPI?.startHardboardBuild?.({
      projectDir: projectDir.trim() || undefined,
    });
    setRuntimeMessage(result?.ok ? `Build 已启动，launcher pid=${result.pid ?? 'unknown'}` : result?.error || 'Build 启动失败');
  };

  const handleManualFlash = async () => {
    const result = await window.electronAPI?.startHardboardFlash?.({
      projectDir: projectDir.trim() || undefined,
      port: selectedDevicePort.trim() || serialPort.trim(),
    });
    setRuntimeMessage(result?.ok ? `Flash 已启动，launcher pid=${result.pid ?? 'unknown'}` : result?.error || 'Flash 启动失败');
  };

  const handleEditWorkbenchItem = async (item: WorkbenchItem) => {
    setMode('editor');
    const existing = editorTabs.find((tab) => tab.path === item.path);
    if (existing) {
      setActiveEditorFile(existing.path);
      return;
    }

    const result = await window.electronAPI?.readWorkbenchFile(item.path);
    const title = item.detail || item.name;
    const nextTab: EditorTab = {
      path: item.path,
      title,
      text: result?.ok ? result.text || '' : '',
      message: result?.ok ? `正在编辑: ${result.path || item.path}` : result?.error || '读取失败',
      dirty: false,
    };
    setEditorTabs((current) => [...current, nextTab]);
    setActiveEditorFile(item.path);
  };

  const handleEditorTextChange = (text: string) => {
    if (!activeEditorTab) return;
    setEditorTabs((current) => current.map((tab) => (
      tab.path === activeEditorTab.path
        ? { ...tab, text, dirty: true, message: `未保存: ${tab.path}` }
        : tab
    )));
  };

  const handleCloseEditorTab = (targetPath: string) => {
    setEditorTabs((current) => {
      const index = current.findIndex((tab) => tab.path === targetPath);
      const next = current.filter((tab) => tab.path !== targetPath);
      if (targetPath === activeEditorFile) {
        const fallback = next[Math.max(0, index - 1)] || next[0] || null;
        setActiveEditorFile(fallback?.path || '');
      }
      return next;
    });
  };

  const handleSaveEditor = async () => {
    if (!activeEditorTab) return;
    const result = await window.electronAPI?.writeWorkbenchFile(activeEditorTab.path, activeEditorTab.text);
    if (!result?.ok) {
      setEditorTabs((current) => current.map((tab) => (
        tab.path === activeEditorTab.path
          ? { ...tab, message: result?.error || '保存失败' }
          : tab
      )));
      return;
    }
    setEditorTabs((current) => current.map((tab) => (
      tab.path === activeEditorTab.path
        ? { ...tab, dirty: false, message: `已保存: ${result.path}` }
        : tab
    )));
  };

  const progressValue = runtimeState?.progress ?? 0;
  const runtimeBusy = runtimeState?.status === 'running';
  const selectedPort = selectedDevicePort || serialPort;
  const hasSelectedProject = projectOptions.some((project) => project.value === projectDir);
  const toggleRuntimeCard = (card: RuntimeCard) => {
    setTaskLogFocus(null);
    setRuntimeCard((current) => current === card ? null : card);
  };

  const showTaskLog = (task: TaskHistoryItem) => {
    setTaskLogFocus({ taskId: task.taskId, kind: task.kind, status: task.status });
    setRuntimeCard('full');
  };

  const clearRuntimeCard = () => {
    const latestSeq = visibleRuntimeEvents.at(-1)?.seq ?? runtimeSeq;
    if (runtimeCard === 'live') setLiveLogClearedSeq(latestSeq);
    if (runtimeCard === 'full') {
      setFullLogClearedSeq(latestSeq);
      setTaskLogFocus(null);
    }
    if (runtimeCard === 'events') setEventCardsClearedSeq(latestSeq);
  };

  const clearTaskHistory = () => {
    setTaskHistoryClearedSeq(visibleRuntimeEvents.at(-1)?.seq ?? runtimeSeq);
  };

  return (
    <div className="browser-panel nes-container is-rounded">
      <div className="workbench-mode-tabs nes-container is-dark">
        <button type="button" className={`nes-btn${mode === 'repo' ? ' is-primary' : ''}`} onClick={() => setMode('repo')}>仓库</button>
        <button type="button" className={`nes-btn${mode === 'monitor' ? ' is-primary' : ''}`} onClick={() => setMode('monitor')}>监视器</button>
        <button type="button" className={`nes-btn${mode === 'tasks' ? ' is-primary' : ''}`} onClick={() => setMode('tasks')}>任务管理器</button>
        <button type="button" className={`nes-btn${mode === 'editor' ? ' is-primary' : ''}`} onClick={() => setMode('editor')}>编辑器</button>
        <span className="ui-build-label">{UI_BUILD_LABEL}</span>
      </div>

      {mode === 'workbench' ? (
        <div className="workbench-browser">
          <div className="browser-shell-header nes-container is-dark">
            <div className="browser-tabs">
              {visibleTabs.length ? visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`browser-tab nes-btn${tab.active ? ' is-primary' : ''}`}
                  type="button"
                  onClick={() => handleSelectTab(tab.id)}
                  title={tab.title || tab.url}
                >
                  <span className="browser-tab-title">{tab.title || tab.url}</span>
                  <span
                    className="browser-tab-close nes-btn is-error"
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleCloseTab(tab.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        handleCloseTab(tab.id);
                      }
                    }}
                  >
                    x
                  </span>
                </button>
              )) : (
                <span className="browser-tab-empty">没有打开的浏览器页面</span>
              )}
            </div>
            <div className="browser-switcher">
              <span>{selectedTab ? selectedTab.title || selectedTab.url : '工作台浏览器'}</span>
              <div className="browser-switcher-controls">
                <select value={selectedTabId} onChange={(event) => handleSelectTab(event.target.value)} disabled={!visibleTabs.length}>
                  <option value="">选择页面</option>
                  {visibleTabs.map((tab) => (
                    <option key={tab.id} value={tab.id}>{tab.title || tab.url}</option>
                  ))}
                </select>
                <button className="browser-close-current nes-btn is-error" type="button" onClick={() => selectedTab && handleCloseTab(selectedTab.id)} disabled={!selectedTab}>关</button>
              </div>
            </div>
          </div>
          <div className="browser-toolbar nes-container is-rounded">
            <span className="browser-label">Browser Workbench</span>
            <form onSubmit={handleNavigate}>
              <input className="nes-input" value={inputUrl} onChange={(event) => setInputUrl(event.target.value)} placeholder="https:// 或本地 HTML 路径" />
              <button className="nes-btn is-primary" type="submit">打开</button>
            </form>
            <div className="browser-recording-controls">
              <input className="nes-input" value={recordingName} onChange={(event) => setRecordingName(event.target.value)} placeholder="录制名" />
              <button className="nes-btn" type="button" onClick={() => onStartRecording(recordingName)}>录</button>
              <select value={selectedReplay} onChange={(event) => setSelectedReplay(event.target.value)}>
                <option value="">回放</option>
                {recordings.map((recording) => (
                  <option key={recording.file} value={recording.file}>{recording.label || recording.file}</option>
                ))}
              </select>
              <button className="nes-btn" type="button" onClick={() => onReplayRecording(selectedReplay)}>播</button>
              <button className="nes-btn is-success" type="button" onClick={() => onStopRecording(recordingName)} disabled={!isRecording}>停止</button>
              <span className="browser-recording-status nes-container is-rounded">{recordingSummary}</span>
            </div>
          </div>
          <div className="browser-current-url">{selectedTab?.url || inputUrl || 'about:blank'}</div>
          <div className="browser-stage" ref={browserStageRef}>
            <div className="browser-stage-frame" />
            {!selectedTab ? (
              <div className="browser-stage-hint nes-container is-rounded">从仓库点击 HTML，或在上方输入 URL 后，会在这里运行浏览器页面。</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {mode === 'repo' ? (
        <WorkspacePanel overview={workbench} onRefresh={onRefreshWorkbench} onImportFolder={onImportWorkbenchFolder} onRemoveImportedFolder={onRemoveImportedWorkbenchFolder} onOpenItem={onOpenWorkbenchItem} onEditItem={handleEditWorkbenchItem} />
      ) : null}

      {mode === 'monitor' ? (
        <div className="serial-monitor">
          <div className="serial-toolbar nes-container is-rounded">
            <select className="nes-select" value={serialPort} onChange={(e) => setSerialPort(e.target.value)}>
              <option value="">COM</option>
              {hardboardDevices.map((device) => (
                <option key={device.port} value={device.port}>{device.port}</option>
              ))}
            </select>
            <select className="nes-select" value={serialBaudRate} onChange={(e) => setSerialBaudRate(Number(e.target.value))}>
              <option value={9600}>9600</option>
              <option value={57600}>57600</option>
              <option value={115200}>115200</option>
              <option value={230400}>230400</option>
              <option value={460800}>460800</option>
              <option value={921600}>921600</option>
            </select>
            <select className="nes-select" value={serialEncoding} onChange={(e) => setSerialEncoding(e.target.value)}>
              <option value="utf-8">UTF-8</option>
              <option value="gbk">GBK</option>
              <option value="ascii">ASCII</option>
              <option value="latin1">Latin1</option>
            </select>
            <button className="nes-btn" type="button" onClick={onRefreshHardboardDevices}>刷新</button>
            {serialRunning ? (
              <button className="nes-btn is-error" type="button" onClick={handleSerialStop}>停止</button>
            ) : (
              <button className="nes-btn is-success" type="button" onClick={handleSerialStart}>打开串口</button>
            )}
            <button className="nes-btn" type="button" onClick={() => { setSerialText(''); setSerialSamples([]); }}>清空</button>
          </div>
          <SerialChart samples={serialSamples} />
          <pre className="serial-output">
            {serialText || '等待串口数据...'}
            <span ref={serialBottomRef} />
          </pre>
        </div>
      ) : null}

      {mode === 'tasks' ? (
        <div className="task-manager-panel">
          <div className="task-manager-compile">
            <div className="compile-workbench-title nes-container is-dark">
              <strong>硬件编译/烧录任务 · {UI_BUILD_LABEL}</strong>
              <span>{runtimeState ? `${runtimeState.phase} / ${runtimeState.status}` : 'eventbus idle'}</span>
            </div>
            <div className="compile-control-grid">
              <div className="compile-control-row compile-control-row--build nes-container is-rounded">
                <strong>Build</strong>
                <span className="compile-row-prompt">编译工程</span>
                <select className="nes-select project-select" value={projectDir} onChange={(e) => setProjectDir(e.target.value)}>
                  <option value="">请选择 hardboard 工程</option>
                  {projectOptions.map((project) => (
                    <option key={project.value} value={project.value}>{project.value}</option>
                  ))}
                </select>
                <button className="nes-btn is-warning" type="button" onClick={handleManualBuild} disabled={!hasSelectedProject || runtimeBusy}>编译</button>
                <span className="compile-action-status">
                  {!hasSelectedProject ? '请先选择工作工程' : runtimeState?.phase === 'build' ? `${runtimeState.status} · ${progressValue}%` : '等待编译'}
                </span>
                <div className="runtime-progress compile-row-progress"><span style={{ width: `${runtimeState?.phase === 'build' ? Math.max(0, Math.min(100, progressValue)) : 0}%` }} /></div>
              </div>
              <div className="compile-control-row compile-control-row--flash nes-container is-rounded">
                <strong>Flash</strong>
                <button className="nes-btn" type="button" onClick={onRefreshHardboardDevices}>刷新设备</button>
                <select className="nes-select" value={selectedPort} onChange={(e) => { setSelectedDevicePort(e.target.value); setSerialPort(e.target.value); }}>
                  <option value="">串口</option>
                  {hardboardDevices.map((device) => <option key={device.port} value={device.port}>{device.port} · {device.label}</option>)}
                </select>
                <button className="nes-btn is-error" type="button" onClick={handleManualFlash} disabled={!hasSelectedProject || !selectedPort || runtimeBusy}>烧录</button>
                <span className="compile-action-status">
                  {!hasSelectedProject ? '请先选择工作工程' : !selectedPort ? '请选择串口' : runtimeState?.phase === 'flash' ? `${runtimeState.status} · ${progressValue}%` : '等待烧录'}
                </span>
                <div className="runtime-progress compile-row-progress"><span style={{ width: `${runtimeState?.phase === 'flash' ? Math.max(0, Math.min(100, progressValue)) : 0}%` }} /></div>
              </div>
            </div>
          </div>
          <div className="task-manager-diagnostics">
            <div className="diagnostic-toolbar nes-container is-rounded">
              <button className={`nes-btn${runtimeCard === 'live' ? ' is-primary' : ''}`} type="button" onClick={() => toggleRuntimeCard('live')}>实时日志</button>
              <button className={`nes-btn${runtimeCard === 'full' ? ' is-primary' : ''}`} type="button" onClick={() => toggleRuntimeCard('full')}>完整日志</button>
              <button className={`nes-btn${runtimeCard === 'events' ? ' is-primary' : ''}`} type="button" onClick={() => toggleRuntimeCard('events')}>事件卡片</button>
              <span>诊断信息按需查看</span>
            </div>
            {runtimeCard ? (
              <section className="diagnostic-card nes-container is-rounded">
                <header>
                  <strong>
                    {runtimeCard === 'live' ? 'Runtime 实时日志' : runtimeCard === 'full' ? '完整 EventBus 日志' : 'Runtime 事件卡片'}
                    {runtimeCard === 'full' && taskLogFocus ? ` · 已定位 ${taskLogFocus.kind === 'hardboard.build' ? 'Build' : 'Flash'} · ${taskStatusLabel(taskLogFocus.status)}` : ''}
                  </strong>
                  <div className="diagnostic-card-actions">
                    <button className="nes-btn is-warning" type="button" onClick={clearRuntimeCard}>清除</button>
                    <button className="nes-btn is-error" type="button" onClick={() => setRuntimeCard(null)}>关闭</button>
                  </div>
                </header>
                {runtimeCard === 'live' ? (
                  <pre className="runtime-live-log">{runtimeLogLines.slice(-40).join('\n') || '等待 runtime eventbus 消息...'}</pre>
                ) : null}
                {runtimeCard === 'full' ? (
                  <div className="task-manager-log">
                    {fullLogEvents.length ? fullLogEvents.map((event, index) => {
                      const focused = taskLogFocus?.taskId === event.taskId;
                      return (
                        <div
                          key={`${event.seq}-${event.id}`}
                          ref={focused && index === focusedLogEventIndex ? focusedLogLineRef : undefined}
                          className={`task-log-line${focused ? ` task-log-line--focused task-log-line--${taskLogFocus?.status}` : ''}`}
                        >
                          {eventText(event)}
                        </div>
                      );
                    }) : <div className="task-log-empty">暂无 runtime eventbus 消息</div>}
                  </div>
                ) : null}
                {runtimeCard === 'events' ? (
                  <div className="task-manager-events">
                    {eventCardEvents.length ? eventCardEvents.slice(-80).reverse().map((event) => (
                      <div key={`${event.seq}-${event.id}`} className={`task-event-card task-event-card--${event.kind.includes('stderr') || event.kind.includes('failed') ? 'error' : event.kind.includes('progress') ? 'progress' : 'normal'}`}>
                        <div className="task-event-card-head">
                          <strong>{event.kind}</strong>
                          <span>#{event.seq}</span>
                        </div>
                        <p>{eventText(event)}</p>
                        <code>{event.taskId || 'no-task'}</code>
                      </div>
                    )) : <div className="diagnostic-empty">暂无 Runtime 事件卡片，等待新事件...</div>}
                  </div>
                ) : null}
              </section>
            ) : null}
            <section className="task-history-panel nes-container is-rounded">
              <header className="task-history-header">
                <strong>最近任务与结果</strong>
                <div className="task-history-header-actions">
                  <span>{taskHistory.length ? `${taskHistory.length} 条 Build / Flash 记录` : '等待任务'}</span>
                  <button className="nes-btn is-warning" type="button" onClick={clearTaskHistory}>清除</button>
                </div>
              </header>
              <div className="task-history-table">
                <div className="task-history-table-head">
                  <span>状态</span><span>操作</span><span>工程</span><span>端口</span><span>开始时间</span><span>耗时</span><span>退出码</span><span>日志</span>
                </div>
                {taskHistory.length ? taskHistory.map((task) => (
                  <div key={task.taskId} className={`task-history-row task-history-row--${task.status}`}>
                    <span><i className={`task-status-badge task-status-badge--${task.status}`}>{taskStatusLabel(task.status)}</i></span>
                    <strong>{task.kind === 'hardboard.build' ? 'Build' : 'Flash'}</strong>
                    <code title={task.projectDir}>{relativeProjectPath(task.projectDir)}</code>
                    <span>{task.port || '—'}</span>
                    <span>{new Date(task.startedAt).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                    <span>{taskDuration(task)}</span>
                    <span>{task.exitCode ?? (task.status === 'failed' ? 'error' : '—')}</span>
                    <button className="nes-btn" type="button" onClick={() => showTaskLog(task)}>查看</button>
                  </div>
                )) : (
                  <div className="task-history-empty">暂无编译或烧录记录。选择工程后执行 Build / Flash，结果会显示在这里。</div>
                )}
              </div>
            </section>
          </div>
          <div className={`runtime-message${runtimeState?.lastError ? ' runtime-message--error' : ''}`}>
            {runtimeState?.lastError || runtimeMessage || '任务管理器正在订阅 runtime/hardboard/events'}
          </div>
        </div>
      ) : null}

      {mode === 'editor' ? (
        <div className="editor-panel">
          <div className="editor-toolbar nes-container is-dark">
            <strong>{activeEditorTab ? `${activeEditorTab.dirty ? '* ' : ''}${activeEditorTab.title}` : '未选择文件'}</strong>
            <select className="nes-select" value={activeEditorTab?.path || ''} onChange={(event) => setActiveEditorFile(event.target.value)} disabled={!editorTabs.length}>
              <option value="">打开的文件</option>
              {editorTabs.map((tab) => (
                <option key={tab.path} value={tab.path}>{tab.dirty ? '* ' : ''}{tab.title}</option>
              ))}
            </select>
            <button className="nes-btn is-success" type="button" onClick={handleSaveEditor} disabled={!activeEditorTab}>保存</button>
          </div>
          <div className="editor-tab-strip">
            {editorTabs.length ? editorTabs.map((tab) => (
              <button
                key={tab.path}
                className={`editor-tab${activeEditorTab?.path === tab.path ? ' editor-tab--active' : ''}`}
                type="button"
                title={tab.path}
                onClick={() => setActiveEditorFile(tab.path)}
              >
                <span>{tab.dirty ? '* ' : ''}{tab.title}</span>
                <i
                  role="button"
                  tabIndex={0}
                  title="关闭"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCloseEditorTab(tab.path);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      handleCloseEditorTab(tab.path);
                    }
                  }}
                >
                  x
                </i>
              </button>
            )) : (
              <div className="editor-empty-tabs">从仓库点击 C / CMake / Markdown / skills 文档后，会在这里打开多个编辑窗口。</div>
            )}
          </div>
          <textarea
            className="nes-textarea editor-textarea"
            value={activeEditorTab?.text || ''}
            onChange={(event) => handleEditorTextChange(event.target.value)}
            disabled={!activeEditorTab}
            placeholder="这里显示源码、CMake、Markdown、skills 文档。"
          />
          <div className="editor-status">{activeEditorTab?.message || '还没有打开文件。HTML 文件仍在工作台浏览器运行。'}</div>
        </div>
      ) : null}
    </div>
  );
}
