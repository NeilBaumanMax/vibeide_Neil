const assert = require('node:assert/strict');
const { ChatBuffer } = require('../dist/main/worker/chat-buffer');

const buffer = new ChatBuffer();

const messages = [
  {
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'I will run the smoke test.' },
        {
          type: 'tool_use',
          id: 'toolu_run',
          name: 'Bash',
          input: { command: 'node scripts/run_workbench_smoke.cjs' },
        },
        {
          type: 'tool_use',
          id: 'toolu_edit',
          name: 'Edit',
          input: { file_path: 'electron/src/main/worker/chat-buffer.ts' },
        },
      ],
    },
  },
  {
    type: 'user',
    message: {
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_run',
          content: [
            {
              type: 'text',
              text: 'workbench smoke ok: file /tmp/vibeide/README.md\nsecond line',
            },
          ],
        },
      ],
    },
  },
  {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          id: 'toolu_write',
          name: 'Write',
          input: { file_path: 'agent/galgame.html' },
        },
      ],
    },
  },
];

const parsed = buffer.feed(messages.map((msg) => JSON.stringify(msg)).join('\n') + '\n');
const texts = parsed.map((chunk) => chunk.content);

assert.equal(parsed.length, 5);
assert(texts.includes('I will run the smoke test.'));
assert(texts.includes('• Ran node scripts/run_workbench_smoke.cjs'));
assert(texts.includes('• Edited electron/src/main/worker/chat-buffer.ts'));
assert(texts.includes('• Created agent/galgame.html'));
assert(texts.some((text) => text.includes('  └ workbench smoke ok: file /tmp/vibeide/README.md')));
assert(texts.some((text) => text.includes('    second line')));
assert.equal(parsed.filter((chunk) => chunk.type === 'tool_call').length, 3);
assert.equal(parsed.filter((chunk) => chunk.type === 'tool_result').length, 1);

console.log('chat transcript format smoke ok');
