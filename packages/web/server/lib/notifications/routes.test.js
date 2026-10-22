import crypto from 'node:crypto';
import { createServer } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApnsRuntime } from './apns-runtime.js';
import { registerNotificationRoutes } from './routes.js';

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => jsonResponse({ ok: true, results: [] }));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
});

const createMemoryFs = () => {
  let content = null;
  return {
    mkdir: vi.fn(async () => {}),
    readFile: vi.fn(async () => {
      if (content == null) {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      }
      return content;
    }),
    writeFile: vi.fn(async (_path, data) => {
      content = data;
    }),
  };
};

const createMemoryRelayKeyStore = () => {
  const slots = new Map();
  return {
    getOrCreate: async (slot, generate) => {
      if (!slots.has(slot)) slots.set(slot, await generate());
      return slots.get(slot);
    },
  };
};

describe('notification routes /api/push/apns-token', () => {
  it('passes pushKey to addOrUpdateApnsToken and persists keyed device token', async () => {
    const memoryFs = createMemoryFs();
    const deps = {
      fsPromises: memoryFs,
      path: { dirname: () => '/dir' },
      crypto,
      http2: {},
      APNS_TOKENS_FILE_PATH: '/dir/tokens.json',
      readSettingsFromDiskMigrated: vi.fn(async () => ({})),
      relayKeyStore: createMemoryRelayKeyStore(),
    };
    const apnsRuntime = createApnsRuntime(deps);

    const app = express();
    app.use(express.json());
    registerNotificationRoutes(app, {
      uiAuthController: {
        ensureSessionToken: async () => 'test-ui-session',
      },
      addOrUpdateApnsToken: apnsRuntime.addOrUpdateApnsToken,
      removeApnsToken: apnsRuntime.removeApnsToken,
    });

    const server = createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
      const validKey = crypto.randomBytes(32).toString('base64');
      const res = await originalFetch(`${base}/api/push/apns-token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'OpenChamber/1.0 (iOS)' },
        body: JSON.stringify({
          token: 'deviceToken123',
          platform: 'ios',
          environment: 'production',
          pushKey: validKey,
        }),
      });
      expect(res.status).toBe(200);
      const resJson = await res.json();
      expect(resJson.ok).toBe(true);

      // Verify persistence in apns runtime store
      const written = JSON.parse(memoryFs.writeFile.mock.calls.at(-1)[1]);
      const sessionEntries = Object.values(written.tokensBySession)[0];
      expect(sessionEntries).toHaveLength(1);
      expect(sessionEntries[0].deviceToken).toBe('deviceToken123');
      expect(sessionEntries[0].pushKey).toBe(validKey);
      expect(sessionEntries[0].platform).toBe('ios');
    } finally {
      server.close();
    }
  });

  it('drops invalid pushKey and falls back to plain unkeyed registration', async () => {
    const memoryFs = createMemoryFs();
    const deps = {
      fsPromises: memoryFs,
      path: { dirname: () => '/dir' },
      crypto,
      http2: {},
      APNS_TOKENS_FILE_PATH: '/dir/tokens.json',
      readSettingsFromDiskMigrated: vi.fn(async () => ({})),
      relayKeyStore: createMemoryRelayKeyStore(),
    };
    const apnsRuntime = createApnsRuntime(deps);

    const app = express();
    app.use(express.json());
    registerNotificationRoutes(app, {
      uiAuthController: {
        ensureSessionToken: async () => 'test-ui-session',
      },
      addOrUpdateApnsToken: apnsRuntime.addOrUpdateApnsToken,
      removeApnsToken: apnsRuntime.removeApnsToken,
    });

    const server = createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
      // 16-byte key (too short, invalid)
      const shortKey = crypto.randomBytes(16).toString('base64');
      const res = await originalFetch(`${base}/api/push/apns-token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: 'deviceTokenInvalidKey',
          platform: 'android',
          pushKey: shortKey,
        }),
      });
      expect(res.status).toBe(200);

      const written = JSON.parse(memoryFs.writeFile.mock.calls.at(-1)[1]);
      const sessionEntries = Object.values(written.tokensBySession)[0];
      expect(sessionEntries[0].deviceToken).toBe('deviceTokenInvalidKey');
      expect(sessionEntries[0].pushKey).toBeUndefined();
    } finally {
      server.close();
    }
  });

  it('delivers sealed enc that decrypts under Android and iOS crypto contracts', async () => {
    const memoryFs = createMemoryFs();
    const deps = {
      fsPromises: memoryFs,
      path: { dirname: () => '/dir' },
      crypto,
      http2: {},
      APNS_TOKENS_FILE_PATH: '/dir/tokens.json',
      readSettingsFromDiskMigrated: vi.fn(async () => ({})),
      relayKeyStore: createMemoryRelayKeyStore(),
    };
    const apnsRuntime = createApnsRuntime(deps);

    const pushKey = crypto.randomBytes(32).toString('base64');
    await apnsRuntime.addOrUpdateApnsToken('session', 'androidDeviceToken', 'ua', 'android', 'production', pushKey);
    await apnsRuntime.addOrUpdateApnsToken('session', 'legacyDeviceToken', 'ua', 'android', 'production');

    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, results: [] }));
    globalThis.fetch = fetchMock;
    vi.stubEnv('OPENCHAMBER_PUSH_RELAY_URL', 'https://relay.test/v1/push/send');

    await apnsRuntime.sendApnsToAllUiSessions({
      title: 'Agent completed task',
      body: 'Refactored notification module cleanly',
    });

    const sendCalls = fetchMock.mock.calls
      .filter(([url]) => String(url) === 'https://relay.test/v1/push/send')
      .map(([, init]) => JSON.parse(init.body));

    expect(sendCalls).toHaveLength(2);

    // Legacy unsealed device
    const legacySend = sendCalls.find((s) => s.tokens.includes('legacyDeviceToken'));
    expect(legacySend.title).toBe('Agent completed task');
    expect(legacySend.body).toBe('Refactored notification module cleanly');
    expect(legacySend.data?.enc).toBeUndefined();

    // Sealed device
    const sealedSend = sendCalls.find((s) => s.tokens.includes('androidDeviceToken'));
    expect(sealedSend.title).toBe('Agent completed task');
    expect(sealedSend.body).toBe(''); // empty body on wire
    expect(sealedSend.data?.enc).toMatch(/^v1\./);

    const sealedStr = sealedSend.data.enc;

    // 1. Android decryption simulation (PushSealKey.java: AES/GCM/NoPadding, nonce 12 bytes, tag 16 bytes)
    const combined = Buffer.from(sealedStr.substring('v1.'.length), 'base64');
    const nonceBytes = 12;
    const tagBytes = 16;
    const keyBytes = Buffer.from(pushKey, 'base64');

    const androidNonce = combined.subarray(0, nonceBytes);
    const androidCipherAndTag = combined.subarray(nonceBytes);
    const androidCiphertext = combined.subarray(nonceBytes, combined.length - tagBytes);
    const androidTag = combined.subarray(combined.length - tagBytes);

    const androidCipher = crypto.createDecipheriv('aes-256-gcm', keyBytes, androidNonce);
    androidCipher.setAuthTag(androidTag);
    const androidPlaintext = Buffer.concat([
      androidCipher.update(androidCiphertext),
      androidCipher.final(),
    ]).toString('utf8');
    const androidContent = JSON.parse(androidPlaintext);
    expect(androidContent).toEqual({
      title: 'Agent completed task',
      body: 'Refactored notification module cleanly',
    });

    // 2. iOS decryption simulation (NotificationService.swift: CryptoKit AES.GCM.SealedBox(combined:))
    // CryptoKit SealedBox(combined: data) extracts data[0..<12] as nonce, data[12..<(count-16)] as ciphertext, data[(count-16)...] as tag
    const iosBoxCombined = Buffer.from(sealedStr.slice(3), 'base64');
    const iosNonce = iosBoxCombined.subarray(0, 12);
    const iosTag = iosBoxCombined.subarray(iosBoxCombined.length - 16);
    const iosCiphertext = iosBoxCombined.subarray(12, iosBoxCombined.length - 16);
    const iosCipher = crypto.createDecipheriv('aes-256-gcm', keyBytes, iosNonce);
    iosCipher.setAuthTag(iosTag);
    const iosPlaintext = Buffer.concat([
      iosCipher.update(iosCiphertext),
      iosCipher.final(),
    ]).toString('utf8');
    const iosContent = JSON.parse(iosPlaintext);
    expect(iosContent).toEqual({
      title: 'Agent completed task',
      body: 'Refactored notification module cleanly',
    });
  });
});
