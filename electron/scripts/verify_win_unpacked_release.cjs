const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const asar = require('@electron/asar');

const electronRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(electronRoot, '..');
const packageRoot = process.env.CATNIP_PACKAGE_ROOT
  ? path.resolve(process.env.CATNIP_PACKAGE_ROOT)
  : path.join(electronRoot, 'dist-package', 'win-unpacked');
const resources = path.join(packageRoot, 'resources');
const version = JSON.parse(fs.readFileSync(path.join(projectRoot, 'config', 'version.json'), 'utf-8'));
const exe = path.join(packageRoot, `${version.productName}.exe`);

assert.equal(version.publicVersion, '1.0.0');
assert.equal(version.buildNumber, 7201);
assert(fs.existsSync(exe), `missing ${exe}`);
assert(fs.existsSync(path.join(packageRoot, 'README-FIRST.txt')), 'missing distribution README');
assert(fs.existsSync(path.join(resources, 'app.asar')), 'missing app.asar');
const assistantGuidePath = path.join(resources, 'CATNIP_FORGE_USER_GUIDE.md');
assert(fs.existsSync(assistantGuidePath), 'missing editable software assistant guide');
const assistantGuide = fs.readFileSync(assistantGuidePath, 'utf-8');
assert(assistantGuide.includes('# Catnip Forge 软件使用手册'), 'software assistant guide title drifted');
assert(assistantGuide.includes('## 12. 回答边界'), 'software assistant guide is incomplete');
assert(!fs.existsSync(path.join(resources, 'apikey.txt')), 'release must not contain a real apikey.txt');
const keyExample = fs.readFileSync(path.join(resources, 'apikey.txt.example'), 'utf-8');
const keyLines = keyExample.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
assert.deepEqual(keyLines, ['DEEPSEEK_API_KEY=sk-your-key-here'], 'API key example must contain only the documented placeholder');
const distributionReadme = fs.readFileSync(path.join(packageRoot, 'README-FIRST.txt'), 'utf-8');
assert(distributionReadme.includes('v1.0.0（Build 7201）'), 'distribution README version drifted');
assert(distributionReadme.includes('D:\\CatnipForge'), 'distribution README must recommend the current short product path');
assert(!distributionReadme.includes('Odyssey'), 'distribution README contains the retired product name');

const required = [
  'agent/node_modules/@anthropic-ai/claude-code/bin/claude.exe',
  'agent/skills/espidf_hardboard.md',
  'electron/assets/icon.ico',
  'electron/assets/icon.png',
  'runtime/nodejs/node.exe',
  'runtime/python/Scripts/python.exe',
  'runtime/python/Lib/site-packages/serial',
  'runtime/dist/index.js',
  'runtime/dist/mcp/server.js',
  'runtime/playwright/chromium-1223',
  'runtime/hardboard/esptools/esp-idf-v5.4.3/esp-idf',
  'config/version.json',
];
for (const relative of required) {
  assert(fs.existsSync(path.join(resources, relative)), `missing resources/${relative}`);
}

const packagedVersion = JSON.parse(fs.readFileSync(path.join(resources, 'config', 'version.json'), 'utf-8'));
assert.deepEqual(packagedVersion, version, 'packaged version metadata drifted');
const asarEntries = new Set(asar.listPackage(path.join(resources, 'app.asar')));
for (const entry of [
  '\\assets\\icon.ico',
  '\\assets\\icon.png',
  '\\assets\\splash.html',
  '\\assets\\splash-cat.png',
  '\\assets\\splash-leaf.png',
  '\\assets\\splash-logo.png',
  '\\dist\\main\\skill-manager.js',
  '\\dist\\renderer\\index.html',
]) {
  assert(asarEntries.has(entry), `app.asar missing ${entry}`);
}

const nodeVersion = run(path.join(resources, 'runtime', 'nodejs', 'node.exe'), ['--version']);
const pythonResult = run(path.join(resources, 'runtime', 'python', 'Scripts', 'python.exe'), ['-c', 'import serial; print(serial.VERSION)']);
const claudeVersion = run(path.join(resources, 'agent', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'), ['--version']);
assert.match(nodeVersion, /^v\d+/);
assert.equal(pythonResult, '3.5');
assert.match(claudeVersion, /Claude Code/i);

const runtimeDir = path.join(resources, 'runtime');
const health = JSON.parse(run(path.join(runtimeDir, 'nodejs', 'node.exe'), [path.join(runtimeDir, 'dist', 'index.js'), 'health'], runtimeDir));
assert.equal(health.ok, true);
assert.equal(path.resolve(health.runtimeDir), path.resolve(runtimeDir));

const forbidden = ['C:\\Users\\HP', 'E:\\Agent\\vibeide\\vibeide'];
for (const file of [
  path.join(resources, 'runtime', 'dist', 'index.js'),
  path.join(resources, 'runtime', 'dist', 'mcp', 'server.js'),
  path.join(resources, 'config', 'version.json'),
]) {
  const text = fs.readFileSync(file, 'utf-8');
  for (const value of forbidden) assert(!text.includes(value), `${file} contains developer-machine path ${value}`);
}

const totalBytes = directoryBytes(packageRoot);
assert(totalBytes > 3_000_000_000, 'release appears incomplete (expected bundled toolchains)');
console.log(JSON.stringify({
  ok: true,
  publicVersion: `v${version.publicVersion}`,
  buildNumber: version.buildNumber,
  exe,
  totalBytes,
  nodeVersion,
  python: `pyserial ${pythonResult}`,
  claudeVersion,
  apiKeyBundled: false,
}, null, 2));

function run(command, args, cwd = packageRoot) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf-8', windowsHide: true, timeout: 30_000 });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr || result.stdout}`);
  return String(result.stdout || result.stderr).trim();
}

function directoryBytes(folder) {
  let total = 0;
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) total += directoryBytes(file);
    else if (entry.isFile()) total += fs.statSync(file).size;
  }
  return total;
}
