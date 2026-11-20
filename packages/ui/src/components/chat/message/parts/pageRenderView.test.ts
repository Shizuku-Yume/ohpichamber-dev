import { describe, expect, test } from 'bun:test';
import { proposedWorkflowRunId, isShownInPlace, requestedSecret, requestedSecretRun } from './pageRenderView';
import { toToolView, type CanonicalToolView } from './toolView';
import { ProposedWorkflowResultSchema } from '@openchamber/agent-contract';
import type { JsonValue } from '@openchamber/agent-contract';

const secretView = (input: Record<string, JsonValue>): CanonicalToolView => ({
  id: 'secret-call', callID: 'secret-call', sessionID: 'session-1', messageID: 'message-1', tool: 'openchamber_secret',
  call: { type: 'tool_call', partId: 'part-1', toolCallId: 'secret-call', toolName: 'openchamber_secret', input, status: 'running' },
  result: undefined,
  state: { status: 'running', input, metadata: {}, time: { start: 0 } },
});

describe('canonical secret cards', () => {
  const parameters = { program: 'node', args: ['deploy.js', 'two words'], reason: 'Authenticate deploy', inputs: [{ env: 'TOKEN', label: 'API key' }] };
  test('native action/input arguments survive the canonical join and select the run card', () => {
    const view = toToolView({
      type: 'tool_call', partId: 'native-part', toolCallId: 'native-call', toolName: 'openchamber_secret',
      input: { action: 'secret.run', input: parameters }, status: 'running',
    }, undefined, { sessionID: 'session-1', messageID: 'message-1' });
    expect(requestedSecretRun(view)).toEqual({
      program: 'node', command: "node deploy.js 'two words'", reason: 'Authenticate deploy', fields: [{ env: 'TOKEN', label: 'API key', placeholder: undefined }],
    });
    expect(isShownInPlace(view)).toBe(true);
    expect(requestedSecret(view)).toBeNull();
    expect(view.callID).toBe('native-call');
  });
  test('malformed native inputs cannot select a run card', () => {
    const inputs: JsonValue[] = [null, [], {}, { ...parameters, inputs: [] }, { ...parameters, inputs: [{ env: 'TOKEN' }] }];
    for (const input of inputs) expect(requestedSecretRun(secretView({ action: 'secret.run', input }))).toBeNull();
  });
  test('recognizes wrapped and flat run inputs and reserves the in-place card', () => {
    const inputs: Record<string, JsonValue>[] = [{ action: 'secret.run', parameters }, { action: 'run', ...parameters }];
    for (const input of inputs) {
      const view = secretView(input);
      expect(requestedSecretRun(view)).toEqual({
        program: 'node', command: "node deploy.js 'two words'", reason: 'Authenticate deploy', fields: [{ env: 'TOKEN', label: 'API key', placeholder: undefined }],
      });
      expect(isShownInPlace(view)).toBe(true);
      expect(requestedSecret(view)).toBeNull();
    }
  });
  test('empty and malformed inputs never create an actionable card', () => {
    const inputs: Record<string, JsonValue>[] = [{}, { action: 'secret.run' }, { action: 'secret.run', ...parameters, inputs: [] }, { action: 'secret.run', ...parameters, inputs: [{ env: 'TOKEN' }] }];
    for (const input of inputs) {
      expect(requestedSecretRun(secretView(input))).toBeNull();
    }
    const finished = secretView({ action: 'secret.run', ...parameters });
    finished.state = { status: 'error', input: finished.state.input, error: 'Declined', metadata: {}, time: { start: 0, end: 1 } };
    expect(requestedSecretRun(finished)).toBeNull();
    expect(isShownInPlace(finished)).toBe(false);
  });
  test('request remains a distinct refusal card and forget is never a prompt', () => {
    const request = secretView({ action: 'secret.request', parameters: { label: 'API key', reason: 'Legacy file request' } });
    expect(requestedSecret(request)?.label).toBe('API key');
    expect(requestedSecretRun(request)).toBeNull();
    for (const action of ['secret.forget', 'forget', 'secret.run', 'run']) {
      expect(requestedSecret(secretView({ action, label: 'API key', reason: 'Not a file request' }))).toBeNull();
    }
  });
});

describe('workflow chat card envelope and parser', () => {
  test('parser extracts runId from workflow tool envelope', () => {
    const envelope = {
      ok: true,
      action: 'workflow.run',
      data: { runId: 'run-alpha-42', state: 'awaiting-approval', name: 'deploy-check' },
    };

    // Shared definition accepts it
    expect(ProposedWorkflowResultSchema.safeParse(envelope).success).toBe(true);

    const view: CanonicalToolView = {
      call: { type: 'tool_call', partId: 'part-1', toolCallId: 'call-1', toolName: 'openchamber_workflow', input: { action: 'workflow.run' }, status: 'completed' },
      result: { type: 'tool_result', partId: 'part-2', toolCallId: 'call-1', toolName: 'openchamber_workflow', output: JSON.stringify(envelope), isError: false },
      id: 'call-1',
      callID: 'call-1',
      tool: 'openchamber_workflow',
      state: {
        status: 'completed',
        input: { action: 'workflow.run' },
        output: JSON.stringify(envelope),
        metadata: {},
        time: { start: 0, end: 1 },
      },
      sessionID: 'sess-1',
      messageID: 'msg-1',
    };

    expect(proposedWorkflowRunId(view)).toBe('run-alpha-42');
    expect(isShownInPlace(view)).toBe(true);
  });

  test('parser returns null for non-run actions or failed status', () => {
    const view: CanonicalToolView = {
      call: { type: 'tool_call', partId: 'part-3', toolCallId: 'call-2', toolName: 'openchamber_workflow', input: { action: 'workflow.status' }, status: 'completed' },
      result: { type: 'tool_result', partId: 'part-4', toolCallId: 'call-2', toolName: 'openchamber_workflow', output: JSON.stringify({ ok: true, action: 'workflow.status', data: { runId: 'run-1' } }), isError: false },
      id: 'call-2',
      callID: 'call-2',
      tool: 'openchamber_workflow',
      state: {
        status: 'completed',
        input: { action: 'workflow.status' },
        output: JSON.stringify({ ok: true, action: 'workflow.status', data: { runId: 'run-1' } }),
        metadata: {},
        time: { start: 0, end: 1 },
      },
      sessionID: 'sess-1',
      messageID: 'msg-1',
    };

    expect(proposedWorkflowRunId(view)).toBeNull();
  });
});
