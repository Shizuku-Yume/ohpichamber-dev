import { describe, expect, it, vi } from 'vitest';

import { OpenChamberControlError } from './error.js';
import { createSyntheticDelivery } from './synthetic-delivery.js';

const message = { id: 'msg_1', text: '<openchamber-page-answer>B</openchamber-page-answer>', description: 'Page: B', metadata: {}, delivery: 'steer', resume: true };
const request = {
  input: { text: '', attachments: [], context: [{ kind: 'synthetic', text: message.text }] },
  options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null },
};

describe('synthetic delivery', () => {
  it('starts a run keyed by the message id in an idle session', async () => {
    const sessionService = { send: vi.fn(async () => ({})), steer: vi.fn() };
    await createSyntheticDelivery({ sessionService })('ses_1', message);
    expect(sessionService.send).toHaveBeenCalledWith('ses_1', request, 'msg_1');
    expect(sessionService.steer).not.toHaveBeenCalled();
  });

  it('steers a session whose run is active', async () => {
    const busy = Object.assign(new OpenChamberControlError('A run is already active', 409), { code: 'RUN_ACTIVE' });
    const sessionService = { send: vi.fn(async () => { throw busy; }), steer: vi.fn(async () => ({})) };
    await createSyntheticDelivery({ sessionService })('ses_1', message);
    expect(sessionService.steer).toHaveBeenCalledWith('ses_1', { request });
  });

  it('posts nothing for a message that must not wake the session', async () => {
    const sessionService = { send: vi.fn(), steer: vi.fn() };
    await createSyntheticDelivery({ sessionService })('ses_1', { ...message, resume: false });
    expect(sessionService.send).not.toHaveBeenCalled();
  });

  it('reports a gone session by status', async () => {
    const sessionService = { send: vi.fn(async () => { throw new OpenChamberControlError('Session not found', 404); }), steer: vi.fn() };
    await expect(createSyntheticDelivery({ sessionService })('ses_1', message)).rejects.toMatchObject({ status: 404 });
  });
});
