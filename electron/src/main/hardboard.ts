import { ChildProcessWithoutNullStreams, execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { TextDecoder } from 'node:util';
import { getHardboardDir, getRuntimeDir } from './paths';

const execFileAsync = promisify(execFile);

export interface HardboardDevice {
  port: string;
  label: string;
  source: string;
}

export interface SerialMonitorOptions {
  port: string;
  baudRate: number;
  encoding: string;
}

export interface SerialMonitorChunk {
  text: string;
  timestamp: number;
  stream: 'stdout' | 'stderr';
}

export interface HardboardRuntimeLaunchResult {
  ok: boolean;
  pid?: number;
  command?: string;
  args?: string[];
  error?: string;
}

export interface HardboardBuildLaunchOptions {
  projectDir?: string;
  cmakeFile?: string;
  configFile?: string;
  sourceFile?: string;
}

export interface HardboardFlashLaunchOptions {
  projectDir?: string;
  port: string;
  artifactFile?: string;
  configFile?: string;
}

let serialProcess: ChildProcessWithoutNullStreams | null = null;
let serialStopTimer: NodeJS.Timeout | null = null;

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

  const ports = ['/dev/ttyUSB0', '/dev/ttyUSB1', '/dev/ttyUSB2', '/dev/ttyACM0', '/dev/ttyACM1'];
  return ports
    .filter((port) => fs.existsSync(port))
    .map((port) => ({ port, label: path.basename(port), source: 'filesystem' }));
}

export function isSerialMonitorRunning(): boolean {
  return Boolean(serialProcess && !serialProcess.killed);
}

export function startSerialMonitor(options: SerialMonitorOptions, onData: (chunk: SerialMonitorChunk) => void, onExit: (result: { code: number | null; signal: NodeJS.Signals | null }) => void): { ok: boolean; error?: string } {
  stopSerialMonitor();

  const port = options.port.trim();
  if (!port) return { ok: false, error: '缺少串口端口' };

  const python = resolveHardboardPython();
  if (!python) return { ok: false, error: '未找到随包 Python 或 ESP-IDF Python 环境' };

  const decoder = createDecoder(options.encoding);
  fs.mkdirSync(getHardboardDir('logs'), { recursive: true });
  const script = [
    'import sys, time',
    'try:',
    '    import serial',
    'except Exception as exc:',
    '    print(f"pyserial import failed: {exc}", file=sys.stderr)',
    '    sys.exit(2)',
    'port = sys.argv[1]',
    'baud = int(sys.argv[2])',
    'with serial.Serial(port, baudrate=baud, timeout=0.2) as ser:',
    '    while True:',
    '        data = ser.read(4096)',
    '        if data:',
    '            sys.stdout.buffer.write(data)',
    '            sys.stdout.buffer.flush()',
  ].join('\n');

  serialProcess = spawn(python, ['-u', '-c', script, port, String(options.baudRate || 115200)], {
    cwd: getHardboardDir('logs'),
    env: buildHardboardEnv(),
    windowsHide: true,
  });

  serialProcess.stdout.on('data', (data: Buffer) => {
    onData({ text: decoder.decode(data, { stream: true }), timestamp: Date.now(), stream: 'stdout' });
  });

  serialProcess.stderr.on('data', (data: Buffer) => {
    onData({ text: decoder.decode(data, { stream: true }), timestamp: Date.now(), stream: 'stderr' });
  });

  serialProcess.on('exit', (code, signal) => {
    serialProcess = null;
    onExit({ code, signal });
  });

  return { ok: true };
}

export function stopSerialMonitor(): { ok: boolean } {
  if (serialStopTimer) {
    clearTimeout(serialStopTimer);
    serialStopTimer = null;
  }

  const child = serialProcess;
  serialProcess = null;
  if (!child || child.killed) return { ok: true };

  child.kill();
  serialStopTimer = setTimeout(() => {
    if (!child.killed) child.kill('SIGKILL');
  }, 1500);
  return { ok: true };
}

export async function readHardboardRuntimeEvents(sinceSeq = 0): Promise<unknown> {
  const result = await execRuntimeJson(['hardboard:events', String(Math.max(0, sinceSeq))]);
  return result;
}

export async function clearHardboardRuntimeHistory(): Promise<unknown> {
  try {
    return await execRuntimeJson(['hardboard:events-clear']);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function startHardboardBuild(options?: HardboardBuildLaunchOptions): HardboardRuntimeLaunchResult {
  const projectDir = resolveSelectedProjectDir(options?.projectDir, [
    options?.cmakeFile,
    options?.configFile,
    options?.sourceFile,
  ]);
  return spawnRuntimeCommand(['hardboard:build', projectDir], { ...options, projectDir });
}

export function startHardboardFlash(options: HardboardFlashLaunchOptions): HardboardRuntimeLaunchResult {
  if (!options.port.trim()) return { ok: false, error: '缺少串口端口' };
  const projectDir = resolveSelectedProjectDir(options.projectDir, [
    options.configFile,
    options.artifactFile,
  ]);
  return spawnRuntimeCommand(['hardboard:flash', projectDir, options.port.trim()], { ...options, projectDir });
}

export function readHardboardSourceFile(targetPath: string): { ok: boolean; path?: string; text?: string; error?: string } {
  const resolved = path.resolve(targetPath);
  const allowedRoots = [
    path.resolve(getHardboardDir('projects')),
    path.resolve(getHardboardDir('example')),
  ];
  if (!allowedRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    return { ok: false, error: '只能预览 hardboard projects/examples 内的文件' };
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return { ok: false, error: `文件不存在: ${resolved}` };
  }
  const maxBytes = 160 * 1024;
  const buffer = fs.readFileSync(resolved);
  return {
    ok: true,
    path: resolved,
    text: buffer.subarray(0, maxBytes).toString('utf-8'),
  };
}

function resolveSelectedProjectDir(explicitProjectDir: string | undefined, selectedPaths: Array<string | undefined>): string {
  const explicit = explicitProjectDir?.trim();
  if (explicit) {
    const normalized = path.normalize(explicit);
    const relativeParts = normalized.split(path.sep).filter(Boolean);
    const isHardboardProjectReference = !path.isAbsolute(normalized)
      && relativeParts.length === 3
      && relativeParts[0].toLowerCase() === 'hardboard'
      && relativeParts[1].toLowerCase() === 'projects'
      && relativeParts[2] !== '..';
    if (isHardboardProjectReference) return normalized;
    return path.resolve(explicit);
  }

  for (const selectedPath of selectedPaths) {
    if (!selectedPath) continue;
    const inferred = inferIdfProjectDir(selectedPath);
    if (inferred) return inferred;
  }

  return getHardboardDir('projects');
}

function inferIdfProjectDir(selectedPath: string): string | null {
  let current = path.resolve(selectedPath);
  try {
    if (fs.existsSync(current) && fs.statSync(current).isFile()) {
      current = path.dirname(current);
    }
  } catch {
    current = path.dirname(current);
  }

  const roots = [
    path.resolve(getHardboardDir('projects')),
    path.resolve(getHardboardDir('example')),
  ];

  while (roots.some((root) => current === root || current.startsWith(`${root}${path.sep}`))) {
    if (fs.existsSync(path.join(current, 'CMakeLists.txt'))) {
      const parent = path.dirname(current);
      if (path.basename(current).toLowerCase() === 'main' && fs.existsSync(path.join(parent, 'CMakeLists.txt'))) {
        return parent;
      }
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

function spawnRuntimeCommand(args: string[], launchOptions?: object): HardboardRuntimeLaunchResult {
  const entry = getRuntimeEntry();
  if (!fs.existsSync(entry)) {
    return { ok: false, error: `Runtime 未编译: ${entry}` };
  }

  const node = resolveRuntimeNode();
  const child = spawn(node, [entry, ...args], {
    cwd: getRuntimeDir(),
    env: {
      ...process.env,
      VIBEIDE_HARDBOARD_LAUNCH_OPTIONS: launchOptions ? JSON.stringify(launchOptions) : '',
    },
    windowsHide: true,
    stdio: 'ignore',
  });
  child.unref();
  return {
    ok: true,
    pid: child.pid,
    command: node,
    args: [entry, ...args],
  };
}

async function execRuntimeJson(args: string[]): Promise<unknown> {
  const entry = getRuntimeEntry();
  if (!fs.existsSync(entry)) {
    return {
      state: {
        generatedAt: Date.now(),
        lastSeq: 0,
        lastHeartbeatAt: null,
        activeTaskId: null,
        activeToolName: null,
        activeProjectDir: null,
        activePid: null,
        phase: 'idle',
        status: 'failed',
        progress: null,
        currentFile: null,
        currentPort: null,
        files: [],
        recent: [],
        lastError: `Runtime 未编译: ${entry}`,
      },
      events: [],
    };
  }

  const { stdout } = await execFileAsync(resolveRuntimeNode(), [entry, ...args], {
    cwd: getRuntimeDir(),
    timeout: 8000,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 2,
  });
  return JSON.parse(stdout) as unknown;
}

function getRuntimeEntry(): string {
  return path.join(getRuntimeDir(), 'dist', 'index.js');
}

function resolveRuntimeNode(): string {
  const runtimeDir = getRuntimeDir();
  const candidates = [
    path.join(runtimeDir, 'nodejs', process.platform === 'win32' ? 'node.exe' : 'bin/node'),
    process.platform === 'win32' ? 'node.exe' : 'node',
  ];
  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !fs.existsSync(candidate)) continue;
    return candidate;
  }
  return process.execPath;
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

function resolveHardboardPython(): string | null {
  const runtimeDir = getRuntimeDir();
  const idfToolsPath = path.join(runtimeDir, 'hardboard', 'esptools', 'idf-tools');
  const candidates = [
    path.join(idfToolsPath, 'python_env', 'idf5.4_py3.12_env', 'Scripts', 'python.exe'),
    path.join(idfToolsPath, 'python_env', 'idf5.4_py3.13_env', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python'),
    path.join(runtimeDir, 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python'),
    process.platform === 'win32' ? 'python.exe' : 'python3',
  ];

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !fs.existsSync(candidate)) continue;
    return candidate;
  }
  return null;
}

function buildHardboardEnv(): NodeJS.ProcessEnv {
  const runtimeDir = getRuntimeDir();
  const idfPath = path.join(runtimeDir, 'hardboard', 'esptools', 'esp-idf-v5.4.3', 'esp-idf');
  const idfToolsPath = path.join(runtimeDir, 'hardboard', 'esptools', 'idf-tools');
  const pythonEnvPath = path.join(idfToolsPath, 'python_env', 'idf5.4_py3.12_env');
  const pythonBin = path.join(pythonEnvPath, process.platform === 'win32' ? 'Scripts' : 'bin');
  return {
    ...process.env,
    IDF_PATH: idfPath,
    IDF_TOOLS_PATH: idfToolsPath,
    IDF_PYTHON_ENV_PATH: pythonEnvPath,
    ESP_IDF_VERSION: '5.4.3',
    IDF_PYTHON_CHECK_CONSTRAINTS: 'no',
    PATH: [pythonBin, process.env.PATH || ''].filter(Boolean).join(path.delimiter),
  };
}

function createDecoder(encoding: string): TextDecoder {
  const normalized = encoding.toLowerCase();
  const label = normalized === 'gbk' ? 'gb18030' : normalized;
  try {
    return new TextDecoder(label, { fatal: false });
  } catch {
    return new TextDecoder('utf-8', { fatal: false });
  }
}
