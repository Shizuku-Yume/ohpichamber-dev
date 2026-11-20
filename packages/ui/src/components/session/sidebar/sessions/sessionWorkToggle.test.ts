import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { toast } from '@/components/ui';
import { CanonicalApiError } from '@/api/canonicalClient';
import type { useI18n } from '@/lib/i18n';
import * as sessionTabs from '@/lib/sessionTabs';
import * as sessionActions from '@/sync/session-actions';
import { toggleSessionWork } from './sessionWorkToggle';

const t: ReturnType<typeof useI18n>['t'] = (key) => key;
const session: Session = {
  sessionId: 'session', rootSessionId: 'session', projectId: 'project', workspaceId: 'workspace',
  displayPath: '.', createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
  metadata: null, metadataRevision: '0', archiveRevision: '0',
};

afterEach(() => mock.restore());

test('an empty work list starts the selected session', async () => {
  const update = spyOn(sessionActions, 'setSessionWorkState').mockResolvedValue(session);
  const leave = spyOn(sessionTabs, 'leaveFinishedSessions').mockImplementation(() => {});

  await toggleSessionWork('session', '/project', [], t);

  expect(update).toHaveBeenCalledWith('session', '/project', 'open');
  expect(leave).not.toHaveBeenCalled();
});

test('finishing work leaves sessions only after their updates succeed', async () => {
  const update = spyOn(sessionActions, 'setSessionWorkState').mockResolvedValue(session);
  const leave = spyOn(sessionTabs, 'leaveFinishedSessions').mockImplementation(() => {});

  await toggleSessionWork('session', '/project', [session], t);

  expect(update).toHaveBeenCalledWith('session', '/project', 'done');
  expect(leave).toHaveBeenCalledWith(['session']);
});

for (const [error, message] of [
  [new Error('Metadata write was refused'), 'Metadata write was refused'],
  [new CanonicalApiError({
    type: 'urn:ohpichamber:problem:SERVICE_UNAVAILABLE', title: 'Unavailable', status: 503,
    detail: 'Host delivery is unavailable', code: 'SERVICE_UNAVAILABLE', retryable: true,
  }), 'Host delivery is unavailable'],
  [undefined, 'sessions.sidebar.session.work.updateFailed'],
] as const) {
  test(`failed work updates show ${message} without leaving the session`, async () => {
    spyOn(sessionActions, 'setSessionWorkState').mockRejectedValue(error);
    const leave = spyOn(sessionTabs, 'leaveFinishedSessions').mockImplementation(() => {});
    const showError = spyOn(toast, 'error').mockImplementation(() => 'toast');

    await toggleSessionWork('session', '/project', [session], t);

    expect(showError).toHaveBeenCalledWith(message);
    expect(leave).not.toHaveBeenCalled();
  });
}
