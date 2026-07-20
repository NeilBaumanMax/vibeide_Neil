import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vibeide-event-clear-'));
const eventsDir = path.join(testRoot, 'hardboard', 'events');
const logsDir = path.join(testRoot, 'hardboard', 'logs');

try {
  fs.mkdirSync(eventsDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(path.join(eventsDir, 'events.jsonl'), [
    JSON.stringify({ seq: 1, id: 'one', time: Date.now(), source: 'test', kind: 'tool.completed' }),
    JSON.stringify({ seq: 2, id: 'two', time: Date.now(), source: 'test', kind: 'hardboard.build.completed' }),
  ].join('\n') + '\n', 'utf-8');
  fs.writeFileSync(path.join(eventsDir, 'state.json'), JSON.stringify({
    generatedAt: Date.now(),
    lastSeq: 2,
    lastHeartbeatAt: null,
    activeTaskId: null,
    activeToolName: null,
    activeProjectDir: null,
    activePid: 999999,
    phase: 'build',
    status: 'running',
    progress: 100,
    currentFile: null,
    currentPort: null,
    files: [],
    recent: [],
    lastError: null,
  }), 'utf-8');
  fs.writeFileSync(path.join(logsDir, 'build.stdout.log'), 'build output', 'utf-8');
  fs.writeFileSync(path.join(logsDir, 'build.stderr.log'), 'build error', 'utf-8');
  fs.writeFileSync(path.join(logsDir, 'keep.txt'), 'must remain', 'utf-8');

  process.env.RUNTIME_ROOT = testRoot;
  const { clearRuntimeEventHistory, getRecentRuntimeEvents } = await import('../dist/eventbus/event-store.js');
  const result = clearRuntimeEventHistory();

  assert.equal(result.ok, true);
  assert.equal(result.eventsRemoved, 2);
  assert.equal(result.logsRemoved, 2);
  assert.equal(result.state.lastSeq, 0);
  assert.equal(result.state.status, 'idle');
  assert.equal(fs.existsSync(path.join(eventsDir, 'events.jsonl')), false);
  assert.equal(fs.existsSync(path.join(logsDir, 'build.stdout.log')), false);
  assert.equal(fs.existsSync(path.join(logsDir, 'build.stderr.log')), false);
  assert.equal(fs.existsSync(path.join(logsDir, 'keep.txt')), true);
  assert.deepEqual(getRecentRuntimeEvents(), []);

  console.log('event history clear smoke ok');
} finally {
  const tempRoot = path.resolve(os.tmpdir());
  const resolvedTestRoot = path.resolve(testRoot);
  assert(resolvedTestRoot.startsWith(`${tempRoot}${path.sep}`));
  assert(path.basename(resolvedTestRoot).startsWith('vibeide-event-clear-'));
  fs.rmSync(resolvedTestRoot, { recursive: true, force: true });
}
