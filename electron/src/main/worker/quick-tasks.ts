import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { BrowserSurface } from '../browser-view';
import { getResourcesDirFromWorker, getAgentDir, getScreenshotsDir } from '../paths';

const PROJECT_ROOT = getResourcesDirFromWorker();
const AGENT_DIR = getAgentDir();
const SCREENSHOT_DIR = getScreenshotsDir();
const SNAKE_HTML_PATH = path.join(AGENT_DIR, 'snake.html');

export interface QuickTaskResult {
  handled: boolean;
  label?: string;
  url?: string;
  screenshotPath?: string;
  message?: string;
}

export async function tryHandleQuickTask(task: string, view: BrowserSurface): Promise<QuickTaskResult> {
  const normalized = task.trim();

  if (isIdentityTask(normalized)) {
    return {
      handled: true,
      label: '本地问答',
      message: '我是奥德赛1.0.0-7201，运行在 Electron 里的本地采集助手。你可以直接叫我打开网页、搜索内容，或者生成并打开一个本地页面。',
    };
  }

  if (isSnakeTask(normalized)) {
    ensureSnakeHtml();
    const url = fileUrl(SNAKE_HTML_PATH);
    const screenshotPath = await loadAndCapture(view, url, 'snake');
    return { handled: true, label: '贪吃蛇', url, screenshotPath };
  }

  if (isBilibiliTask(normalized) && !needsAgentExtraction(normalized)) {
    if (wantsOpenOnly(normalized)) {
      const url = 'https://www.bilibili.com';
      const screenshotPath = await loadAndCapture(view, url, 'bilibili-home');
      return { handled: true, label: 'B站首页', url, screenshotPath };
    }
    const keyword = extractKeyword(normalized, '星芯的美少女');
    const url = `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`;
    const screenshotPath = await loadAndCapture(view, url, 'bilibili-search');
    return { handled: true, label: `B站搜索：${keyword}`, url, screenshotPath };
  }

  if (isStockTask(normalized)) {
    const keyword = extractKeyword(normalized, '股票');
    const url = `https://cn.bing.com/search?q=${encodeURIComponent(keyword)}`;
    const screenshotPath = await loadAndCapture(view, url, 'stock-search');
    return { handled: true, label: `股票搜索：${keyword}`, url, screenshotPath };
  }

  return { handled: false };
}

function isIdentityTask(task: string): boolean {
  return ['你是谁', '你是誰', '你叫什么', '你叫什麼', '你是谁啊'].includes(task.replace(/\s+/g, ''));
}

function isSnakeTask(task: string): boolean {
  return task.includes('贪吃蛇') && (task.includes('打开') || task.includes('运行'));
}

function isBilibiliTask(task: string): boolean {
  return (task.includes('b站') || task.includes('B站') || task.includes('哔哩哔哩')) &&
    (task.includes('搜索') || task.includes('看') || task.includes('打开'));
}

function needsAgentExtraction(task: string): boolean {
  return /(整理|数据|提取|抽取|列出|前十|十个|10个|最火|最热|热门|排行|排名|top|播放量)/i.test(task);
}

function isStockTask(task: string): boolean {
  return task.includes('股票');
}

function wantsOpenOnly(task: string): boolean {
  return task.includes('打开') && !task.includes('搜索') && !task.includes('看');
}

function extractKeyword(task: string, fallback: string): string {
  const compact = task.replace(/\s+/g, '');
  const searchIdx = compact.indexOf('搜索');
  if (searchIdx >= 0) {
    const candidate = compact.slice(searchIdx + 2).replace(/^(看|一下|看看)/, '').trim();
    if (candidate) return candidate;
  }

  const watchIdx = compact.indexOf('看');
  if (watchIdx >= 0) {
    const candidate = compact.slice(watchIdx + 1).trim();
    if (candidate) return candidate;
  }

  return fallback;
}

async function loadAndCapture(view: BrowserSurface, url: string, prefix: string): Promise<string> {
  ensureDir(SCREENSHOT_DIR);

  try {
    await view.webContents.loadURL(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('ERR_ABORTED')) {
      throw error;
    }
  }
  await waitForSettled(view);

  const filename = `${prefix}-${Date.now()}.png`;
  const screenshotPath = path.join(SCREENSHOT_DIR, filename);
  const image = await view.webContents.capturePage();
  fs.writeFileSync(screenshotPath, image.toPNG());
  return screenshotPath;
}

async function waitForSettled(view: BrowserSurface): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 2500));
  try {
    await view.webContents.executeJavaScript('document.readyState');
  } catch {
    // Ignore transient navigation timing issues; capturePage still reflects the current BrowserView.
  }
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

function ensureSnakeHtml(): void {
  ensureDir(AGENT_DIR);

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Snake</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at top, rgba(255, 209, 102, 0.22), transparent 30%),
        linear-gradient(180deg, #17324d 0%, #08131f 100%);
      color: #f7f3e8;
      font-family: "Trebuchet MS", "Segoe UI", sans-serif;
    }
    .shell {
      width: min(92vw, 720px);
      padding: 28px;
      border-radius: 28px;
      background: rgba(10, 17, 26, 0.88);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 22px 80px rgba(0, 0, 0, 0.35);
    }
    .headline {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 16px;
      margin-bottom: 18px;
    }
    h1 {
      margin: 0;
      font-size: clamp(28px, 5vw, 42px);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .score {
      font-size: 16px;
      color: #ffd166;
    }
    canvas {
      width: 100%;
      max-width: 560px;
      aspect-ratio: 1;
      display: block;
      margin: 0 auto;
      border-radius: 20px;
      border: 2px solid rgba(255, 209, 102, 0.3);
      background:
        linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px) 0 0 / 28px 28px,
        linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px) 0 0 / 28px 28px,
        #0f1d2d;
    }
    .hint {
      margin-top: 16px;
      text-align: center;
      color: #c9d6df;
      font-size: 14px;
    }
    .hint strong {
      color: #7ae582;
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="headline">
      <h1>Snake</h1>
      <div class="score">Score: <span id="score">0</span></div>
    </div>
    <canvas id="board" width="560" height="560"></canvas>
    <div class="hint">Press <strong>Arrow Keys</strong> or <strong>W A S D</strong> to play.</div>
  </div>
  <script>
    const canvas = document.getElementById('board');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const size = 20;
    const cells = canvas.width / size;
    let direction = { x: 1, y: 0 };
    let nextDirection = { x: 1, y: 0 };
    let snake = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
    let food = { x: 18, y: 12 };
    let score = 0;

    function placeFood() {
      while (snake.some(part => part.x === food.x && part.y === food.y)) {
        food = {
          x: Math.floor(Math.random() * cells),
          y: Math.floor(Math.random() * cells),
        };
      }
    }

    function reset() {
      direction = { x: 1, y: 0 };
      nextDirection = { x: 1, y: 0 };
      snake = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
      score = 0;
      scoreEl.textContent = '0';
      food = { x: 18, y: 12 };
      placeFood();
    }

    function drawCell(x, y, color, radius = 6) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x * size + 2, y * size + 2, size - 4, size - 4, radius);
      ctx.fill();
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawCell(food.x, food.y, '#ffd166', 9);
      snake.forEach((part, index) => {
        drawCell(part.x, part.y, index === 0 ? '#7ae582' : '#2dc653', index === 0 ? 9 : 6);
      });
    }

    function tick() {
      direction = nextDirection;
      const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
      const hitWall = head.x < 0 || head.y < 0 || head.x >= cells || head.y >= cells;
      const hitSelf = snake.some(part => part.x === head.x && part.y === head.y);

      if (hitWall || hitSelf) {
        reset();
        draw();
        return;
      }

      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score += 1;
        scoreEl.textContent = String(score);
        placeFood();
      } else {
        snake.pop();
      }
      draw();
    }

    window.addEventListener('keydown', (event) => {
      const map = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 },
        s: { x: 0, y: 1 },
        a: { x: -1, y: 0 },
        d: { x: 1, y: 0 },
      };
      const next = map[event.key];
      if (!next) return;
      if (next.x + direction.x === 0 && next.y + direction.y === 0) return;
      nextDirection = next;
    });

    placeFood();
    draw();
    setInterval(tick, 130);
  </script>
</body>
</html>
`;

  fs.writeFileSync(SNAKE_HTML_PATH, html, 'utf-8');
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function fileUrl(filePath: string): string {
  const normalized = filePath.split(path.sep).join('/');
  return `file://${normalized}`;
}
