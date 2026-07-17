const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const versionInfo = readJson('config/version.json');
const packageFiles = [
  'electron/package.json',
  'runtime/package.json',
  'agent/package.json',
];
const lockFiles = [
  'electron/package-lock.json',
  'runtime/package-lock.json',
  'agent/package-lock.json',
];

for (const file of packageFiles) {
  const manifest = readJson(file);
  if (manifest.version !== versionInfo.packageVersion) {
    throw new Error(`${file}: expected ${versionInfo.packageVersion}, got ${manifest.version}`);
  }
}

for (const file of lockFiles) {
  const lock = readJson(file);
  if (lock.version !== versionInfo.packageVersion || lock.packages?.['']?.version !== versionInfo.packageVersion) {
    throw new Error(`${file}: root lock version must be ${versionInfo.packageVersion}`);
  }
}

requireText(readText('pyproject.toml'), `version = "${versionInfo.releaseVersion}"`, 'pyproject.toml');

const builder = readText('electron/electron-builder.yml');
requireText(builder, `productName: ${versionInfo.productName}`, 'electron/electron-builder.yml');
requireText(builder, `buildVersion: ${versionInfo.releaseVersion}`, 'electron/electron-builder.yml');

const productFiles = [
  'electron/src/main/index.ts',
  'electron/src/main/tray.ts',
  'electron/src/main/worker/context.ts',
  'electron/src/main/worker/quick-tasks.ts',
  'electron/src/renderer/index.html',
  'electron/src/renderer/components/BrowserPanel.tsx',
];

for (const file of productFiles) {
  requireText(readText(file), versionInfo.productName, file);
}

console.log(JSON.stringify(versionInfo, null, 2));

function readJson(file) {
  return JSON.parse(readText(file));
}

function readText(file) {
  return fs.readFileSync(path.join(root, file), 'utf-8');
}

function requireText(text, expected, file) {
  if (!text.includes(expected)) {
    throw new Error(`${file}: missing ${expected}`);
  }
}
