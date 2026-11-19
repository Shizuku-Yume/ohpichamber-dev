import express from 'express';
import { giftResetTypes, useZaiGiftReset } from './providers/zai.js';
import { requireSelectedCredential, SELECTED_CREDENTIAL_UNAVAILABLE } from './providers/selected-credential.js';
import { extensionQuotaGuest, listExtensionQuotaProviders } from './extension-registry.js';
import { readExtensionQuotaProvider } from './extension-service.js';
import { isExtensionQuotaProviderId } from './extension-registry.js';

export function registerQuotaRoutes(app, { getQuotaProviders, resolveQuotaSelection, listQuotaSelections, resolveCredential, listExtensionQuotaGuests, readExtensionCredential, requestExtensionService }) {
  if (typeof getQuotaProviders !== 'function' || typeof resolveQuotaSelection !== 'function' || typeof listQuotaSelections !== 'function' || typeof resolveCredential !== 'function') throw new TypeError('Quota routes require selected workspace catalogs and credential resolver');
  // The extension catalog is the authority; a read that fails is a failed
  // list, never a short one built from a stale registry.
  app.get('/api/quota/extensions', async (_req, res) => {
    if (typeof listExtensionQuotaGuests !== 'function') return res.json({ extensions: [] });
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
      console.warn('[quota] provider catalog could not be listed:', error?.message ?? error);
      return res.status(503).json({ error: 'Quota provider catalog unavailable' });
    }
  });
  app.get('/api/quota/:providerId', async (req, res) => {
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
      const selection = await resolveQuotaSelection(req, req.params.providerId);
      const credential = await requireSelectedCredential({ ...selection, purpose: 'quota', resolveCredential });
      await useZaiGiftReset({ recordId, resetType, credential });
      return res.json({ success: true });
    } catch { return res.status(502).json({ error: 'Failed to activate gift reset' }); }
  });
}
