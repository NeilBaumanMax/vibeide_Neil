const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

async function main() {
  await app.whenReady();

  const {
    appendClaudeSessionTurn,
    appendChatMessage,
    buildClaudeSessionContext,
    createChatConversation,
    deleteChatConversation,
    getClaudeSessionFile,
    listChatConversations,
    loadClaudeSession,
    renameChatConversation,
    setChatConversationPinned,
    activateChatConversation,
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

    appendChatMessage(first.id, {
      id: 'message-user-1',
      text: '历史工程 A',
      role: 'user',
      timestamp: Date.now(),
    });
    const another = createChatConversation();
    appendChatMessage(another.id, {
      id: 'message-user-2',
      text: '历史工程 B',
      role: 'user',
      timestamp: Date.now() + 1,
    });
    appendClaudeSessionTurn({
      user: 'conversation-b-user',
      assistant: 'conversation-b-agent',
      status: 'completed',
    }, another.id);
    activateChatConversation(first.id);
    const list = listChatConversations();
    if (list.conversations.length !== 2 || list.activeConversationId !== first.id) {
      throw new Error('multi-conversation list or activation failed');
    }
    if (buildClaudeSessionContext(first.id).text.includes('conversation-b-user')) {
      throw new Error('conversation contexts leaked into each other');
    }
    renameChatConversation(first.id, '置顶工程');
    setChatConversationPinned(first.id, true);
    const afterEdit = listChatConversations();
    if (afterEdit.conversations[0].id !== first.id || afterEdit.conversations[0].title !== '置顶工程' || !afterEdit.conversations[0].pinned) {
      throw new Error('conversation rename or pin failed');
    }
    const afterDelete = deleteChatConversation(another.id);
    if (afterDelete.conversations.length !== 1 || afterDelete.activeConversationId !== first.id) {
      throw new Error('conversation deletion failed');
    }

    console.log(`session smoke ok: ${second.id} turns=${second.turnCount} conversations=${afterDelete.conversations.length}`);
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
