import { expect, test } from 'bun:test';
import type { Subagent } from '@openchamber/agent-contract';
import type { SubagentLifecyclePayload } from '@oh-my-pi/pi-coding-agent/task';
import type { ProjectionInput } from '../projection/protocol.ts';
import { SubagentProjector, type SubagentEventObservation } from './subagent-projection.ts';

function createProjectorHarness() {
  const liveSubagents = new Map<string, Subagent>();
  const pendingEvents = new Map<string, SubagentEventObservation[]>();
  const toolCallToSubagentId = new Map<string, string>();
  const emitted: ProjectionInput[] = [];
  const published: ProjectionInput[] = [];
  const backfills: Array<SubagentLifecyclePayload & { assignment?: string; task?: string }> = [];
  const projector = new SubagentProjector(
    'root-session',
    liveSubagents,
    pendingEvents,
    toolCallToSubagentId,
    inputs => emitted.push(...inputs),
    inputs => published.push(...inputs),
    payload => backfills.push(payload),
  );
  return { liveSubagents, emitted, published, backfills, projector };
}

test('correlateVibeSpawn backfills missing toolCallId, task, and generic vibe description when spawn arrives before tool completion', () => {
  const { liveSubagents, emitted, backfills, projector } = createProjectorHarness();

  projector.handleSubagentLifecycle({
    id: 'home-disk-usage-2',
    agent: 'sonic',
    agentSource: 'bundled',
    description: 'vibe fast session',
    status: 'started',
    sessionFile: '/tmp/root/home-disk-usage-2.jsonl',
    index: 0,
    detached: true,
  });

  expect(liveSubagents.get('home-disk-usage-2')).toMatchObject({
    subagentId: 'home-disk-usage-2',
    role: 'sonic',
    description: 'vibe fast session',
  });
  expect(liveSubagents.get('home-disk-usage-2')?.toolCallId).toBeUndefined();
  expect(liveSubagents.get('home-disk-usage-2')?.task).toBeUndefined();

  const correlated = projector.correlateVibeSpawn({
    subagentId: 'home-disk-usage-2',
    toolCallId: 'call-vibe-1',
    cli: 'fast',
    name: 'home-disk-usage-2',
    prompt: '\n  Inspect home directory disk usage   \n\nInclude top 10 folders.',
  });

  expect(correlated).toMatchObject({
    subagentId: 'home-disk-usage-2',
    toolCallId: 'call-vibe-1',
    description: 'Inspect home directory disk usage',
    task: '\n  Inspect home directory disk usage   \n\nInclude top 10 folders.',
  });
  expect(emitted).toHaveLength(2);
  expect(emitted[1]?.event).toEqual({
    type: 'subagent.updated',
    subagent: expect.objectContaining({
      subagentId: 'home-disk-usage-2',
      toolCallId: 'call-vibe-1',
      description: 'Inspect home directory disk usage',
      task: '\n  Inspect home directory disk usage   \n\nInclude top 10 folders.',
    }),
  });
  expect(backfills).toEqual([
    expect.objectContaining({
      id: 'home-disk-usage-2',
      parentToolCallId: 'call-vibe-1',
      description: 'Inspect home directory disk usage',
      task: '\n  Inspect home directory disk usage   \n\nInclude top 10 folders.',
      sessionFile: '/tmp/root/home-disk-usage-2.jsonl',
    }),
  ]);

  const completed = projector.handleSubagentLifecycle({
    id: 'home-disk-usage-2',
    agent: 'sonic',
    agentSource: 'bundled',
    description: 'vibe fast session',
    status: 'completed',
    sessionFile: '/tmp/root/home-disk-usage-2.jsonl',
    index: 0,
    detached: true,
  });
  expect(completed.description).toBe('Inspect home directory disk usage');
  expect(completed.toolCallId).toBe('call-vibe-1');
  expect(completed.task).toBe('\n  Inspect home directory disk usage   \n\nInclude top 10 folders.');
});

test('correlateVibeSpawn applies pending metadata when tool completion arrives before lifecycle start', () => {
  const { liveSubagents, emitted, projector } = createProjectorHarness();

  const longFirstLine = `${'A'.repeat(95)}\nSecond line detail`;
  const early = projector.correlateVibeSpawn({
    subagentId: 'parser-audit-1',
    toolCallId: 'call-vibe-2',
    cli: 'good',
    prompt: longFirstLine,
  });
  expect(early).toBeUndefined();
  expect(emitted).toHaveLength(0);

  const started = projector.handleSubagentLifecycle({
    id: 'parser-audit-1',
    agent: 'task',
    agentSource: 'bundled',
    description: 'vibe good session',
    status: 'started',
    sessionFile: '/tmp/root/parser-audit-1.jsonl',
    index: 0,
    detached: true,
  });

  expect(started.toolCallId).toBe('call-vibe-2');
  expect(started.task).toBe(longFirstLine);
  expect(started.description).toBe(`${'A'.repeat(79)}…`);
  expect(liveSubagents.get('parser-audit-1')).toEqual(started);
  expect(emitted).toHaveLength(1);
});

test('correlateVibeSpawn preserves existing toolCallId, existing task, and non-generic description', () => {
  const { liveSubagents, emitted, backfills, projector } = createProjectorHarness();

  projector.handleSubagentProgress({
    agent: 'task',
    task: 'Existing explicit task',
    parentToolCallId: 'existing-call-id',
    progress: {
      id: 'worker-custom',
      agent: 'task',
      status: 'running',
      description: 'Audit auth middleware',
      task: 'Existing explicit task',
    },
  });

  const before = liveSubagents.get('worker-custom');
  expect(before).toMatchObject({
    toolCallId: 'existing-call-id',
    task: 'Existing explicit task',
    description: 'Audit auth middleware',
  });

  const after = projector.correlateVibeSpawn({
    subagentId: 'worker-custom',
    toolCallId: 'new-call-id',
    cli: 'good',
    prompt: 'Replacement prompt should not overwrite',
  });

  expect(after).toEqual(before);
  expect(emitted).toHaveLength(1);
  expect(backfills).toHaveLength(0);
});
