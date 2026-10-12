export function createManagedProcessRegistry(options?: {
  fs?: Record<string, Function>;
  execFileAsync?: Function;
}): {
  registerManagedProcess(entry: {
    pid?: number;
    ownerPid?: number;
    port?: number | null;
    binary?: string | null;
    kind?: 'opencode' | 'agent-service' | string;
    entrypoint?: string | null;
    runtime?: string;
  }): Promise<void>;
  unregisterManagedProcess(pid?: number): Promise<void>;
  reapOrphanedProcesses(options?: { log?: (message: string) => void }): Promise<{ inspected: number; reaped: number }>;
};
export function registerManagedProcess(entry: {
  pid?: number;
  ownerPid?: number;
  port?: number | null;
  binary?: string | null;
  kind?: 'opencode' | 'agent-service' | string;
  entrypoint?: string | null;
  runtime?: string;
}): Promise<void>;

export function unregisterManagedProcess(pid?: number): Promise<void>;

export function reapOrphanedProcesses(options?: {
  log?: (message: string) => void;
}): Promise<{ inspected: number; reaped: number }>;
