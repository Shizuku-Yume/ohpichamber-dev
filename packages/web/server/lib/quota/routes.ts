import express from 'express';
import { z } from 'zod';
import { giftResetTypes, useZaiGiftReset } from './providers/zai-gift-reset.js';
import { requireSelectedCredential, SELECTED_CREDENTIAL_UNAVAILABLE } from './providers/selected-credential.js';
import {
  extensionQuotaGuest,
  isExtensionQuotaProviderId,
  listExtensionQuotaProviders,
  type ExtensionQuotaGuest,
} from './extension-registry.js';
import { readExtensionQuotaProvider } from './extension-service.js';
import type { ReadNativeReports } from './native.js';
import type { Application, Request } from '../shared/http-contracts.js';
import type { SelectedCredential, SelectedCredentialResolver } from '../tts/service.js';
import type * as QuotaProvidersModule from './providers/index.js';

export interface QuotaCatalogSelection {
  workspaceId: string;
  agentDirectoryId: string;
  providerId: string;
  credentialRef: string;
  quotaProviderId?: string | undefined;
}

export interface ExtensionServiceRequestParams {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
  responseMax: number;
  timeoutMs: number;
}

export interface ExtensionServiceResponse {
  status: number;
  body: string;
}

export interface QuotaRoutesDependencies<Guest extends ExtensionQuotaGuest = ExtensionQuotaGuest> {
  getQuotaProviders: () => Promise<typeof QuotaProvidersModule>;
  resolveQuotaSelection: (req: Request, providerId: string) => Promise<QuotaCatalogSelection>;
  listQuotaSelections: (req: Request) => Promise<QuotaCatalogSelection[]>;
  resolveCredential: SelectedCredentialResolver;
  readNativeReports?: ReadNativeReports | undefined;
  listExtensionQuotaGuests?: () => Promise<Guest[]>;
  readExtensionCredential?: (req: Request, guest: Guest, nativeProviderId: string) => Promise<SelectedCredential>;
  requestExtensionService?: (guest: Guest, params: ExtensionServiceRequestParams) => Promise<ExtensionServiceResponse>;
}

const unavailableErrorSchema = z.object({
  code: z.literal(SELECTED_CREDENTIAL_UNAVAILABLE),
});

const giftResetBodySchema = z.object({
  recordId: z.number().int().positive(),
  resetType: z.string().refine((value) => giftResetTypes.includes(value)),
});

export function registerQuotaRoutes<Guest extends ExtensionQuotaGuest = ExtensionQuotaGuest>(
  app: Application,
  {
    getQuotaProviders,
    resolveQuotaSelection,
    listQuotaSelections,
    resolveCredential,
    readNativeReports,
    listExtensionQuotaGuests,
    readExtensionCredential,
    requestExtensionService,
  }: QuotaRoutesDependencies<Guest>,
): void {
  if (
    !z.function().safeParse(getQuotaProviders).success
    || !z.function().safeParse(resolveQuotaSelection).success
    || !z.function().safeParse(listQuotaSelections).success
    || !z.function().safeParse(resolveCredential).success
  ) {
    throw new TypeError('Quota routes require selected workspace catalogs and credential resolver');
  }

  app.get('/api/quota/extensions', async (_req, res) => {
    if (!listExtensionQuotaGuests || !z.function().safeParse(listExtensionQuotaGuests).success) return res.json({ extensions: [] });
    try {
      res.json({ extensions: listExtensionQuotaProviders(await listExtensionQuotaGuests()) });
    } catch (error) {
      console.warn('[quota] extension usage providers could not be listed:', error instanceof Error ? error.message : error);
      return res.status(503).json({ error: 'Extension usage provider catalog unavailable' });
    }
  });

  app.get('/api/quota/providers', async (req, res) => {
    try {
      const selections = await listQuotaSelections(req);
      const { listConfiguredQuotaProviders } = await getQuotaProviders();
      const providers = await listConfiguredQuotaProviders({ selections });
      const nativeToLogical: Record<string, string> = {};
      for (const selection of selections) {
        if (selection.providerId && selection.quotaProviderId && providers.includes(selection.quotaProviderId)) {
          nativeToLogical[selection.providerId] = selection.quotaProviderId;
        }
      }
      return res.json({ providers, nativeToLogical });
    } catch (error) {
      console.warn('[quota] provider catalog could not be listed:', error instanceof Error ? error.message : error);
      return res.status(503).json({ error: 'Quota provider catalog unavailable' });
    }
  });

  app.get('/api/quota/:providerId', async (req, res) => {
    const providerId = req.params.providerId ?? '';
    if (isExtensionQuotaProviderId(providerId)) {
      if (
        !listExtensionQuotaGuests || !requestExtensionService || !readExtensionCredential
        || !z.function().safeParse(listExtensionQuotaGuests).success
        || !z.function().safeParse(requestExtensionService).success
        || !z.function().safeParse(readExtensionCredential).success
      ) {
        return res.status(503).json({ error: 'Extension usage providers are unavailable on this server' });
      }
      try {
        const guest = extensionQuotaGuest(await listExtensionQuotaGuests(), providerId);
        if (!guest) return res.status(404).json({ error: 'Unsupported provider' });
        const result = await readExtensionQuotaProvider({
          guest,
          readCredential: (nativeProviderId: string) => readExtensionCredential(req, guest, nativeProviderId),
          request: (params: ExtensionServiceRequestParams) => requestExtensionService(guest, params),
        });
        return res.json(result);
      } catch {
        return res.status(503).json({ error: 'Extension usage provider unavailable' });
      }
    }
    try {
      const providers = await getQuotaProviders();
      let selection: QuotaCatalogSelection;
      try {
        selection = await resolveQuotaSelection(req, providerId);
      } catch (error) {
        const unconfigured = unavailableErrorSchema.safeParse(error).success
          ? providers.buildUnconfiguredQuotaResult(providerId)
          : null;
        if (unconfigured) return res.json(unconfigured);
        throw error;
      }
      return res.json(await providers.fetchQuotaForProvider(providerId, { ...selection, resolveCredential, readNativeReports }));
    } catch {
      return res.status(503).json({ error: 'Selected quota credential unavailable' });
    }
  });

  app.post('/api/quota/:providerId/gift-reset/use', express.json({ limit: '16kb' }), async (req, res) => {
    const providerId = req.params.providerId ?? '';
    if (providerId !== 'zai-coding-plan') return res.status(404).json({ code: 'UNSUPPORTED_PROVIDER', error: 'Unsupported quota provider' });
    const parsedBody = giftResetBodySchema.safeParse(req.body);
    if (!parsedBody.success) return res.status(400).json({ code: 'INVALID_REQUEST', error: 'Invalid gift reset request' });
    const { recordId, resetType } = parsedBody.data;
    try {
      const selection = await resolveQuotaSelection(req, providerId);
      const credential = await requireSelectedCredential({ ...selection, purpose: 'quota', resolveCredential });
      await useZaiGiftReset({ recordId, resetType, credential });
      return res.json({ success: true });
    } catch {
      return res.status(502).json({ error: 'Failed to activate gift reset' });
    }
  });
}
