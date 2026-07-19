import fs from 'node:fs';
import path from 'node:path';
import { ipcMain, BrowserWindow, dialog } from 'electron';
import { getOrchestrator } from './worker';
import type { TaskSubmitMode } from './worker/orchestrator';
import { activateTab, closeTab, listTabs, openTabUrl, setBrowserTabsEmitter, setBrowserViewBoundsFromRenderer } from './browser-view';
import { listBrowserRecordingSummaries, listBrowserRecordings, replayBrowserRecording, replayLatestBrowserRecording, startBrowserRecording, stopBrowserRecording } from './browser-recorder';
import { createWorkbenchEntry, deleteWorkbenchEntry, getWorkbenchOverview, importWorkbenchFolder, listWorkbenchDirectory, openWorkbenchItem, readWorkbenchFile, removeImportedWorkbenchFolder, renameWorkbenchEntry, writeWorkbenchFile } from './workbench';
import {
  isSerialMonitorRunning,
  clearHardboardRuntimeHistory,
  listHardboardDevices,
  readHardboardRuntimeEvents,
  readHardboardSourceFile,
  startHardboardBuild,
  startHardboardFlash,
  startSerialMonitor,
  stopSerialMonitor,
} from './hardboard';

export function startGateway(mainWindow: BrowserWindow): void {
  // Gateway 提供 pushUI 能力 — Worker 通过它推消息到 UI
  const pushUI = (channel: string, data: unknown) => {
    mainWindow.webContents.send(channel, data);
  };

  setBrowserTabsEmitter((tabs) => {
    mainWindow.webContents.send('browser:tabs', { tabs });
  });

  const orch = getOrchestrator(mainWindow, pushUI);

  // 聊天 — 委托 Worker
  ipcMain.handle('chat:send', async (_event, text: string, mode?: TaskSubmitMode) => {
    return orch.submitTask(text, mode || 'auto');
  });

  ipcMain.handle('task:status', async () => orch.getTaskStatus());

  // 任务控制 — 委托 Worker
  ipcMain.handle('task:pause', async () => {
    orch.pause();
    return { ok: true };
  });

  ipcMain.handle('task:resume', async () => {
    orch.resume();
    return { ok: true };
  });

  ipcMain.handle('task:stop', async () => {
    orch.stop();
    return { ok: true };
  });

  // 浏览器控制 — 委托 Worker
  ipcMain.handle('browser:navigate', async (_event, url: string) => {
    orch.navigateBrowser(url);
    return { ok: true };
  });

  ipcMain.handle('browser:getState', async () => {
    return orch.getBrowserState();
  });

  ipcMain.handle('browser:setBounds', async (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    setBrowserViewBoundsFromRenderer(bounds);
    return { ok: true };
  });

  ipcMain.handle('browser:listTabs', async () => {
    return { tabs: listTabs() };
  });

  ipcMain.handle('workbench:getOverview', async () => {
    return getWorkbenchOverview();
  });

  ipcMain.handle('workbench:importFolder', async () => {
    const picked = await dialog.showOpenDialog(mainWindow, {
      title: '导入文件夹到仓库',
      properties: ['openDirectory'],
    });
    if (picked.canceled || !picked.filePaths[0]) {
      return { ok: false, canceled: true, overview: getWorkbenchOverview() };
    }
    try {
      return { ok: true, overview: importWorkbenchFolder(picked.filePaths[0]) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message, overview: getWorkbenchOverview() };
    }
  });

  ipcMain.handle('workbench:removeImportedFolder', async (_event, folderPath: string) => {
    try {
      return { ok: true, overview: removeImportedWorkbenchFolder(folderPath) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message, overview: getWorkbenchOverview() };
    }
  });

  ipcMain.handle('workbench:openItem', async (_event, targetPath: string) => {
    try {
      const result = openWorkbenchItem(targetPath);
      openTabUrl(result.url, true);
      return { ok: true, ...result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('workbench:readFile', async (_event, targetPath: string) => {
    return readWorkbenchFile(targetPath);
  });

  ipcMain.handle('workbench:listDirectory', async (_event, targetPath: string) => {
    return listWorkbenchDirectory(targetPath);
  });

  ipcMain.handle('workbench:writeFile', async (_event, targetPath: string, text: string) => {
    return writeWorkbenchFile(targetPath, text);
  });

  ipcMain.handle('workbench:createEntry', async (_event, parentPath: string, name: string, kind: 'file' | 'dir') => {
    return createWorkbenchEntry(parentPath, name, kind);
  });

  ipcMain.handle('workbench:renameEntry', async (_event, targetPath: string, nextName: string) => {
    return renameWorkbenchEntry(targetPath, nextName);
  });

  ipcMain.handle('workbench:deleteEntry', async (_event, targetPath: string) => {
    return deleteWorkbenchEntry(targetPath);
  });

  ipcMain.handle('smoke:workbench:finish', async (_event, result: unknown) => {
    const resultFile = process.env.VIBEIDE_SMOKE_RESULT_FILE;
    if (resultFile) {
      fs.mkdirSync(path.dirname(resultFile), { recursive: true });
      fs.writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf-8');
    }
    setTimeout(() => {
      mainWindow.close();
    }, 250);
    return { ok: true };
  });

  ipcMain.handle('browser:activateTab', async (_event, id: string) => {
    activateTab(id);
    return { ok: true };
  });

  ipcMain.handle('browser:closeTab', async (_event, id: string) => {
    closeTab(id);
    return { ok: true };
  });

  ipcMain.handle('browser:startRecording', async () => {
    await startBrowserRecording();
    return { ok: true };
  });

  ipcMain.handle('browser:stopRecording', async (_event, label?: string) => {
    const result = await stopBrowserRecording(label || 'browser-recording');
    return { ok: true, ...result };
  });

  ipcMain.handle('browser:replayLatestRecording', async () => {
    try {
      const result = await replayLatestBrowserRecording();
      return { ok: true, ...result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('browser:replayRecording', async (_event, target?: string) => {
    try {
      const result = await replayBrowserRecording(target);
      return { ok: true, ...result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('browser:listRecordings', async () => {
    return { files: await listBrowserRecordings() };
  });

  ipcMain.handle('browser:listRecordingSummaries', async () => {
    return { recordings: await listBrowserRecordingSummaries() };
  });

  ipcMain.handle('hardboard:listDevices', async () => {
    return { devices: await listHardboardDevices() };
  });

  ipcMain.handle('hardboard:runtimeEvents', async (_event, sinceSeq?: number) => {
    return readHardboardRuntimeEvents(typeof sinceSeq === 'number' ? sinceSeq : 0);
  });

  ipcMain.handle('hardboard:runtimeHistoryClear', async () => {
    return clearHardboardRuntimeHistory();
  });

  ipcMain.handle('hardboard:buildStart', async (_event, options?: { projectDir?: string; cmakeFile?: string; configFile?: string; sourceFile?: string }) => {
    return startHardboardBuild(options);
  });

  ipcMain.handle('hardboard:flashStart', async (_event, options: { projectDir?: string; port: string; artifactFile?: string; configFile?: string }) => {
    return startHardboardFlash(options);
  });

  ipcMain.handle('hardboard:readSource', async (_event, targetPath: string) => {
    return readHardboardSourceFile(targetPath);
  });

  ipcMain.handle('hardboard:serialStart', async (_event, options: { port: string; baudRate: number; encoding: string }) => {
    const result = startSerialMonitor(options, (chunk) => {
      mainWindow.webContents.send('hardboard:serial-data', chunk);
    }, (exit) => {
      mainWindow.webContents.send('hardboard:serial-exit', exit);
    });
    return { ...result, running: isSerialMonitorRunning() };
  });

  ipcMain.handle('hardboard:serialStop', async () => {
    stopSerialMonitor();
    return { ok: true, running: false };
  });

  ipcMain.handle('hardboard:serialStatus', async () => {
    return { running: isSerialMonitorRunning() };
  });
}
