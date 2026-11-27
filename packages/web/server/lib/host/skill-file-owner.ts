import { promises as fs, type Stats } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import * as C from '@openchamber/agent-contract';
import { HostSkillSourceOperationSchema, type HostSkillSourceResult } from '@openchamber/agent-service/private-protocol';

const RelativePath = C.FileResourcePathSchema;
const Scope = C.FileResourceScopeSchema;
const StageName = z.string().regex(/^\.openchamber-skill-(?:stage|backup)-[a-f0-9-]+$/);
const WriteOperationSchema = z.strictObject({ kind: z.literal('write'), target: RelativePath, content: z.string() });
const DeleteOperationSchema = z.strictObject({ kind: z.literal('delete'), target: RelativePath });
const RenameOperationSchema = z.strictObject({ kind: z.literal('rename'), target: RelativePath, destination: RelativePath });
const InstallReplacementSchema = z.strictObject({ target: RelativePath, staging: StageName, backup: StageName });
const InstallOperationSchema = z.strictObject({ kind: z.literal('install'), replacements: z.array(InstallReplacementSchema).min(1) });
const MutatePending = z.discriminatedUnion('kind', [WriteOperationSchema, DeleteOperationSchema, RenameOperationSchema]);
const Pending = z.discriminatedUnion('kind', [WriteOperationSchema, DeleteOperationSchema, RenameOperationSchema, InstallOperationSchema]);
const SourceState = z.strictObject({ revision: C.CounterSchema, pending: Pending.optional() });
const Reconciliation = z.strictObject({ sources: C.SkillSourceRevisionsSchema });
const ErrorCodeSchema = z.object({ code: z.string() });
const CurrentRevisionDetailsSchema = z.object({ currentRevision: C.CounterSchema });
const HandleFailureCodeSchema = z.enum(['CATALOG_CONFLICT', 'INVALID_REQUEST', 'UNAUTHORIZED', 'NOT_FOUND']);

type PendingOperation = z.infer<typeof Pending>;
export type SkillMutateOperation = z.infer<typeof MutatePending>;

export type SkillFileErrorCode = C.ProblemCode | 'NOT_FOUND';

export interface SkillFileScope {
  projectId: string;
  workspaceId: string;
  cwd: string;
  agentDirectory: string;
  agentDirectoryId: string;
}

export interface SkillInstallation {
  name: string;
  stagingDirectory: string;
  overwrite?: boolean | undefined;
}

export interface SkillFileServiceClient {
  request(endpoint: string, init?: RequestInit): Promise<globalThis.Response>;
}

export interface SkillFileOwnerOptions {
  service: SkillFileServiceClient;
}

interface SourceOwner {
  root: string;
  ledger: string | null;
  selectedRoot: string;
  relative: string;
}

type StoredOperation =
  | SkillMutateOperation
  | { kind: 'install'; installations: readonly SkillInstallation[] };

interface OperationRecord {
  scope: Readonly<SkillFileScope>;
  selection: C.FileResourceScope;
  expectedSourceRevision: string;
  operation: StoredOperation;
  committedRevision: string | null;
}

export class SkillFileError extends Error {
  readonly status: number;
  readonly code: SkillFileErrorCode;
  readonly details: C.JsonObject | undefined;

  constructor(status: number, code: SkillFileErrorCode, detail: string, details?: C.JsonObject) {
    super(detail);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function exists(target: string): Promise<Stats | null> {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if (ErrorCodeSchema.safeParse(error).data?.code === 'ENOENT') return null;
    throw error;
  }
}

async function confined(root: string, relative: string, createParents = false): Promise<string> {
  RelativePath.parse(relative);
  const parts = relative.split('/');
  let current = root;
  for (let index = 0; index < parts.length; index++) {
    const segment = parts[index];
    if (segment === undefined) throw new SkillFileError(400, 'INVALID_REQUEST', 'Invalid skill path segment.');
    current = path.join(current, segment);
    let stat = await exists(current);
    if (!stat && createParents && index < parts.length - 1) {
      try {
        await fs.mkdir(current, { mode: 0o700 });
      } catch (error) {
        if (ErrorCodeSchema.safeParse(error).data?.code !== 'EEXIST') throw error;
      }
      stat = await fs.lstat(current);
    }
    if (stat?.isSymbolicLink()) throw new SkillFileError(403, 'UNAUTHORIZED', 'Linked skill sources are read-only.');
    if (index < parts.length - 1 && stat && !stat.isDirectory()) {
      throw new SkillFileError(400, 'INVALID_REQUEST', 'A skill path component is not a directory.');
    }
  }
  return current;
}

async function atomicWrite(target: string, content: string): Promise<void> {
  const temporary = path.join(path.dirname(target), `.openchamber-${randomUUID()}.tmp`);
  try {
    const original = await exists(target);
    const handle = await fs.open(temporary, 'wx', original?.isFile() ? original.mode & 0o777 : 0o600);
    try {
      await handle.writeFile(content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export function createSkillFileOwner({ service }: SkillFileOwnerOptions) {
  const queues = new Map<string | null, Promise<void>>();
  const operations = new Map<string, OperationRecord>();

  function serialize<Result>(key: string | null, operation: () => Promise<Result>): Promise<Result> {
    const previous = queues.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => { }).then(operation);
    const settled = pending.then(() => { }, () => { });
    queues.set(key, settled);
    settled.then(() => {
      if (queues.get(key) === settled) queues.delete(key);
    });
    return pending;
  }

  async function source(scope: SkillFileScope, selection: C.FileResourceScope): Promise<SourceOwner> {
    const selectedRoot = await fs.realpath(selection === 'workspace' ? scope.cwd : scope.agentDirectory);
    const relative = selection === 'workspace' ? '.omp/skills' : 'skills';
    const root = path.join(selectedRoot, relative);
    let ledger: string | null;
    try {
      ledger = await confined(selectedRoot, selection === 'workspace' ? '.omp/.openchamber-skill-source.json' : '.openchamber-skill-source.json');
    } catch (error) {
      if (!(error instanceof SkillFileError && error.code === 'UNAUTHORIZED')) throw error;
      ledger = null;
    }
    return { root, ledger, selectedRoot, relative };
  }

  async function authoringRoot(owner: SourceOwner, create: boolean): Promise<void> {
    if (owner.ledger === null) throw new SkillFileError(403, 'UNAUTHORIZED', 'Linked skill sources are read-only.');
    await confined(owner.selectedRoot, create ? `${owner.relative}/.source` : owner.relative, create);
    if (!(await fs.lstat(owner.root)).isDirectory()) {
      throw new SkillFileError(400, 'INVALID_REQUEST', 'The skill source root is not a directory.');
    }
  }

  async function applyPending(owner: SourceOwner, pending: PendingOperation): Promise<void> {
    if (pending.kind === 'install') {
      for (const replacement of pending.replacements) {
        const target = await confined(owner.root, replacement.target, true);
        const staging = await confined(path.dirname(owner.root), replacement.staging);
        const backup = await confined(path.dirname(owner.root), replacement.backup);
        if (await exists(staging)) {
          if (await exists(target) && !await exists(backup)) await fs.rename(target, backup);
          await fs.rename(staging, target);
        } else if (!await exists(target)) {
          throw new Error('Committed skill staging is unavailable.');
        }
        await fs.rm(backup, { recursive: true, force: true });
      }
      return;
    }
    const target = await confined(owner.root, pending.target, pending.kind === 'write');
    if (pending.kind === 'write') {
      await atomicWrite(target, pending.content);
    } else if (pending.kind === 'delete') {
      await fs.rm(target, { recursive: true, force: true });
    } else {
      const destination = await confined(owner.root, pending.destination, true);
      if (await exists(target)) {
        if (await exists(destination)) throw new SkillFileError(409, 'CATALOG_CONFLICT', 'The destination skill already exists.');
        await fs.rename(target, destination);
      } else if (!await exists(destination)) {
        throw new SkillFileError(404, 'NOT_FOUND', 'The skill does not exist.');
      }
    }
  }

  async function state(owner: SourceOwner, recover = false): Promise<z.infer<typeof SourceState>> {
    if (owner.ledger === null) return { revision: '0' };
    let result: z.infer<typeof SourceState>;
    try {
      result = SourceState.parse(JSON.parse(await fs.readFile(owner.ledger, 'utf8')));
    } catch (error) {
      if (ErrorCodeSchema.safeParse(error).data?.code !== 'ENOENT') throw error;
      result = { revision: '0' };
    }
    if (result.pending) {
      if (!recover) throw new SkillFileError(503, 'SERVICE_UNAVAILABLE', 'The committed skill source requires Host recovery.');
      await authoringRoot(owner, true);
      await applyPending(owner, result.pending);
      result = { revision: result.revision };
      await atomicWrite(owner.ledger, JSON.stringify(result));
    }
    return result;
  }

  async function walk(root: string, relative = ''): Promise<string[]> {
    const entries = await fs.readdir(relative ? await confined(root, relative) : root, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.openchamber-')) continue;
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) files.push(...await walk(root, child));
      else if (entry.isFile()) files.push(child);
    }
    return files.sort();
  }

  function commitResult(
    scope: SkillFileScope,
    selection: C.FileResourceScope,
    revision: string,
    apply: C.SkillsApplyResult | null = null,
  ): C.SkillInstallResult {
    return C.SkillInstallResultSchema.parse({
      scope: selection === 'workspace'
        ? { kind: 'workspace', workspaceId: scope.workspaceId }
        : { kind: 'agent', agentDirectoryId: scope.agentDirectoryId },
      sourceRevision: revision,
      persistence: 'committed',
      apply,
    });
  }

  async function privateRequest(scope: SkillFileScope, operation: 'reconcile' | 'commit' | 'apply', body: C.JsonObject): Promise<C.JsonValue> {
    try {
      const response = await service.request(`/internal/workspaces/${encodeURIComponent(scope.workspaceId)}/skill-files/${operation}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const problem = C.ProblemDetailsSchema.parse(await response.json());
        throw new SkillFileError(response.status, problem.code, problem.detail, problem.details);
      }
      return C.JsonValueSchema.parse(await response.json());
    } catch (error) {
      if (error instanceof SkillFileError) throw error;
      throw new SkillFileError(503, 'SERVICE_UNAVAILABLE', 'The trusted skill source service is unavailable.');
    }
  }

  async function reconcile(scope: SkillFileScope) {
    const result = Reconciliation.safeParse(await privateRequest(scope, 'reconcile', { agentDirectoryId: scope.agentDirectoryId }));
    if (!result.success) throw new SkillFileError(503, 'SERVICE_UNAVAILABLE', 'The trusted skill source response is invalid.');
    return result.data;
  }

  async function run(
    scope: SkillFileScope,
    selection: C.FileResourceScope,
    expectedSourceRevision: string,
    operation: StoredOperation,
  ): Promise<C.SkillInstallResult> {
    Scope.parse(selection);
    C.CounterSchema.parse(expectedSourceRevision);
    const operationId = randomUUID();
    const record: OperationRecord = {
      scope: Object.freeze({ ...scope }),
      selection,
      expectedSourceRevision,
      operation,
      committedRevision: null,
    };
    operations.set(operationId, record);
    try {
      const result = C.SkillInstallResultSchema.safeParse(await privateRequest(scope, 'commit', {
        scope: selection,
        agentDirectoryId: scope.agentDirectoryId,
        expectedSourceRevision,
        operationId,
      }));
      const committed = record.committedRevision === null ? null : commitResult(scope, selection, record.committedRevision);
      if (!result.success || !committed || result.data.sourceRevision !== committed.sourceRevision
        || JSON.stringify(result.data.scope) !== JSON.stringify(committed.scope) || result.data.apply === null) {
        throw new SkillFileError(503, 'SERVICE_UNAVAILABLE', 'The trusted skill source did not acknowledge this commit.');
      }
      return result.data;
    } catch (error) {
      if (record.committedRevision !== null) {
        const details = error instanceof SkillFileError ? error.details : undefined;
        const applied = z.strictObject({ result: C.SkillsApplyResultSchema }).safeParse(details);
        const committed = commitResult(scope, selection, record.committedRevision);
        const outcome = C.SkillInstallResultSchema.safeParse({ ...committed, apply: applied.success ? applied.data.result : null });
        throw new SkillFileError(503, 'SKILL_APPLY_FAILED', 'The source was committed, but active skill application is incomplete.', {
          result: outcome.success ? outcome.data : committed,
        });
      }
      throw error;
    } finally {
      operations.delete(operationId);
    }
  }

  async function prepareInstall(owner: SourceOwner, installations: readonly SkillInstallation[]) {
    const replacements: Array<z.infer<typeof InstallReplacementSchema>> = [];
    try {
      for (const installation of installations) {
        const name = RelativePath.parse(installation.name);
        if (replacements.some((item) => item.target === name)) throw new SkillFileError(400, 'INVALID_REQUEST', 'Duplicate skill installation.');
        if (await exists(await confined(owner.root, name)) && !installation.overwrite) {
          throw new SkillFileError(409, 'CATALOG_CONFLICT', 'A skill already exists at this destination.');
        }
        const staging = `.openchamber-skill-stage-${randomUUID()}`;
        const backup = `.openchamber-skill-backup-${randomUUID()}`;
        replacements.push({ target: name, staging, backup });
        await fs.cp(installation.stagingDirectory, await confined(path.dirname(owner.root), staging), {
          recursive: true,
          errorOnExist: true,
          force: false,
          filter: async (sourcePath) => {
            if ((await fs.lstat(sourcePath)).isSymbolicLink()) {
              throw new SkillFileError(403, 'UNAUTHORIZED', 'Linked repository skill files cannot be installed.');
            }
            return true;
          },
        });
      }
      return Pending.parse({ kind: 'install', replacements });
    } catch (error) {
      for (const replacement of replacements) {
        await fs.rm(await confined(path.dirname(owner.root), replacement.staging), { recursive: true, force: true });
      }
      throw error;
    }
  }

  async function commit(record: OperationRecord): Promise<string> {
    const owner = await source(record.scope, record.selection);
    return serialize(owner.ledger, async () => {
      const current = await state(owner, true);
      if (current.revision !== record.expectedSourceRevision) {
        throw new SkillFileError(409, 'CATALOG_CONFLICT', 'The skill source changed. Reload before editing.', { currentRevision: current.revision });
      }
      await authoringRoot(owner, true);
      const revision = C.CounterSchema.parse((BigInt(current.revision) + 1n).toString());
      const pending = record.operation.kind === 'install'
        ? await prepareInstall(owner, record.operation.installations)
        : Pending.parse(record.operation);
      if (pending.kind !== 'install') {
        const target = await confined(owner.root, pending.target);
        const targetStat = await exists(target);
        if (pending.kind === 'write' && targetStat && !targetStat.isFile()) {
          throw new SkillFileError(400, 'INVALID_REQUEST', 'A skill file cannot replace a directory.');
        }
        if (pending.kind === 'rename') {
          if (!targetStat) throw new SkillFileError(404, 'NOT_FOUND', 'The skill does not exist.');
          if (await exists(await confined(owner.root, pending.destination))) {
            throw new SkillFileError(409, 'CATALOG_CONFLICT', 'The destination skill already exists.');
          }
        }
      }
      if (owner.ledger === null) throw new SkillFileError(403, 'UNAUTHORIZED', 'Linked skill sources are read-only.');
      try {
        await atomicWrite(owner.ledger, JSON.stringify({ revision, pending }));
      } catch (error) {
        if (pending.kind === 'install') {
          for (const replacement of pending.replacements) {
            await fs.rm(await confined(path.dirname(owner.root), replacement.staging), { recursive: true, force: true });
          }
        }
        throw error;
      }
      await applyPending(owner, pending);
      await atomicWrite(owner.ledger, JSON.stringify({ revision }));
      record.committedRevision = revision;
      return revision;
    });
  }

  const api = {
    async handle(raw: C.JsonValue, trustedScope: SkillFileScope | null | undefined): Promise<HostSkillSourceResult> {
      const input = HostSkillSourceOperationSchema.parse(raw);
      if (!trustedScope || input.workspaceId !== trustedScope.workspaceId || input.projectId !== trustedScope.projectId || input.agentDirectoryId !== trustedScope.agentDirectoryId) {
        return { status: 'failed', code: 'SERVICE_UNAVAILABLE' };
      }
      try {
        if (input.action === 'reconcile') {
          const sources: C.SkillSourceRevisions = { workspace: '0', agent: '0' };
          for (const selection of ['workspace', 'agent'] as const) {
            const owner = await source(trustedScope, selection);
            sources[selection] = await serialize(owner.ledger, async () => (await state(owner, true)).revision);
          }
          return { status: 'reconciled', sources };
        }
        const record = operations.get(input.operationId);
        if (!record || record.scope.workspaceId !== input.workspaceId || record.scope.projectId !== input.projectId || record.scope.agentDirectoryId !== input.agentDirectoryId
          || record.selection !== input.scope || record.expectedSourceRevision !== input.expectedSourceRevision
          || record.scope.cwd !== trustedScope.cwd || record.scope.agentDirectory !== trustedScope.agentDirectory) {
          return { status: 'failed', code: 'SERVICE_UNAVAILABLE' };
        }
        return { status: 'committed', sourceRevision: await commit(record) };
      } catch (error) {
        const rawCode = ErrorCodeSchema.safeParse(error).data?.code;
        const parsedCode = HandleFailureCodeSchema.safeParse(rawCode);
        const failure: Extract<HostSkillSourceResult, { status: 'failed' }> = {
          status: 'failed',
          code: parsedCode.success ? parsedCode.data : 'SKILL_INSTALL_FAILED',
        };
        if (error instanceof SkillFileError && error.details) {
          const revisionDetails = CurrentRevisionDetailsSchema.safeParse(error.details);
          if (revisionDetails.success) failure.currentRevision = revisionDetails.data.currentRevision;
        }
        return failure;
      }
    },

    async catalog(scope: SkillFileScope): Promise<C.SkillFileCatalogState> {
      await reconcile(scope);
      const skills: C.SkillFileCatalogState['skills'] = [];
      const sources: C.SkillSourceRevisions = { workspace: '0', agent: '0' };
      for (const selection of ['workspace', 'agent'] as const) {
        const owner = await source(scope, selection);
        await serialize(owner.ledger, async () => {
          sources[selection] = (await state(owner)).revision;
          try {
            await authoringRoot(owner, false);
          } catch (error) {
            const code = ErrorCodeSchema.safeParse(error).data?.code;
            if (code === 'UNAUTHORIZED' || code === 'ENOENT') return;
            throw error;
          }
          const files = await walk(owner.root);
          for (const file of files.filter((entry) => entry.endsWith('/SKILL.md'))) {
            const skillId = file.slice(0, -'/SKILL.md'.length);
            skills.push({
              skillId,
              name: skillId,
              scope: selection,
              files: files.filter((child) => child.startsWith(`${skillId}/`)).map((child) => child.slice(skillId.length + 1)),
            });
          }
        });
      }
      return C.SkillFileCatalogStateSchema.parse({ workspaceId: scope.workspaceId, sources, skills });
    },

    async read(
      scope: SkillFileScope,
      selection: C.FileResourceScope,
      skillId: string,
      filePath?: string,
    ): Promise<C.SkillFileRead | C.SkillFilesState> {
      Scope.parse(selection);
      RelativePath.parse(skillId);
      if (filePath) RelativePath.parse(filePath);
      await reconcile(scope);
      const owner = await source(scope, selection);
      return serialize(owner.ledger, async () => {
        const { revision: sourceRevision } = await state(owner);
        await authoringRoot(owner, false);
        if (filePath) {
          return C.SkillFileReadSchema.parse({
            workspaceId: scope.workspaceId,
            scope: selection,
            skillId,
            sourceRevision,
            filePath,
            content: await fs.readFile(await confined(owner.root, `${skillId}/${filePath}`), 'utf8'),
          });
        }
        const root = await confined(owner.root, skillId);
        const files: C.SkillFileEntry[] = [];
        for (const entryPath of await walk(root)) {
          files.push({ filePath: entryPath, content: await fs.readFile(await confined(root, entryPath), 'utf8') });
        }
        return C.SkillFilesStateSchema.parse({ workspaceId: scope.workspaceId, scope: selection, skillId, sourceRevision, files });
      });
    },

    mutate(
      scope: SkillFileScope,
      selection: C.FileResourceScope,
      expectedSourceRevision: string,
      skillId: string,
      operation: SkillMutateOperation,
    ): Promise<C.SkillInstallResult> {
      RelativePath.parse(skillId);
      return run(scope, selection, expectedSourceRevision, MutatePending.parse(operation));
    },

    install(
      scope: SkillFileScope,
      selection: C.FileResourceScope,
      expectedSourceRevision: string,
      installations: readonly SkillInstallation[],
    ): Promise<C.SkillInstallResult> {
      return run(scope, selection, expectedSourceRevision, { kind: 'install', installations });
    },

    async apply(
      scope: SkillFileScope,
      selection: C.FileResourceScope,
      expectedSourceRevision: string,
    ): Promise<C.SkillInstallResult> {
      Scope.parse(selection);
      C.CounterSchema.parse(expectedSourceRevision);
      const { sources } = await reconcile(scope);
      if (sources[selection] !== expectedSourceRevision) {
        throw new SkillFileError(409, 'CATALOG_CONFLICT', 'The skill source changed. Reload before applying.');
      }
      try {
        return commitResult(
          scope,
          selection,
          expectedSourceRevision,
          C.SkillsApplyResultSchema.parse(await privateRequest(scope, 'apply', {
            scope: selection,
            sourceRevision: expectedSourceRevision,
            agentDirectoryId: scope.agentDirectoryId,
          })),
        );
      } catch (error) {
        const errorDetails = error instanceof SkillFileError ? error.details : undefined;
        const result = z.strictObject({ result: C.SkillsApplyResultSchema }).safeParse(errorDetails);
        const committed = commitResult(scope, selection, expectedSourceRevision);
        const outcome = C.SkillInstallResultSchema.safeParse({ ...committed, apply: result.success ? result.data.result : null });
        const status = error instanceof SkillFileError ? error.status : 503;
        const code = error instanceof SkillFileError ? error.code : 'SKILL_APPLY_FAILED';
        throw new SkillFileError(status, code, 'The committed skill source could not be applied.', {
          result: outcome.success ? outcome.data : committed,
        });
      }
    },
  };
  return api;
}

export type SkillFileOwner = ReturnType<typeof createSkillFileOwner>;
