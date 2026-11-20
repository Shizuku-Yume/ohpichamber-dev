import type { ComposerText } from './composerText';
import { isBtwPendingComposerKey } from "@/lib/btw";
import { isMentionEntryInText } from '../language/mentions';
/**
 * Per-session draft persistence for the composer.
 *
 * A draft belongs to a (runtime, directory, session) identity. Switching any
 * of those saves the outgoing draft and restores the incoming one, so moving
 * between sessions never loses typed text and never leaks it into the wrong
 * conversation.
 *
 * Writes are debounced while typing but forced at every edge where the page
 * may stop running — tab hidden, frozen, unloading, unmounting — because a
 * pending timer is not a saved draft.
 */

import React from 'react';
import { useInputStore } from '@/sync/input-store';

import {
    clearChatDraft,
    getChatDraftIdentityKey,
    readChatDraft,
    subscribeChatDraftDeletion,
    writeChatDraft,
    type ChatDraftIdentity,
    type ChatDraftSnapshot,
} from '@/lib/chatDraftPersistence';

const PERSIST_DEBOUNCE_MS = 500;

function draftSignature(text: string, confirmedMentions: Iterable<string>): string {
    return `${text}\u0000${[...confirmedMentions].sort().join('\u0000')}`;
}

export interface ComposerDraftOptions {
    text: ComposerText;
    setMessage: (text: string) => void;
    confirmedMentionsRef: React.RefObject<Set<string>>;
    identity: ChatDraftIdentity | null;
    selectAttachmentsOnIdentityChange?: boolean;
    /** User setting: when off, drafts stay in memory without durable writes. */
    persistEnabled: boolean;
    /** The draft restored on mount, if any. */
    initialDraft: { text: string; identity: ChatDraftIdentity | null };
    /** Called when the composer switches to a different draft identity. */
    onIdentityChange?: () => void;
    onDraftRestored?: (source: 'saved' | 'fork') => void;
}

export interface ComposerDraftControls {
    persistNow: (identity: ChatDraftIdentity | null, draft: string) => void;
    handoffDraft: (identity: ChatDraftIdentity | null, draft: string | null) => void;
    restoreDraft: (identity: ChatDraftIdentity | null, draft: string, confirmedMentions: Set<string>) => void;
    migrateDraft: (from: ChatDraftIdentity | null, to: ChatDraftIdentity | null) => void;
}

export function useComposerDraft(options: ComposerDraftOptions): ComposerDraftControls {
    const {
        text,
        setMessage,
        confirmedMentionsRef,
        identity,
        selectAttachmentsOnIdentityChange = true,
        persistEnabled,
        initialDraft,
        onIdentityChange,
        onDraftRestored,
    } = options;

    const persistTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const skipNextPersistRef = React.useRef(false);
    const lastPersistedRef = React.useRef<Map<string, string>>(new Map());
    const currentIdentityRef = React.useRef<ChatDraftIdentity | null>(initialDraft.identity);
    const draftMemoryRef = React.useRef(new Map<string, ChatDraftSnapshot>());
    const skipOutgoingDraftRef = React.useRef(false);
    const initialKey = initialDraft.identity ? getChatDraftIdentityKey(initialDraft.identity) : null;
    if (persistEnabled && initialKey && !draftMemoryRef.current.has(initialKey) && initialDraft.text) {
        draftMemoryRef.current.set(initialKey, {
            text: initialDraft.text,
            confirmedMentions: new Set(confirmedMentionsRef.current),
        });
    }
    const pendingComposerRestore = useInputStore((state) => state.pendingComposerRestore);

    React.useLayoutEffect(() => {
        if (!selectAttachmentsOnIdentityChange) return;
        useInputStore.getState().selectAttachmentDraft(identity);
    }, [identity, selectAttachmentsOnIdentityChange]);

    const callbacksRef = React.useRef({ onIdentityChange, onDraftRestored });
    callbacksRef.current = { onIdentityChange, onDraftRestored };

    React.useEffect(() => {
        currentIdentityRef.current = identity;
    }, [identity]);

    React.useEffect(() => {
        // Persistence off keeps in-memory drafts, but must not retain old disk copies.
        if (!persistEnabled && identity) clearChatDraft(identity);
    }, [identity, persistEnabled]);

    const persistNow = React.useCallback((target: ChatDraftIdentity | null, draft: string) => {
        if (!persistEnabled || !target) return;
        const key = getChatDraftIdentityKey(target);

        const activeMentions = new Set<string>();
        for (const mention of confirmedMentionsRef.current) {
            if (isMentionEntryInText(mention, draft)) activeMentions.add(mention);
        }
        if (isBtwPendingComposerKey(target.sessionId)) {
            draftMemoryRef.current.set(key, { text: draft, confirmedMentions: activeMentions });
            return;
        }
        confirmedMentionsRef.current = activeMentions;

        const signature = draftSignature(draft, activeMentions);
        if (lastPersistedRef.current.get(key) === signature) return;

        writeChatDraft(target, draft, activeMentions);
        lastPersistedRef.current.set(key, signature);
    }, [confirmedMentionsRef, persistEnabled]);

    const clearPending = React.useCallback(() => {
        if (!persistTimerRef.current) return;
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
    }, []);

    const handledInitialRef = React.useRef(false);
    React.useEffect(() => {
        if (handledInitialRef.current) return;
        handledInitialRef.current = true;
        if (!initialDraft.text) return;

        if (!persistEnabled) {
            confirmedMentionsRef.current = new Set();
            setMessage('');
            return;
        }
        requestAnimationFrame(() => callbacksRef.current.onDraftRestored?.('saved'));
        // Runs once; the initial draft is captured at mount by design.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [persistEnabled]);

    const previousIdentityRef = React.useRef<ChatDraftIdentity | null>(initialDraft.identity);
    React.useEffect(() => {
        const previous = previousIdentityRef.current;
        const previousKey = previous ? getChatDraftIdentityKey(previous) : null;
        const currentKey = identity ? getChatDraftIdentityKey(identity) : null;
        if (previousKey === currentKey) return;

        previousIdentityRef.current = identity;
        callbacksRef.current.onIdentityChange?.();
        clearPending();
        skipNextPersistRef.current = true;

        if (!skipOutgoingDraftRef.current && previousKey) {
            const outgoing = { text: text.get(), confirmedMentions: new Set(confirmedMentionsRef.current) };
            draftMemoryRef.current.set(previousKey, outgoing);
            if (persistEnabled) persistNow(previous, outgoing.text);
        }
        skipOutgoingDraftRef.current = false;

        const restored = (currentKey && draftMemoryRef.current.get(currentKey))
            || (persistEnabled ? readChatDraft(identity) : { text: '', confirmedMentions: new Set<string>() });
        setMessage(restored.text);
        confirmedMentionsRef.current = new Set(restored.confirmedMentions);
        if (restored.text) {
            requestAnimationFrame(() => callbacksRef.current.onDraftRestored?.('saved'));
        }
    }, [clearPending, confirmedMentionsRef, identity, text, persistEnabled, persistNow, setMessage]);

    React.useEffect(() => {
        if (!pendingComposerRestore) return;
        const input = useInputStore.getState();
        const pending = input.consumePendingComposerRestore(identity);
        if (!pending) return;

        clearPending();
        skipNextPersistRef.current = true;
        confirmedMentionsRef.current = new Set();
        setMessage(pending.text);
        // Equal source/replay text need not trigger another render to persist.
        if (persistEnabled) persistNow(pending.target, pending.text);
        input.clearAttachedFiles();
        for (const file of pending.files) input.addRestoredAttachment(file);
        requestAnimationFrame(() => {
            const current = currentIdentityRef.current;
            if (current && getChatDraftIdentityKey(current) === getChatDraftIdentityKey(pending.target)) {
                callbacksRef.current.onDraftRestored?.('fork');
            }
        });
    }, [clearPending, confirmedMentionsRef, identity, text, pendingComposerRestore, persistEnabled, persistNow, setMessage]);

    React.useEffect(() => subscribeChatDraftDeletion((deleted) => {
        const deletedKey = getChatDraftIdentityKey(deleted);
        lastPersistedRef.current.set(deletedKey, draftSignature('', []));
        draftMemoryRef.current.set(deletedKey, { text: '', confirmedMentions: new Set() });

        const current = currentIdentityRef.current;
        if (!current || getChatDraftIdentityKey(current) !== deletedKey) return;

        clearPending();
        skipNextPersistRef.current = true;
        confirmedMentionsRef.current = new Set();
        setMessage('');
    }), [clearPending, confirmedMentionsRef, setMessage]);

    // Debounced write while typing.
    React.useEffect(() => {
        if (!persistEnabled) return;

        if (skipNextPersistRef.current) {
            skipNextPersistRef.current = false;
            return;
        }

        clearPending();
        const identitySnapshot = identity;
        persistTimerRef.current = setTimeout(() => {
            persistTimerRef.current = null;
            persistNow(identitySnapshot, draftSnapshot);
        }, PERSIST_DEBOUNCE_MS);

        return clearPending;
    }, [clearPending, identity, message, persistEnabled, persistNow]);

    React.useEffect(() => {
        const flush = () => {
            clearPending();
            if (persistEnabled) persistNow(currentIdentityRef.current, text.get());
        };
        const onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') flush();
        };

        document.addEventListener('visibilitychange', onVisibilityChange);
        document.addEventListener('freeze', flush);
        window.addEventListener('pagehide', flush);
        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            document.removeEventListener('freeze', flush);
            window.removeEventListener('pagehide', flush);
            flush();
        };
    }, [clearPending, text, persistEnabled, persistNow]);

    const restoreDraft = React.useCallback((target: ChatDraftIdentity | null, draft: string, confirmedMentions: Set<string>) => {
        const targetKey = target ? getChatDraftIdentityKey(target) : null;
        const current = currentIdentityRef.current;
        const isCurrent = target && current && getChatDraftIdentityKey(target) === getChatDraftIdentityKey(current);
        const existing = isCurrent
            ? { text: text.get(), confirmedMentions: confirmedMentionsRef.current }
            : (targetKey && draftMemoryRef.current.get(targetKey)) || (isBtwPendingComposerKey(target?.sessionId) ? null : persistEnabled ? readChatDraft(target) : null);
        const text = existing?.text && existing.text !== draft ? `${existing.text}\n\n${draft}` : draft;
        const mentions = new Set([...(existing?.confirmedMentions ?? []), ...confirmedMentions]);
        if (targetKey) draftMemoryRef.current.set(targetKey, { text: merged, confirmedMentions: mentions });
        if (isCurrent) {
            confirmedMentionsRef.current = new Set(mentions);
            setMessage(merged);
        }
        if (persistEnabled && target && !isBtwPendingComposerKey(target.sessionId)) {
            writeChatDraft(target, text, mentions);
            lastPersistedRef.current.set(getChatDraftIdentityKey(target), draftSignature(text, mentions));
        }
    }, [confirmedMentionsRef, text, persistEnabled, setMessage]);

    const handoffDraft = React.useCallback((target: ChatDraftIdentity | null, draft: string | null) => {
        const targetKey = target ? getChatDraftIdentityKey(target) : null;
        if (targetKey && draft !== null) draftMemoryRef.current.set(targetKey, { text: draft, confirmedMentions: new Set() });
        const currentKey = currentIdentityRef.current ? getChatDraftIdentityKey(currentIdentityRef.current) : null;
        if (targetKey === currentKey) {
            if (draft !== null) {
                confirmedMentionsRef.current = new Set();
                setMessage(draft);
                persistNow(target, draft);
            }
            return;
        }
        if (currentKey) draftMemoryRef.current.set(currentKey, { text: '', confirmedMentions: new Set() });
        persistNow(currentIdentityRef.current, '');
        skipOutgoingDraftRef.current = true;
        confirmedMentionsRef.current = new Set();
        setMessage('');
    }, [confirmedMentionsRef, persistNow, setMessage]);

    const migrateDraft = React.useCallback((from: ChatDraftIdentity | null, to: ChatDraftIdentity | null) => {
        if (!to) return;
        const current = currentIdentityRef.current;
        const draft = from && current && getChatDraftIdentityKey(from) === getChatDraftIdentityKey(current)
            ? { text: text.get(), confirmedMentions: new Set(confirmedMentionsRef.current) }
            : (from && draftMemoryRef.current.get(getChatDraftIdentityKey(from)))
            || (persistEnabled ? readChatDraft(from) : null);
        if (!draft) return;
        const fromKey = from ? getChatDraftIdentityKey(from) : null;
        const toKey = getChatDraftIdentityKey(to);
        if (fromKey === toKey) return;
        draftMemoryRef.current.set(toKey, { text: draft.text, confirmedMentions: new Set(draft.confirmedMentions) });
        if (!persistEnabled) {
            if (fromKey) {
                draftMemoryRef.current.delete(fromKey);
                lastPersistedRef.current.delete(fromKey);
            }
            return;
        }
        writeChatDraft(to, draft.text, draft.confirmedMentions);
        lastPersistedRef.current.set(toKey, draftSignature(draft.text, draft.confirmedMentions));
        // The migration MOVED the draft: leaving the source behind would let a
        // switch back to it resurrect text that now belongs to the destination.
        // The source is cleared only after the destination is confirmed written,
        // so a failed destination write leaves the text recoverable where it was.
        if (!fromKey) return;
        if (readChatDraft(to)?.text !== draft.text) {
            draftMemoryRef.current.set(fromKey, { text: draft.text, confirmedMentions: new Set(draft.confirmedMentions) });
            lastPersistedRef.current.delete(toKey);
            return;
        }
        draftMemoryRef.current.delete(fromKey);
        lastPersistedRef.current.delete(fromKey);
        // Only clear what was actually moved; an unrelated draft stays.
        if (from && readChatDraft(from).text === draft.text) clearChatDraft(from);
    }, [confirmedMentionsRef, text, persistEnabled]);

    return { persistNow, handoffDraft, restoreDraft, migrateDraft };
}
