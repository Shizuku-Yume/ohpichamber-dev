import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect } from 'vitest';
import { z } from 'zod';

import { createCodeIn } from './code-in.js';
import type { CodeInChannel, CodeInPlace, CreateCodeInOptions } from './code-in.js';
import { createCodeOut } from './code-out.js';
import type { CodeOutChannel, CodeOutPlace, CreateCodeOutOptions } from './code-out.js';
import { SpaceError } from './errors.js';
import { createHostGit, hostGitEnvironment } from './host-git.js';
import type { HostGit } from './host-git.js';
import { IMAGE_ONLY_PATH, IMAGE_SH, IMAGE_TIMEOUT } from './layout.js';
import { runCommand } from './run-command.js';

const WIN = process.platform === 'win32';
export const SECRET = 'bait-secret-do-not-travel-7f3a';
export const OBJECTS_ONLY_TEXT = 'deleted-file-only-in-objects-5c1e';

const roots: string[] = [];

export const removeTestHosts = (): void => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
};

const sha256 = (bytes: Buffer): string => crypto.createHash('sha256').update(bytes).digest('hex');
export const forConfig = (file: string): string => file.replaceAll('\\', '/');

export const SETUP_GIT: readonly string[] = ['-c', 'maintenance.auto=false', '-c', 'gc.auto=0'];

export interface CreateTestHostOptions {
  config?: string | undefined;
  identity?: boolean | undefined;
  ownHome?: boolean | undefined;
}

export interface TestHost {
  root: string;
  environment: NodeJS.ProcessEnv;
  git: HostGit;
  sh: (directory: string, args: readonly string[], options?: { input?: string | undefined }) => string;
  addConfig: (text: string) => void;
  codeIn: (place?: CodeInPlace | null, options?: Partial<Omit<CreateCodeInOptions, 'git' | 'place'>>) => CodeInChannel;
  codeOut: (place?: CodeOutPlace | null, options?: Partial<Omit<CreateCodeOutOptions, 'git' | 'place'>>) => CodeOutChannel;
}

const unconfiguredCodeInPlace: CodeInPlace = {
  exec: async () => { throw new SpaceError('space_not_found', 'no place configured'); },
  execArgv: async () => { throw new SpaceError('space_not_found', 'no place configured'); },
};

const unconfiguredCodeOutPlace: CodeOutPlace = {
  exec: async () => { throw new SpaceError('space_not_found', 'no place configured'); },
  execArgv: async () => { throw new SpaceError('space_not_found', 'no place configured'); },
};

export function createTestHost({ config = '', identity = true, ownHome = true }: CreateTestHostOptions = {}): TestHost {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-code-in-test-')));
  roots.push(root);
  const globalIgnore = path.join(root, 'global-ignore');
  fs.writeFileSync(globalIgnore, 'secret-by-global-ignore.txt\n');
  const globalConfig = path.join(root, 'gitconfig');
  fs.writeFileSync(globalConfig, [
    identity ? '[user]\n\tname = Bait Author\n\temail = bait@example.invalid' : '',
    `[core]\n\texcludesFile = ${forConfig(globalIgnore)}`,
    '[init]\n\tdefaultBranch = main',
    '[advice]\n\taddEmbeddedRepo = false\n\tdetachedHead = false',
    config,
  ].join('\n'));
  const environment: NodeJS.ProcessEnv = { ...hostGitEnvironment(process.env), GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' };
  if (ownHome) environment.HOME = root;
  const git = createHostGit({ runCommand, environment });
  const setupIdentity: NodeJS.ProcessEnv = identity
    ? {}
    : { GIT_AUTHOR_NAME: 'Setup', GIT_AUTHOR_EMAIL: 'setup@example.invalid', GIT_COMMITTER_NAME: 'Setup', GIT_COMMITTER_EMAIL: 'setup@example.invalid' };
  const sh = (directory: string, args: readonly string[], { input }: { input?: string | undefined } = {}): string => {
    const result = spawnSync('git', [...SETUP_GIT, '-C', directory, ...args], { env: { ...environment, ...setupIdentity }, input, encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} exited ${result.status}: ${result.stderr}`);
    return result.stdout;
  };
  const addConfig = (text: string): void => fs.appendFileSync(globalConfig, `\n${text}\n`);
  return {
    root,
    environment,
    git,
    sh,
    addConfig,
    codeIn: (place = null, options = {}) => createCodeIn({ git, place: place ?? unconfiguredCodeInPlace, temporaryDirectory: root, ...options }),
    codeOut: (place = null, options = {}) => createCodeOut({ git, place: place ?? unconfiguredCodeOutPlace, temporaryDirectory: root, ...options }),
  };
}

function buildBait(host: TestHost, repo: string, objectFormat: string): void {
  fs.mkdirSync(repo);
  const g = (args: readonly string[]): string => host.sh(repo, args);
  const write = (file: string, text: string): void => fs.writeFileSync(path.join(repo, file), text);
  g(['init', '--quiet', `--object-format=${objectFormat}`]);
  write('.gitignore', '.env\nnode_modules/\n');
  write('README.md', 'hello\n');
  write('run.sh', '#!/bin/sh\necho hi\n');
  write('tracked-to-edit.txt', 'one\n');
  write('tracked-to-delete.txt', `${OBJECTS_ONLY_TEXT}\n`);
  g(['add', '--all']);
  g(['update-index', '--chmod=+x', 'run.sh']);
  if (!WIN) fs.chmodSync(path.join(repo, 'run.sh'), 0o755);
  g(['commit', '--quiet', '-m', 'first']);
  for (let index = 0; index < 3; index += 1) {
    write('history.txt', `line ${index}\n`);
    g(['add', 'history.txt']);
    g(['commit', '--quiet', '-m', `history ${index}`]);
  }
  write('.env', `OPENAI_API_KEY=${SECRET}\n`);
  fs.mkdirSync(path.join(repo, 'node_modules'));
  write('node_modules/x.js', 'x\n');
  write('secret-by-global-ignore.txt', 'global ignore bait\n');
  write('staged-new.txt', 'staged\n');
  g(['add', 'staged-new.txt']);
  write('tracked-to-edit.txt', 'one\ntwo staged\n');
  g(['add', 'tracked-to-edit.txt']);
  write('tracked-to-edit.txt', 'one\ntwo staged\nthree unstaged\n');
  fs.rmSync(path.join(repo, 'tracked-to-delete.txt'));
  write('untracked plain.txt', 'untracked travels\n');
  write('юнікод.txt', 'unicode\n');
  if (!WIN) fs.symlinkSync('README.md', path.join(repo, 'link-to-readme'));
}

const baitTemplates = new Map<string, string>();

export interface BaitRepository {
  repo: string;
  g: (args: readonly string[], options?: { input?: string | undefined }) => string;
}

export function makeBait(
  host: TestHost,
  { name = 'bait repo ї', objectFormat = 'sha1' }: { name?: string | undefined; objectFormat?: string | undefined } = {},
): BaitRepository {
  let template = baitTemplates.get(objectFormat);
  if (template === undefined) {
    const builder = createTestHost();
    template = path.join(builder.root, 'template');
    buildBait(builder, template, objectFormat);
    baitTemplates.set(objectFormat, template);
  }
  const repo = path.join(host.root, name);
  fs.cpSync(template, repo, { recursive: true, verbatimSymlinks: true });
  return { repo, g: (args, options) => host.sh(repo, args, options) };
}

export const readTree = (
  g: (args: readonly string[]) => string,
  treeish: string,
): Record<string, { mode: string; id: string }> =>
  Object.fromEntries(g(['ls-tree', '-r', '-z', '--full-tree', treeish]).split('\0').filter(Boolean).map((entry) => {
    const [info = '', file = ''] = entry.split('\t');
    const [mode = '', , id = ''] = info.split(' ');
    return [file, { mode, id }];
  }));

export const blob = (g: (args: readonly string[]) => string, treeish: string, file: string): string =>
  g(['cat-file', 'blob', `${treeish}:${file}`]);

export const hostState = (directory: string) => {
  const entries: Record<string, string> = {};
  const walk = (relative: string): void => {
    for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true })) {
      const name = relative === '' ? entry.name : `${relative}/${entry.name}`;
      const full = path.join(directory, name);
      const stats = fs.lstatSync(full);
      const mode = WIN ? '' : (stats.mode & 0o7777).toString(8);
      if (stats.isSymbolicLink()) {
        entries[name] = `link ${fs.readlinkSync(full)}`;
      } else if (stats.isDirectory()) {
        entries[name] = `dir ${mode}`;
        walk(name);
      } else if (!stats.isFile()) {
        entries[name] = `${stats.isSocket() ? 'socket' : stats.isFIFO() ? 'fifo' : 'device'} ${mode}`;
      } else {
        entries[name] = `file ${mode} ${sha256(fs.readFileSync(full))}`;
      }
    }
  };
  walk('');
  return entries;
};

const LOOSE_OBJECT = /^\.git\/objects\/[0-9a-f]{2}(?:\/(?:[0-9a-f]{38}|[0-9a-f]{62}))?$/;
const NEW_PACK = /^\.git\/objects\/pack\/pack-(?:[0-9a-f]{40}|[0-9a-f]{64})\.(?:pack|idx|rev)$/;
const spaceRefPaths = (spaceId: string): string[] => [
  '.git/refs/openchamber',
  '.git/refs/openchamber/spaces',
  `.git/refs/openchamber/spaces/${spaceId}`,
  `.git/refs/openchamber/spaces/${spaceId}/start`,
];

export const unexpectedChanges = (
  before: Record<string, string>,
  after: Record<string, string>,
  { spaceIds = [], codeOut = false }: { spaceIds?: readonly string[] | undefined; codeOut?: boolean | undefined } = {},
): string[] => {
  const ownRefs = new Set(spaceIds.flatMap(spaceRefPaths));
  const resultRefs = new Set(codeOut
    ? spaceIds.flatMap((spaceId) => ['result', 'applied', 'applied-from', 'applied-head', 'applying', 'applying-from', 'applying-head', 'changes-closed'].map((name) => `.git/refs/openchamber/spaces/${spaceId}/${name}`))
    : []);
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...names].filter((name) => {
    if (before[name] === after[name]) return false;
    if (resultRefs.has(name)) return false;
    const addedOrRemoved = before[name] === undefined || after[name] === undefined;
    if (ownRefs.has(name) && addedOrRemoved) return false;
    const added = before[name] === undefined;
    if (added && codeOut && NEW_PACK.test(name)) return false;
    return !(added && LOOSE_OBJECT.test(name));
  }).sort();
};

export const shortStatus = (g: (args: readonly string[]) => string): string =>
  g(['--no-optional-locks', 'status', '--porcelain=v1', '--untracked-files=all']);

const RECEIVER = `
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const [root, behaviour, services, ...command] = process.argv.slice(2);
const [timeoutPath, dashS, signal, seconds, gitPath, service, target] = command;
if (command.length !== 7 || timeoutPath !== '/usr/bin/timeout' || dashS !== '-s' || signal !== 'KILL' || !/^[0-9]+$/.test(seconds)
  || gitPath !== '/usr/bin/git' || !services.split(',').includes(service) || !target.startsWith('/spaces/')) {
  process.stderr.write('unexpected command ' + JSON.stringify(command) + '\\n');
  process.exit(2);
}
fs.writeFileSync(path.join(root, 'last-command.json'), JSON.stringify(command));
fs.appendFileSync(path.join(root, 'commands.log'), target + '\\n');
if (behaviour === 'refuse') { process.stderr.write('refused by the space\\n'); process.exit(1); }
if (behaviour === 'flood') {
  const chunk = 'x'.repeat(65536);
  const pump = () => { while (process.stderr.write(chunk)) {} process.stderr.once('drain', pump); };
  pump();
} else if (behaviour === 'hang') {
  const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  fs.writeFileSync(path.join(root, 'hang.pid'), String(grandchild.pid));
  setInterval(() => {}, 1000);
} else {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  const slow = behaviour === 'slow';
  const child = spawn('git', [service, path.join(root, target)], {
    stdio: ['inherit', slow ? 'pipe' : 'inherit', 'inherit'],
    env: { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: ${JSON.stringify(os.devNull)} },
  });
  if (slow) {
    child.stdout.on('data', (chunk) => {
      child.stdout.pause();
      process.stdout.write(chunk);
      setTimeout(() => child.stdout.resume(), Math.ceil(chunk.length / 3000));
    });
  }
  child.on('close', (code) => {
    fs.writeFileSync(path.join(root, service + '.exit'), String(code));
    process.exitCode = code ?? 1;
  });
}
`;

export interface LocalPlaceHarness {
  root: string;
  local: (inside: string) => string;
  setBehaviour: (next: string) => void;
  inside: (args: readonly string[], options?: { env?: NodeJS.ProcessEnv | undefined; input?: string | undefined }) => { code: number | null; stdout: string; stderr: string };
  lastCommand: () => string[];
  historyPushes: () => number;
  hangPid: () => number;
  uploadPackExit: () => string | null;
  place: CodeInPlace & CodeOutPlace;
}

export function createLocalPlace(
  host: TestHost,
  behaviour = 'receive',
  spaceId = 'a1b2c3d4e5f6',
  { codeOut = false }: { codeOut?: boolean | undefined } = {},
): LocalPlaceHarness {
  const root = path.join(host.root, 'stand in 50% place');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(path.join(root, 'spaces', spaceId), { recursive: true });
  fs.mkdirSync(bin);
  const receiver = path.join(root, 'receiver.cjs');
  fs.writeFileSync(receiver, RECEIVER);
  fs.writeFileSync(path.join(bin, 'timeout'), '#!/bin/sh\nshift 3\nexec "$@"\n', { mode: 0o755 });
  const emptyConfig = path.join(root, 'inside-gitconfig');
  fs.writeFileSync(emptyConfig, '');
  const insideEnvironment: NodeJS.ProcessEnv = {
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    HOME: root,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: emptyConfig,
  };
  const local = (inside: string): string => path.join(root, inside);
  let current = behaviour;
  return {
    root,
    local,
    setBehaviour: (next) => { current = next; },
    inside: (args, { env = {}, input } = {}) => {
      const result = spawnSync('git', [...args], { env: { ...insideEnvironment, ...env }, input, encoding: 'utf8' });
      return { code: result.status, stdout: result.stdout, stderr: result.stderr };
    },
    lastCommand: () => z.array(z.string()).parse(JSON.parse(fs.readFileSync(path.join(root, 'last-command.json'), 'utf8'))),
    historyPushes: () => (fs.existsSync(path.join(root, 'commands.log'))
      ? fs.readFileSync(path.join(root, 'commands.log'), 'utf8').split('\n').filter((entry) => entry.endsWith('.openchamber-history.git')).length
      : 0),
    hangPid: () => Number(fs.readFileSync(path.join(root, 'hang.pid'), 'utf8')),
    uploadPackExit: () => (fs.existsSync(path.join(root, 'upload-pack.exit'))
      ? fs.readFileSync(path.join(root, 'upload-pack.exit'), 'utf8')
      : null),
    place: {
      execArgv: async (id) => {
        if (id !== spaceId) throw new SpaceError('space_not_found', 'no such space');
        return [process.execPath, receiver, path.join(root), current, codeOut ? 'receive-pack,upload-pack' : 'receive-pack'];
      },
      exec: async (_id, argv, { timeoutMs } = {}) => {
        const wrapped = argv[0] === IMAGE_TIMEOUT;
        const unlimited = wrapped ? argv.slice(4) : argv;
        if (wrapped) {
          expect(codeOut, 'code in runs no script under the image timeout').toBe(true);
          expect(argv.slice(1, 3)).toEqual(['-s', 'KILL']);
          expect(Number(argv[3]), 'the seconds of the inner limit').toBeGreaterThan(0);
        }
        const [shell, flag, script = '', zero = '', ...args] = unlimited;
        expect([shell, flag, zero]).toEqual([IMAGE_SH, '-c', 'sh']);
        expect(script.startsWith(IMAGE_ONLY_PATH)).toBe(true);
        const localScript = `PATH='${insideEnvironment.PATH}';${script.slice(IMAGE_ONLY_PATH.length)}`;
        return runCommand(
          '/bin/sh',
          ['-c', localScript, zero, ...args.map((arg) => (arg.startsWith('/spaces/') ? local(arg) : arg))],
          { env: insideEnvironment, timeoutMs },
        );
      },
    },
  };
}
