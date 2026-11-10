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
    // "immediate" was removed: on a busy session it was wire-identical to
    // "steer" (OpenCode only supports delivery "steer" | "queue", defaulting
    // to "steer"), so collapse any persisted/legacy "immediate" onto "steer".
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

/**
 * "Run as goal" captured with a queued message: the goal starts when this
 * message is delivered, never with whichever message happens to go out first.
 * `objective` is present only when the arming flow supplied one (the plan
 * flow); otherwise the delivered text is the objective.
 */
export interface QueuedMessageGoal {
    objective?: string;
    tokenBudget: number | null;
}

/**
 * Context captured with a queued message: whatever the composer had attached
 * when the message was queued. It leaves the composer with the message, so
 * delivery (by the server, or by the auto-send hook in VS Code) carries it and
 * editing the message brings it back.
 */
export type QueuedContextPart =
    | {
        /** An attached context item: a draft chip or a linked issue/PR. Restored on edit. */
        kind: 'context';
        text: string;
        metadata: ContextPartMetadata;
        /**
         * Delivered as its own synthetic part right before this one. Nothing writes it any
         * more (attached PRs no longer carry review instructions); messages queued before
         * that still do, and are delivered as they were captured.
         */
        instructions?: string;
    }
    | {
        /** Derived from the message text (the skill instruction); re-derived when the text is sent again, so never restored. */
        kind: 'instruction';
        text: string;
    }
    | {
        /** Handed to the composer by another surface (conflict resolution); restored as pending on edit. */
        kind: 'synthetic';
        text: string;
    };

export interface QueuedMessage {
    id: string;
    /** What the user typed, for display and editing. */
    content: string;
    /** What is delivered: `content` without its leading agent mention, file mentions already resolved. */
    text: string;
    /** Agent mentioned at the start of `content`, delivered as an agent part. */
    agentMention?: string;
    attachments?: AttachedFile[];
    /** Absent on a server projection item; a take brings it back. */
    context?: QueuedContextPart[];
    /** Bounded display-only context summary retained in server projections. */
    contextPreview?: string;
    createdAt: number;
    /** Send config captured at queue time — used as-is when auto-sending */
    sendConfig?: QueuedMessageSendConfig;
    goal?: QueuedMessageGoal;
    scheduledTask?: { projectId: string; taskId: string };
}

interface QueuedMessageInput {
    content: string;
    /** Defaults to `content`. */
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
    sessionDirectoryMap.set(sessionId, normalizedDirectory);
    return { runtimeKey, directory: normalizedDirectory, sessionId };
};

export const getMessageQueueKey = (target: MessageQueueTarget): string =>
    `${target.runtimeKey}\n${target.directory}\n${target.sessionId}`;

export const parseMessageQueueKey = (key: string): MessageQueueTarget | null => {
    const [runtimeKey, directory, ...sessionParts] = key.split('\n');
    return createMessageQueueTarget(sessionParts.join('\n'), directory, runtimeKey);
};

// ---------------------------------------------------------------------------
// Server contract (packages/web/server/lib/message-queue)
// ---------------------------------------------------------------------------

<<<<<<< HEAD
=======
const serverSendConfigSchema = z.object({
    providerID: z.string().min(1),
    modelID: z.string().min(1),
    agent: z.string().optional(),
    variant: z.string().optional(),
});

const serverGoalSchema = z.object({
    objective: z.string().min(1).optional(),
    tokenBudget: z.number().int().positive().nullable(),
});

const serverAttachmentSchema = z.object({
    id: z.string(),
    filename: z.string(),
    mimeType: z.string(),
    size: z.number(),
    source: z.enum(['local', 'server', 'vscode']),
    serverPath: z.string().optional(),
    /** The file's on-disk path, when the runtime resolved one; the model is handed it as the file identity. */
    agentPath: z.string().optional(),
    /** Present only on a taken item; broadcasts and snapshots omit payloads. */
    dataUrl: z.string().optional(),
});

const serverContextPartSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('context'),
        text: z.string(),
        metadata: contextPartMetadataSchema,
        instructions: z.string().optional(),
    }),
    z.object({ kind: z.literal('instruction'), text: z.string() }),
    z.object({ kind: z.literal('synthetic'), text: z.string() }),
]);

const serverItemBaseSchema = z.object({
    id: z.string().min(1),
    createdAt: z.number(),
    content: z.string(),
    text: z.string(),
    agentMention: z.string().optional(),
    attachments: z.array(serverAttachmentSchema),
    /** Present only on a taken item; broadcasts and snapshots omit it like attachment payloads. */
    context: z.array(serverContextPartSchema).optional(),
    contextPreview: z.string().optional(),
    sendConfig: serverSendConfigSchema,
    goal: serverGoalSchema.optional(),
});

const scheduledTaskSchema = z.object({
    projectId: z.string().min(1), taskId: z.string().min(1),
});
const serverItemSchema = z.union([
    serverItemBaseSchema.extend({ scheduledTask: scheduledTaskSchema, sendConfig: serverSendConfigSchema.partial() }),
    serverItemBaseSchema,
]);

const serverSessionSchema = z.object({
    sessionId: z.string().min(1),
    directory: z.string(),
    items: z.array(serverItemSchema),
    sendingId: z.string().nullable(),
});
>>>>>>> bc50ba56a

const serverSnapshotSchema = z.object({
    revision: z.union([z.number(), z.string()]).optional(),
    items: z.array(QueueStateSchema).optional(),
    errors: z.array(z.unknown()).optional(),
});

<<<<<<< HEAD
const toQueuedMessage = (item: QueueItem): QueuedMessage => {
=======
const serverSessionResponseSchema = z.object({
    revision: z.number(),
    session: serverSessionSchema,
});

const serverTakeResponseSchema = serverSessionResponseSchema.extend({ item: serverItemSchema });
const serverTakeAllResponseSchema = serverSessionResponseSchema.extend({ items: z.array(serverItemSchema) });

type ServerQueueSession = z.infer<typeof serverSessionSchema>;
type ServerQueueItem = z.infer<typeof serverItemSchema>;
type ServerQueueAttachment = z.infer<typeof serverAttachmentSchema>;

const decodeDataUrl = (dataUrl: string): ArrayBuffer | null => {
    const commaIndex = dataUrl.indexOf(',');
    if (!dataUrl.startsWith('data:') || commaIndex === -1) return null;
    const meta = dataUrl.slice(5, commaIndex);
    const payload = dataUrl.slice(commaIndex + 1);
    try {
        if (meta.endsWith(';base64')) {
            const binary = atob(payload);
            const buffer = new ArrayBuffer(binary.length);
            const bytes = new Uint8Array(buffer);
            for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
            return buffer;
        }
        const encoded = new TextEncoder().encode(decodeURIComponent(payload));
        const buffer = new ArrayBuffer(encoded.byteLength);
        new Uint8Array(buffer).set(encoded);
        return buffer;
    } catch {
        return null;
    }
};

/** A taken item carries its payload; a projection item has an empty file. */
const toAttachedFile = (attachment: ServerQueueAttachment): AttachedFile => {
    const dataUrl = attachment.dataUrl ?? '';
    const bytes = dataUrl ? decodeDataUrl(dataUrl) : null;
    const file: AttachedFile = {
        id: attachment.id,
        file: new File(bytes ? [bytes] : [], attachment.filename, { type: attachment.mimeType }),
        dataUrl,
        mimeType: attachment.mimeType,
        filename: attachment.filename,
        size: attachment.size,
        source: attachment.source,
    };
    if (attachment.serverPath) file.serverPath = attachment.serverPath;
    if (attachment.agentPath) file.agentPath = attachment.agentPath;
    return file;
};

const toQueuedMessage = (item: ServerQueueItem): QueuedMessage => {
>>>>>>> bc50ba56a
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

<<<<<<< HEAD
type QueueRequestBody =
    | QueueAppendRequest
    | QueueReorderRequest
    | QueueDeleteRequest
    | { held: boolean; ttlMs?: number };
=======
type ServerQueueAttachmentInput = Omit<ServerQueueAttachment, 'dataUrl'> & { dataUrl: string };

type ServerQueueItemInput = {
    content: string;
    text: string;
    agentMention?: string;
    attachments: ServerQueueAttachmentInput[];
    context: QueuedContextPart[];
    contextPreview?: string;
    sendConfig: QueuedMessageSendConfig;
    goal?: QueuedMessageGoal;
};

type ServerQueueRequestBody =
    | { directory: string; item: ServerQueueItemInput }
    | { itemIds: string[] };

const toServerAttachment = (attachment: AttachedFile): ServerQueueAttachmentInput => {
    const input: ServerQueueAttachmentInput = {
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        source: attachment.source,
        dataUrl: attachment.dataUrl,
    };
    if (attachment.serverPath) input.serverPath = attachment.serverPath;
    if (attachment.agentPath) input.agentPath = attachment.agentPath;
    return input;
};

const toServerItemInput = (message: QueuedMessageInput, sendConfig: QueuedMessageSendConfig): ServerQueueItemInput => {
    const item: ServerQueueItemInput = {
        content: message.content,
        text: message.text ?? message.content,
        attachments: (message.attachments ?? []).filter((file) => Boolean(file.dataUrl)).map(toServerAttachment),
        context: message.context ?? [],
        sendConfig,
    };
    if (message.agentMention) item.agentMention = message.agentMention;
    if (message.goal) item.goal = message.goal;
    const contextPreview = getQueuedMessagePreview({ content: '', context: message.context });
    if (contextPreview) item.contextPreview = contextPreview;
    return item;
};

>>>>>>> bc50ba56a
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

/**
 * The server that owns a session's queue: the server inside a space for a directory of that
 * space, which sees its OpenCode go idle and delivers, and the host's ('') for any other. Each
 * numbers its own revisions, so revisions compare within one owner only.
 */
const queueOwnerOf = (directory: string): string => spaceIdOfDirectory(directory) ?? '';
const ownerRevisionKey = (runtimeKey: string, owner: string): string => `${runtimeKey}\n${owner}`;

/** A request about one session's queue, sent to the server that owns it. */
const toOwner = (target: MessageQueueTarget, init: RequestInit): RuntimeFetchOptions => ({ ...init, directory: target.directory });

/** The whole queue of one owner: the host's, or the space's own. */
const readOwnerSnapshot = (owner: string, signal?: AbortSignal) => requestJson(
    serverSnapshotSchema,
    '/api/message-queue',
    { directory: owner ? `/spaces/${owner}` : null, signal },
);

/**
 * Runtime keys whose queue the server owns, established by a successful
 * hydration. Their entries are a projection and must not be persisted: a
 * stale local copy would resurrect messages the server already delivered.
 */
const serverOwnedRuntimeKeys = new Set<string>();
type LegacyQueueMigration = {
    items: Array<{ target: MessageQueueTarget; message: QueuedMessage }>;
    pending: Promise<void> | null;
};
const legacyMigrations = new Map<string, LegacyQueueMigration>();

/** Server revision last applied per queue key; older snapshots are ignored. */
const appliedRevisions = new Map<string, string>();
const snapshotRevisions = new Map<string, string>();
let hydrationGeneration = 0;

interface MessageQueueState {
    queuedMessages: Record<string, QueuedMessage[]>; // runtime + directory + session → queue
    quarantinedLegacyMessages: Record<string, QueuedMessage[]>;
    followUpBehavior: FollowUpBehavior;
    /**
     * Queued messages whose send is currently awaiting the server, per target.
     *
     * A queued item is removed only after its send resolves, so between
     * dispatch and resolution it is still visible to every other reader — and
     * a composer submit merges the whole queue into its own send. Over a relay
     * that window is seconds, long enough for the same message to be delivered
     * twice. Dispatchers must skip entries listed here.
     *
     * Never persisted: a restart has no in-flight sends, and a stale flag would
     * strand a queued message permanently. With a server-owned queue this
     * mirrors the server's in-flight item.
     */
    sendingIds: Record<string, string[]>;
}

interface MessageQueueActions {
    addToQueue: (target: MessageQueueTarget, message: QueuedMessageInput) => Promise<void>;
    removeFromQueue: (target: MessageQueueTarget, messageId: string) => void;
    reorderQueue: (target: MessageQueueTarget, fromId: string, toId: string) => void;
    /** Removes the message and returns it in full, attachments included. */
    popToInput: (target: MessageQueueTarget, messageId: string) => Promise<QueuedMessage | null>;
    /**
     * Removes what the composer is about to send itself — one message or every
     * message not already being delivered — and returns it in full.
     */
    takeForSend: (target: MessageQueueTarget, messageId?: string) => Promise<QueuedMessage[]>;
    clearQueue: (target: MessageQueueTarget) => void;
    /** Drops the local projection only (the session is gone); never a server call. */
    forgetQueue: (target: MessageQueueTarget) => void;
    clearAllQueues: () => void;
    markSending: (target: MessageQueueTarget, messageId: string) => void;
    clearSending: (target: MessageQueueTarget, messageId: string) => void;
    getSendableQueue: (target: MessageQueueTarget) => QueuedMessage[];
    setFollowUpBehavior: (behavior: FollowUpBehavior) => void;
    getQueueForTarget: (target: MessageQueueTarget) => QueuedMessage[];
    /** Server-owned queue: load the authoritative queue for the active runtime. */
    hydrate: () => Promise<void>;
    /** Server-owned queue: re-read after an event-stream gap. */
    resync: () => Promise<void>;
    /** Server-owned queue: re-read one isolated space's queue, which its own server owns. */
    refreshSpaceQueue: (spaceId: string) => Promise<void>;
    /**
     * Server-owned queue: apply one session's authoritative state (broadcast or response) from its
     * owner, the host ('') or a space; a session the owner may not speak for is ignored.
     */
<<<<<<< HEAD
    applyServerSession: (session: QueueState | { sessionId: string; directory?: string; items: unknown[]; sendingId?: string | null }, revision?: number | string, expectedRuntimeKey?: string, owner?: string) => void;
    /** Server-owned queue: tell the server that owns the session's queue to hold or release its delivery. */
    setServerHold: (sessionId: string, directory: string, held: boolean) => Promise<void>;
=======
    applyServerSession: (session: ServerQueueSession, revision: number, expectedRuntimeKey: string, owner?: string) => void;
>>>>>>> bc50ba56a
    resetForRuntimeSwitch: (previousRuntimeKey: string | null | undefined) => void;
}

type MessageQueueStore = MessageQueueState & MessageQueueActions;

/** Messages persisted before version 3 carried only `content`. */
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

const findDirectoryForSession = (sessionId: string, state: Pick<MessageQueueState, 'queuedMessages' | 'sendingIds'>): string => {
    for (const key of Object.keys(state.queuedMessages)) {
        const parsed = parseMessageQueueKey(key);
        if (parsed?.sessionId === sessionId && parsed.directory) return parsed.directory;
    }
    for (const key of Object.keys(state.sendingIds)) {
        const parsed = parseMessageQueueKey(key);
        if (parsed?.sessionId === sessionId && parsed.directory) return parsed.directory;
    }
    const known = sessionDirectoryMap.get(sessionId);
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
                    session: QueueState | { sessionId: string; directory?: string; items: unknown[]; sendingId?: string | null },
                    revisionInput?: number | string,
                    expectedRuntimeKey = getRuntimeKey(),
                    owner = '',
                ) => {
                    if (expectedRuntimeKey !== getRuntimeKey()) return;
                    let queueState: QueueState;
                    const directory = ('directory' in session && typeof session.directory === 'string' && session.directory)
                        ? session.directory
                        : findDirectoryForSession(session.sessionId, get());
                    if (queueOwnerOf(directory) !== owner) return;

                    if ('revision' in session && typeof session.revision === 'string' && Array.isArray(session.items)) {
                        queueState = session as QueueState;
                    } else {
                        const items: QueueItem[] = (session.items || []).map((raw) => {
                            if (raw && typeof raw === 'object' && 'queueItemId' in raw) {
                                return raw as QueueItem;
                            }
                            const item = raw as { id: string; content?: string; text?: string; createdAt?: number };
                            return {
                                queueItemId: item.id,
                                content: item.content ?? '',
                                text: item.text ?? item.content ?? '',
                                attachments: [],
                                context: [],
                                options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null },
                                createdAt: item.createdAt ?? Date.now(),
                                status: 'queued' as const,
                            };
                        });
                        queueState = {
                            sessionId: session.sessionId,
                            revision: String(revisionInput ?? '0'),
                            items,
                        };
                    }

                    const revision = queueState.revision;
                    const snapRevKey = ownerRevisionKey(expectedRuntimeKey, owner);
                    const currentSnapRev = snapshotRevisions.get(snapRevKey);
                    if (currentSnapRev && compareCounters(currentSnapRev, revision) > 0) return;
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
                        const queue = queueState.items.map(toQueuedMessage);
                        const queuedMessages = queue.length > 0
                            ? { ...state.queuedMessages, [key]: queue }
                            : withoutKey(state.queuedMessages, key);
                        const leased = queueState.items.filter((item) => item.status === 'leased');
                        const sendingIds = leased.length > 0
                            ? { ...state.sendingIds, [key]: leased.map((item) => item.queueItemId) }
                            : withoutKey(state.sendingIds, key);
                        return { queuedMessages, sendingIds };
                    });
                };

                /** Server state wins; a failed round-trip re-reads it instead of guessing. */
                const refreshSession = async (target: MessageQueueTarget) => {
                    const owner = queueOwnerOf(target.directory);
                    try {
                        const snapshot = await readOwnerSnapshot(owner);
                        const queue = snapshot.items?.find((entry) => entry.sessionId === target.sessionId);
                        if (queue) {
                            applyServerSession(queue, queue.revision, target.runtimeKey, owner);
                        } else {
                            const currentRev = appliedRevisions.get(getMessageQueueKey(target)) ?? '0';
                            applyServerSession({ sessionId: target.sessionId, directory: target.directory, revision: currentRev, items: [] }, currentRev, target.runtimeKey, owner);
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

                /**
                 * A complete queue of one owner replaces that owner's part of the projection; the
                 * rest stays. Resolves false for a snapshot older than one already applied.
                 */
                const applyOwnerSnapshot = (snapshot: z.infer<typeof serverSnapshotSchema>, runtimeKey: string, owner: string): boolean => {
                    let maxRevision = snapshot.revision !== undefined ? String(snapshot.revision) : '0';
                    const items = snapshot.items ?? [];
                    for (const queue of items) {
                        if (compareCounters(queue.revision, maxRevision) > 0) maxRevision = queue.revision;
                    }
                    const revisionKey = ownerRevisionKey(runtimeKey, owner);
                    const currentSnapRev = snapshotRevisions.get(revisionKey);
                    if (currentSnapRev && compareCounters(currentSnapRev, maxRevision) > 0) {
                        return false;
                    }
                    snapshotRevisions.set(revisionKey, maxRevision);
                    set((state) => {
                        const isNewerThanSnapshot = (key: string) => {
                            const rev = appliedRevisions.get(key);
                            return rev ? compareCounters(rev, maxRevision) > 0 : false;
                        };
                        const isOwned = (key: string) => {
                            const parsed = parseMessageQueueKey(key);
                            return parsed?.runtimeKey === runtimeKey && queueOwnerOf(parsed.directory) === owner;
                        };
                        const keep = (key: string) => !isOwned(key) || isNewerThanSnapshot(key);
                        const queuedMessages: Record<string, QueuedMessage[]> = {};
                        const sendingIds: Record<string, string[]> = {};
                        for (const [key, queue] of Object.entries(state.queuedMessages)) {
                            if (isOwned(key) && !isNewerThanSnapshot(key)) {
                                appliedRevisions.set(key, maxRevision);
                            }
                            if (keep(key)) queuedMessages[key] = queue;
                        }
                        for (const [key, ids] of Object.entries(state.sendingIds)) {
                            if (keep(key)) sendingIds[key] = ids;
                        }
                        for (const queue of items) {
                            const directory = findDirectoryForSession(queue.sessionId, state);
                            if (queueOwnerOf(directory) !== owner) continue;
                            const target = createMessageQueueTarget(queue.sessionId, directory, runtimeKey);
                            if (!target) continue;
                            const key = getMessageQueueKey(target);
                            if (isNewerThanSnapshot(key)) continue;
                            appliedRevisions.set(key, queue.revision);
                            if (queue.items.length > 0) queuedMessages[key] = queue.items.map(toQueuedMessage);
                            const leased = queue.items.filter((item) => item.status === 'leased');
                            if (leased.length > 0) sendingIds[key] = leased.map((item) => item.queueItemId);
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

                    takeForSend: async (target, messageId) => {
                        const key = getMessageQueueKey(target);
                        const currentQueue = get().queuedMessages[key] ?? [];
                        const sending = new Set(get().sendingIds[key] ?? []);
                        const candidates = messageId
                            ? currentQueue.filter((m) => m.id === messageId)
                            : currentQueue.filter((m) => !sending.has(m.id));
                        for (const msg of candidates) {
                            get().removeFromQueue(target, msg.id);
                        }
                        return candidates;
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
                            // Migration and recovery share one request owner so
                            // reconnects cannot upload a legacy message twice.
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
                                let snapshot: z.infer<typeof serverSnapshotSchema>;
                                try {
                                    snapshot = await readOwnerSnapshot('', AbortSignal.timeout(15_000));
                                } catch (error) {
                                    if (!isCurrent()) return;
                                    if (resyncRequested) continue;
                                    throw error;
                                }
                                if (!isCurrent()) return;
                                serverOwnedRuntimeKeys.add(runtimeKey);
                                // The host's snapshot owns the host's sessions; each space's queue is read from that space.
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
                        // Share legacy migration with bootstrap. A recovery edge
                        // during its snapshot read still earns one trailing read.
                        if (hydration?.runtimeKey === getRuntimeKey()) resyncRequested = true;
                        return get().hydrate();
                    },

                    refreshSpaceQueue: async (spaceId) => {
                        const runtimeKey = getRuntimeKey();
                        let snapshot: z.infer<typeof serverSnapshotSchema>;
                        try {
                            snapshot = await readOwnerSnapshot(spaceId, AbortSignal.timeout(15_000));
                        } catch {
                            // A stopped or unreachable space keeps what was last known of its queue.
                            return;
                        }
                        if (runtimeKey !== getRuntimeKey()) return;
                        serverOwnedRuntimeKeys.add(runtimeKey);
                        applyOwnerSnapshot(snapshot, runtimeKey, spaceId);
                    },

                    applyServerSession,

<<<<<<< HEAD
                    setServerHold: async (sessionId, directory, held) => {
                        const response = await runtimeFetch(`${sessionPath(sessionId)}/hold`, { ...jsonInit('PUT', { held }), directory });
                        if (!response.ok) throw new Error(`Message queue hold request failed (${response.status})`);
                    },

=======
>>>>>>> bc50ba56a
                    resetForRuntimeSwitch: (previousRuntimeKey) => {
                        hydrationGeneration += 1;
                        hydration = null;
                        resyncRequested = false;
                        if (previousRuntimeKey) {
                            for (const key of snapshotRevisions.keys()) {
                                if (key.startsWith(`${previousRuntimeKey}\n`)) snapshotRevisions.delete(key);
                            }
                            for (const key of appliedRevisions.keys()) {
                                if (parseMessageQueueKey(key)?.runtimeKey === previousRuntimeKey) appliedRevisions.delete(key);
                            }
                        }
                        if (!previousRuntimeKey || !serverOwnedRuntimeKeys.has(previousRuntimeKey)) return;
                        // The previous runtime's projection belongs to its server;
                        // switching back re-hydrates it from there.
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
        queue: QueueStateSchema.optional(),
        revision: z.union([z.number(), z.string()]).optional(),
        session: z.object({
            sessionId: z.string(),
            directory: z.string().optional(),
            items: z.array(z.unknown()),
            sendingId: z.string().nullable().optional(),
        }).optional(),
        spaceId: z.string().optional(),
    }),
});

export type MessageQueueUpdatedEvent = z.infer<typeof messageQueueUpdatedEventSchema>;

export const applyMessageQueueUpdatedEvent = (payload: MessageQueueUpdatedEvent, expectedRuntimeKey: string): void => {
    const parsed = messageQueueUpdatedEventSchema.safeParse(payload);
    if (!parsed.success) return;
    const { queue, spaceId, session, revision } = parsed.data.properties;
    if (queue) {
        useMessageQueueStore.getState().applyServerSession(queue, queue.revision, expectedRuntimeKey, spaceId ?? '');
    } else if (session) {
        const canonicalItems: QueueItem[] = session.items.map((raw) => {
            if (raw && typeof raw === 'object' && 'queueItemId' in raw) {
                return raw as QueueItem;
            }
            const item = raw as { id: string; content?: string; text?: string; createdAt?: number };
            return {
                queueItemId: item.id,
                content: item.content ?? '',
                text: item.text ?? item.content ?? '',
                attachments: [],
                context: [],
                options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null },
                createdAt: item.createdAt ?? Date.now(),
                status: 'queued' as const,
            };
        });
        const synthesizedQueue: QueueState = {
            sessionId: session.sessionId,
            revision: String(revision ?? '0'),
            items: canonicalItems,
        };
        useMessageQueueStore.getState().applyServerSession(synthesizedQueue, synthesizedQueue.revision, expectedRuntimeKey, spaceId ?? '');
    }
};
