const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

async function main() {
  await app.whenReady();

  const {
    appendClaudeSessionTurn,
    buildClaudeSessionContext,
    getClaudeSessionFile,
    loadClaudeSession,
  } = require('../dist/main/worker/session-store.js');

  const sessionFile = getClaudeSessionFile();
  const backup = fs.existsSync(sessionFile) ? fs.readFileSync(sessionFile, 'utf-8') : null;
  fs.mkdirSync(path.dirname(sessionFile), { recursive: true });

  try {
    fs.rmSync(sessionFile, { force: true });
    const first = loadClaudeSession();
    appendClaudeSessionTurn({
      user: 'memory-smoke-user-1',
      assistant: 'memory-smoke-agent-1',
      status: 'completed',
    });
    const second = appendClaudeSessionTurn({
      user: 'memory-smoke-user-2',
      assistant: 'memory-smoke-agent-2',
      status: 'completed',
    });
    const context = buildClaudeSessionContext();

    if (first.turnCount !== 0) throw new Error('new session did not start empty');
    if (second.turnCount !== 2) throw new Error(`expected turnCount=2, got ${second.turnCount}`);
    if (!context.text.includes('memory-smoke-user-1') || !context.text.includes('memory-smoke-agent-2')) {
      throw new Error('session context did not include previous turns');
    }

    console.log(`session smoke ok: ${second.id} turns=${second.turnCount}`);
  } finally {
    if (backup == null) {
      fs.rmSync(sessionFile, { force: true });
    } else {
      fs.writeFileSync(sessionFile, backup, 'utf-8');
    }
    app.quit();
  }
}

main().catch((error) => {
  console.error(error);
  app.quit();
  process.exit(1);
});
