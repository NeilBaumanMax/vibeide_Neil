// 临时脚本：B站搜索"星芯的美少女"
import { connectBrowser } from '../runtime/src/browser.js';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const { browser, page: _page } = await connectBrowser(9230);

  // Prefer the main renderer page (localhost:5173) which definitely has network
  const contexts = browser.contexts();
  let targetPage = _page;
  for (const ctx of contexts) {
    for (const p of ctx.pages()) {
      console.log('Page:', p.url());
      // Use the Vite page which has network access
      if (p.url().startsWith('http://localhost:5173')) {
        targetPage = p;
      }
      // Fallback to about:blank
      if (!targetPage.url().startsWith('http') && p.url() === 'about:blank') {
        targetPage = p;
      }
    }
  }

  console.log('Using:', targetPage.url());
  await targetPage.bringToFront();

  // Navigate the page
  await targetPage.goto('https://search.bilibili.com/all?keyword=%E6%98%9F%E8%8A%AF%E7%9A%84%E7%BE%8E%E5%B0%91%E5%A5%B3', {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  console.log('✅ 已打开 B站搜索结果');

  console.log('页面:', await targetPage.title());
  console.log('URL:', targetPage.url());

  try {
    await targetPage.waitForSelector('.bili-video-card__wrap, .video-list-item, .search-video-item', { timeout: 8000 });
    console.log('✅ 视频卡片已加载');
  } catch {
    console.log('⚠️ 未匹配video selector');
  }

  const buf = await targetPage.screenshot({ type: 'png', fullPage: false });
  const b64 = buf.toString('base64');
  const outPath = path.resolve(process.cwd(), 'agent', 'bilibili_search_result.png');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  console.log('✅ 截图已保存:', outPath, `(${b64.length} 字符)`);
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
