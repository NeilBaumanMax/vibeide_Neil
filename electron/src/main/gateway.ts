import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ipcMain, BrowserWindow, shell } from 'electron';
import { getOrchestrator } from './worker';
import type { TaskSubmitMode } from './worker/orchestrator';
import { activateChatConversation, appendChatMessage, createChatConversation, deleteChatConversation, getChatConversation, listChatConversations, renameChatConversation, setChatConversationPinned } from './worker/session-store';
import { activateTab, closeTab, listTabs, openTabUrl, setBrowserTabsEmitter, setBrowserViewBoundsFromRenderer } from './browser-view';
import { listBrowserRecordingSummaries, listBrowserRecordings, replayBrowserRecording, replayLatestBrowserRecording, startBrowserRecording, stopBrowserRecording } from './browser-recorder';
import { createWorkbenchEntry, deleteWorkbenchEntry, getWorkbenchOverview, listWorkbenchDirectory, openWorkbenchItem, readWorkbenchFile, renameWorkbenchEntry, writeWorkbenchFile } from './workbench';
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
  writeSerialMonitor,
} from './hardboard';

export function startGateway(mainWindow: BrowserWindow): void {
  // Gateway 提供 pushUI 能力 — Worker 通过它推消息到 UI
  const pushUI = (channel: string, data: unknown) => {
    if (channel === 'chat:message' && data && typeof data === 'object') {
      const payload = data as {
        id?: string;
        text?: string;
        timestamp?: number;
        kind?: 'conversation' | 'progress' | 'detail' | 'status';
        toolName?: string;
        error?: boolean;
        taskId?: string | null;
      };
      if (typeof payload.text === 'string' && payload.text.trim()) {
        const conversationId = listChatConversations().activeConversationId;
        const message = appendChatMessage(conversationId, {
          id: payload.id || randomUUID(),
          text: payload.text,
          role: 'agent',
          timestamp: payload.timestamp || Date.now(),
          kind: payload.kind,
          toolName: payload.toolName,
          error: payload.error,
          taskId: payload.taskId,
        });
        mainWindow.webContents.send(channel, { ...payload, ...message, conversationId });
        return;
      }
    }
    mainWindow.webContents.send(channel, data);
  };

  setBrowserTabsEmitter((tabs) => {
    mainWindow.webContents.send('browser:tabs', { tabs });
  });

  const orch = getOrchestrator(mainWindow, pushUI);

  // 聊天 — 委托 Worker
  ipcMain.handle('chat:send', async (_event, text: string, mode?: TaskSubmitMode, conversationId?: string, messageId?: string, timestamp?: number) => {
    const store = listChatConversations();
    const targetConversationId = conversationId || store.activeConversationId;
    const status = orch.getTaskStatus();
    if (status.busy && targetConversationId !== store.activeConversationId) {
      throw new Error('Agent 正在工作，完成或停止后才能切换历史对话');
    }
    if (!status.busy && targetConversationId !== store.activeConversationId) activateChatConversation(targetConversationId);
    const message = appendChatMessage(targetConversationId, {
      id: messageId || randomUUID(),
      text,
      role: 'user',
      timestamp: timestamp || Date.now(),
    });
    return { ...orch.submitTask(text, mode || 'auto', targetConversationId), message };
  });

  ipcMain.handle('chat:conversations:list', async () => listChatConversations());

  ipcMain.handle('chat:conversations:get', async (_event, id?: string) => getChatConversation(id));

  ipcMain.handle('chat:conversations:create', async () => {
    if (orch.getTaskStatus().busy) throw new Error('Agent 正在工作，完成或停止后才能新建对话');
    orch.resetAgentConversation();
    return createChatConversation();
  });

  ipcMain.handle('chat:conversations:activate', async (_event, id: string) => {
    if (orch.getTaskStatus().busy) throw new Error('Agent 正在工作，完成或停止后才能切换历史对话');
    orch.resetAgentConversation();
    return activateChatConversation(id);
  });

  ipcMain.handle('chat:conversations:delete', async (_event, id: string) => {
    if (orch.getTaskStatus().busy) throw new Error('Agent 正在工作，完成或停止后才能删除对话');
    orch.resetAgentConversation();
    return deleteChatConversation(id);
  });

  ipcMain.handle('chat:conversations:rename', async (_event, id: string, title: string) => {
    if (orch.getTaskStatus().busy) throw new Error('Agent 正在工作，完成或停止后才能重命名对话');
    return renameChatConversation(id, title);
  });

  ipcMain.handle('chat:conversations:pin', async (_event, id: string, pinned: boolean) => {
    if (orch.getTaskStatus().busy) throw new Error('Agent 正在工作，完成或停止后才能调整置顶');
    return setChatConversationPinned(id, pinned);
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

  ipcMain.handle('workbench:openFolder', async (_event, targetPath: string) => {
    try {
      const result = openWorkbenchItem(targetPath);
      if (result.kind !== 'dir') return { ok: false, error: '只能在资源管理器中打开目录' };
      const error = await shell.openPath(result.path);
      return error ? { ok: false, error } : { ok: true, path: result.path };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
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
    const result = await startSerialMonitor(options, (chunk) => {
      mainWindow.webContents.send('hardboard:serial-data', chunk);
    }, (exit) => {
      mainWindow.webContents.send('hardboard:serial-exit', exit);
    });
    return { ...result, running: isSerialMonitorRunning() };
  });

  ipcMain.handle('hardboard:serialStop', async () => {
    await stopSerialMonitor();
    return { ok: true, running: false };
  });

  ipcMain.handle('hardboard:serialWrite', async (_event, data: string, mode: 'text' | 'hex', encoding: string) => {
    return writeSerialMonitor(data, mode, encoding);
  });

  ipcMain.handle('hardboard:serialStatus', async () => {
    return { running: isSerialMonitorRunning() };
  });
}
