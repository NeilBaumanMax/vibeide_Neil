import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { RUNTIME_DIRS } from './paths.js';

const execFileAsync = promisify(execFile);
const DEFAULT_IDF_VERSION = '5.4.3';

export interface HardboardDevice {
  port: string;
  label: string;
  source: string;
}

export interface HardboardCommandResult {
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface HardboardEnvStatus {
  runtimeRoot: string;
  hardboardRoot: string;
  idfVersion: string;
  idfPath: string | null;
  idfPy: string | null;
  python: string | null;
  idfToolsPath: string;
  idfPythonEnvPath: string | null;
  examplesDir: string;
  projectsDir: string;
  docsDir: string;
}

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
  };
}

export async function listHardboardDevices(): Promise<HardboardDevice[]> {
  if (process.platform === 'win32') {
    const powershell = process.env.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'powershell.exe';
    try {
      const { stdout } = await execFileAsync(powershell, [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_SerialPort | Select-Object DeviceID,Name | ConvertTo-Json -Compress',
      ], { timeout: 8000, windowsHide: true });
      return parseWindowsSerialPorts(stdout);
    } catch {
      return [];
    }
  }

  const candidates = [
    '/dev/ttyUSB0',
    '/dev/ttyUSB1',
    '/dev/ttyUSB2',
    '/dev/ttyACM0',
    '/dev/ttyACM1',
    '/dev/cu.usbserial',
    '/dev/cu.usbmodem',
  ];
  const devices = new Map<string, HardboardDevice>();
  for (const candidate of candidates) {
    if (candidate.includes('cu.')) {
      const dir = path.dirname(candidate);
      const prefix = path.basename(candidate);
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir)) {
        if (entry.startsWith(prefix)) {
          const port = path.join(dir, entry);
          devices.set(port, { port, label: entry, source: 'filesystem' });
        }
      }
      continue;
    }
    if (fs.existsSync(candidate)) {
      devices.set(candidate, { port: candidate, label: path.basename(candidate), source: 'filesystem' });
    }
  }
  return [...devices.values()];
}

export async function runIdfBuild(projectDir: string, version = DEFAULT_IDF_VERSION): Promise<HardboardCommandResult> {
  return runIdfCommand(resolveProjectDir(projectDir), ['build'], version);
}

export async function runIdfSetTarget(projectDir: string, target = 'esp32s3', version = DEFAULT_IDF_VERSION): Promise<HardboardCommandResult> {
  return runIdfCommand(resolveProjectDir(projectDir), ['set-target', target], version);
}

export async function runIdfFlash(projectDir: string, port: string, version = DEFAULT_IDF_VERSION): Promise<HardboardCommandResult> {
  if (!port.trim()) throw new Error('缺少串口端口，例如 COM3 或 /dev/ttyUSB0');
  return runIdfCommand(resolveProjectDir(projectDir), ['-p', port, 'flash'], version);
}

export async function runIdfCommand(projectDir: string, args: string[], version = DEFAULT_IDF_VERSION): Promise<HardboardCommandResult> {
  const resolvedProjectDir = path.resolve(projectDir || RUNTIME_DIRS.hardboardProjects);
  if (!fs.existsSync(resolvedProjectDir)) {
    throw new Error(`ESP-IDF 项目目录不存在: ${resolvedProjectDir}`);
  }

  const idfPath = resolveIdfPath(version);
  if (!idfPath) {
    throw new Error(`未找到 ESP-IDF ${version}。期望位置: ${path.join(RUNTIME_DIRS.hardboardEspTools, `esp-idf-v${version}`, 'esp-idf')}`);
  }
  const idfPy = resolveIdfPy(idfPath);
  const python = resolvePython(version);
  if (!python) {
    throw new Error('未找到 Python。Windows 打包版应包含 runtime/python/python.exe');
  }

  fs.mkdirSync(RUNTIME_DIRS.hardboardLogs, { recursive: true });
  const commandArgs = [idfPy, ...args];
  const env = buildIdfEnv(idfPath, version);
  try {
    const { stdout, stderr } = await execFileAsync(python, commandArgs, {
      cwd: resolvedProjectDir,
      env,
      timeout: 1000 * 60 * 20,
      maxBuffer: 1024 * 1024 * 20,
      windowsHide: true,
    });
    return {
      command: `${python} ${commandArgs.join(' ')}`,
      cwd: resolvedProjectDir,
      exitCode: 0,
      stdout,
      stderr,
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
    return {
      command: `${python} ${commandArgs.join(' ')}`,
      cwd: resolvedProjectDir,
      exitCode: typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message,
    };
  }
}

function resolveIdfPath(version: string): string | null {
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

function resolveProjectDir(projectDir: string): string {
  const candidate = path.resolve(projectDir || '');
  const defaultProject = path.join(RUNTIME_DIRS.hardboardProjects, 'hello_world_esp32s3');
  if (!projectDir || candidate === path.resolve(RUNTIME_DIRS.hardboardProjects)) {
    return fs.existsSync(defaultProject) ? defaultProject : RUNTIME_DIRS.hardboardProjects;
  }
  return candidate;
}

function resolveIdfPy(idfPath: string): string {
  return path.join(idfPath, 'tools', 'idf.py');
}

function resolvePython(version = DEFAULT_IDF_VERSION): string | null {
  const envPath = resolveIdfPythonEnvPath(version);
  const candidates = [
    process.env.VIBEIDE_PYTHON,
    envPath ? path.join(envPath, process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python') : '',
    process.platform === 'win32' ? path.join(RUNTIME_DIRS.root, 'python', 'python.exe') : '',
    'python',
    'python3',
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !fs.existsSync(candidate)) continue;
    return candidate;
  }
  return null;
}

function buildIdfEnv(idfPath: string, version: string): NodeJS.ProcessEnv {
  const toolsDir = path.join(idfPath, 'tools');
  const idfToolsPath = resolveIdfToolsPath();
  const idfPythonEnvPath = resolveIdfPythonEnvPath(version);
  const oldPath = process.env.PATH || '';
  const pythonBin = idfPythonEnvPath ? path.join(idfPythonEnvPath, process.platform === 'win32' ? 'Scripts' : 'bin') : '';
  return {
    ...process.env,
    IDF_PATH: idfPath,
    IDF_TOOLS_PATH: idfToolsPath,
    ...(idfPythonEnvPath ? { IDF_PYTHON_ENV_PATH: idfPythonEnvPath } : {}),
    IDF_PYTHON_CHECK_CONSTRAINTS: 'no',
    ESP_IDF_VERSION: version,
    VIBEIDE_HARDBOARD_ROOT: RUNTIME_DIRS.hardboard,
    PATH: [pythonBin, toolsDir, oldPath].filter(Boolean).join(path.delimiter),
  };
}

function resolveIdfToolsPath(): string {
  const packaged = path.join(RUNTIME_DIRS.hardboardEspTools, 'idf-tools');
  if (fs.existsSync(packaged)) return packaged;
  return process.env.IDF_TOOLS_PATH || path.join(os.homedir(), '.espressif');
}

function resolveIdfPythonEnvPath(version: string): string | null {
  const idfToolsPath = resolveIdfToolsPath();
  const majorMinor = version.split('.').slice(0, 2).join('.');
  const explicit = process.env.IDF_PYTHON_ENV_PATH;
  const candidates = [
    explicit,
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

function parseWindowsSerialPorts(stdout: string): HardboardDevice[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const item = row as { DeviceID?: string; Name?: string };
      if (!item.DeviceID) return [];
      return [{
        port: item.DeviceID,
        label: item.Name || item.DeviceID,
        source: 'Win32_SerialPort',
      }];
    });
  } catch {
    return [];
  }
}
