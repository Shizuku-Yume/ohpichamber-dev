import { CanonicalEventSchema } from '@openchamber/agent-contract';
import type { CanonicalEvent } from '@openchamber/agent-contract';

// Canonical events crossing the Host event hub are validated once at the
// ingress boundary (the upstream SSE frame parse). Every Host-side consumer
// downstream of that boundary used to run the same zod parse again — once per
// consumer per event, which multiplies the cost of a busy stream by the
// subscriber count. Zod parse returns a fresh object, so object identity is
// proof the payload has already been validated: this memo makes the repeated
// validations of the same object free while keeping full validation for
// anything that did not come through the boundary.
const validated = new WeakSet<object>();

export const markValidatedCanonicalEvent = <T extends object>(event: T): T => {
  validated.add(event);
  return event;
};

export const parseCanonicalEvent = (input: unknown): CanonicalEvent => {
  if (input !== null && typeof input === 'object' && validated.has(input as object)) {
    return input as CanonicalEvent;
  }
  return markValidatedCanonicalEvent(CanonicalEventSchema.parse(input));
};

export const safeParseCanonicalEvent = (input: unknown) => {
  if (input !== null && typeof input === 'object' && validated.has(input as object)) {
    return { success: true as const, data: input as CanonicalEvent };
  }
  const result = CanonicalEventSchema.safeParse(input);
  if (result.success) markValidatedCanonicalEvent(result.data);
  return result;
};
