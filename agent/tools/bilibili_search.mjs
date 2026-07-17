#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const toolsDir = path.dirname(__filename);
const agentDir = path.resolve(toolsDir, '..');
const projectRoot = path.resolve(agentDir, '..');
const runtimeDir = path.join(projectRoot, 'runtime');
const keyword = process.argv.slice(2).join(' ') || '星芯的美少女';
const cdpPort = process.env.CDP_PORT || '9230';
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function send(proc, id, method, params = {}) {
  proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
}

function readJsonLine(proc) {
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      cleanup();
      try {
        resolve(JSON.parse(String(chunk).trim()));
      } catch (err) {
        reject(err);
      }
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      proc.stdout.off('data', onData);
      proc.off('error', onError);
    };
    proc.stdout.once('data', onData);
    proc.once('error', onError);
  });
}

async function callTool(proc, id, name, args = {}) {
  send(proc, id, 'tools/call', { name, arguments: args });
  const resp = await readJsonLine(proc);
  return resp.result || {};
}

async function main() {
  const proc = spawn(npxBin, ['tsx', 'src/mcp/server.ts'], {
    cwd: runtimeDir,
    env: { ...process.env, CDP_PORT: cdpPort },
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  send(proc, 1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'vibeide-tools', version: '1.0' },
  });
  await readJsonLine(proc);
  proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

  const searchUrl = `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`;
  console.log(`navigate: ${searchUrl}`);
  await callTool(proc, 2, 'browser.navigate', { url: searchUrl });
  await callTool(proc, 3, 'browser.wait', { selector: '.bili-video-card__wrap, .video-list-item', timeoutMs: 10000 }).catch(() => null);

  const state = await callTool(proc, 4, 'browser.getState', {});
  for (const item of state.content || []) {
    if (item.type === 'text') console.log(item.text);
  }

  const shot = await callTool(proc, 5, 'browser.screenshot', {});
  for (const item of shot.content || []) {
    if (item.type === 'image') {
      const outPath = path.join(agentDir, 'bilibili_result.png');
      fs.writeFileSync(outPath, Buffer.from(item.data, 'base64'));
      console.log(`screenshot: ${outPath}`);
    } else if (item.type === 'text') {
      console.log(item.text);
    }
  }

  proc.stdin.end();
  proc.kill();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
