import { describe, expect, test } from 'vitest';

import { resolveAgentToolAction } from './actions.js';

/**
 * The model may call a bare verb like `save` or `show` on `openchamber_knowledge`,
 * having dropped the namespace its own tool name appeared to supply.
 */
describe('a namespace the tool name already implies', () => {
  test('resolves a bare action inside the calling tool', () => {
    expect(resolveAgentToolAction('show', 'openchamber_knowledge')).toEqual({ action: 'knowledge.show' });
    expect(resolveAgentToolAction('save', 'openchamber_knowledge')).toEqual({ action: 'knowledge.save' });
    expect(resolveAgentToolAction('click', 'web')).toEqual({ action: 'browser.click' });
  });

  test('resolves a bare name that is ambiguous only across tools', () => {
    // `delete` belongs to schedule and to knowledge; inside one tool it is plain.
    expect(resolveAgentToolAction('delete', 'openchamber_knowledge')).toEqual({ action: 'knowledge.delete' });
    expect(resolveAgentToolAction('delete', 'openchamber')).toEqual({ action: 'schedule.delete' });
  });

  test('resolves the knowledge verbs inside their own tool only', () => {
    expect(resolveAgentToolAction('save', 'openchamber_knowledge')).toEqual({ action: 'knowledge.save' });
    expect(resolveAgentToolAction('show', 'openchamber_knowledge')).toEqual({ action: 'knowledge.show' });
    expect(resolveAgentToolAction('knowledge.list', 'openchamber').error).toBeDefined();
  });

  test('keeps a fully qualified action as it is', () => {
    expect(resolveAgentToolAction('knowledge.save', 'openchamber_knowledge')).toEqual({ action: 'knowledge.save' });
  });

  test('does not reach outside the tool that asked', () => {
    // The knowledge tool asking for `click` must fail, not drive the browser.
    expect(resolveAgentToolAction('click', 'openchamber_knowledge').action).toBeUndefined();
  });
});

describe('an unidentified caller', () => {
  test('still resolves a bare name that means one thing everywhere', () => {
    expect(resolveAgentToolAction('snapshot', null)).toEqual({ action: 'browser.snapshot' });
  });

  test('refuses a bare name that several actions share', () => {
    expect(resolveAgentToolAction('list', null).action).toBeUndefined();
  });
});

describe('what an unresolvable action reports', () => {
  test('names the actions the calling tool actually has', () => {
    const { error } = resolveAgentToolAction('get', 'openchamber_knowledge');

    expect(error).toContain('knowledge.save');
    expect(error).toContain('knowledge.show');
    // Listing every action of every tool would bury the ones that apply.
    expect(error).not.toContain('browser.open');
  });

  test('reports a missing action rather than resolving to something', () => {
    const { error, action } = resolveAgentToolAction('', 'openchamber_knowledge');

    expect(action).toBeUndefined();
    expect(error).toContain('missing');
  });

  test('an unknown tool falls back to the full action list', () => {
    const { error } = resolveAgentToolAction('nonsense', 'openchamber_future');

    expect(error).toContain('knowledge.save');
    expect(error).toContain('browser.open');
  });
});
