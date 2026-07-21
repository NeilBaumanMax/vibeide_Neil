import React, { useState, useEffect, useCallback, useRef } from 'react';
import ChatPanel from './components/ChatPanel';
import BrowserPanel from './components/BrowserPanel';
import type { AgentTaskStatus, BrowserTab, ChatConversation, ChatConversationSummary, ChatMessage, ChatMessageKind, HardboardDevice, RecordingSummary, TaskStep, TaskSubmitMode, WorkbenchOverview } from './types';

const LEFT_PANEL_WIDTH_KEY = 'vibeide.ui.leftPanelWidth';
const APPEARANCE_THEME_KEY = 'vibeide.appearance.theme';
const APPEARANCE_POSITION_KEY = 'vibeide.appearance.position';
const DEFAULT_LEFT_PANEL_WIDTH = 34;
const APPEARANCE_BUTTON_SIZE = 42;
const APPEARANCE_EDGE_GAP = 12;
const IDLE_TASK_STATUS: AgentTaskStatus = { busy: false, paused: false, activeTaskId: null, activeTask: null, queueLength: 0, guidanceCount: 0 };
type AppearanceTheme = 'dark' | 'light';
type FloatingPosition = { x: number; y: number };

function cleanAgentText(value: string): string {
  return value
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001A\u001C-\u001F\u007F]/g, '')
    .trim();
}

function inferChatMessageKind(text: string, provided?: ChatMessageKind, error = false): ChatMessageKind {
  if (provided) return provided;
  // Unclassified worker failures need to remain visible as conversational output.
  // Typed tool failures are already marked as `detail` by the main process.
  if (error) return 'conversation';
  if (/^\[Agent\] 仍在执行，等待输出/.test(text)) return 'status';
  if (/^\[Agent\] PID\b|^\s*•\s+(?:Tool|Read|Ran|Edited|Created)|^\s*└|^\{"type":"/.test(text)) return 'detail';
  if (/^\[(?:Worker|Agent)\]/.test(text)) return 'progress';
  return 'conversation';
}

function readInitialAppearanceTheme(): AppearanceTheme {
  try {
    const stored = window.localStorage.getItem(APPEARANCE_THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    const initial = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    window.localStorage.setItem(APPEARANCE_THEME_KEY, initial);
    return initial;
  } catch {
    return 'dark';
  }
}

function applyAppearanceTheme(theme: AppearanceTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

const INITIAL_APPEARANCE_THEME = readInitialAppearanceTheme();
applyAppearanceTheme(INITIAL_APPEARANCE_THEME);

function clampAppearancePosition(position: FloatingPosition): FloatingPosition {
  return {
    x: Math.min(
      Math.max(APPEARANCE_EDGE_GAP, window.innerWidth - APPEARANCE_BUTTON_SIZE - APPEARANCE_EDGE_GAP),
      Math.max(APPEARANCE_EDGE_GAP, position.x),
    ),
    y: Math.min(
      Math.max(APPEARANCE_EDGE_GAP, window.innerHeight - APPEARANCE_BUTTON_SIZE - APPEARANCE_EDGE_GAP),
      Math.max(APPEARANCE_EDGE_GAP, position.y),
    ),
  };
}

function readInitialAppearancePosition(): FloatingPosition {
  try {
    const stored = JSON.parse(window.localStorage.getItem(APPEARANCE_POSITION_KEY) ?? 'null') as Partial<FloatingPosition> | null;
    if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
      return clampAppearancePosition({ x: Number(stored.x), y: Number(stored.y) });
    }
  } catch {
    // Fall through to the collision-free default position.
  }
  return clampAppearancePosition({
    x: window.innerWidth - APPEARANCE_BUTTON_SIZE - 18,
    y: window.innerHeight - APPEARANCE_BUTTON_SIZE - 82,
  });
}

function storeAppearancePosition(position: FloatingPosition): void {
  try {
    window.localStorage.setItem(APPEARANCE_POSITION_KEY, JSON.stringify(position));
  } catch {
    // Dragging remains available for this session when storage is unavailable.
  }
}

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
  const [chatConversations, setChatConversations] = useState<ChatConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [chatHistoryError, setChatHistoryError] = useState('');
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [taskStatus, setTaskStatus] = useState<AgentTaskStatus>(IDLE_TASK_STATUS);
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
  const [appearanceTheme, setAppearanceTheme] = useState<AppearanceTheme>(INITIAL_APPEARANCE_THEME);
  const [appearanceMenuOpen, setAppearanceMenuOpen] = useState(false);
  const [appearancePosition, setAppearancePosition] = useState<FloatingPosition>(readInitialAppearancePosition);
  const [appearanceDragging, setAppearanceDragging] = useState(false);
  const workbenchSmokeTriggered = useRef(false);
  const activeConversationIdRef = useRef('');
  const appearanceSettingsRef = useRef<HTMLDivElement>(null);
  const appearanceDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const suppressAppearanceClickRef = useRef(false);

  useEffect(() => {
    window.localStorage.setItem(LEFT_PANEL_WIDTH_KEY, String(leftPanelWidth));
  }, [leftPanelWidth]);

  useEffect(() => {
    applyAppearanceTheme(appearanceTheme);
    try {
      window.localStorage.setItem(APPEARANCE_THEME_KEY, appearanceTheme);
    } catch {
      // The theme still applies for this session when storage is unavailable.
    }
  }, [appearanceTheme]);

  useEffect(() => {
    if (!appearanceMenuOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!appearanceSettingsRef.current?.contains(event.target as Node)) {
        setAppearanceMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAppearanceMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [appearanceMenuOpen]);

  useEffect(() => {
    const handleResize = () => {
      setAppearancePosition((current) => {
        const next = clampAppearancePosition(current);
        storeAppearancePosition(next);
        return next;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleAppearancePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    appearanceDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: appearancePosition.x,
      originY: appearancePosition.y,
      moved: false,
    };
  }, [appearancePosition]);

  const handleAppearancePointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = appearanceDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 6) return;
    drag.moved = true;
    suppressAppearanceClickRef.current = true;
    setAppearanceDragging(true);
    setAppearanceMenuOpen(false);
    setAppearancePosition(clampAppearancePosition({
      x: drag.originX + deltaX,
      y: drag.originY + deltaY,
    }));
  }, []);

  const finishAppearanceDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = appearanceDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const next = clampAppearancePosition({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
    if (drag.moved) {
      setAppearancePosition(next);
      storeAppearancePosition(next);
    }
    appearanceDragRef.current = null;
    setAppearanceDragging(false);
  }, []);

  const handleAppearanceClick = useCallback(() => {
    if (suppressAppearanceClickRef.current) {
      suppressAppearanceClickRef.current = false;
      return;
    }
    setAppearanceMenuOpen((open) => !open);
  }, []);

  const handleDividerPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (leftPanelCollapsed || window.innerWidth <= 820) return;
    event.preventDefault();
    const divider = event.currentTarget;
    divider.setPointerCapture(event.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = (moveEvent.clientX / window.innerWidth) * 100;
      setLeftPanelWidth(clampLeftPanelWidth(nextWidth));
    };
    const finishResize = (finishEvent: PointerEvent) => {
      divider.removeEventListener('pointermove', handlePointerMove);
      divider.removeEventListener('pointerup', finishResize);
      divider.removeEventListener('pointercancel', finishResize);
      if (divider.hasPointerCapture(finishEvent.pointerId)) {
        divider.releasePointerCapture(finishEvent.pointerId);
      }
      document.body.classList.remove('is-resizing-panels');
    };

    document.body.classList.add('is-resizing-panels');
    divider.addEventListener('pointermove', handlePointerMove);
    divider.addEventListener('pointerup', finishResize);
    divider.addEventListener('pointercancel', finishResize);
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

  const applyConversation = useCallback((conversation: ChatConversation) => {
    activeConversationIdRef.current = conversation.id;
    setActiveConversationId(conversation.id);
    setMessages(conversation.messages ?? []);
    setSteps([]);
    setChatHistoryError('');
  }, []);

  const refreshChatConversationList = useCallback(async () => {
    const result = await window.electronAPI?.listChatConversations();
    if (!result) return null;
    setChatConversations(result.conversations);
    return result;
  }, []);

  const initializeChatHistory = useCallback(async () => {
    try {
      const result = await refreshChatConversationList();
      if (!result) return;
      const conversation = await window.electronAPI?.getChatConversation(result.activeConversationId);
      if (conversation) applyConversation(conversation);
    } catch (error) {
      setChatHistoryError(`历史对话加载失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }, [applyConversation, refreshChatConversationList]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onMessage((msg) => {
        if (msg.conversationId && activeConversationIdRef.current && msg.conversationId !== activeConversationIdRef.current) {
          void refreshChatConversationList();
          return;
        }
        const text = cleanAgentText(msg.text);
        if (!text) return;
        const kind = inferChatMessageKind(text, msg.kind, msg.error);
        const nextMessage: ChatMessage = {
          id: msg.id || crypto.randomUUID(),
          text,
          role: 'agent',
          timestamp: msg.timestamp,
          kind,
          toolName: msg.toolName,
          error: msg.error,
          taskId: msg.taskId,
        };
        setMessages((current) => {
          if (kind !== 'status') return [...current, nextMessage];
          const existingIndex = current.findIndex((entry) => entry.kind === 'status' && entry.taskId === msg.taskId);
          if (existingIndex < 0) return [...current, nextMessage];
          const next = [...current];
          next[existingIndex] = { ...nextMessage, id: current[existingIndex].id };
          return next;
        });
        if (msg.conversationId) {
          setChatConversations((current) => current
            .map((conversation) => conversation.id === msg.conversationId
              ? { ...conversation, preview: text.replace(/\s+/g, ' ').slice(0, 30), updatedAt: new Date(msg.timestamp).toISOString(), messageCount: conversation.messageCount + (kind === 'status' ? 0 : 1) }
              : conversation)
            .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)));
        }
      });

      window.electronAPI.onTaskProgress((result) => {
        setSteps(result.steps);
      });

      window.electronAPI.onTaskComplete(() => {
        void refreshChatConversationList();
      });

      window.electronAPI.onTaskStatus((result) => setTaskStatus(result));
      void window.electronAPI.getTaskStatus().then((result) => setTaskStatus(result));

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
      void initializeChatHistory();
    }
  }, [initializeChatHistory, refreshChatConversationList, refreshWorkbench]);

  const handleSend = useCallback((text: string, mode: TaskSubmitMode = 'auto') => {
    const conversationId = activeConversationIdRef.current;
    if (!conversationId) {
      setChatHistoryError('历史对话尚未加载完成，请稍后再试');
      return;
    }
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      text,
      role: 'user',
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, msg]);
    setChatConversations((current) => current
      .map((conversation) => conversation.id === conversationId
        ? {
          ...conversation,
          title: conversation.title === '新对话' ? text.replace(/\s+/g, ' ').slice(0, 30) : conversation.title,
          preview: text.replace(/\s+/g, ' ').slice(0, 30),
          updatedAt: new Date(msg.timestamp).toISOString(),
          messageCount: conversation.messageCount + 1,
        }
        : conversation)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)));

    setSteps([]);

    void window.electronAPI?.sendMessage(text, mode, conversationId, msg.id, msg.timestamp).then(() => {
      void refreshChatConversationList();
    }).catch((error) => {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        text: `发送失败: ${error instanceof Error ? error.message : String(error)}`,
        role: 'agent',
        timestamp: Date.now(),
        error: true,
      }]);
      setChatHistoryError(error instanceof Error ? error.message : String(error));
    });
  }, [refreshChatConversationList]);

  const handleCreateConversation = useCallback(async () => {
    try {
      const conversation = await window.electronAPI?.createChatConversation();
      if (!conversation) return;
      applyConversation(conversation);
      await refreshChatConversationList();
    } catch (error) {
      setChatHistoryError(error instanceof Error ? error.message : String(error));
    }
  }, [applyConversation, refreshChatConversationList]);

  const handleSelectConversation = useCallback(async (id: string) => {
    if (id === activeConversationIdRef.current) return;
    try {
      const conversation = await window.electronAPI?.activateChatConversation(id);
      if (conversation) applyConversation(conversation);
    } catch (error) {
      setChatHistoryError(error instanceof Error ? error.message : String(error));
    }
  }, [applyConversation]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      const result = await window.electronAPI?.deleteChatConversation(id);
      if (!result) return;
      setChatConversations(result.conversations);
      if (id === activeConversationIdRef.current) {
        const conversation = await window.electronAPI?.getChatConversation(result.activeConversationId);
        if (conversation) applyConversation(conversation);
      }
    } catch (error) {
      setChatHistoryError(error instanceof Error ? error.message : String(error));
    }
  }, [applyConversation]);

  const handleRenameConversation = useCallback(async (id: string, title: string) => {
    try {
      const result = await window.electronAPI?.renameChatConversation(id, title);
      if (result) setChatConversations(result.conversations);
      setChatHistoryError('');
    } catch (error) {
      setChatHistoryError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const handleToggleConversationPinned = useCallback(async (id: string, pinned: boolean) => {
    try {
      const result = await window.electronAPI?.setChatConversationPinned(id, pinned);
      if (result) setChatConversations(result.conversations);
      setChatHistoryError('');
    } catch (error) {
      setChatHistoryError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const handleStopTask = useCallback(() => {
    void window.electronAPI?.stopTask();
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
            <ChatPanel
              messages={messages}
              steps={steps}
              conversations={chatConversations}
              activeConversationId={activeConversationId}
              historyError={chatHistoryError}
              taskStatus={taskStatus}
              onSend={handleSend}
              onStop={handleStopTask}
              onCreateConversation={handleCreateConversation}
              onSelectConversation={handleSelectConversation}
              onDeleteConversation={handleDeleteConversation}
              onRenameConversation={handleRenameConversation}
              onToggleConversationPinned={handleToggleConversationPinned}
            />
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
            onOpenWorkbenchItem={handleOpenWorkbenchItem}
          />
        </div>
      </div>
      <div
        className={`appearance-settings${appearanceDragging ? ' is-dragging' : ''}${appearancePosition.x < 282 ? ' opens-right' : ''}${appearancePosition.y < 244 ? ' opens-down' : ''}`}
        ref={appearanceSettingsRef}
        style={{ left: appearancePosition.x, top: appearancePosition.y }}
      >
        {appearanceMenuOpen ? (
          <div className="appearance-popover" role="dialog" aria-label="外观设置">
            <div className="appearance-popover-heading">
              <strong>外观</strong>
              <span>选择界面主题</span>
            </div>
            <div className="appearance-theme-options" role="radiogroup" aria-label="界面主题">
              {(['dark', 'light'] as AppearanceTheme[]).map((theme) => (
                <button
                  className={`appearance-theme-option${appearanceTheme === theme ? ' is-selected' : ''}`}
                  type="button"
                  role="radio"
                  aria-checked={appearanceTheme === theme}
                  key={theme}
                  onClick={() => setAppearanceTheme(theme)}
                >
                  <span className={`appearance-theme-preview appearance-theme-preview--${theme}`} aria-hidden="true">
                    <i />
                    <b />
                  </span>
                  <span>{theme === 'dark' ? '深色' : '浅色'}</span>
                  <span className="appearance-theme-check" aria-hidden="true">✓</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <button
          className={`appearance-settings-trigger${appearanceMenuOpen ? ' is-open' : ''}`}
          type="button"
          title="外观设置"
          aria-label="打开外观设置"
          aria-haspopup="dialog"
          aria-expanded={appearanceMenuOpen}
          onPointerDown={handleAppearancePointerDown}
          onPointerMove={handleAppearancePointerMove}
          onPointerUp={finishAppearanceDrag}
          onPointerCancel={finishAppearanceDrag}
          onClick={handleAppearanceClick}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M10 14v6" />
            <circle cx="14" cy="7" r="2" />
            <circle cx="10" cy="17" r="2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
