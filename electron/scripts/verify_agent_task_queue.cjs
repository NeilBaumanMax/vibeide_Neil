const assert = require('node:assert/strict');
const { app } = require('electron');

async function main() {
  await app.whenReady();
  const { Orchestrator } = require('../dist/main/worker/orchestrator');
  const events = [];
  const starts = [];
  const continuations = [];
  const orchestrator = Object.create(Orchestrator.prototype);

  Object.assign(orchestrator, {
    pushUI: (channel, data) => events.push({ channel, data }),
    currentTask: null,
    currentTaskId: null,
    currentAgentTranscript: '',
    currentAttempt: 0,
    queuedTasks: [],
    pendingGuidance: [],
    currentUserTurns: [],
    turnInFlight: false,
    paused: false,
    silenceTimer: null,
  });

  orchestrator.startTask = async (request) => {
    starts.push(request);
    orchestrator.currentTask = request.text;
    orchestrator.currentTaskId = request.id;
    orchestrator.currentUserTurns = [request.text];
    orchestrator.turnInFlight = true;
    orchestrator.emitTaskStatus();
  };
  orchestrator.runTask = async (task, continuation) => {
    continuations.push({ task, continuation });
    orchestrator.turnInFlight = true;
  };

  const first = orchestrator.submitTask('第一个任务', 'auto');
  assert.equal(first.disposition, 'started');
  assert.equal(starts.length, 1, 'first task should start immediately');

  const guide = orchestrator.submitTask('补充当前任务', 'auto');
  assert.equal(guide.disposition, 'guided');
  assert.equal(guide.taskId, first.taskId, 'guidance must keep active task id');
  assert.equal(orchestrator.pendingGuidance.length, 1);
  assert.equal(starts.length, 1, 'guidance must not start another task');

  const queued = orchestrator.submitTask('下一个独立任务', 'queue');
  assert.equal(queued.disposition, 'queued');
  assert.equal(orchestrator.queuedTasks.length, 1);
  assert.equal(starts.length, 1, 'queued task must wait');

  const continued = await orchestrator.continueWithPendingGuidance('第一个任务');
  assert.equal(continued, true);
  assert.equal(continuations.length, 1);
  assert.equal(continuations[0].continuation.kind, 'guidance');
  assert.match(continuations[0].continuation.text, /补充当前任务/);
  assert.equal(orchestrator.pendingGuidance.length, 0);

  orchestrator.finishCurrentTask();
  assert.equal(starts.length, 2, 'next task should start only after current task finishes');
  assert.equal(starts[1].id, queued.taskId);
  assert.equal(orchestrator.queuedTasks.length, 0);
  assert(events.some((event) => event.channel === 'task:status'), 'task status events should be emitted');

  console.log('agent task queue smoke ok');
  app.quit();
}

main().catch((error) => {
  console.error(error);
  app.quit();
  process.exit(1);
});
