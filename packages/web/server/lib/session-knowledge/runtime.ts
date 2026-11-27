import { z } from 'zod';
import { isRecord, isString } from '../shared/guards.js';
import type { JsonValue } from '../shared/json-values.js';
import type {
  KnowledgeNote,
  KnowledgePlan,
  KnowledgeSummary,
  SessionKnowledgeDependencies,
  SessionPins,
} from './contracts.js';

const KNOWLEDGE_METADATA_KEY = 'knowledge_context_delivered';
const PINS_METADATA_KEY = 'project_context_pins';
const KNOWLEDGE_MAX_LENGTH = 8000;

const truncate = (value: string): string => (
  value.length <= KNOWLEDGE_MAX_LENGTH
    ? value
    : `${value.slice(0, KNOWLEDGE_MAX_LENGTH - 1)}…\n\n(truncated)`
);

export interface KnowledgeContentInput {
  notes: KnowledgeNote[];
  plans: KnowledgePlan[];
}

export interface PendingKnowledgeResult {
  text: string;
  signature: string;
}

export interface KnowledgeSessionRecord {
  metadata?: JsonValue | null | undefined;
}

export type KnowledgePinKind = 'note' | 'plan';

export interface SessionKnowledgeRuntime {
  collect: (directory: string, pins?: SessionPins) => Promise<KnowledgeContentInput>;
  collectSummary: (directory: string, pins?: SessionPins) => Promise<KnowledgeSummary>;
  collectSummaryForSession: (sessionId: string, directory: string) => Promise<KnowledgeSummary>;
  resolvePending: (directory: string, deliveredSignature: string, pins?: SessionPins) => Promise<PendingKnowledgeResult>;
  resolvePendingForSession: (sessionId: string, directory: string) => Promise<PendingKnowledgeResult>;
  recordDelivered: (sessionId: string, directory: string, signature: string) => Promise<void>;
  readDeliveredSignature: (session: KnowledgeSessionRecord | null | undefined) => string;
  readPins: (session: KnowledgeSessionRecord | null | undefined) => SessionPins;
  setPin: (sessionId: string, directory: string, kind: KnowledgePinKind, id: string, pinned: boolean) => Promise<SessionPins>;
  metadataKey: typeof KNOWLEDGE_METADATA_KEY;
  pinsMetadataKey: typeof PINS_METADATA_KEY;
}

export const buildKnowledgeSignature = ({ notes, plans }: KnowledgeContentInput): string => {
  const parts = [
    ...notes.map((note) => `n:${note.id}:${note.updatedAt}`),
    ...plans.map((plan) => `p:${plan.id}:${plan.title}`),
  ];
  return parts.length === 0 ? '' : parts.sort().join('|');
};

const buildPinnedBlock = ({ notes, plans }: KnowledgeContentInput): string => {
  const sections: string[] = [];
  if (notes.length > 0) {
    const rendered = notes
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((note) => `- ${note.body.trim()}`)
      .join('\n');
    sections.push(`## Pinned notes\n\n${rendered}`);
  }
  for (const plan of plans) {
    sections.push(plan.body
      ? `## Pinned plan: ${plan.title}\n\n${plan.body}`
      : `## Pinned plan: ${plan.title}\n\n(plan content unavailable)`);
  }
  return sections.join('\n\n');
};

export const buildKnowledgeText = ({ notes, plans }: KnowledgeContentInput): string => {
  const blocks = [buildPinnedBlock({ notes, plans })].filter(Boolean);
  if (blocks.length === 0) return '';

  const assembled = blocks.join('\n\n');
  return assembled.length <= KNOWLEDGE_MAX_LENGTH
    ? assembled
    : `${truncate(assembled)}\n\n(project knowledge truncated)`;
};

const StoredKnowledgeMetadataSchema = z.object({
  openchamber: z.object({
    knowledge_context_delivered: z.string().optional(),
    project_context_pins: z.object({
      notes: z.array(z.unknown()).optional(),
      plans: z.array(z.unknown()).optional(),
    }).optional(),
  }).optional(),
});

const uniqueTrimmedStrings = (values: z.infer<typeof StoredKnowledgeMetadataSchema>['openchamber'] extends infer _ ? unknown[] | undefined : never): string[] => {
  if (!Array.isArray(values)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of values) {
    if (!isString(entry)) continue;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
};

export const createSessionKnowledgeRuntime = (dependencies: SessionKnowledgeDependencies): SessionKnowledgeRuntime => {
  const {
    projectContextRuntime,
    resolveProjectId,
    readSessionMetadata = null,
    persistSessionMetadata = null,
  } = dependencies;

  const requireMetadataStore = () => {
    if (!readSessionMetadata || !persistSessionMetadata) {
      throw new Error('project knowledge needs a session metadata store');
    }
    return { read: readSessionMetadata, persist: persistSessionMetadata };
  };

  const readStoredSession = async (sessionId: string): Promise<KnowledgeSessionRecord> => {
    if (!readSessionMetadata) {
      throw new Error('project knowledge needs a session metadata store');
    }
    return { metadata: await readSessionMetadata(sessionId) };
  };

  const readPins = (session: KnowledgeSessionRecord | null | undefined): SessionPins => {
    const metadata = isRecord(session?.metadata) ? session.metadata : null;
    const parsed = StoredKnowledgeMetadataSchema.safeParse(metadata);
    const pins = parsed.success ? parsed.data.openchamber?.project_context_pins : undefined;
    return {
      notes: uniqueTrimmedStrings(pins?.notes),
      plans: uniqueTrimmedStrings(pins?.plans),
    };
  };

  const collect = async (directory: string, pins: SessionPins = { notes: [], plans: [] }): Promise<KnowledgeContentInput> => {
    const projectId = directory ? await resolveProjectId(directory) : '';

    let notes: KnowledgeNote[] = [];
    let plans: KnowledgePlan[] = [];
    if (projectId) {
      try {
        const context = await projectContextRuntime.readContext(projectId);
        const noteIds = new Set(pins.notes);
        const planIds = new Set(pins.plans);
        notes = (context.notes || []).filter((note) => noteIds.has(note.id));
        const pinnedPlans = (context.plans || []).filter((plan) => planIds.has(plan.id));
        plans = await Promise.all(pinnedPlans.map(async (plan) => {
          try {
            const content = await projectContextRuntime.readPlan?.(projectId, plan.id);
            return { id: plan.id, title: plan.title, body: content?.body?.trim() || '' };
          } catch {
            return { id: plan.id, title: plan.title, body: '' };
          }
        }));
      } catch {
        notes = [];
        plans = [];
      }
    }

    return { notes, plans };
  };

  const collectSummary = async (directory: string, pins: SessionPins = { notes: [], plans: [] }): Promise<KnowledgeSummary> => {
    const projectId = directory ? await resolveProjectId(directory) : '';
    const empty: KnowledgeSummary = { notes: [], plans: [] };
    if (!projectId) return empty;

    let notes: KnowledgeSummary['notes'] = [];
    let plans: KnowledgeSummary['plans'] = [];
    try {
      const context = await projectContextRuntime.readContext(projectId);
      const noteIds = new Set(pins.notes);
      const planIds = new Set(pins.plans);
      notes = (context.notes || []).filter((note) => noteIds.has(note.id))
        .map((note) => ({ id: note.id, body: note.body }));
      plans = (context.plans || []).filter((plan) => planIds.has(plan.id))
        .map((plan) => ({ id: plan.id, title: plan.title }));
    } catch {
      notes = [];
      plans = [];
    }

    return { notes, plans };
  };

  const readDeliveredSignature = (session: KnowledgeSessionRecord | null | undefined): string => {
    const metadata = isRecord(session?.metadata) ? session.metadata : null;
    const parsed = StoredKnowledgeMetadataSchema.safeParse(metadata);
    return parsed.success ? (parsed.data.openchamber?.knowledge_context_delivered ?? '') : '';
  };

  const resolvePending = async (
    directory: string,
    deliveredSignature: string,
    pins: SessionPins = { notes: [], plans: [] },
  ): Promise<PendingKnowledgeResult> => {
    const collected = await collect(directory, pins);
    const signature = buildKnowledgeSignature(collected);
    if (!signature || signature === deliveredSignature) {
      return { text: '', signature };
    }
    return { text: buildKnowledgeText(collected), signature };
  };

  const resolvePendingForSession = async (sessionId: string, directory: string): Promise<PendingKnowledgeResult> => {
    const session = await readStoredSession(sessionId).catch(() => null);
    return resolvePending(directory, readDeliveredSignature(session), readPins(session));
  };

  const collectSummaryForSession = async (sessionId: string, directory: string): Promise<KnowledgeSummary> => {
    const session = await readStoredSession(sessionId).catch(() => null);
    return collectSummary(directory, readPins(session));
  };

  const setPin = async (
    sessionId: string,
    directory: string,
    kind: KnowledgePinKind,
    id: string,
    pinned: boolean,
  ): Promise<SessionPins> => {
    const { persist } = requireMetadataStore();
    const pins = readPins(await readStoredSession(sessionId));
    const key = kind === 'note' ? 'notes' : 'plans';
    const next = new Set(pins[key]);
    if (pinned) next.add(id);
    else next.delete(id);
    const nextPins: SessionPins = { ...pins, [key]: [...next] };
    await persist(sessionId, directory, {
      openchamber: {
        [PINS_METADATA_KEY]: { notes: nextPins.notes, plans: nextPins.plans },
        [KNOWLEDGE_METADATA_KEY]: '',
      },
    });
    return nextPins;
  };

  const recordDelivered = async (sessionId: string, directory: string, signature: string): Promise<void> => {
    const { persist } = requireMetadataStore();
    await persist(sessionId, directory, {
      openchamber: { [KNOWLEDGE_METADATA_KEY]: signature },
    });
  };

  return {
    collect,
    collectSummary,
    collectSummaryForSession,
    resolvePending,
    resolvePendingForSession,
    recordDelivered,
    readDeliveredSignature,
    readPins,
    setPin,
    metadataKey: KNOWLEDGE_METADATA_KEY,
    pinsMetadataKey: PINS_METADATA_KEY,
  };
};
