const CDP_LIST = 'http://127.0.0.1:9230/json';

async function call(socket, id, method, params = {}) {
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

async function main() {
  let targets;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      targets = await fetch(CDP_LIST).then((response) => response.json());
      if (targets.some((entry) => entry.title?.includes('Catnip Forge'))) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const target = targets?.find((entry) => entry.title?.includes('Catnip Forge'));
  if (!target?.webSocketDebuggerUrl) throw new Error('packaged renderer CDP target not found');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  try {
    const evaluated = await call(socket, 1, 'Runtime.evaluate', {
      expression: `(async () => {
        const status = await window.electronAPI.getStartupStatus();
        const rejected = await window.electronAPI.saveStartupApiKey('sk-your-key-here');
        const brandIcon = document.querySelector('.chat-history-brand img');
        const brandRect = brandIcon?.getBoundingClientRect();
        const startupIcon = document.querySelector('.startup-key-brand img');
        return {
          modal: Boolean(document.querySelector('.startup-key-dialog')),
          skillButton: Boolean(document.querySelector('.chat-skill-button')),
          title: document.title,
          brandIconLoaded: Boolean(brandIcon?.complete && brandIcon?.naturalWidth > 0),
          brandIconSize: brandRect ? { width: brandRect.width, height: brandRect.height } : null,
          startupIconLoaded: Boolean(startupIcon?.complete && startupIcon?.naturalWidth > 0),
          positioningVisible: document.querySelector('.startup-key-positioning')?.textContent?.includes('Autonomous Hardware Development Agent') === true,
          firstRun: status.firstRun,
          apiKeyReady: status.apiKeyReady,
          playwrightReady: status.playwrightReady,
          keyPath: status.keyPath,
          placeholderRejected: rejected.ok === false,
        };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const result = evaluated.result?.value;
    const ok = result?.modal && result?.skillButton && result?.firstRun && !result?.apiKeyReady
      && result?.playwrightReady && result?.placeholderRejected && /resources[\\/]apikey\.txt$/i.test(result?.keyPath || '');
    const branded = result?.title?.includes('Catnip Forge') && result?.brandIconLoaded && result?.startupIconLoaded
      && result?.positioningVisible && result?.brandIconSize?.width === 26 && result?.brandIconSize?.height === 26;
    if (!ok || !branded) throw new Error(`packaged first-run verification failed: ${JSON.stringify(result)}`);
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } finally {
    socket.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
