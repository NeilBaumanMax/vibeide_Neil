import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface HardboardDevice {
  port: string;
  label: string;
  source: string;
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

  const ports = ['/dev/ttyUSB0', '/dev/ttyUSB1', '/dev/ttyUSB2', '/dev/ttyACM0', '/dev/ttyACM1'];
  return ports
    .filter((port) => fs.existsSync(port))
    .map((port) => ({ port, label: path.basename(port), source: 'filesystem' }));
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
