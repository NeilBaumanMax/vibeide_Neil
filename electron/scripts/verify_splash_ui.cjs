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

async function findSplashTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(CDP_LIST).then((response) => response.json());
      const target = targets.find((entry) => entry.title === 'Catnip Forge — 启动中');
      if (target?.webSocketDebuggerUrl) return target;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Catnip Forge splash CDP target not found');
}

async function main() {
  const target = await findSplashTarget();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  try {
    const evaluated = await call(socket, 1, 'Runtime.evaluate', {
      expression: `(async () => {
        const defaultTimeline = window.getSplashProgressState?.();
        window.restartSplashTimelineForTest?.(800);
        await new Promise((resolve) => setTimeout(resolve, 220));
        const firstTimelineSample = window.getSplashProgressState?.();
        await new Promise((resolve) => setTimeout(resolve, 300));
        const secondTimelineSample = window.getSplashProgressState?.();
        window.forceSplashProgressForTest?.(63, '正在验证启动界面');
        const shell = document.querySelector('.splash');
        const shellRect = shell?.getBoundingClientRect();
        const cat = document.querySelector('.cat');
        const logo = document.querySelector('.product-mark');
        const leaf = document.querySelector('.brand-mark');
        const bar = document.getElementById('progress-bar');
        const heading = document.querySelector('h1');
        return {
          title: document.title,
          viewport: { width: innerWidth, height: innerHeight },
          shellRect: shellRect ? {
            left: shellRect.left,
            top: shellRect.top,
            right: shellRect.right,
            bottom: shellRect.bottom,
          } : null,
          assetsLoaded: [cat, logo, leaf].every((image) => image?.complete && image?.naturalWidth > 0),
          status: document.getElementById('status')?.textContent,
          progress: document.getElementById('progress-value')?.textContent,
          progressWidth: bar?.style.width,
          defaultTimeline,
          firstTimelineSample,
          secondTimelineSample,
          headline: heading?.innerText,
          fontFamily: heading ? getComputedStyle(heading).fontFamily : '',
          overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
        };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const result = evaluated.result?.value;
    const rect = result?.shellRect;
    const inViewport = rect && rect.left >= 0 && rect.top >= 0
      && rect.right <= result.viewport.width && rect.bottom <= result.viewport.height;
    if (
      result?.title !== 'Catnip Forge — 启动中'
      || !result?.assetsLoaded
      || result?.status !== '正在验证启动界面'
      || result?.progress !== '63%'
      || result?.progressWidth !== '63%'
      || result?.defaultTimeline?.defaultDurationMs !== 5000
      || (!result?.firstTimelineSample?.reducedMotion && (
        result?.firstTimelineSample?.progress <= 8
        || result?.secondTimelineSample?.progress <= result?.firstTimelineSample?.progress
        || result?.secondTimelineSample?.progress >= 94
      ))
      || result?.headline !== 'One prompt.\nWorking hardware.'
      || result?.overflow
      || !inViewport
    ) {
      throw new Error(`splash UI verification failed: ${JSON.stringify(result)}`);
    }

    const screenshot = await call(socket, 2, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    const outputDir = path.join(__dirname, '..', '.tmp');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'splash-ui.png');
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
