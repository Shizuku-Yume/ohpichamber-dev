import { z } from 'zod';

const errorSchema = z.object({ error: z.string().min(1), code: z.string().min(1).optional() }).catch({ error: '' });

export class SharePageRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string | null) {
    super(message);
  }
}

export const shareRequestFailure = async (response: Response, fallback: string): Promise<SharePageRequestError> => {
  const payload = errorSchema.parse(await response.json().catch(() => null));
  return new SharePageRequestError(payload.error || `${fallback} (${response.status})`, response.status, payload.code ?? null);
};

export const isSharingTurnedOff = (error: Error): boolean => (
  error instanceof SharePageRequestError && error.status === 403 && error.code === 'enterprise_mode'
);
