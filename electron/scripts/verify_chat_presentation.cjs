const assert = require('node:assert/strict');
const { ChatBuffer } = require('../dist/main/worker/chat-buffer');

const buffer = new ChatBuffer();
const toolCall = JSON.stringify({
  type: 'assistant',
  message: { content: [
    { type: 'text', text: '## 完成\n\n- 第一项\n- 第二项' },
    { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: 'README.md' } },
  ] },
});
const toolResult = JSON.stringify({
  type: 'user',
  message: { content: [
    { type: 'tool_result', tool_use_id: 'tool-1', content: `${'x'.repeat(1400)}\nline 2` },
  ] },
});

const chunks = buffer.feed(`${toolCall}\n${toolResult}\n`);
assert.deepEqual(chunks.map((chunk) => chunk.type), ['text', 'tool_call', 'tool_result']);
assert.match(chunks[0].content, /^## 完成/);
assert.equal(chunks[1].toolName, 'Read');
assert.match(chunks[2].content, /\[line clipped\]/);
assert.ok(chunks[2].content.length < 1300, '工具结果摘要没有限制单行长度');

console.log(JSON.stringify({ ok: true, chunkTypes: chunks.map((chunk) => chunk.type), clippedLength: chunks[2].content.length }, null, 2));
