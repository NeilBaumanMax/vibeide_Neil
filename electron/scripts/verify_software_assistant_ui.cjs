const fs = require('node:fs');
const path = require('node:path');

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
  let targets = [];
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      targets = await fetch(CDP_LIST).then((response) => response.json());
      if (targets.some((entry) => entry.title?.includes('Catnip Forge'))) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const target = targets.find((entry) => entry.title?.includes('Catnip Forge'));
  if (!target?.webSocketDebuggerUrl) throw new Error('Catnip Forge renderer CDP target not found');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  try {
    const evaluated = await call(socket, 1, 'Runtime.evaluate', {
      expression: `(async () => {
        const trigger = document.querySelector('.appearance-settings-trigger');
        trigger?.click();
        await new Promise((resolve) => setTimeout(resolve, 180));
        const popover = document.querySelector('.software-assistant-popover');
        const triggerImage = trigger?.querySelector('img');
        const rect = popover?.getBoundingClientRect();
        return {
          triggerImageLoaded: Boolean(triggerImage?.complete && triggerImage?.naturalWidth > 0),
          popoverVisible: Boolean(popover),
          rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
          viewport: { width: innerWidth, height: innerHeight },
          title: popover?.querySelector('.software-assistant-identity strong')?.textContent,
          welcome: popover?.querySelector('.software-assistant-message--assistant')?.textContent,
          textarea: Boolean(popover?.querySelector('textarea')),
          actionButtons: popover?.querySelectorAll('.software-assistant-actions button').length || 0,
        };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const result = evaluated.result?.value;
    const rect = result?.rect;
    const inViewport = rect && rect.left >= 0 && rect.top >= 0
      && rect.right <= result.viewport.width && rect.bottom <= result.viewport.height;
    if (!result?.triggerImageLoaded || !result?.popoverVisible || !result?.textarea || result?.actionButtons !== 3
      || result?.title !== '猫薄荷' || !result?.welcome?.includes('Catnip Forge') || !inViewport) {
      throw new Error(`software assistant UI verification failed: ${JSON.stringify(result)}`);
    }

    const screenshot = await call(socket, 2, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const outputDir = path.join(__dirname, '..', '.tmp');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'software-assistant-ui.png');
    fs.writeFileSync(outputPath, Buffer.from(screenshot.data, 'base64'));
    console.log(JSON.stringify({ ok: true, screenshot: outputPath, ...result }, null, 2));
  } finally {
    socket.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
