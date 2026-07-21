const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

async function main() {
  await app.whenReady();
  const manager = require('../dist/main/skill-manager');
  const { buildContext } = require('../dist/main/worker/context');
  const before = manager.listManagedSkills();
  assert(before.status.sourceDir.endsWith(path.join('agent', 'skills')), 'source path must remain agent/skills');
  assert(before.skills.length >= 12, 'bundled skills should be discoverable');

  const synced = manager.syncManagedSkills();
  assert.equal(synced.status.deployedCount, synced.status.skillCount, 'all source skills should deploy');
  for (const skill of synced.skills) {
    const deployed = path.join(synced.status.deployDir, skill.id, 'SKILL.md');
    const text = fs.readFileSync(deployed, 'utf-8');
    assert.match(text, /^---\nname: /, `${skill.id} missing native frontmatter`);
    assert.match(text, /\ndescription: /, `${skill.id} missing description`);
  }

  assert(!buildContext('编译 Electron TypeScript 前端').skillsFound.includes('espidf_hardboard.md'), 'generic compilation must not trigger hardboard');
  const hardboard = buildContext('编译 ESP32-S3 固件并烧录');
  assert(hardboard.skillsFound.includes('espidf_hardboard.md'), 'ESP32 task should recommend hardboard skill');
  assert(hardboard.prompt.includes('/espidf-hardboard'), 'prompt should reference the native skill command');
  console.log(`skill manager smoke ok (${synced.status.deployedCount} deployed)`);
  app.quit();
}

main().catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
