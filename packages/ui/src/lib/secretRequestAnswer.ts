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
<<<<<<< HEAD
||||||| bc50ba56aa

const secretRunFieldsSchema = z.object({ fields: z.array(z.string()), reused: z.array(z.string()) });

/**
 * The fields a waiting `secret.run` card asks for, and the ones the chat still
 * remembers, from the server that runs the command: only it knows what is
 * remembered, and a client that opens the chat later reads the same answer.
 * Names only, never a value. Null when the card stopped waiting or the server
 * did not answer.
 */
export async function readSecretRunFields(
    input: { sessionId: string; callId: string },
    directory: string | undefined,
): Promise<z.infer<typeof secretRunFieldsSchema> | null> {
    const query = new URLSearchParams({ sessionId: input.sessionId, callId: input.callId });
    const response = await runtimeFetch(`/api/openchamber/secret/fields?${query.toString()}`, { directory });
    if (!response.ok) return null;
    const parsed = secretRunFieldsSchema.safeParse(await response.json().catch(() => null));
    return parsed.success ? parsed.data : null;
}
=======

const secretRunFieldsSchema = z.object({ fields: z.array(z.string()), reused: z.array(z.string()) });

export async function readSecretRunFields(
    input: { sessionId: string; callId: string },
    directory: string | undefined,
): Promise<z.infer<typeof secretRunFieldsSchema> | null> {
    const query = new URLSearchParams({ sessionId: input.sessionId, callId: input.callId });
    const response = await runtimeFetch(`/api/openchamber/secret/fields?${query.toString()}`, { directory });
    if (!response.ok) return null;
    const parsed = secretRunFieldsSchema.safeParse(await response.json().catch(() => null));
    return parsed.success ? parsed.data : null;
}
>>>>>>> upstream/main
