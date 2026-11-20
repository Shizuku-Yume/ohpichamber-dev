import { z } from 'zod';

import { runtimeFetch } from './runtime-fetch';

export async function answerSecretRequest(
    input: { sessionId: string; callId: string } & ({ values: Record<string, string>; remember: string[] } | { declined: true }),
    directory: string | undefined,
): Promise<void> {
    const response = await runtimeFetch('/api/openchamber/secret/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        directory,
    });
    if (response.ok) return;
    throw new Error(`The secrets were not sent (${response.status})`);
}

const secretRunFieldsSchema = z.object({ fields: z.array(z.string().min(1)), reused: z.array(z.string().min(1)) });
export type SecretRunFields = z.infer<typeof secretRunFieldsSchema>;

export async function readSecretRunFields(
    input: { sessionId: string; callId: string },
    directory: string | undefined,
    signal?: AbortSignal,
): Promise<SecretRunFields | null> {
    const response = await runtimeFetch('/api/openchamber/secret/fields', { query: input, directory, signal, cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`The secret fields could not be read (${response.status})`);
    const parsed = secretRunFieldsSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new Error('The secret fields response was invalid');
    return parsed.data;
}
