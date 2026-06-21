import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { ensureRuntimeState } from './paths.js';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

const CDP_READY_TIMEOUT = 10000;

async function tryConnectCDP(cdpPort: number): Promise<Browser | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CDP_READY_TIMEOUT);
    const resp = await fetch(`http://127.0.0.1:${cdpPort}/json/version`, { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.ok) return await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
  } catch { /* CDP 不可用 */ }
  return null;
}

function getCdpPort(): number {
  const env = parseInt(process.env.CDP_PORT || '', 10);
  return env > 0 ? env : 9230;
}

function isSystemPage(url: string): boolean {
  return (
    url.startsWith('devtools://') ||
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('http://localhost:5173') ||
    url.startsWith('http://127.0.0.1:5173') ||
    url.includes('renderer/index.html') ||
    url === 'about:blank'
  );
}

/** Find the BrowserView page — the one the user actually sees */
function findBrowserViewPage(pages: Page[]): Page | null {
  // Priority 1: a page with a real URL (not system, not blank)
  const active = pages.find(p => !isSystemPage(p.url()));
  if (active) return active;

  // Priority 2: about:blank (BrowserView initial state)
  const blank = pages.find(p => p.url() === 'about:blank');
  if (blank) return blank;

  // Priority 3: first non-renderer, non-devtools page
  const fallback = pages.find(p =>
    !p.url().includes('renderer/index.html') &&
    !p.url().startsWith('devtools://')
  );
  if (fallback) return fallback;

  // Last resort: first page
  return pages[0] || null;
}

export async function connectBrowser(cdpPort?: number): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const port = cdpPort ?? getCdpPort();
  ensureRuntimeState(port);

  // Reconnect if disconnected
  if (!browser?.isConnected()) {
    browser = null;
    context = null;
    page = null;
  }

  if (browser && context && page) {
    // Verify page is still alive
    try {
      const currentUrl = page.url();
      if (!isSystemPage(currentUrl)) {
        return { browser, context, page };
      }
      page = null;
    } catch {
      // Page is stale — re-select from context
      page = null;
    }
  }

  browser = await tryConnectCDP(port);

  if (!browser) {
    throw new Error(`无法连接 CDP :${port}，Electron 是否已启动？(CDP_PORT=${process.env.CDP_PORT || '未设置'})`);
  }

  const contexts = browser.contexts();
  if (contexts.length > 0) {
    context = contexts[0];
  } else {
    context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  }

  const pages = context.pages();
  page = findBrowserViewPage(pages);

  if (!page) {
    page = await context.newPage();
  }

  console.error(`[vibeide] CDP 已连接 :${port}，活跃页面: ${page.url()}`);

  return { browser, context, page };
}

export async function closeBrowser(): Promise<void> {
  if (page) { page = null; }
  if (context) {
    try { await context.close(); } catch { /* already closed */ }
    context = null;
  }
  if (browser) {
    try { await browser.close(); } catch { /* already closed */ }
    browser = null;
  }
}

export async function getBrowserState(): Promise<{ url: string; title: string }> {
  if (!page) throw new Error('Browser not connected');
  return {
    url: page.url() || '',
    title: await page.title(),
  };
}

export function getPage(): Page {
  if (!page) throw new Error('Browser not connected. Call connectBrowser() first.');
  return page;
}

export function getContext(): BrowserContext {
  if (!context) throw new Error('Browser not connected. Call connectBrowser() first.');
  return context;
}
