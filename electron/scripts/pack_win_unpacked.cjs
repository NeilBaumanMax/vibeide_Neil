const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const electronRoot = path.resolve(__dirname, '..');
const versionInfo = JSON.parse(fs.readFileSync(path.join(electronRoot, '..', 'config', 'version.json'), 'utf-8'));
const exePath = path.join(electronRoot, 'dist-package', 'win-unpacked', `${versionInfo.productName}.exe`);
const builder = path.join(electronRoot, 'node_modules', 'electron-builder', 'cli.js');
const stamp = path.join(electronRoot, 'scripts', 'stamp_win_exe_version.cjs');

const result = spawnSync(process.execPath, [builder, '--win', '--x64', '--dir'], {
  cwd: electronRoot,
  stdio: 'inherit',
  env: process.env,
});

if (result.status !== 0 && !fs.existsSync(exePath)) {
  process.exit(result.status || 1);
}

if (result.status !== 0) {
  console.warn('[pack:win] electron-builder failed after creating win-unpacked; continuing to stamp the unpacked exe.');
}

const stampResult = spawnSync(process.execPath, [stamp, exePath], {
  cwd: electronRoot,
  stdio: 'inherit',
  env: process.env,
});

process.exit(stampResult.status || 0);
