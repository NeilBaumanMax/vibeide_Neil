// Runtime Core — 统一导出
// Playwright 自动化 + CDP 连接 + 数据提取 + 录制回放 + MCP Server

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureRuntimeState, RUNTIME_DIRS } from './paths.js';
import type { HardboardCommandResult } from './hardboard.js';

export { connectBrowser, closeBrowser, getBrowserState } from './browser.js';
export { navigate, click, fill, scroll, wait, screenshot } from './actions.js';
export { extractCards, extractTable, extractText } from './extract.js';
export { startRecord, stopRecord } from './record.js';
export { replaySession } from './replay.js';
export { saveRecording, loadRecording, loadLatestRecording, listRecordings } from './recordings.js';
export { saveWorkspace, readWorkspace, listWorkspaces } from './storage.js';
export { saveWorkflow, loadWorkflow, listWorkflows } from './workflows.js';
export { startMCPServer } from './mcp/server.js';
export {
  createHardboardSnapshot,
  getHardboardEnvStatus,
  listHardboardDevices,
  runIdfBuild,
  runIdfClean,
  runIdfCommand,
  runIdfEraseFlash,
  runIdfFlash,
  runIdfSetTarget,
  runSerialCapture,
} from './hardboard.js';
export { clearRuntimeEventHistory, readRuntimeEventsSince } from './eventbus/index.js';

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
      mcpConfig: 'generated-dynamically-by-electron',
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

  if (command === 'hardboard:env') {
    const { getHardboardEnvStatus } = await import('./hardboard.js');
    console.log(JSON.stringify(getHardboardEnvStatus(process.argv[3]), null, 2));
    return;
  }

  if (command === 'hardboard:devices') {
    const { listHardboardDevices } = await import('./hardboard.js');
    console.log(JSON.stringify(await listHardboardDevices(), null, 2));
    return;
  }

  if (command === 'hardboard:events') {
    const { readRuntimeEventsSince } = await import('./eventbus/index.js');
    const sinceSeq = Number.parseInt(process.argv[3] || '0', 10);
    console.log(JSON.stringify(readRuntimeEventsSince(Number.isFinite(sinceSeq) ? sinceSeq : 0), null, 2));
    return;
  }

  if (command === 'hardboard:events-clear') {
    const { clearRuntimeEventHistory } = await import('./eventbus/index.js');
    console.log(JSON.stringify(clearRuntimeEventHistory(), null, 2));
    return;
  }

  if (command === 'hardboard:snapshot') {
    const { createHardboardSnapshot } = await import('./hardboard.js');
    console.log(JSON.stringify(createHardboardSnapshot(process.argv[3] || RUNTIME_DIRS.hardboardProjects, process.argv[4] || ''), null, 2));
    return;
  }

  if (command === 'hardboard:build') {
    const { runIdfBuild } = await import('./hardboard.js');
    const result = await runIdfBuild(process.argv[3] || RUNTIME_DIRS.hardboardProjects, process.argv[4], 'manual');
    console.log(JSON.stringify(compactCommandResult(result), null, 2));
    process.exitCode = result.exitCode;
    return;
  }

  if (command === 'hardboard:flash') {
    const { runIdfFlash } = await import('./hardboard.js');
    const result = await runIdfFlash(process.argv[3] || RUNTIME_DIRS.hardboardProjects, process.argv[4] || '', process.argv[5], 'manual');
    console.log(JSON.stringify(compactCommandResult(result), null, 2));
    process.exitCode = result.exitCode;
    return;
  }

  if (command === 'hardboard:serial') {
    const { runSerialCapture } = await import('./hardboard.js');
    const result = await runSerialCapture(
      process.argv[3] || '',
      Number.parseInt(process.argv[4] || '20', 10),
      Number.parseInt(process.argv[5] || '115200', 10),
      process.argv[6],
      'manual',
    );
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.exitCode;
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

function compactCommandResult(result: HardboardCommandResult) {
  return {
    command: result.command,
    cwd: result.cwd,
    exitCode: result.exitCode,
    ok: result.exitCode === 0,
    logPath: result.logPath,
    stdoutLogPath: result.stdoutLogPath,
    stderrLogPath: result.stderrLogPath,
    stdoutBytes: Buffer.byteLength(result.stdout || '', 'utf-8'),
    stderrBytes: Buffer.byteLength(result.stderr || '', 'utf-8'),
    stdoutTail: tailText(result.stdout || ''),
    stderrTail: tailText(result.stderr || ''),
  };
}

function tailText(value: string): string {
  const limit = 6000;
  if (value.length <= limit) return value;
  return `[truncated: showing last ${limit} chars of ${value.length}]\n${value.slice(-limit)}`;
}
