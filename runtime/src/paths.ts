import fs from 'node:fs';
import path from 'node:path';

/**
 * Runtime 根目录。
 * 优先使用环境变量 RUNTIME_ROOT（由 Electron 主进程传入），
 * 降级到 process.cwd()（开发模式默认值）。
 */
function resolveRuntimeRoot(): string {
  if (process.env.RUNTIME_ROOT) return path.resolve(process.env.RUNTIME_ROOT);

  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'hardboard'))) return path.resolve(cwd);
  if (fs.existsSync(path.join(cwd, 'runtime', 'hardboard'))) return path.resolve(cwd, 'runtime');
  return path.resolve(cwd);
}

const RUNTIME_ROOT = resolveRuntimeRoot();

export const RUNTIME_DIRS = {
  root: RUNTIME_ROOT,
  browserRuntime: path.join(RUNTIME_ROOT, 'browser_runtime'),
  chromeProfile: path.join(RUNTIME_ROOT, 'chrome_profile'),
  cookies: path.join(RUNTIME_ROOT, 'cookies'),
  logs: path.join(RUNTIME_ROOT, 'logs'),
  pids: path.join(RUNTIME_ROOT, 'pids'),
  hardboard: path.join(RUNTIME_ROOT, 'hardboard'),
  hardboardEspTools: path.join(RUNTIME_ROOT, 'hardboard', 'esptools'),
  hardboardExamples: path.join(RUNTIME_ROOT, 'hardboard', 'example'),
  hardboardDocs: path.join(RUNTIME_ROOT, 'hardboard', 'doc'),
  hardboardProjects: path.join(RUNTIME_ROOT, 'hardboard', 'projects'),
  hardboardSnapshots: path.join(RUNTIME_ROOT, 'hardboard', 'git-snapshots'),
  hardboardLogs: path.join(RUNTIME_ROOT, 'hardboard', 'logs'),
  hardboardFirmware: path.join(RUNTIME_ROOT, 'hardboard', 'firmware'),
};

export const STATE_FILE = path.join(RUNTIME_ROOT, 'state.json');
export const PORTS_FILE = path.join(RUNTIME_ROOT, 'ports.json');

export function ensureRuntimeDirs(): void {
  for (const dir of Object.values(RUNTIME_DIRS)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function ensureRuntimeState(cdpPort: number): void {
  ensureRuntimeDirs();

  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify(
        {
          status: 'idle',
          lastStartedAt: null,
          lastConnectedAt: null,
        },
        null,
        2
      ),
      'utf-8'
    );
  }

  fs.writeFileSync(
    PORTS_FILE,
    JSON.stringify(
      {
        cdpPort,
      },
      null,
      2
    ),
    'utf-8'
  );
}
