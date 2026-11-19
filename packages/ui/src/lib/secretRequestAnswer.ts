import { z } from 'zod';

import { runtimeFetch } from './runtime-fetch';

const errorSchema = z.object({ error: z.string().min(1) }).catch({ error: '' });

export async function answerSecretRequest(
    input: { sessionId: string; callId: string } & ({ value: string } | { values: Record<string, string>; remember: string[] } | { declined: true }),
    directory: string | undefined,
): Promise<void> {
    const response = await runtimeFetch('/api/openchamber/secret/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        directory,
    });
    if (response.ok) return;
    const payload = errorSchema.parse(await response.json().catch(() => null));
    throw new Error(payload.error || `The secret was not saved (${response.status})`);
}
