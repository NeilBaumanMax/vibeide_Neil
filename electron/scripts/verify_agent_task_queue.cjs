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
    buffer: { flush: () => [] },
    state: {
      completed: 0,
      failed: 0,
      resetCount: 0,
      complete() { this.completed += 1; },
      fail() { this.failed += 1; },
      reset() { this.resetCount += 1; },
    },
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

  // A turn-complete callback yields while checking for guidance. If the task
  // is stopped/replaced during that gap, the old callback must not complete or
  // otherwise mutate the next task.
  orchestrator.turnInFlight = false;
  orchestrator.finishCurrentTask();
  const stale = orchestrator.submitTask('即将取消的任务', 'auto');
  const completedBefore = orchestrator.state.completed;
  const staleCompletion = orchestrator.handleAgentTurnComplete(0, '即将取消的任务');
  orchestrator.finishCurrentTask();
  await staleCompletion;
  assert.equal(orchestrator.state.completed, completedBefore, 'stale completion must be ignored after task cancellation');
  assert.equal(orchestrator.currentTaskId, null);
  assert(stale.taskId, 'canceled task should have an id');

  // Stop is also responsible for dropping both kinds of pending work.
  orchestrator.currentTask = null;
  orchestrator.currentTaskId = null;
  orchestrator.turnInFlight = true;
  orchestrator.pendingGuidance = ['不要遗漏这一项'];
  orchestrator.queuedTasks = [{ id: 'queued-after-stop', text: '不应再执行' }];
  orchestrator.stop();
  assert.equal(orchestrator.pendingGuidance.length, 0);
  assert.equal(orchestrator.queuedTasks.length, 0);
  assert.equal(orchestrator.getTaskStatus().busy, false);

  console.log('agent task queue smoke ok');
  app.quit();
}

main().catch((error) => {
  console.error(error);
  app.quit();
  process.exit(1);
});
