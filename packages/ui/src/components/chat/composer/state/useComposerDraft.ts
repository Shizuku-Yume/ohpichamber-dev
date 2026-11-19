<<<<<<< HEAD
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
||||||| bc50ba56aa
/**
 * Per-session draft persistence for the composer.
 *
 * A draft belongs to a (runtime, directory, session) identity. Switching any
 * of those saves the outgoing draft and restores the incoming one, so moving
 * between sessions never loses typed text and never leaks it into the wrong
 * conversation. The exception is the same draft changing directory: the open
 * new-session draft changing its project or worktree, or a session moved to
 * another directory. Its text and files move to the new directory.
 *
 * Writes are debounced while typing but forced at every edge where the page
 * may stop running — tab hidden, frozen, unloading, unmounting — because a
 * pending timer is not a saved draft. The one identity that is never written
 * is a `/btw` fork still being created: it is a placeholder, not a session.
 */
=======
>>>>>>> upstream/main

import React from 'react';
import { useInputStore } from '@/sync/input-store';
<<<<<<< HEAD
||||||| bc50ba56aa
import { isBtwPendingComposerKey } from '@/lib/btw';
import { isMentionEntryInText } from '../language/mentions';
import { useLinkedReferenceDrafts } from '../linkedReferenceDrafts';
=======
import { attachmentBasename, withMissingCitations } from '@/lib/attachmentIdentity';
import { isBtwPendingComposerKey } from '@/lib/btw';
import { isMentionEntryInText } from '../language/mentions';
import { useLinkedReferenceDrafts } from '../linkedReferenceDrafts';
import { useComposerTextEffect, type ComposerText } from './composerText';
>>>>>>> upstream/main

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
<<<<<<< HEAD
    /** User setting: when off, drafts stay in memory without durable writes. */
    persistEnabled: boolean;
    /** The draft restored on mount, if any. */
||||||| bc50ba56aa
    /** The draft restored on mount, if any. */
=======
>>>>>>> upstream/main
    initialDraft: { text: string; identity: ChatDraftIdentity | null };
<<<<<<< HEAD
    /** Called when the composer switches to a different draft identity. */
||||||| bc50ba56aa
    /**
     * Id of the open new-session draft shown in this composer, or null. It
     * stays the same while the user changes the draft's project or worktree
     * and changes when a new draft opens.
     */
    newSessionDraftId?: number | null;
    /** Called when the composer switches to a different draft identity. */
=======
    newSessionDraftId?: number | null;
>>>>>>> upstream/main
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

<<<<<<< HEAD
    // Mount: a restored draft is selected so typing replaces it; with the
    // setting off it is discarded instead of silently kept.
||||||| bc50ba56aa
    // Mount: a restored draft is selected so typing replaces it.
=======
>>>>>>> upstream/main
    const handledInitialRef = React.useRef(false);
    React.useEffect(() => {
        if (handledInitialRef.current) return;
        handledInitialRef.current = true;
        if (!initialDraft.text) return;

        if (!persistEnabled) {
            messageRef.current = '';
            confirmedMentionsRef.current = new Set();
            setMessage('');
            return;
        }
        requestAnimationFrame(() => callbacksRef.current.onDraftRestored?.('saved'));
<<<<<<< HEAD
        // Runs once; the initial draft is captured at mount by design.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [persistEnabled]);
||||||| bc50ba56aa
        // Runs once; the initial draft is captured at mount by design.
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, []);
=======
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, []);
>>>>>>> upstream/main

    const previousIdentityRef = React.useRef<ChatDraftIdentity | null>(initialDraft.identity);
<<<<<<< HEAD
||||||| bc50ba56aa
    // The new-session draft id seen at the last run, so a switch can tell the
    // same draft moving from a new draft replacing it.
    const previousNewSessionDraftIdRef = React.useRef<number | null>(newSessionDraftId);
=======
    const previousNewSessionDraftIdRef = React.useRef<number | null>(newSessionDraftId);
>>>>>>> upstream/main
    React.useEffect(() => {
        const previous = previousIdentityRef.current;
        const previousKey = previous ? getChatDraftIdentityKey(previous) : null;
        const currentKey = identity ? getChatDraftIdentityKey(identity) : null;
        if (previousKey === currentKey) return;

        previousIdentityRef.current = identity;
        callbacksRef.current.onIdentityChange?.();
        clearPending();
        skipNextPersistRef.current = true;

<<<<<<< HEAD
        if (!skipOutgoingDraftRef.current && previousKey) {
            const outgoing = { text: messageRef.current, confirmedMentions: new Set(confirmedMentionsRef.current) };
||||||| bc50ba56aa
        const outgoing = { text: messageRef.current, confirmedMentions: new Set(confirmedMentionsRef.current) };
        // Picking another project or worktree for the open new-session draft
        // changes where it will run, not which draft it is, so its text and
        // files go along instead of staying with the old directory. A new
        // draft opened elsewhere gets a new id and leaves this one in place.
        // A session moved to another directory keeps its id, so the same
        // session in a new directory is the same draft too.
        const sameDraftMoved = !skipOutgoingDraftRef.current
            && previous !== null
            && identity !== null
            && previous.runtimeKey === identity.runtimeKey
            && (isNewSessionDraftIdentity(previous)
                ? sameNewSessionDraft && isNewSessionDraftIdentity(identity)
                : previous.sessionId === identity.sessionId);
        const carriesText = sameDraftMoved && outgoing.text.length > 0;
        if (sameDraftMoved) {
            useInputStore.getState().moveAttachedFiles(previous, identity);
            useLinkedReferenceDrafts.getState().move(previous, identity);
        }
        if (carriesText && previousKey) {
            draftMemoryRef.current.set(previousKey, { text: '', confirmedMentions: new Set() });
            persistNow(previous, '');
        } else if (!skipOutgoingDraftRef.current && previousKey) {
=======
        const outgoing = { text: text.get(), confirmedMentions: new Set(confirmedMentionsRef.current) };
        const sameDraftMoved = !skipOutgoingDraftRef.current
            && previous !== null
            && identity !== null
            && previous.runtimeKey === identity.runtimeKey
            && (isNewSessionDraftIdentity(previous)
                ? sameNewSessionDraft && isNewSessionDraftIdentity(identity)
                : previous.sessionId === identity.sessionId);
        const carriesText = sameDraftMoved && outgoing.text.length > 0;
        if (sameDraftMoved) {
            useInputStore.getState().moveAttachedFiles(previous, identity);
            useLinkedReferenceDrafts.getState().move(previous, identity);
        }
        if (carriesText && previousKey) {
            draftMemoryRef.current.set(previousKey, { text: '', confirmedMentions: new Set() });
            persistNow(previous, '');
        } else if (!skipOutgoingDraftRef.current && previousKey) {
>>>>>>> upstream/main
            draftMemoryRef.current.set(previousKey, outgoing);
            if (persistEnabled) persistNow(previous, outgoing.text);
        }
        skipOutgoingDraftRef.current = false;

<<<<<<< HEAD
        const restored = (currentKey && draftMemoryRef.current.get(currentKey))
            || (persistEnabled ? readChatDraft(identity) : { text: '', confirmedMentions: new Set<string>() });
        messageRef.current = restored.text;
        setMessage(restored.text);
||||||| bc50ba56aa
        const saved = (currentKey && draftMemoryRef.current.get(currentKey))
            || (identity && isBtwPendingComposerKey(identity.sessionId)
                ? { text: '', confirmedMentions: new Set<string>() }
                : readChatDraftClaimingFolderDraft(identity));
        // Mentions name files of the old directory, so only the text travels.
        // A draft already saved for the new directory is kept above it.
        const restored = carriesText
            ? {
                text: saved.text && saved.text !== outgoing.text ? `${saved.text}\n\n${outgoing.text}` : outgoing.text,
                confirmedMentions: saved.confirmedMentions,
            }
            : saved;
        messageRef.current = restored.text;
        setMessage(restored.text);
=======
        const saved = (currentKey && draftMemoryRef.current.get(currentKey))
            || (identity && isBtwPendingComposerKey(identity.sessionId)
                ? { text: '', confirmedMentions: new Set<string>() }
                : readChatDraftClaimingFolderDraft(identity));
        const restored = carriesText
            ? {
                text: saved.text && saved.text !== outgoing.text ? `${saved.text}\n\n${outgoing.text}` : outgoing.text,
                confirmedMentions: saved.confirmedMentions,
            }
            : saved;
>>>>>>> upstream/main
        confirmedMentionsRef.current = new Set(restored.confirmedMentions);
<<<<<<< HEAD
        if (restored.text) {
||||||| bc50ba56aa
        if (carriesText) {
            // The text is the one the user is typing, so it is neither
            // selected as a restored draft nor left to the skipped debounce.
            persistNow(identity, restored.text);
        } else if (restored.text) {
=======
        setMessage(restored.text);
        if (carriesText) {
            persistNow(identity, restored.text);
        } else if (restored.text) {
>>>>>>> upstream/main
            requestAnimationFrame(() => callbacksRef.current.onDraftRestored?.('saved'));
        }
<<<<<<< HEAD
    }, [clearPending, confirmedMentionsRef, identity, messageRef, persistEnabled, persistNow, setMessage]);
||||||| bc50ba56aa
    }, [clearPending, confirmedMentionsRef, identity, messageRef, newSessionDraftId, persistNow, setMessage]);
=======
    }, [clearPending, confirmedMentionsRef, identity, newSessionDraftId, persistNow, setMessage, text]);
>>>>>>> upstream/main

    React.useEffect(() => {
        if (!pendingComposerRestore) return;
        const input = useInputStore.getState();
        const pending = input.consumePendingComposerRestore(identity);
        if (!pending) return;

        clearPending();
        skipNextPersistRef.current = true;
        confirmedMentionsRef.current = new Set();
<<<<<<< HEAD
        setMessage(pending.text);
        // Equal source/replay text need not trigger another render to persist.
        if (persistEnabled) persistNow(pending.target, pending.text);
||||||| bc50ba56aa
        setMessage(pending.text);
        // Equal source/replay text need not trigger another render to persist.
        persistNow(pending.target, pending.text);
=======
        const text = withMissingCitations(pending.text, pending.files.map((file) => ({ filename: attachmentBasename(file.filename) })));
        setMessage(text);
        persistNow(pending.target, text);
>>>>>>> upstream/main
        input.clearAttachedFiles();
        for (const file of pending.files) input.addRestoredAttachment(file);
        requestAnimationFrame(() => {
            const current = currentIdentityRef.current;
            if (current && getChatDraftIdentityKey(current) === getChatDraftIdentityKey(pending.target)) {
                callbacksRef.current.onDraftRestored?.('fork');
            }
        });
<<<<<<< HEAD
    }, [clearPending, confirmedMentionsRef, identity, messageRef, pendingComposerRestore, persistEnabled, persistNow, setMessage]);
||||||| bc50ba56aa
    }, [clearPending, confirmedMentionsRef, identity, messageRef, pendingComposerRestore, persistNow, setMessage]);
=======
    }, [clearPending, confirmedMentionsRef, identity, pendingComposerRestore, persistNow, setMessage]);
>>>>>>> upstream/main

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

<<<<<<< HEAD
    // Debounced write while typing.
    React.useEffect(() => {
        if (!persistEnabled) return;

||||||| bc50ba56aa
    // Debounced write while typing.
    React.useEffect(() => {
=======
    useComposerTextEffect(text, (draftSnapshot) => {
>>>>>>> upstream/main
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
<<<<<<< HEAD
    }, [clearPending, identity, message, persistEnabled, persistNow]);
||||||| bc50ba56aa
    }, [clearPending, identity, message, persistNow]);
=======
    }, [clearPending, identity, persistNow]);
>>>>>>> upstream/main

    React.useEffect(() => {
        const flush = () => {
            clearPending();
<<<<<<< HEAD
            if (persistEnabled) persistNow(currentIdentityRef.current, messageRef.current);
||||||| bc50ba56aa
            persistNow(currentIdentityRef.current, messageRef.current);
=======
            persistNow(currentIdentityRef.current, text.get());
>>>>>>> upstream/main
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
<<<<<<< HEAD
    }, [clearPending, messageRef, persistEnabled, persistNow]);
||||||| bc50ba56aa
    }, [clearPending, messageRef, persistNow]);
=======
    }, [clearPending, persistNow, text]);
>>>>>>> upstream/main

    const restoreDraft = React.useCallback((target: ChatDraftIdentity | null, draft: string, confirmedMentions: Set<string>) => {
        const targetKey = target ? getChatDraftIdentityKey(target) : null;
        const current = currentIdentityRef.current;
        const isCurrent = target && current && getChatDraftIdentityKey(target) === getChatDraftIdentityKey(current);
        const existing = isCurrent
<<<<<<< HEAD
            ? { text: messageRef.current, confirmedMentions: confirmedMentionsRef.current }
            : (targetKey && draftMemoryRef.current.get(targetKey)) || (isBtwPendingComposerKey(target?.sessionId) ? null : persistEnabled ? readChatDraft(target) : null);
        const text = existing?.text && existing.text !== draft ? `${existing.text}\n\n${draft}` : draft;
||||||| bc50ba56aa
            ? { text: messageRef.current, confirmedMentions: confirmedMentionsRef.current }
            : (targetKey && draftMemoryRef.current.get(targetKey))
                || (isBtwPendingComposerKey(target?.sessionId) ? null : readChatDraft(target));
        const text = existing?.text && existing.text !== draft ? `${existing.text}\n\n${draft}` : draft;
=======
            ? { text: text.get(), confirmedMentions: confirmedMentionsRef.current }
            : (targetKey && draftMemoryRef.current.get(targetKey))
                || (isBtwPendingComposerKey(target?.sessionId) ? null : readChatDraft(target));
        const merged = existing?.text && existing.text !== draft ? `${existing.text}\n\n${draft}` : draft;
>>>>>>> upstream/main
        const mentions = new Set([...(existing?.confirmedMentions ?? []), ...confirmedMentions]);
        if (targetKey) draftMemoryRef.current.set(targetKey, { text: merged, confirmedMentions: mentions });
        if (isCurrent) {
            confirmedMentionsRef.current = new Set(mentions);
            setMessage(merged);
        }
<<<<<<< HEAD
        if (persistEnabled && target && !isBtwPendingComposerKey(target.sessionId)) {
            writeChatDraft(target, text, mentions);
            lastPersistedRef.current.set(getChatDraftIdentityKey(target), draftSignature(text, mentions));
||||||| bc50ba56aa
        if (target && !isBtwPendingComposerKey(target.sessionId)) {
            writeChatDraft(target, text, mentions);
            lastPersistedRef.current.set(getChatDraftIdentityKey(target), draftSignature(text, mentions));
=======
        if (target && !isBtwPendingComposerKey(target.sessionId)) {
            writeChatDraft(target, merged, mentions);
            lastPersistedRef.current.set(getChatDraftIdentityKey(target), draftSignature(merged, mentions));
>>>>>>> upstream/main
        }
<<<<<<< HEAD
    }, [confirmedMentionsRef, messageRef, persistEnabled, setMessage]);
||||||| bc50ba56aa
    }, [confirmedMentionsRef, messageRef, setMessage]);
=======
    }, [confirmedMentionsRef, setMessage, text]);
>>>>>>> upstream/main

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
<<<<<<< HEAD
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
||||||| bc50ba56aa
            || (isBtwPendingComposerKey(from?.sessionId)
                ? { text: '', confirmedMentions: new Set<string>() }
                : readChatDraft(from));
        draftMemoryRef.current.set(getChatDraftIdentityKey(to), { text: draft.text, confirmedMentions: new Set(draft.confirmedMentions) });
        writeChatDraft(to, draft.text, draft.confirmedMentions);
        lastPersistedRef.current.set(getChatDraftIdentityKey(to), draftSignature(draft.text, draft.confirmedMentions));
        if (from) draftMemoryRef.current.set(getChatDraftIdentityKey(from), { text: '', confirmedMentions: new Set() });
        if (from && current && getChatDraftIdentityKey(from) === getChatDraftIdentityKey(current)) {
            clearPending();
            skipOutgoingDraftRef.current = true;
            messageRef.current = '';
            confirmedMentionsRef.current = new Set();
            setMessage('');
=======
            || (isBtwPendingComposerKey(from?.sessionId)
                ? { text: '', confirmedMentions: new Set<string>() }
                : readChatDraft(from));
        draftMemoryRef.current.set(getChatDraftIdentityKey(to), { text: draft.text, confirmedMentions: new Set(draft.confirmedMentions) });
        writeChatDraft(to, draft.text, draft.confirmedMentions);
        lastPersistedRef.current.set(getChatDraftIdentityKey(to), draftSignature(draft.text, draft.confirmedMentions));
        if (from) draftMemoryRef.current.set(getChatDraftIdentityKey(from), { text: '', confirmedMentions: new Set() });
        if (from && current && getChatDraftIdentityKey(from) === getChatDraftIdentityKey(current)) {
            clearPending();
            skipOutgoingDraftRef.current = true;
            confirmedMentionsRef.current = new Set();
            setMessage('');
>>>>>>> upstream/main
        }
<<<<<<< HEAD
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
    }, [confirmedMentionsRef, messageRef, persistEnabled]);
||||||| bc50ba56aa
    }, [clearPending, confirmedMentionsRef, messageRef, setMessage]);
=======
    }, [clearPending, confirmedMentionsRef, setMessage, text]);
>>>>>>> upstream/main

    return { persistNow, handoffDraft, restoreDraft, migrateDraft };
}
