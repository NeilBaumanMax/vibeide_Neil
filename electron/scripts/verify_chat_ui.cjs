const CDP_LIST = 'http://127.0.0.1:9230/json';

async function cdpCall(socket, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener('message', onMessage);
      reject(new Error(`CDP ${method} 超时`));
    }, 15000);
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
  const targets = await fetch(CDP_LIST).then((response) => response.json());
  const target = targets.find((entry) => entry.title?.includes('奥德赛'));
  if (!target?.webSocketDebuggerUrl) throw new Error('未找到奥德赛 Renderer CDP target');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  try {
    const expression = `(async () => {
      window.__vibeideChatSmokeStage = 'started';
      const waitFor = (check) => {
        const current = check();
        if (current) return Promise.resolve(current);
        return new Promise((resolve) => {
          const observer = new MutationObserver(() => {
            const value = check();
            if (!value) return;
            observer.disconnect();
            resolve(value);
          });
          observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
        });
      };
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '专业视图');
      if (!button) return { ok: false, reason: 'missing professional view button' };
      const legacyProgressPanel = Boolean(document.querySelector('.left-panel > .task-progress'));
      const idleDashboardVisible = Boolean(document.querySelector('.chat-task-dashboard'));
      const historySidebar = Boolean(document.querySelector('.chat-history'));
      const conversationPane = Boolean(document.querySelector('.chat-conversation'));
      const visibleMessagesBefore = document.querySelectorAll('.chat-msg, .chat-execution').length;
      const historyBefore = document.querySelectorAll('.chat-history-item').length;
      const listBefore = await window.electronAPI.listChatConversations();
      const original = listBefore.conversations.find((item) => item.id === listBefore.activeConversationId);
      if (!original) return { ok: false, reason: 'missing active conversation summary' };
      let activeMore = document.querySelector('.chat-history-item.is-active .chat-history-more');
      if (!activeMore) return { ok: false, reason: 'missing active conversation menu button' };
      activeMore.click();
      const renameAction = await waitFor(() => [...document.querySelectorAll('.chat-history-menu button')].find((item) => item.textContent?.trim() === '重命名'));
      if (!renameAction) return { ok: false, reason: 'missing rename action' };
      const firstMenu = document.querySelector('.chat-history-item:first-child .chat-history-menu');
      const firstTrigger = document.querySelector('.chat-history-item:first-child .chat-history-more');
      const menuPlacementOk = !firstMenu || !firstTrigger || firstMenu.getBoundingClientRect().top >= firstTrigger.getBoundingClientRect().bottom - 1;
      renameAction.click();
      const renameInput = await waitFor(() => document.querySelector('.chat-history-item.is-active .chat-history-rename input'));
      if (!renameInput) return { ok: false, reason: 'missing rename input' };
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      valueSetter.call(renameInput, '界面烟测对话');
      renameInput.dispatchEvent(new Event('input', { bubbles: true }));
      renameInput.blur();
      const renamed = await waitFor(() => document.querySelector('.chat-history-item.is-active .chat-history-select span')?.textContent?.includes('界面烟测对话'));
      activeMore = document.querySelector('.chat-history-item.is-active .chat-history-more');
      activeMore.click();
      const restoreRenameAction = await waitFor(() => [...document.querySelectorAll('.chat-history-menu button')].find((item) => item.textContent?.trim() === '重命名'));
      restoreRenameAction.click();
      const restoreInput = await waitFor(() => document.querySelector('.chat-history-item.is-active .chat-history-rename input'));
      valueSetter.call(restoreInput, original.title);
      restoreInput.dispatchEvent(new Event('input', { bubbles: true }));
      restoreInput.blur();
      await waitFor(() => document.querySelector('.chat-history-item.is-active .chat-history-select span')?.textContent?.includes(original.title));
      activeMore = document.querySelector('.chat-history-item.is-active .chat-history-more');
      activeMore.click();
      const pinAction = await waitFor(() => [...document.querySelectorAll('.chat-history-menu button')].find((item) => item.textContent?.trim().endsWith('置顶')));
      if (!pinAction) return { ok: false, reason: 'missing pin action' };
      const expectedPinned = pinAction.textContent?.trim() === '置顶';
      pinAction.click();
      await waitFor(() => Boolean(document.querySelector('.chat-history-item.is-active.is-pinned')) === expectedPinned);
      const pinToggled = true;
      if (expectedPinned !== original.pinned) {
        activeMore = document.querySelector('.chat-history-item.is-active .chat-history-more');
        activeMore.click();
        const restorePinAction = await waitFor(() => [...document.querySelectorAll('.chat-history-menu button')].find((item) => item.textContent?.trim().endsWith('置顶')));
        restorePinAction.click();
        if (original.pinned) await waitFor(() => Boolean(document.querySelector('.chat-history-item.is-active.is-pinned')));
        else await window.electronAPI.setChatConversationPinned(original.id, false);
      }
      activeMore = document.querySelector('.chat-history-item.is-active .chat-history-more');
      activeMore.click();
      const deleteAction = await waitFor(() => [...document.querySelectorAll('.chat-history-menu button')].find((item) => item.textContent?.trim() === '删除'));
      if (!deleteAction) return { ok: false, reason: 'missing delete action' };
      deleteAction.click();
      const confirmDelete = await waitFor(() => document.querySelector('.chat-history-item.is-active .chat-history-confirm .is-danger'));
      if (!confirmDelete) return { ok: false, reason: 'missing conversation delete confirmation' };
      const cancelDelete = document.querySelector('.chat-history-item.is-active .chat-history-confirm button:not(.is-danger)');
      cancelDelete?.click();
      const deleteConfirmed = true;
      const before = button.getAttribute('aria-pressed');
      button.click();
      const after = await waitFor(() => button.getAttribute('aria-pressed') !== before ? button.getAttribute('aria-pressed') : null);
      const stored = localStorage.getItem('vibeide.chat.professionalView');
      button.click();
      await waitFor(() => button.getAttribute('aria-pressed') === before);
      return {
        ok: before !== after
          && stored === after
          && historySidebar
          && conversationPane
          && renamed
          && pinToggled
          && deleteConfirmed
          && menuPlacementOk
          && !legacyProgressPanel
          && !idleDashboardVisible,
        before,
        after,
        stored,
        legacyProgressPanel,
        idleDashboardVisible,
        historySidebar,
        conversationPane,
        visibleMessagesBefore,
        historyBefore,
        renamed,
        pinToggled,
        deleteConfirmed,
        menuPlacementOk,
        theme: document.documentElement.dataset.theme,
        readyState: document.readyState,
      };
    })()`;
    let evaluated;
    try {
      evaluated = await cdpCall(socket, 1, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    } catch (error) {
      const probe = await cdpCall(socket, 2, 'Runtime.evaluate', { expression: `({ stage: window.__vibeideChatSmokeStage, ready: document.readyState, items: document.querySelectorAll('.chat-history-item').length, moreDisabled: document.querySelector('.chat-history-item.is-active .chat-history-more')?.disabled, expanded: document.querySelector('.chat-history-item.is-active .chat-history-more')?.getAttribute('aria-expanded'), menus: document.querySelectorAll('.chat-history-menu').length })`, returnByValue: true });
      throw new Error(`${error instanceof Error ? error.message : String(error)}; probe=${JSON.stringify(probe.result?.value)}`);
    }
    const result = evaluated.result?.value;
    if (!result?.ok) throw new Error(`专业视图交互校验失败: ${JSON.stringify(result)}`);

    console.log(JSON.stringify(result, null, 2));
  } finally {
    socket.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
