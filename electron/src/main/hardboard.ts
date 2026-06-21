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
    onData({ text: decoder.decode(data, { stream: true }), timestamp: Date.now() });
  });

  serialProcess.stderr.on('data', (data: Buffer) => {
    onData({ text: decoder.decode(data, { stream: true }), timestamp: Date.now() });
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
