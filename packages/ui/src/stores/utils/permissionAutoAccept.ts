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

<<<<<<< HEAD
||||||| bc50ba56aa
/**
 * The mode the UI writes onto a session it has just created: the user's own
 * choice, else, in an isolated space, the Settings default the composer showed.
 * The host's server writes that default itself when the session is created,
 * and so does the server inside a space from the file the host keeps there;
 * this write covers a space still running a server from before that file.
 * `undefined` writes nothing.
 */
export const permissionModeForNewSession = (
  choice: PermissionMode | undefined,
  inSpace: boolean,
  defaultMode: PermissionMode,
): PermissionMode | undefined => choice ?? (inSpace && defaultMode !== "ask" ? defaultMode : undefined);
=======
export const permissionModeForNewSession = (
  choice: PermissionMode | undefined,
  inSpace: boolean,
  defaultMode: PermissionMode,
): PermissionMode | undefined => choice ?? (inSpace && defaultMode !== "ask" ? defaultMode : undefined);
>>>>>>> upstream/main

export type PermissionPolicySnapshot = {
  modes: PermissionModeMap;
  revision?: number;
};

<<<<<<< HEAD
/**
 * A server policy received over HTTP or as a broadcast. `modes` is the policy;
 * servers from before the modes send only `sessions` as on/off, where on means `auto`.
 */
||||||| bc50ba56aa
/**
 * A policy as the server or VS Code's bridge sends it, over HTTP or as a
 * broadcast. `modes` is the policy; servers from before the modes and VS Code
 * send only `sessions` as on/off, where on means `auto`.
 */
=======
>>>>>>> upstream/main
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

<<<<<<< HEAD
/**
 * The nearest explicit mode up the session's lineage, or `null` when the
 * policy has not been read. `null` is not `ask`: a policy read that has not
 * answered must not be rendered as the user having chosen Ask, and callers
 * that need a concrete mode pass the configured default themselves.
 */
||||||| bc50ba56aa
/** The nearest explicit mode up the session's lineage, `ask` when there is none. */
=======
>>>>>>> upstream/main
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
