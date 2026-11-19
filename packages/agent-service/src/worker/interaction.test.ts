import { describe, expect, test } from 'bun:test';
import type {
  ExtensionApprovalPrompt,
  ToolApprovalRequestedEvent,
  ToolCallEvent,
} from '@oh-my-pi/pi-coding-agent/sdk';
import type { JsonObject, PlanReviewResponse } from '@openchamber/agent-contract';
import { WorkerInteraction } from './interaction.ts';
import type { WorkerInteraction as WorkerInteractionMessage } from '../protocol.ts';
import { APPROVAL_SUMMARY_MAX_CHARS } from '../interaction/approval-summary.ts';

const review = { type: 'plan-review' as const, title: 'Review', planReference: 'local://review-plan.md', planText: '# Review' };

test('select preserves cursor, checkbox markers and unmarked actions without becoming multi-select', async () => {
  const requests: WorkerInteractionMessage[] = [];
  const worker = new WorkerInteraction({ request: request => requests.push(request), currentTurn: () => 'turn' });
  try {
    const result = worker.ui.select('Choose', ['A', 'B', 'Done'], { initialIndex: 1, selectionMarker: 'checkbox', checkedIndices: [0], markableCount: 2 });
    const request = requests[0];
    if (request?.kind !== 'question') throw new Error('Question missing');
    expect(request.schema.questions).toEqual([{ id: 'select', question: 'Choose', options: [{ label: 'A' }, { label: 'B' }, { label: 'Done' }], allowCustom: false, initialSelected: ['B'], selectionMarker: 'checkbox', checkedIndices: [0], markableCount: 2 }]);
    expect(worker.resolveQuestion(request.questionId, 'answer', { results: [{ id: 'select', selectedOptions: ['Done'] }] })).toBe(true);
    await expect(result).resolves.toBe('Done');
  } finally { worker.close(); }
});

function createToolCall(toolName: string, toolCallId: string, input: JsonObject): ToolCallEvent {
  return {
    type: 'tool_call',
    toolName,
    toolCallId,
    input,
  };
}

function createApprovalRequested(toolName: string, toolCallId: string, reason?: string, sessionId = 'session-1'): ToolApprovalRequestedEvent {
  return {
    type: 'tool_approval_requested',
    sessionId,
    toolCallId,
    toolName,
    reason,
    approvalMode: 'always-ask',
  };
}

test('native plan handles validate responses and resolve exactly once', () => {
  const requests: WorkerInteractionMessage[] = [];
  const responses: (PlanReviewResponse | undefined)[] = [];
  const interaction = new WorkerInteraction({ request: request => requests.push(request), currentTurn: () => 'turn' });
  try {
    interaction.requestPlanReview(review, response => responses.push(response));
    const request = requests[0];
    if (request?.kind !== 'question') throw new Error('Expected canonical plan question');
    expect(request.schema).toEqual(review);
    expect(interaction.resolveQuestion(request.questionId, 'answer', { action: 'feedback', feedback: ' ' })).toBe(false);
    expect(interaction.resolveQuestion(request.questionId, 'answer', { results: [] })).toBe(false);
    expect(responses).toEqual([]);
    expect(interaction.resolveQuestion(request.questionId, 'answer', { action: 'feedback', feedback: ' Revise it ' })).toBe(true);
    expect(responses).toEqual([{ action: 'feedback', feedback: 'Revise it' }]);
    expect(interaction.resolveQuestion(request.questionId, 'answer', { action: 'approve' })).toBe(false);
  } finally { interaction.close(); }
});

test('expiry cancellation and worker shutdown never approve a plan', () => {
  const requests: WorkerInteractionMessage[] = [];
  const responses: (PlanReviewResponse | undefined)[] = [];
  const interaction = new WorkerInteraction({ request: request => requests.push(request), currentTurn: () => 'turn' });
  interaction.requestPlanReview(review, response => responses.push(response));
  const request = requests[0];
  if (request?.kind !== 'question') throw new Error('Expected canonical plan question');
  expect(interaction.resolveQuestion(request.questionId, 'cancel')).toBe(true);
  interaction.requestPlanReview(review, response => responses.push(response));
  interaction.close();
  expect(responses).toEqual([undefined, undefined]);
  expect(() => interaction.requestPlanReview(review, () => { })).toThrow();
});

test('native approval names the tool and projects a redacted one-line input summary', async () => {
  const requests: WorkerInteractionMessage[] = [];
  const interaction = new WorkerInteraction({ request: request => requests.push(request), currentTurn: () => 'turn' });
  const command = `GITHUB_TOKEN=ghp_private_bash bun test --token cli-private-token ${'echo '.repeat(60)}`;
  const toolCall: ToolCallEvent = { type: 'tool_call', toolName: 'bash', toolCallId: 'call-bash', input: { command } };
  const approvalEvent: ToolApprovalRequestedEvent = {
    type: 'tool_approval_requested', sessionId: 'session', toolName: 'bash', toolCallId: 'call-bash',
    reason: 'Prompt required by bash pattern: test', approvalMode: 'always-ask',
  };
  try {
    interaction.observeToolCall(toolCall);
    interaction.observeApproval(approvalEvent);
    const selection = interaction.ui.select('Allow tool: bash', ['Approve', 'Deny']);
    expect(requests).toHaveLength(1);
    const request = requests[0];
    if (request?.kind !== 'approval') throw new Error('Expected canonical approval request');
    expect(request.toolName).toBe('bash');
    expect(request.actionType).toBe('bash_command');
    expect(request.commandSummary).toContain('GITHUB_TOKEN=[REDACTED] bun test --token [REDACTED]');
    expect(request.commandSummary.length).toBeLessThanOrEqual(APPROVAL_SUMMARY_MAX_CHARS);
    expect(request.commandSummary.endsWith('…')).toBe(true);
    expect(request.commandSummary.includes('ghp_private_bash')).toBe(false);
    expect(request.commandSummary.includes('cli-private-token')).toBe(false);
    expect(request.details).toEqual({ reason: 'Prompt required by bash pattern: test', options: ['Approve', 'Deny'], input: { command } });
    expect(request.policyTarget).toEqual({ toolName: 'bash', pattern: JSON.stringify({ command }) });
    expect(request.sessionRuleKey).toBeUndefined();
    expect(interaction.resolveApproval(request.approvalId, 'approve')).toBe(true);
    await expect(selection).resolves.toBe('Approve');
  } finally { interaction.close(); }
});

test('native permission prompts project safe details and resolve allow_always', async () => {
  const requests: WorkerInteractionMessage[] = [];
  const interaction = new WorkerInteraction({ request: request => requests.push(request), currentTurn: () => 'turn' });
  const command = 'GITHUB_TOKEN=ghp_private_native printf native';
  const toolCall = { toolCallId: 'call-native', toolName: 'bash', title: 'bash', rawInput: { command } };
  const options = [
    { optionId: 'once', name: 'Allow once', kind: 'allow_once' as const },
    { optionId: 'always', name: 'Always allow', kind: 'allow_always' as const },
    { optionId: 'reject', name: 'Reject', kind: 'reject_once' as const },
    { optionId: 'never', name: 'Never allow', kind: 'reject_always' as const },
  ];
  try {
    const selection = interaction.requestPermission(toolCall, options, 'bash', undefined);
    expect(requests).toHaveLength(1);
    const request = requests[0];
    if (request?.kind !== 'approval') throw new Error('Expected canonical approval request');
    expect(request.toolName).toBe('bash');
    expect(request.commandSummary).toBe('GITHUB_TOKEN=[REDACTED] printf native');
    expect(request.details).toEqual({ options: ['Allow once', 'Always allow', 'Reject', 'Never allow'] });
    expect(request.policyTarget).toEqual({ toolName: 'bash', pattern: JSON.stringify({ command }) });
    expect(request.sessionRuleKey).toBe('bash');
    expect(interaction.resolveApproval(request.approvalId, 'approve-always')).toBe(true);
    await expect(selection).resolves.toBe('always');
  } finally { interaction.close(); }
});

test('a non-bash ACP prompt is a one-shot card without a session allowance', async () => {
  const requests: WorkerInteractionMessage[] = [];
  const interaction = new WorkerInteraction({ request: request => requests.push(request), currentTurn: () => 'turn' });
  const options = [
    { optionId: 'once', name: 'Allow once', kind: 'allow_once' as const },
    { optionId: 'always', name: 'Always allow', kind: 'allow_always' as const },
    { optionId: 'reject', name: 'Reject', kind: 'reject_once' as const },
  ];
  const toolCall = { toolCallId: 'call-edit', toolName: 'edit', title: 'Delete a.ts', rawInput: { path: 'a.ts', edits: [] } };
  try {
    const selection = interaction.requestPermission(toolCall, options, undefined, undefined);
    const request = requests[0];
    if (request?.kind !== 'approval') throw new Error('Expected canonical approval request');
    expect(request.toolName).toBe('edit');
    expect(request.actionType).toBe('file_write');
    expect(request.commandSummary).toBe('a.ts');
    expect(request.sessionRuleKey).toBeUndefined();
    expect(request.details).toEqual({ options: ['Allow once', 'Always allow', 'Reject'] });
    expect(interaction.resolveApproval(request.approvalId, 'approve')).toBe(true);
    await expect(selection).resolves.toBe('once');
  } finally { interaction.close(); }
});

test('native grant re-authorizes an exact command without a session allowance', async () => {
  const requests: WorkerInteractionMessage[] = [];
  const interaction = new WorkerInteraction({ request: request => requests.push(request), currentTurn: () => 'turn' });
  const input = { command: 'printf grant' };
  try {
    const selection = interaction.requestNativeGrant('call-grant', input, undefined);
    const request = requests[0];
    if (request?.kind !== 'approval') throw new Error('Expected canonical approval request');
    expect(request.nativeGrant).toBe(true);
    expect(request.sessionRuleKey).toBeUndefined();
    expect(request.policyTarget).toEqual({ toolName: 'bash', pattern: JSON.stringify(input) });
    expect(interaction.resolveApproval(request.approvalId, 'approve')).toBe(true);
    await expect(selection).resolves.toBe(true);
    expect(interaction.takeApprovalReceipt('call-grant')).toBe(request.approvalId);
  } finally { interaction.close(); }
});

test('a turn-less async job still raises its native grant and resolves by toolCallId only', async () => {
  const requests: WorkerInteractionMessage[] = [];
  const interaction = new WorkerInteraction({ request: request => requests.push(request), currentTurn: () => undefined });
  const input = { command: 'printf async-job' };
  try {
    const first = interaction.requestNativeGrant('call-async-1', input, undefined);
    const firstRequest = requests[0];
    if (firstRequest?.kind !== 'approval') throw new Error('Expected canonical approval request');
    expect(firstRequest.turnId).toBe('turn-0');
    expect(firstRequest.toolCallId).toBe('call-async-1');
    expect(firstRequest.nativeGrant).toBe(true);

    const second = interaction.requestNativeGrant('call-async-2', input, undefined);
    const secondRequest = requests[1];
    if (secondRequest?.kind !== 'approval') throw new Error('Expected canonical approval request');
    expect(secondRequest.toolCallId).toBe('call-async-2');
    expect(secondRequest.approvalId).not.toBe(firstRequest.approvalId);

    // The first grant answers only its own call: the second card stays pending.
    expect(interaction.resolveApproval(firstRequest.approvalId, 'approve')).toBe(true);
    await expect(first).resolves.toBe(true);
    expect(interaction.takeApprovalReceipt('call-async-1')).toBe(firstRequest.approvalId);

    expect(interaction.resolveApproval(secondRequest.approvalId, 'approve')).toBe(true);
    await expect(second).resolves.toBe(true);
    expect(interaction.takeApprovalReceipt('call-async-2')).toBe(secondRequest.approvalId);
  } finally { interaction.close(); }
});

test('an already-aborted native prompt publishes no approval card', async () => {
  const requests: WorkerInteractionMessage[] = [];
  const interaction = new WorkerInteraction({ request: request => requests.push(request), currentTurn: () => 'turn' });
  const controller = new AbortController();
  controller.abort();
  const options = [
    { optionId: 'once', name: 'Allow once', kind: 'allow_once' as const },
    { optionId: 'always', name: 'Always allow', kind: 'allow_always' as const },
    { optionId: 'reject', name: 'Reject', kind: 'reject_once' as const },
  ];
  const toolCall = { toolCallId: 'call-aborted', toolName: 'bash', title: 'bash', rawInput: { command: 'printf aborted' } };
  try {
    await expect(interaction.requestPermission(toolCall, options, 'bash', controller.signal)).resolves.toBeUndefined();
    await expect(interaction.requestNativeGrant('call-aborted', { command: 'printf aborted' }, controller.signal)).resolves.toBe(false);
    expect(requests).toEqual([]);
  } finally { interaction.close(); }
});

test('steering signal cancels pending permission, removes handle, and prevents later approval execution', async () => {
  const requests: WorkerInteractionMessage[] = [];
  const interaction = new WorkerInteraction({ request: request => requests.push(request), currentTurn: () => 'turn-1' });
  const options = [
    { optionId: 'once', name: 'Allow once', kind: 'allow_once' as const },
    { optionId: 'always', name: 'Always allow', kind: 'allow_always' as const },
    { optionId: 'reject', name: 'Reject', kind: 'reject_once' as const },
  ];
  const toolCall = { toolCallId: 'call-steer', toolName: 'bash', title: 'bash', rawInput: { command: 'printf steer' } };
  const controller = new AbortController();
  try {
    const pendingChoice = interaction.requestPermission(toolCall, options, 'bash', undefined, controller.signal);
    expect(requests).toHaveLength(1);
    const request = requests[0];
    if (request?.kind !== 'approval') throw new Error('Expected canonical approval request');
    const approvalId = request.approvalId;

    // Trigger user steering cancellation
    controller.abort();
    const choice = await pendingChoice;
    expect(choice).toBeUndefined();

    // The cancel interaction must have been emitted to remove the Host record
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual({ kind: 'cancel', approvalId });

    // Stale handle removal: resolving after cancellation returns false and records no receipt
    expect(interaction.resolveApproval(approvalId, 'approve')).toBe(false);
    expect(interaction.takeApprovalReceipt('call-steer')).toBeUndefined();
  } finally { interaction.close(); }
});

test('ordinary abort resolves undefined but preserves Host dialog without cancel message', async () => {
  const requests: WorkerInteractionMessage[] = [];
  const interaction = new WorkerInteraction({ request: request => requests.push(request), currentTurn: () => 'turn-1' });
  const options = [
    { optionId: 'once', name: 'Allow once', kind: 'allow_once' as const },
    { optionId: 'always', name: 'Always allow', kind: 'allow_always' as const },
    { optionId: 'reject', name: 'Reject', kind: 'reject_once' as const },
  ];
  const toolCall = { toolCallId: 'call-loop-abort', toolName: 'bash', title: 'bash', rawInput: { command: 'printf loop' } };
  const loopController = new AbortController();
  try {
    const pendingChoice = interaction.requestPermission(toolCall, options, 'bash', loopController.signal, undefined);
    expect(requests).toHaveLength(1);
    const request = requests[0];
    if (request?.kind !== 'approval') throw new Error('Expected canonical approval request');

    // Trigger loop signal abort (ordinary abort)
    loopController.abort();
    const choice = await pendingChoice;
    expect(choice).toBeUndefined();

    // Ordinary abort does NOT emit cancel interaction to Host
    expect(requests).toHaveLength(1);
    expect(interaction.takeApprovalReceipt('call-loop-abort')).toBeUndefined();
  } finally { interaction.close(); }
});

test('an already-aborted steering signal publishes no approval card', async () => {
  const requests: WorkerInteractionMessage[] = [];
  const interaction = new WorkerInteraction({ request: request => requests.push(request), currentTurn: () => 'turn-1' });
  const controller = new AbortController();
  controller.abort();
  const options = [
    { optionId: 'once', name: 'Allow once', kind: 'allow_once' as const },
    { optionId: 'always', name: 'Always allow', kind: 'allow_always' as const },
    { optionId: 'reject', name: 'Reject', kind: 'reject_once' as const },
  ];
  const toolCall = { toolCallId: 'call-already-steered', toolName: 'bash', title: 'bash', rawInput: { command: 'printf steer' } };
  try {
    await expect(interaction.requestPermission(toolCall, options, 'bash', undefined, controller.signal)).resolves.toBeUndefined();
    expect(requests).toEqual([]);
  } finally { interaction.close(); }
});

test('provider safety prompts never offer a session allowance', async () => {
  const requests: WorkerInteractionMessage[] = [];
  const interaction = new WorkerInteraction({ request: request => requests.push(request), currentTurn: () => 'turn' });
  const toolCall: ToolCallEvent = { type: 'tool_call', toolName: 'bash', toolCallId: 'call-safety', input: { command: 'printf safe' } };
  const approvalEvent: ToolApprovalRequestedEvent = {
    type: 'tool_approval_requested', sessionId: 'session', toolName: 'bash', toolCallId: 'call-safety', approvalMode: 'always-ask',
  };
  try {
    interaction.observeToolCall(toolCall);
    interaction.observeApproval(approvalEvent);
    const selection = interaction.ui.select('Allow tool: bash\nProvider safety checks:\nDestructive command', ['Approve', 'Deny']);
    const request = requests[0];
    if (request?.kind !== 'approval') throw new Error('Expected canonical approval request');
    expect(request.sessionRuleKey).toBeUndefined();
    expect(interaction.resolveApproval(request.approvalId, 'approve')).toBe(true);
    await expect(selection).resolves.toBe('Approve');
  } finally { interaction.close(); }
});

describe('WorkerInteraction OMP 18.16 ui.approve bridge', () => {
  test('authorized Host approve resolves SDK answer to "once" and records execution receipt', async () => {
    const requests: WorkerInteractionMessage[] = [];
    const interaction = new WorkerInteraction({
      request: item => requests.push(item),
      currentTurn: () => 'turn-1',
    });

    const toolCallId = 'call-1';
    interaction.observeToolCall(createToolCall('bash', toolCallId, { command: 'echo authorized' }));
    interaction.observeApproval(createApprovalRequested('bash', toolCallId, 'Host consent required'));

    const prompt: ExtensionApprovalPrompt = {
      full: 'Execute bash command: echo authorized',
      compact: 'echo authorized',
      session: 'Approve bash for this session',
    };

    const approvePromise = interaction.ui.approve!(prompt);
    expect(requests).toHaveLength(1);
    const request = requests[0];
    if (request?.kind !== 'approval') throw new Error('Expected canonical approval request');
    expect(request).toMatchObject({
      toolCallId,
      toolName: 'bash',
      actionType: 'bash_command',
      turnId: 'turn-1',
      details: {
        reason: 'Host consent required',
        options: ['Approve', 'Reject'],
        input: { command: 'echo authorized' },
      },
    });

    const resolved = interaction.resolveApproval(request.approvalId, 'approve');
    expect(resolved).toBe(true);

    const answer = await approvePromise;
    // Worker strictly returns 'once' for immediate execution; session policy is managed by Host CAS
    expect(answer).toBe('once');
    expect(interaction.takeApprovalReceipt(toolCallId)).toBe(request.approvalId);
  });

  test('Host reject resolves SDK answer to "deny" and provides no execution receipt', async () => {
    const requests: WorkerInteractionMessage[] = [];
    const interaction = new WorkerInteraction({
      request: item => requests.push(item),
      currentTurn: () => 'turn-1',
    });

    const toolCallId = 'call-2';
    interaction.observeToolCall(createToolCall('bash', toolCallId, { command: 'rm -rf /' }));
    interaction.observeApproval(createApprovalRequested('bash', toolCallId, 'Dangerous command'));

    const prompt: ExtensionApprovalPrompt = {
      full: 'Execute bash command: rm -rf /',
      compact: 'rm -rf /',
      session: 'Approve bash for this session',
    };

    const approvePromise = interaction.ui.approve!(prompt);
    expect(requests).toHaveLength(1);
    const request = requests[0];
    if (request?.kind !== 'approval') throw new Error('Expected canonical approval request');
    const resolved = interaction.resolveApproval(request.approvalId, 'reject');
    expect(resolved).toBe(true);

    const answer = await approvePromise;
    expect(answer).toBe('deny');
    expect(interaction.takeApprovalReceipt(toolCallId)).toBeUndefined();
  });

  test('aborted signal during pending approval resolves SDK answer to "deny"', async () => {
    const requests: WorkerInteractionMessage[] = [];
    const interaction = new WorkerInteraction({
      request: item => requests.push(item),
      currentTurn: () => 'turn-1',
    });

    const toolCallId = 'call-3';
    interaction.observeToolCall(createToolCall('write', toolCallId, { path: '/tmp/test.txt' }));
    interaction.observeApproval(createApprovalRequested('write', toolCallId));

    const controller = new AbortController();
    const prompt: ExtensionApprovalPrompt = {
      full: 'Write file: /tmp/test.txt',
      compact: '/tmp/test.txt',
    };

    const approvePromise = interaction.ui.approve!(prompt, { signal: controller.signal });
    expect(requests).toHaveLength(1);

    controller.abort();
    const answer = await approvePromise;
    expect(answer).toBe('deny');
    expect(interaction.takeApprovalReceipt(toolCallId)).toBeUndefined();
  });

  test('select fallback accepts 3-choice OMP 18.16 prompts without throwing invalid choices error', async () => {
    const requests: WorkerInteractionMessage[] = [];
    const interaction = new WorkerInteraction({
      request: item => requests.push(item),
      currentTurn: () => 'turn-1',
    });

    const toolCallId = 'call-4';
    interaction.observeToolCall(createToolCall('bash', toolCallId, { command: 'git status' }));
    interaction.observeApproval(createApprovalRequested('bash', toolCallId));

    // OMP 18.16 select fallback supplies at least 3 choices: ['Approve Once', 'Approve bash for this session', 'Deny']
    const selectPromise = interaction.ui.select(
      'Execute bash command',
      ['Approve Once', 'Approve bash for this session', 'Deny'],
    );

    expect(requests).toHaveLength(1);
    const request = requests[0];
    if (request?.kind !== 'approval') throw new Error('Expected canonical approval request');
    interaction.resolveApproval(request.approvalId, 'approve');
    const selected = await selectPromise;
    expect(selected).toBe('Approve Once');
  });

  test('throws if native approval has no captured execution input', async () => {
    const interaction = new WorkerInteraction({
      request: () => { },
      currentTurn: () => 'turn-1',
    });

    interaction.observeApproval(createApprovalRequested('bash', 'missing-input-call'));

    const prompt: ExtensionApprovalPrompt = {
      full: 'Execute command',
      compact: 'command',
    };

    await expect(interaction.ui.approve!(prompt)).rejects.toThrow('Native approval has no captured execution input');
  });

  test('handleApprove and requestPermission succeed when currentTurn is undefined', async () => {
    const requests: WorkerInteractionMessage[] = [];
    const interaction = new WorkerInteraction({
      request: item => requests.push(item),
      currentTurn: () => undefined,
    });

    const toolCallId = 'call-no-turn';
    interaction.observeToolCall(createToolCall('bash', toolCallId, { command: 'echo fallback' }));
    interaction.observeApproval(createApprovalRequested('bash', toolCallId, 'Fallback test'));

    const prompt: ExtensionApprovalPrompt = {
      full: 'Execute bash command: echo fallback',
      compact: 'echo fallback',
    };

    const approvePromise = interaction.ui.approve!(prompt);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.turnId).toBe('turn-0');
    interaction.resolveApproval(requests[0]!.approvalId, 'approve');
    expect(await approvePromise).toBe('once');

    const permOptions = [{ optionId: 'once', name: 'Allow once', kind: 'allow_once' as const }];
    const permPromise = interaction.requestPermission({ toolCallId: 'perm-call', toolName: 'bash', title: 'bash', rawInput: {} }, permOptions, undefined);
    expect(requests).toHaveLength(2);
    expect(requests[1]?.turnId).toBe('turn-0');
    interaction.resolveApproval(requests[1]!.approvalId, 'approve');
    expect(await permPromise).toBe('once');
  });

  test('handleApprove matches observed tool by callId when dialogOptions specifies toolCallId', async () => {
    const requests: WorkerInteractionMessage[] = [];
    const interaction = new WorkerInteraction({
      request: item => requests.push(item),
      currentTurn: () => 'turn-1',
    });

    interaction.observeToolCall(createToolCall('eval', 'call-eval-1', { code: '1+1' }));
    interaction.observeApproval(createApprovalRequested('eval', 'call-eval-1', 'eval 1'));
    interaction.observeToolCall(createToolCall('eval', 'call-eval-2', { code: '2+2' }));
    interaction.observeApproval(createApprovalRequested('eval', 'call-eval-2', 'eval 2'));

    const prompt: ExtensionApprovalPrompt = {
      full: 'Allow tool: eval 2+2',
      compact: 'eval 2+2',
    };

    const approvePromise = interaction.ui.approve!(prompt, { toolCallId: 'call-eval-2' });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.toolCallId).toBe('call-eval-2');
    interaction.resolveApproval(requests[0]!.approvalId, 'approve');
    expect(await approvePromise).toBe('once');
  });
});
