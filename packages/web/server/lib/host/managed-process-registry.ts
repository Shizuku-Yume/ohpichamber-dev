import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import {
  createPidfdTerminator,
  type PidfdSignalResult,
  type ProcessSignal,
} from './pidfd-terminator.js';

export type { PidfdSignalResult };

const AGENT_SERVICE_KIND = 'agent-service';

export const MANAGED_PROCESS_TOKEN_ENV = 'OPENCHAMBER_MANAGED_PROCESS_TOKEN';

export interface ManagedProcessEntry {
  pid?: number;
  ownerPid?: number;
  kind: 'agent-service';
  binary?: string;
  entrypoint?: string;
  ownershipToken?: string;
  runtime?: string;
}

export interface ManagedProcessStat {
  pid: number;
  state: string;
  birthIdentity: string;
  parentPid: number | null;
  processGroupId: number | null;
  sessionId: number | null;
}

export type SignalIdentities = (
  identities: Array<{ pid: number; startTicks: string }>,
  signal: ProcessSignal,
) => Promise<PidfdSignalResult[]>;

export interface ManagedProcessRegistryFs {
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  readdir(path: string): Promise<string[]>;
  mkdir(path: string, options: { recursive: boolean }): Promise<string | undefined>;
  writeFile(path: string, data: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  rm(path: string, options: { force: boolean }): Promise<void>;
}

export interface ManagedProcessRegistryOptions {
  fs?: ManagedProcessRegistryFs;
  registryDir?: string | null;
  bunPath?: string | null;
  signalIdentities?: SignalIdentities | null;
  readProcessTable?: () => Promise<ManagedProcessStat[]>;
}

export interface ManagedProcessRegistry {
  registerManagedProcess(entry?: ManagedProcessEntry): Promise<void>;
  unregisterManagedProcess(pid?: number): Promise<void>;
  reapOrphanedProcesses(options?: { log?: (message: string) => void }): Promise<{ inspected: number; reaped: number }>;
  terminateManagedProcess(pid: number, signal?: ProcessSignal): Promise<boolean>;
}

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

const CandidateDiskEntrySchema = z.object({
  pid: z.number().int(),
}).loose();

const ManagedProcessRegistrationSchema = z.object({
  pid: z.number().int(),
  ownerPid: z.number().int().optional(),
  kind: z.literal(AGENT_SERVICE_KIND),
  binary: z.string().min(1),
  entrypoint: z.string().min(1),
  ownershipToken: z.string().min(16),
  runtime: z.string().optional(),
});

const ErrorCodeSchema = z.object({ code: z.string() });

type ManagedProcessRecord = z.infer<typeof ManagedProcessEntrySchema>;
type CandidateDiskEntry = z.infer<typeof CandidateDiskEntrySchema>;
type ParsedProcessStat = Omit<ManagedProcessStat, 'pid'>;

const nonEmptyString = (value: string | null | undefined): string | null => {
  const parsed = z.string().trim().min(1).safeParse(value);
  return parsed.success ? parsed.data : null;
};

const resolveRegistryDir = (registryDir: string | null | undefined): string => {
  const override = nonEmptyString(process.env.OPENCHAMBER_MANAGED_PROCESS_REGISTRY);
  if (override) return override;
  const configured = nonEmptyString(registryDir);
  if (configured) return path.resolve(configured);
  const dataDir = nonEmptyString(process.env.OPENCHAMBER_DATA_DIR);
  return path.join(dataDir ? path.resolve(dataDir) : path.join(os.homedir(), '.config', 'ohpichamber'), 'managed-processes');
};

const isPidAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const parsed = ErrorCodeSchema.safeParse(error);
    return parsed.success && parsed.data.code === 'EPERM';
  }
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const parseProcessStat = (text: string): ParsedProcessStat | null => {
  const fields = text.slice(text.lastIndexOf(')') + 2).trim().split(/\s+/);
  const state = fields[0];
  const birthIdentity = fields[19];
  if (!state || !birthIdentity) return null;
  const parentPid = Number.parseInt(fields[1] ?? '', 10);
  const processGroupId = Number.parseInt(fields[2] ?? '', 10);
  const sessionId = Number.parseInt(fields[3] ?? '', 10);
  return {
    state,
    birthIdentity,
    parentPid: Number.isInteger(parentPid) ? parentPid : null,
    processGroupId: Number.isInteger(processGroupId) ? processGroupId : null,
    sessionId: Number.isInteger(sessionId) ? sessionId : null,
  };
};

const readProcessStat = async (fs: ManagedProcessRegistryFs, pid: number): Promise<ParsedProcessStat | null> => {
  if (process.platform !== 'linux' || !Number.isInteger(pid)) return null;
  try {
    return parseProcessStat(await fs.readFile(`/proc/${pid}/stat`, 'utf8'));
  } catch {
    return null;
  }
};

const readLiveProcessTable = async (fs: ManagedProcessRegistryFs): Promise<ManagedProcessStat[]> => {
  if (process.platform !== 'linux') return [];
  let names: string[] = [];
  try {
    names = await fs.readdir('/proc');
  } catch {
    return [];
  }
  const table: ManagedProcessStat[] = [];
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue;
    const pid = Number.parseInt(name, 10);
    const stat = await readProcessStat(fs, pid);
    if (stat) table.push({ pid, ...stat });
  }
  return table;
};

const selectOwnedTree = async (
  fs: ManagedProcessRegistryFs,
  table: ManagedProcessStat[],
  record: ManagedProcessRecord,
): Promise<ManagedProcessStat[] | null> => {
  const byPid = new Map(table.map((entry) => [entry.pid, entry]));
  const root = byPid.get(record.pid);
  if (!root || root.birthIdentity !== record.birthIdentity) return null;
  if (root.sessionId !== record.pid && root.processGroupId !== record.pid) return null;
  if (!await ownsProcessEnvironment(fs, root.pid, record.ownershipToken)) return null;
  const rootStart = BigInt(root.birthIdentity);
  const owned = new Map([[root.pid, root]]);
  for (const entry of table) {
    if (entry.pid === root.pid || entry.pid === process.pid || entry.pid <= 1) continue;
    const inTree = entry.sessionId === record.pid || entry.processGroupId === record.pid;
    if (!inTree) continue;
    if (BigInt(entry.birthIdentity) < rootStart) throw new Error('PROCESS_TREE_OWNERSHIP_UNAVAILABLE');
    if (!await ownsProcessEnvironment(fs, entry.pid, record.ownershipToken)) continue;
    owned.set(entry.pid, entry);
  }
  let added: boolean;
  do {
    added = false;
    for (const entry of table) {
      if (owned.has(entry.pid) || entry.pid === process.pid || entry.pid <= 1) continue;
      const parent = entry.parentPid === null ? undefined : owned.get(entry.parentPid);
      if (!parent) continue;
      if (BigInt(entry.birthIdentity) < BigInt(parent.birthIdentity)) throw new Error('PROCESS_TREE_OWNERSHIP_UNAVAILABLE');
      if (!await ownsProcessEnvironment(fs, entry.pid, record.ownershipToken)) continue;
      owned.set(entry.pid, entry);
      added = true;
    }
  } while (added);
  return [...owned.values()];
};

const identityRunning = (table: ManagedProcessStat[], identity: ManagedProcessStat): boolean => table.some(
  (entry) => entry.pid === identity.pid
    && entry.birthIdentity === identity.birthIdentity
    && entry.state !== 'Z' && entry.state !== 'X',
);

const readCommandLine = async (fs: ManagedProcessRegistryFs, pid: number): Promise<string[] | null> => {
  if (process.platform !== 'linux') return null;
  try {
    const raw = await fs.readFile(`/proc/${pid}/cmdline`, 'utf8');
    const argv = raw.split('\0').filter(Boolean);
    return argv.length > 0 ? argv : null;
  } catch {
    return null;
  }
};

const commandIdentifiesAgentService = (argv: string[] | null, entry: ManagedProcessRecord): boolean => {
  if (!Array.isArray(argv) || argv.length === 0) return false;
  const executable = argv[0];
  if (!executable) return false;
  const binaryMatches = executable === entry.binary
    || path.basename(executable) === path.basename(entry.binary);
  return binaryMatches && argv.slice(1).includes(entry.entrypoint);
};

const ownsProcessEnvironment = async (
  fs: ManagedProcessRegistryFs,
  pid: number,
  ownershipToken: string,
): Promise<boolean> => {
  if (process.platform !== 'linux' || !Number.isInteger(pid) || pid <= 1) return false;
  try {
    const raw = await fs.readFile(`/proc/${pid}/environ`, 'utf8');
    const marker = `${MANAGED_PROCESS_TOKEN_ENV}=${ownershipToken}`;
    return raw.split('\0').includes(marker);
  } catch {
    return false;
  }
};

export const createManagedProcessRegistry = ({
  fs = fsp,
  registryDir = null,
  bunPath = null,
  signalIdentities = null,
  readProcessTable = () => readLiveProcessTable(fs),
}: ManagedProcessRegistryOptions = {}): ManagedProcessRegistry => {
  const terminate = signalIdentities ?? createPidfdTerminator(bunPath ? { bunPath } : {});
  const entryFilePath = (pid: number): string => path.join(resolveRegistryDir(registryDir), `${pid}.json`);

  const writeEntryFile = async (entry: ManagedProcessRecord): Promise<void> => {
    const dir = resolveRegistryDir(registryDir);
    try {
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `${entry.pid}.json`);
      const tmp = `${filePath}.tmp-${process.pid}`;
      await fs.writeFile(tmp, JSON.stringify(entry, null, 2));
      await fs.rename(tmp, filePath);
    } catch { return; }
  };

  const removeEntryFile = async (filePath: string): Promise<void> => {
    try {
      await fs.rm(filePath, { force: true });
    } catch { return; }
  };

  const readAllEntries = async (): Promise<Array<{ entry: CandidateDiskEntry; filePath: string }>> => {
    const dir = resolveRegistryDir(registryDir);
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      return [];
    }
    const out: Array<{ entry: CandidateDiskEntry; filePath: string }> = [];
    for (const name of names.filter((value) => value.endsWith('.json'))) {
      const filePath = path.join(dir, name);
      try {
        const parsed = CandidateDiskEntrySchema.safeParse(JSON.parse(await fs.readFile(filePath, 'utf8')));
        if (parsed.success && name === `${parsed.data.pid}.json`) {
          out.push({ entry: parsed.data, filePath });
        } else {
          await removeEntryFile(filePath);
        }
      } catch {
        await removeEntryFile(filePath);
      }
    }
    return out;
  };

  const registerManagedProcess = async (input: ManagedProcessEntry = { kind: AGENT_SERVICE_KIND }): Promise<void> => {
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

  const unregisterManagedProcess = async (pid?: number): Promise<void> => {
    if (pid === undefined || !Number.isInteger(pid)) return;
    await removeEntryFile(entryFilePath(pid));
  };

  const matchesLiveRecord = async (entry: ManagedProcessRecord): Promise<ParsedProcessStat | null> => {
    const stat = await readProcessStat(fs, entry.pid);
    if (!stat || stat.birthIdentity !== entry.birthIdentity) return null;
    const argv = await readCommandLine(fs, entry.pid);
    if (!commandIdentifiesAgentService(argv, entry)) return null;
    if (!await ownsProcessEnvironment(fs, entry.pid, entry.ownershipToken)) return null;
    return stat;
  };

  const signalTree = async (known: Map<number, ManagedProcessStat>, signal: ProcessSignal): Promise<boolean> => {
    const identities = [...known.values()]
      .filter((entry) => entry.state !== 'Z' && entry.state !== 'X')
      .map((entry) => ({ pid: entry.pid, startTicks: entry.birthIdentity }));
    if (identities.length === 0) return false;
    const results = await terminate(identities, signal);
    return results.some((result) => result.delivered === true);
  };

  const killOrphan = async (record: ManagedProcessRecord): Promise<boolean> => {
    const known = new Map<number, ManagedProcessStat>();
    let leaderMatched = true;
    const collect = async (): Promise<ManagedProcessStat[]> => {
      const table = await readProcessTable();
      const tree = await selectOwnedTree(fs, table, record);
      if (tree) {
        leaderMatched = true;
        for (const entry of tree) known.set(entry.pid, entry);
      } else {
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

    table = await collect();
    remaining = [...known.values()].filter((entry) => identityRunning(table, entry));
    if (remaining.length === 0) return true;
    const killDelivered = await signalTree(known, 'SIGKILL');
    if (!killDelivered) return false;
    await sleep(300);
    table = await readProcessTable();
    return [...known.values()].every((entry) => !identityRunning(table, entry));
  };

  const terminateTreeOnce = async (record: ManagedProcessRecord, signal: ProcessSignal): Promise<boolean> => {
    const table = await readProcessTable();
    const tree = await selectOwnedTree(fs, table, record);
    if (!tree) return false;
    return signalTree(new Map(tree.map((entry) => [entry.pid, entry])), signal);
  };

  const terminateManagedProcess = async (pid: number, signal: ProcessSignal = 'SIGKILL'): Promise<boolean> => {
    if (!Number.isInteger(pid) || (signal !== 'SIGTERM' && signal !== 'SIGKILL')) return false;
    let entry: CandidateDiskEntry;
    try {
      entry = CandidateDiskEntrySchema.parse(JSON.parse(await fs.readFile(entryFilePath(pid), 'utf8')));
    } catch {
      return false;
    }
    const parsed = ManagedProcessEntrySchema.safeParse(entry);
    if (!parsed.success || parsed.data.pid !== pid || parsed.data.ownerPid !== process.pid) return false;
    if (!await matchesLiveRecord(parsed.data)) return false;
    return terminateTreeOnce(parsed.data, signal);
  };

  const processEntry = async (
    entry: CandidateDiskEntry,
    { log }: { log?: ((message: string) => void) | undefined },
  ): Promise<{ reaped: boolean; drop: boolean }> => {
    const parsed = ManagedProcessEntrySchema.safeParse(entry);
    if (!parsed.success) return { reaped: false, drop: true };
    const record = parsed.data;
    if (!isPidAlive(record.pid)) return { reaped: false, drop: true };
    if (isPidAlive(record.ownerPid)) return { reaped: false, drop: false };
    if (process.platform !== 'linux') return { reaped: false, drop: false };

    const liveStat = await matchesLiveRecord(record);
    if (!liveStat) return { reaped: false, drop: true };

    const reaped = await killOrphan(record);
    if (reaped) {
      log?.(`[lifecycle] reaped orphaned Agent Service pid ${record.pid} (owner ${record.ownerPid} gone)`);
    }
    return { reaped, drop: reaped || !isPidAlive(record.pid) };
  };

  const reapOrphanedProcesses = async ({ log }: { log?: (message: string) => void } = {}): Promise<{ inspected: number; reaped: number }> => {
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
        log?.(`[lifecycle] reap check failed for pid ${entry.pid}: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (drop) await removeEntryFile(filePath);
    }

    return { inspected: records.length, reaped };
  };

  return { registerManagedProcess, unregisterManagedProcess, reapOrphanedProcesses, terminateManagedProcess };
};

const defaultRegistry = createManagedProcessRegistry();

export const registerManagedProcess: ManagedProcessRegistry['registerManagedProcess'] = defaultRegistry.registerManagedProcess;
export const unregisterManagedProcess: ManagedProcessRegistry['unregisterManagedProcess'] = defaultRegistry.unregisterManagedProcess;
export const reapOrphanedProcesses: ManagedProcessRegistry['reapOrphanedProcesses'] = defaultRegistry.reapOrphanedProcesses;
export const terminateManagedProcess: ManagedProcessRegistry['terminateManagedProcess'] = defaultRegistry.terminateManagedProcess;
