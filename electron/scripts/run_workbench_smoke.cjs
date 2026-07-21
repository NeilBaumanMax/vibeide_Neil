const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const resultFile = path.join(os.tmpdir(), `vibeide-workbench-smoke-${process.pid}.json`);
const smokeUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'vibeide-workbench-userdata-'));
const electronCli = path.join(root, 'node_modules', 'electron', 'cli.js');

try {
  fs.rmSync(resultFile, { force: true });
} catch {
  // ignore
}

const child = spawn(process.execPath, [electronCli, '--disable-gpu', `--user-data-dir=${smokeUserData}`, '.'], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    VIBEIDE_SMOKE_WORKBENCH_OPEN: '1',
    VIBEIDE_SMOKE_RESULT_FILE: resultFile,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
const cleanup = () => {
  try { fs.rmSync(smokeUserData, { recursive: true, force: true }); } catch { /* ignore */ }
};
child.stdout.on('data', (chunk) => {
  output += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  output += chunk.toString();
});

const startedAt = Date.now();
const timeoutMs = 30000;

const timer = setInterval(() => {
  if (fs.existsSync(resultFile)) {
    clearInterval(timer);
    const raw = fs.readFileSync(resultFile, 'utf-8');
    const result = JSON.parse(raw);
    if (result.ok && result.url && String(result.url).startsWith('file://')) {
      console.log(`workbench smoke ok: ${result.kind} ${result.path}`);
      child.kill();
      cleanup();
      process.exit(0);
    }
    console.error(`workbench smoke failed: ${raw}`);
    child.kill();
    cleanup();
    process.exit(1);
  }

  if (Date.now() - startedAt > timeoutMs) {
    clearInterval(timer);
    console.error('workbench smoke timed out');
    console.error(output.slice(-4000));
    child.kill();
    cleanup();
    process.exit(1);
  }
}, 250);

child.on('exit', (code) => {
  if (!fs.existsSync(resultFile)) {
    clearInterval(timer);
    console.error(`electron exited before smoke result, code=${code}`);
    console.error(output.slice(-4000));
    cleanup();
    process.exit(1);
  }
});
