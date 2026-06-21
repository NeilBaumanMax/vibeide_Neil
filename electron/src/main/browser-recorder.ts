import fs from 'fs';
import path from 'path';
import type { BrowserSurface } from './browser-view';
import { getBrowserView } from './browser-view';
import { getRecordingsDir } from './paths';

export interface BrowserRecordingEvent {
  type: 'click' | 'input' | 'change' | 'submit';
  selector: string;
  text?: string;
  value?: string;
  url: string;
  title: string;
  timestamp: string;
}

export interface BrowserRecordingSummary {
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

interface BrowserRecordingPayload {
  label?: string;
  startUrl?: string;
  startTitle?: string;
  actionCount?: number;
  events?: BrowserRecordingEvent[];
  createdAt?: string;
}

const RECORDINGS_DIR = getRecordingsDir();

const RECORDER_SCRIPT = String.raw`
(() => {
  if (window.__vibeideRecorderInstalled) {
    window.__vibeideRecordedEvents = [];
    return;
  }

  window.__vibeideRecorderInstalled = true;
  window.__vibeideRecordedEvents = [];

  function shortText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
  }

  function cssPath(el) {
    if (!(el instanceof Element)) return "";
    if (el.id) return "#" + el.id;

    const stableAttrs = ["data-testid", "data-test", "data-e2e", "name", "aria-label", "placeholder"];
    for (const attr of stableAttrs) {
      const val = el.getAttribute(attr);
      if (val) return el.tagName.toLowerCase() + "[" + attr + "=\"" + val.replace(/"/g, '\\"') + "\"]";
    }

    const parts = [];
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 6) {
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => child.tagName === node.tagName);
        if (siblings.length > 1) {
          part += ":nth-of-type(" + (siblings.indexOf(node) + 1) + ")";
        }
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(" > ");
  }

  function record(type, payload) {
    window.__vibeideRecordedEvents.push({
      type,
      url: location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      ...payload,
    });
  }

  document.addEventListener("click", (event) => {
    const el = event.target instanceof Element ? event.target.closest("button, a, input, textarea, [role='button'], [data-testid], td, th, div, span") : null;
    if (!el) return;
    record("click", {
      selector: cssPath(el),
      text: shortText(el.innerText || el.getAttribute("value") || el.getAttribute("aria-label") || ""),
    });
  }, true);

  document.addEventListener("input", (event) => {
    const el = event.target instanceof Element ? event.target : null;
    if (!el || !("value" in el)) return;
    record("input", {
      selector: cssPath(el),
      value: String(el.value).slice(0, 300),
    });
  }, true);

  document.addEventListener("change", (event) => {
    const el = event.target instanceof Element ? event.target : null;
    if (!el) return;
    const value = "value" in el ? String(el.value).slice(0, 300) : shortText(el.textContent || "");
    record("change", {
      selector: cssPath(el),
      value,
    });
  }, true);

  document.addEventListener("submit", (event) => {
    const el = event.target instanceof Element ? event.target : null;
    if (!el) return;
    record("submit", {
      selector: cssPath(el),
    });
  }, true);
})();
`;

function ensureRecordingsDir(): void {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

function getActiveView(): BrowserSurface {
  const view = getBrowserView();
  if (!view) throw new Error('当前没有可用浏览器页');
  return view;
}

function buildFilePath(label?: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeLabel = sanitizeRecordingLabel(label);
  return path.join(RECORDINGS_DIR, `${ts}-${safeLabel}.json`);
}

function sanitizeRecordingLabel(label?: string): string {
  return (label ?? 'browser-recording').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'browser-recording';
}

function labelFromFileName(fileName: string): string {
  return fileName
    .replace(/\.json$/i, '')
    .replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-/, '');
}

function readRecordingPayload(file: string): BrowserRecordingPayload {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as BrowserRecordingPayload;
}

export async function startBrowserRecording(): Promise<void> {
  const view = getActiveView();
  await view.webContents.executeJavaScript(RECORDER_SCRIPT);
}

export async function stopBrowserRecording(label?: string): Promise<{ file: string; actionCount: number }> {
  const view = getActiveView();
  const startUrl = view.webContents.getURL();
  const events = await view.webContents.executeJavaScript('window.__vibeideRecordedEvents || []') as BrowserRecordingEvent[];
  const startTitle = events[0]?.title ?? view.webContents.getTitle();

  ensureRecordingsDir();
  const file = buildFilePath(label);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        label: sanitizeRecordingLabel(label),
        startUrl,
        startTitle,
        actionCount: events.length,
        events,
      },
      null,
      2
    ),
    'utf-8'
  );

  return { file, actionCount: events.length };
}

export async function replayLatestBrowserRecording(): Promise<{ file: string; actionCount: number }> {
  return replayBrowserRecording();
}

export async function replayBrowserRecording(target?: string): Promise<{ file: string; actionCount: number }> {
  ensureRecordingsDir();
  const files = fs.readdirSync(RECORDINGS_DIR).filter((name) => name.endsWith('.json')).sort().reverse();
  if (files.length === 0) throw new Error('暂无录制文件');

  const fileName = resolveRecordingFileName(files, target);
  const file = path.join(RECORDINGS_DIR, fileName);
  const payload = readRecordingPayload(file);
  const events = payload.events ?? [];
  const view = getActiveView();

  if (payload.startUrl && /^https?:|^file:/i.test(payload.startUrl)) {
    await view.webContents.loadURL(payload.startUrl);
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  for (const event of events) {
    if (event.type === 'click') {
      await view.webContents.executeJavaScript(
        `(() => {
          const el = document.querySelector(${JSON.stringify(event.selector)});
          if (!el) return false;
          el.click();
          return true;
        })()`
      );
    } else if (event.type === 'input' || event.type === 'change') {
      await view.webContents.executeJavaScript(
        `(() => {
          const el = document.querySelector(${JSON.stringify(event.selector)});
          if (!el || !('value' in el)) return false;
          el.focus();
          el.value = ${JSON.stringify(event.value ?? '')};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()`
      );
    } else if (event.type === 'submit') {
      await view.webContents.executeJavaScript(
        `(() => {
          const el = document.querySelector(${JSON.stringify(event.selector)});
          if (!el) return false;
          if (typeof el.requestSubmit === 'function') {
            el.requestSubmit();
          } else if (typeof el.submit === 'function') {
            el.submit();
          }
          return true;
        })()`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return { file, actionCount: events.length };
}

function resolveRecordingFileName(files: string[], target?: string): string {
  const cleaned = target?.trim();
  if (!cleaned) return files[0];

  const base = path.basename(cleaned);
  if (files.includes(base)) return base;

  const safe = sanitizeRecordingLabel(cleaned);
  const matched = files.find((name) => name.includes(safe) || labelFromFileName(name).includes(safe));
  if (!matched) throw new Error(`未找到录制: ${target}`);
  return matched;
}

export async function listBrowserRecordings(): Promise<string[]> {
  ensureRecordingsDir();
  return fs.readdirSync(RECORDINGS_DIR).filter((name) => name.endsWith('.json')).sort().reverse();
}

export async function listBrowserRecordingSummaries(): Promise<BrowserRecordingSummary[]> {
  ensureRecordingsDir();
  return listBrowserRecordings().then((files) => files.map((name) => {
    const filePath = path.join(RECORDINGS_DIR, name);
    const stats = fs.statSync(filePath);
    try {
      const payload = readRecordingPayload(filePath);
      const events = payload.events ?? [];
      return {
        file: name,
        name,
        label: labelFromFileName(name),
        path: filePath,
        createdAt: payload.createdAt ?? null,
        actionCount: typeof payload.actionCount === 'number' ? payload.actionCount : events.length,
        startUrl: payload.startUrl ?? '',
        startTitle: payload.startTitle ?? events[0]?.title ?? '',
        size: stats.size,
        updatedAt: Math.round(stats.mtimeMs),
      };
    } catch {
      return {
        file: name,
        name,
        label: labelFromFileName(name),
        path: filePath,
        createdAt: null,
        actionCount: null,
        startUrl: '',
        startTitle: '',
        size: stats.size,
        updatedAt: Math.round(stats.mtimeMs),
      };
    }
  }));
}
