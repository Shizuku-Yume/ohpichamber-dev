import { PromptRequestSchema, type PromptRequest } from '@openchamber/agent-contract';
import type { JsonValue } from '../shared/json-values.js';
import { PromptQueueError } from './sqlite-store.js';

export const assertRootPromptAdmission = (request: PromptRequest | JsonValue): PromptRequest => {
  const parsed = PromptRequestSchema.parse(request);
  if (parsed.options.agentId !== null) {
    const error = new PromptQueueError('INVALID_REQUEST', 400, 'Root prompt agentId must be null');
    error.statusCode = 400;
    throw error;
  }
  if (parsed.input.agentMention !== undefined) {
    const error = new PromptQueueError('INVALID_REQUEST', 400, 'Root prompt agentMention is retired');
    error.statusCode = 400;
    throw error;
  }
  return parsed;
};
