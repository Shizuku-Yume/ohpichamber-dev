import { afterEach, describe, expect, test } from 'bun:test';
import type { JsonObject, ToolCallPart, ToolResultPart, ToolStatus } from '@openchamber/agent-contract';
import { affectedDirectories, fileTreeChanges, subscribeFileTreeChanges, type FileTreeChange } from './fileTreeChanges';

const unsubscribers: Array<() => void> = [];
afterEach(() => {
  while (unsubscribers.length) unsubscribers.pop()?.();
  fileTreeChanges.reset();
});
const record = () => {
  const changes: FileTreeChange[] = [];
  unsubscribers.push(subscribeFileTreeChanges((change) => changes.push(change)));
  return changes;
};
const call = (id: string, toolName = 'write', input: JsonObject = {}, status: ToolStatus = 'running'): ToolCallPart => ({
  type: 'tool_call', partId: `call-${id}`, toolCallId: id, toolName, input, status,
});
const result = (id: string, toolName = 'write', isError = false): ToolResultPart => ({
  type: 'tool_result', partId: `result-${id}`, toolCallId: id, toolName, isError,
});

describe('native file tree changes', () => {
  test('resolves a native write path from its matching call, not the result part identity', () => {
    const changes = record();
    fileTreeChanges.toolTransition('/repo', 'session', call('one', 'write', { path: 'src/new.ts' }), result('one'));
    fileTreeChanges.toolTransition('/repo', 'session', call('two', 'write', { path: '/elsewhere/x.ts' }), result('two'));
    fileTreeChanges.toolTransition('/repo', 'session', call('three', 'write', { path: '[src/other.ts#ABCD]' }), result('three'));
    expect(changes).toEqual([
      { directory: '/repo', paths: ['/repo/src/new.ts'] },
      { directory: '/repo', paths: ['/elsewhere/x.ts'] },
      { directory: '/repo', paths: ['/repo/src/other.ts'] },
    ]);
  });

  test('terminal calls and split results invalidate once even after the run ends', () => {
    const changes = record();
    const running = call('one', 'write', { path: 'a.ts' });
    fileTreeChanges.toolTransition('/repo', 'session', running, { ...running, status: 'completed' });
    fileTreeChanges.toolTransition('/repo', 'session', running, result('one'));
    fileTreeChanges.runCompleted('/repo', 'session');
    fileTreeChanges.toolTransition('/repo', 'session', undefined, result('one'));
    expect(changes).toEqual([{ directory: '/repo', paths: ['/repo/a.ts'] }]);
  });

  test('running, denied and read-only calls do not invalidate listings', () => {
    const changes = record();
    fileTreeChanges.toolTransition('/repo', 'session', undefined, call('running'));
    fileTreeChanges.toolTransition('/repo', 'session', undefined, call('denied', 'write', {}, 'denied'));
    fileTreeChanges.toolTransition('/repo', 'session', call('denied', 'write', {}, 'denied'), result('denied'));
    fileTreeChanges.toolTransition('/repo', 'session', call('read', 'read'), result('read', 'read'));
    fileTreeChanges.runCompleted('/repo', 'session');
    expect(changes).toEqual([]);
  });

  test('bash, edit grammars and unknown tools coalesce at native run completion', () => {
    const changes = record();
    fileTreeChanges.toolTransition('/repo', 'session', call('bash', 'bash', { command: 'mkdir x' }), result('bash', 'bash', true));
    fileTreeChanges.toolTransition('/repo', 'session', call('edit', 'edit', { input: '[src/a.ts#0000]\nMV src/b.ts\n' }), result('edit', 'edit'));
    fileTreeChanges.toolTransition('/repo', 'session', call('mcp', 'mcp_write'), result('mcp', 'mcp_write'));
    expect(changes).toEqual([]);
    fileTreeChanges.runCompleted('/repo', 'session');
    fileTreeChanges.runCompleted('/repo', 'session');
    expect(changes).toEqual([{ directory: '/repo' }]);
  });

  test('a mismatched call never supplies another result its path', () => {
    const changes = record();
    fileTreeChanges.toolTransition('/repo', 'session', call('other', 'write', { path: 'wrong.ts' }), result('one'));
    expect(changes).toEqual([]);
    fileTreeChanges.runCompleted('/repo', 'session');
    expect(changes).toEqual([{ directory: '/repo' }]);
  });

  test('pending mutations are scoped to session and directory and reset with the runtime', () => {
    const changes = record();
    fileTreeChanges.toolTransition('/repo', 'busy', undefined, result('one', 'bash'));
    fileTreeChanges.runCompleted('/other', 'busy');
    fileTreeChanges.runCompleted('/repo', 'other');
    expect(changes).toEqual([]);
    fileTreeChanges.reset();
    fileTreeChanges.runCompleted('/repo', 'busy');
    expect(changes).toEqual([]);
    fileTreeChanges.toolTransition('/repo', 'busy', undefined, result('one', 'bash'));
    fileTreeChanges.runCompleted('', 'busy');
    expect(changes).toEqual([]);
    fileTreeChanges.runCompleted('/repo', 'busy');
    expect(changes).toEqual([{ directory: '/repo' }]);
  });

  test('explicit unknown Host changes remain immediate', () => {
    const changes = record();
    fileTreeChanges.unknownChange('/repo');
    expect(changes).toEqual([{ directory: '/repo' }]);
  });
});

describe('affectedDirectories', () => {
  test('named files map to distinct parent folders inside the root', () => {
    expect(affectedDirectories({ directory: '/repo', paths: ['/repo/src/a.ts', '/repo/src/b.ts', '/repo/top.ts', '/other/x.ts'] }, '/repo'))
      .toEqual(['/repo/src', '/repo']);
    expect(affectedDirectories({ directory: '/repo', paths: ['/repo-other/x.ts'] }, '/repo')).toEqual([]);
  });
  test('unknown changes cover overlapping trees only', () => {
    expect(affectedDirectories({ directory: '/repo' }, '/repo/src')).toBeNull();
    expect(affectedDirectories({ directory: '/repo/src' }, '/repo')).toBeNull();
    expect(affectedDirectories({ directory: '/other' }, '/repo')).toEqual([]);
  });
});
