export type ChatMessageKind = 'conversation' | 'progress' | 'detail' | 'status';

export interface ChatMessage {
  id: string;
  text: string;
  role: 'user' | 'agent';
  timestamp: number;
  kind?: ChatMessageKind;
  toolName?: string;
  error?: boolean;
  taskId?: string | null;
}

export interface ChatConversationSummary {
  id: string;
  title: string;
  pinned: boolean;
  preview: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  turnCount: number;
}

export interface ChatConversation {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
  messages: ChatMessage[];
}

export type TaskSubmitMode = 'auto' | 'guide' | 'queue';

export interface TaskSubmitResult {
  ok: boolean;
  disposition: 'started' | 'guided' | 'queued';
  taskId: string;
  activeTaskId: string | null;
  queueLength: number;
  guidanceCount: number;
}

export interface AgentTaskStatus {
  busy: boolean;
  paused: boolean;
  activeTaskId: string | null;
  activeTask: string | null;
  queueLength: number;
  guidanceCount: number;
}

export interface TaskStep {
  id: string;
  label: string;
  done: boolean;
}

export interface BrowserState {
  url: string;
  title: string;
}

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  active: boolean;
}

export interface WorkbenchItem {
  name: string;
  kind: 'file' | 'dir';
  path: string;
  updatedAt: number | null;
  size: number | null;
  label?: string;
  summary?: string;
  detail?: string;
  actionCount?: number | null;
  sourceUrl?: string;
  category?: 'skill' | 'agent' | 'hardware' | 'reference' | 'doc' | 'imported';
}

export interface WorkbenchSection {
  id: string;
  title: string;
  description: string;
  folderPath: string;
  items: WorkbenchItem[];
  emptyText: string;
  removable?: boolean;
}

export interface WorkbenchOverview {
  generatedAt: number;
  hardboardProjects: string[];
  sections: WorkbenchSection[];
}

export interface RecordingSummary {
  file: string;
  name: string;
  label: string;
  path: string;
  createdAt: string | null;
  actionCount: number | null;
  startUrl: string;
  startTitle: string;
  size: number | null;
  updatedAt: number | null;
}

export interface HardboardDevice {
  port: string;
  label: string;
  source: string;
}

export interface HardboardSourceFile {
  path: string;
  name: string;
  relativePath: string;
  kind: 'source' | 'cmake' | 'config' | 'dir' | 'other';
  size: number | null;
  updatedAt: number | null;
}

export interface RuntimeEvent {
  seq: number;
  id: string;
  time: number;
  source: string;
  kind: string;
  taskId?: string;
  pid?: number;
  toolName?: string;
  projectDir?: string;
  message?: string;
  payload?: Record<string, unknown>;
}

export interface HardboardRuntimeState {
  generatedAt: number;
  lastSeq: number;
  lastHeartbeatAt: number | null;
  activeTaskId: string | null;
  activeToolName: string | null;
  activeProjectDir: string | null;
  activePid: number | null;
  phase: 'idle' | 'build' | 'flash' | 'serial' | 'tool' | 'stale';
  status: 'idle' | 'running' | 'completed' | 'failed' | 'stale';
  progress: number | null;
  currentFile: string | null;
  currentPort: string | null;
  files: HardboardSourceFile[];
  recent: RuntimeEvent[];
  lastError: string | null;
}

export interface HardboardRuntimeEventsResult {
  state: HardboardRuntimeState;
  events: RuntimeEvent[];
}

export interface HardboardRuntimeClearResult {
  ok: boolean;
  eventsRemoved?: number;
  logsRemoved?: number;
  state?: HardboardRuntimeState;
  error?: string;
}

export interface HardboardRuntimeLaunchResult {
  ok: boolean;
  pid?: number;
  command?: string;
  args?: string[];
  error?: string;
}

export interface WindowAPI {
  sendMessage: (text: string, mode?: TaskSubmitMode, conversationId?: string, messageId?: string, timestamp?: number) => Promise<TaskSubmitResult & { message?: ChatMessage }>;
  onMessage: (cb: (msg: { id?: string; text: string; timestamp: number; kind?: ChatMessageKind; toolName?: string; error?: boolean; taskId?: string | null; conversationId?: string }) => void) => void;
  listChatConversations: () => Promise<{ activeConversationId: string; conversations: ChatConversationSummary[] }>;
  getChatConversation: (id?: string) => Promise<ChatConversation>;
  createChatConversation: () => Promise<ChatConversation>;
  activateChatConversation: (id: string) => Promise<ChatConversation>;
  deleteChatConversation: (id: string) => Promise<{ activeConversationId: string; conversations: ChatConversationSummary[] }>;
  renameChatConversation: (id: string, title: string) => Promise<{ activeConversationId: string; conversations: ChatConversationSummary[] }>;
  setChatConversationPinned: (id: string, pinned: boolean) => Promise<{ activeConversationId: string; conversations: ChatConversationSummary[] }>;
  onTaskComplete: (cb: (result: { code: number | null; taskId?: string | null }) => void) => void;
  onTaskProgress: (cb: (result: { steps: TaskStep[]; taskId?: string | null }) => void) => void;
  onTaskStatus: (cb: (result: AgentTaskStatus) => void) => void;
  getTaskStatus: () => Promise<AgentTaskStatus>;
  pauseTask: () => Promise<{ ok: boolean }>;
  resumeTask: () => Promise<{ ok: boolean }>;
  stopTask: () => Promise<{ ok: boolean }>;
  navigateBrowser: (url: string) => Promise<{ ok: boolean }>;
  getBrowserState: () => Promise<BrowserState>;
  setBrowserBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<{ ok: boolean }>;
  listBrowserTabs: () => Promise<{ tabs: BrowserTab[] }>;
  getWorkbenchOverview: () => Promise<WorkbenchOverview>;
  openWorkbenchItem: (targetPath: string) => Promise<{ ok: boolean; kind?: 'file' | 'dir'; path?: string; url?: string; error?: string }>;
  openWorkbenchFolder: (targetPath: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  readWorkbenchFile: (targetPath: string) => Promise<{ ok: boolean; path?: string; text?: string; error?: string }>;
  listWorkbenchDirectory: (targetPath: string) => Promise<{ ok: boolean; path?: string; items?: WorkbenchItem[]; error?: string }>;
  writeWorkbenchFile: (targetPath: string, text: string) => Promise<{ ok: boolean; path?: string; text?: string; error?: string }>;
  createWorkbenchEntry: (parentPath: string, name: string, kind: 'file' | 'dir') => Promise<{ ok: boolean; path?: string; kind?: 'file' | 'dir'; error?: string }>;
  renameWorkbenchEntry: (targetPath: string, nextName: string) => Promise<{ ok: boolean; path?: string; oldPath?: string; kind?: 'file' | 'dir'; error?: string }>;
  deleteWorkbenchEntry: (targetPath: string) => Promise<{ ok: boolean; path?: string; kind?: 'file' | 'dir'; error?: string }>;
  isWorkbenchSmokeTest?: boolean;
  finishWorkbenchSmokeTest?: (result: unknown) => Promise<{ ok: boolean }>;
  activateBrowserTab: (id: string) => Promise<{ ok: boolean }>;
  closeBrowserTab: (id: string) => Promise<{ ok: boolean }>;
  startBrowserRecording: () => Promise<{ ok: boolean }>;
  stopBrowserRecording: (label?: string) => Promise<{ ok: boolean; file: string; actionCount: number }>;
  replayLatestBrowserRecording: () => Promise<{ ok: boolean; file?: string; actionCount?: number; error?: string }>;
  replayBrowserRecording: (target?: string) => Promise<{ ok: boolean; file?: string; actionCount?: number; error?: string }>;
  listBrowserRecordings: () => Promise<{ files: string[] }>;
  listBrowserRecordingSummaries: () => Promise<{ recordings: RecordingSummary[] }>;
  listHardboardDevices: () => Promise<{ devices: HardboardDevice[] }>;
  getHardboardRuntimeEvents: (sinceSeq?: number) => Promise<HardboardRuntimeEventsResult>;
  clearHardboardRuntimeHistory: () => Promise<HardboardRuntimeClearResult>;
  startHardboardBuild: (options?: { projectDir?: string; cmakeFile?: string; configFile?: string; sourceFile?: string }) => Promise<HardboardRuntimeLaunchResult>;
  startHardboardFlash: (options: { projectDir?: string; port: string; artifactFile?: string; configFile?: string }) => Promise<HardboardRuntimeLaunchResult>;
  readHardboardSourceFile: (targetPath: string) => Promise<{ ok: boolean; path?: string; text?: string; error?: string }>;
  startSerialMonitor: (options: { port: string; baudRate: number; encoding: string; dataBits?: number; stopBits?: number; parity?: 'none' | 'odd' | 'even' }) => Promise<{ ok: boolean; running: boolean; error?: string }>;
  stopSerialMonitor: () => Promise<{ ok: boolean; running: boolean }>;
  writeSerialMonitor: (data: string, mode: 'text' | 'hex', encoding: string) => Promise<{ ok: boolean; error?: string }>;
  getSerialMonitorStatus: () => Promise<{ running: boolean }>;
  onSerialData: (cb: (chunk: { text: string; hex?: string; timestamp: number; stream: 'stdout' | 'stderr' }) => void) => void;
  onSerialExit: (cb: (result: { code: number | null; signal: string | null }) => void) => void;
  onBrowserTabs: (cb: (result: { tabs: BrowserTab[] }) => void) => void;
}

declare global {
  interface Window {
    electronAPI: WindowAPI;
  }
}
