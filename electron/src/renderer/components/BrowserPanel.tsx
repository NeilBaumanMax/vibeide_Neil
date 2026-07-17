import React, { useEffect, useMemo, useRef, useState } from 'react';
import WorkspacePanel from './WorkspacePanel';
import type { BrowserTab, HardboardDevice, HardboardRuntimeState, RecordingSummary, RuntimeEvent, WorkbenchItem, WorkbenchOverview } from '../types';

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
const UI_BUILD_LABEL = '奥德赛0.4.0.7161';

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

function fileExtRank(item: WorkbenchItem): number {
  if (/CMakeLists\.txt$/i.test(item.name)) return 0;
  if (/sdkconfig/i.test(item.name)) return 1;
  if (/\.(c|cpp|h|hpp|S)$/i.test(item.name)) return 2;
  if (/\.(bin|elf)$/i.test(item.name)) return 3;
  return 9;
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
  const [selectedSourcePath, setSelectedSourcePath] = useState('');
  const [selectedCmakePath, setSelectedCmakePath] = useState('');
  const [selectedConfigPath, setSelectedConfigPath] = useState('');
  const [selectedArtifactPath, setSelectedArtifactPath] = useState('');
  const [sourcePreview, setSourcePreview] = useState('');
  const [runtimeMessage, setRuntimeMessage] = useState('');
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([]);
  const [activeEditorFile, setActiveEditorFile] = useState('');
  const browserStageRef = useRef<HTMLDivElement | null>(null);
  const serialBottomRef = useRef<HTMLDivElement | null>(null);

  const visibleTabs = useMemo(
    () => tabs.filter((tab) => !isPlaceholderTab(tab, tabs.length)),
    [tabs]
  );
  const activeTab = visibleTabs.find((tab) => tab.active) ?? null;
  const selectedTab = visibleTabs.find((tab) => tab.id === selectedTabId) ?? activeTab ?? null;
  const repositoryItems = useMemo(() => workbench?.sections.flatMap((section) => section.items) || [], [workbench]);
  const hardwareItems = useMemo(
    () => repositoryItems
      .filter((item) => item.category === 'hardware' || item.category === 'reference')
      .sort((a, b) => fileExtRank(a) - fileExtRank(b) || a.name.localeCompare(b.name, 'zh-CN')),
    [repositoryItems]
  );
  const cmakeFiles = hardwareItems.filter((item) => /CMakeLists\.txt$/i.test(item.name));
  const configFiles = hardwareItems.filter((item) => /sdkconfig/i.test(item.name));
  const sourceFiles = hardwareItems.filter((item) => /\.(c|cpp|h|hpp|S)$/i.test(item.name));
  const artifactFiles = hardwareItems.filter((item) => /\.(bin|elf)$/i.test(item.name));
  const runtimeLogLines = useMemo(() => runtimeEvents.slice(-80).map(eventText), [runtimeEvents]);
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
      setRuntimeEvents((current) => [...current, ...result.events].slice(-80));
      if (!projectDir && result.state.activeProjectDir) {
        setProjectDir(result.state.activeProjectDir);
      }
      if (!selectedSourcePath && result.state.files[0]) {
        setSelectedSourcePath(result.state.files[0].path);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [projectDir, runtimeSeq, selectedSourcePath]);

  useEffect(() => {
    if (!selectedCmakePath && cmakeFiles[0]) setSelectedCmakePath(cmakeFiles[0].path);
    if (!selectedConfigPath && configFiles[0]) setSelectedConfigPath(configFiles[0].path);
    if (!selectedSourcePath && sourceFiles[0]) setSelectedSourcePath(sourceFiles[0].path);
    if (!selectedArtifactPath && artifactFiles[0]) setSelectedArtifactPath(artifactFiles[0].path);
  }, [artifactFiles, cmakeFiles, configFiles, selectedArtifactPath, selectedCmakePath, selectedConfigPath, selectedSourcePath, sourceFiles]);

  useEffect(() => {
    if (!selectedSourcePath) {
      setSourcePreview('');
      return;
    }
    window.electronAPI?.readHardboardSourceFile?.(selectedSourcePath).then((result) => {
      setSourcePreview(result?.ok ? result.text || '' : result?.error || '读取文件失败');
    });
  }, [selectedSourcePath]);

  useEffect(() => {
    serialBottomRef.current?.scrollIntoView({ block: 'end' });
  }, [serialText]);

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
      cmakeFile: selectedCmakePath || undefined,
      configFile: selectedConfigPath || undefined,
      sourceFile: selectedSourcePath || undefined,
    });
    setRuntimeMessage(result?.ok ? `Build 已启动，launcher pid=${result.pid ?? 'unknown'}` : result?.error || 'Build 启动失败');
  };

  const handleManualFlash = async () => {
    const result = await window.electronAPI?.startHardboardFlash?.({
      projectDir: projectDir.trim() || undefined,
      port: selectedDevicePort.trim() || serialPort.trim(),
      artifactFile: selectedArtifactPath || undefined,
      configFile: selectedConfigPath || undefined,
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

  return (
    <div className="browser-panel nes-container is-rounded">
      <div className="workbench-mode-tabs nes-container is-dark">
        <button type="button" className={`nes-btn${mode === 'workbench' ? ' is-primary' : ''}`} onClick={() => setMode('workbench')}>工作台</button>
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
              <div className="compile-control-row nes-container is-rounded">
                <strong>Build</strong>
                <input className="nes-input" value={projectDir} onChange={(e) => setProjectDir(e.target.value)} placeholder={runtimeState?.activeProjectDir || 'ESP-IDF project dir'} />
                <select className="nes-select" value={selectedCmakePath} onChange={(e) => setSelectedCmakePath(e.target.value)}>
                  <option value="">CMake</option>
                  {cmakeFiles.map((file) => <option key={file.path} value={file.path}>{file.detail || file.name}</option>)}
                </select>
                <select className="nes-select" value={selectedConfigPath} onChange={(e) => setSelectedConfigPath(e.target.value)}>
                  <option value="">配置</option>
                  {configFiles.map((file) => <option key={file.path} value={file.path}>{file.detail || file.name}</option>)}
                </select>
                <select className="nes-select" value={selectedSourcePath} onChange={(e) => setSelectedSourcePath(e.target.value)}>
                  <option value="">源码</option>
                  {sourceFiles.map((file) => <option key={file.path} value={file.path}>{file.detail || file.name}</option>)}
                </select>
                <button className="nes-btn is-warning" type="button" onClick={handleManualBuild}>编译</button>
                <div className="runtime-progress compile-row-progress"><span style={{ width: `${Math.max(0, Math.min(100, progressValue))}%` }} /></div>
              </div>
              <div className="compile-control-row nes-container is-rounded">
                <strong>Flash</strong>
                <input className="nes-input" value={projectDir} onChange={(e) => setProjectDir(e.target.value)} placeholder="flash project dir" />
                <select className="nes-select" value={selectedArtifactPath} onChange={(e) => setSelectedArtifactPath(e.target.value)}>
                  <option value="">烧录产物</option>
                  {artifactFiles.map((file) => <option key={file.path} value={file.path}>{file.detail || file.name}</option>)}
                </select>
                <select className="nes-select" value={selectedConfigPath} onChange={(e) => setSelectedConfigPath(e.target.value)}>
                  <option value="">烧录配置</option>
                  {configFiles.map((file) => <option key={file.path} value={file.path}>{file.detail || file.name}</option>)}
                </select>
                <select className="nes-select" value={selectedDevicePort || serialPort} onChange={(e) => { setSelectedDevicePort(e.target.value); setSerialPort(e.target.value); }}>
                  <option value="">串口</option>
                  {hardboardDevices.map((device) => <option key={device.port} value={device.port}>{device.port} · {device.label}</option>)}
                </select>
                <button className="nes-btn is-error" type="button" onClick={handleManualFlash}>烧录</button>
                <div className="runtime-progress compile-row-progress"><span style={{ width: `${runtimeState?.phase === 'flash' ? Math.max(0, Math.min(100, progressValue)) : 0}%` }} /></div>
              </div>
            </div>
            <div className="workbench-code-area">
              <pre className="runtime-source-preview">{sourcePreview || '选择 C / CMake / sdkconfig 文件后，这里显示当前待编译/烧录代码。'}</pre>
              <pre className="runtime-live-log">{runtimeLogLines.slice(-24).join('\n') || '等待 runtime eventbus 消息...'}</pre>
            </div>
          </div>
          <div className="task-manager-summary nes-container is-rounded">
            <div><strong>PID</strong><span>{runtimeState?.activePid ?? 'none'}</span></div>
            <div><strong>Task</strong><span>{runtimeState?.activeTaskId ?? 'none'}</span></div>
            <div><strong>Tool</strong><span>{runtimeState?.activeToolName ?? 'none'}</span></div>
            <div><strong>Port</strong><span>{runtimeState?.currentPort ?? (selectedDevicePort || serialPort || 'none')}</span></div>
            <div><strong>Project</strong><span>{runtimeState?.activeProjectDir ?? (projectDir || 'none')}</span></div>
            <div><strong>Current</strong><span>{runtimeState?.currentFile ?? 'none'}</span></div>
          </div>
          <div className="task-manager-body">
            <pre className="task-manager-log">
              {runtimeLogLines.join('\n') || '暂无 runtime eventbus 消息'}
            </pre>
            <div className="task-manager-events">
              {(runtimeEvents.length ? runtimeEvents : runtimeState?.recent || []).slice(-80).reverse().map((event) => (
                <div key={`${event.seq}-${event.id}`} className={`task-event-card task-event-card--${event.kind.includes('stderr') || event.kind.includes('failed') ? 'error' : event.kind.includes('progress') ? 'progress' : 'normal'}`}>
                  <div className="task-event-card-head">
                    <strong>{event.kind}</strong>
                    <span>#{event.seq}</span>
                  </div>
                  <p>{eventText(event)}</p>
                  <code>{event.taskId || 'no-task'}</code>
                </div>
              ))}
            </div>
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
