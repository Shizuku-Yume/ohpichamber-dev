/**
 * What a session must be told about the project's knowledge, and whether it has
 * been told yet.
 *
 * One owner, three moments. The block is attached to an outgoing prompt when
 * there is one (a message from the UI, a scheduled task, a session the agent
 * dispatched) and re-sent on its own after compaction, when there is no message
 * to attach it to. The decision is the same in every case, so it lives here
 * rather than in each sender — the client used to own it, which meant sessions
 * started without a UI got nothing at all.
 *
 * What was delivered is recorded in the session's own metadata rather than in
 * the browser. A signature held in a tab is lost when the tab closes, and worse,
 * it survives compaction: the tab goes on believing the agent still has context
 * that has just been summarised away.
 *
 * Upstream writes the same knowledge into OpenCode's session instruction
 * entries. That mechanism does not exist in OMP: the Agent Service carries the
 * block as part of the prompt, and OpenChamber's own metadata records what was
 * delivered. The text and guidance below are upstream's; the delivery stays
 * ours.
 */
import { isRecord } from '../shared/guards.js';

const KNOWLEDGE_METADATA_KEY = 'knowledge_context_delivered';
const PINS_METADATA_KEY = 'project_context_pins';

/**
 * Budget per source: pins and guidance travel together, but a huge pinned plan
 * must not crowd out the guidance. Anything past a source's budget is cut,
 * loudly.
 */
const KNOWLEDGE_MAX_LENGTH = 8000;

const truncate = (value) => (
  value.length <= KNOWLEDGE_MAX_LENGTH
    ? value
    : `${value.slice(0, KNOWLEDGE_MAX_LENGTH - 1)}…\n\n(truncated)`
);

/**
 * Identity of the pins the session should be carrying, content revisions
 * included: editing a pinned note must re-send it, not merely renaming one.
 * Memory and session linking are model-side OMP features; they add no text.
 */
export const buildKnowledgeSignature = ({ notes, plans }) => {
  const parts = [
    ...notes.map((note) => `n:${note.id}:${note.updatedAt}`),
    ...plans.map((plan) => `p:${plan.id}:${plan.title}`),
  ];
  return parts.length === 0 ? '' : parts.sort().join('|');
};


const buildPinnedBlock = ({ notes, plans }) => {
  const sections = [];
  if (notes.length > 0) {
    const rendered = notes
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((note) => `- ${note.body.trim()}`)
      .join('\n');
    sections.push(`## Pinned notes\n\n${rendered}`);
  }
  for (const plan of plans) {
    // A plan whose markdown cannot be read is marked rather than dropped:
    // losing one attachment must not silently shrink the context.
    sections.push(plan.body
      ? `## Pinned plan: ${plan.title}\n\n${plan.body}`
      : `## Pinned plan: ${plan.title}\n\n(plan content unavailable)`);
  }
  return sections.join('\n\n');
};

export const buildKnowledgeText = ({ notes, plans }) => {
  const blocks = [buildPinnedBlock({ notes, plans })].filter(Boolean);
  if (blocks.length === 0) return '';

  const assembled = blocks.join('\n\n');
  return assembled.length <= KNOWLEDGE_MAX_LENGTH
    ? assembled
    : `${truncate(assembled, KNOWLEDGE_MAX_LENGTH)}\n\n(project knowledge truncated)`;
};

export const createSessionKnowledgeRuntime = (dependencies) => {
  const {
    projectContextRuntime,
    resolveProjectId,
    // Pins and the delivered-signature cursor live in OpenChamber's own session
    // metadata store, which merges patches after creation.
    readSessionMetadata = null,
    persistSessionMetadata = null,
  } = dependencies;

  const requireMetadataStore = () => {
    if (typeof readSessionMetadata !== 'function' || typeof persistSessionMetadata !== 'function') {
      throw new Error('project knowledge needs a session metadata store');
    }
  };

  /** The session shape the readers below expect, built from our own store. */
  const readStoredSession = async (sessionId) => ({ metadata: await readSessionMetadata(sessionId) });

  /**
   * The user's pins, read fresh. The model sees only what plain OMP sends plus
   * these pins.
   */
  const readPins = (session) => {
    const metadata = isRecord(session?.metadata) ? session.metadata : {};
    const openchamber = isRecord(metadata.openchamber) ? metadata.openchamber : {};
    const pins = isRecord(openchamber[PINS_METADATA_KEY]) ? openchamber[PINS_METADATA_KEY] : {};
    const strings = (value) => Array.isArray(value)
      ? [...new Set(value.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim()))]
      : [];
    return { notes: strings(pins.notes), plans: strings(pins.plans) };
  };

  const collect = async (directory, pins = { notes: [], plans: [] }) => {
    const projectId = directory ? await resolveProjectId(directory) : '';

    let notes = [];
    let plans = [];
    if (projectId) {
      try {
        const context = await projectContextRuntime.readContext(projectId);
        const noteIds = new Set(pins.notes);
        const planIds = new Set(pins.plans);
        notes = (context.notes || []).filter((note) => noteIds.has(note.id));
        const pinnedPlans = (context.plans || []).filter((plan) => planIds.has(plan.id));
        plans = await Promise.all(pinnedPlans.map(async (plan) => {
          try {
            const content = await projectContextRuntime.readPlan(projectId, plan.id);
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

  /**
   * What the session is carrying, for display. Deliberately does not read plan
   * bodies: the panel states counts and names, and reading every pinned plan
   * off disk to show a number would make opening a panel cost what sending a
   * message costs.
   */
  const collectSummary = async (directory, pins = { notes: [], plans: [] }) => {
    const projectId = directory ? await resolveProjectId(directory) : '';
    const empty = { notes: [], plans: [] };
    if (!projectId) return empty;

    let notes = [];
    let plans = [];
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

  const readDeliveredSignature = (session) => {
    const metadata = isRecord(session?.metadata) ? session.metadata : {};
    const openchamber = isRecord(metadata.openchamber) ? metadata.openchamber : {};
    const delivered = openchamber[KNOWLEDGE_METADATA_KEY];
    return typeof delivered === 'string' ? delivered : '';
  };

  /**
   * The text this session still owes, or an empty string when it is already
   * carrying it. `deliveredSignature` comes from the session's metadata.
   */
  const resolvePending = async (directory, deliveredSignature, pins = { notes: [], plans: [] }) => {
    const collected = await collect(directory, pins);
    const signature = buildKnowledgeSignature(collected);
    if (!signature || signature === deliveredSignature) {
      return { text: '', signature };
    }
    return { text: buildKnowledgeText(collected), signature };
  };

  /**
   * What this session still owes, read from its own stored signature.
   */
  const resolvePendingForSession = async (sessionId, directory) => {
    const session = await readStoredSession(sessionId).catch(() => null);
    return resolvePending(directory, readDeliveredSignature(session), readPins(session));
  };

  const collectSummaryForSession = async (sessionId, directory) => {
    const session = await readStoredSession(sessionId).catch(() => null);
    return collectSummary(directory, readPins(session));
  };

  const setPin = async (sessionId, directory, kind, id, pinned) => {
    requireMetadataStore();
    const pins = readPins(await readStoredSession(sessionId));
    const key = kind === 'note' ? 'notes' : 'plans';
    const next = new Set(pins[key]);
    if (pinned) next.add(id);
    else next.delete(id);
    // Clearing the delivered signature is what makes the next send carry the
    // changed pin set; the merge patch leaves neighbouring state alone.
    await persistSessionMetadata(sessionId, directory, {
      openchamber: {
        [PINS_METADATA_KEY]: { ...pins, [key]: [...next] },
        [KNOWLEDGE_METADATA_KEY]: '',
      },
    });
    return { ...pins, [key]: [...next] };
  };

  /**
   * Recorded only once the message carrying it has actually gone out. Writing
   * it when the text is handed over would leave a failed send believing the
   * agent had context it never received.
   *
   * Merged onto a fresh read, because the session's metadata holds other
   * OpenChamber state — pinned messages among it — and a blind write would
   * drop whatever changed in between.
   */
  const recordDelivered = async (sessionId, directory, signature) => {
    requireMetadataStore();
    await persistSessionMetadata(sessionId, directory, {
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
