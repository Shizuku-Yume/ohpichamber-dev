import { z } from 'zod';

import { SpaceError } from './errors.js';
import { IMAGE_BASH, IMAGE_SH, IMAGE_TIMEOUT } from './layout.js';
import type { SpaceRecord, SpaceRecordReadResult, SpaceRecordSetup } from './space-records.js';

export const MAX_SETUP_COMMANDS = 100;
export const MAX_SETUP_COMMAND_LENGTH = 4000;

export const setupCommandsSchema = z.array(z.string().max(MAX_SETUP_COMMAND_LENGTH))
  .max(MAX_SETUP_COMMANDS)
  .transform((commands) => commands.filter((command) => command.trim() !== ''));

const COMMAND_TIME_LIMIT_SECONDS = 3600;
const COMMAND_KILL_AFTER_SECONDS = 10;
const HOST_WAIT_MS = (COMMAND_TIME_LIMIT_SECONDS + 60) * 1000;
const TIMED_OUT_EXIT_CODE = 124;
const OUTPUT_WINDOW_BYTES = 256 * 1024;
export const MAX_KEPT_OUTPUT_LINES = 200;
export const MAX_KEPT_OUTPUT_CHARACTERS = 32 * 1024;

const RUN_SCRIPT = `cd -- "$1" || exit 1; exec ${IMAGE_BASH} -c "$2" 2>&1`;

const substituteProjectPath = (command: string, projectPath: string): string => command
  .replace(/\$\{?ROOT_PROJECT_PATH\}?/g, projectPath)
  .replace(/\$\{?ROOT_WORKTREE_PATH\}?/g, projectPath);

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
const CONTROL_RANGE = `${String.fromCharCode(0x00)}-${String.fromCharCode(0x08)}${String.fromCharCode(0x0b)}${String.fromCharCode(0x0c)}${String.fromCharCode(0x0e)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}-${String.fromCharCode(0x9f)}`;
const TERMINAL_SEQUENCE = new RegExp(`${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)?|${ESC}\\[[0-?]*[ -/]*[@-~]|${ESC}[@-_]?|[${CONTROL_RANGE}\u202a-\u202e\u2066-\u2069]`, 'g');

const errorDetailSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

export interface SpaceSetupExecOptions {
  timeoutMs?: number | undefined;
  maxOutputBytes?: number | undefined;
  keepTail?: boolean | undefined;
  killTree?: boolean | undefined;
}

export interface SpaceSetupExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type SpaceSetupExec = (
  spaceId: string,
  argv: readonly string[],
  options?: SpaceSetupExecOptions,
) => Promise<SpaceSetupExecResult>;

export interface SpaceSetupRecords {
  update: (spaceId: string, changes: { setup: SpaceRecordSetup }) => SpaceRecordReadResult;
}

export interface SpaceSetupLogger {
  warn?: ((message: string) => void) | undefined;
}

export interface SpaceSetupDependencies {
  exec: SpaceSetupExec;
  records: SpaceSetupRecords;
  announce?: ((spaceId: string) => void) | undefined;
  logger?: SpaceSetupLogger | undefined;
  now?: (() => Date) | undefined;
}

export interface SpaceSetupRunState {
  index: number;
  total: number;
  command: string;
  startedAt: string;
}

export type SpaceSetupDescription =
  | { state: 'running'; index: number; total: number; command: string }
  | { state: 'interrupted'; total: number }
  | { state: 'done'; total: number }
  | {
    state: 'failed';
    index: number;
    total: number;
    command: string;
    exitCode: number | null;
    timedOut: boolean;
    startedAt: string | null;
    finishedAt: string;
  };

export interface SpaceSetupStartOptions {
  projectPath: string;
  commands: readonly string[];
}

export const keptOutputOf = (text: string): string => {
  const lines = String(text)
    .split('\n')
    .map((line) => line.split('\r').filter((part) => part !== '').at(-1) ?? '')
    .map((line) => line.replace(TERMINAL_SEQUENCE, ''));
  while (lines.length > 0 && (lines.at(-1) ?? '').trim() === '') lines.pop();
  const kept = lines.slice(-MAX_KEPT_OUTPUT_LINES).join('\n');
  return kept.length > MAX_KEPT_OUTPUT_CHARACTERS ? kept.slice(-MAX_KEPT_OUTPUT_CHARACTERS) : kept;
};

export function createSpaceSetup({
  exec,
  records,
  announce = () => { },
  logger = console,
  now = () => new Date(),
}: SpaceSetupDependencies) {
  const runs = new Map<string, SpaceSetupRunState>();

  const remember = (spaceId: string, setup: SpaceRecordSetup): void => {
    try {
      records.update(spaceId, { setup });
    } catch (error) {
      const detail = errorDetailSchema.safeParse(error).data;
      logger.warn?.(`[spaces] the setup of space ${spaceId} could not be remembered: ${detail?.code ?? detail?.message ?? error}`);
    }
  };

  const runOne = async (spaceId: string, projectPath: string, command: string) => {
    const began = now().getTime();
    const hourPassed = (): boolean => now().getTime() - began >= COMMAND_TIME_LIMIT_SECONDS * 1000;
    const argv = [
      IMAGE_TIMEOUT, '-k', String(COMMAND_KILL_AFTER_SECONDS), String(COMMAND_TIME_LIMIT_SECONDS),
      IMAGE_SH, '-c', RUN_SCRIPT, 'openchamber-setup', projectPath, substituteProjectPath(command, projectPath),
    ];
    try {
      const result = await exec(spaceId, argv, { timeoutMs: HOST_WAIT_MS, maxOutputBytes: OUTPUT_WINDOW_BYTES, keepTail: true, killTree: true });
      return {
        exitCode: result.code,
        timedOut: result.code === TIMED_OUT_EXIT_CODE && hourPassed(),
        output: keptOutputOf([result.stdout, result.stderr].filter((part) => part !== '').join('\n')),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : (errorDetailSchema.safeParse(error).data?.message ?? String(error));
      return {
        exitCode: null,
        timedOut: error instanceof SpaceError && error.code === 'command_timeout',
        output: keptOutputOf(message),
      };
    }
  };

  const runAll = async (spaceId: string, projectPath: string, commands: readonly string[], run: SpaceSetupRunState): Promise<void> => {
    try {
      for (const [index, command] of commands.entries()) {
        run.index = index;
        run.command = command;
        if (index > 0) announce(spaceId);
        const outcome = await runOne(spaceId, projectPath, command);
        if (outcome.exitCode !== 0) {
          remember(spaceId, { state: 'failed', total: commands.length, index, command, ...outcome, startedAt: run.startedAt, finishedAt: now().toISOString() });
          logger.warn?.(`[spaces] setup command ${index + 1} of ${commands.length} failed in space ${spaceId}: exit ${outcome.exitCode}${outcome.timedOut ? ', timed out' : ''}`);
          return;
        }
      }
      remember(spaceId, { state: 'done', total: commands.length, finishedAt: now().toISOString() });
    } finally {
      runs.delete(spaceId);
      announce(spaceId);
    }
  };

  const start = (spaceId: string, { projectPath, commands }: SpaceSetupStartOptions): void => {
    if (runs.has(spaceId)) throw new SpaceError('space_setup_running', 'The setup commands of this space are still running. Wait for them to finish.');
    const firstCommand = commands[0];
    if (firstCommand === undefined) throw new SpaceError('invalid_setup_commands', 'There are no setup commands to run.');
    const startedAt = now().toISOString();
    const run: SpaceSetupRunState = { index: 0, total: commands.length, command: firstCommand, startedAt };
    runs.set(spaceId, run);
    remember(spaceId, { state: 'running', total: commands.length, startedAt });
    announce(spaceId);
    void runAll(spaceId, projectPath, commands, run);
  };

  const isRunning = (spaceId: string): boolean => runs.has(spaceId);

  const describe = (spaceId: string, record: Pick<SpaceRecord, 'setup'> | null | undefined): SpaceSetupDescription | null => {
    const run = runs.get(spaceId);
    if (run) return { state: 'running', index: run.index, total: run.total, command: run.command };
    const kept = record?.setup ?? null;
    if (kept === null) return null;
    if (kept.state === 'running') return { state: 'interrupted', total: kept.total };
    if (kept.state === 'done') return { state: 'done', total: kept.total };
    return {
      state: 'failed', index: kept.index, total: kept.total, command: kept.command, exitCode: kept.exitCode, timedOut: kept.timedOut,
      startedAt: kept.startedAt ?? null, finishedAt: kept.finishedAt,
    };
  };

  const outputOf = (record: Pick<SpaceRecord, 'setup'> | null | undefined): string | null =>
  (record?.setup?.state === 'failed' ? record.setup.output : null);

  return { start, isRunning, describe, outputOf };
}

export type SpaceSetupController = ReturnType<typeof createSpaceSetup>;
