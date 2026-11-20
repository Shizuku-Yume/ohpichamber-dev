import { z } from 'zod';

import { controlErrorFields } from './error.js';
import type { PromptRequest } from '@openchamber/agent-contract';
import type { createOpenChamberSessionService } from '../openchamber-sessions/routes.js';
import type { SyntheticMessage } from '../workflows/contracts.js';

const KEEP_SESSION_MODEL: PromptRequest['options'] = { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null };
const runActiveRefusalSchema = z.object({ code: z.literal('RUN_ACTIVE') });

export interface SyntheticDeliveryOptions {
  sessionService: Pick<ReturnType<typeof createOpenChamberSessionService>, 'send' | 'steer'>;
}

export const createSyntheticDelivery = ({ sessionService }: SyntheticDeliveryOptions) => async (sessionId: string, message: SyntheticMessage) => {
  if (message.resume !== true) return;
  const request: PromptRequest = {
    input: { text: '', attachments: [], context: [{ kind: 'synthetic', text: message.text }] },
    options: KEEP_SESSION_MODEL,
  };
  try {
    try {
      await sessionService.send(sessionId, request, message.id);
    } catch (error) {
      if (!runActiveRefusalSchema.safeParse(error).success) throw error;
      await sessionService.steer(sessionId, { request });
    }
  } catch (error) {
    const fields = controlErrorFields(error);
    if (fields && fields.status === undefined) fields.status = fields.statusCode;
    throw error;
  }
};
