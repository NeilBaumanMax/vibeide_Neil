import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { flushBrowserStorage, openTabUrl, setupBrowserView, updateBrowserViewBounds } from './browser-view';
import { startGateway } from './gateway';
import { logger } from './worker/logger';
import { getChromeProfileDir, getResourcesDir, isDev } from './paths';
import { checkStartupStatus, saveApiKey } from './first-run';
import { killAgent } from './agent';

app.commandLine.appendSwitch('remote-debugging-port', '9230');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-compositing');

// 确保用户数据目录存在
const userDataDir = app.getPath('userData');
fs.mkdirSync(userDataDir, { recursive: true });

// Chrome profile 放在 userData 下
const chromeProfileDir = path.join(userDataDir, 'chrome-profile');
fs.mkdirSync(chromeProfileDir, { recursive: true });

let mainWindow: BrowserWindow | null = null;
let shutdownInFlight: Promise<void> | null = null;

function isShellUrl(url: string): boolean {
  return (
    url.startsWith('http://localhost:5173') ||
    url.startsWith('http://127.0.0.1:5173') ||
    url.includes('/renderer/index.html') ||
    url === 'about:blank'
  );
}

async function shutdownApp(reason: string): Promise<void> {
  if (shutdownInFlight) {
    await shutdownInFlight;
    return;
  }

  shutdownInFlight = (async () => {
    logger.warn('browser:view-event', { event: 'shutdown', reason });
    killAgent();
    await flushBrowserStorage();

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy();
    }

    mainWindow = null;
  })();

  await shutdownInFlight;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1a1b26',
    title: '奥德赛0.4.0.7161',
    icon: path.join(getResourcesDir(), 'electron', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const syncBrowserBounds = () => updateBrowserViewBounds();
  const resyncBrowserBounds = () => {
    syncBrowserBounds();
    [50, 150, 400, 1000].forEach((delay) => {
      setTimeout(syncBrowserBounds, delay);
    });
  };

  mainWindow.on('resize', resyncBrowserBounds);
  mainWindow.on('maximize', resyncBrowserBounds);
  mainWindow.on('unmaximize', resyncBrowserBounds);
  mainWindow.on('enter-full-screen', resyncBrowserBounds);
  mainWindow.on('leave-full-screen', resyncBrowserBounds);

  setupBrowserView(mainWindow);
  startGateway(mainWindow);

  // 首次启动检查
  const startupStatus = checkStartupStatus();
  logger.info('first-run:status', startupStatus as unknown as Record<string, unknown>);

  // 注册 IPC 处理器
  ipcMain.handle('startup:status', () => startupStatus);
  ipcMain.handle('startup:save-apikey', async (_event, key: string) => saveApiKey(key));

  if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === '1') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  mainWindow.webContents.on('did-finish-load', resyncBrowserBounds);
  mainWindow.webContents.on('did-navigate-in-page', resyncBrowserBounds);
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isShellUrl(url)) return;

    event.preventDefault();
    logger.warn('browser:view-event', {
      event: 'shell-navigation-blocked',
      url,
    });
    if (/^https?:|^file:/i.test(url)) {
      openTabUrl(url, true);
      resyncBrowserBounds();
    }
  });
  mainWindow.webContents.on('did-start-navigation', (details) => {
    logger.info('browser:view-event', {
      event: 'shell-did-start-navigation',
      url: details.url,
      isMainFrame: details.isMainFrame,
      isSameDocument: details.isSameDocument,
    });
  });
  mainWindow.webContents.on('page-title-updated', () => {
    logger.warn('browser:view-event', {
      event: 'shell-title-updated',
      shellUrl: mainWindow?.webContents.getURL() || '',
      shellTitle: mainWindow?.webContents.getTitle() || '',
    });
  });
  mainWindow.once('ready-to-show', resyncBrowserBounds);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('web-contents-created', (_event, contents) => {
  logger.warn('browser:webcontents-created', {
    id: contents.id,
    type: contents.getType(),
    url: contents.getURL(),
  });

  contents.setWindowOpenHandler(({ url }) => {
    logger.warn('browser:window-open', {
      source: `webcontents:${contents.getType()}`,
      ownerId: contents.id,
      ownerUrl: contents.getURL(),
      url,
    });
    if (url && /^https?:|^file:/i.test(url)) {
      openTabUrl(url, true);
    }
    return { action: 'deny' };
  });

  contents.on('did-create-window', (window, details) => {
    logger.warn('browser:window-created', {
      source: `webcontents:${contents.getType()}`,
      ownerId: contents.id,
      ownerUrl: contents.getURL(),
      childTitle: window.getTitle(),
      url: details.url,
      frameName: details.frameName,
      disposition: details.disposition,
      referrer: details.referrer?.url || '',
    });
  });
});

app.on('browser-window-created', (_event, window) => {
  logger.warn('browser:window-created', {
    source: 'app',
    id: window.webContents.id,
    title: window.getTitle(),
    url: window.webContents.getURL(),
  });
});

app.on('window-all-closed', () => {
  void shutdownApp('window-all-closed').finally(() => {
    app.quit();
  });
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', (event) => {
  if (!mainWindow) return;
  event.preventDefault();
  void shutdownApp('before-quit').finally(() => {
    app.exit(0);
  });
});

process.on('SIGTERM', () => {
  void shutdownApp('sigterm').finally(() => {
    app.exit(0);
  });
});

process.on('SIGINT', () => {
  void shutdownApp('sigint').finally(() => {
    app.exit(0);
  });
});
