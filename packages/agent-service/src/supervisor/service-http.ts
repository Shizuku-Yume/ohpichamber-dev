import type { IncomingMessage } from 'node:http';
import { StringDecoder } from 'node:string_decoder';
import type { z } from 'zod';
import { EntityIdSchema, type ProblemCode } from '@openchamber/agent-contract';

export class RequestError extends Error {
  constructor(readonly status: number, readonly code: ProblemCode, message: string) { super(message); }
}

export async function readBody<T>(request: IncomingMessage, schema: z.ZodType<T>): Promise<T> {
  const decoder = new StringDecoder('utf8');
  let bytes = 0;
  let text = '';
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 1_048_576) throw new RequestError(413, 'PAYLOAD_TOO_LARGE', 'Request exceeds the service limit');
    text += decoder.write(chunk);
  }
  text += decoder.end();
  try { return schema.parse(JSON.parse(text)); }
  catch { throw new RequestError(400, 'INVALID_REQUEST', 'Request body is invalid'); }
}

export function identity(value: string): string {
  try { return EntityIdSchema.parse(decodeURIComponent(value)); }
  catch { throw new RequestError(400, 'INVALID_REQUEST', 'Route identity is invalid'); }
}
