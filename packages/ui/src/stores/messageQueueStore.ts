import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { z } from 'zod';
import {
    QueueAppendRequestSchema, type QueueAppendRequest,
    QueueStateSchema, type QueueState,
    type QueueItem,
    QueueReorderRequestSchema, type QueueReorderRequest,
    QueueDeleteRequestSchema, type QueueDeleteRequest,
    type PromptAttachment,
    type PromptContext,
} from '@openchamber/agent-contract';
import { createInputHistoryIdentity, createInputHistorySubmission, useInputHistoryStore } from './useInputHistoryStore';
import { createDeferredSafeJSONStorage } from './utils/safeStorage';
import type { AttachedFile } from './types/sessionTypes';
import { contextPartMetadataSchema, type ContextPartMetadata } from '@/lib/messages/contextParts';
import { updateDesktopSettings } from '@/lib/persistence';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { runtimeFetch, type RuntimeFetchOptions } from '@/lib/runtime-fetch';
import { spaceIdOfDirectory } from '@/lib/spaces/space-route';
import { normalizePath } from '@/lib/pathNormalization';
import { getQueuedMessagePreview } from '@/lib/messages/queuedMessagePreview';
import { compareCounters } from '@/sync/event-reducer';
import { canonicalClient } from '@/api/canonicalClient';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from './useGlobalSessionsStore';

const encodeAttachmentFile = async (file: Blob): Promise<string> => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
};

const admitAttachmentsForQueue = async (
    attachments: readonly AttachedFile[] | undefined,
    target: MessageQueueTarget,
): Promise<PromptAttachment[]> => {
    if (!attachments?.length) return [];
    let workspaceId: string | undefined;
    const admitted: PromptAttachment[] = [];
    for (const attachment of attachments) {
        const uri = attachment.serverPath?.startsWith('attachment://')
            ? attachment.serverPath
            : (attachment.dataUrl?.startsWith('attachment://') ? attachment.dataUrl : undefined);
        const attachmentId = uri ? /^attachment:\/\/([^/?#]+)$/.exec(uri)?.[1] : undefined;
        if (attachmentId && uri) {
            admitted.push({
                attachmentId,
                name: attachment.filename,
                mediaType: attachment.mimeType,
                size: attachment.size,
                uri,
            });
            continue;
        }
        if (!workspaceId) {
            const workspace = await canonicalClient.resolveWorkspace(target.directory);
            workspaceId = workspace.workspaceId;
        }
        const data = await encodeAttachmentFile(attachment.file);
        const uploaded = await canonicalClient.uploadAttachment(
            workspaceId,
            { name: attachment.filename, mediaType: attachment.mimeType, size: attachment.size },
            data,
        );
        admitted.push({
            attachmentId: uploaded.attachmentId,
            name: uploaded.name,
            mediaType: uploaded.mediaType,
            size: uploaded.size,
            uri: uploaded.uri,
        });
    }
    return admitted;
};
export type FollowUpBehavior = 'steer' | 'queue';

const DEFAULT_FOLLOW_UP_BEHAVIOR: FollowUpBehavior = 'queue';

const isFollowUpBehavior = (value: unknown): value is FollowUpBehavior => (
    value === 'steer' || value === 'queue'
);

const normalizeFollowUpBehavior = (
    value: unknown,
    legacyQueueModeEnabled?: boolean | null,
): FollowUpBehavior => {
    if (value === 'immediate') {
        return 'steer';
    }

    if (isFollowUpBehavior(value)) {
        return value;
    }

    if (legacyQueueModeEnabled === false) {
        return 'steer';
    }

    if (legacyQueueModeEnabled === true) {
        return 'queue';
    }

    return DEFAULT_FOLLOW_UP_BEHAVIOR;
};

export interface QueuedMessageSendConfig {
    providerID: string;
    modelID: string;
    agent?: string;
    variant?: string;
    reasoningEffort?: string;
}

export interface QueuedMessageGoal {
    objective?: string;
    tokenBudget: number | null;
}

export type QueuedContextPart =
    | {
        kind: 'context';
        text: string;
        metadata: ContextPartMetadata;
        instructions?: string;
    }
    | {
        kind: 'instruction';
        text: string;
    }
    | {
        kind: 'synthetic';
        text: string;
    };

export interface QueuedMessage {
    id: string;
    content: string;
    text: string;
    agentMention?: string;
    attachments?: AttachedFile[];
    context?: QueuedContextPart[];
    contextPreview?: string;
    createdAt: number;
    sendConfig?: QueuedMessageSendConfig;
    goal?: QueuedMessageGoal;
    scheduledTask?: { projectId: string; taskId: string };
}

interface QueuedMessageInput {
    content: string;
    text?: string;
    agentMention?: string;
    attachments?: AttachedFile[];
    context?: QueuedContextPart[];
    sendConfig?: QueuedMessageSendConfig;
    goal?: QueuedMessageGoal;
}

export type MessageQueueTarget = {
    runtimeKey: string;
    directory: string;
    sessionId: string;
};

const MAX_QUEUE_TARGETS = 50;
const MAX_MESSAGES_PER_QUEUE = 20;

const sessionDirectoryMap = new Map<string, string>();

export const createMessageQueueTarget = (
    sessionId: string,
    directory: string | null | undefined,
    runtimeKey: string = getRuntimeKey(),
): MessageQueueTarget | null => {
    const normalizedDirectory = normalizePath(directory);
    if (!runtimeKey || !normalizedDirectory || !sessionId) return null;
    sessionDirectoryMap.set(JSON.stringify([runtimeKey, sessionId]), normalizedDirectory);
    return { runtimeKey, directory: normalizedDirectory, sessionId };
};

export const getMessageQueueKey = (target: MessageQueueTarget): string =>
    `${target.runtimeKey}\n${target.directory}\n${target.sessionId}`;

export const parseMessageQueueKey = (key: string): MessageQueueTarget | null => {
    const [runtimeKey, directory, ...sessionParts] = key.split('\n');
    return createMessageQueueTarget(sessionParts.join('\n'), directory, runtimeKey);
};



const serverSnapshotSchema = z.object({
    revision: z.union([z.number(), z.string()]).optional(),
    items: z.array(QueueStateSchema).optional(),
    errors: z.array(z.unknown()).optional(),
});

const toQueuedMessage = (item: QueueItem): QueuedMessage => {
    const message: QueuedMessage = {
        id: item.queueItemId,
        content: item.content,
        text: item.text,
        createdAt: item.createdAt,
    };
    if (item.options?.providerId && item.options?.modelId) {
        message.sendConfig = {
            providerID: item.options.providerId,
            modelID: item.options.modelId,
            agent: item.options.agentId ?? undefined,
            variant: item.options.variant ?? undefined,
            reasoningEffort: item.options.reasoningEffort ?? undefined,
        };
    }
    if (item.agentMention?.agentId) {
        message.agentMention = item.agentMention.agentId;
    }
    if (item.contextPreview) {
        message.contextPreview = item.contextPreview;
    }
    if (item.attachments && item.attachments.length > 0) {
        message.attachments = item.attachments.map((att) => ({
            id: att.attachmentId,
            filename: att.name,
            name: att.name,
            mimeType: att.mediaType,
            mediaType: att.mediaType,
            size: att.size,
            source: 'server',
            serverPath: att.uri,
            dataUrl: att.uri,
            file: new File([], att.name, { type: att.mediaType }),
        }));
    }
    return message;
};

type QueueRequestBody =
    | QueueAppendRequest
    | QueueReorderRequest
    | QueueDeleteRequest
    | { held: boolean; ttlMs?: number };
const requestJson = async <T,>(schema: z.ZodType<T>, path: string, init?: RuntimeFetchOptions): Promise<T> => {
    const response = await runtimeFetch(path, init);
    if (!response.ok) {
        const error: Error & { status?: number } = new Error(`Message queue request failed (${response.status})`);
        error.status = response.status;
        throw error;
    }
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new Error('Invalid message queue response');
    return parsed.data;
};

const jsonInit = (method: string, body?: QueueRequestBody): RequestInit => {
    if (body === undefined) return { method };
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
};

const sessionPath = (sessionId: string) => `/api/message-queue/sessions/${encodeURIComponent(sessionId)}`;

const queueOwnerOf = (directory: string): string => spaceIdOfDirectory(directory) ?? '';
const toOwner = (target: MessageQueueTarget, init: RequestInit): RuntimeFetchOptions => ({ ...init, directory: target.directory });

type OwnerQueueSnapshot = z.infer<typeof serverSnapshotSchema> & { readRevisions: ReadonlyMap<string, string> };
const readOwnerSnapshot = async (owner: string, signal?: AbortSignal): Promise<OwnerQueueSnapshot> => {
    const readRevisions = new Map(appliedRevisions);
    const snapshot = await requestJson(serverSnapshotSchema, '/api/message-queue', { directory: owner ? `/spaces/${owner}` : null, signal });
    return { ...snapshot, readRevisions };
};

const serverOwnedRuntimeKeys = new Set<string>();
type LegacyQueueMigration = {
    items: Array<{ target: MessageQueueTarget; message: QueuedMessage }>;
    pending: Promise<void> | null;
};
const legacyMigrations = new Map<string, LegacyQueueMigration>();

/** Server revision last applied per queue key; older snapshots are ignored. */
const appliedRevisions = new Map<string, string>();
let hydrationGeneration = 0;

interface MessageQueueState {
    queuedMessages: Record<string, QueuedMessage[]>;
    quarantinedLegacyMessages: Record<string, QueuedMessage[]>;
    followUpBehavior: FollowUpBehavior;
    sendingIds: Record<string, string[]>;
}

interface MessageQueueActions {
    addToQueue: (target: MessageQueueTarget, message: QueuedMessageInput) => Promise<void>;
    removeFromQueue: (target: MessageQueueTarget, messageId: string) => void;
    reorderQueue: (target: MessageQueueTarget, fromId: string, toId: string) => void;
    popToInput: (target: MessageQueueTarget, messageId: string) => Promise<QueuedMessage | null>;
    takeForSend: (target: MessageQueueTarget, messageId?: string) => Promise<QueuedMessage[]>;
    clearQueue: (target: MessageQueueTarget) => void;
    forgetQueue: (target: MessageQueueTarget) => void;
    clearAllQueues: () => void;
    markSending: (target: MessageQueueTarget, messageId: string) => void;
    clearSending: (target: MessageQueueTarget, messageId: string) => void;
    getSendableQueue: (target: MessageQueueTarget) => QueuedMessage[];
    locateQueuedMessage: (target: MessageQueueTarget, messageId: string) => MessageQueueTarget;
    setFollowUpBehavior: (behavior: FollowUpBehavior) => void;
    getQueueForTarget: (target: MessageQueueTarget) => QueuedMessage[];
    hydrate: () => Promise<void>;
    resync: () => Promise<void>;
    refreshSpaceQueue: (spaceId: string) => Promise<void>;
    /**
     * Server-owned queue: apply one session's authoritative state (broadcast or response) from its
     * owner, the host ('') or a space; a session the owner may not speak for is ignored.
     */
    applyServerSession: (session: QueueState, revision?: number | string, expectedRuntimeKey?: string, owner?: string) => void;
    /** Server-owned queue: tell the server that owns the session's queue to hold or release its delivery. */
    setServerHold: (sessionId: string, directory: string, held: boolean) => Promise<void>;
    resetForRuntimeSwitch: (previousRuntimeKey: string | null | undefined) => void;
}

type MessageQueueStore = MessageQueueState & MessageQueueActions;

type PersistedQueuedMessage = Omit<QueuedMessage, 'text'> & { text?: string };

type PersistedMessageQueueState = {
    queuedMessages?: Record<string, PersistedQueuedMessage[]>;
    quarantinedLegacyMessages?: Record<string, PersistedQueuedMessage[]>;
    followUpBehavior?: FollowUpBehavior;
    queueModeEnabled?: boolean;
};

const withDeliveryText = (queues: Record<string, PersistedQueuedMessage[]>): Record<string, QueuedMessage[]> => (
    Object.fromEntries(Object.entries(queues).map(([key, queue]) => [
        key,
        queue.map((message) => ({ ...message, text: message.text ?? message.content })),
    ]))
);

export const migrateMessageQueueState = (persistedState: unknown, version: number): Partial<MessageQueueStore> => {
    const state = (persistedState ?? {}) as PersistedMessageQueueState;
    const legacyQueues = version < 2 ? (state.queuedMessages ?? {}) : {};
    return {
        queuedMessages: version < 2 ? {} : withDeliveryText(state.queuedMessages ?? {}),
        quarantinedLegacyMessages: withDeliveryText({
            ...(state.quarantinedLegacyMessages ?? {}),
            ...legacyQueues,
        }),
        followUpBehavior: normalizeFollowUpBehavior(state.followUpBehavior, state.queueModeEnabled ?? null),
    };
};

const withoutKey = <T,>(record: Record<string, T>, key: string): Record<string, T> => {
    const { [key]: _removed, ...rest } = record;
    void _removed;
    return rest;
};

const removeMessageLocally = (
    state: Pick<MessageQueueState, 'queuedMessages'>,
    key: string,
    messageId: string,
): Pick<MessageQueueState, 'queuedMessages'> => {
    const newQueue = (state.queuedMessages[key] ?? []).filter((m) => m.id !== messageId);
    if (newQueue.length === 0) return { queuedMessages: withoutKey(state.queuedMessages, key) };
    return { queuedMessages: { ...state.queuedMessages, [key]: newQueue } };
};

const findDirectoryForSession = (sessionId: string, state: Pick<MessageQueueState, 'queuedMessages' | 'sendingIds'>, runtimeKey = getRuntimeKey()): string => {
    const session = useGlobalSessionsStore.getState().entityById.get(sessionId);
    const directory = session && runtimeKey === getRuntimeKey() ? resolveGlobalSessionDirectory(session) : null;
    if (directory) return directory;
    for (const key of Object.keys(state.queuedMessages)) {
        const parsed = parseMessageQueueKey(key);
        if (parsed?.runtimeKey === runtimeKey && parsed.sessionId === sessionId && parsed.directory) return parsed.directory;
    }
    for (const key of Object.keys(state.sendingIds)) {
        const parsed = parseMessageQueueKey(key);
        if (parsed?.runtimeKey === runtimeKey && parsed.sessionId === sessionId && parsed.directory) return parsed.directory;
    }
    const known = sessionDirectoryMap.get(JSON.stringify([runtimeKey, sessionId]));
    if (known) return known;
    return '';
};

/** Every projection of one session in this runtime, whatever directory it was keyed under. */
const clearSessionProjection = (
    state: Pick<MessageQueueState, 'queuedMessages' | 'sendingIds'>,
    runtimeKey: string,
    sessionId: string,
    revision: string,
): Pick<MessageQueueState, 'queuedMessages' | 'sendingIds'> => {
    let queuedMessages = state.queuedMessages;
    let sendingIds = state.sendingIds;
    for (const key of new Set([...Object.keys(queuedMessages), ...Object.keys(sendingIds)])) {
        const parsed = parseMessageQueueKey(key);
        if (parsed?.runtimeKey !== runtimeKey || parsed.sessionId !== sessionId) continue;
        const currentRev = appliedRevisions.get(key);
        if (currentRev && compareCounters(currentRev, revision) > 0) continue;
        appliedRevisions.set(key, revision);
        queuedMessages = withoutKey(queuedMessages, key);
        sendingIds = withoutKey(sendingIds, key);
    }
    return { queuedMessages, sendingIds };
};



export const useMessageQueueStore = create<MessageQueueStore>()(
    devtools(
        persist(
            (set, get) => {
                let hydration: { runtimeKey: string; promise: Promise<void> } | null = null;
                let resyncRequested = false;
                const applyServerSession = (
                    queueState: QueueState,
                    _revisionInput?: number | string,
                    expectedRuntimeKey = getRuntimeKey(),
                    owner = '',
                ) => {
                    if (expectedRuntimeKey !== getRuntimeKey()) return;
                    const directory = findDirectoryForSession(queueState.sessionId, get(), expectedRuntimeKey);
                    if (queueOwnerOf(directory) !== owner) return;

                    const revision = queueState.revision;
                    const target = createMessageQueueTarget(queueState.sessionId, directory, expectedRuntimeKey);
                    if (!target) {
                        if (queueState.items.length > 0) return;
                        set((state) => clearSessionProjection(state, expectedRuntimeKey, queueState.sessionId, revision));
                        return;
                    }
                    const key = getMessageQueueKey(target);
                    const currentRev = appliedRevisions.get(key);
                    if (currentRev && compareCounters(currentRev, revision) > 0) return;
                    appliedRevisions.set(key, revision);
                    set((state) => {
                        const retained = clearSessionProjection(state, expectedRuntimeKey, queueState.sessionId, revision);
                        const queue = queueState.items.map(toQueuedMessage);
                        const queuedMessages = queue.length > 0
                            ? { ...retained.queuedMessages, [key]: queue }
                            : retained.queuedMessages;
                        const leased = queueState.items.filter((item) => item.status === 'leased');
                        const sendingIds = leased.length > 0
                            ? { ...retained.sendingIds, [key]: leased.map((item) => item.queueItemId) }
                            : retained.sendingIds;
                        return { queuedMessages, sendingIds };
                    });
                };

                const refreshSession = async (target: MessageQueueTarget) => {
                    const owner = queueOwnerOf(target.directory);
                    try {
                        const snapshot = await readOwnerSnapshot(owner);
                        const queue = snapshot.items?.find((entry) => entry.sessionId === target.sessionId);
                        if (queue) {
                            applyServerSession(queue, queue.revision, target.runtimeKey, owner);
                        } else if (!snapshot.errors?.length) {
                            const currentRev = appliedRevisions.get(getMessageQueueKey(target)) ?? '0';
                            applyServerSession({ sessionId: target.sessionId, revision: currentRev, items: [] }, currentRev, target.runtimeKey, owner);
                        }
                    } catch {
                        // Offline: keep the optimistic projection; the next broadcast or hydration corrects it.
                    }
                };

                const serverMutation = async (
                    target: MessageQueueTarget,
                    path: string,
                    init: RequestInit,
                ) => {
                    try {
                        const result = await requestJson(QueueStateSchema, path, toOwner(target, init));
                        applyServerSession(result, result.revision, target.runtimeKey, queueOwnerOf(target.directory));
                    } catch (error) {
                        console.warn('[queue] server update failed:', error);
                        await refreshSession(target);
                    }
                };

                const applyOwnerSnapshot = (snapshot: OwnerQueueSnapshot, runtimeKey: string, owner: string): boolean => {
                    const items = snapshot.items ?? [];
                    set((state) => {
                        const isOwned = (key: string) => {
                            const parsed = parseMessageQueueKey(key);
                            return parsed?.runtimeKey === runtimeKey && queueOwnerOf(parsed.directory) === owner;
                        };
                        const keep = (key: string) => !isOwned(key)
                            || Boolean(snapshot.errors?.length)
                            || appliedRevisions.get(key) !== snapshot.readRevisions.get(key);
                        const queuedMessages: Record<string, QueuedMessage[]> = {};
                        const sendingIds: Record<string, string[]> = {};
                        for (const [key, queue] of Object.entries(state.queuedMessages)) {
                            if (keep(key)) queuedMessages[key] = queue;
                        }
                        for (const [key, ids] of Object.entries(state.sendingIds)) {
                            if (keep(key)) sendingIds[key] = ids;
                        }
                        for (const queue of items) {
                            const directory = findDirectoryForSession(queue.sessionId, state, runtimeKey);
                            if (queueOwnerOf(directory) !== owner) continue;
                            const target = createMessageQueueTarget(queue.sessionId, directory, runtimeKey);
                            if (!target) continue;
                            const key = getMessageQueueKey(target);
                            const currentRevision = appliedRevisions.get(key);
                            if (currentRevision && compareCounters(currentRevision, queue.revision) > 0) {
                                if (state.queuedMessages[key]) queuedMessages[key] = state.queuedMessages[key];
                                if (state.sendingIds[key]) sendingIds[key] = state.sendingIds[key];
                                continue;
                            }
                            appliedRevisions.set(key, queue.revision);
                            if (queue.items.length > 0) queuedMessages[key] = queue.items.map(toQueuedMessage);
                            else delete queuedMessages[key];
                            const leased = queue.items.filter((item) => item.status === 'leased');
                            if (leased.length > 0) sendingIds[key] = leased.map((item) => item.queueItemId);
                            else delete sendingIds[key];
                        }
                        return { queuedMessages, sendingIds };
                    });
                    return true;
                };
                return {
                    queuedMessages: {},
                    quarantinedLegacyMessages: {},
                    followUpBehavior: DEFAULT_FOLLOW_UP_BEHAVIOR,
                    sendingIds: {},

                    addToQueue: async (target, message) => {
                        if (!message.sendConfig?.providerID || !message.sendConfig?.modelID) {
                            throw new Error('A queued message needs a provider and model to be delivered later.');
                        }
                        const key = getMessageQueueKey(target);
                        const id = `queued-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                        const queuedMessage: QueuedMessage = {
                            id,
                            content: message.content,
                            text: message.text ?? message.content,
                            createdAt: Date.now(),
                            sendConfig: message.sendConfig,
                        };
                        if (message.agentMention) queuedMessage.agentMention = message.agentMention;
                        if (message.attachments && message.attachments.length > 0) queuedMessage.attachments = message.attachments;
                        if (message.context && message.context.length > 0) queuedMessage.context = message.context;
                        if (message.goal) queuedMessage.goal = message.goal;

                        set((state) => {
                            const currentQueue = state.queuedMessages[key] ?? [];
                            const queuedMessages = {
                                ...state.queuedMessages,
                                [key]: [...currentQueue, queuedMessage].slice(-MAX_MESSAGES_PER_QUEUE),
                            };
                            const keys = Object.keys(queuedMessages);
                            if (keys.length > MAX_QUEUE_TARGETS) {
                                keys.sort((left, right) => (
                                    (queuedMessages[left]?.[0]?.createdAt ?? 0) - (queuedMessages[right]?.[0]?.createdAt ?? 0)
                                ));
                                for (const staleKey of keys.slice(0, keys.length - MAX_QUEUE_TARGETS)) delete queuedMessages[staleKey];
                            }
                            return { queuedMessages };
                        });
                        let promptAttachments: PromptAttachment[] = [];
                        try {
                            if (message.attachments && message.attachments.length > 0) {
                                promptAttachments = await admitAttachmentsForQueue(message.attachments, target);
                            }
                        } catch (error) {
                            set((state) => removeMessageLocally(state, key, id));
                            throw error;
                        }

                        const historyIdentity = createInputHistoryIdentity(target.runtimeKey, target.directory, target.sessionId);
                        const historySubmission = createInputHistorySubmission(message.content, message.attachments ?? []);

                        const promptContext: PromptContext[] = (message.context ?? []).map((ctx) => {
                            if (ctx.kind === 'instruction') return { kind: 'instruction', text: ctx.text };
                            if (ctx.kind === 'synthetic') return { kind: 'synthetic', text: ctx.text };
                            return {
                                kind: 'context',
                                text: ctx.text,
                                metadata: contextPartMetadataSchema.safeParse(ctx.metadata).success ? ctx.metadata : ctx.metadata,
                                ...(ctx.instructions ? { instructions: ctx.instructions } : {}),
                            };
                        });

                        const contextPreview = getQueuedMessagePreview({ content: '', context: message.context });
                        const currentRevision = appliedRevisions.get(key) ?? '0';

                        const appendRequest: QueueAppendRequest = QueueAppendRequestSchema.parse({
                            expectedRevision: currentRevision,
                            content: message.content,
                            ...(contextPreview ? { contextPreview } : {}),
                            request: {
                                input: {
                                    text: message.text ?? message.content,
                                    attachments: promptAttachments,
                                    context: promptContext,
                                    ...(message.agentMention ? { agentMention: { agentId: message.agentMention } } : {}),
                                },
                                options: {
                                    providerId: message.sendConfig.providerID,
                                    modelId: message.sendConfig.modelID,
                                    agentId: message.sendConfig.agent ?? null,
                                    variant: message.sendConfig.variant ?? null,
                                    reasoningEffort: message.sendConfig.reasoningEffort ?? null,
                                },
                            },
                        });

                        try {
                            const queueState = await requestJson(
                                QueueStateSchema,
                                `${sessionPath(target.sessionId)}/items`,
                                toOwner(target, jsonInit('POST', appendRequest)),
                            );
                            set((state) => removeMessageLocally(state, key, id));
                            applyServerSession(queueState, queueState.revision, target.runtimeKey, queueOwnerOf(target.directory));
                            if (historyIdentity) {
                                useInputHistoryStore.getState().appendSubmissions(historyIdentity, [historySubmission]);
                            }
                        } catch (error) {
                            set((state) => removeMessageLocally(state, key, id));
                            if (error && typeof error === 'object' && (('status' in error && error.status === 409) || ('problem' in error && typeof error.problem === 'object' && error.problem && 'status' in error.problem && error.problem.status === 409))) {
                                await refreshSession(target);
                            }
                            throw error;
                        }
                    },

                    removeFromQueue: (target, messageId) => {
                        const key = getMessageQueueKey(target);
                        set((state) => removeMessageLocally(state, key, messageId));
                        const deleteRequest: QueueDeleteRequest = QueueDeleteRequestSchema.parse({
                            expectedRevision: appliedRevisions.get(key) ?? '0',
                            queueItemId: messageId,
                        });
                        void serverMutation(target, `${sessionPath(target.sessionId)}/items/${encodeURIComponent(messageId)}`, jsonInit('DELETE', deleteRequest));
                    },

                    reorderQueue: (target, fromId, toId) => {
                        if (fromId === toId) return;
                        const key = getMessageQueueKey(target);
                        const currentQueue = get().queuedMessages[key];
                        if (!currentQueue) return;
                        const fromIndex = currentQueue.findIndex((m) => m.id === fromId);
                        const toIndex = currentQueue.findIndex((m) => m.id === toId);
                        if (fromIndex === -1 || toIndex === -1) return;

                        const newQueue = currentQueue.slice();
                        const [moved] = newQueue.splice(fromIndex, 1);
                        newQueue.splice(toIndex, 0, moved);

                        set((state) => ({
                            queuedMessages: {
                                ...state.queuedMessages,
                                [key]: newQueue,
                            },
                        }));
                        const itemIds = newQueue.map((message) => message.id);
                        const reorderRequest: QueueReorderRequest = QueueReorderRequestSchema.parse({
                            expectedRevision: appliedRevisions.get(key) ?? '0',
                            queueItemIds: itemIds,
                        });
                        void serverMutation(target, `${sessionPath(target.sessionId)}/order`, jsonInit('PUT', reorderRequest));
                    },

                    popToInput: async (target, messageId) => {
                        const [message] = await get().takeForSend(target, messageId);
                        return message ?? null;
                    },

                    takeForSend: async () => {
                        throw new Error('Queued message restoration is unavailable; the Host owns delivery.');
                    },

                    clearQueue: (target) => {
                        const key = getMessageQueueKey(target);
                        const currentQueue = get().queuedMessages[key] ?? [];
                        const sending = new Set(get().sendingIds[key] ?? []);
                        for (const msg of currentQueue) {
                            if (!sending.has(msg.id)) {
                                get().removeFromQueue(target, msg.id);
                            }
                        }
                    },

                    forgetQueue: (target) => {
                        const key = getMessageQueueKey(target);
                        appliedRevisions.delete(key);
                        set((state) => ({
                            queuedMessages: withoutKey(state.queuedMessages, key),
                            sendingIds: withoutKey(state.sendingIds, key),
                        }));
                    },

                    clearAllQueues: () => {
                        set({ queuedMessages: {}, sendingIds: {} });
                    },

                    markSending: (target, messageId) => {
                        const key = getMessageQueueKey(target);
                        set((state) => {
                            const current = state.sendingIds[key] ?? [];
                            if (current.includes(messageId)) return state;
                            return { sendingIds: { ...state.sendingIds, [key]: [...current, messageId] } };
                        });
                    },

                    clearSending: (target, messageId) => {
                        const key = getMessageQueueKey(target);
                        set((state) => {
                            const current = state.sendingIds[key];
                            if (!current || !current.includes(messageId)) return state;
                            const next = current.filter((id) => id !== messageId);
                            if (next.length === 0) return { sendingIds: withoutKey(state.sendingIds, key) };
                            return { sendingIds: { ...state.sendingIds, [key]: next } };
                        });
                    },

                    getSendableQueue: (target) => {
                        const key = getMessageQueueKey(target);
                        const state = get();
                        const queue = state.queuedMessages[key] ?? [];
                        const sending = state.sendingIds[key];
                        if (!sending || sending.length === 0) return queue;
                        return queue.filter((message) => !sending.includes(message.id));
                    },

                    locateQueuedMessage: (target, messageId) => {
                        const { queuedMessages, sendingIds } = get();
                        for (const key of new Set([...Object.keys(queuedMessages), ...Object.keys(sendingIds)])) {
                            const parsed = parseMessageQueueKey(key);
                            if (parsed?.runtimeKey !== target.runtimeKey || parsed.sessionId !== target.sessionId) continue;
                            if (queuedMessages[key]?.some((message) => message.id === messageId) || sendingIds[key]?.includes(messageId)) return parsed;
                        }
                        return target;
                    },

                    setFollowUpBehavior: (behavior) => {
                        set({ followUpBehavior: behavior });
                        void updateDesktopSettings({ followUpBehavior: behavior });
                    },

                    getQueueForTarget: (target) => {
                        return get().queuedMessages[getMessageQueueKey(target)] ?? [];
                    },

                    hydrate: () => {
                        const runtimeKey = getRuntimeKey();
                        if (hydration?.runtimeKey === runtimeKey) return hydration.promise;
                        const generation = ++hydrationGeneration;
                        const isCurrent = () => generation === hydrationGeneration && runtimeKey === getRuntimeKey();
                        const promise = (async () => {
                            let migration = legacyMigrations.get(runtimeKey);
                            if (!migration) {
                                const items = Object.entries(get().queuedMessages).flatMap(([key, queue]) => {
                                    const target = parseMessageQueueKey(key);
                                    if (!target || target.runtimeKey !== runtimeKey) return [];
                                    return queue.map((message) => ({ target, message }));
                                });
                                migration = { items, pending: null };
                                legacyMigrations.set(runtimeKey, migration);
                            }
                            while (migration.pending || migration.items.length > 0) {
                                if (!isCurrent()) return;
                                if (migration.pending) {
                                    await migration.pending;
                                    continue;
                                }
                                const next = migration.items.shift();
                                if (!next?.message.sendConfig) continue;
                                const { target, message } = next;
                                const upload = get().addToQueue(target, message).catch((error) => {
                                    console.warn('[queue] failed to migrate a locally queued message to the server:', error);
                                });
                                migration.pending = upload;
                                const owner = migration;
                                void upload.then(() => { if (owner.pending === upload) owner.pending = null; });
                                await upload;
                            }
                            if (!isCurrent()) return;

                            do {
                                resyncRequested = false;
                                let snapshot: OwnerQueueSnapshot;
                                try {
                                    snapshot = await readOwnerSnapshot('', AbortSignal.timeout(15_000));
                                } catch (error) {
                                    if (!isCurrent()) return;
                                    if (resyncRequested) continue;
                                    throw error;
                                }
                                if (!isCurrent()) return;
                                serverOwnedRuntimeKeys.add(runtimeKey);
                                if (!applyOwnerSnapshot(snapshot, runtimeKey, '')) continue;
                            } while (resyncRequested && isCurrent());
                        })();
                        const run = { runtimeKey, promise };
                        hydration = run;
                        const release = () => { if (hydration === run) hydration = null; };
                        void promise.then(release, release);
                        return promise;
                    },

                    resync: () => {
                        if (hydration?.runtimeKey === getRuntimeKey()) resyncRequested = true;
                        return get().hydrate();
                    },

                    refreshSpaceQueue: async (spaceId) => {
                        const runtimeKey = getRuntimeKey();
                        let snapshot: OwnerQueueSnapshot;
                        try {
                            snapshot = await readOwnerSnapshot(spaceId, AbortSignal.timeout(15_000));
                        } catch {
                            return;
                        }
                        if (runtimeKey !== getRuntimeKey()) return;
                        serverOwnedRuntimeKeys.add(runtimeKey);
                        applyOwnerSnapshot(snapshot, runtimeKey, spaceId);
                    },

                    applyServerSession,

                    setServerHold: async (sessionId, directory, held) => {
                        const response = await runtimeFetch(`${sessionPath(sessionId)}/hold`, { ...jsonInit('PUT', { held }), directory });
                        if (!response.ok) throw new Error(`Message queue hold request failed (${response.status})`);
                    },

                    resetForRuntimeSwitch: (previousRuntimeKey) => {
                        hydrationGeneration += 1;
                        hydration = null;
                        resyncRequested = false;
                        if (previousRuntimeKey) {
                            for (const key of appliedRevisions.keys()) {
                                if (parseMessageQueueKey(key)?.runtimeKey === previousRuntimeKey) appliedRevisions.delete(key);
                            }
                        }
                        if (!previousRuntimeKey || !serverOwnedRuntimeKeys.has(previousRuntimeKey)) return;
                        set((state) => {
                            const queuedMessages: Record<string, QueuedMessage[]> = {};
                            const sendingIds: Record<string, string[]> = {};
                            for (const [key, queue] of Object.entries(state.queuedMessages)) {
                                if (parseMessageQueueKey(key)?.runtimeKey === previousRuntimeKey) appliedRevisions.delete(key);
                                else queuedMessages[key] = queue;
                            }
                            for (const [key, ids] of Object.entries(state.sendingIds)) {
                                if (parseMessageQueueKey(key)?.runtimeKey !== previousRuntimeKey) sendingIds[key] = ids;
                            }
                            return { queuedMessages, sendingIds };
                        });
                    },
                };
            },
            {
                name: 'message-queue-store',
                version: 3,
                storage: createDeferredSafeJSONStorage(),
                partialize: (state) => ({
                    queuedMessages: Object.fromEntries(
                        Object.entries(state.queuedMessages).filter(([key]) => {
                            const runtimeKey = parseMessageQueueKey(key)?.runtimeKey;
                            return !runtimeKey || !serverOwnedRuntimeKeys.has(runtimeKey);
                        }),
                    ),
                    quarantinedLegacyMessages: state.quarantinedLegacyMessages,
                    followUpBehavior: state.followUpBehavior,
                }),
                migrate: migrateMessageQueueState,
            }
        ),
        {
            name: 'message-queue-store',
        }
    )
);

export const messageQueueUpdatedEventSchema = z.object({
    type: z.literal('openchamber:message-queue.updated'),
    properties: z.object({
        sessionId: z.string().optional(),
        queue: QueueStateSchema,
        revision: z.union([z.number(), z.string()]).optional(),
        spaceId: z.string().optional(),
    }),
});

export type MessageQueueUpdatedEvent = z.infer<typeof messageQueueUpdatedEventSchema>;

export const applyMessageQueueUpdatedEvent = (payload: MessageQueueUpdatedEvent, expectedRuntimeKey: string): void => {
    const parsed = messageQueueUpdatedEventSchema.safeParse(payload);
    if (!parsed.success) return;
    const { queue, spaceId } = parsed.data.properties;
    useMessageQueueStore.getState().applyServerSession(queue, queue.revision, expectedRuntimeKey, spaceId ?? '');
};
