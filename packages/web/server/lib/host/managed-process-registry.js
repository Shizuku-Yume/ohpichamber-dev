// Agent Service process registry + orphan reaper.
//
// The Host spawns the Agent Service as an EXTERNAL Bun child (on Unix with
// `detached: true`, so it leads its own process group). That child can outlive
// its parent if the Host is hard-killed/crashes before graceful teardown runs,
// leaving a service that keeps worker memory alive with no owner.
//
// We cannot tie an external binary to the parent's death portably (Electron's
// `utilityProcess` only runs JS entrypoints, not a standalone binary). So the
// supervisor records every pid WE spawned on disk, and a startup reaper kills
// only records that are still provably ours and provably orphaned.
//
// Storage: one file per spawned process in a registry directory, named
// `<childPid>.json`. Multiple Host processes can run concurrently; a single
// shared JSON file would be corrupted by the read-modify-write race (last
// writer wins, clobbering another instance's entry). Per-process files mean
// every instance only ever writes/deletes its own entry.
//
// Identity policy (why this never kills the wrong thing):
//   1. Only explicit `kind: 'agent-service'` records participate. A legacy or
//      malformed file is discarded without signalling anything.
//   2. Registration captures the Linux process birth identity (`starttime`
//      from `/proc/<pid>/stat`) and the exact binary + entrypoint used to
//      spawn the child. Before signalling, the reaper re-reads both from the
//      live pid and requires them to match. A recycled pid therefore cannot
//      authorize a kill, and a missing identity refuses rather than guesses.
//   3. The reaper only acts when the recorded owner pid is dead. A child still
//      owned by a live Host instance is left untouched.
//   4. Process-tree members are discovered through the verified leader's
//      session/group/ancestry in `/proc`, then each one is signalled through a
//      pidfd bound to its own birth identity. Numeric pid/pgid signalling is
//      never used, so a recycled pid or process-group id cannot redirect a
//      signal. Signalling is unavailable on non-Linux or without pidfd/Bun and
//      fails closed rather than falling back to `kill(2)`.
//
// Non-Linux platforms have no authoritative birth identity here, so reaping
// refuses to guess (the live supervisor still stops its own child normally).
// This is not a new platform promise.
//
// All filesystem and child-process operations are ASYNCHRONOUS. The web server
// runs in-process inside the Electron main event loop (and other hosts), so a
// `spawnSync`/`*Sync` FS call would block the loop that also serves UI asset
// requests and realtime SSE traffic. The startup reaper can inspect several
// entries; keeping it async keeps the event loop responsive while the kernel
// work happens.

import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { createPidfdTerminator } from './pidfd-terminator.js';

const AGENT_SERVICE_KIND = 'agent-service';

// The service inherits this token into its workers. It proves tree membership
// when a descendant was reparented or moved out of the original group; a pid,
// session id, group id or ancestry alone is not sufficient authorization.
export const MANAGED_PROCESS_TOKEN_ENV = 'OPENCHAMBER_MANAGED_PROCESS_TOKEN';

// These decode the two external boundaries: a JSON record read from disk and
// the registration input supplied by the supervisor. Everything below works
// with the parsed domain record instead of probing representations.
const ManagedProcessEntrySchema = z.object({
  pid: z.number().int(),
  ownerPid: z.number().int(),
  kind: z.literal(AGENT_SERVICE_KIND),
  binary: z.string().min(1),
  entrypoint: z.string().min(1),
  birthIdentity: z.string().min(1),
  ownershipToken: z.string().min(16),
  runtime: z.string().optional(),
  startedAt: z.string().optional(),
});

const ManagedProcessRegistrationSchema = z.object({
  pid: z.number().int(),
  ownerPid: z.number().int().optional(),
  kind: z.literal(AGENT_SERVICE_KIND),
  binary: z.string().min(1),
  entrypoint: z.string().min(1),
  ownershipToken: z.string().min(16),
  runtime: z.string().optional(),
});

const nonEmptyString = (value) => {
  const parsed = z.string().trim().min(1).safeParse(value);
  return parsed.success ? parsed.data : null;
};

const resolveRegistryDir = (registryDir) => {
  const override = nonEmptyString(process.env.OPENCHAMBER_MANAGED_PROCESS_REGISTRY);
  if (override) return override;
  const configured = nonEmptyString(registryDir);
  if (configured) return path.resolve(configured);
  return path.join(os.homedir(), '.config', 'openchamber', 'managed-processes');
};

const isPidAlive = (pid) => {
  if (!Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM = process exists but we lack permission to signal it → still alive.
    return error?.code === 'EPERM';
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// `/proc/<pid>/stat` after the parenthesized command name: state, ppid, pgrp,
// session, ... and starttime (field 22, zero-based index 19 after the comm).
const parseProcessStat = (text) => {
  const fields = text.slice(text.lastIndexOf(')') + 2).trim().split(/\s+/);
  const birthIdentity = fields[19];
  if (!birthIdentity) return null;
  const parentPid = Number.parseInt(fields[1], 10);
  const processGroupId = Number.parseInt(fields[2], 10);
  const sessionId = Number.parseInt(fields[3], 10);
  return {
    state: fields[0],
    birthIdentity,
    parentPid: Number.isInteger(parentPid) ? parentPid : null,
    processGroupId: Number.isInteger(processGroupId) ? processGroupId : null,
    sessionId: Number.isInteger(sessionId) ? sessionId : null,
  };
};

const readProcessStat = async (fs, pid) => {
  if (process.platform !== 'linux' || !Number.isInteger(pid)) return null;
  try {
    return parseProcessStat(await fs.readFile(`/proc/${pid}/stat`, 'utf8'));
  } catch {
    return null;
  }
};

// A point-in-time Linux process table. The reaper only builds this after a
// record has matched the live leader's birth and command, so the normal
// startup path does no `/proc` scan.
const readLiveProcessTable = async (fs) => {
  if (process.platform !== 'linux') return [];
  let names = [];
  try {
    names = await fs.readdir('/proc');
  } catch {
    return [];
  }
  const table = [];
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue;
    const pid = Number.parseInt(name, 10);
    const stat = await readProcessStat(fs, pid);
    if (stat) table.push({ pid, ...stat });
  }
  return table;
};

// Select the tree owned by a verified leader. Session/group membership is only
// a discovery filter; every signal is bound to the member's own birth identity.
// A member born before the leader indicates that the id was recycled, so the
// whole selection fails closed instead of guessing.
const selectOwnedTree = async (fs, table, record) => {
  const byPid = new Map(table.map((entry) => [entry.pid, entry]));
  const root = byPid.get(record.pid);
  if (!root || root.birthIdentity !== record.birthIdentity) return null;
  // Detached spawn makes the service both session and group leader. If it no
  // longer owns either, enumeration is not authoritative.
  if (root.sessionId !== record.pid && root.processGroupId !== record.pid) return null;
  if (!await ownsProcessEnvironment(fs, root.pid, record.ownershipToken)) return null;
  const rootStart = BigInt(root.birthIdentity);
  const owned = new Map([[root.pid, root]]);
  for (const entry of table) {
    if (entry.pid === root.pid || entry.pid === process.pid || entry.pid <= 1) continue;
    const inTree = entry.sessionId === record.pid || entry.processGroupId === record.pid;
    if (!inTree) continue;
    if (BigInt(entry.birthIdentity) < rootStart) throw new Error('PROCESS_TREE_OWNERSHIP_UNAVAILABLE');
    // Membership only discovers a candidate. The inherited token proves the
    // Agent Service spawned it; unproven candidates are never signalled.
    if (!await ownsProcessEnvironment(fs, entry.pid, record.ownershipToken)) continue;
    owned.set(entry.pid, entry);
  }
  // Follow ancestry too: a native child may move to a new group/session, but
  // its parent chain still starts at the verified service leader.
  let added;
  do {
    added = false;
    for (const entry of table) {
      if (owned.has(entry.pid) || entry.pid === process.pid || entry.pid <= 1) continue;
      const parent = owned.get(entry.parentPid);
      if (!parent) continue;
      if (BigInt(entry.birthIdentity) < BigInt(parent.birthIdentity)) throw new Error('PROCESS_TREE_OWNERSHIP_UNAVAILABLE');
      if (!await ownsProcessEnvironment(fs, entry.pid, record.ownershipToken)) continue;
      owned.set(entry.pid, entry);
      added = true;
    }
  } while (added);
  return [...owned.values()];
};

const identityRunning = (table, identity) => table.some((entry) => entry.pid === identity.pid
  && entry.birthIdentity === identity.birthIdentity
  && entry.state !== 'Z' && entry.state !== 'X');

// Exact argv for a live Linux pid. Our child is a Bun process running one
// entrypoint, so argv is stable and authoritative; a reused pid cannot present
// both the recorded binary and entrypoint by accident.
const readCommandLine = async (fs, pid) => {
  if (process.platform !== 'linux') return null;
  try {
    const raw = await fs.readFile(`/proc/${pid}/cmdline`, 'utf8');
    const argv = raw.split('\0').filter(Boolean);
    return argv.length > 0 ? argv : null;
  } catch {
    return null;
  }
};

const commandIdentifiesAgentService = (argv, entry) => {
  if (!Array.isArray(argv) || argv.length === 0) return false;
  const binaryMatches = argv[0] === entry.binary
    || path.basename(argv[0]) === path.basename(entry.binary);
  return binaryMatches && argv.slice(1).includes(entry.entrypoint);
};

// The service and its workers inherit this exact variable. Reading environment
// requires the same user; an unreadable environment is never treated as owned.
const ownsProcessEnvironment = async (fs, pid, ownershipToken) => {
  if (process.platform !== 'linux' || !Number.isInteger(pid) || pid <= 1) return false;
  try {
    const raw = await fs.readFile(`/proc/${pid}/environ`, 'utf8');
    const marker = `${MANAGED_PROCESS_TOKEN_ENV}=${ownershipToken}`;
    return raw.split('\0').includes(marker);
  } catch {
    return false;
  }
};

/**
 * Build the registry API over injectable filesystem dependencies.
 * Production callers use the default instance exported below; the supervisor
 * passes a directory under the Host data directory, and tests pass their own
 * `fs` instead of mocking node builtins.
 */
export const createManagedProcessRegistry = ({
  fs = fsp,
  registryDir = null,
  bunPath = null,
  signalIdentities = null,
  readProcessTable = () => readLiveProcessTable(fs),
} = {}) => {
  const terminate = signalIdentities ?? createPidfdTerminator(bunPath ? { bunPath } : {});
  const entryFilePath = (pid) => path.join(resolveRegistryDir(registryDir), `${pid}.json`);

  const writeEntryFile = async (entry) => {
    const dir = resolveRegistryDir(registryDir);
    try {
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `${entry.pid}.json`);
      const tmp = `${filePath}.tmp-${process.pid}`;
      await fs.writeFile(tmp, JSON.stringify(entry, null, 2));
      await fs.rename(tmp, filePath);
    } catch {
      // Best-effort: a failed registry write must never break spawn/shutdown.
    }
  };

  const removeEntryFile = async (filePath) => {
    try {
      await fs.rm(filePath, { force: true });
    } catch {
      // Best-effort: a missing/removed file is not an error.
    }
  };

  const readAllEntries = async () => {
    const dir = resolveRegistryDir(registryDir);
    let names = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      return [];
    }
    const out = [];
    for (const name of names.filter((value) => value.endsWith('.json'))) {
      const filePath = path.join(dir, name);
      try {
        const entry = JSON.parse(await fs.readFile(filePath, 'utf8'));
        // The filename is the pid we wrote; a mismatch means corruption, not
        // a record that may authorize a signal.
        if (entry && Number.isInteger(entry.pid) && name === `${entry.pid}.json`) {
          out.push({ entry, filePath });
        } else {
          await removeEntryFile(filePath);
        }
      } catch {
        // Corrupt/partial file — drop it.
        await removeEntryFile(filePath);
      }
    }
    return out;
  };

  /** Record the actual Agent Service child WE spawned so a future run can reap it. */
  const registerManagedProcess = async (input = {}) => {
    const parsed = ManagedProcessRegistrationSchema.safeParse(input);
    if (!parsed.success) return;
    const { pid, ownerPid, binary, entrypoint, ownershipToken, runtime } = parsed.data;
    const birth = await readProcessStat(fs, pid);
    if (!birth) return;
    if (!await ownsProcessEnvironment(fs, pid, ownershipToken)) return;
    await writeEntryFile({
      pid,
      ownerPid: ownerPid ?? process.pid,
      kind: AGENT_SERVICE_KIND,
      binary,
      entrypoint,
      birthIdentity: birth.birthIdentity,
      ownershipToken,
      runtime: runtime ?? 'web',
      startedAt: new Date().toISOString(),
    });
  };

  /** Drop a pid from the registry after we have stopped it ourselves. */
  const unregisterManagedProcess = async (pid) => {
    if (!Number.isInteger(pid)) return;
    await removeEntryFile(entryFilePath(pid));
  };

  // The leader must still present its recorded birth and exact argv before any
  // tree member is considered. Signalling itself goes through pidfd, never a
  // numeric pid/pgid.
  const matchesLiveRecord = async (entry) => {
    const stat = await readProcessStat(fs, entry.pid);
    if (!stat || stat.birthIdentity !== entry.birthIdentity) return null;
    const argv = await readCommandLine(fs, entry.pid);
    if (!commandIdentifiesAgentService(argv, entry)) return null;
    if (!await ownsProcessEnvironment(fs, entry.pid, entry.ownershipToken)) return null;
    return stat;
  };

  const signalTree = async (known, signal) => {
    const identities = [...known.values()]
      .filter((entry) => entry.state !== 'Z' && entry.state !== 'X')
      .map((entry) => ({ pid: entry.pid, startTicks: entry.birthIdentity }));
    if (identities.length === 0) return false;
    const results = await terminate(identities, signal);
    return results.some((result) => result.delivered === true);
  };

  const killOrphan = async (record) => {
    const known = new Map();
    let leaderMatched = true;
    const collect = async () => {
      const table = await readProcessTable();
      const tree = await selectOwnedTree(fs, table, record);
      if (tree) {
        leaderMatched = true;
        for (const entry of tree) known.set(entry.pid, entry);
      } else {
        // The leader is gone or no longer matches. Stop discovering new
        // members; only already-captured identities may still be signalled.
        leaderMatched = false;
      }
      return table;
    };

    await collect();
    if (!leaderMatched) return false;
    const termDelivered = await signalTree(known, 'SIGTERM');
    if (!termDelivered) {
      const table = await readProcessTable();
      return [...known.values()].every((entry) => !identityRunning(table, entry));
    }

    let table = await readProcessTable();
    let remaining = [...known.values()].filter((entry) => identityRunning(table, entry));
    for (let waited = 0; waited < 1500 && remaining.length > 0; waited += 150) {
      await sleep(150);
      table = await collect();
      if (leaderMatched) await signalTree(known, 'SIGTERM');
      remaining = [...known.values()].filter((entry) => identityRunning(table, entry));
    }
    if (remaining.length === 0) return true;

    // Capture any member that appeared during the grace window, then escalate
    // through the same pidfd identities.
    table = await collect();
    remaining = [...known.values()].filter((entry) => identityRunning(table, entry));
    if (remaining.length === 0) return true;
    const killDelivered = await signalTree(known, 'SIGKILL');
    if (!killDelivered) return false;
    await sleep(300);
    table = await readProcessTable();
    return [...known.values()].every((entry) => !identityRunning(table, entry));
  };

  const terminateTreeOnce = async (record, signal) => {
    const table = await readProcessTable();
    const tree = await selectOwnedTree(fs, table, record);
    if (!tree) return false;
    return signalTree(new Map(tree.map((entry) => [entry.pid, entry])), signal);
  };

  /**
   * Pidfd SIGKILL for the tree of a live child this Host still owns. The
   * supervisor uses this instead of a numeric group kill when its own stop
   * escalation is needed. Returns false (no numeric fallback) when the record,
   * identity, token or pidfd delivery cannot be established.
   */
  const terminateManagedProcess = async (pid, signal = 'SIGKILL') => {
    if (!Number.isInteger(pid) || (signal !== 'SIGTERM' && signal !== 'SIGKILL')) return false;
    let entry;
    try {
      entry = JSON.parse(await fs.readFile(entryFilePath(pid), 'utf8'));
    } catch {
      return false;
    }
    const parsed = ManagedProcessEntrySchema.safeParse(entry);
    if (!parsed.success || parsed.data.pid !== pid || parsed.data.ownerPid !== process.pid) return false;
    if (!await matchesLiveRecord(parsed.data)) return false;
    return terminateTreeOnce(parsed.data, signal);
  };

  // Inspect one record and return whether it was reaped plus whether the file
  // can be dropped. Dropping never signals; it only discards records that can
  // no longer describe a live process of ours.
  const processEntry = async (entry, { log }) => {
    const parsed = ManagedProcessEntrySchema.safeParse(entry);
    // Legacy OpenCode records and malformed files never authorize a signal.
    if (!parsed.success) return { reaped: false, drop: true };
    const record = parsed.data;
    if (!isPidAlive(record.pid)) return { reaped: false, drop: true };
    // A live owner still owns this child, even if it was reparented.
    if (isPidAlive(record.ownerPid)) return { reaped: false, drop: false };
    if (process.platform !== 'linux') return { reaped: false, drop: false };

    const liveStat = await matchesLiveRecord(record);
    // Mismatch means the recorded process is gone and the pid was recycled.
    if (!liveStat) return { reaped: false, drop: true };

    const reaped = await killOrphan(record, liveStat);
    if (reaped) {
      log?.(`[lifecycle] reaped orphaned Agent Service pid ${record.pid} (owner ${record.ownerPid} gone)`);
    }
    return { reaped, drop: reaped || !isPidAlive(record.pid) };
  };

  /**
   * Kill any genuinely-orphaned Agent Service processes WE previously spawned,
   * and prune their registry files. Safe to call at startup before spawning a
   * new service. Returns { inspected, reaped }.
   */
  const reapOrphanedProcesses = async ({ log } = {}) => {
    const records = await readAllEntries();
    if (records.length === 0) return { inspected: 0, reaped: 0 };

    let reaped = 0;
    for (const { entry, filePath } of records) {
      let drop = false;
      try {
        const result = await processEntry(entry, { log });
        if (result.reaped) reaped += 1;
        drop = result.drop;
      } catch (error) {
        log?.(`[lifecycle] reap check failed for pid ${entry.pid}: ${error?.message ?? error}`);
      }
      if (drop) await removeEntryFile(filePath);
    }

    return { inspected: records.length, reaped };
  };

  return { registerManagedProcess, unregisterManagedProcess, reapOrphanedProcesses, terminateManagedProcess };
};

const defaultRegistry = createManagedProcessRegistry();

export const registerManagedProcess = defaultRegistry.registerManagedProcess;
export const unregisterManagedProcess = defaultRegistry.unregisterManagedProcess;
export const reapOrphanedProcesses = defaultRegistry.reapOrphanedProcesses;
export const terminateManagedProcess = defaultRegistry.terminateManagedProcess;
