import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (text: string, mode?: 'auto' | 'guide' | 'queue') => ipcRenderer.invoke('chat:send', text, mode),
  onMessage: (cb: (msg: { text: string; timestamp: number; error?: boolean; taskId?: string | null }) => void) => {
    ipcRenderer.on('chat:message', (_event, msg) => cb(msg));
  },
  onTaskComplete: (cb: (result: { code: number | null; taskId?: string | null }) => void) => {
    ipcRenderer.on('task:complete', (_event, result) => cb(result));
  },
  onTaskProgress: (cb: (result: { steps: Array<{ id: string; label: string; done: boolean }>; taskId?: string | null }) => void) => {
    ipcRenderer.on('task:progress', (_event, result) => cb(result));
  },
  onTaskStatus: (cb: (result: { busy: boolean; paused: boolean; activeTaskId: string | null; activeTask: string | null; queueLength: number; guidanceCount: number }) => void) => {
    ipcRenderer.on('task:status', (_event, result) => cb(result));
  },
  getTaskStatus: () => ipcRenderer.invoke('task:status'),
  pauseTask: () => ipcRenderer.invoke('task:pause'),
  resumeTask: () => ipcRenderer.invoke('task:resume'),
  stopTask: () => ipcRenderer.invoke('task:stop'),
  navigateBrowser: (url: string) => ipcRenderer.invoke('browser:navigate', url),
  getBrowserState: () => ipcRenderer.invoke('browser:getState'),
  setBrowserBounds: (bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke('browser:setBounds', bounds),
  listBrowserTabs: () => ipcRenderer.invoke('browser:listTabs'),
  getWorkbenchOverview: () => ipcRenderer.invoke('workbench:getOverview'),
  importWorkbenchFolder: () => ipcRenderer.invoke('workbench:importFolder'),
  removeImportedWorkbenchFolder: (folderPath: string) => ipcRenderer.invoke('workbench:removeImportedFolder', folderPath),
  openWorkbenchItem: (targetPath: string) => ipcRenderer.invoke('workbench:openItem', targetPath),
  readWorkbenchFile: (targetPath: string) => ipcRenderer.invoke('workbench:readFile', targetPath),
  listWorkbenchDirectory: (targetPath: string) => ipcRenderer.invoke('workbench:listDirectory', targetPath),
  writeWorkbenchFile: (targetPath: string, text: string) => ipcRenderer.invoke('workbench:writeFile', targetPath, text),
  createWorkbenchEntry: (parentPath: string, name: string, kind: 'file' | 'dir') => ipcRenderer.invoke('workbench:createEntry', parentPath, name, kind),
  renameWorkbenchEntry: (targetPath: string, nextName: string) => ipcRenderer.invoke('workbench:renameEntry', targetPath, nextName),
  deleteWorkbenchEntry: (targetPath: string) => ipcRenderer.invoke('workbench:deleteEntry', targetPath),
  isWorkbenchSmokeTest: process.env.VIBEIDE_SMOKE_WORKBENCH_OPEN === '1',
  finishWorkbenchSmokeTest: (result: unknown) => ipcRenderer.invoke('smoke:workbench:finish', result),
  activateBrowserTab: (id: string) => ipcRenderer.invoke('browser:activateTab', id),
  closeBrowserTab: (id: string) => ipcRenderer.invoke('browser:closeTab', id),
  startBrowserRecording: () => ipcRenderer.invoke('browser:startRecording'),
  stopBrowserRecording: (label?: string) => ipcRenderer.invoke('browser:stopRecording', label),
  replayLatestBrowserRecording: () => ipcRenderer.invoke('browser:replayLatestRecording'),
  replayBrowserRecording: (target?: string) => ipcRenderer.invoke('browser:replayRecording', target),
  listBrowserRecordings: () => ipcRenderer.invoke('browser:listRecordings'),
  listBrowserRecordingSummaries: () => ipcRenderer.invoke('browser:listRecordingSummaries'),
  listHardboardDevices: () => ipcRenderer.invoke('hardboard:listDevices'),
  getHardboardRuntimeEvents: (sinceSeq?: number) => ipcRenderer.invoke('hardboard:runtimeEvents', sinceSeq),
  clearHardboardRuntimeHistory: () => ipcRenderer.invoke('hardboard:runtimeHistoryClear'),
  startHardboardBuild: (options?: { projectDir?: string; cmakeFile?: string; configFile?: string; sourceFile?: string }) => ipcRenderer.invoke('hardboard:buildStart', options),
  startHardboardFlash: (options: { projectDir?: string; port: string; artifactFile?: string; configFile?: string }) => ipcRenderer.invoke('hardboard:flashStart', options),
  readHardboardSourceFile: (targetPath: string) => ipcRenderer.invoke('hardboard:readSource', targetPath),
  startSerialMonitor: (options: { port: string; baudRate: number; encoding: string }) => ipcRenderer.invoke('hardboard:serialStart', options),
  stopSerialMonitor: () => ipcRenderer.invoke('hardboard:serialStop'),
  getSerialMonitorStatus: () => ipcRenderer.invoke('hardboard:serialStatus'),
  onSerialData: (cb: (chunk: { text: string; timestamp: number }) => void) => {
    ipcRenderer.on('hardboard:serial-data', (_event, chunk) => cb(chunk));
  },
  onSerialExit: (cb: (result: { code: number | null; signal: string | null }) => void) => {
    ipcRenderer.on('hardboard:serial-exit', (_event, result) => cb(result));
  },
  onBrowserTabs: (cb: (result: { tabs: Array<{ id: string; title: string; url: string; active: boolean }> }) => void) => {
    ipcRenderer.on('browser:tabs', (_event, result) => cb(result));
  },
});
