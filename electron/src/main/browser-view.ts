import { BrowserWindow, Rectangle, View, WebContentsView, session } from 'electron';
import { logger } from './worker/logger';

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  active: boolean;
}

export type BrowserSurface = WebContentsView;

interface BrowserTabEntry {
  id: string;
  view: BrowserSurface;
}

let mainWindow: BrowserWindow | null = null;
let browserHost: View | null = null;
let attachedView: BrowserSurface | null = null;
let tabsEmitter: ((tabs: BrowserTab[]) => void) | null = null;
let tabs: BrowserTabEntry[] = [];
let activeTabId: string | null = null;
let tabSeq = 0;
const BROWSER_PARTITION = 'persist:vibeide-browser';
const MIN_BROWSER_WIDTH = 0;
const MIN_BROWSER_HEIGHT = 0;
let rendererBounds: Rectangle | null = null;

export function setupBrowserView(win: BrowserWindow): BrowserSurface {
  mainWindow = win;

  if (!browserHost) {
    browserHost = new View();
  }

  if (!mainWindow.contentView.children.includes(browserHost)) {
    mainWindow.contentView.addChildView(browserHost);
  }

  if (tabs.length === 0) {
    const firstTab = createTabEntry('about:blank');
    tabs.push(firstTab);
    activeTabId = firstTab.id;
  }

  attachActiveTab();
  setBrowserViewBounds();
  emitTabs();

  const active = getActiveTabEntry();
  if (!active) {
    throw new Error('Failed to initialize browser surface');
  }
  return active.view;
}

export function setBrowserTabsEmitter(cb: (tabs: BrowserTab[]) => void): void {
  tabsEmitter = cb;
  emitTabs();
}

export function updateBrowserViewBounds(): void {
  setBrowserViewBounds();
}

export function loadURL(url: string): void {
  const active = getActiveTabEntry();
  logger.info('browser:navigate', {
    mode: 'current-tab',
    url,
    tabId: active?.id || '',
    currentUrl: active?.view.webContents.getURL() || '',
  });
  active?.view.webContents.loadURL(url).catch(() => {
    // Ignore aborted transitions when a newer navigation replaces the current one.
  });
}

export function openTabUrl(url: string, activate = true): void {
  const tab = createTabEntry(url);
  tabs.push(tab);
  logger.warn('browser:view-event', {
    event: 'open-tab',
    url,
    tabId: tab.id,
    activate,
  });

  if (activate) {
    activeTabId = tab.id;
    attachActiveTab();
    setBrowserViewBounds();
  }

  emitTabs();
}

export function reload(): void {
  getActiveTabEntry()?.view.webContents.reload();
}

export function goBack(): void {
  const active = getActiveTabEntry();
  if (active?.view.webContents.canGoBack()) {
    active.view.webContents.goBack();
  }
}

export function goForward(): void {
  const active = getActiveTabEntry();
  if (active?.view.webContents.canGoForward()) {
    active.view.webContents.goForward();
  }
}

export function getBrowserView(): BrowserSurface | null {
  return getActiveTabEntry()?.view ?? null;
}

export function setBrowserViewBoundsFromRenderer(_bounds: Rectangle): void {
  rendererBounds = _bounds;
  setBrowserViewBounds();
}

export function listTabs(): BrowserTab[] {
  return tabs
    .filter((tab) => !tab.view.webContents.isDestroyed())
    .map((tab) => ({
      id: tab.id,
      title: tab.view.webContents.getTitle() || '新页面',
      url: tab.view.webContents.getURL() || 'about:blank',
      active: tab.id === activeTabId,
    }));
}

export function activateTab(id: string): void {
  if (!tabs.find((tab) => tab.id === id)) return;
  activeTabId = id;
  attachActiveTab();
  setBrowserViewBounds();
  emitTabs();
}

export function closeTab(id: string): void {
  if (tabs.length <= 1) return;

  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;

  const [tab] = tabs.splice(index, 1);
  if (attachedView === tab.view && browserHost) {
    browserHost.removeChildView(tab.view);
    attachedView = null;
  }

  if (!tab.view.webContents.isDestroyed()) {
    tab.view.webContents.close({ waitForBeforeUnload: false });
  }

  if (activeTabId === id) {
    const fallback = tabs[Math.max(0, index - 1)] ?? tabs[0] ?? null;
    activeTabId = fallback?.id ?? null;
    attachActiveTab();
    setBrowserViewBounds();
  }

  emitTabs();
}

function getActiveTabEntry(): BrowserTabEntry | null {
  if (!activeTabId) return tabs[0] ?? null;
  return tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null;
}

function createTabEntry(initialUrl: string): BrowserTabEntry {
  const id = `tab-${++tabSeq}`;
  const view = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      partition: BROWSER_PARTITION,
    },
  });
  const persistentSession = session.fromPartition(BROWSER_PARTITION);

  persistentSession.cookies.on('changed', (_event, cookie, cause, removed) => {
    logger.info('browser:cookie', {
      tabId: id,
      domain: cookie.domain,
      name: cookie.name,
      cause,
      removed,
    });
  });

  const refresh = () => emitTabs();
  view.webContents.setWindowOpenHandler(({ url }) => {
    logger.warn('browser:window-open', {
      source: 'browser-tab',
      ownerTabId: id,
      ownerUrl: view.webContents.getURL(),
      url,
    });
    if (url) {
      openTabUrl(url, true);
    }
    return { action: 'deny' };
  });

  view.webContents.on('page-title-updated', refresh);
  view.webContents.on('did-navigate', refresh);
  view.webContents.on('did-navigate-in-page', refresh);
  view.webContents.on('did-finish-load', refresh);
  view.webContents.on('did-attach-webview', (_event, webContents) => {
    logger.warn('browser:view-event', {
      event: 'did-attach-webview',
      ownerTabId: id,
      guestId: webContents.id,
      guestUrl: webContents.getURL(),
      ownerUrl: view.webContents.getURL(),
    });
    emitTabs();
  });
  view.webContents.on('did-create-window', (window, details) => {
    logger.warn('browser:window-created', {
      source: 'browser-tab',
      ownerTabId: id,
      ownerUrl: view.webContents.getURL(),
      childTitle: window.getTitle(),
      url: details.url,
      frameName: details.frameName,
      disposition: details.disposition,
      referrer: details.referrer?.url || '',
    });
  });
  view.webContents.on('will-navigate', (details) => {
    logger.info('browser:view-event', {
      event: 'will-navigate',
      ownerTabId: id,
      url: details.url,
      isMainFrame: details.isMainFrame,
    });
  });
  view.webContents.on('did-start-navigation', (details) => {
    logger.info('browser:view-event', {
      event: 'did-start-navigation',
      ownerTabId: id,
      url: details.url,
      isMainFrame: details.isMainFrame,
      isSameDocument: details.isSameDocument,
    });
  });

  view.webContents.loadURL(initialUrl).catch(() => {
    // Ignore aborted transitions during startup or redirects.
  });

  return { id, view };
}

export async function flushBrowserStorage(): Promise<void> {
  const persistentSession = session.fromPartition(BROWSER_PARTITION);
  try {
    persistentSession.flushStorageData();
    await persistentSession.cookies.flushStore();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('browser:storage-flush', { ok: false, message });
    return;
  }

  logger.info('browser:storage-flush', { ok: true, partition: BROWSER_PARTITION });
}

function attachActiveTab(): void {
  if (!browserHost) return;

  const active = getActiveTabEntry();
  if (!active) return;

  if (attachedView && attachedView !== active.view && browserHost.children.includes(attachedView)) {
    browserHost.removeChildView(attachedView);
  }

  if (!browserHost.children.includes(active.view)) {
    browserHost.addChildView(active.view);
  }

  attachedView = active.view;
}

function setBrowserViewBounds(): void {
  if (!mainWindow || !browserHost) return;

  const bounds = mainWindow.getContentBounds();
  const hasRendererBounds = !!rendererBounds && rendererBounds.width > 20 && rendererBounds.height > 20;
  const hostBounds = hasRendererBounds && rendererBounds
    ? {
        x: Math.max(0, rendererBounds.x),
        y: Math.max(0, rendererBounds.y),
        width: Math.max(MIN_BROWSER_WIDTH, rendererBounds.width),
        height: Math.max(MIN_BROWSER_HEIGHT, rendererBounds.height),
      }
    : {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      };

  browserHost.setBounds(hostBounds);

  const active = getActiveTabEntry();
  if (active) {
    active.view.setBounds({
      x: 0,
      y: 0,
      width: hostBounds.width,
      height: hostBounds.height,
    });
  }

  logger.warn('browser:view-event', {
    event: 'set-bounds',
    windowBounds: bounds,
    hostBounds,
    activeTabId: active?.id || '',
  });
}

function emitTabs(): void {
  tabsEmitter?.(listTabs());
}
