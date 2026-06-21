export interface ChatMessage {
  id: string;
  text: string;
  role: 'user' | 'agent';
  timestamp: number;
  error?: boolean;
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
}

export interface WorkbenchSection {
  id: string;
  title: string;
  description: string;
  folderPath: string;
  items: WorkbenchItem[];
  emptyText: string;
}

export interface WorkbenchOverview {
  generatedAt: number;
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

export interface WindowAPI {
  sendMessage: (text: string) => Promise<{ ok: boolean }>;
  onMessage: (cb: (msg: { text: string; timestamp: number; error?: boolean }) => void) => void;
  onTaskComplete: (cb: (result: { code: number | null }) => void) => void;
  onTaskProgress: (cb: (result: { steps: TaskStep[] }) => void) => void;
  pauseTask: () => Promise<{ ok: boolean }>;
  resumeTask: () => Promise<{ ok: boolean }>;
  stopTask: () => Promise<{ ok: boolean }>;
  navigateBrowser: (url: string) => Promise<{ ok: boolean }>;
  getBrowserState: () => Promise<BrowserState>;
  setBrowserBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<{ ok: boolean }>;
  listBrowserTabs: () => Promise<{ tabs: BrowserTab[] }>;
  getWorkbenchOverview: () => Promise<WorkbenchOverview>;
  openWorkbenchItem: (targetPath: string) => Promise<{ ok: boolean; kind?: 'file' | 'dir'; path?: string; url?: string; error?: string }>;
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
  onBrowserTabs: (cb: (result: { tabs: BrowserTab[] }) => void) => void;
}

declare global {
  interface Window {
    electronAPI: WindowAPI;
  }
}
