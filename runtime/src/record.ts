import { getContext, getPage } from './browser';
import type { PageAction } from './types';

const RECORDER_SCRIPT = `
(() => {
  if ((window).__vibeideRecorderInstalled) return;
  (window).__vibeideRecorderInstalled = true;

  function shortText(value) {
    return String(value || "").replace(/\\s+/g, " ").trim().slice(0, 120);
  }

  function cssPath(el) {
    if (!(el instanceof Element)) return "";
    if (el.id) return "#" + el.id;

    const stableAttrs = ["data-testid", "data-test", "data-e2e", "name", "aria-label", "placeholder"];
    for (const attr of stableAttrs) {
      const val = el.getAttribute(attr);
      if (val) return el.tagName.toLowerCase() + "[" + attr + "=\\"" + val.replace(/"/g, '\\\\"') + "\\"]";
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

  function emit(type, payload) {
    if (typeof (window).__vibeideRecordEvent !== "function") return;
    (window).__vibeideRecordEvent({
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
    emit("click", {
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      text: shortText(el.innerText || el.getAttribute("value") || el.getAttribute("aria-label") || ""),
    });
  }, true);

  document.addEventListener("change", (event) => {
    const el = event.target instanceof Element ? event.target : null;
    if (!el) return;
    const value = "value" in el ? String(el.value).slice(0, 300) : shortText(el.textContent || "");
    emit("change", {
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      inputType: el.getAttribute("type") || "",
      value,
    });
  }, true);

  document.addEventListener("input", (event) => {
    const el = event.target instanceof Element ? event.target : null;
    if (!el || !("value" in el)) return;
    emit("input", {
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      inputType: el.getAttribute("type") || "",
      value: String(el.value).slice(0, 300),
    });
  }, true);

  document.addEventListener("submit", (event) => {
    const el = event.target instanceof Element ? event.target : null;
    if (!el) return;
    emit("submit", {
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
    });
  }, true);
})();
`;

type RecordedBrowserEvent = {
  type: 'navigate' | 'click' | 'input' | 'change' | 'submit';
  selector?: string;
  text?: string;
  value?: string;
  url?: string;
  title?: string;
  timestamp?: string;
};

let recording: RecordedBrowserEvent[] = [];
let hooked = false;

function toPageActions(events: RecordedBrowserEvent[]): PageAction[] {
  const actions: PageAction[] = [];
  for (const event of events) {
    if (event.type === 'click' && event.selector) {
      actions.push({
        name: event.text ?? '',
        kind: 'click',
        selector: event.selector,
        text: event.text,
        timeoutMs: 5000,
        waitAfterMs: 800,
      });
    } else if ((event.type === 'input' || event.type === 'change') && event.selector) {
      actions.push({
        name: event.text ?? '',
        kind: 'fill',
        selector: event.selector,
        value: event.value ?? '',
        timeoutMs: 5000,
        waitAfterMs: 300,
      });
    } else if (event.type === 'navigate' && event.url) {
      actions.push({
        name: event.title ?? event.url,
        kind: 'wait',
        selector: 'body',
        timeoutMs: 5000,
        waitAfterMs: 300,
      });
    }
  }
  return actions;
}

async function installRecorder(): Promise<void> {
  const context = getContext();
  if (hooked) return;

  await context.exposeBinding('__vibeideRecordEvent', async (_source, payload: RecordedBrowserEvent) => {
    recording.push(payload);
  });
  await context.addInitScript(RECORDER_SCRIPT);

  context.on('page', (newPage) => {
    newPage.on('domcontentloaded', () => {
      void newPage.evaluate(RECORDER_SCRIPT).catch(() => undefined);
    });
  });

  hooked = true;
}

export async function startRecord(): Promise<void> {
  await installRecorder();
  const page = getPage();
  recording = [];
  await page.evaluate(RECORDER_SCRIPT);

  recording.push({
    type: 'navigate',
    url: page.url(),
    title: await page.title(),
    timestamp: new Date().toISOString(),
  });
}

export async function stopRecord(): Promise<PageAction[]> {
  await getPage().waitForTimeout(600);
  return toPageActions(recording);
}
