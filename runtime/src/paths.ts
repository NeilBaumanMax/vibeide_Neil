import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function resolveRuntimeRoot(): string {
  if (process.env.RUNTIME_ROOT) return path.resolve(process.env.RUNTIME_ROOT);

  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'runtime', 'hardboard'))) return path.resolve(cwd, 'runtime');
  if (fs.existsSync(path.join(cwd, 'hardboard'))) return path.resolve(cwd);
  return path.resolve(cwd);
}

const RUNTIME_ROOT = resolveRuntimeRoot();
const SOURCE_HARDBOARD_ROOT = path.join(RUNTIME_ROOT, 'hardboard');
const HARDBOARD_ROOT = resolveShortHardboardRoot(SOURCE_HARDBOARD_ROOT);

function resolveShortHardboardRoot(hardboardRoot: string): string {
  const resolved = path.resolve(hardboardRoot);
  if (process.platform !== 'win32') return resolved;
  if (!resolved.toLowerCase().includes(`${path.sep}resources${path.sep}runtime${path.sep}hardboard`)) return resolved;

  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const aliasRoot = path.join(localAppData, 'vibeide-hardboard-runtime');
  const aliasHardboard = path.join(aliasRoot, 'hardboard');

  try {
    fs.mkdirSync(aliasRoot, { recursive: true });
    if (fs.existsSync(aliasHardboard)) {
      const stat = fs.lstatSync(aliasHardboard);
      if (stat.isSymbolicLink()) {
        const currentTarget = normalizeFsPath(fs.readlinkSync(aliasHardboard));
        if (currentTarget.toLowerCase() !== normalizeFsPath(resolved).toLowerCase()) {
          fs.rmdirSync(aliasHardboard);
        }
      } else {
        return resolved;
      }
    }

    if (!fs.existsSync(aliasHardboard)) {
      fs.symlinkSync(resolved, aliasHardboard, 'junction');
    }
    return aliasHardboard;
  } catch {
    return resolved;
  }
}

function normalizeFsPath(value: string): string {
  return path.resolve(value.replace(/^\\\\\?\\/, ''));
}

export const RUNTIME_SOURCE_DIRS = {
  root: RUNTIME_ROOT,
  hardboard: SOURCE_HARDBOARD_ROOT,
};

export const RUNTIME_DIRS = {
  root: RUNTIME_ROOT,
  browserRuntime: path.join(RUNTIME_ROOT, 'browser_runtime'),
  chromeProfile: path.join(RUNTIME_ROOT, 'chrome_profile'),
  cookies: path.join(RUNTIME_ROOT, 'cookies'),
  logs: path.join(RUNTIME_ROOT, 'logs'),
  pids: path.join(RUNTIME_ROOT, 'pids'),
  hardboard: HARDBOARD_ROOT,
  hardboardEspTools: path.join(HARDBOARD_ROOT, 'esptools'),
  hardboardExamples: path.join(HARDBOARD_ROOT, 'example'),
  hardboardDocs: path.join(HARDBOARD_ROOT, 'doc'),
  hardboardProjects: path.join(HARDBOARD_ROOT, 'projects'),
  hardboardSnapshots: path.join(HARDBOARD_ROOT, 'git-snapshots'),
  hardboardLogs: path.join(HARDBOARD_ROOT, 'logs'),
  hardboardFirmware: path.join(HARDBOARD_ROOT, 'firmware'),
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
