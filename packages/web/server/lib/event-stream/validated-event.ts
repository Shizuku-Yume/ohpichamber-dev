import { CanonicalEventSchema } from '@openchamber/agent-contract';
import type { CanonicalEvent } from '@openchamber/agent-contract';
import type { JsonValue } from '../shared/json-values.js';

type EventInput = CanonicalEvent | JsonValue | undefined;

const validated = new WeakSet<object>();

const isValidatedCanonicalEvent = (input: unknown): input is CanonicalEvent => (
  typeof input === 'object' && input !== null && validated.has(input)
);

export const markValidatedCanonicalEvent = (event: CanonicalEvent): CanonicalEvent => {
  validated.add(event);
  return event;
};

export const parseCanonicalEvent = (input: EventInput): CanonicalEvent => (
  isValidatedCanonicalEvent(input) ? input : markValidatedCanonicalEvent(CanonicalEventSchema.parse(input))
);

export const safeParseCanonicalEvent = (input: EventInput) => {
  if (isValidatedCanonicalEvent(input)) return { success: true as const, data: input };
  const result = CanonicalEventSchema.safeParse(input);
  if (result.success) markValidatedCanonicalEvent(result.data);
  return result;
};
