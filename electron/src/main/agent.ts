import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from './worker/logger';
import {
  getAgentDir,
  getClaudeBin,
  getApiKeyPath,
  getRuntimeDir,
  getResourcesDir,
  getRuntimeDevServerEntry,
  getRuntimeServerEntry,
  getRuntimeDataDir,
  isDev,
  isPackaged,
} from './paths';

const AGENT_DIR = getAgentDir();
const CLAUDE_BIN = getClaudeBin();
const API_KEY_FILE = getApiKeyPath();
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/anthropic';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-pro';

let agentProcess: ChildProcess | null = null;
let agentSeq = 0;

export interface SpawnAgentOptions {
  continueSession?: boolean;
}

export function spawnAgent(prompt: string, options: SpawnAgentOptions = {}): ChildProcess {
  const seq = ++agentSeq;

  if (agentProcess) {
    logger.warn('agent:kill', { reason: 'replaced by new agent', oldSeq: agentSeq - 1, newSeq: seq });
    const old = agentProcess;
    old.stdout?.removeAllListeners();
    old.stderr?.removeAllListeners();
    old.removeAllListeners();
    old.kill('SIGKILL');
    agentProcess = null;
  }

  // 动态生成 MCP 配置（不依赖静态文件）
  const mcpConfig = buildMcpConfig();
  let mcpConfigPath = path.join(AGENT_DIR, `.mcp-config-${seq}.json`);
  try {
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
  } catch (err) {
    logger.error('agent:mcp-config-write-failed', { error: String(err), path: mcpConfigPath });
    // 降级：尝试写入系统临时目录
    const tmpPath = path.join(require('os').tmpdir(), `.vibeide-mcp-${seq}.json`);
    fs.writeFileSync(tmpPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
    mcpConfigPath = tmpPath;
  }

  const args = [
    '--mcp-config', mcpConfigPath,
    '--dangerously-skip-permissions',
    '--output-format', 'stream-json',
    '--verbose',
    ...(options.continueSession ? ['--continue'] : []),
    '-p', prompt,
  ];

  logger.info('agent:spawn', {
    bin: CLAUDE_BIN,
    args: [
      '--mcp-config',
      '<dynamic>',
      '--dangerously-skip-permissions',
      '--output-format',
      'stream-json',
      '--verbose',
      ...(options.continueSession ? ['--continue'] : []),
      '-p',
      `(${prompt.length} chars)`,
    ],
    cwd: AGENT_DIR,
    mcpConfigPath,
    seq,
    continueSession: !!options.continueSession,
  });

  const env = buildAgentEnv();

  agentProcess = spawn(CLAUDE_BIN, args, {
    cwd: AGENT_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // 进程退出后清理临时 MCP 配置文件
  const cleanup = () => {
    try { fs.unlinkSync(mcpConfigPath); } catch { /* ignore */ }
  };
  agentProcess.on('exit', cleanup);
  agentProcess.on('error', cleanup);

  const proc = agentProcess;
  proc.on('close', () => {
    if (agentProcess === proc) {
      agentProcess = null;
    }
  });

  logger.info('agent:spawn', { pid: agentProcess.pid, seq, spawned: !!agentProcess.pid });

  return agentProcess;
}

export function killAgent(): void {
  if (agentProcess) {
    logger.info('agent:kill', { pid: agentProcess.pid, seq: agentSeq });
    const old = agentProcess;
    old.stdout?.removeAllListeners();
    old.stderr?.removeAllListeners();
    old.removeAllListeners();
    old.kill('SIGKILL');
    agentProcess = null;
    agentSeq++;
  }
}

export function getAgentProcess(): ChildProcess | null {
  return agentProcess;
}

export function getAgentSeq(): number {
  return agentSeq;
}

function buildAgentEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // Avoid inheriting mismatched upstream settings from the parent shell.
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_BASE_URL;
  delete env.ANTHROPIC_MODEL;

  env.CDP_PORT = '9230';
  env.DISPLAY = process.env.DISPLAY || ':0';
  env.CLAUDE_CONFIG_DIR = getRuntimeDataDir('claude-config');

  const apiKey = readDeepSeekApiKey();
  if (apiKey) {
    env.ANTHROPIC_AUTH_TOKEN = apiKey;
    env.ANTHROPIC_BASE_URL = DEFAULT_DEEPSEEK_BASE_URL;
    env.ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || DEFAULT_DEEPSEEK_MODEL;
    logger.info('agent:spawn', {
      authMode: 'deepseek-apikey-file',
      apiKeyFile: API_KEY_FILE,
      baseUrl: env.ANTHROPIC_BASE_URL,
      model: env.ANTHROPIC_MODEL,
      claudeConfigDir: env.CLAUDE_CONFIG_DIR,
    });
  } else {
    logger.warn('agent:spawn', {
      authMode: 'no-apikey-file',
      apiKeyFile: API_KEY_FILE,
      claudeConfigDir: env.CLAUDE_CONFIG_DIR,
      msg: 'DeepSeek API key not found; agent may require interactive Claude login',
    });
  }

  return env;
}

/**
 * 动态构建 MCP 配置，不依赖静态 mcp-config.json 文件。
 *
 * 开发模式：tsx 直接跑 .ts 源码
 * 生产模式：portable node + --experimental-specifier-resolution=node 跑编译后的 JS
 *           （该 flag 让 Node.js 在 ESM 模式不要求 .js 后缀）
 */
function buildMcpConfig(): { mcpServers: Record<string, unknown> } {
  const runtimeDir = getRuntimeDir();
  const tsxCli = path.join(runtimeDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const devServerEntry = getRuntimeDevServerEntry();
  const prodServerEntry = getRuntimeServerEntry();

  // 所有模式都传入 RUNTIME_ROOT + PLAYWRIGHT 环境变量
  const playwrightDir = path.join(getResourcesDir(), 'playwright');
  const baseEnv: Record<string, string> = {
    CDP_PORT: '9230',
    RUNTIME_ROOT: runtimeDir,
    PLAYWRIGHT_BROWSERS_PATH: playwrightDir,
  };

  // 开发模式：tsx 直接跑 .ts
  if (isDev()) {
    return {
      mcpServers: {
        'vibeide-runtime': {
          command: process.execPath,
          args: [tsxCli, devServerEntry],
          env: baseEnv,
        },
      },
    };
  }

  // 生产模式：portable node + tsx 跑编译后的 JS（tsx 处理 ESM 后缀问题）
  const nodeBin = path.join(runtimeDir, 'nodejs', 'node.exe');
  if (fs.existsSync(nodeBin) && fs.existsSync(tsxCli)) {
    return {
      mcpServers: {
        'vibeide-runtime': {
          command: nodeBin,
          args: [tsxCli, prodServerEntry],
          env: baseEnv,
        },
      },
    };
  }

  // 最终降级：系统 PATH 中的 node + tsx
  return {
    mcpServers: {
      'vibeide-runtime': {
        command: 'node',
        args: [tsxCli, prodServerEntry],
        env: baseEnv,
      },
    },
  };
}

function readDeepSeekApiKey(): string | null {
  try {
    const text = fs.readFileSync(API_KEY_FILE, 'utf-8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^DEEPSEEK_API_KEY\s*=\s*(.+)$/);
      if (match?.[1]) return match[1].trim();
    }
  } catch {
    // Missing key file is handled by caller.
  }
  return null;
}
