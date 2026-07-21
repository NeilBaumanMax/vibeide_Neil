const fs = require('node:fs');

const CDP_LIST = 'http://127.0.0.1:9230/json';
const DUMMY_KEY = 'sk-catnip-first-run-restart-smoke-only';

async function cdpCall(socket, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 15_000);
    const onMessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== id) return;
      clearTimeout(timer);
      socket.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function connect(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return socket;
}

async function findTarget(excludedId = '') {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const targets = await fetch(CDP_LIST).then((response) => response.json());
      const target = targets.find((entry) => entry.title?.includes('Catnip Forge ·') && entry.id !== excludedId);
      if (target?.webSocketDebuggerUrl) return target;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Catnip Forge renderer did not reappear after relaunch');
}

async function main() {
  const initialTarget = await findTarget();
  const initialSocket = await connect(initialTarget);
  let keyPath = '';
  try {
    const statusEvaluation = await cdpCall(initialSocket, 1, 'Runtime.evaluate', {
      expression: `(async () => window.electronAPI.getStartupStatus())()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const before = statusEvaluation.result?.value;
    keyPath = before?.keyPath || '';
    if (!before?.firstRun || !keyPath || fs.existsSync(keyPath)) throw new Error('restart smoke requires a clean package without apikey.txt');
    const saveEvaluation = await cdpCall(initialSocket, 2, 'Runtime.evaluate', {
      expression: `(async () => window.electronAPI.saveStartupApiKey(${JSON.stringify(DUMMY_KEY)}))()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const result = saveEvaluation.result?.value;
    if (!result?.ok || !result?.restarting) throw new Error(`save did not schedule relaunch: ${JSON.stringify(result)}`);
  } finally {
    initialSocket.close();
  }

  const relaunchedTarget = await findTarget(initialTarget.id);
  const relaunchedSocket = await connect(relaunchedTarget);
  try {
    const evaluated = await cdpCall(relaunchedSocket, 3, 'Runtime.evaluate', {
      expression: `(async () => ({ status: await window.electronAPI.getStartupStatus(), modal: Boolean(document.querySelector('.startup-key-dialog')), title: document.title }))()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const value = evaluated.result?.value;
    if (!value?.status?.apiKeyReady || value?.status?.firstRun || value?.modal || !value?.title?.includes('Catnip Forge')) {
      throw new Error(`relaunched app is not ready: ${JSON.stringify(value)}`);
    }
    console.log(JSON.stringify({ ok: true, relaunched: true, apiKeyReady: true, firstRun: false, modal: false, title: value.title }, null, 2));
  } finally {
    relaunchedSocket.close();
    if (keyPath && fs.existsSync(keyPath)) {
      const content = fs.readFileSync(keyPath, 'utf-8');
      if (content === `DEEPSEEK_API_KEY=${DUMMY_KEY}\n`) fs.unlinkSync(keyPath);
      else throw new Error('refusing to remove API key file because it is not the smoke-test value');
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
