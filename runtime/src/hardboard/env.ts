import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RUNTIME_DIRS, RUNTIME_SOURCE_DIRS } from '../paths.js';
import type { HardboardEnvStatus } from './types.js';

export const DEFAULT_IDF_VERSION = '5.4.3';

export function getHardboardEnvStatus(version = DEFAULT_IDF_VERSION): HardboardEnvStatus {
  const idfPath = resolveIdfPath(version);
  const idfToolsPath = resolveIdfToolsPath();
  const idfPythonEnvPath = resolveIdfPythonEnvPath(version);
  return {
    runtimeRoot: RUNTIME_DIRS.root,
    hardboardRoot: RUNTIME_DIRS.hardboard,
    idfVersion: version,
    idfPath,
    idfPy: idfPath ? resolveIdfPy(idfPath) : null,
    python: resolvePython(version),
    idfToolsPath,
    idfPythonEnvPath,
    examplesDir: RUNTIME_DIRS.hardboardExamples,
    projectsDir: RUNTIME_DIRS.hardboardProjects,
    docsDir: RUNTIME_DIRS.hardboardDocs,
    snapshotsDir: RUNTIME_DIRS.hardboardSnapshots,
    firmwareDir: RUNTIME_DIRS.hardboardFirmware,
    logsDir: RUNTIME_DIRS.hardboardLogs,
    eventsDir: RUNTIME_DIRS.hardboardEvents,
  };
}

export function resolveProjectDir(projectDir: string): string {
  const candidate = resolveHardboardProjectPath(projectDir || '');
  const defaultProject = path.join(RUNTIME_DIRS.hardboardProjects, 'hello_world_esp32s3');
  if (!projectDir || candidate === path.resolve(RUNTIME_DIRS.hardboardProjects)) {
    return fs.existsSync(defaultProject) ? defaultProject : RUNTIME_DIRS.hardboardProjects;
  }
  return candidate;
}

export function resolveIdfPath(version: string): string | null {
  const minorAlias = version === '5.4' ? '5.4.3' : version;
  const candidates = [
    process.env.VIBEIDE_ESP_IDF_PATH,
    path.join(RUNTIME_DIRS.hardboardEspTools, `esp-idf-v${minorAlias}`, 'esp-idf'),
    path.join(RUNTIME_DIRS.hardboardEspTools, `esp-idf-v${version}`, 'esp-idf'),
    path.join(os.homedir(), '.esp', `v${minorAlias}`, 'esp-idf'),
    path.join(os.homedir(), '.esp', 'v5.4.3', 'esp-idf'),
    path.join(os.homedir(), 'esp', 'esp-idf'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (fs.existsSync(resolveIdfPy(candidate))) return candidate;
  }
  return null;
}

export function resolveIdfPy(idfPath: string): string {
  return path.join(idfPath, 'tools', 'idf.py');
}

export function resolvePython(version = DEFAULT_IDF_VERSION): string | null {
  const envPath = resolveIdfPythonEnvPath(version);
  const bundled = process.platform === 'win32' ? path.join(RUNTIME_DIRS.root, 'python', 'python.exe') : '';
  const venvPython = envPath ? path.join(envPath, process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python') : '';
  const candidates = [
    process.env.VIBEIDE_PYTHON,
    // System Python first — works with PYTHONPATH, no ._pth issues.
    'python',
    'python3',
    // Bundled embedded Python as fallback (may have ._pth limitations)
    bundled,
    // Machine-specific venv as last resort
    venvPython,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !fs.existsSync(candidate)) continue;
    if (candidate === 'python' || candidate === 'python3') {
      // Verify system Python is actually available
      try {
        const result = require('child_process').execFileSync(candidate, ['--version'], { encoding: 'utf-8', timeout: 3000 });
        if (result) return candidate;
      } catch {
        continue;
      }
    }
    return candidate;
  }
  return null;
}

export function buildIdfEnv(idfPath: string, version: string, projectDir?: string): NodeJS.ProcessEnv {
  const toolsDir = path.join(idfPath, 'tools');
  const idfToolsPath = resolveIdfToolsPath();
  const idfPythonEnvPath = resolveIdfPythonEnvPath(version);
  const pythonBin = idfPythonEnvPath ? path.join(idfPythonEnvPath, process.platform === 'win32' ? 'Scripts' : 'bin') : '';
  const installedToolPaths = discoverInstalledIdfToolPaths(idfToolsPath);
  const espRomElfDir = resolveEspRomElfDir(idfToolsPath);
  const cxxIncludePaths = resolveXtensaCxxIncludePaths(idfToolsPath, projectDir);
  ensureConstraintsFile(idfToolsPath, version);
  return {
    ...process.env,
    IDF_PATH: idfPath,
    IDF_TOOLS_PATH: idfToolsPath,
    ...(idfPythonEnvPath ? { IDF_PYTHON_ENV_PATH: idfPythonEnvPath } : {}),
    ...(espRomElfDir ? { ESP_ROM_ELF_DIR: espRomElfDir } : {}),
    IDF_PYTHON_CHECK_CONSTRAINTS: 'no',
    ESP_IDF_VERSION: version,
    VIBEIDE_HARDBOARD_ROOT: RUNTIME_DIRS.hardboard,
    // Embedded Python (python312._pth) disables auto script-dir in sys.path.
    // idf.py needs to find python_version_checker.py in its own tools/ dir.
    ...(process.platform === 'win32' ? { PYTHONPATH: toolsDir } : {}),
    ...(cxxIncludePaths.length > 0 ? {
      CPLUS_INCLUDE_PATH: mergePathList(cxxIncludePaths, process.env.CPLUS_INCLUDE_PATH),
    } : {}),
    PATH: [pythonBin, toolsDir, ...installedToolPaths, process.env.PATH || ''].filter(Boolean).join(path.delimiter),
  };
}

export function createIdfLogBase(args: string[], projectDir: string): string {
  const projectName = path.basename(projectDir) || 'project';
  const action = args.find((arg) => !arg.startsWith('-') && !arg.match(/^COM\d+$/i)) || 'idf';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeAction = action.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const safeProject = projectName.replace(/[^a-zA-Z0-9._-]+/g, '-');
  return path.join(RUNTIME_DIRS.hardboardLogs, `${stamp}-${safeProject}-${safeAction}`);
}

function resolveHardboardProjectPath(projectDir: string): string {
  if (!projectDir) return path.resolve(projectDir);

  const normalized = path.normalize(projectDir);
  const hardboardPrefix = `hardboard${path.sep}`;
  if (!path.isAbsolute(normalized) && (normalized === 'hardboard' || normalized.startsWith(hardboardPrefix))) {
    const relativeToHardboard = normalized === 'hardboard' ? '' : normalized.slice(hardboardPrefix.length);
    return path.resolve(path.join(RUNTIME_DIRS.hardboard, relativeToHardboard));
  }

  return rewriteSourceHardboardPath(path.resolve(projectDir));
}

function rewriteSourceHardboardPath(candidate: string): string {
  const sourceHardboard = path.resolve(RUNTIME_SOURCE_DIRS.hardboard);
  const runtimeHardboard = path.resolve(RUNTIME_DIRS.hardboard);
  if (sourceHardboard.toLowerCase() === runtimeHardboard.toLowerCase()) return candidate;
  if (!isSameOrInside(candidate, sourceHardboard)) return candidate;

  const relative = path.relative(sourceHardboard, candidate);
  return path.resolve(path.join(runtimeHardboard, relative));
}

function isSameOrInside(candidate: string, parent: string): boolean {
  const resolvedCandidate = path.resolve(candidate).toLowerCase();
  const resolvedParent = path.resolve(parent).toLowerCase();
  return resolvedCandidate === resolvedParent || resolvedCandidate.startsWith(`${resolvedParent}${path.sep}`);
}

function resolveIdfToolsPath(): string {
  const packaged = path.join(RUNTIME_DIRS.hardboardEspTools, 'idf-tools');
  if (fs.existsSync(packaged)) return packaged;
  return process.env.IDF_TOOLS_PATH || path.join(os.homedir(), '.espressif');
}

function resolveIdfPythonEnvPath(version: string): string | null {
  const idfToolsPath = resolveIdfToolsPath();
  const majorMinor = version.split('.').slice(0, 2).join('.');
  const candidates = [
    process.env.IDF_PYTHON_ENV_PATH,
    path.join(idfToolsPath, 'python_env', `idf${majorMinor}_py3.13_env`),
    path.join(idfToolsPath, 'python_env', `idf${majorMinor}_py3.12_env`),
    path.join(idfToolsPath, 'python_env', `idf${majorMinor}_py3.11_env`),
    path.join(idfToolsPath, 'python_env', `idf${majorMinor}_py3.10_env`),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    const python = path.join(candidate, process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python');
    if (fs.existsSync(python)) return candidate;
  }
  return null;
}

function ensureConstraintsFile(idfToolsPath: string, version: string): void {
  const file = path.join(idfToolsPath, `espidf.constraints.v${version.split('.').slice(0, 2).join('.')}.txt`);
  if (!fs.existsSync(file)) {
    try { fs.writeFileSync(file, '', 'utf-8'); } catch { /* best-effort */ }
  }
}

function discoverInstalledIdfToolPaths(idfToolsPath: string): string[] {
  const toolsRoot = path.join(idfToolsPath, 'tools');
  if (!fs.existsSync(toolsRoot)) return [];
  const paths = new Set<string>();
  const queue: Array<{ dir: string; depth: number }> = [{ dir: toolsRoot, depth: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const hasExecutable = entries.some((entry) => entry.isFile() && (
      process.platform === 'win32'
        ? ['.exe', '.cmd', '.bat'].some((ext) => entry.name.toLowerCase().endsWith(ext))
        : Boolean(fs.statSync(path.join(current.dir, entry.name)).mode & 0o111)
    ));
    if (hasExecutable) paths.add(current.dir);
    if (current.depth >= 5) continue;
    for (const entry of entries) {
      if (entry.isDirectory()) queue.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 });
    }
  }
  return [...paths];
}

function resolveEspRomElfDir(idfToolsPath: string): string | null {
  const root = path.join(idfToolsPath, 'tools', 'esp-rom-elfs');
  if (!fs.existsSync(root)) return null;
  const candidates: string[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    if (entries.some((entry) => entry.isFile() && entry.name.endsWith('.elf'))) candidates.push(current.dir);
    if (current.depth >= 3) continue;
    for (const entry of entries) {
      if (entry.isDirectory()) queue.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 });
    }
  }
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}

function resolveXtensaCxxIncludePaths(idfToolsPath: string, projectDir?: string): string[] {
  const target = resolveProjectTarget(projectDir);
  const root = path.join(idfToolsPath, 'tools', 'xtensa-esp-elf');
  if (!fs.existsSync(root)) return [];
  const matches: string[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    if (path.basename(current.dir).toLowerCase() === target && fs.existsSync(path.join(current.dir, 'bits', 'c++config.h'))) {
      matches.push(current.dir);
    }
    const noRtti = path.join(current.dir, target, 'no-rtti');
    if (fs.existsSync(path.join(noRtti, 'bits', 'c++config.h'))) matches.push(noRtti);
    if (current.depth >= 10) continue;
    for (const entry of entries) {
      if (entry.isDirectory()) queue.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 });
    }
  }
  return [...new Set(matches)];
}

function resolveProjectTarget(projectDir?: string): string {
  if (!projectDir) return 'esp32s3';
  for (const file of ['sdkconfig', 'sdkconfig.defaults']) {
    const configPath = path.join(projectDir, file);
    if (!fs.existsSync(configPath)) continue;
    const match = fs.readFileSync(configPath, 'utf-8').match(/^CONFIG_IDF_TARGET="?([a-z0-9_]+)"?/m);
    if (match?.[1]) return match[1];
  }
  return 'esp32s3';
}

function mergePathList(paths: string[], existing?: string): string {
  return [...paths, existing || ''].filter(Boolean).join(path.delimiter);
}
