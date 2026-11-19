import { describe, expect, test, vi } from 'bun:test';
import { AskRequestSchema, type JsonValue } from '@openchamber/agent-contract';
import { NativeFormDialog } from './form-dialog.ts';
import { WorkerInteraction } from './interaction.ts';
import { InteractionManager } from '../interaction/manager.ts';
import type { WorkerInteraction as Interaction } from '../protocol.ts';

const html = `<form><input type="hidden" name="token" value="fixed">
<fieldset><legend>Database</legend><p>Choose a database</p>
<label><input type="radio" name="db" value="sqlite" checked required>Same</label>
<label><input type="radio" name="db" value="postgres">Same</label>
<label><input type="radio" name="db" value="disabled" disabled>Disabled</label></fieldset>
<label>Count<input type="number" name="count" value="2" min="1" max="5" required></label>
<label>Notes<textarea name="notes"> initial </textarea></label></form>`;
const answer = (selectedOptions = ['1'], count = '3', notes = ' exact ') => ({ results: [
  { id: 'field-0', selectedOptions },
  { id: 'field-1', selectedOptions: [], customInput: count },
  { id: 'field-2', selectedOptions: [], customInput: notes },
] });

describe('native HTML forms', () => {
  test('maps duplicate labels to exact native values, numbers, hidden inputs and untrimmed text', () => {
    const form = new NativeFormDialog(html, 20_000);
    const schema = AskRequestSchema.parse(form.schema);
    expect(schema).toMatchObject({ type: 'omp.ask', form: true, timeout: 20_000 });
    expect(schema.questions[0]).toMatchObject({ question: 'Choose a database', context: 'Database', initialSelected: ['0'], allowCustom: true, options: [
      { label: '0', displayLabel: 'Same', disabled: false },
      { label: '1', displayLabel: 'Same', disabled: false },
      { label: '2', displayLabel: 'Disabled', disabled: true },
    ] });
    expect(form.update(answer(), true)).toBe(true);
    expect(form.result()).toEqual({ data: { token: 'fixed', db: 'postgres', count: 3, notes: ' exact ' } });
    expect(form.update({ ...answer(), results: answer().results.map((result, index) => index === 0 ? { ...result, selectedOptions: [], customInput: 'other database' } : result) }, true)).toBe(true);
    expect(form.result().data.db).toBe('other database');
  });

  test('rejects empty forms and malformed, disabled, duplicate and invalid required answers without replacing current values', () => {
    expect(() => new NativeFormDialog('<form><p>No controls</p></form>')).toThrow('named control');
    const form = new NativeFormDialog(html);
    for (const response of [null, {}, { results: [] }, answer(['2']), answer(['1', '1']), answer(['99']), answer(['1'], '9'), answer([], '')]) {
      expect(form.update(response, true)).toBe(false);
    }
    expect(form.result(true)).toEqual({ data: { token: 'fixed', db: 'sqlite', count: 2, notes: ' initial ' }, timedOut: true });
  });

  test('accepts optional empty controls, multiple checks and Other together', () => {
    const form = new NativeFormDialog('<form><label><input type="checkbox" name="x" value="a">A</label><label><input type="checkbox" name="x" value="b">B</label><textarea name="text"></textarea></form>');
    expect(form.update({ results: [{ id: 'field-0', selectedOptions: ['0'], customInput: ' extra ' }, { id: 'field-1', selectedOptions: [], customInput: '' }] }, true)).toBe(true);
    expect(form.result().data).toEqual({ x: ['a', 'extra'], text: '' });
    expect(form.update({ results: [{ id: 'field-0', selectedOptions: [] }, { id: 'field-1', selectedOptions: [], customInput: '' }] }, true)).toBe(true);
    expect(form.result().data).toEqual({ x: [], text: '' });
  });

  test('keeps media in safe Markdown, not executable model HTML or local-file reads', () => {
    const form = new NativeFormDialog(`<form><img src="https://example.com/image.png" alt="Example"><img src="javascript:alert(1)"><img src="file:///private/image.png">
<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><circle r="2"/></svg><script>bad()</script><input name="answer"></form>`);
    const context = AskRequestSchema.parse(form.schema).questions[0]?.context ?? '';
    expect(context).toContain('![Example](<https://example.com/image.png>)');
    expect(context).toContain('```svg\n');
    expect(context).not.toContain('javascript:');
    expect(context).not.toContain('file:///');
    expect(context).not.toContain('bad()');
  });

  test('worker returns current draft on timeout, including incomplete required values, and releases the handle', async () => {
    const requests: Interaction[] = [];
    const worker = new WorkerInteraction({ request: request => requests.push(request), currentTurn: () => 'turn' });
    try {
      const result = worker.ui.formDialog!(html, { timeout: 1000 });
      const request = requests[0];
      if (request?.kind !== 'question') throw new Error('Question missing');
      expect(worker.resolveQuestion(request.questionId, 'update', answer([], '') as JsonValue)).toBe(true);
      expect(worker.resolveQuestion(request.questionId, 'timeout')).toBe(true);
      await expect(result).resolves.toEqual({ data: { token: 'fixed', count: '', notes: ' exact ' }, timedOut: true });
      expect(worker.resolveQuestion(request.questionId, 'timeout')).toBe(false);
    } finally { worker.close(); }
  });

  test('message interruption reports changed current values only and revokes the canonical question', async () => {
    const requests: Interaction[] = [];
    const abandoned = vi.fn();
    const signal = new AbortController();
    const worker = new WorkerInteraction({ request: request => requests.push(request), currentTurn: () => 'turn' });
    try {
      const result = worker.ui.formDialog!(html, { signal: signal.signal, onAbandon: abandoned });
      const request = requests[0];
      if (request?.kind !== 'question') throw new Error('Question missing');
      expect(worker.resolveQuestion(request.questionId, 'update', answer(['0'], '4', ' initial ') as JsonValue)).toBe(true);
      signal.abort();
      await expect(result).resolves.toBeUndefined();
      expect(abandoned).toHaveBeenCalledWith({ data: { count: 4 } });
      expect(requests.at(-1)).toEqual({ kind: 'cancel', questionId: request.questionId });
      expect(worker.resolveQuestion(request.questionId, 'answer', answer() as JsonValue)).toBe(false);
    } finally { worker.close(); }
  });

  test('canonical draft updates reset inactivity with a new CAS version; expiry submits current worker values', async () => {
    vi.useFakeTimers();
    const manager = new InteractionManager(5);
    const worker = new WorkerInteraction({ request: request => manager.onRequest('session', 'worker', request), currentTurn: () => 'turn' });
    manager.openSession('session', 'epoch', 'worker', 'workspace', async operation => {
      if (operation.type !== 'question.resolve' || !worker.resolveQuestion(operation.questionId, operation.action, operation.response)) throw new Error('Invalid worker reply');
    }, () => {});
    try {
      const pending = worker.ui.formDialog!(html, { timeout: 100 });
      const request = manager.questions('session')[0]!;
      const cas = { version: request.version, epoch: request.epoch, workerGeneration: request.workerGeneration };
      vi.advanceTimersByTime(90);
      const updated = await manager.resolveQuestion('session', request.questionId, { ...cas, action: 'update', response: answer() as JsonValue });
      expect(updated).toMatchObject({ status: 'pending', version: '2', timeoutResetAt: Date.now() });
      await expect(manager.resolveQuestion('session', request.questionId, { ...cas, action: 'update', response: answer() as JsonValue })).rejects.toMatchObject({ code: 'QUESTION_CONFLICT' });
      vi.advanceTimersByTime(90);
      expect(manager.questions('session')).toHaveLength(1);
      vi.advanceTimersByTime(10);
      await expect(pending).resolves.toEqual({ data: { token: 'fixed', db: 'postgres', count: 3, notes: ' exact ' }, timedOut: true });
      await expect(manager.resolveQuestion('session', request.questionId, { ...cas, action: 'answer', response: answer() as JsonValue })).rejects.toMatchObject({ code: 'QUESTION_EXPIRED' });
      const noTimeout = worker.ui.formDialog!(html);
      vi.advanceTimersByTime(1000);
      expect(manager.questions('session')).toHaveLength(1);
      const second = manager.questions('session')[0]!;
      await manager.resolveQuestion('session', second.questionId, { ...cas, action: 'cancel' });
      await expect(noTimeout).resolves.toBeUndefined();
    } finally { worker.close(); manager.closeSession('session'); vi.useRealTimers(); }
  });
});
