import React, { useEffect, useMemo, useRef, useState } from 'react';
import WorkspacePanel from './WorkspacePanel';
import type { BrowserTab, HardboardDevice, RecordingSummary, WorkbenchOverview } from '../types';

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
  onOpenWorkbenchItem: (targetPath: string) => void;
}

type PanelMode = 'workbench' | 'repo' | 'monitor';

interface SerialSample {
  x: number;
  value: number;
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
  onOpenWorkbenchItem,
}: Props) {
  const [mode, setMode] = useState<PanelMode>(() => window.electronAPI?.isWorkbenchSmokeTest ? 'repo' : 'workbench');
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
  const browserStageRef = useRef<HTMLDivElement | null>(null);
  const serialBottomRef = useRef<HTMLDivElement | null>(null);

  const visibleTabs = useMemo(
    () => tabs.filter((tab) => !isPlaceholderTab(tab, tabs.length)),
    [tabs]
  );
  const activeTab = visibleTabs.find((tab) => tab.active) ?? null;
  const selectedTab = visibleTabs.find((tab) => tab.id === selectedTabId) ?? activeTab ?? null;

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

  return (
    <div className="browser-panel nes-container is-rounded">
      <div className="workbench-mode-tabs nes-container is-dark">
        <button type="button" className={`nes-btn${mode === 'workbench' ? ' is-primary' : ''}`} onClick={() => setMode('workbench')}>工作台</button>
        <button type="button" className={`nes-btn${mode === 'repo' ? ' is-primary' : ''}`} onClick={() => setMode('repo')}>仓库</button>
        <button type="button" className={`nes-btn${mode === 'monitor' ? ' is-primary' : ''}`} onClick={() => setMode('monitor')}>监视器</button>
      </div>

      {mode === 'workbench' ? (
        <div className="workbench-browser">
          <div className="workbench-command-bar nes-container is-rounded">
            <form className="url-command" onSubmit={handleNavigate}>
              <input className="nes-input" type="text" value={inputUrl} onChange={(e) => setInputUrl(e.target.value)} placeholder="URL" />
              <button className="nes-btn is-primary" type="submit">Go</button>
            </form>

            <div className="compact-command-row">
              <input className="nes-input" type="text" value={recordingName} onChange={(e) => setRecordingName(e.target.value)} placeholder="录制名" />
              {isRecording ? (
                <button className="nes-btn is-error" type="button" onClick={() => onStopRecording(recordingName.trim())}>Stop</button>
              ) : (
                <button className="nes-btn is-success" type="button" onClick={() => onStartRecording(recordingName.trim())}>Rec</button>
              )}
              <select className="nes-select" value={selectedReplay} onChange={(e) => setSelectedReplay(e.target.value)} title="选择回放">
                <option value="">最近回放</option>
                {recordings.map((recording) => (
                  <option key={recording.path} value={recording.path}>{recording.label || recording.name}</option>
                ))}
              </select>
              <button className="nes-btn" type="button" onClick={() => onReplayRecording(selectedReplay)}>Replay</button>
              <select className="nes-select" value={selectedDevicePort} onChange={(e) => setSelectedDevicePort(e.target.value)} title="选择 ESP32-S3 串口设备">
                <option value="">设备</option>
                {hardboardDevices.map((device) => (
                  <option key={device.port} value={device.port}>{device.port}</option>
                ))}
              </select>
              <button className="nes-btn" type="button" onClick={onRefreshHardboardDevices}>Dev</button>
              <button className="nes-btn is-warning" type="button" onClick={onHardboardBuild}>Build</button>
              <button className="nes-btn is-error" type="button" onClick={() => onHardboardFlash(selectedDevicePort.trim())}>Flash</button>
            </div>
            <div className="command-status">{recordingSummary}</div>
          </div>

          <div className="browser-shell-header nes-container is-dark">
            <div className="browser-tabs">
              {visibleTabs.length === 0 ? (
                <span className="browser-tab-empty">无打开页面</span>
              ) : visibleTabs.map((tab) => (
                <div key={tab.id} className={`browser-tab nes-btn${selectedTab?.id === tab.id ? ' is-primary browser-tab--active' : ''}`} onClick={() => handleSelectTab(tab.id)}>
                  <span className="browser-tab-title">{tab.title || tab.url || '新页面'}</span>
                  <button
                    type="button"
                    className="browser-tab-close nes-btn is-error"
                    title="关闭页面"
                    aria-label={`关闭页面 ${tab.title || tab.url || tab.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseTab(tab.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="browser-switcher-controls">
              <select className="nes-select" value={selectedTab?.id || ''} onChange={(e) => e.target.value && handleSelectTab(e.target.value)}>
                <option value="">页面</option>
                {visibleTabs.map((tab) => (
                  <option key={tab.id} value={tab.id}>{tab.title || tab.url || tab.id}</option>
                ))}
              </select>
              <button type="button" className="browser-close-current nes-btn is-error" onClick={() => selectedTab && handleCloseTab(selectedTab.id)} disabled={!selectedTab}>关</button>
            </div>
          </div>

          <div ref={browserStageRef} className="browser-stage">
            <div className="browser-stage-frame">
              <div className="browser-stage-hint nes-container is-dark">浏览器显示区</div>
            </div>
          </div>
        </div>
      ) : null}

      {mode === 'repo' ? (
        <WorkspacePanel overview={workbench} onRefresh={onRefreshWorkbench} onOpenItem={onOpenWorkbenchItem} />
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
    </div>
  );
}
