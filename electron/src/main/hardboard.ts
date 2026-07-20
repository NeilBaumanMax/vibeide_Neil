import { ChildProcessWithoutNullStreams, execFile, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { TextDecoder } from 'node:util';
import { getHardboardDir, getResourcesDir, getRuntimeDir } from './paths';

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
  dataBits?: number;
  stopBits?: number;
  parity?: 'none' | 'odd' | 'even';
}

export interface SerialMonitorChunk {
  text: string;
  hex?: string;
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

export async function listHardboardDevices(): Promise<HardboardDevice[]> {
  if (process.platform === 'win32') {
    const powershell = process.env.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'powershell.exe';
    try {
      const { stdout } = await execFileAsync(powershell, [
        '-NoProfile',
        '-Command',
        '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Get-CimInstance Win32_SerialPort | Select-Object DeviceID,Name | ConvertTo-Json -Compress',
      ], { timeout: 8000, windowsHide: true });
      const devices = parseWindowsSerialPorts(stdout);
      if (devices.length) return devices;
    } catch {
      // Some installed Windows environments deny access to Win32_SerialPort.
    }
    return listWindowsSerialPortsWithPython();
  }

  const ports = ['/dev/ttyUSB0', '/dev/ttyUSB1', '/dev/ttyUSB2', '/dev/ttyACM0', '/dev/ttyACM1'];
  return ports
    .filter((port) => fs.existsSync(port))
    .map((port) => ({ port, label: path.basename(port), source: 'filesystem' }));
}

async function listWindowsSerialPortsWithPython(): Promise<HardboardDevice[]> {
  const python = resolveHardboardPython();
  if (!python) return [];
  const script = [
    'import json',
    'from serial.tools import list_ports',
    'items = [{"port": p.device, "label": p.description or p.device, "source": "pyserial"} for p in list_ports.comports()]',
    'print(json.dumps(items, ensure_ascii=False))',
  ].join('\n');
  try {
    const { stdout } = await execFileAsync(python, ['-c', script], {
      timeout: 8000,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    const parsed = JSON.parse(stdout.trim() || '[]') as HardboardDevice[];
    return Array.isArray(parsed) ? parsed.filter((item) => item?.port) : [];
  } catch {
    return [];
  }
}

export function isSerialMonitorRunning(): boolean {
  return Boolean(serialProcess && !serialProcess.killed);
}

export async function startSerialMonitor(options: SerialMonitorOptions, onData: (chunk: SerialMonitorChunk) => void, onExit: (result: { code: number | null; signal: NodeJS.Signals | null }) => void): Promise<{ ok: boolean; error?: string }> {
  await stopSerialMonitor();

  const port = options.port.trim();
  if (!port) return { ok: false, error: '缺少串口端口' };

  const python = resolveHardboardPython();
  if (!python) return { ok: false, error: '未找到随包 Python 或 ESP-IDF Python 环境' };

  const decoder = createDecoder(options.encoding);
  fs.mkdirSync(getHardboardDir('logs'), { recursive: true });
  const script = [
    'import sys, json, re, threading',
    'try:',
    '    import serial',
    'except Exception as exc:',
    '    print(f"pyserial import failed: {exc}", file=sys.stderr)',
    '    sys.exit(2)',
    'port, baud = sys.argv[1], int(sys.argv[2])',
    'data_bits, stop_bits, parity = int(sys.argv[3]), float(sys.argv[4]), sys.argv[5]',
    'try:',
    '    ser = serial.Serial(port, baudrate=baud, bytesize=data_bits, stopbits=stop_bits, parity={"none":"N","odd":"O","even":"E"}.get(parity,"N"), timeout=0.2, write_timeout=2)',
    'except Exception as exc:',
    '    message = str(exc)',
    '    if "PermissionError" in message or "Access is denied" in message or "拒绝访问" in message:',
    '        print(f"[串口] {port} 被其他程序占用，请关闭其他串口监视器后重试。", file=sys.stderr)',
    '    else:',
    '        print(f"[串口] 无法打开 {port}: {message}", file=sys.stderr)',
    '    sys.exit(3)',
    'running = True',
    'def receive():',
    '    global running',
    '    try:',
    '        while running:',
    '            data = ser.read(4096)',
    '            if data:',
    '                sys.stdout.buffer.write(data)',
    '                sys.stdout.buffer.flush()',
    '    except Exception as exc:',
    '        print(f"[串口] 接收失败: {exc}", file=sys.stderr)',
    '    running = False',
    'threading.Thread(target=receive, daemon=True).start()',
    'try:',
    '    for line in sys.stdin:',
    '        command = json.loads(line)',
    '        if command.get("mode") == "hex":',
    '            cleaned = re.sub(r"[^0-9A-Fa-f]", "", command.get("data", ""))',
    '            if len(cleaned) % 2: raise ValueError("HEX 数据必须是完整字节（两个十六进制字符）")',
    '            payload = bytes.fromhex(cleaned)',
    '        else:',
    '            encoding = {"gbk":"gbk", "ascii":"ascii", "latin1":"latin-1"}.get(command.get("encoding"), "utf-8")',
    '            payload = command.get("data", "").encode(encoding, errors="replace")',
    '        if payload: ser.write(payload)',
    'except Exception as exc:',
    '    print(f"[串口] 发送失败: {exc}", file=sys.stderr)',
    'finally:',
    '    running = False',
    '    ser.close()',
  ].join('\n');

  const child = spawn(python, [
    '-u', '-c', script, port, String(options.baudRate || 115200),
    String(options.dataBits || 8), String(options.stopBits || 1), options.parity || 'none',
  ], {
    cwd: getHardboardDir('logs'),
    env: buildHardboardEnv(),
    windowsHide: true,
  });

  serialProcess = child;
  child.stdout.on('data', (data: Buffer) => {
    onData({ text: decoder.decode(data, { stream: true }), hex: [...data].map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' '), timestamp: Date.now(), stream: 'stdout' });
  });

  child.stderr.on('data', (data: Buffer) => {
    onData({ text: data.toString('utf8'), timestamp: Date.now(), stream: 'stderr' });
  });

  child.on('exit', (code, signal) => {
    if (serialProcess === child) serialProcess = null;
    onExit({ code, signal });
  });

  child.on('error', (error) => {
    onData({ text: `[串口] 启动失败: ${error.message}\n`, timestamp: Date.now(), stream: 'stderr' });
  });

  return { ok: true };
}

export async function stopSerialMonitor(): Promise<{ ok: boolean }> {
  const child = serialProcess;
  serialProcess = null;
  if (!child || child.killed) return { ok: true };

  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.stdin.end();
  await Promise.race([
    exited,
    new Promise<void>((resolve) => setTimeout(resolve, 1200)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  return { ok: true };
}

export function writeSerialMonitor(data: string, mode: 'text' | 'hex', encoding: string): { ok: boolean; error?: string } {
  const child = serialProcess;
  if (!child || child.killed || !child.stdin.writable) return { ok: false, error: '串口尚未打开' };
  try {
    child.stdin.write(`${JSON.stringify({ data, mode, encoding })}\n`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
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
  if (process.platform !== 'win32') return 'python3';

  const packagedRoot = path.join(runtimeDir, 'python');
  const developmentRoot = path.join(getResourcesDir(), '_bundled', 'python');
  prepareDevelopmentPython(developmentRoot);
  const candidates = [
    process.env.VIBEIDE_PYTHON,
    path.join(packagedRoot, 'Scripts', 'python.exe'),
    path.join(developmentRoot, 'Scripts', 'python.exe'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !fs.existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ['--version'], {
      windowsHide: true,
      stdio: 'ignore',
      timeout: 3000,
    });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

function prepareDevelopmentPython(pythonRoot: string): void {
  const sourcePython = path.join(pythonRoot, 'python.exe');
  if (!fs.existsSync(sourcePython)) return;
  try {
    const scriptsDir = path.join(pythonRoot, 'Scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    const scriptsPython = path.join(scriptsDir, 'python.exe');
    if (!fs.existsSync(scriptsPython)) fs.copyFileSync(sourcePython, scriptsPython);

    const siteCustomizeSource = path.join(getRuntimeDir(), 'python', 'sitecustomize.py');
    const sitePackages = path.join(pythonRoot, 'Lib', 'site-packages');
    if (fs.existsSync(siteCustomizeSource) && fs.existsSync(sitePackages)) {
      fs.copyFileSync(siteCustomizeSource, path.join(sitePackages, 'sitecustomize.py'));
    }
  } catch {
    // electron-builder creates the production layout ahead of time.
  }
}

function buildHardboardEnv(): NodeJS.ProcessEnv {
  const runtimeDir = getRuntimeDir();
  const idfPath = path.join(runtimeDir, 'hardboard', 'esptools', 'esp-idf-v5.4.3', 'esp-idf');
  const idfToolsPath = path.join(runtimeDir, 'hardboard', 'esptools', 'idf-tools');
  const python = resolveHardboardPython();
  const pythonEnvPath = python && process.platform === 'win32' ? path.dirname(path.dirname(python)) : '';
  const pythonBin = python ? path.dirname(python) : '';
  return {
    ...process.env,
    IDF_PATH: idfPath,
    IDF_TOOLS_PATH: idfToolsPath,
    ...(pythonEnvPath ? { IDF_PYTHON_ENV_PATH: pythonEnvPath, PYTHONHOME: pythonEnvPath, PYTHONNOUSERSITE: '1' } : {}),
    ...(python ? { PYTHON: python } : {}),
    PYTHONIOENCODING: 'utf-8',
    ESP_IDF_VERSION: '5.4.3',
    IDF_PYTHON_CHECK_CONSTRAINTS: 'no',
    PATH: [pythonEnvPath, pythonBin, process.env.PATH || ''].filter(Boolean).join(path.delimiter),
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
