import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import { SpaceError } from './errors.js';
import { isGitVersionAtLeast, parseGitVersion } from './host-git.js';
import type { HostGit } from './host-git.js';
import { requireSpaceId } from './labels.js';
import type { RunCommandResult } from './run-command.js';

const GIT_VERSION_FLOOR = Object.freeze({ major: 2, minor: 29, patch: 0 });
const GIT_VERSION_FLOOR_TEXT = '2.29';

export const SNAPSHOT_IDENTITY: Readonly<Record<string, string>> = Object.freeze({
  GIT_AUTHOR_NAME: 'OhPiChamber',
  GIT_AUTHOR_EMAIL: 'spaces@openchamber.invalid',
  GIT_COMMITTER_NAME: 'OhPiChamber',
  GIT_COMMITTER_EMAIL: 'spaces@openchamber.invalid',
});

export const EXT_UNCARRIABLE = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}]`,
);

export const INNER_MARGIN_SECONDS = 5;
const MAX_INNER_MARGIN_SECONDS = 3600;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 24 * 60 * 60_000;

const errorDetailSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

export const spaceRefPrefix = (spaceId: string): string => `refs/openchamber/spaces/${requireSpaceId(spaceId)}/`;
export const startRef = (spaceId: string): string => `${spaceRefPrefix(spaceId)}start`;

export const line = (text: string): string => text.replace(/\r?\n$/, '');
export const zeroObjectId = (objectFormat: string): string => '0'.repeat(objectFormat === 'sha256' ? 64 : 40);
export const objectIdPattern = (objectFormat: string): RegExp =>
(objectFormat === 'sha256' ? /^[0-9a-f]{64}$/ : /^[0-9a-f]{40}$/);
export const innerSeconds = (timeoutMs: number, marginSeconds: number): number =>
  Math.ceil(timeoutMs / 1000) + marginSeconds;

export const requireTimeout = (value: number): number => {
  if (!Number.isInteger(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
    throw new SpaceError(
      'invalid_timeout',
      `The time limit of a transfer is a whole number of milliseconds from ${MIN_TIMEOUT_MS} to ${MAX_TIMEOUT_MS}`,
    );
  }
  return value;
};

export const requireInnerMargin = (value: number): number => {
  if (!Number.isInteger(value) || value < 1 || value > MAX_INNER_MARGIN_SECONDS) {
    throw new SpaceError(
      'invalid_inner_margin',
      `The margin of the limit inside the space is a whole number of seconds from 1 to ${MAX_INNER_MARGIN_SECONDS}`,
    );
  }
  return value;
};

export function buildExtUrl(argv: readonly string[]): string {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new SpaceError('invalid_ext_argument', 'A command for git is a non-empty list of arguments');
  }
  const escaped = argv.map((argument) => {
    const text = String(argument);
    if (text === '' || EXT_UNCARRIABLE.test(text)) {
      throw new SpaceError('invalid_ext_argument', 'A command for git cannot carry an empty argument or a control character');
    }
    return text.replaceAll('%', '%%').replaceAll(' ', '% ');
  });
  return `ext::${escaped.join(' ')}`;
}

const removeWithRetries = (directory: string): Promise<void> =>
  fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

export interface CreateTransferSessionOptions {
  git: HostGit;
  temporaryDirectory: string;
  removeDirectory?: ((directory: string) => Promise<void>) | undefined;
  name: string;
}

export interface TransferSession {
  withHostGit: <Result>(failureCode: string, work: (g: HostGit, directory: string) => Promise<Result>) => Promise<Result>;
  requireGitVersion: (g: HostGit, directory: string) => Promise<void>;
  requireWorkTree: (g: HostGit, repository: string) => Promise<string>;
}

export function createTransferSession({
  git,
  temporaryDirectory,
  removeDirectory = removeWithRetries,
  name,
}: CreateTransferSessionOptions): TransferSession {
  const Name = `${(name[0] ?? '').toUpperCase()}${name.slice(1)}`;

  const withHostGit = async <Result>(
    failureCode: string,
    work: (g: HostGit, directory: string) => Promise<Result>,
  ): Promise<Result> => {
    let directory: string;
    try {
      directory = await fs.mkdtemp(path.join(temporaryDirectory, `openchamber-${name.replace(' ', '-')}-`));
    } catch (error) {
      const detail = errorDetailSchema.safeParse(error).data;
      const message = error instanceof Error ? error.message : (detail?.message ?? String(error));
      throw new SpaceError(
        failureCode,
        `Could not make a temporary folder for ${name}: ${message}`,
        { step: 'make a temporary folder', cause: detail?.code ?? null },
      );
    }
    type Outcome = { ok: true; value: Result } | { ok: false; error: SpaceError };
    let outcome: Outcome;
    try {
      const hooks = path.join(directory, 'no-hooks');
      await fs.mkdir(hooks);
      const isolated = ['-c', `core.hooksPath=${hooks.replaceAll('\\', '/')}`, '-c', 'core.fsmonitor='];
      const g: HostGit = {
        run: (where, args, options) => git.run(where, [...isolated, ...args], options),
        output: (where, args, options) => git.output(where, [...isolated, ...args], options),
      };
      outcome = { ok: true, value: await work(g, directory) };
    } catch (error) {
      const detail = errorDetailSchema.safeParse(error).data;
      const message = error instanceof Error ? error.message : (detail?.message ?? String(error));
      outcome = {
        ok: false,
        error: error instanceof SpaceError
          ? error
          : new SpaceError(failureCode, `${Name} failed on the host: ${message}`, { step: 'host side', cause: detail?.code ?? null }),
      };
    }
    const left = await removeDirectory(directory).then(() => false, () => true);
    if (!outcome.ok) {
      if (left) outcome.error.details = { ...outcome.error.details, temporaryDirectoryLeft: directory };
      throw outcome.error;
    }
    return outcome.value;
  };

  const requireGitVersion = async (g: HostGit, directory: string): Promise<void> => {
    const unreadable = (cause: string | null): SpaceError => new SpaceError(
      'git_version_unreadable',
      `Could not tell which git this computer has. ${Name} needs git to be installed and working.`,
      { cause },
    );
    let result: RunCommandResult;
    try {
      result = await g.run(directory, ['version']);
    } catch (error) {
      const detail = errorDetailSchema.safeParse(error).data;
      throw unreadable(detail?.code ?? null);
    }
    const version = result.code === 0 ? parseGitVersion(result.stdout) : null;
    if (!version) {
      throw unreadable(null);
    }
    if (!isGitVersionAtLeast(version, GIT_VERSION_FLOOR)) {
      throw new SpaceError(
        'git_too_old',
        `${Name} needs git ${GIT_VERSION_FLOOR_TEXT} or newer, and this computer has git ${version.major}.${version.minor}.${version.patch}. Update git, then try again.`,
        { version },
      );
    }
  };

  const requireWorkTree = async (g: HostGit, repository: string | null | undefined): Promise<string> => {
    const target = repository ?? '';
    const found = await fs.stat(target).then((stats) => stats.isDirectory(), () => false);
    if (!found) {
      throw new SpaceError('project_folder_missing', `${target} does not exist, or is not a folder.`);
    }
    const inside = await g.run(target, ['rev-parse', '--is-inside-work-tree']);
    if (inside.code !== 0 || line(inside.stdout) !== 'true') {
      throw new SpaceError(
        'not_a_git_work_tree',
        `${target} is not inside a git working tree. Code can travel between a space and this computer only for a git repository.`,
      );
    }
    return path.resolve(line(await g.output(target, ['rev-parse', '--show-toplevel'])));
  };

  return { withHostGit, requireGitVersion, requireWorkTree };
}
