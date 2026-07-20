import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { publishRuntimeEvent } from '../eventbus/index.js';
import { runManagedProcess } from '../process/index.js';
import { completeRuntimeTask, createRuntimeTask, failRuntimeTask, startRuntimeTask } from '../task/index.js';
import type { RuntimeTaskSource } from '../task/task-types.js';
import { RUNTIME_DIRS } from '../paths.js';
import {
  buildIdfEnv,
  createIdfLogBase,
  DEFAULT_IDF_VERSION,
  getHardboardEnvStatus,
  resolveIdfPath,
  resolveIdfPy,
  resolveProjectDir,
  resolvePython,
} from './env.js';
import { parseHardboardOutput } from './parser.js';
import { listProjectSourceFiles } from './project-files.js';
import type { HardboardCommandResult, HardboardDevice, HardboardSnapshotResult } from './types.js';

const execFileAsync = promisify(execFile);

export { getHardboardEnvStatus };
export type { HardboardCommandResult, HardboardDevice, HardboardSnapshotResult };

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
      return parseWindowsSerialPorts(stdout);
    } catch {
      return [];
    }
  }

  const candidates = ['/dev/ttyUSB0', '/dev/ttyUSB1', '/dev/ttyUSB2', '/dev/ttyACM0', '/dev/ttyACM1'];
  return candidates
    .filter((port) => fs.existsSync(port))
    .map((port) => ({ port, label: path.basename(port), source: 'filesystem' }));
}

export async function runIdfBuild(projectDir: string, version = DEFAULT_IDF_VERSION, source: RuntimeTaskSource = 'mcp'): Promise<HardboardCommandResult> {
  return runIdfCommand(resolveProjectDir(projectDir), ['build'], version, source, 'hardboard.build', 'hardboard.idf_build');
}

export async function runIdfSetTarget(projectDir: string, target = 'esp32s3', version = DEFAULT_IDF_VERSION, source: RuntimeTaskSource = 'mcp'): Promise<HardboardCommandResult> {
  return runIdfCommand(resolveProjectDir(projectDir), ['set-target', target], version, source, 'hardboard.build', 'hardboard.idf_set_target');
}

export async function runIdfFlash(projectDir: string, port: string, version = DEFAULT_IDF_VERSION, source: RuntimeTaskSource = 'mcp'): Promise<HardboardCommandResult> {
  if (!port.trim()) throw new Error('缺少串口端口，例如 COM3 或 /dev/ttyUSB0');
  return runIdfCommand(resolveProjectDir(projectDir), ['-p', port, 'flash'], version, source, 'hardboard.flash', 'hardboard.idf_flash', port);
}

export async function runIdfEraseFlash(projectDir: string, port: string, version = DEFAULT_IDF_VERSION, source: RuntimeTaskSource = 'mcp'): Promise<HardboardCommandResult> {
  if (!port.trim()) throw new Error('缺少串口端口，例如 COM3 或 /dev/ttyUSB0');
  return runIdfCommand(resolveProjectDir(projectDir), ['-p', port, 'erase-flash'], version, source, 'hardboard.erase', 'hardboard.idf_erase_flash', port);
}

export async function runIdfClean(projectDir: string, version = DEFAULT_IDF_VERSION, source: RuntimeTaskSource = 'mcp'): Promise<HardboardCommandResult> {
  return runIdfCommand(resolveProjectDir(projectDir), ['fullclean'], version, source, 'hardboard.clean', 'hardboard.idf_clean');
}

export async function runSerialCapture(
  port: string,
  durationSeconds = 20,
  baudRate = 115200,
  version = DEFAULT_IDF_VERSION,
  source: RuntimeTaskSource = 'mcp',
): Promise<HardboardCommandResult> {
  if (!port.trim()) throw new Error('缺少串口端口，例如 COM3 或 /dev/ttyUSB0');
  const python = resolvePython(version);
  if (!python) throw new Error('未找到 Python。Windows 打包版应包含 runtime/python/python.exe 或 ESP-IDF Python 环境');

  const idfPath = resolveIdfPath(version);
  const env = idfPath ? buildIdfEnv(idfPath, version, undefined, python) : process.env;
  fs.mkdirSync(RUNTIME_DIRS.hardboardLogs, { recursive: true });
  const safePort = port.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = path.join(RUNTIME_DIRS.hardboardLogs, `serial-${safePort}-${stamp}.log`);
  const script = [
    'import sys, time',
    'try:',
    '    import serial',
    'except Exception as exc:',
    '    print(f"pyserial import failed: {exc}", file=sys.stderr)',
    '    sys.exit(2)',
    'port = sys.argv[1]',
    'baud = int(sys.argv[2])',
    'seconds = float(sys.argv[3])',
    'deadline = time.monotonic() + seconds',
    'with serial.Serial(port, baudrate=baud, timeout=0.2) as ser:',
    '    while time.monotonic() < deadline:',
    '        data = ser.read(4096)',
    '        if data:',
    '            sys.stdout.write(data.decode("utf-8", "replace"))',
    '            sys.stdout.flush()',
  ].join('\n');
  const task = createRuntimeTask({ source, kind: 'hardboard.serial', port, toolName: 'hardboard.serial_capture' });
  const started = startRuntimeTask(task);
  publishRuntimeEvent({
    source,
    kind: 'tool.started',
    taskId: task.taskId,
    toolName: 'hardboard.serial_capture',
    payload: { port, baudRate, durationSeconds },
  });
  const result = await runManagedProcess({
    task: started,
    command: python,
    args: ['-c', script, port, String(baudRate), String(Math.max(1, durationSeconds))],
    cwd: RUNTIME_DIRS.hardboardLogs,
    env,
  });
  fs.writeFileSync(logPath, result.stdout, 'utf-8');
  completeRuntimeTask({ ...started, pid: result.pid ?? undefined }, result.exitCode);
  publishRuntimeEvent({
    source,
    kind: result.exitCode === 0 ? 'tool.completed' : 'tool.failed',
    taskId: task.taskId,
    pid: result.pid ?? undefined,
    toolName: 'hardboard.serial_capture',
    message: result.exitCode === 0 ? undefined : result.stderr || '串口采集失败',
    payload: { exitCode: result.exitCode, port, logPath },
  });
  return {
    command: result.commandLine,
    cwd: RUNTIME_DIRS.hardboardLogs,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    logPath,
    taskId: task.taskId,
    pid: result.pid,
  };
}

export function createHardboardSnapshot(projectDir: string, label = ''): HardboardSnapshotResult {
  const resolvedProjectDir = resolveProjectDir(projectDir);
  if (!fs.existsSync(resolvedProjectDir)) throw new Error(`ESP-IDF 项目目录不存在: ${resolvedProjectDir}`);
  const projectName = path.basename(resolvedProjectDir);
  const safeLabel = label.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotDir = path.join(RUNTIME_DIRS.hardboardSnapshots, `${stamp}-${projectName}${safeLabel ? `-${safeLabel}` : ''}`);
  fs.mkdirSync(snapshotDir, { recursive: true });
  let filesCopied = 0;
  copyProjectSnapshot(resolvedProjectDir, snapshotDir, () => {
    filesCopied += 1;
  });
  fs.writeFileSync(path.join(snapshotDir, 'SNAPSHOT.md'), [
    `# ${projectName} snapshot`,
    '',
    `- Source: ${resolvedProjectDir}`,
    `- Created: ${new Date().toISOString()}`,
    `- Label: ${safeLabel || '(none)'}`,
    `- Files copied: ${filesCopied}`,
    '',
  ].join('\n'), 'utf-8');
  return { projectDir: resolvedProjectDir, snapshotDir, filesCopied };
}

export async function runIdfCommand(
  projectDir: string,
  args: string[],
  version = DEFAULT_IDF_VERSION,
  source: RuntimeTaskSource = 'mcp',
  taskKind: 'hardboard.build' | 'hardboard.flash' | 'hardboard.clean' | 'hardboard.erase' = 'hardboard.build',
  toolName = 'hardboard.idf_command',
  port?: string,
): Promise<HardboardCommandResult> {
  const resolvedProjectDir = resolveProjectDir(projectDir || RUNTIME_DIRS.hardboardProjects);
  const task = createRuntimeTask({ source, kind: taskKind, projectDir: resolvedProjectDir, port, toolName });
  const startedTask = startRuntimeTask(task);

  const failBeforeProcess = (message: string): HardboardCommandResult => {
    failRuntimeTask(startedTask, message);
    publishRuntimeEvent({
      source,
      kind: 'tool.failed',
      taskId: task.taskId,
      toolName,
      projectDir: resolvedProjectDir,
      message,
      payload: { exitCode: 1, ok: false, port, launchOptions: readLaunchOptions() },
    });
    publishRuntimeEvent({
      source: 'hardboard',
      kind: taskKind === 'hardboard.flash' || taskKind === 'hardboard.erase' ? 'hardboard.flash.completed' : 'hardboard.build.completed',
      taskId: task.taskId,
      projectDir: resolvedProjectDir,
      message,
      payload: { exitCode: 1, ok: false, port, launchOptions: readLaunchOptions() },
    });
    return {
      command: '',
      cwd: resolvedProjectDir,
      exitCode: 1,
      stdout: '',
      stderr: message,
      taskId: task.taskId,
      pid: null,
    };
  };

  if (!fs.existsSync(resolvedProjectDir)) return failBeforeProcess(`ESP-IDF 项目目录不存在: ${resolvedProjectDir}`);

  const idfPath = resolveIdfPath(version);
  if (!idfPath) return failBeforeProcess(`未找到 ESP-IDF ${version}`);
  const python = resolvePython(version);
  if (!python) return failBeforeProcess('未找到 Python。Windows 打包版应包含 runtime/python/python.exe');
  const idfPy = resolveIdfPy(idfPath);
  fs.mkdirSync(RUNTIME_DIRS.hardboardLogs, { recursive: true });

  const commandArgs = [idfPy, ...args];
  const env = buildIdfEnv(idfPath, version, resolvedProjectDir, python);
  const logBase = createIdfLogBase(args, resolvedProjectDir);
  const launchOptions = readLaunchOptions();

  publishRuntimeEvent({
    source,
    kind: 'tool.started',
    taskId: task.taskId,
    toolName,
    projectDir: resolvedProjectDir,
    payload: { args, port, version, launchOptions },
  });

  publishRuntimeEvent({
    source: 'hardboard',
    kind: taskKind === 'hardboard.flash' || taskKind === 'hardboard.erase' ? 'hardboard.flash.started' : 'hardboard.build.started',
    taskId: task.taskId,
    projectDir: resolvedProjectDir,
    payload: { args, port, launchOptions },
  });

  const files = listProjectSourceFiles(resolvedProjectDir);
  publishRuntimeEvent({
    source: 'hardboard',
    kind: 'hardboard.project.files',
    taskId: task.taskId,
    projectDir: resolvedProjectDir,
    payload: { files },
  });

  const handleChunk = (chunk: string) => {
    for (const parsed of parseHardboardOutput(chunk)) {
      const isFlash = parsed.kind.startsWith('flash');
      publishRuntimeEvent({
        source: 'hardboard',
        kind: `hardboard.${parsed.kind}`,
        taskId: task.taskId,
        projectDir: resolvedProjectDir,
        message: parsed.message,
        payload: {
          progress: parsed.progress,
          file: parsed.file,
          port,
        },
      });
      if (!isFlash && parsed.kind === 'build.file') {
        // No-op branch kept for future build-file enrichment.
      }
    }
  };

  try {
    const result = await runManagedProcess({
      task: startedTask,
      command: python,
      args: commandArgs,
      cwd: resolvedProjectDir,
      env,
      onStdout: handleChunk,
      onStderr: handleChunk,
    });
    const logs = writeCommandLogs(logBase, result.stdout, result.stderr);
    const completedTask = completeRuntimeTask({ ...startedTask, pid: result.pid ?? undefined }, result.exitCode);
    publishRuntimeEvent({
      source,
      kind: result.exitCode === 0 ? 'tool.completed' : 'tool.failed',
      taskId: task.taskId,
      pid: result.pid ?? undefined,
      toolName,
      projectDir: resolvedProjectDir,
      message: result.exitCode === 0 ? undefined : result.stderr || 'hardboard 命令失败',
      payload: { exitCode: result.exitCode, ok: result.exitCode === 0, port, launchOptions },
    });
    publishRuntimeEvent({
      source: 'hardboard',
      kind: taskKind === 'hardboard.flash' || taskKind === 'hardboard.erase' ? 'hardboard.flash.completed' : 'hardboard.build.completed',
      taskId: task.taskId,
      pid: result.pid ?? undefined,
      projectDir: resolvedProjectDir,
      message: result.exitCode === 0 ? undefined : result.stderr || 'hardboard 命令失败',
      payload: { exitCode: result.exitCode, ok: result.exitCode === 0, task: completedTask, launchOptions },
    });
    return {
      command: result.commandLine,
      cwd: resolvedProjectDir,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      ...logs,
      taskId: task.taskId,
      pid: result.pid,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failRuntimeTask(startedTask, message);
    publishRuntimeEvent({
      source,
      kind: 'tool.failed',
      taskId: task.taskId,
      toolName,
      projectDir: resolvedProjectDir,
      message,
      payload: { exitCode: 1, ok: false, port, launchOptions },
    });
    return {
      command: `${python} ${commandArgs.join(' ')}`,
      cwd: resolvedProjectDir,
      exitCode: 1,
      stdout: '',
      stderr: message,
      taskId: task.taskId,
      pid: null,
    };
  }
}

function readLaunchOptions(): Record<string, unknown> | null {
  const raw = process.env.VIBEIDE_HARDBOARD_LAUNCH_OPTIONS;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function writeCommandLogs(logBase: string, stdout: string, stderr: string): Pick<HardboardCommandResult, 'logPath' | 'stdoutLogPath' | 'stderrLogPath'> {
  const stdoutLogPath = `${logBase}.stdout.log`;
  const stderrLogPath = `${logBase}.stderr.log`;
  fs.writeFileSync(stdoutLogPath, stdout, 'utf-8');
  fs.writeFileSync(stderrLogPath, stderr, 'utf-8');
  return { logPath: stdoutLogPath, stdoutLogPath, stderrLogPath };
}

function copyProjectSnapshot(sourceDir: string, targetDir: string, onFile: () => void): void {
  const ignoredDirs = new Set(['build', '.git', 'managed_components', '.cache']);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      copyProjectSnapshot(source, target, onFile);
    } else if (entry.isFile()) {
      fs.copyFileSync(source, target);
      onFile();
    }
  }
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
      return [{ port: item.DeviceID, label: item.Name || item.DeviceID, source: 'Win32_SerialPort' }];
    });
  } catch {
    return [];
  }
}
