export const MANAGED_PROCESS_TOKEN_ENV: string;

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

export interface PidfdSignalResult {
  pid: number;
  delivered: boolean;
  gone?: boolean;
  identityMismatch?: boolean;
  unavailable?: boolean;
}

export type SignalIdentities = (
  identities: Array<{ pid: number; startTicks: string }>,
  signal: 'SIGTERM' | 'SIGKILL',
) => Promise<PidfdSignalResult[]>;

export function createManagedProcessRegistry(options?: {
  fs?: {
    readFile(path: string, encoding: string): Promise<string>;
    readdir(path: string): Promise<string[]>;
    mkdir(path: string, options: { recursive: boolean }): Promise<string | undefined>;
    writeFile(path: string, data: string): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
    rm(path: string, options: { force: boolean }): Promise<void>;
  };
  registryDir?: string | null;
  bunPath?: string | null;
  signalIdentities?: SignalIdentities | null;
  readProcessTable?: () => Promise<ManagedProcessStat[]>;
}): {
  registerManagedProcess(entry: ManagedProcessEntry): Promise<void>;
  unregisterManagedProcess(pid?: number): Promise<void>;
  reapOrphanedProcesses(options?: { log?: (message: string) => void }): Promise<{ inspected: number; reaped: number }>;
  terminateManagedProcess(pid: number, signal?: 'SIGTERM' | 'SIGKILL'): Promise<boolean>;
};
export function registerManagedProcess(entry: ManagedProcessEntry): Promise<void>;

export function unregisterManagedProcess(pid?: number): Promise<void>;

export function reapOrphanedProcesses(options?: {
  log?: (message: string) => void;
}): Promise<{ inspected: number; reaped: number }>;

export function terminateManagedProcess(pid: number, signal?: 'SIGTERM' | 'SIGKILL'): Promise<boolean>;
