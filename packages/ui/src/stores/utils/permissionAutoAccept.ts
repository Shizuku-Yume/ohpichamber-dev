import { z } from "zod";
import type { Session } from '@openchamber/agent-contract';

const permissionModeSchema = z.enum(["ask", "safety", "auto"]);

export type PermissionMode = z.infer<typeof permissionModeSchema>;

export type PermissionModeMap = Record<string, PermissionMode>;

export const displayedPermissionMode = (mode: PermissionMode, safetyAvailable: boolean): PermissionMode =>
  mode === "safety" && !safetyAvailable ? "ask" : mode;

export const nextPermissionMode = (mode: PermissionMode, safetyAvailable: boolean): PermissionMode => {
  const shown = displayedPermissionMode(mode, safetyAvailable);
  if (shown === "ask") return safetyAvailable ? "safety" : "auto";
  if (shown === "safety") return "auto";
  return "ask";
};


export type PermissionPolicySnapshot = {
  modes: PermissionModeMap;
  revision?: number;
};

export const permissionPolicyWireSchema = z.object({
  sessions: z.record(z.string().min(1), z.boolean()),
  modes: z.record(z.string().min(1), permissionModeSchema).optional(),
  revision: z.number().int().nonnegative().optional(),
});

type PermissionPolicyWire = z.infer<typeof permissionPolicyWireSchema>;

export const policySnapshotFromWire = (wire: PermissionPolicyWire): PermissionPolicySnapshot => ({
  modes: wire.modes ?? Object.fromEntries(
    Object.entries(wire.sessions).map(([sessionId, enabled]) => [sessionId, enabled ? "auto" : "ask"] as const),
  ),
  revision: wire.revision,
});

const buildSessionMap = (sessions: readonly Session[]): Map<string, Session> => {
  const map = new Map<string, Session>();
  for (const session of sessions) {
    map.set(session.sessionId, session);
  }
  return map;
};

const resolveLineage = (
  sessionId: string,
  sessions: readonly Session[],
  sessionById?: ReadonlyMap<string, Session>,
): string[] => {
  const map = sessionById ?? buildSessionMap(sessions);
  const result: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = sessionId;

  while (current && !seen.has(current)) {
    seen.add(current);
    result.push(current);
    current = map.get(current)?.parentSessionId;
  }

  return result;
};

export const resolvePermissionMode = (input: {
  modes: PermissionModeMap;
  sessions: readonly Session[];
  sessionById?: ReadonlyMap<string, Session>;
  sessionId: string;
}): PermissionMode | null => {
  const { modes, sessions, sessionById, sessionId } = input;
  if (Object.keys(modes).length === 0) return null;

  for (const id of resolveLineage(sessionId, sessions, sessionById)) {
    const mode = modes[id];
    if (mode) return mode;
  }

  return null;
};

/**
 * The mode to act on when the policy has no entry for this session's lineage:
 * the nearest explicit mode, otherwise the instance's configured default. Ask
 * remains the answer only when the policy itself was read and said nothing.
 */
export const resolvePermissionModeOrDefault = (input: {
  modes: PermissionModeMap;
  sessions: readonly Session[];
  sessionById?: ReadonlyMap<string, Session>;
  sessionId: string;
  defaultMode: PermissionMode;
}): PermissionMode => resolvePermissionMode(input) ?? input.defaultMode;
