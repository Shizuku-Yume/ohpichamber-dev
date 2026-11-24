import { describe, expect, test } from 'bun:test';

import type { Message } from '@openchamber/agent-contract';
import { findSubagentTask } from './subagentTask';

const assistant = (messageId: string, sessionId: string, parts: Message['parts']): Message => ({
  messageId,
  sessionId,
  turnId: 'turn-1',
  role: 'assistant',
  createdAt: 1,
  parts,
});

const user = (messageId: string, sessionId: string, text: string): Message => ({
  messageId,
  sessionId,
  turnId: 'turn-1',
  role: 'user',
  createdAt: 1,
  parts: [{ type: 'text', partId: `${messageId}:text`, content: text }],
});

describe('findSubagentTask', () => {
  test('reads single task prompt matched by toolCallId', () => {
    const parent = [
      assistant('a1', 'parent', [
        {
          type: 'tool_call',
          partId: 'p1',
          toolCallId: 'call-1',
          toolName: 'task',
          status: 'completed',
          input: { name: 'OtherScout', agent: 'scout', task: 'Not this one' },
        },
        {
          type: 'tool_call',
          partId: 'p2',
          toolCallId: 'call-2',
          toolName: 'task',
          status: 'completed',
          input: { name: 'SettingsAuditScout', agent: 'scout', task: 'Audit the settings pages' },
        },
      ]),
    ];
    expect(
      findSubagentTask(parent, undefined, {
        subagentId: 'SettingsAuditScout',
        toolCallId: 'call-2',
        name: 'SettingsAuditScout',
        role: 'scout',
      }),
    ).toBe('Audit the settings pages');
  });

  test('reads batch tasks[] prompt matched by subagent name and includes shared context', () => {
    const parent = [
      assistant('a1', 'parent', [
        {
          type: 'tool_call',
          partId: 'p1',
          toolCallId: 'call-batch',
          toolName: 'task',
          status: 'running',
          input: {
            context: 'Inspect packages/ui/src/components/chat',
            tasks: [
              { name: 'PanelScout', agent: 'scout', task: 'Check SubagentsPanel' },
              { name: 'StoreScout', agent: 'scout', task: 'Check useSubagentsStore' },
            ],
          },
        },
      ]),
    ];
    expect(
      findSubagentTask(parent, undefined, {
        subagentId: 'StoreScout-2',
        toolCallId: 'call-batch',
        name: 'StoreScout-2',
        role: 'scout',
      }),
    ).toBe('Inspect packages/ui/src/components/chat\n\nCheck useSubagentsStore');
  });

  test('formats steps[] tasks when task.steps mode is used', () => {
    const parent = [
      assistant('a1', 'parent', [
        {
          type: 'tool_call',
          partId: 'p1',
          toolCallId: 'call-steps',
          toolName: 'task',
          status: 'completed',
          input: {
            name: 'StepWorker',
            agent: 'task',
            steps: ['Read contract', 'Update UI'],
          },
        },
      ]),
    ];
    expect(
      findSubagentTask(parent, undefined, {
        subagentId: 'StepWorker',
        toolCallId: 'call-steps',
      }),
    ).toBe('1. Read contract\n2. Update UI');
  });

  test("falls back to stored subagent task, then to child's first user prompt", () => {
    expect(
      findSubagentTask([], [], { subagentId: 's1', task: 'Stored prompt' }),
    ).toBe('Stored prompt');
    expect(
      findSubagentTask([], [user('u1', 'child', 'Do the thing')], { subagentId: 's1' }),
    ).toBe('Do the thing');
  });

  test('returns null when neither parent tool call, stored task, nor child message exists', () => {
    expect(findSubagentTask(undefined, undefined, { subagentId: 'missing' })).toBeNull();
  });
});
