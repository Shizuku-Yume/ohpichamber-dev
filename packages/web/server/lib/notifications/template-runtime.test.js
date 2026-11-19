import { describe, expect, it } from 'vitest';
import { createNotificationTemplateRuntime } from './template-runtime.js';
import { history, message, scope, snapshot, turn } from '../event-stream/canonical-test-fixtures.js';

const create = ({ sessionService = { open: async () => snapshot(), history: async () => history() } } = {}) => createNotificationTemplateRuntime({
  sessionService, resolveSessionScope: async () => ({ ...scope, cwd: '/does-not-exist/private-workspace' }),
  readSettingsFromDisk: async () => ({ projects: [{ id: 'project', label: 'Project label' }] }), resolveGitBinaryForSpawn: () => 'git',
});

describe('canonical notification templates', () => {
  it('extracts only canonical text, not reasoning/tool output', () => {
    const runtime = create();
    expect(runtime.extractLastMessageText(message({ parts: [{ type: 'reasoning', partId: 'r', content: 'private thought' },
      { type: 'text', partId: 't', content: 'final answer' }] }))).toBe('final answer');
    expect(runtime.shouldApplyResolvedTemplateMessage('{last_message}', ' ', { last_message: '' })).toBe(false);
  });

  it('gets the most recent settled assistant text from a canonical snapshot, not a history activity heuristic', async () => {
    const records = [message({ parts: [{ type: 'reasoning', partId: 'r', content: 'private thought' }, { type: 'text', partId: 't', content: 'final answer' }] })];
    const runtime = create({ sessionService: { open: async () => snapshot(records, [turn()]), history: async () => { throw new Error('must not read history'); } } });
    expect(await runtime.fetchLastAssistantMessageText('session')).toBe('final answer');
  });

  it('distinguishes successful missing text from a failed snapshot/history load', async () => {
    const empty = create(); expect(await empty.fetchLastAssistantMessageText('session')).toBe('');
    const failed = create({ sessionService: { open: async () => snapshot(), history: async () => { throw new Error('unavailable'); } } });
    await expect(failed.fetchLastAssistantMessageText('session', 'old-message')).rejects.toThrow('unavailable');
  });

  it('uses the current OMP title and never puts an absolute cwd into template variables', async () => {
    let title = 'OMP title';
    const runtime = create({ sessionService: { open: async () => snapshot([], [], { title }), history: async () => history() } });
    expect((await runtime.buildTemplateVariables(null, 'session')).session_name).toBe('OMP title');
    title = 'Renamed title';
    const variables = await runtime.buildTemplateVariables(null, 'session');
    expect(variables.session_name).toBe('Renamed title'); expect(variables.worktree).toBe('.');
    expect(JSON.stringify(variables)).not.toContain('/does-not-exist');
  });

  it('uses the neutral label when the snapshot has no title', async () => {
    const runtime = create();
    expect((await runtime.buildTemplateVariables(null, 'session')).session_name).toBe('Session');
  });
});
