import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import express from 'express';
import { createServer } from 'node:http';
import request from 'supertest';

import { createRelayService } from './service.js';
const makeService = (options = {}) => {
  // In-memory key store with a pre-seeded signing key so the service never
  // regenerates the serverId during the test.
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const keySlots = {
    signing: {
      privateJwk: privateKey.export({ format: 'jwk' }),
      publicJwk: publicKey.export({ format: 'jwk' }),
    },
  };
  let keyGeneration = 0;
  const relayKeyStore = {
    getOrCreate: async (slot, generate) => (keySlots[slot] ??= await generate()),
    reset: vi.fn(async () => {
      delete keySlots.signing;
      delete keySlots.encryption;
      keyGeneration += 1;
    }),
    generation: () => keyGeneration,
  };
  let settings = {
    privateRelay: { enabled: true, relayUrl: 'wss://relay.example.test/ws' },
    ...options.settings,
  };
  const hostLock = {
    tryClaim: vi.fn(() => true),
    forceClaim: vi.fn(() => true),
    otherLiveClaimant: vi.fn(() => null),
    release: vi.fn(),
  };
  const service = createRelayService({
    crypto,
    readSettingsFromDiskMigrated: async () => settings,
    updateSettingsFromDisk: async (mutate) => { settings = await mutate(settings); return settings; },
    relayKeyStore,
    getLocalPort: () => 0,
    hasRelayDemand: options.hasRelayDemand ?? (async () => true),
    hostLock,
    allowPassiveHost: options.allowPassiveHost,
    logger: { warn: () => { } },
  });
  return { service, hostLock, relayKeyStore, getSettings: () => settings };
};

describe('relay service identity reset', () => {
  it('serializes a reset behind an in-flight lifecycle change', async () => {
    const demand = Promise.withResolvers();
    const { service, relayKeyStore } = makeService({ hasRelayDemand: async () => demand.promise });
    try {
      const reconcile = service.reconcile();
      const reset = service.resetIdentity();
      await new Promise((resolve) => setTimeout(resolve, 50));
      // The reset must not rotate keys while reconcile is still deciding.
      expect(relayKeyStore.reset).not.toHaveBeenCalled();
      demand.resolve(false);
      await Promise.all([reconcile, reset]);
      expect(relayKeyStore.reset).toHaveBeenCalledTimes(1);
    } finally {
      service.stop();
    }
  });

  it('gives this copy a new server id', async () => {
    const { service } = makeService();
    try {
      const before = await service.getServerId();
      await service.resetIdentity();
      const after = await service.getServerId();
      expect(after).not.toBe(before);
      expect((await service.getStatus()).serverId).toBe(after);
    } finally {
      service.stop();
    }
  });
});

describe('relay service claim watch', () => {
  it('does not take the host over after the relay was disabled while standing by', async () => {
    vi.useFakeTimers();
    const { service, hostLock, getSettings } = makeService({ allowPassiveHost: true });
    try {
      hostLock.tryClaim.mockReturnValueOnce(false); // another process holds the claim at boot
      await service.startIfEnabled();
      expect((await service.getStatus()).state).toBe('standby');

      await vi.advanceTimersByTimeAsync(30_000); // claim seen free; grace starts
      getSettings().privateRelay.enabled = false; // a concurrent disable persisted
      hostLock.tryClaim.mockClear();

      await vi.advanceTimersByTimeAsync(150_000); // past the 2-minute grace
      expect(hostLock.tryClaim).not.toHaveBeenCalled();
      expect((await service.getStatus()).state).toBe('disabled');
    } finally {
      await service.stop();
      vi.useRealTimers();
    }
  });
});

describe('relay service passive hosting', () => {
  it('never claims or starts the host passively when passive hosting is disabled', async () => {
    const { service, hostLock } = makeService({ allowPassiveHost: false });
    try {
      await service.startIfEnabled();
      let status = await service.getStatus();
      expect(status.state).toBe('standby');
      expect(hostLock.tryClaim).not.toHaveBeenCalled();
      expect(hostLock.forceClaim).not.toHaveBeenCalled();

      await service.reconcile();
      status = await service.getStatus();
      expect(status.state).toBe('standby');
      expect(status.lastError).toContain('passive relay hosting is disabled');
      expect(hostLock.tryClaim).not.toHaveBeenCalled();
    } finally {
      service.stop();
    }
  });

  it('in enterprise mode runs only on a relay pinned by OPENCHAMBER_RELAY_URL', async () => {
    process.env.OPENCHAMBER_ENTERPRISE_MODE = '1';
    delete process.env.OPENCHAMBER_RELAY_URL;
    const blocked = makeService();
    try {
      await blocked.service.startIfEnabled();
      await blocked.service.reconcile();
      const status = await blocked.service.getStatus();
      expect(status).toMatchObject({ state: 'disabled', blockedByEnterprise: true });
      expect(blocked.hostLock.tryClaim).not.toHaveBeenCalled();
      expect(await blocked.service.getPairingCandidate()).toBeNull();
      await expect(blocked.service.ensureEnabledForPairing()).rejects.toMatchObject({ statusCode: 403 });
      expect(blocked.hostLock.forceClaim).not.toHaveBeenCalled();

      process.env.OPENCHAMBER_RELAY_URL = 'wss://relay.company.test/ws';
      const own = makeService();
      try {
        const candidate = await own.service.ensureEnabledForPairing();
        expect(candidate).toMatchObject({ type: 'relay', relayUrl: 'wss://relay.company.test/ws' });
        expect((await own.service.getStatus()).blockedByEnterprise).toBe(false);
      } finally {
        own.service.stop();
      }
    } finally {
      blocked.service.stop();
      delete process.env.OPENCHAMBER_ENTERPRISE_MODE;
      delete process.env.OPENCHAMBER_RELAY_URL;
    }
  });

  it('force-claims for an explicit pairing even when passive hosting is disabled', async () => {
    const { service, hostLock } = makeService({ allowPassiveHost: false });
    try {
      const candidate = await service.ensureEnabledForPairing();
      expect(candidate?.type).toBe('relay');
      expect(hostLock.forceClaim).toHaveBeenCalled();
    } finally {
      service.stop();
    }
  });
});

describe('relay service without a configured relay URL', () => {
  it('stays disabled, never claims or dials, and rejects pairing enable when no relay URL is configured', async () => {
    delete process.env.OPENCHAMBER_RELAY_URL;
    const { service, hostLock, getSettings } = makeService({
      settings: { privateRelay: { enabled: true } },
      hasRelayDemand: async () => true,
    });
    try {
      expect(await service.isConfigured()).toBe(false);
      await service.startIfEnabled();
      let status = await service.getStatus();
      expect(status).toMatchObject({
        state: 'disabled',
        relayUrl: null,
      });
      expect(status.lastError).toContain('No relay URL is configured');
      expect(hostLock.tryClaim).not.toHaveBeenCalled();

      await service.reconcile();
      status = await service.getStatus();
      expect(status).toMatchObject({ state: 'disabled', relayUrl: null });
      expect(status.lastError).toContain('No relay URL is configured');
      expect(hostLock.tryClaim).not.toHaveBeenCalled();

      expect(await service.getPairingCandidate()).toBeNull();
      await expect(service.ensureEnabledForPairing()).rejects.toMatchObject({ statusCode: 400 });
      expect(hostLock.forceClaim).not.toHaveBeenCalled();
      expect(getSettings().privateRelay).toEqual({ enabled: true });
    } finally {
      service.stop();
    }
  });

  it('rejects /api/openchamber/relay/enable when no valid relay URL is configured or supplied', async () => {
    delete process.env.OPENCHAMBER_RELAY_URL;
    const { service, getSettings } = makeService({ settings: { privateRelay: undefined } });
    const app = express();
    service.registerRoutes(app, createServer(app));
    try {
      const missingRes = await request(app).post('/api/openchamber/relay/enable').send({});
      expect(missingRes.status).toBe(400);
      expect(missingRes.body.error).toContain('No relay URL is configured');
      expect(getSettings().privateRelay).toBeUndefined();

      const invalidRes = await request(app)
        .post('/api/openchamber/relay/enable')
        .send({ relayUrl: 'https://relay.example.test/ws' });
      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.error).toContain('Invalid relay URL');
      expect(getSettings().privateRelay).toBeUndefined();

      const validRes = await request(app)
        .post('/api/openchamber/relay/enable')
        .send({ relayUrl: 'wss://relay.selfhosted.test/ws' });
      expect(validRes.status).toBe(200);
      expect(validRes.body).toMatchObject({
        enabled: true,
        relayUrl: 'wss://relay.selfhosted.test/ws',
      });
      expect(getSettings().privateRelay).toEqual({
        enabled: true,
        relayUrl: 'wss://relay.selfhosted.test/ws',
      });
    } finally {
      service.stop();
    }
  });

  it('enables and reports configured when OPENCHAMBER_RELAY_URL is pinned', async () => {
    process.env.OPENCHAMBER_RELAY_URL = 'wss://relay.pinned.test/ws';
    const { service } = makeService({ settings: { privateRelay: undefined } });
    try {
      expect(await service.isConfigured()).toBe(true);
      expect(await service.getStatus()).toMatchObject({
        relayUrl: 'wss://relay.pinned.test/ws',
        relayUrlLocked: true,
      });
    } finally {
      service.stop();
      delete process.env.OPENCHAMBER_RELAY_URL;
    }
  });
});
