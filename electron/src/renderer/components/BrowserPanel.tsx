import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import WorkspacePanel from './WorkspacePanel';
import CodeEditor from './CodeEditor';
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
  onOpenWorkbenchItem: (targetPath: string) => void;
}

type PanelMode = 'workbench' | 'repo' | 'monitor' | 'tasks' | 'editor';
type RuntimeCard = 'live' | 'full' | 'events';
const UI_BUILD_LABEL = '奥德赛1.0.0-7201';
const EDITOR_FONT_SIZE_KEY = 'vibeide.editor.fontSize';
const EDITOR_FONT_SIZE_MIN = 10;
const EDITOR_FONT_SIZE_MAX = 24;

interface EditorTab {
  path: string;
  title: string;
  text: string;
  message: string;
  dirty: boolean;
}

interface ExplorerContextMenu {
  x: number;
  y: number;
  item: WorkbenchItem;
  parentPath: string;
  root: boolean;
}

interface ExplorerDialog {
  mode: 'create-file' | 'create-dir' | 'rename' | 'delete';
  item: WorkbenchItem;
  parentPath: string;
  value: string;
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

interface EditorExplorerNodesProps {
  items: WorkbenchItem[];
  depth: number;
  activePath: string;
  expandedPaths: string[];
  loadingPaths: string[];
  childrenByPath: Record<string, WorkbenchItem[]>;
  onToggleDirectory: (targetPath: string) => void;
  onOpenFile: (item: WorkbenchItem) => void;
  onContextMenu: (event: React.MouseEvent, item: WorkbenchItem, parentPath: string, root: boolean) => void;
  parentPath: string;
}

function EditorExplorerNodes({
  items,
  depth,
  activePath,
  expandedPaths,
  loadingPaths,
  childrenByPath,
  onToggleDirectory,
  onOpenFile,
  onContextMenu,
  parentPath,
}: EditorExplorerNodesProps) {
  return (
    <>
      {items.map((item) => {
        const directory = item.kind === 'dir';
        const expanded = directory && expandedPaths.includes(item.path);
        const loading = directory && loadingPaths.includes(item.path);
        return (
          <div key={item.path} className="editor-explorer-node">
            <button
              type="button"
              className={`editor-explorer-item${activePath === item.path ? ' editor-explorer-item--active' : ''}`}
              style={{ paddingLeft: `${8 + depth * 14}px` }}
              title={item.path}
              onClick={() => directory ? onToggleDirectory(item.path) : onOpenFile(item)}
              onContextMenu={(event) => onContextMenu(event, item, parentPath, false)}
            >
              <span className="editor-explorer-chevron">{directory ? (expanded ? '▾' : '▸') : '·'}</span>
              <span className={`editor-explorer-icon editor-explorer-icon--${directory ? 'dir' : 'file'}`}>{directory ? 'DIR' : 'FILE'}</span>
              <span className="editor-explorer-name">{item.name}</span>
            </button>
            {directory && expanded ? (
              loading ? <div className="editor-explorer-loading" style={{ paddingLeft: `${30 + depth * 14}px` }}>正在读取...</div> : (
                <EditorExplorerNodes
                  items={childrenByPath[item.path] || []}
                  depth={depth + 1}
                  activePath={activePath}
                  expandedPaths={expandedPaths}
                  loadingPaths={loadingPaths}
                  childrenByPath={childrenByPath}
                  onToggleDirectory={onToggleDirectory}
                  onOpenFile={onOpenFile}
                  onContextMenu={onContextMenu}
                  parentPath={item.path}
                />
              )
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function isPlaceholderTab(tab: BrowserTab, totalTabs: number): boolean {
  return totalTabs === 1 && tab.url === 'about:blank' && (!tab.title || tab.title === 'about:blank' || tab.title === '新页面');
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
  const [serialDataBits, setSerialDataBits] = useState(8);
  const [serialStopBits, setSerialStopBits] = useState(1);
  const [serialParity, setSerialParity] = useState<'none' | 'odd' | 'even'>('none');
  const [serialReceiveMode, setSerialReceiveMode] = useState<'text' | 'hex'>('text');
  const [serialSendMode, setSerialSendMode] = useState<'text' | 'hex'>('text');
  const [serialSendText, setSerialSendText] = useState('');
  const [serialLineEnding, setSerialLineEnding] = useState<'none' | 'lf' | 'crlf'>('none');
  const [serialRunning, setSerialRunning] = useState(false);
  const [serialText, setSerialText] = useState('');
  const [runtimeState, setRuntimeState] = useState<HardboardRuntimeState | null>(null);
  const [runtimeEvents, setRuntimeEvents] = useState<RuntimeEvent[]>([]);
  const [runtimeSeq, setRuntimeSeq] = useState(0);
  const [runtimePollGeneration, setRuntimePollGeneration] = useState(0);
  const [projectDir, setProjectDir] = useState('');
  const [runtimeMessage, setRuntimeMessage] = useState('');
  const [clearingRuntimeHistory, setClearingRuntimeHistory] = useState(false);
  const [runtimeClearFeedback, setRuntimeClearFeedback] = useState('');
  const [runtimeCard, setRuntimeCard] = useState<RuntimeCard | null>(null);
  const [taskLogFocus, setTaskLogFocus] = useState<TaskLogFocus | null>(null);
  const [liveLogClearedSeq, setLiveLogClearedSeq] = useState(0);
  const [fullLogClearedSeq, setFullLogClearedSeq] = useState(0);
  const [eventCardsClearedSeq, setEventCardsClearedSeq] = useState(0);
  const [taskHistoryClearedSeq, setTaskHistoryClearedSeq] = useState(0);
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([]);
  const [activeEditorFile, setActiveEditorFile] = useState('');
  const [explorerChildren, setExplorerChildren] = useState<Record<string, WorkbenchItem[]>>({});
  const [explorerExpandedPaths, setExplorerExpandedPaths] = useState<string[]>([]);
  const [explorerLoadingPaths, setExplorerLoadingPaths] = useState<string[]>([]);
  const [explorerMessage, setExplorerMessage] = useState('');
  const [explorerContextMenu, setExplorerContextMenu] = useState<ExplorerContextMenu | null>(null);
  const [explorerDialog, setExplorerDialog] = useState<ExplorerDialog | null>(null);
  const [editorFontSize, setEditorFontSize] = useState(() => {
    const stored = Number(window.localStorage.getItem(EDITOR_FONT_SIZE_KEY));
    return Number.isFinite(stored) && stored >= EDITOR_FONT_SIZE_MIN && stored <= EDITOR_FONT_SIZE_MAX ? stored : 13;
  });
  const browserStageRef = useRef<HTMLDivElement | null>(null);
  const serialBottomRef = useRef<HTMLDivElement | null>(null);
  const serialReceiveModeRef = useRef<'text' | 'hex'>('text');
  const focusedLogLineRef = useRef<HTMLDivElement | null>(null);
  const runtimePollGenerationRef = useRef(0);

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
  const explorerRoots = useMemo(() => {
    const seen = new Set<string>();
    return (workbench?.sections || []).filter((section) => {
      if (!section.folderPath || seen.has(section.folderPath)) return false;
      seen.add(section.folderPath);
      return true;
    });
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

  const loadExplorerDirectory = useCallback(async (targetPath: string) => {
    setExplorerLoadingPaths((current) => current.includes(targetPath) ? current : [...current, targetPath]);
    const result = await window.electronAPI?.listWorkbenchDirectory?.(targetPath);
    setExplorerLoadingPaths((current) => current.filter((entry) => entry !== targetPath));
    if (!result?.ok) {
      setExplorerMessage(result?.error || `无法读取目录: ${targetPath}`);
      return;
    }
    setExplorerChildren((current) => ({ ...current, [targetPath]: result.items || [] }));
    setExplorerMessage('');
  }, []);

  useEffect(() => {
    setInputUrl(url);
  }, [url]);

  useEffect(() => {
    window.localStorage.setItem(EDITOR_FONT_SIZE_KEY, String(editorFontSize));
  }, [editorFontSize]);

  useEffect(() => {
    if (!explorerContextMenu) return;
    const closeMenu = () => setExplorerContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    window.addEventListener('click', closeMenu);
    window.addEventListener('blur', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('blur', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [explorerContextMenu]);

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
    serialReceiveModeRef.current = serialReceiveMode;
  }, [serialReceiveMode]);

  useEffect(() => {
    window.electronAPI?.getSerialMonitorStatus?.().then((result) => setSerialRunning(result.running));
    window.electronAPI?.onSerialData?.((chunk) => {
      const displayed = chunk.stream === 'stdout' && serialReceiveModeRef.current === 'hex'
        ? `${chunk.hex || ''}${chunk.hex ? ' ' : ''}`
        : chunk.text;
      setSerialText((current) => `${current}${displayed}`.slice(-30000));
    });
    window.electronAPI?.onSerialExit?.(() => {
      setSerialRunning(false);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const generation = runtimePollGenerationRef.current;
    const poll = async () => {
      const result = await window.electronAPI?.getHardboardRuntimeEvents?.(runtimeSeq);
      if (!result || cancelled || generation !== runtimePollGenerationRef.current) return;
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
  }, [projectDir, runtimeSeq, runtimePollGeneration]);

  useEffect(() => {
    if (!projectDir && projectOptions[0]) {
      setProjectDir(projectOptions[0].value);
    }
  }, [projectDir, projectOptions]);

  useEffect(() => {
    if (mode !== 'editor' || !explorerRoots.length) return;
    const rootPaths = explorerRoots.map((section) => section.folderPath);
    setExplorerExpandedPaths((current) => [...new Set([...current, ...rootPaths])]);
    for (const rootPath of rootPaths) void loadExplorerDirectory(rootPath);
  }, [explorerRoots, loadExplorerDirectory, mode]);

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
      dataBits: serialDataBits,
      stopBits: serialStopBits,
      parity: serialParity,
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

  const handleSerialSend = async () => {
    if (!serialRunning) return;
    const suffix = serialSendMode === 'text'
      ? serialLineEnding === 'crlf' ? '\r\n' : serialLineEnding === 'lf' ? '\n' : ''
      : '';
    const result = await window.electronAPI?.writeSerialMonitor?.(
      `${serialSendText}${suffix}`,
      serialSendMode,
      serialEncoding,
    );
    if (result && !result.ok) {
      setSerialText((current) => `${current}\n[串口] ${result.error || '发送失败'}\n`);
    }
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

  const openEditorFile = async (targetPath: string, title: string) => {
    setMode('editor');
    const existing = editorTabs.find((tab) => tab.path === targetPath);
    if (existing) {
      setActiveEditorFile(existing.path);
      return;
    }

    const result = await window.electronAPI?.readWorkbenchFile(targetPath);
    const nextTab: EditorTab = {
      path: targetPath,
      title,
      text: result?.ok ? result.text || '' : '',
      message: result?.ok ? `正在编辑: ${result.path || targetPath}` : result?.error || '读取失败',
      dirty: false,
    };
    setEditorTabs((current) => [...current, nextTab]);
    setActiveEditorFile(targetPath);
  };

  const handleEditWorkbenchItem = async (item: WorkbenchItem) => {
    await openEditorFile(item.path, item.detail || item.name);
  };

  const handleExplorerOpenFile = (item: WorkbenchItem) => {
    void openEditorFile(item.path, item.name);
  };

  const handleToggleExplorerDirectory = (targetPath: string) => {
    const expanded = explorerExpandedPaths.includes(targetPath);
    setExplorerExpandedPaths((current) => expanded
      ? current.filter((entry) => entry !== targetPath)
      : [...current, targetPath]);
    if (!expanded) void loadExplorerDirectory(targetPath);
  };

  const handleRefreshExplorer = () => {
    setExplorerChildren({});
    setExplorerMessage('正在刷新文件资源管理器...');
    onRefreshWorkbench();
    for (const root of explorerRoots) void loadExplorerDirectory(root.folderPath);
  };

  const showExplorerContextMenu = (event: React.MouseEvent, item: WorkbenchItem, parentPath: string, root: boolean) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 184;
    const menuHeight = item.kind === 'dir' ? 196 : 112;
    const pointerOffset = 6;
    setExplorerContextMenu({
      x: Math.max(6, Math.min(event.clientX + pointerOffset, window.innerWidth - menuWidth - 6)),
      y: Math.max(6, Math.min(event.clientY + pointerOffset, window.innerHeight - menuHeight - 6)),
      item,
      parentPath,
      root,
    });
  };

  const remapExplorerPath = (candidate: string, oldPath: string, nextPath: string) => {
    if (candidate === oldPath) return nextPath;
    if (candidate.startsWith(`${oldPath}\\`) || candidate.startsWith(`${oldPath}/`)) {
      return `${nextPath}${candidate.slice(oldPath.length)}`;
    }
    return candidate;
  };

  const handleCreateExplorerEntry = (kind: 'file' | 'dir') => {
    const context = explorerContextMenu;
    if (!context) return;
    setExplorerContextMenu(null);
    const parentPath = context.item.kind === 'dir' ? context.item.path : context.parentPath;
    setExplorerDialog({
      mode: kind === 'file' ? 'create-file' : 'create-dir',
      item: context.item,
      parentPath,
      value: kind === 'file' ? 'untitled.c' : '新建文件夹',
    });
  };

  const executeCreateExplorerEntry = async (dialog: ExplorerDialog) => {
    const kind = dialog.mode === 'create-file' ? 'file' : 'dir';
    const name = dialog.value.trim();
    if (!name) return;
    const result = await window.electronAPI?.createWorkbenchEntry(dialog.parentPath, name, kind);
    if (!result?.ok || !result.path) {
      setExplorerMessage(result?.error || '新建失败');
      return;
    }
    setExplorerExpandedPaths((current) => current.includes(dialog.parentPath) ? current : [...current, dialog.parentPath]);
    await loadExplorerDirectory(dialog.parentPath);
    onRefreshWorkbench();
    setExplorerMessage(`已新建${kind === 'file' ? '文件' : '文件夹'}: ${result.path}`);
    if (kind === 'file') void openEditorFile(result.path, name);
  };

  const handleRenameExplorerEntry = () => {
    const context = explorerContextMenu;
    if (!context || context.root) return;
    setExplorerContextMenu(null);
    setExplorerDialog({ mode: 'rename', item: context.item, parentPath: context.parentPath, value: context.item.name });
  };

  const executeRenameExplorerEntry = async (dialog: ExplorerDialog) => {
    const nextName = dialog.value.trim();
    if (!nextName || nextName === dialog.item.name) return;
    const result = await window.electronAPI?.renameWorkbenchEntry(dialog.item.path, nextName);
    if (!result?.ok || !result.path) {
      setExplorerMessage(result?.error || '重命名失败');
      return;
    }
    const oldPath = dialog.item.path;
    const nextPath = result.path;
    setEditorTabs((current) => current.map((tab) => {
      const remapped = remapExplorerPath(tab.path, oldPath, nextPath);
      return remapped === tab.path ? tab : { ...tab, path: remapped, title: tab.path === oldPath ? nextName : tab.title, message: `路径已更新: ${remapped}` };
    }));
    setActiveEditorFile((current) => remapExplorerPath(current, oldPath, nextPath));
    setExplorerExpandedPaths((current) => current.map((entry) => remapExplorerPath(entry, oldPath, nextPath)));
    setExplorerChildren((current) => Object.fromEntries(Object.entries(current).map(([key, items]) => [
      remapExplorerPath(key, oldPath, nextPath),
      items.map((item) => ({ ...item, path: remapExplorerPath(item.path, oldPath, nextPath), name: item.path === oldPath ? nextName : item.name })),
    ])));
    await loadExplorerDirectory(dialog.parentPath);
    onRefreshWorkbench();
    setExplorerMessage(`已重命名为: ${nextName}`);
  };

  const handleDeleteExplorerEntry = () => {
    const context = explorerContextMenu;
    if (!context || context.root) return;
    setExplorerContextMenu(null);
    setExplorerDialog({ mode: 'delete', item: context.item, parentPath: context.parentPath, value: '' });
  };

  const executeDeleteExplorerEntry = async (dialog: ExplorerDialog) => {
    const result = await window.electronAPI?.deleteWorkbenchEntry(dialog.item.path);
    if (!result?.ok) {
      setExplorerMessage(result?.error || '删除失败');
      return;
    }
    const targetPath = dialog.item.path;
    const isTargetOrChild = (candidate: string) => candidate === targetPath || candidate.startsWith(`${targetPath}\\`) || candidate.startsWith(`${targetPath}/`);
    setEditorTabs((current) => {
      const next = current.filter((tab) => !isTargetOrChild(tab.path));
      if (isTargetOrChild(activeEditorFile)) setActiveEditorFile(next[0]?.path || '');
      return next;
    });
    setExplorerExpandedPaths((current) => current.filter((entry) => !isTargetOrChild(entry)));
    setExplorerChildren((current) => Object.fromEntries(Object.entries(current)
      .filter(([key]) => !isTargetOrChild(key))
      .map(([key, items]) => [key, items.filter((item) => !isTargetOrChild(item.path))])));
    await loadExplorerDirectory(dialog.parentPath);
    onRefreshWorkbench();
    setExplorerMessage(`已移到系统回收站: ${targetPath}`);
  };

  const handleConfirmExplorerDialog = async () => {
    const dialog = explorerDialog;
    if (!dialog) return;
    setExplorerDialog(null);
    if (dialog.mode === 'create-file' || dialog.mode === 'create-dir') await executeCreateExplorerEntry(dialog);
    else if (dialog.mode === 'rename') await executeRenameExplorerEntry(dialog);
    else await executeDeleteExplorerEntry(dialog);
  };

  const handleContextRefresh = () => {
    const context = explorerContextMenu;
    if (!context) return;
    setExplorerContextMenu(null);
    const targetPath = context.item.kind === 'dir' ? context.item.path : context.parentPath;
    void loadExplorerDirectory(targetPath);
    setExplorerMessage(`正在刷新: ${targetPath}`);
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

  useEffect(() => {
    if (mode !== 'editor') return;
    const handleEditorShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void handleSaveEditor();
      }
    };
    window.addEventListener('keydown', handleEditorShortcut);
    return () => window.removeEventListener('keydown', handleEditorShortcut);
  }, [activeEditorTab, mode]);

  const progressValue = runtimeState?.progress ?? 0;
  const runtimeBusy = runtimeState?.status === 'running';
  const selectedPort = selectedDevicePort || serialPort;
  const hasSelectedProject = projectOptions.some((project) => project.value === projectDir);
  const buildStatusTone = !hasSelectedProject
    ? 'needs-input'
    : runtimeState?.phase === 'build' ? runtimeState.status : 'idle';
  const flashStatusTone = !hasSelectedProject || !selectedPort
    ? 'needs-input'
    : runtimeState?.phase === 'flash' ? runtimeState.status : 'idle';
  const toggleRuntimeCard = (card: RuntimeCard) => {
    setTaskLogFocus(null);
    setRuntimeCard((current) => current === card ? null : card);
  };

  const showTaskLog = (task: TaskHistoryItem) => {
    setTaskLogFocus({ taskId: task.taskId, kind: task.kind, status: task.status });
    setRuntimeCard('full');
  };

  const clearRuntimeHistory = async () => {
    if (clearingRuntimeHistory) return;

    const optimisticSeq = availableRuntimeEvents.reduce((maximum, event) => Math.max(maximum, event.seq), 0);
    setClearingRuntimeHistory(true);
    setRuntimeClearFeedback('');
    setLiveLogClearedSeq(optimisticSeq);
    setFullLogClearedSeq(optimisticSeq);
    setEventCardsClearedSeq(optimisticSeq);
    setTaskHistoryClearedSeq(optimisticSeq);
    setTaskLogFocus(null);
    try {
      if (!window.electronAPI?.clearHardboardRuntimeHistory) {
        throw new Error('当前窗口尚未加载清除服务，请重启应用后重试');
      }
      const result = await window.electronAPI.clearHardboardRuntimeHistory();
      if (!result?.ok || !result.state) {
        throw new Error(result?.error || 'Runtime history disk cleanup did not complete');
      }

      setRuntimeEvents([]);
      runtimePollGenerationRef.current += 1;
      setRuntimePollGeneration(runtimePollGenerationRef.current);
      setRuntimeState(result.state);
      setRuntimeSeq(result.state.lastSeq);
      setLiveLogClearedSeq(0);
      setFullLogClearedSeq(0);
      setEventCardsClearedSeq(0);
      setTaskHistoryClearedSeq(0);
      setTaskLogFocus(null);
      const feedback = `已清除 ${result.eventsRemoved ?? 0} 条事件、${result.logsRemoved ?? 0} 个日志文件`;
      setRuntimeClearFeedback(feedback);
      setRuntimeMessage(feedback);
    } catch (error) {
      // The user action always clears the current history view. Disk cleanup is
      // best-effort and must never restore records the user has explicitly removed.
      const feedback = '已清除当前历史记录';
      setRuntimeClearFeedback(feedback);
      setRuntimeMessage(feedback);
      console.warn('Runtime history disk cleanup did not complete:', error);
    } finally {
      setClearingRuntimeHistory(false);
    }
  };

  const clearRuntimeCard = async () => {
    await clearRuntimeHistory();
  };

  const clearTaskHistory = async () => {
    await clearRuntimeHistory();
  };

  return (
    <div className={`browser-panel browser-panel--${mode} nes-container is-rounded`}>
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
        <WorkspacePanel overview={workbench} onRefresh={onRefreshWorkbench} onOpenItem={onOpenWorkbenchItem} onEditItem={handleEditWorkbenchItem} />
      ) : null}

      {mode === 'monitor' ? (
        <div className="serial-monitor serial-assistant">
          <div className="serial-assistant-main">
            <fieldset className="serial-box serial-receive-box">
              <legend>接收区</legend>
              <pre className="serial-output">
                {serialText || ''}
                <span ref={serialBottomRef} />
              </pre>
              <div className="serial-box-actions">
                <span className={`serial-status${serialRunning ? ' serial-status--active' : ''}`} aria-live="polite">
                  <i aria-hidden="true" />{serialRunning ? `${serialPort} 已打开` : '串口未打开'}
                </span>
                <button className="serial-secondary-button" type="button" onClick={() => setSerialText('')}>清空接收区</button>
              </div>
            </fieldset>

            <fieldset className="serial-box serial-send-box">
              <legend>发送区</legend>
              <textarea
                value={serialSendText}
                onChange={(event) => setSerialSendText(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    void handleSerialSend();
                  }
                }}
                placeholder={serialSendMode === 'hex' ? '输入 HEX，例如 48 65 6C 6C 6F' : '输入要发送的数据（Ctrl+Enter 发送）'}
              />
              <div className="serial-box-actions serial-send-actions">
                <button className="serial-primary-button" type="button" onClick={handleSerialSend} disabled={!serialRunning || !serialSendText}>发送</button>
                <button className="serial-secondary-button" type="button" onClick={() => setSerialSendText('')}>清空发送区</button>
              </div>
            </fieldset>
          </div>

          <aside className="serial-assistant-settings">
            <fieldset className="serial-config-group">
              <legend>串口配置</legend>
              <label><span>串口号</span><select value={serialPort} onFocus={onRefreshHardboardDevices} onChange={(e) => setSerialPort(e.target.value)} disabled={serialRunning}>
                <option value="">请选择</option>
                {hardboardDevices.map((device) => <option key={device.port} value={device.port}>{device.port} · {device.label}</option>)}
              </select></label>
              <label><span>波特率</span><select value={serialBaudRate} onChange={(e) => setSerialBaudRate(Number(e.target.value))} disabled={serialRunning}>
                {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map((rate) => <option key={rate} value={rate}>{rate}</option>)}
              </select></label>
              <label><span>数据位</span><select value={serialDataBits} onChange={(e) => setSerialDataBits(Number(e.target.value))} disabled={serialRunning}>
                {[5, 6, 7, 8].map((bits) => <option key={bits} value={bits}>{bits}</option>)}
              </select></label>
              <label><span>停止位</span><select value={serialStopBits} onChange={(e) => setSerialStopBits(Number(e.target.value))} disabled={serialRunning}>
                <option value={1}>1</option><option value={1.5}>1.5</option><option value={2}>2</option>
              </select></label>
              <label><span>校验位</span><select value={serialParity} onChange={(e) => setSerialParity(e.target.value as 'none' | 'odd' | 'even')} disabled={serialRunning}>
                <option value="none">无</option><option value="odd">奇校验</option><option value="even">偶校验</option>
              </select></label>
              <div className="serial-operation"><span>操作</span>{serialRunning ? (
                <button type="button" className="serial-close-button" onClick={handleSerialStop}>关闭串口</button>
              ) : (
                <button type="button" className="serial-primary-button" onClick={handleSerialStart} disabled={!serialPort}>打开串口</button>
              )}</div>
              <button className="serial-refresh-button serial-secondary-button" type="button" onClick={onRefreshHardboardDevices}>刷新串口列表</button>
            </fieldset>

            <fieldset className="serial-config-group">
              <legend>接收区配置</legend>
              <label><span>接收模式</span><select value={serialReceiveMode} onChange={(e) => setSerialReceiveMode(e.target.value as 'text' | 'hex')}>
                <option value="hex">HEX模式</option><option value="text">文本模式</option>
              </select></label>
              <label><span>文本编码</span><select value={serialEncoding} onChange={(e) => setSerialEncoding(e.target.value)} disabled={serialReceiveMode === 'hex' || serialRunning}>
                <option value="gbk">GBK</option><option value="utf-8">UTF-8</option><option value="ascii">ASCII</option><option value="latin1">Latin1</option>
              </select></label>
            </fieldset>

            <fieldset className="serial-config-group">
              <legend>发送区配置</legend>
              <label><span>发送模式</span><select value={serialSendMode} onChange={(e) => setSerialSendMode(e.target.value as 'text' | 'hex')}>
                <option value="hex">HEX模式</option><option value="text">文本模式</option>
              </select></label>
              <label><span>文本编码</span><select value={serialEncoding} onChange={(e) => setSerialEncoding(e.target.value)} disabled={serialSendMode === 'hex' || serialRunning}>
                <option value="gbk">GBK</option><option value="utf-8">UTF-8</option><option value="ascii">ASCII</option><option value="latin1">Latin1</option>
              </select></label>
              <label><span>行尾</span><select value={serialLineEnding} onChange={(e) => setSerialLineEnding(e.target.value as 'none' | 'lf' | 'crlf')} disabled={serialSendMode === 'hex'}>
                <option value="none">不追加</option><option value="lf">LF</option><option value="crlf">CRLF</option>
              </select></label>
            </fieldset>
          </aside>
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
                <button className="nes-btn compile-refresh-button" type="button" onClick={onRefreshWorkbench}>刷新工程</button>
                <select className="nes-select project-select" value={projectDir} onChange={(e) => setProjectDir(e.target.value)}>
                  <option value="">请选择 hardboard 工程</option>
                  {projectOptions.map((project) => (
                    <option key={project.value} value={project.value}>{project.value}</option>
                  ))}
                </select>
                <button className="nes-btn is-warning" type="button" onClick={handleManualBuild} disabled={!hasSelectedProject || runtimeBusy}>编译</button>
                <span className={`compile-action-status is-${buildStatusTone}`} aria-live="polite">
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
                <span className={`compile-action-status is-${flashStatusTone}`} aria-live="polite">
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
                    <button className="nes-btn clear-history-button" type="button" disabled={clearingRuntimeHistory} onClick={() => void clearRuntimeCard()}>{clearingRuntimeHistory ? '清除中...' : '清除日志'}</button>
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
                  <span className={runtimeClearFeedback ? 'runtime-clear-feedback runtime-clear-feedback--success' : ''} aria-live="polite">
                    {clearingRuntimeHistory ? '正在清除本地记录…' : runtimeClearFeedback || (taskHistory.length ? `${taskHistory.length} 条 Build / Flash 记录` : '等待任务')}
                  </span>
                  <button className="nes-btn clear-history-button" type="button" disabled={clearingRuntimeHistory} onClick={() => void clearTaskHistory()}>{clearingRuntimeHistory ? '清除中...' : '清除记录'}</button>
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
          <aside className="editor-explorer nes-container is-rounded">
            <header className="editor-explorer-header">
              <div>
                <strong>文件资源管理器</strong>
                <span>{explorerRoots.length} 个工作目录</span>
              </div>
              <button className="nes-btn" type="button" onClick={handleRefreshExplorer}>刷新</button>
            </header>
            <div className="editor-explorer-tree">
              {explorerRoots.map((root) => {
                const expanded = explorerExpandedPaths.includes(root.folderPath);
                const loading = explorerLoadingPaths.includes(root.folderPath);
                return (
                  <section key={root.id} className="editor-explorer-root">
                    <button
                      type="button"
                      className="editor-explorer-root-button"
                      title={root.folderPath}
                      onClick={() => handleToggleExplorerDirectory(root.folderPath)}
                      onContextMenu={(event) => showExplorerContextMenu(event, {
                        name: root.title,
                        kind: 'dir',
                        path: root.folderPath,
                        updatedAt: null,
                        size: null,
                      }, root.folderPath, true)}
                    >
                      <span>{expanded ? '▾' : '▸'}</span>
                      <strong>{root.title}</strong>
                    </button>
                    {expanded ? (
                      loading ? <div className="editor-explorer-loading">正在读取...</div> : (
                        <EditorExplorerNodes
                          items={explorerChildren[root.folderPath] || []}
                          depth={0}
                          activePath={activeEditorTab?.path || ''}
                          expandedPaths={explorerExpandedPaths}
                          loadingPaths={explorerLoadingPaths}
                          childrenByPath={explorerChildren}
                          onToggleDirectory={handleToggleExplorerDirectory}
                          onOpenFile={handleExplorerOpenFile}
                          onContextMenu={showExplorerContextMenu}
                          parentPath={root.folderPath}
                        />
                      )
                    ) : null}
                  </section>
                );
              })}
              {!explorerRoots.length ? <div className="editor-explorer-empty">仓库中还没有可用工作目录。</div> : null}
            </div>
            <div className="editor-explorer-status">{explorerMessage || '展开目录并点击文件即可编辑'}</div>
          </aside>
          {explorerContextMenu ? createPortal((
            <div
              className="editor-context-menu"
              style={{ left: explorerContextMenu.x, top: explorerContextMenu.y }}
              onClick={(event) => event.stopPropagation()}
              role="menu"
            >
              {explorerContextMenu.item.kind === 'dir' ? (
                <>
                  <button type="button" role="menuitem" onClick={() => handleCreateExplorerEntry('file')}>新建文件</button>
                  <button type="button" role="menuitem" onClick={() => handleCreateExplorerEntry('dir')}>新建文件夹</button>
                  <span />
                </>
              ) : null}
              {!explorerContextMenu.root ? <button type="button" role="menuitem" onClick={handleRenameExplorerEntry}>重命名</button> : null}
              <button type="button" role="menuitem" onClick={handleContextRefresh}>刷新</button>
              {!explorerContextMenu.root ? (
                <>
                  <span />
                  <button className="editor-context-menu-delete" type="button" role="menuitem" onClick={handleDeleteExplorerEntry}>移到回收站</button>
                </>
              ) : null}
            </div>
          ), document.body) : null}
          {explorerDialog ? (
            <div className="editor-dialog-backdrop" role="presentation" onMouseDown={() => setExplorerDialog(null)}>
              <form
                className="editor-dialog nes-container is-rounded"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleConfirmExplorerDialog();
                }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <strong>
                  {explorerDialog.mode === 'create-file' ? '新建文件' : explorerDialog.mode === 'create-dir' ? '新建文件夹' : explorerDialog.mode === 'rename' ? '重命名' : '移到回收站'}
                </strong>
                {explorerDialog.mode === 'delete' ? (
                  <p>确定要将{explorerDialog.item.kind === 'dir' ? '文件夹及其内容' : '文件'}“{explorerDialog.item.name}”移到系统回收站吗？</p>
                ) : (
                  <label>
                    <span>{explorerDialog.mode === 'rename' ? '新名称' : '名称'}</span>
                    <input
                      className="nes-input"
                      autoFocus
                      value={explorerDialog.value}
                      onChange={(event) => setExplorerDialog((current) => current ? { ...current, value: event.target.value } : current)}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </label>
                )}
                <div className="editor-dialog-actions">
                  <button className="nes-btn" type="button" onClick={() => setExplorerDialog(null)}>取消</button>
                  <button
                    className={`nes-btn ${explorerDialog.mode === 'delete' ? 'is-error' : 'is-primary'}`}
                    type="submit"
                    disabled={explorerDialog.mode !== 'delete' && !explorerDialog.value.trim()}
                  >
                    {explorerDialog.mode === 'delete' ? '移到回收站' : '确定'}
                  </button>
                </div>
              </form>
            </div>
          ) : null}
          <section className="editor-main">
            <div className="editor-tabs-bar">
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
                )) : <div className="editor-empty-tabs">从左侧资源管理器选择文件</div>}
              </div>
              <button className="nes-btn is-success editor-save-button" type="button" onClick={handleSaveEditor} disabled={!activeEditorTab || !activeEditorTab.dirty}>保存</button>
            </div>
            <div className="editor-current-path" title={activeEditorTab?.path}>{activeEditorTab?.path || '未打开文件'}</div>
            <CodeEditor
              filePath={activeEditorTab?.path || ''}
              value={activeEditorTab?.text || ''}
              fontSize={editorFontSize}
              onChange={handleEditorTextChange}
            />
            <div className="editor-footer">
              <div className="editor-status">{activeEditorTab?.message || '还没有打开文件。'}</div>
              <div className="editor-font-controls" aria-label="编辑器字体大小">
                <span>字体</span>
                <button type="button" title="减小字体" onClick={() => setEditorFontSize((current) => Math.max(EDITOR_FONT_SIZE_MIN, current - 1))} disabled={editorFontSize <= EDITOR_FONT_SIZE_MIN}>−</button>
                <strong>{editorFontSize}px</strong>
                <button type="button" title="增大字体" onClick={() => setEditorFontSize((current) => Math.min(EDITOR_FONT_SIZE_MAX, current + 1))} disabled={editorFontSize >= EDITOR_FONT_SIZE_MAX}>＋</button>
                <button type="button" title="恢复默认字号" onClick={() => setEditorFontSize(13)}>重置</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
