import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';

const notify = mock(async (_payload: unknown) => undefined);
const showToast = mock((_title: string, _options?: unknown) => 'toast');
let runtimeKey = 'local';
let available = true;
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

mock.module('@/components/ui', () => ({ toast: { info: showToast } }));
mock.module('@/lib/runtime-switch', () => ({ getRuntimeKey: () => runtimeKey }));
mock.module('@/contexts/runtimeAPIRegistry', () => ({
  getRegisteredRuntimeAPIs: () => available ? { notifications: { notifyAgentCompletion: notify } } : null,
}));

const { handleUiNotificationEvent } = await import('./surface-notifications');

beforeEach(() => {
  runtimeKey = 'local';
  available = true;
  notify.mockReset();
  notify.mockResolvedValue(undefined);
  showToast.mockClear();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { visibilityState: 'visible', hasFocus: () => true },
  });
});
afterEach(() => {
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
});

describe('Host notification presentation', () => {
  test('uses the runtime notification capability and preserves the Host session scope', () => {
    handleUiNotificationEvent({ title: ' Done ', body: ' Finished ', kind: 'complete', sessionId: 'session-a', directory: '/repo', tag: 'done' });
    expect(notify).toHaveBeenCalledWith({
      title: 'Done', body: 'Finished', kind: 'complete', sessionId: 'session-a', directory: '/repo', tag: 'done',
      runtimeKey: 'local', requireHidden: false,
    });
    expect(showToast).not.toHaveBeenCalled();
  });

  test('retains focused plugin toasts and leaves native notifications hidden-only', () => {
    handleUiNotificationEvent({ kind: ' plugin ', title: ' Ready ', body: 'Done', showWhenFocused: true });
    expect(showToast).toHaveBeenCalledWith('Ready', { id: 'plugin|Ready|Done', description: 'Done' });
    expect(notify.mock.calls[0]?.[0]).toMatchObject({ kind: 'plugin', requireHidden: true });
  });

  test('does not invent a notification or session directory from an empty payload', () => {
    handleUiNotificationEvent({});
    handleUiNotificationEvent({ title: ' ', body: ' ' });
    expect(notify).not.toHaveBeenCalled();
    handleUiNotificationEvent({ title: 'Host notice' });
    expect(notify.mock.calls[0]?.[0]).toMatchObject({ directory: undefined, sessionId: undefined });
  });

  test('avoids duplicate local desktop delivery without suppressing a remote client', () => {
    handleUiNotificationEvent({ title: 'Done', desktopNotificationDelivered: true });
    handleUiNotificationEvent({ title: 'Done', desktopStdoutActive: true });
    expect(notify).not.toHaveBeenCalled();
    runtimeKey = 'remote-host';
    handleUiNotificationEvent({ title: 'Done', desktopNotificationDelivered: true });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  test('keeps toast-only answers and unsupported capabilities out of native delivery', () => {
    handleUiNotificationEvent({ kind: 'share-answer', title: 'Answered', toastOnly: true });
    available = false;
    expect(() => handleUiNotificationEvent({ title: 'Done' })).not.toThrow();
    expect(notify).not.toHaveBeenCalled();
  });

  test('reports a failed runtime delivery without an unhandled rejection', async () => {
    const failure = new Error('Notification capability unavailable');
    notify.mockRejectedValueOnce(failure);
    const warning = spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      handleUiNotificationEvent({ title: 'Done' });
      await Promise.resolve();
      expect(warning).toHaveBeenCalledWith('[notifications] failed to dispatch UI notification', failure);
    } finally {
      warning.mockRestore();
    }
  });
});
