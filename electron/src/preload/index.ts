import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (text: string) => ipcRenderer.invoke('chat:send', text),
  onMessage: (cb: (msg: { text: string; timestamp: number; error?: boolean }) => void) => {
    ipcRenderer.on('chat:message', (_event, msg) => cb(msg));
  },
  onTaskComplete: (cb: (result: { code: number | null }) => void) => {
    ipcRenderer.on('task:complete', (_event, result) => cb(result));
  },
  onTaskProgress: (cb: (result: { steps: Array<{ id: string; label: string; done: boolean }> }) => void) => {
    ipcRenderer.on('task:progress', (_event, result) => cb(result));
  },
  pauseTask: () => ipcRenderer.invoke('task:pause'),
  resumeTask: () => ipcRenderer.invoke('task:resume'),
  stopTask: () => ipcRenderer.invoke('task:stop'),
  navigateBrowser: (url: string) => ipcRenderer.invoke('browser:navigate', url),
  getBrowserState: () => ipcRenderer.invoke('browser:getState'),
  setBrowserBounds: (bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke('browser:setBounds', bounds),
  listBrowserTabs: () => ipcRenderer.invoke('browser:listTabs'),
  getWorkbenchOverview: () => ipcRenderer.invoke('workbench:getOverview'),
  openWorkbenchItem: (targetPath: string) => ipcRenderer.invoke('workbench:openItem', targetPath),
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
  onBrowserTabs: (cb: (result: { tabs: Array<{ id: string; title: string; url: string; active: boolean }> }) => void) => {
    ipcRenderer.on('browser:tabs', (_event, result) => cb(result));
  },
});
