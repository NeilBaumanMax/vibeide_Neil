// Runtime Core — 统一导出
// Playwright 自动化 + CDP 连接 + 数据提取 + 录制回放 + MCP Server

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureRuntimeState, RUNTIME_DIRS } from './paths.js';

export { connectBrowser, closeBrowser, getBrowserState } from './browser';
export { navigate, click, fill, scroll, wait, screenshot } from './actions';
export { extractCards, extractTable, extractText } from './extract';
export { startRecord, stopRecord } from './record';
export { replaySession } from './replay';
export { saveRecording, loadRecording, loadLatestRecording, listRecordings } from './recordings';
export { saveWorkspace, readWorkspace, listWorkspaces } from './storage';
export { saveWorkflow, loadWorkflow, listWorkflows } from './workflows';
export { startMCPServer } from './mcp/server';

async function runCli(): Promise<void> {
  const command = process.argv[2] ?? 'health';
  const cdpPort = Number.parseInt(process.env.CDP_PORT || '9230', 10);

  ensureRuntimeState(cdpPort);

  if (command === 'mcp') {
    const { startMCPServer } = await import('./mcp/server.js');
    await startMCPServer();
    return;
  }

  if (command === 'health') {
    const payload = {
      ok: true,
      runtimeDir: RUNTIME_DIRS.root,
      cdpPort,
      mcpConfig: path.resolve(RUNTIME_DIRS.root, 'mcp-config.json'),
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (command === 'connect') {
    const { connectBrowser, getBrowserState } = await import('./browser.js');
    await connectBrowser(cdpPort);
    console.log(JSON.stringify(await getBrowserState(), null, 2));
    return;
  }

  throw new Error(`未知 runtime 命令: ${command}`);
}

const entryHref = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryHref) {
  runCli().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[vibeide] runtime 启动失败: ${message}`);
    process.exit(1);
  });
}
