import { z } from 'zod';
import { mergeMetadataPatch } from './session-metadata-store.js';

/**
 * Forks inherit Host operational metadata, never execution-record metadata.
 * Source-owned side-thread/review links are removed, active goals are paused,
 * and file-backed objectives are copied to the fork before its prompt runs.
 */

const NamespaceSchema = z.looseObject({
  btwSessionID: z.unknown().optional(),
  reviewSessionID: z.unknown().optional(),
  kind: z.unknown().optional(),
  goal: z.unknown().optional(),
});
const FileBackedGoalSchema = z.looseObject({ id: z.string().min(1), objectiveFile: z.literal(true) });

const openChamberNamespace = (metadata) => {
  const parsed = z.looseObject({ openchamber: NamespaceSchema }).safeParse(metadata);
  return parsed.success ? parsed.data.openchamber : null;
};

/** Merge patch (RFC 7386) removing source-owned links; null when there are none. */
export const sourceOwnedLinksPatch = (metadata) => {
  const namespace = openChamberNamespace(metadata);
  if (!namespace) return null;
  const patch = {};
  for (const key of ['btwSessionID', 'reviewSessionID']) {
    if (key in namespace) patch[key] = null;
  }
  if (namespace.kind === 'btw') {
    for (const key of ['kind', 'originalSessionID', 'btwBoundaryMessageID']) {
      if (key in namespace) patch[key] = null;
    }
  }
  // A fork must not pursue the source's goal in parallel: an active goal
  // arrives paused and the user resumes it (same rule as UI forks).
  const goal = namespace.goal;
  if (goal && typeof goal === 'object' && !Array.isArray(goal) && goal.status === 'active') {
    patch.goal = { status: 'paused', statusReason: 'paused in fork' };
  }
  return Object.keys(patch).length > 0 ? patch : null;
};

const fileBackedGoal = (metadata) => {
  const parsed = FileBackedGoalSchema.safeParse(openChamberNamespace(metadata)?.goal);
  return parsed.success ? parsed.data : null;
};

/** Copy operational source state into a new fork. Persistence failures propagate. */
export const applyForkInheritance = async ({ sourceSessionID, fork, metadata, readObjective, writeObjective, writeMetadata }) => {
  const goal = fileBackedGoal(metadata);
  let inlineObjective = null;
  if (goal) {
    try {
      const content = await readObjective(sourceSessionID);
      if (content === null) {
        console.warn('[fork] source goal objective unavailable; fork keeps the inline fallback');
      } else {
        try {
          await writeObjective(fork.id, content);
        } catch (error) {
          console.warn('[fork] failed to copy the goal objective file; inlining it', error?.message ?? error);
          inlineObjective = content;
        }
      }
    } catch (error) {
      console.warn('[fork] failed to read the source goal objective', error?.message ?? error);
    }
  }

  const namespacePatch = sourceOwnedLinksPatch(metadata) ?? {};
  if (inlineObjective !== null) {
    namespacePatch.goal = { ...namespacePatch.goal, objective: inlineObjective, objectiveFile: false };
  }
  const inherited = Object.keys(namespacePatch).length > 0 ? mergeMetadataPatch(metadata, { openchamber: namespacePatch }) : metadata ?? {};
  return writeMetadata(fork.id, inherited);
};
