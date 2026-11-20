import { expect, expectTypeOf, it } from 'vitest';
import { loadAssistContext } from '../session-assist/context.js';
import type { AssistTurn } from '../session-assist/contracts.js';
import { history, message } from '../event-stream/canonical-test-fixtures.js';

it('exposes only the checked final assistant as present', async () => {
  const context = await loadAssistContext({
    signal: new AbortController().signal,
    readPage: async () => history([
      message({ messageId: 'user', role: 'user', parts: [{ type: 'text', partId: 'request', content: 'Implement it.' }] }),
      message({ parts: [{ type: 'text', partId: 'answer', content: 'Finished.' }] }),
    ]),
  });
  if (!context) throw new Error('Expected a completed context');
  const turn = context.turns.at(-1);
  expectTypeOf(context.last.text).toEqualTypeOf<string>();
  expectTypeOf(context.turns.at(0)).toEqualTypeOf<AssistTurn | undefined>();
  expect(context.last.text).toBe('Finished.');
  expect(turn?.assistant?.text).toBe('Finished.');
  expect(turn).not.toHaveProperty('changedFiles');
  expect(context.last).not.toHaveProperty('providerID');
  expect(context.last).not.toHaveProperty('modelID');
});
