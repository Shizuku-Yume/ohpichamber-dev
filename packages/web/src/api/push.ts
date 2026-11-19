<<<<<<< HEAD
import type { ApnsTokenPayload, NativePushStatus, PushAPI, PushSubscribePayload, PushUnsubscribePayload } from '@openchamber/ui/lib/api/types';
||||||| bc50ba56aa
import type { ApnsTokenPayload, PushAPI, PushSubscribePayload, PushUnsubscribePayload } from '@openchamber/ui/lib/api/types';
=======
import type { ApnsTokenPayload, PushAPI, PushSubscribePayload, PushUnsubscribePayload } from '@openchamber/ui/lib/api/push';
>>>>>>> upstream/main
import { runtimeFetch } from '@openchamber/ui/lib/runtime-fetch';

const fetchJson = async <T>(input: string | URL | Request, init?: RequestInit): Promise<T | null> => {
  try {
    const res = await runtimeFetch(input, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as T;
  } catch {
    return null;
  }
};

export const createWebPushAPI = (): PushAPI => ({
  async getVapidPublicKey() {
    return fetchJson<{ publicKey: string }>('/api/push/vapid-public-key');
  },

  async subscribe(payload: PushSubscribePayload) {
    return fetchJson<{ ok: true }>('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  },

  async unsubscribe(payload: PushUnsubscribePayload) {
    return fetchJson<{ ok: true }>('/api/push/subscribe', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  },

  async setVisibility(payload: { visible: boolean; platform?: string }) {
    return fetchJson<{ ok: true }>('/api/push/visibility', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  },

  async nativeStatus(): Promise<NativePushStatus | null> {
    const status = await fetchJson<{ available?: boolean; reason?: string; relaySetting?: string; disabledSetting?: string }>('/api/push/native-status');
    if (!status || typeof status.available !== 'boolean') return null;
    if (status.available) return { available: true };
    const relaySetting = status.relaySetting?.trim() || 'OPENCHAMBER_PUSH_RELAY_URL';
    if (status.reason === 'direct-config-missing') {
      return {
        available: false,
        reason: 'direct-config-missing',
        relaySetting,
        disabledSetting: status.disabledSetting?.trim() || 'OPENCHAMBER_PUSH_RELAY_DISABLED',
      };
    }
    // Any other reason still means this server cannot deliver remote push. There is
    // no built-in relay, so "needs a relay URL" is what this build needs; saying it
    // beats hiding the unavailable state behind a null.
    return { available: false, reason: 'relay-url-missing', relaySetting };
  },

  async registerApnsToken(payload: ApnsTokenPayload) {
    return fetchJson<{ ok: true }>('/api/push/apns-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  },

  async unregisterApnsToken(payload: ApnsTokenPayload) {
    return fetchJson<{ ok: true }>('/api/push/apns-token', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  },

  async getDeliveryStatus() {
    return fetchJson<{ localOnly: boolean }>('/api/push/delivery');
  },
});
