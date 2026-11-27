import crypto from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { z } from 'zod';

import {
  EXT_UNCARRIABLE,
  INNER_MARGIN_SECONDS,
  SNAPSHOT_IDENTITY,
  buildExtUrl,
  createTransferSession,
  innerSeconds,
  line,
  objectIdPattern,
  requireInnerMargin,
  requireTimeout,
  spaceRefPrefix,
  startRef,
  zeroObjectId,
} from './code-transfer.js';
import type { HostGit } from './host-git.js';
import { SpaceError } from './errors.js';
import type { SpaceErrorDetails } from './errors.js';
import { tail } from './exec-http.js';
import type { PlaceExecFn } from './gatekeeper-channel.js';
import { requireSpaceId } from './labels.js';
import { IMAGE_GIT, IMAGE_ONLY_PATH, IMAGE_SH, IMAGE_TIMEOUT, requireSpaceProjectPath } from './layout.js';
import type { RunCommandResult } from './run-command.js';

const FETCH_TIMEOUT_MS = 10 * 60_000;
const SNAPSHOT_TIMEOUT_MS = 5 * 60_000;
const APPLY_TIMEOUT_MS = 10 * 60_000;
const MAX_TRANSFER_BYTES = 256 * 1024 * 1024;
const MAX_CHANGED_BYTES = 128 * 1024 * 1024;
const MAX_OBJECT_BYTES = 4 * 1024 * 1024;
const MAX_CHANGED_ENTRIES = 100_000;
const FOLDER_STEPS_PER_ENTRY = 32;
const FETCH_MAX_OUTPUT_BYTES = 1024 * 1024;
const LIST_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const APPLY_OUTPUT_TAIL_BYTES = 64 * 1024;
const READ_BACK_TIMEOUT_MS = 5 * 60_000;
const SIZE_POLL_MS = 100;

const INSIDE_RESULT = 'refs/openchamber/result';
const QUARANTINE_RESULT = 'refs/openchamber/result';
const resultRef = (spaceId: string): string => `${spaceRefPrefix(spaceId)}result`;
const appliedRef = (spaceId: string): string => `${spaceRefPrefix(spaceId)}applied`;
const closedRef = (spaceId: string): string => `${spaceRefPrefix(spaceId)}changes-closed`;
const applyingRef = (spaceId: string): string => `${spaceRefPrefix(spaceId)}applying`;
const appliedFromRef = (spaceId: string): string => `${spaceRefPrefix(spaceId)}applied-from`;
const applyingFromRef = (spaceId: string): string => `${spaceRefPrefix(spaceId)}applying-from`;
const appliedHeadRef = (spaceId: string): string => `${spaceRefPrefix(spaceId)}applied-head`;
const applyingHeadRef = (spaceId: string): string => `${spaceRefPrefix(spaceId)}applying-head`;

const BRANCH_FROM_NOW_ON = 'From now on this space is applied as a branch, which holds its whole work, the rounds you already applied included.';

const UNCOMMITTED_MESSAGE = 'openchamber: uncommitted changes from the space\n\nWhat was uncommitted in the space when its work was brought out. Some of it may be the work you had uncommitted when the space was made.';

const MAX_REPORTED_PATHS = 100;
const MAX_REPORT_BYTES = 256 * 1024;

const SNAPSHOT_SCRIPT = [
  IMAGE_ONLY_PATH,
  'exec 3>&1 >/dev/null;',
  '{',
  'cd "$1" || exit 1;',
  'report=$(git rev-parse --git-path openchamber-unmerged) || exit 1;',
  `git ls-files --unmerged -z | head -c ${MAX_REPORT_BYTES} > "$report";`,
  'head=$(git rev-parse --verify --quiet "HEAD^{commit}") || { echo "The repository in the space has no commit at HEAD." >&2; exit 1; };',
  'index=$(git rev-parse --git-path index) && copy=$(git rev-parse --git-path openchamber-result-index) || exit 1;',
  'rm -f "$copy";',
  'if [ -e "$index" ]; then cp "$index" "$copy" || exit 1; fi;',
  'GIT_INDEX_FILE="$copy" git -c core.splitIndex=false add --all && tree=$(GIT_INDEX_FILE="$copy" git -c core.splitIndex=false write-tree);',
  'status=$?; rm -f "$copy"; [ "$status" -eq 0 ] || exit 1;',
  'if [ "$tree" = "$(git rev-parse "$head^{tree}")" ]; then result=$head;',
  'else result=$(GIT_AUTHOR_NAME="$3" GIT_AUTHOR_EMAIL="$4" GIT_COMMITTER_NAME="$3" GIT_COMMITTER_EMAIL="$4" git commit-tree --no-gpg-sign "$tree" -p "$head" -m "$2") || exit 1; fi;',
  `git update-ref ${INSIDE_RESULT} "$result" || exit 1;`,
  '} 3>&-;',
  'printf "%s\n" "$result" >&3;',
  'cat "$report" >&3;',
  'rm -f "$report"',
].join(' ');

const FETCH_CONFIG = [
  '-c', 'fetch.fsckObjects=true', '-c', 'transfer.fsckObjects=true',
  '-c', 'fetch.prune=false', '-c', 'fetch.writeCommitGraph=false',
];
const QUARANTINE_CONFIG = ['-c', 'fetch.unpackLimit=1', '-c', 'transfer.unpackLimit=1'];
const FETCH_FLAGS = ['--quiet', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', '--no-auto-gc', '--refmap='];

const PATCH_ARGS = ['diff-tree', '-r', '-p', '--binary', '--full-index', '--no-renames', '--no-ext-diff', '--no-textconv', '--no-color', '--src-prefix=a/', '--dst-prefix=b/'];
const APPLY_ARGS = ['-c', 'apply.whitespace=nowarn', '-c', 'apply.ignoreWhitespace=no', 'apply', '--binary', '--whitespace=nowarn'];

const errorDetailSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

const requireLimit = (value: number, name: string): number => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new SpaceError('invalid_limit', `${name} is a whole number greater than zero`);
  }
  return value;
};

const OUT_CODES = new Set([
  'invalid_space_id', 'invalid_space_path', 'invalid_timeout', 'invalid_inner_margin', 'invalid_limit',
  'git_version_unreadable', 'git_too_old', 'project_folder_missing', 'not_a_git_work_tree', 'space_start_missing',
  'code_out_failed', 'result_ref_missing', 'result_not_a_commit', 'result_transfer_too_large', 'result_too_large', 'result_too_many_changes',
]);

const pause = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => { setTimeout(resolve, milliseconds); });

const READ_AT_ONCE = 8;
const READ_PIECE_BYTES = 64 * 1024;

const blobId = (algorithm: string, bytes: Buffer): string =>
  crypto.createHash(algorithm).update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

const CHANGED_WHILE_READ = Symbol('changed while read');
const READS_OF_A_CHANGING_FILE = 4;
const PAUSE_BETWEEN_READS_MS = 100;

export type CodeOutFiles = Pick<typeof fs, 'open' | 'lstat' | 'readlink'>;

async function hashFile(
  files: CodeOutFiles,
  full: string,
  algorithm: string,
  until: number,
): Promise<string | null | typeof CHANGED_WHILE_READ> {
  let handle: Awaited<ReturnType<CodeOutFiles['open']>>;
  try {
    handle = await files.open(full, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  } catch {
    return null;
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) return null;
    const hash = crypto.createHash(algorithm).update(`blob ${stats.size}\0`);
    const piece = Buffer.allocUnsafe(Math.max(1, Math.min(READ_PIECE_BYTES, stats.size)));
    let total = 0;
    for (; ;) {
      if (Date.now() > until) throw new SpaceError('command_timeout', 'Reading a file of the working tree back did not end in time');
      const { bytesRead } = await handle.read(piece, 0, piece.length, null).catch(() => ({ bytesRead: -1 }));
      if (bytesRead < 0) return null;
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > stats.size) return CHANGED_WHILE_READ;
      hash.update(piece.subarray(0, bytesRead));
    }
    return total === stats.size ? hash.digest('hex') : CHANGED_WHILE_READ;
  } finally {
    await handle.close();
  }
}

const applyTurns = new Map<string, Promise<void>>();

const inTurn = async <Result>(key: string, work: () => Promise<Result>): Promise<Result> => {
  const earlier = applyTurns.get(key);
  let done = (): void => { };
  const mine = new Promise<void>((resolve) => {
    done = resolve;
  });
  applyTurns.set(key, mine);
  try {
    await earlier;
    return await work();
  } finally {
    done();
    if (applyTurns.get(key) === mine) applyTurns.delete(key);
  }
};

async function folderBytes(directory: string): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await folderBytes(full);
    } else {
      total += await fs.lstat(full).then((stats) => stats.size, () => 0);
    }
  }
  return total;
}

const nameFolder = ({ ignoreCase, precompose }: { ignoreCase: boolean; precompose: boolean }) => (name: string): string => {
  if (!ignoreCase) return precompose ? name.normalize('NFC') : name;
  return name.normalize('NFC').toLowerCase().toUpperCase().toLowerCase().normalize('NFC');
};

export interface FirstRedirectedFolderOptions {
  ignoreCase?: boolean | undefined;
  precompose?: boolean | undefined;
  deletedLinks?: readonly string[] | undefined;
  lstat?: typeof fs.lstat | undefined;
  realpath?: typeof fs.realpath | undefined;
}

export async function firstRedirectedFolder(
  top: string,
  paths: readonly string[],
  {
    ignoreCase = false,
    precompose = false,
    deletedLinks = [],
    lstat = fs.lstat,
    realpath = fs.realpath,
  }: FirstRedirectedFolderOptions = {},
): Promise<string | null> {
  const root = await realpath(top);
  const fold = nameFolder({ ignoreCase, precompose });
  const kinds = new Map<string, 'folder' | 'link' | 'absent' | 'other'>();
  const reals = new Map<string, boolean>();
  const goingLinks = new Set(deletedLinks);
  const leadsElsewhere = async (relative: string): Promise<boolean> => {
    const cached = reals.get(relative);
    if (cached !== undefined) return cached;
    const real = path.relative(root, await realpath(path.join(top, ...relative.split('/')))).split(path.sep).join('/');
    const outside = fold(real) !== fold(relative);
    reals.set(relative, outside);
    return outside;
  };
  for (const file of paths) {
    const folders = file.split('/').slice(0, -1);
    let relative = '';
    let deepest = '';
    for (const folder of folders) {
      relative = relative === '' ? folder : `${relative}/${folder}`;
      let kind = kinds.get(relative);
      if (kind === undefined) {
        kind = 'folder';
        try {
          const stats = await lstat(path.join(top, ...relative.split('/')));
          if (stats.isSymbolicLink()) kind = goingLinks.has(relative) ? 'absent' : 'link';
          else if (!stats.isDirectory()) kind = 'other';
        } catch (error) {
          const code = errorDetailSchema.safeParse(error).data?.code;
          if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
          kind = 'absent';
        }
        kinds.set(relative, kind);
      }
      if (kind === 'link') return relative;
      if (kind !== 'folder') break;
      deepest = relative;
    }
    if (deepest !== '' && await leadsElsewhere(deepest)) {
      let above = '';
      for (const folder of deepest.split('/')) {
        above = above === '' ? folder : `${above}/${folder}`;
        if (await leadsElsewhere(above)) return above;
      }
    }
  }
  return null;
}

const WINDOWS_RESERVED_CHARACTER = /[<>:"/\\|?*]/;
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[0-9¹²³]) *(?:[.:]|$)/i;
const WINDOWS_TRAILING = /[ .]$/;
const WINDOWS_MAX_PATH = 259;
const WINDOWS_MAX_FOLDER_PATH = 247;
const MAX_NAME_BYTES = 255;
const MAX_PATH_BYTES = 1023;

const hasWindowsReservedCharacter = (name: string): boolean => {
  if (WINDOWS_RESERVED_CHARACTER.test(name)) return true;
  for (let index = 0; index < name.length; index += 1) {
    const code = name.charCodeAt(index);
    if (code >= 1 && code <= 0x1f) return true;
  }
  return false;
};

type NameRule =
  | 'name_too_long'
  | 'reserved_character'
  | 'device_name'
  | 'trailing_space_or_period'
  | 'path_too_long'
  | 'differs_only_in_case'
  | 'case_only_rename';

export interface DisallowedName {
  path: string;
  rule: NameRule;
  other: string | null;
}

export interface NameNotAllowedOptions {
  platform?: NodeJS.Platform | undefined;
  ignoreCase?: boolean | undefined;
  precompose?: boolean | undefined;
  deleted?: readonly string[] | undefined;
  top?: string | undefined;
  longPaths?: boolean | undefined;
}

const nameRule = (name: string, platform: NodeJS.Platform): NameRule | null => {
  if (Buffer.byteLength(name) > MAX_NAME_BYTES) return 'name_too_long';
  if (platform !== 'win32') return null;
  if (hasWindowsReservedCharacter(name)) return 'reserved_character';
  if (WINDOWS_DEVICE_NAME.test(name)) return 'device_name';
  if (WINDOWS_TRAILING.test(name)) return 'trailing_space_or_period';
  return null;
};

interface CaseTreeNode {
  children: Map<string, CaseTreeNode>;
  spellings: Map<string, { present: boolean; old: boolean }>;
}

export function nameNotAllowedHere(
  created: readonly string[],
  all: readonly string[],
  {
    platform = process.platform,
    ignoreCase = false,
    precompose = false,
    deleted = [],
    top = '',
    longPaths = false,
  }: NameNotAllowedOptions = {},
): DisallowedName | null {
  const join = platform === 'win32' ? path.win32.join : path.posix.join;
  for (const file of created) {
    const whole = top === '' ? file : join(top, file);
    if (Buffer.byteLength(whole) > MAX_PATH_BYTES) return { path: file, rule: 'path_too_long', other: null };
    if (platform === 'win32' && !longPaths && top !== '') {
      if (whole.length > WINDOWS_MAX_PATH) return { path: file, rule: 'path_too_long', other: null };
      const folder = file.includes('/') ? join(top, file.slice(0, file.lastIndexOf('/'))) : '';
      if (folder.length > WINDOWS_MAX_FOLDER_PATH) return { path: file, rule: 'path_too_long', other: null };
    }
    for (const name of file.split('/')) {
      const rule = nameRule(name, platform);
      if (rule) return { path: file, rule, other: null };
    }
  }
  if ((!ignoreCase && !precompose) || created.length === 0) return null;
  const fold = nameFolder({ ignoreCase, precompose });
  const node = (): CaseTreeNode => ({ children: new Map(), spellings: new Map() });
  const root = node();
  for (const file of created) {
    let at = root;
    for (const name of file.split('/')) {
      const key = fold(name);
      let child = at.children.get(key);
      if (!child) {
        child = node();
        at.children.set(key, child);
      }
      at = child;
    }
  }
  const mark = (file: string, present: boolean, old: boolean): void => {
    let at: CaseTreeNode | undefined = root;
    let from = 0;
    for (; ;) {
      const end = file.indexOf('/', from);
      const name = end === -1 ? file.slice(from) : file.slice(from, end);
      at = at.children.get(fold(name));
      if (!at) return;
      const seen = at.spellings.get(name) ?? { present: false, old: false };
      at.spellings.set(name, { present: seen.present || present, old: seen.old || old });
      if (end === -1) return;
      from = end + 1;
    }
  };
  const isCreated = new Set(created);
  for (const file of all) mark(file, true, !isCreated.has(file));
  for (const file of created) mark(file, true, false);
  for (const file of deleted) mark(file, false, true);
  for (const file of created) {
    const names = file.split('/');
    let at = root;
    for (let depth = 0; depth < names.length; depth += 1) {
      const name = names[depth];
      if (name === undefined) continue;
      const next = at.children.get(fold(name));
      if (!next) break;
      at = next;
      if (at.spellings.get(name)?.old) continue;
      const others = [...at.spellings].filter(([candidate]) => candidate !== name);
      const staying = others.find(([, seen]) => seen.present);
      const going = others.find(([, seen]) => !seen.present);
      const other = staying ?? going;
      if (other) {
        return {
          path: file,
          rule: staying ? 'differs_only_in_case' : 'case_only_rename',
          other: [...names.slice(0, depth), other[0]].join('/'),
        };
      }
    }
  }
  return null;
}

export interface ReportedPaths {
  count: number;
  paths: string[];
}

const reported = (paths: readonly string[]): ReportedPaths => {
  const all = [...new Set(paths.filter((entry) => entry !== ''))];
  return { count: all.length, paths: all.slice(0, MAX_REPORTED_PATHS).map((entry) => entry.replace(new RegExp(EXT_UNCARRIABLE, 'g'), '?')) };
};

async function conflictedPaths(patch: string): Promise<ReportedPaths> {
  const paths: string[] = [];
  let file = '';
  const lines = readline.createInterface({ input: createReadStream(patch), crlfDelay: Infinity });
  try {
    for await (const text of lines) {
      if (text.startsWith('+++ b/')) file = text.slice('+++ b/'.length);
      else if (file !== '' && text.startsWith('+<<<<<<< ')) {
        paths.push(file);
        file = '';
      }
    }
  } finally {
    lines.close();
  }
  return reported(paths);
}

interface SnapshotReport {
  result: string;
  unmerged: ReportedPaths;
}

const readReport = (text: string | null | undefined): SnapshotReport => {
  const report = String(text ?? '');
  const end = report.indexOf('\n');
  return {
    result: end === -1 ? '' : report.slice(0, end),
    unmerged: reported(
      report.slice(end + 1).split('\0').filter((entry) => entry.includes('\t')).map((entry) => entry.slice(entry.indexOf('\t') + 1)),
    ),
  };
};

interface GitObjectSize {
  id: string;
  type: string;
  size: number;
}

const parseSizes = (text: string): GitObjectSize[] => text.split('\n').filter(Boolean).map((entry) => {
  const [id = '', type = '', size] = entry.split(' ');
  if (type === 'missing' || !/^\d+$/.test(size ?? '')) {
    throw new SpaceError('code_out_failed', `An object of the result is missing from the quarantine: ${id}`, { cause: 'object_missing' });
  }
  return { id, type, size: Number(size) };
});

export interface CodeOutPlace {
  exec: PlaceExecFn;
  execArgv: (spaceId: string) => Promise<string[]>;
}

export interface CreateCodeOutOptions {
  git: HostGit;
  place: CodeOutPlace;
  temporaryDirectory?: string | undefined;
  removeDirectory?: ((directory: string) => Promise<void>) | undefined;
  platform?: NodeJS.Platform | undefined;
  readBackTimeoutMs?: number | undefined;
  files?: CodeOutFiles | undefined;
}

export interface BringCodeOutRequest {
  repository: string;
  spaceId: string;
  spacePath: string;
  timeoutMs?: number | undefined;
  innerMarginSeconds?: number | undefined;
  maxTransferBytes?: number | undefined;
  maxChangedBytes?: number | undefined;
  maxChangedEntries?: number | undefined;
}

export interface BringCodeOutResult {
  result: string;
  changedPaths: number;
  changedBytes: number;
  newBytes: number;
  nestedRepositories: ReportedPaths;
  unmerged: ReportedPaths;
}

export interface ApplyAsBranchRequest {
  repository: string;
  spaceId: string;
  branch: string;
}

export interface ApplyAsBranchResult {
  branch: string;
  commit: string;
}

export interface ApplyAsChangesRequest {
  repository: string;
  spaceId: string;
  maxChangedBytes?: number | undefined;
  maxChangedEntries?: number | undefined;
}

export type ApplyAsChangesResult =
  | {
    status: 'applied';
    appliedPaths: number;
    remembered: boolean;
    nestedRepositories: ReportedPaths;
    conflicted: ReportedPaths;
  }
  | { status: 'nothing_to_apply' };

export interface DescribeApplyStateRequest {
  repository: string;
  spaceId: string;
}

export interface ApplyStateDescription {
  changesRoute: 'open' | 'closed';
  result: string | null;
  lastApplied: string | null;
  newPaths: number | null;
  newPathsOverLimit: boolean;
  newPathsUndecided: boolean;
  interruptedApply: boolean;
}

export interface CodeOutChannel {
  bringCodeOut: (request: BringCodeOutRequest) => Promise<BringCodeOutResult>;
  applyAsBranch: (request: ApplyAsBranchRequest) => Promise<ApplyAsBranchResult>;
  applyAsChanges: (request: ApplyAsChangesRequest) => Promise<ApplyAsChangesResult>;
  describeApplyState: (request: DescribeApplyStateRequest) => Promise<ApplyStateDescription>;
}

interface TreeSettings {
  algorithm: string;
  filemode: boolean;
  symlinks: boolean;
}

type WorkingTreeReading =
  | { kind: 'absent' }
  | { kind: 'other' }
  | { kind: 'link'; raw: string }
  | { kind: 'file'; executable: boolean; raw: string; clean: string | undefined };

interface TreeEntrySide {
  mode: string;
  id: string;
}

interface ComparedEntry {
  path: string;
  from: TreeEntrySide;
  to: TreeEntrySide;
}

interface CallState {
  g: HostGit;
  directory: string;
  top: string;
  until: number;
  listings: Map<string, string[]>;
  patches: Map<string, { file: string; check: RunCommandResult | null }>;
  files: number;
  settings: TreeSettings | null;
  readings: Map<string, WorkingTreeReading>;
  folders: Map<string, boolean>;
  commits: Map<string, Set<string>>;
}

interface ChangeRefusal {
  tooMany: (what: string, limit: number) => SpaceError;
  tooLarge: (bytes: number, limit: number) => SpaceError;
}

interface ChangeMeasurement {
  changedPaths: number;
  changedBytes: number;
  nestedRepositories: ReportedPaths;
  paths: string[];
  created: string[];
  deleted: string[];
  deletedLinks: string[];
}

type BaseDecision =
  | { kind: 'from'; from: string }
  | { kind: 'partly'; partly: { gone: string[]; stillThere: string[] } };

type PreparedPatch =
  | { outcome: 'nothing' }
  | { outcome: 'blocked'; folder: string }
  | { outcome: 'slow' }
  | { outcome: 'checked'; change: ChangeMeasurement; patch: string; check: RunCommandResult };

export function createCodeOut({
  git,
  place,
  temporaryDirectory = os.tmpdir(),
  removeDirectory,
  platform = process.platform,
  readBackTimeoutMs = READ_BACK_TIMEOUT_MS,
  files = fs,
}: CreateCodeOutOptions): CodeOutChannel {
  const { withHostGit, requireGitVersion, requireWorkTree } = createTransferSession({
    git,
    temporaryDirectory,
    removeDirectory,
    name: 'code out',
  });

  const during = async <Result>(step: string, work: () => Promise<Result>): Promise<Result> => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof SpaceError && OUT_CODES.has(error.code)) throw error;
      const detail = errorDetailSchema.safeParse(error).data;
      const details: SpaceErrorDetails = { step };
      if (error instanceof SpaceError && error.details) Object.assign(details, error.details);
      details.cause = error instanceof SpaceError ? error.code : (detail?.code ?? null);
      const message = error instanceof Error ? error.message : (detail?.message ?? String(error));
      throw new SpaceError('code_out_failed', error instanceof SpaceError ? message : `Code out failed on the host: ${message}`, details);
    }
  };

  const readRef = async (g: HostGit, where: string, ref: string): Promise<string | null> => {
    const found = await g.run(where, ['rev-parse', '--verify', '--quiet', `${ref}^{object}`]);
    return found.code === 0 ? line(found.stdout) : null;
  };

  const requireStart = async (g: HostGit, top: string, spaceId: string): Promise<string> => {
    const start = await readRef(g, top, startRef(spaceId));
    if (!start) {
      throw new SpaceError(
        'space_start_missing',
        `This repository holds no start snapshot for space ${spaceId}. The work of a space can come out only into the repository its code came from.`,
      );
    }
    return start;
  };

  const requireResult = async (g: HostGit, top: string, spaceId: string): Promise<string> => {
    const result = await readRef(g, top, resultRef(spaceId));
    if (!result) {
      throw new SpaceError('result_missing', `There is no result of space ${spaceId} in this repository yet. Bring the space's work out first.`);
    }
    return result;
  };

  const fetchIntoQuarantine = async (
    g: HostGit,
    quarantine: string,
    url: string,
    timeoutMs: number,
    maxTransferBytes: number,
  ): Promise<void> => {
    const tooLarge = (): SpaceError => new SpaceError(
      'result_transfer_too_large',
      `The space sent more than ${maxTransferBytes} bytes, the limit of one transfer, so the transfer was stopped. Nothing reached the repository.`,
      { step: 'fetch into the quarantine', limit: maxTransferBytes },
    );
    const controller = new AbortController();
    let finished = false;
    const watch = (async () => {
      try {
        while (!finished) {
          if (await folderBytes(quarantine) > maxTransferBytes) {
            controller.abort(tooLarge());
            return;
          }
          await pause(SIZE_POLL_MS);
        }
      } catch {
        return;
      }
    })();
    let fetched: RunCommandResult;
    try {
      fetched = await g.run(quarantine, [
        '-c', 'protocol.ext.allow=always', ...FETCH_CONFIG, ...QUARANTINE_CONFIG,
        'fetch', ...FETCH_FLAGS, '--update-shallow', url, `+${INSIDE_RESULT}:${QUARANTINE_RESULT}`,
      ], { timeoutMs, maxOutputBytes: FETCH_MAX_OUTPUT_BYTES, killTree: true, signal: controller.signal });
    } finally {
      finished = true;
      await watch;
    }
    if (await folderBytes(quarantine) > maxTransferBytes) throw tooLarge();
    if (fetched.code !== 0) {
      throw new SpaceError(
        'code_out_failed',
        `Fetching the result out of the space failed: ${tail(fetched.stderr) || `exit code ${fetched.code}`}`,
        { step: 'fetch into the quarantine', cause: null },
      );
    }
  };

  const sizesOf = async (g: HostGit, where: string, ids: readonly string[]): Promise<Map<string, GitObjectSize>> =>
    new Map(parseSizes(await g.output(where, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], {
      stdin: ids.map((id) => `${id}\n`).join(''),
      maxOutputBytes: LIST_MAX_OUTPUT_BYTES,
      timeoutMs: APPLY_TIMEOUT_MS,
    })).map((object) => [object.id, object]));

  const listChange = async (g: HostGit, where: string, from: string, to: string): Promise<string[]> =>
    (await g.output(where, ['diff-tree', '-r', '-z', '--no-renames', from, to], {
      maxOutputBytes: LIST_MAX_OUTPUT_BYTES,
      timeoutMs: APPLY_TIMEOUT_MS,
    })).split('\0');

  const measureChange = async (
    g: HostGit,
    where: string,
    from: string,
    to: string,
    {
      maxChangedBytes,
      maxChangedEntries,
      maxFolders,
      maxFolderSteps,
    }: { maxChangedBytes: number; maxChangedEntries: number; maxFolders: number; maxFolderSteps: number },
    refuse: ChangeRefusal,
    list: () => Promise<string[]> = () => listChange(g, where, from, to),
  ): Promise<ChangeMeasurement> => {
    let fields: string[];
    try {
      fields = await list();
    } catch (error) {
      if (errorDetailSchema.safeParse(error).data?.code === 'command_output_too_large') {
        throw refuse.tooMany(`changes so many paths that their list is longer than ${LIST_MAX_OUTPUT_BYTES} bytes`, LIST_MAX_OUTPUT_BYTES);
      }
      throw error;
    }
    const touched: string[] = [];
    const nested: string[] = [];
    const paths: string[] = [];
    const created: string[] = [];
    const deleted: string[] = [];
    const deletedLinks: string[] = [];
    let changedPaths = 0;
    let folders = 0;
    let steps = 0;
    let previous: string[] = [];
    for (let index = 0; index + 1 < fields.length; index += 2) {
      const headerField = fields[index];
      const file = fields[index + 1];
      if (headerField === undefined || file === undefined) continue;
      const [oldMode = '', newMode = '', oldId = '', newId = '', status = ''] = headerField.slice(1).split(' ');
      changedPaths += 1;
      if (changedPaths > maxChangedEntries) throw refuse.tooMany(`changes more than ${maxChangedEntries} paths`, maxChangedEntries);
      const names = file.split('/').slice(0, -1);
      let shared = 0;
      while (shared < names.length && shared < previous.length && names[shared] === previous[shared]) shared += 1;
      folders += names.length - shared;
      steps += (names.length * (names.length + 1) - shared * (shared + 1)) / 2 + names.length;
      if (folders > maxFolders) throw refuse.tooMany(`changes files in more than ${maxFolders} folders`, maxFolders);
      if (steps > maxFolderSteps) {
        throw refuse.tooMany(
          `changes files so deep among so many folders that reaching them all takes more than ${maxFolderSteps} steps from a folder into the next`,
          maxFolderSteps,
        );
      }
      previous = names;
      paths.push(file);
      if (status === 'A') created.push(file);
      if (status === 'D') deleted.push(file);
      if (status === 'D' && oldMode === '120000') deletedLinks.push(file);
      if (status !== 'D' && newMode === '160000') nested.push(file);
      if (oldMode !== '160000' && !/^0+$/.test(oldId)) touched.push(oldId);
      if (status !== 'D' && newMode !== '160000') touched.push(newId);
    }
    const sizes = await sizesOf(g, where, [...new Set(touched)]);
    const changedBytes = touched.reduce((sum, id) => sum + (sizes.get(id)?.size ?? 0), 0);
    if (changedBytes > maxChangedBytes) throw refuse.tooLarge(changedBytes, maxChangedBytes);
    return { changedPaths, changedBytes, nestedRepositories: reported(nested), paths, created, deleted, deletedLinks };
  };

  const measureHistory = async (
    g: HostGit,
    quarantine: string,
    start: string,
    result: string,
    { maxChangedBytes, maxChangedEntries }: { maxChangedBytes: number; maxChangedEntries: number },
    refuse: ChangeRefusal,
  ): Promise<{ newBytes: number }> => {
    let fresh: string[];
    try {
      fresh = (await g.output(
        quarantine,
        ['rev-list', '--objects', '--no-object-names', result, '--not', start],
        { maxOutputBytes: LIST_MAX_OUTPUT_BYTES, timeoutMs: APPLY_TIMEOUT_MS },
      )).split('\n').filter(Boolean);
    } catch (error) {
      if (errorDetailSchema.safeParse(error).data?.code === 'command_output_too_large') {
        throw refuse.tooMany(`brings so many objects that their list is longer than ${LIST_MAX_OUTPUT_BYTES} bytes`, LIST_MAX_OUTPUT_BYTES);
      }
      throw error;
    }
    if (fresh.length > maxChangedEntries) throw refuse.tooMany(`brings more than ${maxChangedEntries} objects`, maxChangedEntries);
    const sizes = await sizesOf(g, quarantine, fresh);
    let newBytes = 0;
    for (const id of fresh) {
      const object = sizes.get(id);
      if (!object) {
        throw new SpaceError('code_out_failed', `An object of the result is missing from the quarantine: ${id}`, { cause: 'object_missing' });
      }
      newBytes += object.size;
      if (object.type !== 'blob' && object.size > MAX_OBJECT_BYTES) {
        throw new SpaceError(
          'result_too_large',
          `The work of the space holds a ${object.type} of ${object.size} bytes, more than the ${MAX_OBJECT_BYTES} bytes one of those may hold. Nothing reached the repository.`,
          { step: 'measure the result', limit: MAX_OBJECT_BYTES, objectType: object.type, objectBytes: object.size },
        );
      }
    }
    if (newBytes > maxChangedBytes) throw refuse.tooLarge(newBytes, maxChangedBytes);
    return { newBytes };
  };

  const requireFetched = async (
    g: HostGit,
    where: string,
    ref: string,
    step: string,
    expected: string,
  ): Promise<string> => {
    const found = await readRef(g, where, ref);
    if (!found || found !== expected) {
      throw new SpaceError('result_ref_missing', 'The result did not arrive, or is not the one the space said it made. Nothing was changed.', { step, cause: null });
    }
    return found;
  };

  const bringCodeOut = (request: BringCodeOutRequest): Promise<BringCodeOutResult> =>
    withHostGit('code_out_failed', async (g, directory) => {
      const {
        repository,
        spaceId,
        spacePath: requestedPath,
        timeoutMs = FETCH_TIMEOUT_MS,
        innerMarginSeconds = INNER_MARGIN_SECONDS,
        maxTransferBytes = MAX_TRANSFER_BYTES,
        maxChangedBytes = MAX_CHANGED_BYTES,
        maxChangedEntries = MAX_CHANGED_ENTRIES,
      } = request ?? {};
      requireSpaceId(spaceId);
      const spacePath = requireSpaceProjectPath(spaceId, requestedPath);
      requireTimeout(timeoutMs);
      requireInnerMargin(innerMarginSeconds);
      requireLimit(maxTransferBytes, 'maxTransferBytes');
      requireLimit(maxChangedBytes, 'maxChangedBytes');
      requireLimit(maxChangedEntries, 'maxChangedEntries');
      const limits = { maxTransferBytes, maxChangedBytes, maxChangedEntries };
      await requireGitVersion(g, directory);
      const top = await requireWorkTree(g, repository);
      const start = await requireStart(g, top, spaceId);
      const objectFormat = line(await g.output(top, ['rev-parse', '--show-object-format']));

      const execArgv = await during('reach the space', () => place.execArgv(spaceId));
      const reportedByTheSpace = await during('snapshot the space', async () => {
        const seconds = innerSeconds(SNAPSHOT_TIMEOUT_MS, innerMarginSeconds);
        const snapshot = await place.exec(spaceId, [
          IMAGE_TIMEOUT, '-s', 'KILL', String(seconds), IMAGE_SH, '-c', SNAPSHOT_SCRIPT, 'sh',
          spacePath, UNCOMMITTED_MESSAGE, SNAPSHOT_IDENTITY.GIT_COMMITTER_NAME ?? '', SNAPSHOT_IDENTITY.GIT_COMMITTER_EMAIL ?? '',
        ], { timeoutMs: SNAPSHOT_TIMEOUT_MS });
        if (snapshot.code !== 0) {
          throw new SpaceError(
            'code_out_failed',
            `Could not take the snapshot inside the space: ${tail(snapshot.stderr) || `exit code ${snapshot.code}`}`,
            { step: 'snapshot the space', cause: 'inside_command_failed', exitCode: snapshot.code },
          );
        }
        const report = readReport(snapshot.stdout);
        if (!objectIdPattern(objectFormat).test(report.result)) {
          throw new SpaceError(
            'code_out_failed',
            'The space did not say which commit its snapshot made.',
            { step: 'snapshot the space', cause: 'inside_command_failed' },
          );
        }
        return report;
      });

      const quarantine = path.join(directory, 'quarantine.git');
      const result = await during('fetch into the quarantine', async () => {
        await g.output(directory, ['init', '--quiet', '--bare', '--template=', `--object-format=${objectFormat}`, quarantine]);
        const objects = path.resolve(top, line(await g.output(top, ['rev-parse', '--git-path', 'objects'])));
        await fs.mkdir(path.join(quarantine, 'objects', 'info'), { recursive: true });
        await fs.writeFile(path.join(quarantine, 'objects', 'info', 'alternates'), `${objects.replaceAll('\\', '/')}\n`);
        const url = buildExtUrl([
          ...execArgv, IMAGE_TIMEOUT, '-s', 'KILL', String(innerSeconds(timeoutMs, innerMarginSeconds)), IMAGE_GIT, 'upload-pack', spacePath,
        ]);
        await fetchIntoQuarantine(g, quarantine, url, timeoutMs, maxTransferBytes);
        const fetched = await requireFetched(g, quarantine, QUARANTINE_RESULT, 'fetch into the quarantine', reportedByTheSpace.result);
        if (line(await g.output(quarantine, ['cat-file', '-t', fetched])) !== 'commit') {
          throw new SpaceError(
            'result_not_a_commit',
            'What the space offered as its result is not a commit. Nothing was changed.',
            { step: 'fetch into the quarantine' },
          );
        }
        return fetched;
      });
      const summary = await during('measure the result', async () => {
        const refuse: ChangeRefusal = {
          tooMany: (what, limit) => new SpaceError(
            'result_too_many_changes',
            `The work of the space ${what}, the limit of one result. Nothing reached the repository.`,
            { step: 'measure the result', limit },
          ),
          tooLarge: (bytes, limit) => new SpaceError(
            'result_too_large',
            `The work of the space brings ${bytes} bytes, more than the limit of ${limit}. Nothing reached the repository.`,
            { step: 'measure the result', limit, newBytes: bytes },
          ),
        };
        const { newBytes } = await measureHistory(g, quarantine, start, result, limits, refuse);
        const change = await measureChange(g, quarantine, start, result, {
          ...limits,
          maxChangedBytes: Number.MAX_SAFE_INTEGER,
          maxFolders: Number.MAX_SAFE_INTEGER,
          maxFolderSteps: Number.MAX_SAFE_INTEGER,
        }, refuse);
        return {
          changedPaths: change.changedPaths,
          changedBytes: change.changedBytes,
          nestedRepositories: change.nestedRepositories,
          newBytes,
        };
      });

      await during('promote the result', async () => {
        const promoted = await g.run(top, [
          ...FETCH_CONFIG, 'fetch', ...FETCH_FLAGS, quarantine.replaceAll('\\', '/'), `+${QUARANTINE_RESULT}:${resultRef(spaceId)}`,
        ], { timeoutMs, maxOutputBytes: FETCH_MAX_OUTPUT_BYTES, killTree: true });
        if (promoted.code !== 0) {
          throw new SpaceError(
            'code_out_failed',
            `Taking the result into the repository failed: ${tail(promoted.stderr) || `exit code ${promoted.code}`}`,
            { step: 'promote the result', cause: null },
          );
        }
        await requireFetched(g, top, resultRef(spaceId), 'promote the result', result);
      });
      return { result, ...summary, unmerged: reportedByTheSpace.unmerged };
    });

  const requireBranchName = async (g: HostGit, top: string, branch: string): Promise<string> => {
    const text = String(branch ?? '');
    const refused = (): SpaceError => new SpaceError('invalid_branch_name', 'That name is not one git accepts for a new branch.');
    if (text !== branch || text === '' || text.startsWith('-') || EXT_UNCARRIABLE.test(text)) throw refused();
    const check = await g.run(top, ['check-ref-format', '--branch', text]);
    if (check.code !== 0 || line(check.stdout) !== text) throw refused();
    return text;
  };

  const branchInTheWay = async (g: HostGit, top: string, name: string): Promise<string | null> => {
    const folders = name.split('/').slice(0, -1);
    for (let depth = 1; depth <= folders.length; depth += 1) {
      const above = folders.slice(0, depth).join('/');
      if (await readRef(g, top, `refs/heads/${above}`)) return above;
    }
    const below = line(await g.output(top, ['for-each-ref', '--count=1', '--format=%(refname)', `refs/heads/${name}/`]));
    return below === '' ? null : below.slice('refs/heads/'.length);
  };

  const applyAsBranch = (request: ApplyAsBranchRequest): Promise<ApplyAsBranchResult> =>
    withHostGit('code_out_failed', async (g, directory) => {
      const { repository, spaceId, branch } = request ?? {};
      requireSpaceId(spaceId);
      await requireGitVersion(g, directory);
      const top = await requireWorkTree(g, repository);
      const name = await requireBranchName(g, top, branch);
      const result = await requireResult(g, top, spaceId);
      const objectFormat = line(await g.output(top, ['rev-parse', '--show-object-format']));
      const existsErr = (): SpaceError => new SpaceError(
        'branch_exists',
        `A branch named ${name} already exists. Choose another name; the existing branch was not changed.`,
      );
      if (await readRef(g, top, `refs/heads/${name}`)) throw existsErr();
      const created = await g.run(top, [
        'update-ref',
        '-m', `openchamber: work of space ${spaceId}`,
        `refs/heads/${name}`,
        result,
        zeroObjectId(objectFormat),
      ]);
      if (created.code !== 0) {
        if (await readRef(g, top, `refs/heads/${name}`)) throw existsErr();
        const clash = await branchInTheWay(g, top, name);
        if (clash !== null) {
          throw new SpaceError(
            'branch_exists',
            `A branch named ${clash} already exists, and git cannot keep a branch named ${name} beside it. Choose another name; the existing branch was not changed.`,
            { branch: clash },
          );
        }
        throw new SpaceError('git_command_failed', `Could not create the branch ${name}: ${tail(created.stderr) || `exit code ${created.code}`}`, { exitCode: created.code });
      }
      return { branch: name, commit: result };
    });

  const readSetting = async (g: HostGit, top: string, key: string): Promise<boolean> =>
    line((await g.run(top, ['config', '--bool', '--get', key])).stdout) === 'true';

  const exists = (full: string): Promise<boolean> => fs.lstat(full).then(() => true, () => false);

  const writePatch = (g: HostGit, top: string, from: string, to: string, file: string): Promise<string> =>
    g.output(top, [...PATCH_ARGS, `--output=${file}`, from, to], { timeoutMs: APPLY_TIMEOUT_MS });

  const dryRun = (g: HostGit, top: string, patch: string, { reverse = false } = {}): Promise<RunCommandResult> =>
    g.run(top, [...APPLY_ARGS, '--check', ...(reverse ? ['--reverse'] : []), patch], {
      timeoutMs: APPLY_TIMEOUT_MS,
      maxOutputBytes: APPLY_OUTPUT_TAIL_BYTES,
      keepTail: true,
      killTree: true,
    });

  const startCall = (g: HostGit, directory: string, top: string): CallState => ({
    g,
    directory,
    top,
    until: Date.now() + readBackTimeoutMs,
    listings: new Map(),
    patches: new Map(),
    files: 0,
    settings: null,
    readings: new Map(),
    folders: new Map(),
    commits: new Map(),
  });

  const undecided = (failed: string | null = null): SpaceError => new SpaceError(
    'changes_undecided',
    failed === null
      ? `Reading your project back took longer than ${Math.round(readBackTimeoutMs / 1000)} seconds, so it is not known how much of what was last applied from this space is still there.`
      : `Reading your project back failed, so it is not known how much of what was last applied from this space is still there. ${failed}`,
    failed === null ? { limitMs: readBackTimeoutMs } : { limitMs: readBackTimeoutMs, cause: 'read_back_failed' },
  );

  const readingBack = (call: CallState): HostGit => {
    const run = async (where: string, args: readonly string[], options: Parameters<HostGit['run']>[2] = {}): Promise<RunCommandResult> => {
      const left = call.until - Date.now();
      if (left <= 0) throw undecided();
      try {
        return await call.g.run(where, args, { ...options, killTree: true, timeoutMs: Math.min(options.timeoutMs ?? APPLY_TIMEOUT_MS, left) });
      } catch (error) {
        const code = errorDetailSchema.safeParse(error).data?.code;
        if (code === 'command_timeout' || code === 'command_output_too_large') throw undecided();
        throw error;
      }
    };
    const output = async (where: string, args: readonly string[], options: Parameters<HostGit['output']>[2] = {}): Promise<string> => {
      const left = call.until - Date.now();
      if (left <= 0) throw undecided();
      try {
        return await call.g.output(where, args, { ...options, killTree: true, timeoutMs: Math.min(options.timeoutMs ?? APPLY_TIMEOUT_MS, left) });
      } catch (error) {
        const code = errorDetailSchema.safeParse(error).data?.code;
        if (code === 'command_timeout' || code === 'command_output_too_large') throw undecided();
        throw error;
      }
    };
    return { run, output };
  };

  const listed = async (call: CallState, g: HostGit, from: string, to: string): Promise<string[]> => {
    const key = `${from} ${to}`;
    const existing = call.listings.get(key);
    if (existing !== undefined) return existing;
    const computed = await listChange(g, call.top, from, to);
    call.listings.set(key, computed);
    return computed;
  };

  const patchOf = async (call: CallState, g: HostGit, from: string, to: string): Promise<{ file: string; check: RunCommandResult | null }> => {
    const key = `${from} ${to}`;
    const existing = call.patches.get(key);
    if (existing !== undefined) return existing;
    call.files += 1;
    const file = path.join(call.directory, `change-${call.files}.patch`).replaceAll('\\', '/');
    await writePatch(g, call.top, from, to, file);
    const created = { file, check: null };
    call.patches.set(key, created);
    return created;
  };

  const checkOf = async (call: CallState, g: HostGit, from: string, to: string): Promise<RunCommandResult> => {
    const patch = await patchOf(call, g, from, to);
    patch.check ??= await dryRun(g, call.top, patch.file);
    return patch.check;
  };

  const ABSENT = '000000';
  const GITLINK = '160000';
  const LINK = '120000';
  const EXECUTABLE = '100755';
  const isRegular = (side: TreeEntrySide): boolean => side.mode === '100644' || side.mode === EXECUTABLE;

  const readFlag = async (g: HostGit, top: string, key: string, fallback: boolean): Promise<boolean> => {
    const found = await g.run(top, ['config', '--bool', '--get', key]);
    return found.code === 0 ? line(found.stdout) === 'true' : fallback;
  };

  const settingsOf = async (call: CallState): Promise<TreeSettings> => {
    if (call.settings === null) {
      call.settings = {
        algorithm: line(await call.g.output(call.top, ['rev-parse', '--show-object-format'])),
        filemode: await readFlag(call.g, call.top, 'core.filemode', true),
        symlinks: await readFlag(call.g, call.top, 'core.symlinks', true),
      };
    }
    return call.settings;
  };

  const comparedPaths = async (call: CallState, g: HostGit, from: string, to: string): Promise<ComparedEntry[]> => {
    const { filemode } = await settingsOf(call);
    const fields = await listed(call, g, from, to);
    const entries: ComparedEntry[] = [];
    for (let index = 0; index + 1 < fields.length; index += 2) {
      const headerField = fields[index];
      const file = fields[index + 1];
      if (headerField === undefined || file === undefined) continue;
      const [oldMode = '', newMode = '', oldId = '', newId = ''] = headerField.slice(1).split(' ');
      if (oldMode === GITLINK || newMode === GITLINK) continue;
      if (!filemode && oldId === newId && oldMode !== LINK && newMode !== LINK) continue;
      entries.push({ path: file, from: { mode: oldMode, id: oldId }, to: { mode: newMode, id: newId } });
    }
    return entries;
  };

  const plainWay = async (call: CallState, file: string): Promise<boolean> => {
    let relative = '';
    for (const name of file.split('/').slice(0, -1)) {
      relative = relative === '' ? name : `${relative}/${name}`;
      let ok = call.folders.get(relative);
      if (ok === undefined) {
        ok = await files.lstat(path.join(call.top, ...relative.split('/'))).then((stats) => stats.isDirectory(), () => false);
        call.folders.set(relative, ok);
      }
      if (!ok) return false;
    }
    return true;
  };

  const lookAt = async (call: CallState, file: string): Promise<WorkingTreeReading> => {
    const cached = call.readings.get(file);
    if (cached !== undefined) return cached;
    const { algorithm } = await settingsOf(call);
    const full = path.join(call.top, ...file.split('/'));
    let reading: WorkingTreeReading = { kind: 'absent' };
    if (await plainWay(call, file)) {
      const stats = await files.lstat(full).catch(() => null);
      if (stats?.isSymbolicLink()) {
        const target = await files.readlink(full, { encoding: 'buffer' }).catch(() => null);
        reading = target === null ? { kind: 'other' } : { kind: 'link', raw: blobId(algorithm, target) };
      } else if (stats?.isFile()) {
        let raw: string | null | typeof CHANGED_WHILE_READ = CHANGED_WHILE_READ;
        try {
          for (let read = 0; raw === CHANGED_WHILE_READ && read < READS_OF_A_CHANGING_FILE; read += 1) {
            if (read > 0) await pause(PAUSE_BETWEEN_READS_MS);
            raw = await hashFile(files, full, algorithm, call.until);
          }
        } catch (error) {
          if (errorDetailSchema.safeParse(error).data?.code === 'command_timeout') throw undecided();
          throw error;
        }
        if (raw === null) throw undecided(`${reported([file]).paths[0] ?? file} could not be read as a plain file.`);
        if (raw === CHANGED_WHILE_READ) throw undecided(`${reported([file]).paths[0] ?? file} kept changing while it was read.`);
        reading = { kind: 'file', executable: (stats.mode & 0o100) !== 0, raw, clean: undefined };
      } else if (stats) {
        reading = { kind: 'other' };
      }
    }
    call.readings.set(file, reading);
    return reading;
  };

  const cleanIds = async (call: CallState, g: HostGit, paths: readonly string[]): Promise<void> => {
    const env = { GIT_INDEX_FILE: path.join(call.directory, 'no-index') };
    const { algorithm } = await settingsOf(call);
    const idLength = algorithm === 'sha256' ? 64 : 40;
    const asked = paths.filter((file) => {
      const entry = call.readings.get(file);
      return entry?.kind === 'file' && entry.clean === undefined;
    });
    const odd = (file: string): boolean => /[\n\r]/.test(file) || file.startsWith('"');
    const together = asked.filter((file) => !odd(file));
    const answer = async (args: readonly string[], stdin: string, count: number): Promise<string[]> => {
      const done = await g.run(call.top, args, { env, stdin, maxOutputBytes: count * (idLength + 1) + APPLY_OUTPUT_TAIL_BYTES, keepTail: true });
      const ids = done.stdout.split('\n').filter(Boolean);
      if (done.code !== 0 || ids.length !== count) throw undecided(`Git said: ${tail(done.stderr) || `exit code ${done.code}`}`);
      return ids;
    };
    if (together.length > 0) {
      const ids = await answer(['hash-object', '--stdin-paths'], together.map((file) => `${file}\n`).join(''), together.length);
      together.forEach((file, index) => {
        const entry = call.readings.get(file);
        if (entry?.kind === 'file') entry.clean = ids[index];
      });
    }
    for (const file of asked.filter(odd)) {
      const [id] = await answer(['hash-object', '--', file], '', 1);
      const entry = call.readings.get(file);
      if (entry?.kind === 'file') entry.clean = id;
    }
  };

  const fits = (settings: TreeSettings, reading: WorkingTreeReading, side: TreeEntrySide): boolean => {
    if (side.mode === ABSENT) return reading.kind === 'absent';
    if (side.mode === LINK) return reading.kind === 'link' || (!settings.symlinks && reading.kind === 'file');
    return reading.kind === 'file' && (!settings.filemode || reading.executable === (side.mode === EXECUTABLE));
  };

  const holdsRaw = (settings: TreeSettings, reading: WorkingTreeReading, side: TreeEntrySide): boolean =>
    fits(settings, reading, side)
    && (side.mode === ABSENT || ((reading.kind === 'file' || reading.kind === 'link') && reading.raw === side.id));

  const holdsClean = (settings: TreeSettings, reading: WorkingTreeReading, side: TreeEntrySide): boolean =>
    isRegular(side) && fits(settings, reading, side) && reading.kind === 'file' && reading.clean === side.id;

  const lookAtAll = async (call: CallState, entries: readonly { path: string }[]): Promise<void> => {
    let failed: Error | null = null;
    let next = 0;
    const worker = async (): Promise<void> => {
      while (failed === null && next < entries.length) {
        const entry = entries[next];
        next += 1;
        if (!entry) continue;
        try {
          await lookAt(call, entry.path);
        } catch (cause) {
          failed ??= cause instanceof Error ? cause : new Error(String(cause));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(READ_AT_ONCE, entries.length) }, worker));
    if (failed !== null) throw failed;
  };

  const sidesHeld = async (call: CallState, g: HostGit, entries: readonly ComparedEntry[]): Promise<Array<'to' | 'from' | 'neither'>> => {
    const settings = await settingsOf(call);
    await lookAtAll(call, entries);
    const readingOf = (entry: ComparedEntry): WorkingTreeReading =>
      call.readings.get(entry.path) ?? { kind: 'absent' };
    await cleanIds(
      call,
      g,
      entries
        .filter((entry) => (isRegular(entry.to) || isRegular(entry.from)) && !holdsRaw(settings, readingOf(entry), entry.to) && !holdsRaw(settings, readingOf(entry), entry.from))
        .map((entry) => entry.path),
    );
    return entries.map((entry) => {
      const reading = readingOf(entry);
      if (holdsRaw(settings, reading, entry.to)) return 'to';
      if (holdsRaw(settings, reading, entry.from)) return 'from';
      if (holdsClean(settings, reading, entry.to)) return 'to';
      if (holdsClean(settings, reading, entry.from)) return 'from';
      return 'neither';
    });
  };

  const committedAmong = async (
    call: CallState,
    g: HostGit,
    since: string | null,
    head: string | null,
    paths: readonly string[],
  ): Promise<Set<string>> => {
    if (since === head || head === null || paths.length === 0) return new Set();
    const range = since === null ? [head] : [head, `^${since}`];
    const key = range.join(' ');
    let changed = call.commits.get(key);
    if (changed === undefined) {
      const names = await g.output(
        call.top,
        ['--literal-pathspecs', 'log', '--format=', '--name-only', '-z', '--no-renames', '--no-show-signature', ...range, '--'],
        { maxOutputBytes: LIST_MAX_OUTPUT_BYTES },
      );
      changed = new Set<string>();
      for (const name of names.split('\0')) {
        if (name !== '') changed.add(name).add(name.replace(/^\n+/, ''));
      }
      call.commits.set(key, changed);
    }
    return new Set(paths.filter((file) => changed.has(file)));
  };

  const LOOK_GROWTH = 16;
  const inLooks = <Item>(list: readonly Item[]): Item[][] => {
    const looks: Item[][] = [];
    for (let at = 0, size = 1; at < list.length; at += size, size *= LOOK_GROWTH) looks.push(list.slice(at, at + size));
    return looks;
  };

  const whatBecameOf = async (
    call: CallState,
    g: HostGit,
    before: string,
    applied: string,
    { appliedHead, head, untilTrace = false }: { appliedHead: string | null; head: string | null; untilTrace?: boolean },
  ): Promise<{ kept: string[]; edited: string[]; thrown: string[]; trace: boolean }> => {
    const entries = await comparedPaths(call, g, before, applied);
    const kept: string[] = [];
    const edited: string[] = [];
    const thrown: string[] = [];
    for (const look of untilTrace ? inLooks(entries) : [entries]) {
      const held = await sidesHeld(call, g, look);
      const committed = await committedAmong(
        call,
        g,
        appliedHead,
        head,
        look.filter((_, index) => held[index] === 'from').map((entry) => entry.path),
      );
      look.forEach((entry, index) => {
        if (held[index] === 'to') kept.push(entry.path);
        else if (held[index] === 'neither' || committed.has(entry.path)) edited.push(entry.path);
        else thrown.push(entry.path);
      });
      if (untilTrace && kept.length + edited.length > 0) break;
    }
    return { kept, edited, thrown, trace: kept.length + edited.length > 0 || thrown.length === 0 };
  };

  const interruptedApplyState = async (
    call: CallState,
    g: HostGit,
    from: string,
    to: string,
  ): Promise<'finished' | 'not_started' | 'partly'> => {
    const held = await sidesHeld(call, g, await comparedPaths(call, g, from, to));
    if (held.every((side) => side === 'to')) return 'finished';
    if (held.every((side) => side === 'from')) return 'not_started';
    if (!held.includes('to') && (await checkOf(call, g, from, to)).code === 0) return 'not_started';
    if (!held.includes('from') && (await dryRun(g, call.top, (await patchOf(call, g, from, to)).file, { reverse: true })).code === 0) return 'finished';
    return 'partly';
  };

  const readInterrupted = async (
    call: CallState,
    g: HostGit,
    applying: string,
    base: string,
    others: readonly (string | null)[],
  ): Promise<{ state: 'finished' | 'not_started' | 'partly'; base: string }> => {
    const state = await interruptedApplyState(call, g, base, applying);
    if (state !== 'partly') return { state, base };
    for (const other of new Set(others.filter((candidate): candidate is string => candidate !== null && candidate !== base))) {
      const again = await interruptedApplyState(call, g, other, applying);
      if (again !== 'partly') return { state: again, base: other };
    }
    return { state, base };
  };

  const decideBase = async (
    call: CallState,
    g: HostGit,
    {
      start,
      applied,
      appliedFrom,
      appliedHead,
      head,
    }: { start: string; applied: string | null; appliedFrom: string | null; appliedHead: string | null; head: string | null },
  ): Promise<BaseDecision> => {
    if (applied === null) return { kind: 'from', from: start };
    if (appliedFrom === null) return { kind: 'from', from: applied };
    if (appliedFrom !== start && !(await whatBecameOf(call, g, start, applied, { appliedHead, head, untilTrace: true })).trace) {
      return { kind: 'from', from: start };
    }
    const last = await whatBecameOf(call, g, appliedFrom, applied, { appliedHead, head });
    const stillThere = [...last.kept, ...last.edited];
    if (last.thrown.length > 0 && stillThere.length > 0) return { kind: 'partly', partly: { gone: last.thrown, stillThere } };
    if (last.thrown.length > 0) return { kind: 'from', from: appliedFrom };
    return { kind: 'from', from: applied };
  };

  const filteredInTheWay = async (call: CallState, g: HostGit, from: string, result: string): Promise<string[]> => {
    const settings = await settingsOf(call);
    const entries = (await comparedPaths(call, g, from, result)).filter((entry) => isRegular(entry.from));
    await lookAtAll(call, entries);
    const bytesAsBefore = entries.filter((entry) => holdsRaw(settings, call.readings.get(entry.path) ?? { kind: 'absent' }, entry.from));
    if (bytesAsBefore.length === 0) return [];
    const env = { GIT_INDEX_FILE: path.join(call.directory, 'no-index') };
    const drivers = new Set(
      (await g.run(call.top, ['config', '-z', '--get-regexp', '^filter\\..*\\.(clean|process)$'])).stdout
        .split('\0')
        .filter(Boolean)
        .map((entry) => entry.slice(0, entry.indexOf('\n')).replace(/^filter\./, '').replace(/\.(?:clean|process)$/, '')),
    );
    const fields = (await g.output(call.top, ['check-attr', '-z', '--stdin', 'filter'], {
      env,
      stdin: bytesAsBefore.map((entry) => `${entry.path}\0`).join(''),
    })).split('\0');
    const covered = new Set<string>();
    for (let index = 0; index + 2 < fields.length; index += 3) {
      const filePath = fields[index];
      const driver = fields[index + 2];
      if (filePath !== undefined && driver !== undefined && drivers.has(driver)) covered.add(filePath);
    }
    const asked = bytesAsBefore.filter((entry) => covered.has(entry.path));
    await cleanIds(call, g, asked.map((entry) => entry.path));
    return asked.filter((entry) => {
      const reading = call.readings.get(entry.path);
      return reading?.kind !== 'file' || reading.clean !== entry.from.id;
    }).map((entry) => entry.path);
  };

  const differFromHead = async (call: CallState, g: HostGit, head: string | null, paths: readonly string[]): Promise<boolean> => {
    const settings = await settingsOf(call);
    const sides = new Map<string, TreeEntrySide>();
    if (head !== null) {
      const tree = await g.output(call.top, ['ls-tree', '-r', '-z', '--full-tree', head], { maxOutputBytes: LIST_MAX_OUTPUT_BYTES });
      for (const entry of tree.split('\0')) {
        const tab = entry.indexOf('\t');
        if (tab === -1) continue;
        const [mode = '', , id = ''] = entry.slice(0, tab).split(' ');
        sides.set(entry.slice(tab + 1), { mode, id });
      }
    }
    const entries = paths.map((file) => ({ path: file, head: sides.get(file) ?? { mode: ABSENT, id: '' } }));
    const readingOf = (entry: { path: string }): WorkingTreeReading =>
      call.readings.get(entry.path) ?? { kind: 'absent' };
    await cleanIds(
      call,
      g,
      entries.filter((entry) => isRegular(entry.head) && !holdsRaw(settings, readingOf(entry), entry.head)).map((entry) => entry.path),
    );
    return entries.some((entry) => !holdsRaw(settings, readingOf(entry), entry.head) && !holdsClean(settings, readingOf(entry), entry.head));
  };

  const applyTurnKey = async (g: HostGit, top: string, spaceId: string): Promise<string> => {
    const common = path.resolve(top, line(await g.output(top, ['rev-parse', '--git-common-dir'])));
    return `${await fs.realpath(common)}\0${spaceId}`;
  };

  const describeApplyState = (request: DescribeApplyStateRequest): Promise<ApplyStateDescription> =>
    withHostGit('code_out_failed', async (g, directory) => {
      const { repository, spaceId } = request ?? {};
      requireSpaceId(spaceId);
      await requireGitVersion(g, directory);
      const top = await requireWorkTree(g, repository);
      return inTurn(await applyTurnKey(g, top, spaceId), async () => {
        const call = startCall(g, directory, top);
        const back = readingBack(call);
        const start = await requireStart(g, top, spaceId);
        const result = await readRef(g, top, resultRef(spaceId));
        const lastApplied = await readRef(g, top, appliedRef(spaceId));
        const closed = await readRef(g, top, closedRef(spaceId));
        const applying = closed ? null : await readRef(g, top, applyingRef(spaceId));
        let applied = lastApplied;
        let appliedFrom = applied ? await readRef(g, top, appliedFromRef(spaceId)) : null;
        let appliedHead = applied ? await readRef(g, top, appliedHeadRef(spaceId)) : null;
        let from = applied ?? start;
        let undecidedHere = false;
        if (result) {
          try {
            let interrupted: 'finished' | 'not_started' | 'partly' | null = null;
            if (applying) {
              const recordedBase = await readRef(g, top, applyingFromRef(spaceId));
              const read = await readInterrupted(call, back, applying, recordedBase ?? lastApplied ?? start, [appliedFrom, start]);
              interrupted = read.state;
              if (interrupted === 'finished') {
                applied = applying;
                appliedFrom = read.base;
                appliedHead = await readRef(g, top, applyingHeadRef(spaceId));
              }
            }
            from = applied ?? start;
            if (!closed && interrupted !== 'partly') {
              const decision = await decideBase(call, back, { start, applied, appliedFrom, appliedHead, head: await readRef(g, top, 'HEAD') });
              from = decision.kind === 'from' ? decision.from : (applied ?? start);
            }
          } catch (error) {
            if (errorDetailSchema.safeParse(error).data?.code !== 'changes_undecided') throw error;
            undecidedHere = true;
          }
        }
        let newPaths: number | null = null;
        if (result && !undecidedHere) {
          try {
            const names = await g.output(
              top,
              ['diff-tree', '-r', '-z', '--name-only', '--no-renames', from, result],
              { maxOutputBytes: LIST_MAX_OUTPUT_BYTES, timeoutMs: APPLY_TIMEOUT_MS },
            );
            newPaths = names.split('\0').filter(Boolean).length;
          } catch (error) {
            if (errorDetailSchema.safeParse(error).data?.code !== 'command_output_too_large') throw error;
          }
        }
        return {
          changesRoute: closed ? 'closed' : 'open',
          result,
          lastApplied,
          newPaths,
          newPathsOverLimit: result !== null && newPaths === null && !undecidedHere,
          newPathsUndecided: undecidedHere,
          interruptedApply: applying !== null,
        };
      });
    });

  const preparePatch = async (
    call: CallState,
    from: string,
    result: string,
    { maxChangedBytes, maxChangedEntries }: { maxChangedBytes: number; maxChangedEntries: number },
  ): Promise<PreparedPatch> => {
    const { g, top } = call;
    const tooLarge = (what: string, limit: number): SpaceError => new SpaceError(
      'changes_too_large',
      `The work of the space is too large to apply as uncommitted changes: it ${what}. Nothing was changed. Apply it as a branch instead.`,
      { limit },
    );
    const refuse: ChangeRefusal = {
      tooMany: (what, limit) => tooLarge(what, limit),
      tooLarge: (bytes, limit) => tooLarge(`would read and write ${bytes} bytes, more than the limit of ${limit}`, limit),
    };
    const change = await measureChange(g, top, from, result, {
      maxChangedBytes, maxChangedEntries, maxFolders: maxChangedEntries, maxFolderSteps: maxChangedEntries * FOLDER_STEPS_PER_ENTRY,
    }, refuse, () => listed(call, g, from, result));
    if (change.changedPaths === 0) return { outcome: 'nothing' };
    const names = {
      ignoreCase: await readSetting(g, top, 'core.ignorecase'),
      precompose: await readSetting(g, top, 'core.precomposeunicode'),
    };
    if (change.created.length > 0) {
      const all = names.ignoreCase || names.precompose
        ? (await g.output(top, ['ls-tree', '-r', '-z', '--name-only', result], { maxOutputBytes: LIST_MAX_OUTPUT_BYTES })).split('\0').filter(Boolean)
        : [];
      const unholdable = nameNotAllowedHere(change.created, all, {
        platform, ...names, deleted: change.deleted, top, longPaths: await readSetting(g, top, 'core.longpaths'),
      });
      if (unholdable !== null) {
        const reportedPair = reported([unholdable.path, unholdable.other ?? '']).paths;
        const shown = reportedPair[0] ?? '';
        const other = reportedPair[1] ?? null;
        const details: SpaceErrorDetails = { path: shown, rule: unholdable.rule, other };
        if (unholdable.rule === 'case_only_rename') {
          throw new SpaceError(
            'case_only_rename',
            `The agent renamed ${other} to ${shown}, changing only the case of the name, and on this computer that cannot be applied as uncommitted changes, so nothing was changed. The branch holds it: apply the work as a branch, or have the agent choose a new name and bring the work out again.`,
            details,
          );
        }
        const why = unholdable.rule === 'differs_only_in_case'
          ? `differs from ${other} only in case, and this computer takes the two for one file`
          : unholdable.rule === 'path_too_long'
            ? 'is a path too long for this computer, in your project\'s folder'
            : 'has a name this computer cannot hold';
        throw new SpaceError(
          'name_not_allowed_here',
          `The agent made ${shown}, which ${why}, so nothing was changed. Have the agent rename it, then bring the work out again.`,
          details,
        );
      }
    }
    const redirected = await firstRedirectedFolder(top, change.paths, { ...names, deletedLinks: change.deletedLinks });
    if (redirected !== null) return { outcome: 'blocked', folder: redirected };
    let patch: { file: string; check: RunCommandResult | null };
    try {
      patch = await patchOf(call, g, from, result);
    } catch (error) {
      const detail = errorDetailSchema.safeParse(error).data;
      const message = error instanceof Error ? error.message : (detail?.message ?? String(error));
      throw new SpaceError(
        'patch_not_possible',
        `A patch of the work of the space could not be built, so nothing was changed. Apply it as a branch instead. Git said: ${message}`,
        { cause: detail?.code ?? null },
      );
    }
    try {
      return { outcome: 'checked', change, patch: patch.file, check: await checkOf(call, g, from, result) };
    } catch (error) {
      if (errorDetailSchema.safeParse(error).data?.code === 'command_timeout') return { outcome: 'slow' };
      throw error;
    }
  };

  const someOf = ({ count, paths }: ReportedPaths): string => {
    const named = paths.slice(0, 3);
    if (count > named.length) return `${named.join(', ')} and ${count - named.length} more`;
    if (named.length === 0) return '';
    return named.length === 1 ? (named[0] ?? '') : `${named.slice(0, -1).join(', ')} and ${named.at(-1) ?? ''}`;
  };

  const applyInTurn = async (
    call: CallState,
    spaceId: string,
    caps: { maxChangedBytes: number; maxChangedEntries: number },
  ): Promise<ApplyAsChangesResult> => {
    const { g, top } = call;
    const start = await requireStart(g, top, spaceId);
    const result = await requireResult(g, top, spaceId);
    if (await readRef(g, top, closedRef(spaceId))) {
      throw new SpaceError(
        'changes_route_closed',
        `The work of this space is no longer applied as uncommitted changes: it and your project went apart. ${BRANCH_FROM_NOW_ON}`,
      );
    }
    const closing = `openchamber: the work of space ${spaceId} is applied as a branch now`;
    const close = (): Promise<RunCommandResult> => g.run(top, ['update-ref', '-m', closing, closedRef(spaceId), result]);
    const forgetIntent = (at: string, base: string | null, head: string | null): string => [
      `delete ${applyingRef(spaceId)} ${at}\n`,
      base ? `delete ${applyingFromRef(spaceId)} ${base}\n` : '',
      head ? `delete ${applyingHeadRef(spaceId)} ${head}\n` : '',
    ].join('');
    const closeAndForget = async (at: string, base: string | null, head: string | null): Promise<boolean> =>
      (await g.run(top, ['update-ref', '-m', closing, '--stdin'], {
        stdin: `update ${closedRef(spaceId)} ${at}\n${forgetIntent(at, base, head)}`,
      })).code === 0;
    const headRecord = (head: string | null): string =>
    (head ? `update ${appliedHeadRef(spaceId)} ${head}\n` : `delete ${appliedHeadRef(spaceId)}\n`);
    let applied = await readRef(g, top, appliedRef(spaceId));
    let appliedFrom = applied ? await readRef(g, top, appliedFromRef(spaceId)) : null;
    let appliedHead = applied ? await readRef(g, top, appliedHeadRef(spaceId)) : null;
    const head = await readRef(g, top, 'HEAD');
    const back = readingBack(call);
    let intent: { at: string; base: string | null; head: string | null } | null = null;
    const applying = await readRef(g, top, applyingRef(spaceId));
    if (applying) {
      intent = { at: applying, base: await readRef(g, top, applyingFromRef(spaceId)), head: await readRef(g, top, applyingHeadRef(spaceId)) };
    }
    let decision: BaseDecision;
    try {
      if (intent) {
        const { state, base } = await readInterrupted(call, back, intent.at, intent.base ?? applied ?? start, [appliedFrom, start]);
        if (state === 'partly') {
          const recorded = await closeAndForget(intent.at, intent.base, intent.head);
          throw new SpaceError(
            'changes_partly_applied',
            `An earlier apply of the work of this space was interrupted, and part of it is in your project: look at what changed. Your project is now in a state this cannot reason about. ${BRANCH_FROM_NOW_ON}`,
            { interrupted: true, recorded },
          );
        }
        const record = state === 'finished'
          ? `update ${appliedRef(spaceId)} ${intent.at}\nupdate ${appliedFromRef(spaceId)} ${base}\n${headRecord(intent.head)}${forgetIntent(intent.at, intent.base, intent.head)}`
          : forgetIntent(intent.at, intent.base, intent.head);
        await g.output(top, ['update-ref', '-m', `openchamber: sorted out an interrupted apply of space ${spaceId}`, '--stdin'], { stdin: record });
        if (state === 'finished') {
          applied = intent.at;
          appliedFrom = base;
          appliedHead = intent.head;
        }
        intent = null;
      }
      decision = await decideBase(call, back, { start, applied, appliedFrom, appliedHead, head });
    } catch (error) {
      if (!(error instanceof SpaceError) || error.code !== 'changes_undecided') throw error;
      const recorded = intent ? await closeAndForget(intent.at, intent.base, intent.head) : (await close()).code === 0;
      throw new SpaceError('changes_undecided', `${error.message} So nothing was changed. ${BRANCH_FROM_NOW_ON}`, { ...error.details, recorded });
    }
    if (decision.kind === 'partly') {
      await close();
      const gone = reported(decision.partly.gone);
      const kept = reported(decision.partly.stillThere);
      const inTheWay = await differFromHead(call, back, head, decision.partly.stillThere).catch(() => true);
      throw new SpaceError(
        'changes_do_not_apply',
        `You threw away part of what was last applied from this space: ${someOf(gone)} ${gone.count === 1 ? 'is' : 'are'} back as before, while ${someOf(kept)} ${kept.count === 1 ? 'is' : 'are'} still there or changed since. An apply now would leave out what you threw away without a word, so nothing was changed. ${BRANCH_FROM_NOW_ON}${inTheWay ? ' Before you merge that branch or switch to it, remove or commit the files of this space that are still in your project, or git will refuse.' : ''}`,
        { thrownAway: gone, stillThere: kept },
      );
    }
    const { from } = decision;
    const prepared = await preparePatch(call, from, result, caps);
    if (prepared.outcome === 'nothing') return { status: 'nothing_to_apply' };
    if (prepared.outcome === 'blocked') {
      await close();
      const shown = reported([prepared.folder]).paths[0] ?? prepared.folder;
      throw new SpaceError(
        'changes_blocked_by_link',
        `The work of the space writes into ${shown}, which in your project is a link to another place, so nothing was changed. ${BRANCH_FROM_NOW_ON}`,
        { path: shown },
      );
    }
    if (prepared.outcome === 'slow') {
      await close();
      throw new SpaceError(
        'changes_undecided',
        `Checking whether the work of the space fits your project took longer than ${APPLY_TIMEOUT_MS / 1000} seconds, so nothing was changed. ${BRANCH_FROM_NOW_ON}`,
        { limitMs: APPLY_TIMEOUT_MS },
      );
    }
    const { change, patch, check } = prepared;
    if (check.code !== 0) {
      await close();
      const inTheWay: string[] = [];
      for (const file of change.created) {
        if (await exists(path.join(top, ...file.split('/')))) inTheWay.push(file);
      }
      const asked = inTheWay.length === 0 ? null : await g.run(top, ['check-ignore', '-z', '--stdin'], {
        stdin: inTheWay.map((file) => `${file}\0`).join(''),
        maxOutputBytes: LIST_MAX_OUTPUT_BYTES,
      }).catch(() => null);
      const ignored = asked === null ? [] : asked.stdout.split('\0').filter(Boolean);
      const said = `Git said: ${tail(check.stderr) || `exit code ${check.code}`}`;
      const filtered = ignored.length > 0 ? [] : await filteredInTheWay(call, readingBack(call), from, result).catch(() => []);
      if (filtered.length > 0) {
        const shown = reported(filtered);
        throw new SpaceError(
          'changes_do_not_apply',
          `The work of the space changes ${someOf(shown)} again, which a filter such as Git LFS handles in your project. Files like that cannot be updated as uncommitted changes a second time, so nothing was changed. ${BRANCH_FROM_NOW_ON}`,
          { exitCode: check.code, filteredInTheWay: shown },
        );
      }
      if (ignored.length > 0) {
        throw new SpaceError(
          'changes_do_not_apply',
          `Your project already has ${reported(ignored).paths[0]}, which git ignores here, and the work of the space adds a file of the same name, so nothing was changed. ${BRANCH_FROM_NOW_ON} ${said}`,
          { exitCode: check.code, ignoredInTheWay: reported(ignored) },
        );
      }
      const since = from === start ? 'since the space was made' : 'since its work was last applied here';
      throw new SpaceError(
        'changes_do_not_apply',
        `The work of the space does not fit your project any more: your project changed ${since}, so nothing was changed now. ${BRANCH_FROM_NOW_ON} ${said}`,
        { exitCode: check.code },
      );
    }
    await g.output(top, ['update-ref', '-m', `openchamber: applying the work of space ${spaceId}`, '--stdin'], {
      stdin: `update ${applyingRef(spaceId)} ${result}\nupdate ${applyingFromRef(spaceId)} ${from}\n${head ? `update ${applyingHeadRef(spaceId)} ${head}\n` : ''}`,
    });
    const done = await g.run(top, [...APPLY_ARGS, patch], {
      timeoutMs: APPLY_TIMEOUT_MS,
      maxOutputBytes: APPLY_OUTPUT_TAIL_BYTES,
      keepTail: true,
      killTree: true,
      keepAtExit: true,
    });
    if (done.code !== 0) {
      const recorded = await closeAndForget(result, from, head);
      throw new SpaceError(
        'changes_partly_applied',
        `Applying the work of the space stopped in the middle, so part of it may be in your project already: look at what changed. Your project is now in a state this cannot reason about. ${BRANCH_FROM_NOW_ON} Git said: ${tail(done.stderr) || `exit code ${done.code}`}`,
        { exitCode: done.code, recorded },
      );
    }
    const remembered = await g.run(top, ['update-ref', '-m', `openchamber: applied the work of space ${spaceId}`, '--stdin'], {
      stdin: `update ${appliedRef(spaceId)} ${result}\nupdate ${appliedFromRef(spaceId)} ${from}\n${headRecord(head)}${forgetIntent(result, from, head)}`,
    });
    return {
      status: 'applied',
      appliedPaths: change.changedPaths,
      remembered: remembered.code === 0,
      nestedRepositories: change.nestedRepositories,
      conflicted: await conflictedPaths(patch),
    };
  };

  const applyAsChanges = (request: ApplyAsChangesRequest): Promise<ApplyAsChangesResult> =>
    withHostGit('code_out_failed', async (g, directory) => {
      const {
        repository,
        spaceId,
        maxChangedBytes = MAX_CHANGED_BYTES,
        maxChangedEntries = MAX_CHANGED_ENTRIES,
      } = request ?? {};
      requireSpaceId(spaceId);
      requireLimit(maxChangedBytes, 'maxChangedBytes');
      requireLimit(maxChangedEntries, 'maxChangedEntries');
      await requireGitVersion(g, directory);
      const top = await requireWorkTree(g, repository);
      return inTurn(
        await applyTurnKey(g, top, spaceId),
        () => applyInTurn(startCall(g, directory, top), spaceId, { maxChangedBytes, maxChangedEntries }),
      );
    });

  return { bringCodeOut, applyAsBranch, applyAsChanges, describeApplyState };
}
