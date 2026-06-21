const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.whenReady().then(async () => {
  const {
    setupBrowserView,
    openTabUrl,
    listTabs,
  } = require('../dist/main/browser-view.js');

  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 640,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const htmlFile = path.join(os.tmpdir(), `vibeide-real-tab-${Date.now()}.html`);
  fs.writeFileSync(htmlFile, '<!doctype html><title>real-tab</title><h1>ok</h1>', 'utf-8');
  const targetUrl = pathToFileURL(htmlFile).toString();

  setupBrowserView(win);
  openTabUrl(targetUrl, true);

  for (let i = 0; i < 20; i += 1) {
    const current = listTabs();
    if (current.length === 1 && current[0].url === targetUrl) break;
    await delay(100);
  }

  const tabs = listTabs();
  const blankTabs = tabs.filter((tab) => tab.url === 'about:blank');
  if (tabs.length !== 1 || blankTabs.length !== 0 || tabs[0].url !== targetUrl) {
    throw new Error(`Expected one real tab and no blank tabs, got ${JSON.stringify(tabs)}`);
  }

  console.log(`no-blank-tab smoke ok: ${tabs[0].id} ${tabs[0].url}`);
  win.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
