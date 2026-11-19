import { isLinkIdentifier } from '@/lib/router/messageFocus';

<<<<<<< HEAD
// Links to a session, optionally to one message in it. They extend the links
// the app already understands: the web route (`?session=<id>`) and the native
// deep link (`ohpichamber://session/<id>`), each with a `message` parameter.
// A link is a place on this server, not a public share: it opens only for
// someone who can reach the same OpenChamber instance.
//
// Pure on purpose: the markdown sanitizer, which may run in a worker, uses it.
||||||| bc50ba56aa
// Links to a session, optionally to one message in it. They extend the links
// the app already understands: the web route (`?session=<id>`) and the native
// deep link (`openchamber://session/<id>`), each with a `message` parameter.
// A link is a place on this server, not a public share: it opens only for
// someone who can reach the same OpenChamber instance.
//
// Pure on purpose: the markdown sanitizer, which may run in a worker, uses it.
=======
>>>>>>> upstream/main

export interface SessionLinkTarget {
    readonly sessionId: string;
    readonly messageId: string | null;
}

export type MessageLinkForm =
    | { readonly kind: 'deep-link' }
    | { readonly kind: 'web'; readonly origin: string; readonly pathname: string };

const DEEP_LINK_PREFIX = 'ohpichamber://session/';

export const buildMessageLink = (sessionId: string, messageId: string, form: MessageLinkForm): string | null => {
    if (!isLinkIdentifier(sessionId) || !isLinkIdentifier(messageId)) return null;
    if (form.kind === 'deep-link') {
        return `${DEEP_LINK_PREFIX}${sessionId}?message=${messageId}`;
    }
    let url: URL;
    try {
        url = new URL(form.pathname, form.origin);
    } catch {
        return null;
    }
    url.searchParams.set('session', sessionId);
    url.searchParams.set('message', messageId);
    return url.toString();
};

const BARE_SESSION_ID_RE = /^\/?(ses_[A-Za-z0-9_-]+)$/;

const parseTarget = (sessionId: string | null | undefined, messageId: string | null): SessionLinkTarget | null => {
    if (!sessionId || !isLinkIdentifier(sessionId)) return null;
    if (messageId === null) return { sessionId, messageId: null };
    return isLinkIdentifier(messageId) ? { sessionId, messageId } : null;
};

export const bareSessionId = (text: string): string | null => {
    const trimmed = text.trim();
    const sessionId = BARE_SESSION_ID_RE.exec(trimmed)?.[1];
    return sessionId === trimmed && parseTarget(sessionId, null) ? sessionId : null;
};

export const parseSessionLink = (href: string, ownOrigins: readonly string[]): SessionLinkTarget | null => {
    const bareSessionId = BARE_SESSION_ID_RE.exec(href.trim())?.[1];
    if (bareSessionId) return parseTarget(bareSessionId, null);

    let url: URL;
    try {
        url = new URL(href);
    } catch {
        return null;
    }

<<<<<<< HEAD
    if (url.protocol === 'ohpichamber:') {
        // Old Android WebViews put the route in the path instead of the host.
||||||| bc50ba56aa
    if (url.protocol === 'openchamber:') {
        // Old Android WebViews put the route in the path instead of the host.
=======
    if (url.protocol === 'openchamber:') {
>>>>>>> upstream/main
        const segments = [url.host, ...url.pathname.split('/')].filter(Boolean);
        if (segments[0]?.toLowerCase() !== 'session' || segments.length !== 2) return null;
        return parseTarget(segments[1], url.searchParams.get('message'));
    }

    if ((url.protocol === 'http:' || url.protocol === 'https:') && ownOrigins.includes(url.origin)) {
        return parseTarget(url.searchParams.get('session'), url.searchParams.get('message'));
    }

    return null;
};

<<<<<<< HEAD
/** True for `ohpichamber://session/...` links, the only native deep links chat content may carry. */
||||||| bc50ba56aa
/** True for `openchamber://session/...` links, the only native deep links chat content may carry. */
=======
>>>>>>> upstream/main
export const isSessionDeepLink = (href: string): boolean => (
    href.toLowerCase().startsWith(DEEP_LINK_PREFIX) && parseSessionLink(href, []) !== null
);

<<<<<<< HEAD
// A link as it sits in text: the native deep link, or any web address, kept
// only when it carries `session=`. One linear pass: a pattern that looked for
// `session=` inside the address backtracked over every long unbroken run.
const LINK_CANDIDATE = /ohpichamber:\/\/session\/[^\s<>()"'`]+|https?:\/\/[^\s<>()"'`]+/gi;
||||||| bc50ba56aa
// A link as it sits in text: the native deep link, or any web address, kept
// only when it carries `session=`. One linear pass: a pattern that looked for
// `session=` inside the address backtracked over every long unbroken run.
const LINK_CANDIDATE = /openchamber:\/\/session\/[^\s<>()"'`]+|https?:\/\/[^\s<>()"'`]+/gi;
=======
const LINK_CANDIDATE = /openchamber:\/\/session\/[^\s<>()"'`]+|https?:\/\/[^\s<>()"'`]+/gi;
>>>>>>> upstream/main

interface SessionLinkRange {
    readonly start: number;
    readonly end: number;
    readonly link: string;
    readonly target: SessionLinkTarget;
}

export const sessionLinkKey = (target: SessionLinkTarget): string => `${target.sessionId}:${target.messageId ?? ''}`;

export const findSessionLinks = (text: string, ownOrigins: readonly string[]): SessionLinkRange[] => {
    if (!text.includes('session')) return [];
    const found: SessionLinkRange[] = [];
    for (const match of text.matchAll(LINK_CANDIDATE)) {
        const link = match[0].replace(/[.,;:!?]+$/, '');
        if (!link.includes('session')) continue;
        const target = parseSessionLink(link, ownOrigins);
        if (target) found.push({ start: match.index, end: match.index + link.length, link, target });
    }
    return found;
};
