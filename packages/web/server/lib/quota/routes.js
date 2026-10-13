import express from 'express';
import { giftResetTypes, useZaiGiftReset } from './providers/zai.js';
import { requireSelectedCredential } from './providers/selected-credential.js';

export function registerQuotaRoutes(app, { getQuotaProviders, resolveQuotaSelection, listQuotaSelections, resolveCredential }) {
  if (typeof getQuotaProviders !== 'function' || typeof resolveQuotaSelection !== 'function' || typeof listQuotaSelections !== 'function' || typeof resolveCredential !== 'function') throw new TypeError('Quota routes require selected workspace catalogs and credential resolver');
  app.get('/api/quota/providers', async (req, res) => {
    try {
      const selections = await listQuotaSelections(req);
      const { listConfiguredQuotaProviders } = await getQuotaProviders();
      return res.json({ providers: await listConfiguredQuotaProviders({ selections }) });
    } catch { return res.status(503).json({ error: 'Quota provider catalog unavailable' }); }
  });
  app.get('/api/quota/:providerId', async (req, res) => {
    try {
      const selection = await resolveQuotaSelection(req, req.params.providerId);
      const { fetchQuotaForProvider } = await getQuotaProviders();
      return res.json(await fetchQuotaForProvider(req.params.providerId, { ...selection, resolveCredential }));
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
