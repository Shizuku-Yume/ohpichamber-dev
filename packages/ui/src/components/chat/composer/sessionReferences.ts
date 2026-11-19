<<<<<<< HEAD
/**
 * Other sessions and their messages, mentioned in the composer's text.
 */
||||||| bc50ba56aa
/**
 * Other sessions and their messages, mentioned in the composer's text.
 *
 * A mention is a session link in the text (`openchamber://session/…`, with
 * `?message=` for one message), written by the `@` picker or pasted; the
 * composer draws it as a chip, and the model reads it where the user put it.
 * Beside the text, each one also goes as a context part saying what it is: a
 * session by name, since a whole session is too long to send and the
 * openchamber tool reads it; a message whole, since the tool can list a
 * session's latest messages but cannot fetch one by id. Neither says what to
 * do with it; the user's message says that.
 */
=======
>>>>>>> upstream/main

import { canonicalClient } from '@/api/canonicalClient';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { findSessionLinks, sessionLinkKey, type SessionLinkTarget } from '@/lib/sessionLinks';
import { ensureGlobalSessionsLoaded } from '@/stores/useGlobalSessionsStore';

import type { ComposerContextReference } from './submit/buildOutgoingMessage';

export type SessionReference = Extract<ComposerContextReference, { kind: 'session' | 'session-message' }>;

const EXCERPT_LENGTH = 120;

export const sessionReference = (session: { id: string; title: string }): SessionReference => ({
    kind: 'session',
    sessionId: session.id,
    title: session.title,
    contextText: `The user referenced another OhPiChamber session, "${session.title}" (${session.id}). `
        + `Its messages can be read with the openchamber tool (session.messages, sessionId ${session.id}).`,
});

<<<<<<< HEAD
export type SessionReferencePart = { type?: string; text?: string; content?: string; metadata?: { openchamberContext?: unknown } };

/** The text a person reads in a message: its own text parts, without context the app attached or tool output. */
export const messageText = (parts: readonly SessionReferencePart[]): string => parts
    .flatMap((part) => (part.type === 'text' && !part.metadata?.openchamberContext ? [(part.text ?? part.content ?? '').trim()] : []))
||||||| bc50ba56aa
/** The text a person reads in a message: its own text parts, without context the app attached or tool output. */
export const messageText = (parts: readonly Part[]): string => parts
    .flatMap((part) => (part.type === 'text' && !part.metadata?.openchamberContext ? [part.text.trim()] : []))
=======
export const messageText = (parts: readonly Part[]): string => parts
    .flatMap((part) => (part.type === 'text' && !part.metadata?.openchamberContext ? [part.text.trim()] : []))
>>>>>>> upstream/main
    .filter(Boolean)
    .join('\n\n');

const authorOf = (role: string): string => {
    if (role === 'user') return 'the user of that session';
    if (role === 'assistant') return 'the agent of that session';
    return 'OhPiChamber';
};

export const sessionMessageReference = (
    session: { id: string; title: string },
    message: { info: { id: string; role: string }; parts: readonly SessionReferencePart[] },
): SessionReference | null => {
    const text = messageText(message.parts);
    if (!text) return null;
    const excerpt = text.replace(/\s+/g, ' ').trim();
    return {
        kind: 'session-message',
        sessionId: session.id,
        messageId: message.info.id,
        sessionTitle: session.title,
        excerpt: excerpt.length > EXCERPT_LENGTH ? `${excerpt.slice(0, EXCERPT_LENGTH - 1)}…` : excerpt,
<<<<<<< HEAD
        contextText: `The user attached a message from another OhPiChamber session, "${session.title}" `
||||||| bc50ba56aa
        // Who attached it and who wrote it are said apart: the user attaches
        // messages they wrote themselves too, and an agent's words must not
        // read as the user's request.
        contextText: `The user attached a message from another OpenChamber session, "${session.title}" `
=======
        contextText: `The user attached a message from another OpenChamber session, "${session.title}" `
>>>>>>> upstream/main
            + `(${session.id}, message ${message.info.id}). It was written by ${authorOf(message.info.role)}. The message:\n\n${text}`,
    };
};

export const sessionReferenceKey = (reference: { sessionId: string; messageId?: string }): string => sessionLinkKey({
    sessionId: reference.sessionId,
    messageId: reference.messageId ?? null,
});

<<<<<<< HEAD
/** The link the `@` picker writes for a session. */
export const sessionLinkText = (sessionId: string): string => `ohpichamber://session/${sessionId}`;
||||||| bc50ba56aa
/** The link the `@` picker writes for a session. */
export const sessionLinkText = (sessionId: string): string => `openchamber://session/${sessionId}`;
=======
export const sessionLinkText = (sessionId: string): string => `openchamber://session/${sessionId}`;
>>>>>>> upstream/main

export const loadSessionLinkReference = async (target: SessionLinkTarget): Promise<SessionReference | null> => {
    const runtimeKey = getRuntimeKey();
    const snapshot = await ensureGlobalSessionsLoaded();
    if (getRuntimeKey() !== runtimeKey) return null;
    const session = [...snapshot.activeSessions, ...snapshot.archivedSessions].find((entry) => entry.sessionId === target.sessionId);
    if (!session) return null;
    const sessionTitle = session.title || session.sessionId;
    if (!target.messageId) return sessionReference({ id: session.sessionId, title: sessionTitle });
    try {
        let cursor: string | undefined;
        do {
            const history = cursor
                ? await canonicalClient.getHistory(session.sessionId, { cursor })
                : await canonicalClient.getHistory(session.sessionId);
            if (getRuntimeKey() !== runtimeKey) return null;
            const msg = history.messages.find((m) => m.messageId === target.messageId);
            if (msg) {
                const parts = msg.parts.map((p) => (p.type === 'text' ? { type: 'text' as const, text: p.content } : p));
                return sessionMessageReference({ id: session.sessionId, title: sessionTitle }, { info: { id: msg.messageId, role: msg.role }, parts });
            }
            cursor = history.nextCursor ?? undefined;
        } while (cursor);
    } catch {
        return null;
    }
    return null;
};

type MentionsInText = { references: SessionReference[]; unresolved: SessionLinkTarget[] };

export const sessionReferencesInText = (
    text: string,
    ownOrigins: readonly string[],
    resolved: ReadonlyMap<string, SessionReference>,
): MentionsInText => {
    const references: SessionReference[] = [];
    const unresolved: SessionLinkTarget[] = [];
    const seen = new Set<string>();
    for (const { target } of findSessionLinks(text, ownOrigins)) {
        const key = sessionLinkKey(target);
        if (seen.has(key)) continue;
        seen.add(key);
        const reference = resolved.get(key);
        if (reference) references.push(reference);
        else unresolved.push(target);
    }
    return { references, unresolved };
};
