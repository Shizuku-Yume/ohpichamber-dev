import type { SessionMetadata } from '@openchamber/agent-contract';
import { omitKeys } from '@/lib/omitKeys';

/** Forks do not inherit source-bound links or retired Host goal metadata. */
export function withoutSourceOwnedLinks(metadata: SessionMetadata): SessionMetadata {
  const namespace = metadata.openchamber;
  if (!namespace) return metadata;
  const rest = omitKeys(namespace, ['reviewSessionID', 'goal']);
  const cleaned = (rest.kind as string) === 'scheduled' ? omitKeys(rest, ['kind']) : rest;
  if (JSON.stringify(cleaned) === JSON.stringify(namespace)) return metadata;
  return Object.keys(cleaned).length > 0 ? { ...metadata, openchamber: cleaned } : omitKeys(metadata, ['openchamber']);
}
