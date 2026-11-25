import { describe, expect, test } from 'bun:test';
import { AgentServiceReadySchema, ProposedWorkflowResultSchema } from './runtime.ts';

describe('AgentServiceReadySchema', () => {
  test('accepts the canonical ready payload without an OMP version', () => {
    const parsed = AgentServiceReadySchema.safeParse({ ready: true, engine: 'omp', version: '1.0.0' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.ompVersion).toBeUndefined();
    }
  });

  test('accepts a real OMP runtime version when the service reports one', () => {
    const parsed = AgentServiceReadySchema.safeParse({ ready: true, engine: 'omp', version: '1.0.0', ompVersion: '19.1.0' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.ompVersion).toBe('19.1.0');
    }
  });

  test('rejects an empty OMP version string', () => {
    expect(AgentServiceReadySchema.safeParse({ ready: true, engine: 'omp', version: '1.0.0', ompVersion: '' }).success).toBe(false);
  });
});

describe('ProposedWorkflowResultSchema', () => {
  test('accepts valid workflow.run proposal envelope', () => {
    const envelope = {
      ok: true,
      action: 'workflow.run',
      data: { runId: 'run-123', state: 'awaiting-approval' },
    };
    const parsed = ProposedWorkflowResultSchema.safeParse(envelope);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.data.runId).toBe('run-123');
    }
  });

  test('rejects missing or empty runId', () => {
    expect(ProposedWorkflowResultSchema.safeParse({ ok: true, action: 'workflow.run', data: {} }).success).toBe(false);
    expect(ProposedWorkflowResultSchema.safeParse({ ok: true, action: 'workflow.run', data: { runId: '' } }).success).toBe(false);
  });

  test('rejects wrong action or ok false', () => {
    expect(ProposedWorkflowResultSchema.safeParse({ ok: false, action: 'workflow.run', data: { runId: 'run-123' } }).success).toBe(false);
    expect(ProposedWorkflowResultSchema.safeParse({ ok: true, action: 'workflow.status', data: { runId: 'run-123' } }).success).toBe(false);
  });
});
