import { afterEach, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import { z } from 'zod';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  HTMLTextAreaElement: browser.HTMLTextAreaElement,
  Event: browser.Event,
  FocusEvent: browser.FocusEvent,
  CustomEvent: browser.CustomEvent,
  MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

// React's input-event support is detected when react-dom loads, and the toast
// module must be loaded before its `error` method can be observed.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { toast } = await import('@/components/ui');
const { BehaviorPage } = await import('./BehaviorPage');

// The write the page makes for a response-style edit. Unknown keys (including
// the retired global prompt) are rejected rather than silently accepted.
const responseStyleWriteSchema = z.object({
  responseStyleEnabled: z.boolean().optional(),
  responseStylePreset: z.literal('custom').optional(),
  responseStyleCustomInstructions: z.string(),
}).strict();

type ResponseStyleWrite = z.infer<typeof responseStyleWriteSchema>;

const container = document.createElement('div');
document.body.appendChild(container);
const root = createRoot(container);
const fetchSpy = spyOn(globalThis, 'fetch');
const toastErrors: string[] = [];
const toastErrorSpy = spyOn(toast, 'error').mockImplementation((message) => {
  toastErrors.push(String(message));
  return 'error';
});

afterEach(async () => {
  await act(async () => root.unmount());
  fetchSpy.mockRestore();
  toastErrorSpy.mockRestore();
  browser.close();
});

test('response style loads and saves through Host settings, and a failed write retries', async () => {
  const requests: string[] = [];
  const writes: Array<{ body: ResponseStyleWrite; finish: () => void; fail: () => void }> = [];
  let persisted = 'old';

  fetchSpy.mockImplementation(async (input, init) => {
    const request = new Request(input instanceof Request ? input : new URL(input, window.location.href), init);
    const pathname = new URL(request.url).pathname;
    requests.push(`${request.method} ${pathname}`);
    if (pathname !== '/api/config/settings') {
      throw new Error(`Unexpected request: ${request.method} ${pathname}`);
    }
    if (request.method === 'GET') {
      return Response.json({
        // A document from before the retirement still carries this field; the
        // page must not load it into an editor or send it back.
        globalBehaviorPrompt: 'Retired instructions',
        responseStyleEnabled: true,
        responseStylePreset: 'custom',
        responseStyleCustomInstructions: persisted,
      });
    }
    const body = responseStyleWriteSchema.parse(await request.json());
    const write = Promise.withResolvers<Response>();
    writes.push({
      body,
      finish: () => {
        persisted = body.responseStyleCustomInstructions;
        write.resolve(Response.json(body));
      },
      fail: () => write.resolve(new Response(null, { status: 500 })),
    });
    return write.promise;
  });

  const settle = async () => {
    await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
  };
  await act(async () => { root.render(<I18nProvider><BehaviorPage /></I18nProvider>); });
  await settle();

  expect(container.querySelector('textarea[rows="12"]')).toBeNull();
  expect(container.textContent).not.toContain('Retired instructions');

  const instructions = container.querySelector<HTMLTextAreaElement>('textarea[rows="5"]');
  if (!instructions) throw new Error('Missing response style field');
  expect(instructions.disabled).toBe(false);
  expect(instructions.value).toBe('old');

  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (!setValue) throw new Error('Missing native textarea setter');
  const edit = async (value: string) => {
    await act(async () => {
      setValue.call(instructions, value);
      instructions.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { instructions.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    await settle();
  };

  await edit('newer');
  await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 250)); });
  expect(writes).toHaveLength(1);
  expect(writes[0].body.responseStyleCustomInstructions).toBe('newer');
  // Unchanged fields may be omitted as redundant; if sent, they must match the
  // value the page loaded.
  if (writes[0].body.responseStyleEnabled !== undefined) {
    expect(writes[0].body.responseStyleEnabled).toBe(true);
  }
  if (writes[0].body.responseStylePreset !== undefined) {
    expect(writes[0].body.responseStylePreset).toBe('custom');
  }

  // The failed write is reported and does not advance the saved baseline, so
  // leaving the field again retries the same draft.
  await act(async () => { writes[0].fail(); });
  await settle();
  expect(toastErrors).toHaveLength(1);
  expect(toastErrors[0]).toContain('Couldn\'t save');
  expect(instructions.value).toBe('newer');
  expect(persisted).toBe('old');

  await act(async () => { instructions.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  await settle();
  await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 250)); });
  expect(writes).toHaveLength(2);
  expect(writes[1].body.responseStyleCustomInstructions).toBe('newer');
  await act(async () => { writes[1].finish(); });
  await settle();
  expect(persisted).toBe('newer');
  expect(instructions.value).toBe('newer');
  expect(requests.every((entry) => entry === 'GET /api/config/settings' || entry === 'PUT /api/config/settings')).toBe(true);
});
