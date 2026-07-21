import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from './worker/logger';
import {
  getAgentDir,
  getAgentWorkspaceDir,
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
import { buildAgentSystemPrompt } from './worker/context';
import { ensureManagedSkillsDeployed } from './skill-manager';

const AGENT_DIR = getAgentDir();
const AGENT_WORKSPACE_DIR = getAgentWorkspaceDir();
const CLAUDE_BIN = getClaudeBin();
const API_KEY_FILE = getApiKeyPath();
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/anthropic';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-pro';

let agentProcess: ChildProcess | null = null;
let agentSeq = 0;
let agentMcpConfigPath: string | null = null;

export function ensureAgentProcess(): ChildProcess {
  if (agentProcess && !agentProcess.killed && agentProcess.exitCode == null) {
    return agentProcess;
  }

  const seq = ++agentSeq;

  // 动态生成 MCP 配置（不依赖静态文件）
  fs.mkdirSync(AGENT_WORKSPACE_DIR, { recursive: true });
  const skillSnapshot = ensureManagedSkillsDeployed();
  logger.info('agent:skills-deployed', {
    sourceDir: skillSnapshot.status.sourceDir,
    deployDir: skillSnapshot.status.deployDir,
    skillCount: skillSnapshot.status.skillCount,
    deployedCount: skillSnapshot.status.deployedCount,
    error: skillSnapshot.status.error,
  });
  const mcpConfig = buildMcpConfig();
  let mcpConfigPath = path.join(AGENT_WORKSPACE_DIR, `.mcp-config-${seq}.json`);
  try {
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
  } catch (err) {
    logger.error('agent:mcp-config-write-failed', { error: String(err), path: mcpConfigPath });
    // 降级：尝试写入系统临时目录
    const tmpPath = path.join(require('os').tmpdir(), `.vibeide-mcp-${seq}.json`);
    fs.writeFileSync(tmpPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
    mcpConfigPath = tmpPath;
  }

  const systemPrompt = buildAgentSystemPrompt();
  const args = [
    '-p',
    '--mcp-config', mcpConfigPath,
    '--dangerously-skip-permissions',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--append-system-prompt', systemPrompt,
    '--verbose',
    '--replay-user-messages',
  ];

  logger.info('agent:spawn', {
    bin: CLAUDE_BIN,
    args: [
      '-p',
      '--mcp-config',
      '<dynamic>',
      '--dangerously-skip-permissions',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--append-system-prompt',
      `(${systemPrompt.length} chars)`,
      '--verbose',
      '--replay-user-messages',
    ],
    cwd: AGENT_WORKSPACE_DIR,
    mcpConfigPath,
    seq,
  });

  const env = buildAgentEnv();

  agentProcess = spawn(CLAUDE_BIN, args, {
    cwd: AGENT_WORKSPACE_DIR,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  agentMcpConfigPath = mcpConfigPath;

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
      agentMcpConfigPath = null;
    }
  });

  logger.info('agent:spawn', { pid: agentProcess.pid, seq, spawned: !!agentProcess.pid });

  return agentProcess;
}

export function sendAgentMessage(prompt: string): void {
  const proc = ensureAgentProcess();
  if (!proc.stdin || proc.stdin.destroyed) {
    throw new Error('Agent stdin is not writable');
  }
  const payload = {
    type: 'user',
    message: {
      role: 'user',
      content: prompt,
    },
  };
  proc.stdin.write(`${JSON.stringify(payload)}\n`);
  logger.info('agent:stdin', { pid: proc.pid, chars: prompt.length });
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
  if (agentMcpConfigPath) {
    try { fs.unlinkSync(agentMcpConfigPath); } catch { /* ignore */ }
    agentMcpConfigPath = null;
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
          args: [tsxCli, devServerEntry, 'mcp'],
          env: {
            ...baseEnv,
            // process.execPath is electron.exe in development. Make it behave
            // like Node when Claude Code launches the stdio MCP subprocess.
            ELECTRON_RUN_AS_NODE: '1',
          },
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
          args: [tsxCli, prodServerEntry, 'mcp'],
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
        args: [tsxCli, prodServerEntry, 'mcp'],
        env: baseEnv,
      },
    },
  };
}

export function readDeepSeekApiKey(): string | null {
  try {
    const text = fs.readFileSync(API_KEY_FILE, 'utf-8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^DEEPSEEK_API_KEY\s*=\s*(.+)$/);
      if (match?.[1]) return match[1].trim();
      return line;
    }
  } catch {
    // Missing key file is handled by caller.
  }
  return null;
}
