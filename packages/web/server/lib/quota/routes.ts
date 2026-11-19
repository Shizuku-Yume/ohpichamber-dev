import express from 'express';
<<<<<<< HEAD:packages/web/server/lib/quota/routes.js
import { giftResetTypes, useZaiGiftReset } from './providers/zai.js';
import { requireSelectedCredential, SELECTED_CREDENTIAL_UNAVAILABLE } from './providers/selected-credential.js';
import { extensionQuotaGuest, listExtensionQuotaProviders } from './extension-registry.js';
import { readExtensionQuotaProvider } from './extension-service.js';
import { isExtensionQuotaProviderId } from './extension-registry.js';
||||||| bc50ba56aa:packages/web/server/lib/quota/routes.js
import { deleteManagedCredential, getManagedCredentialStatus, normalizers, readManagedCredential, writeManagedCredential } from './credentials/providers.js';
import { importCursorCredential, validateCursorCredential } from './providers/cursor.js';
import { fetchExeDevUsage } from './providers/exe-dev.js';
import { aliases as zaiAliases, giftResetTypes as zaiGiftResetTypes, useZaiGiftReset } from './providers/zai.js';
import { asNonEmptyString } from '../shared/guards.js';
import { fetchQuota as fetchZenmuxQuota } from './providers/zenmux.js';
import { listExtensionQuotaProviders } from './extension-registry.js';
import { QuotaRouteError } from './route-error.js';
=======
import { deleteManagedCredential, getManagedCredentialStatus, normalizers, readManagedCredential, writeManagedCredential } from './credentials/providers.js';
import { importCursorCredential, validateCursorCredential } from './providers/cursor.js';
import { fetchExeDevUsage } from './providers/exe-dev.js';
import { aliases as zaiAliases, giftResetTypes as zaiGiftResetTypes, useZaiGiftReset } from './providers/zai.js';
import { asNonEmptyString } from '../shared/guards.js';
import { fetchQuota as fetchZenmuxQuota } from './providers/zenmux.js';
import { listExtensionQuotaProviders } from './extension-registry.js';
import { QuotaRouteError } from './route-error.js';
import type { Application, Request, Response } from '../shared/http-contracts.js';
import type { CredentialJson, CursorCredential, ExeDevCredential, ManagedCredentialProvider, ZenmuxCredential } from './credentials/contracts.js';
import type { listConfiguredQuotaProviders, fetchQuotaForProvider } from './index.js';
>>>>>>> upstream/main:packages/web/server/lib/quota/routes.ts

<<<<<<< HEAD:packages/web/server/lib/quota/routes.js
export function registerQuotaRoutes(app, { getQuotaProviders, resolveQuotaSelection, listQuotaSelections, resolveCredential, listExtensionQuotaGuests, readExtensionCredential, requestExtensionService }) {
  if (typeof getQuotaProviders !== 'function' || typeof resolveQuotaSelection !== 'function' || typeof listQuotaSelections !== 'function' || typeof resolveCredential !== 'function') throw new TypeError('Quota routes require selected workspace catalogs and credential resolver');
  // The extension catalog is the authority; a read that fails is a failed
  // list, never a short one built from a stale registry.
  app.get('/api/quota/extensions', async (_req, res) => {
    if (typeof listExtensionQuotaGuests !== 'function') return res.json({ extensions: [] });
||||||| bc50ba56aa:packages/web/server/lib/quota/routes.js
// Keyed by the same provider ids as `normalizers`: a provider with a normalizer
// but no validator would be stored without ever being checked.
const validators = {
  'exe-dev': fetchExeDevUsage,
  cursor: validateCursorCredential,
  zenmux: async (credential) => {
    const result = await fetchZenmuxQuota({ readCredential: () => credential });
    if (!result.ok) throw new Error(result.error ?? 'Credential validation failed');
  },
};

const getProvider = (req, res) => {
  const providerId = req.params.providerId;
  if (!normalizers[providerId]) {
    res.status(404).json({ code: 'UNSUPPORTED_PROVIDER', error: 'Unsupported credential provider' });
    return null;
  }
  return providerId;
};

const credentialError = (res, error) => res.status(400).json({
  code: 'INVALID_CREDENTIAL',
  error: error instanceof Error ? error.message : 'Credential validation failed',
});

export function registerQuotaRoutes(app, { getQuotaProviders }) {
  // The usage providers installed extensions serve right now (id, name, icon,
  // extension), which the UI draws beside its built-in list. Every client reads
  // this on each stream connect, so it answers from memory and asks OpenCode nothing.
  app.get('/api/quota/extensions', (_req, res) => {
    res.json({ extensions: listExtensionQuotaProviders() });
  });

  app.get('/api/quota/providers', async (_req, res) => {
=======
interface Credentials {
  'exe-dev': ExeDevCredential;
  cursor: CursorCredential;
  zenmux: ZenmuxCredential;
}

type CredentialValidators = { [Provider in ManagedCredentialProvider]: (credential: Credentials[Provider]) => Promise<void | Awaited<ReturnType<typeof fetchExeDevUsage>>> };

export interface QuotaRoutesDependencies {
  getQuotaProviders: () => Promise<{
    listConfiguredQuotaProviders: typeof listConfiguredQuotaProviders;
    fetchQuotaForProvider: typeof fetchQuotaForProvider;
  }>;
}

const isManagedProvider = (value: unknown): value is ManagedCredentialProvider =>
  typeof value === 'string' && Object.hasOwn(normalizers, value);

const hasMessage = (value: unknown): value is { message?: unknown } =>
  value !== null && value !== undefined;

const errorMessage = (cause: unknown) => {
  if (!hasMessage(cause)) throw new TypeError(`Cannot read properties of ${cause} (reading 'message')`);
  return cause.message;
};

const isCredentialJson = (value: unknown): value is CredentialJson => {
  const pending = [value];
  while (pending.length > 0) {
    const entry = pending.pop();
    if (entry === null || typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') continue;
    if (typeof entry !== 'object') return false;
    pending.push(...Object.values(entry));
  }
  return true;
};

const hasGiftResetFields = (value: unknown): value is { recordId?: unknown; resetType?: unknown; grantType?: unknown } =>
  value !== null && value !== undefined;

const isGiftResetType = (value: unknown): value is string =>
  typeof value === 'string' && zaiGiftResetTypes.includes(value);

const validators: CredentialValidators = {
  'exe-dev': fetchExeDevUsage,
  cursor: validateCursorCredential,
  zenmux: async (credential) => {
    const result = await fetchZenmuxQuota({ readCredential: () => credential });
    if (!result.ok) throw new Error(result.error ?? 'Credential validation failed');
  },
};

const validateCredential = <Provider extends ManagedCredentialProvider>(providerId: Provider, credential: Credentials[Provider]) =>
  validators[providerId](credential);

const getProvider = (req: Request, res: Response) => {
  const providerId = req.params.providerId;
  if (!isManagedProvider(providerId)) {
    res.status(404).json({ code: 'UNSUPPORTED_PROVIDER', error: 'Unsupported credential provider' });
    return null;
  }
  return providerId;
};

const credentialError = (res: Response, cause: unknown) => res.status(400).json({
  code: 'INVALID_CREDENTIAL',
  error: cause instanceof Error ? cause.message : 'Credential validation failed',
});

export function registerQuotaRoutes(app: Application, { getQuotaProviders }: QuotaRoutesDependencies) {
  app.get('/api/quota/extensions', (_req, res) => {
    res.json({ extensions: listExtensionQuotaProviders() });
  });

  app.get('/api/quota/providers', async (_req, res) => {
>>>>>>> upstream/main:packages/web/server/lib/quota/routes.ts
    try {
      res.json({ extensions: listExtensionQuotaProviders(await listExtensionQuotaGuests()) });
    } catch (error) {
      console.warn('[quota] extension usage providers could not be listed:', error?.message ?? error);
      return res.status(503).json({ error: 'Extension usage provider catalog unavailable' });
    }
  });
  app.get('/api/quota/providers', async (req, res) => {
    try {
      const selections = await listQuotaSelections(req);
      const { listConfiguredQuotaProviders } = await getQuotaProviders();
      const providers = await listConfiguredQuotaProviders({ selections });
      const nativeToLogical = {};
      for (const selection of selections) {
        if (selection.providerId && selection.quotaProviderId && providers.includes(selection.quotaProviderId)) {
          nativeToLogical[selection.providerId] = selection.quotaProviderId;
        }
      }
      return res.json({ providers, nativeToLogical });
    } catch (error) {
<<<<<<< HEAD:packages/web/server/lib/quota/routes.js
      console.warn('[quota] provider catalog could not be listed:', error?.message ?? error);
      return res.status(503).json({ error: 'Quota provider catalog unavailable' });
||||||| bc50ba56aa:packages/web/server/lib/quota/routes.js
      console.error('Failed to list quota providers:', error);
      res.status(500).json({ error: error.message || 'Failed to list quota providers' });
=======
      console.error('Failed to list quota providers:', error);
      res.status(500).json({ error: errorMessage(error) || 'Failed to list quota providers' });
>>>>>>> upstream/main:packages/web/server/lib/quota/routes.ts
    }
  });
<<<<<<< HEAD:packages/web/server/lib/quota/routes.js
||||||| bc50ba56aa:packages/web/server/lib/quota/routes.js

  app.get('/api/quota/credentials/:providerId', (req, res) => {
    const providerId = getProvider(req, res);
    if (providerId) res.json(getManagedCredentialStatus(providerId));
  });

  app.put('/api/quota/credentials/:providerId', express.json({ limit: '16kb' }), async (req, res) => {
    const providerId = getProvider(req, res);
    if (!providerId) return;
    const credential = normalizers[providerId](req.body);
    if (!credential) return credentialError(res, new Error('Invalid credential'));
    try {
      await validators[providerId](credential);
      res.json(writeManagedCredential(providerId, credential));
    } catch (error) {
      credentialError(res, error);
    }
  });

  app.post('/api/quota/credentials/:providerId/validate', async (req, res) => {
    const providerId = getProvider(req, res);
    if (!providerId) return;
    const credential = readManagedCredential(providerId);
    if (!credential) return res.status(404).json({ code: 'NOT_CONFIGURED', error: 'Not configured' });
    try {
      await validators[providerId](credential);
      res.json({ valid: true });
    } catch (error) {
      credentialError(res, error);
    }
  });

  app.post('/api/quota/credentials/:providerId/import', async (req, res) => {
    const providerId = getProvider(req, res);
    if (!providerId) return;
    if (providerId !== 'cursor') return res.status(404).json({ code: 'IMPORT_UNAVAILABLE', error: 'Import unavailable' });
    try {
      res.json(await importCursorCredential());
    } catch (error) {
      credentialError(res, error);
    }
  });

  app.delete('/api/quota/credentials/:providerId', (req, res) => {
    const providerId = getProvider(req, res);
    if (!providerId) return;
    deleteManagedCredential(providerId);
    res.json({ configured: false });
  });

=======

  app.get('/api/quota/credentials/:providerId', (req, res) => {
    const providerId = getProvider(req, res);
    if (providerId) res.json(getManagedCredentialStatus(providerId));
  });

  app.put('/api/quota/credentials/:providerId', express.json({ limit: '16kb' }), async (req, res) => {
    const providerId = getProvider(req, res);
    if (!providerId) return;
    const credential = normalizers[providerId](isCredentialJson(req.body) ? req.body : undefined);
    if (!credential) return credentialError(res, new Error('Invalid credential'));
    try {
      await validateCredential(providerId, credential);
      res.json(writeManagedCredential(providerId, credential));
    } catch (error) {
      credentialError(res, error);
    }
  });

  app.post('/api/quota/credentials/:providerId/validate', async (req, res) => {
    const providerId = getProvider(req, res);
    if (!providerId) return;
    const credential = readManagedCredential(providerId);
    if (!credential) return res.status(404).json({ code: 'NOT_CONFIGURED', error: 'Not configured' });
    try {
      await validateCredential(providerId, credential);
      res.json({ valid: true });
    } catch (error) {
      credentialError(res, error);
    }
  });

  app.post('/api/quota/credentials/:providerId/import', async (req, res) => {
    const providerId = getProvider(req, res);
    if (!providerId) return;
    if (providerId !== 'cursor') return res.status(404).json({ code: 'IMPORT_UNAVAILABLE', error: 'Import unavailable' });
    try {
      res.json(await importCursorCredential());
    } catch (error) {
      credentialError(res, error);
    }
  });

  app.delete('/api/quota/credentials/:providerId', (req, res) => {
    const providerId = getProvider(req, res);
    if (!providerId) return;
    deleteManagedCredential(providerId);
    res.json({ configured: false });
  });

>>>>>>> upstream/main:packages/web/server/lib/quota/routes.ts
  app.get('/api/quota/:providerId', async (req, res) => {
<<<<<<< HEAD:packages/web/server/lib/quota/routes.js
    const providerId = req.params.providerId;
    // An installed extension serves its own usage provider; the built-in
    // registry has no entry for it, and the reverse is also true.
    if (isExtensionQuotaProviderId(providerId)) {
      if (typeof listExtensionQuotaGuests !== 'function' || typeof requestExtensionService !== 'function' || typeof readExtensionCredential !== 'function')
        return res.status(503).json({ error: 'Extension usage providers are unavailable on this server' });
      try {
        const guest = extensionQuotaGuest(await listExtensionQuotaGuests(), providerId);
        if (!guest) return res.status(404).json({ error: 'Unsupported provider' });
        const result = await readExtensionQuotaProvider({
          guest,
          readCredential: (nativeProviderId) => readExtensionCredential(req, guest, nativeProviderId),
          request: (params) => requestExtensionService(guest, params),
        });
        return res.json(result);
      } catch {
        return res.status(503).json({ error: 'Extension usage provider unavailable' });
      }
||||||| bc50ba56aa:packages/web/server/lib/quota/routes.js
    try {
      const { providerId } = req.params;
      if (!providerId) return res.status(400).json({ error: 'Provider ID is required' });
      const { fetchQuotaForProvider } = await getQuotaProviders();
      res.json(await fetchQuotaForProvider(providerId));
    } catch (error) {
      // An extension's answer OpenChamber cannot use (`extension-quota.js`): the UI shows the message as the refresh failure, never an empty result.
      if (error instanceof QuotaRouteError) return res.status(error.status).json({ code: error.code, error: error.message });
      console.error('Failed to fetch quota:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch quota' });
=======
    try {
      const { providerId } = req.params;
      if (!providerId) return res.status(400).json({ error: 'Provider ID is required' });
      const { fetchQuotaForProvider } = await getQuotaProviders();
      res.json(await fetchQuotaForProvider(providerId));
    } catch (error) {
      if (error instanceof QuotaRouteError) return res.status(error.status).json({ code: error.code, error: error.message });
      console.error('Failed to fetch quota:', error);
      res.status(500).json({ error: errorMessage(error) || 'Failed to fetch quota' });
>>>>>>> upstream/main:packages/web/server/lib/quota/routes.ts
    }
    try {
      const providers = await getQuotaProviders();
      let selection;
      try {
        selection = await resolveQuotaSelection(req, req.params.providerId);
      } catch (error) {
        // A provider with no stored credential is a normal, empty state.
        // Anything else (service/scope/credential-resolution failure) stays
        // an explicit failure instead of becoming "not configured".
        const unconfigured = error?.code === SELECTED_CREDENTIAL_UNAVAILABLE
          ? providers.buildUnconfiguredQuotaResult(req.params.providerId)
          : null;
        if (unconfigured) return res.json(unconfigured);
        throw error;
      }
      return res.json(await providers.fetchQuotaForProvider(req.params.providerId, { ...selection, resolveCredential }));
    } catch { return res.status(503).json({ error: 'Selected quota credential unavailable' }); }
  });
  app.post('/api/quota/:providerId/gift-reset/use', express.json({ limit: '16kb' }), async (req, res) => {
    if (req.params.providerId !== 'zai-coding-plan') return res.status(404).json({ code: 'UNSUPPORTED_PROVIDER', error: 'Unsupported quota provider' });
    const { recordId, resetType } = req.body ?? {};
    if (!Number.isFinite(recordId) || !giftResetTypes.includes(resetType)) return res.status(400).json({ code: 'INVALID_REQUEST', error: 'Invalid gift reset request' });
    try {
<<<<<<< HEAD:packages/web/server/lib/quota/routes.js
      const selection = await resolveQuotaSelection(req, req.params.providerId);
      const credential = await requireSelectedCredential({ ...selection, purpose: 'quota', resolveCredential });
      await useZaiGiftReset({ recordId, resetType, credential });
      return res.json({ success: true });
    } catch { return res.status(502).json({ error: 'Failed to activate gift reset' }); }
||||||| bc50ba56aa:packages/web/server/lib/quota/routes.js
      const providerId = req.params.providerId;
      if (!zaiAliases.includes(providerId)) {
        return res.status(404).json({ code: 'UNSUPPORTED_PROVIDER', error: 'Unsupported quota provider' });
      }
      const { recordId, resetType, grantType } = req.body ?? {};
      if (!Number.isFinite(recordId)
        || !zaiGiftResetTypes.includes(resetType)
        || (grantType !== undefined && asNonEmptyString(grantType) === null)) {
        return res.status(400).json({ code: 'INVALID_REQUEST', error: 'Invalid gift reset request' });
      }
      await useZaiGiftReset({ recordId, resetType, grantType });
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'Not configured') {
        return res.status(400).json({ code: 'NOT_CONFIGURED', error: 'Not configured' });
      }
      console.error('Failed to activate gift reset:', error);
      res.status(502).json({ error: message || 'Failed to activate gift reset' });
    }
=======
      const providerId = req.params.providerId;
      if (!providerId || !zaiAliases.includes(providerId)) {
        return res.status(404).json({ code: 'UNSUPPORTED_PROVIDER', error: 'Unsupported quota provider' });
      }
      const { recordId, resetType, grantType } = hasGiftResetFields(req.body) ? req.body : {};
      if (!Number.isFinite(recordId)
        || !isGiftResetType(resetType)
        || (grantType !== undefined && asNonEmptyString(grantType) === null)) {
        return res.status(400).json({ code: 'INVALID_REQUEST', error: 'Invalid gift reset request' });
      }
      await useZaiGiftReset({ recordId, resetType, grantType });
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'Not configured') {
        return res.status(400).json({ code: 'NOT_CONFIGURED', error: 'Not configured' });
      }
      console.error('Failed to activate gift reset:', error);
      res.status(502).json({ error: message || 'Failed to activate gift reset' });
    }
>>>>>>> upstream/main:packages/web/server/lib/quota/routes.ts
  });
}
