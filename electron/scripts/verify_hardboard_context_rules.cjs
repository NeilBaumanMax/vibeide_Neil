const assert = require('node:assert/strict');
const { app } = require('electron');

const tasks = [
  '帮我编译 ESP32-S3 工程',
  '选择串口 COM3 然后烧录固件',
  '用 ESP-IDF 5.4.3 新建一个硬件工程',
];

async function main() {
  await app.whenReady();
  const { buildContext } = require('../dist/main/worker/context');

  for (const task of tasks) {
    const context = buildContext(task);
    assert(
      context.skillsFound.includes('espidf_hardboard.md'),
      `espidf_hardboard.md not loaded for: ${task}`,
    );
    assert(
      context.prompt.includes('hardboard'),
      `hardboard tool rules missing for: ${task}`,
    );
  }

  console.log('hardboard context rules smoke ok');
  app.quit();
}

main().catch((error) => {
  console.error(error);
  app.quit();
  process.exit(1);
});
