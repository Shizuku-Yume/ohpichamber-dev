import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { toast } from '@/components/ui';
import { registerRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import type { NotificationsAPI } from '@/lib/api/types';
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { handleUiNotificationEvent } from './surface-notifications';

// Module mocks of @/lib/runtime-switch survive the file in the shared worker
// process and break every other suite's runtime-switch staleness detection, so
// this suite drives the real switch end to end.
const notify = mock(async (_payload?: import('@/lib/api/types').NotificationPayload) => false);
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const registeredNotifications: NotificationsAPI = { notifyAgentCompletion: async () => false };
const originalRuntimeKey = getRuntimeKey();
const originalBase = getRuntimeApiBaseUrl();

const useRuntime = (runtimeKey: string) => {
  switchRuntimeEndpoint({ apiBaseUrl: `https://surface-${runtimeKey}.test`, runtimeKey });
};

beforeEach(() => {
  useRuntime('local');
  notify.mockReset();
  notify.mockResolvedValue(false);
  registeredNotifications.notifyAgentCompletion = notify;
  // SAFETY: the handler under test only reads `.notifications` off the registered
  // runtime APIs; the remaining surface is never touched by this suite.
  registerRuntimeAPIs({ notifications: registeredNotifications } as import('@/lib/api/types').RuntimeAPIs);
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { visibilityState: 'visible', hasFocus: () => true },
  });
});

afterEach(() => {
  registerRuntimeAPIs(null);
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
  switchRuntimeEndpoint({ apiBaseUrl: originalBase, runtimeKey: originalRuntimeKey });
});

describe('Host notification presentation', () => {
  test('uses the runtime notification capability and preserves the Host session scope', () => {
    const showToast = spyOn(toast, 'info');
    handleUiNotificationEvent({ title: ' Done ', body: ' Finished ', kind: 'complete', sessionId: 'session-a', directory: '/repo', tag: 'done' });
    expect(notify).toHaveBeenCalledWith({
      title: 'Done', body: 'Finished', kind: 'complete', sessionId: 'session-a', directory: '/repo', tag: 'done',
      runtimeKey: 'local', requireHidden: false,
    });
    expect(showToast).not.toHaveBeenCalled();
  });

  test('retains focused plugin toasts and leaves native notifications hidden-only', () => {
    const showToast = spyOn(toast, 'info').mockReturnValue('toast');
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
    useRuntime('remote-host');
    handleUiNotificationEvent({ title: 'Done', desktopNotificationDelivered: true });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  test('keeps toast-only answers and unsupported capabilities out of native delivery', () => {
    handleUiNotificationEvent({ kind: 'share-answer', title: 'Answered', toastOnly: true });
    registerRuntimeAPIs(null);
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
