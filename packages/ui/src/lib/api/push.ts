export interface PushSubscribePayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  origin?: string;
  platform?: string;
}

export interface PushUnsubscribePayload {
  endpoint: string;
}

export interface ApnsTokenPayload {
  token: string;
  platform?: string;
  environment?: 'sandbox' | 'production';
  pushKey?: string;
}

export type NativePushStatus =
  | { available: true }
  | { available: false; reason: 'relay-url-missing'; relaySetting: string }
  | { available: false; reason: 'direct-config-missing'; relaySetting: string; disabledSetting: string };

export interface PushAPI {
  nativeStatus?(): Promise<NativePushStatus | null>;
  getVapidPublicKey(): Promise<{ publicKey: string } | null>;
  subscribe(payload: PushSubscribePayload): Promise<{ ok: true } | null>;
  unsubscribe(payload: PushUnsubscribePayload): Promise<{ ok: true } | null>;
  setVisibility(payload: { visible: boolean; platform?: string }): Promise<{ ok: true } | null>;
  registerApnsToken(payload: ApnsTokenPayload): Promise<{ ok: true } | null>;
  unregisterApnsToken(payload: ApnsTokenPayload): Promise<{ ok: true } | null>;
  getDeliveryStatus(): Promise<{ localOnly: boolean } | null>;
}
