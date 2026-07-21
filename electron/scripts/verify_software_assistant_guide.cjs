const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');

const isolatedUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'catnip-guide-user-data-'));
app.setPath('userData', isolatedUserData);
app.once('quit', () => {
  fs.rmSync(isolatedUserData, { recursive: true, force: true });
});

async function main() {
  await app.whenReady();
  const { buildSoftwareAssistantSystemPrompt } = require('../dist/main/software-assistant');
  const tempRoot = fs.mkdtempSync(path.join(app.getPath('temp'), 'catnip-guide-'));
  const guidePath = path.join(tempRoot, 'CATNIP_FORGE_USER_GUIDE.md');

  try {
    fs.writeFileSync(guidePath, '# 测试手册\n\n动态版本标记 A', 'utf-8');
    const first = await buildSoftwareAssistantSystemPrompt(guidePath);
    assert(first.includes('动态版本标记 A'), 'first guide version missing from prompt');

    fs.writeFileSync(guidePath, '# 测试手册\n\n动态版本标记 B', 'utf-8');
    const second = await buildSoftwareAssistantSystemPrompt(guidePath);
    assert(second.includes('动态版本标记 B'), 'updated guide version missing from prompt');
    assert(!second.includes('动态版本标记 A'), 'guide content was cached instead of re-read');
    assert(second.includes('软件使用手册开始') && second.includes('软件使用手册结束'), 'guide delimiters missing');

    fs.writeFileSync(guidePath, '', 'utf-8');
    const empty = await buildSoftwareAssistantSystemPrompt(guidePath);
    assert(empty.includes('软件使用手册当前不可用'), 'empty guide must use safe fallback');

    fs.unlinkSync(guidePath);
    const missing = await buildSoftwareAssistantSystemPrompt(guidePath);
    assert(missing.includes('软件使用手册当前不可用'), 'missing guide must use safe fallback');

    console.log('software assistant guide smoke ok (dynamic reload + fallback)');
  } finally {
    if (fs.existsSync(guidePath)) fs.unlinkSync(guidePath);
    fs.rmdirSync(tempRoot);
    app.quit();
  }
}

main().catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
