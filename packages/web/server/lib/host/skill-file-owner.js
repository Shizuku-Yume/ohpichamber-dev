import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import * as C from '@openchamber/agent-contract';
import { HostSkillSourceOperationSchema } from '@openchamber/agent-service/private-protocol';

const RelativePath = C.FileResourcePathSchema;
const Scope = C.FileResourceScopeSchema;
const StageName = z.string().regex(/^\.openchamber-skill-(?:stage|backup)-[a-f0-9-]+$/);
const Pending = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('write'), target: RelativePath, content: z.string() }),
  z.strictObject({ kind: z.literal('delete'), target: RelativePath }),
  z.strictObject({ kind: z.literal('rename'), target: RelativePath, destination: RelativePath }),
  z.strictObject({ kind: z.literal('install'), replacements: z.array(z.strictObject({ target: RelativePath, staging: StageName, backup: StageName })).min(1) }),
]);
const SourceState = z.strictObject({ revision: C.CounterSchema, pending: Pending.optional() });
const Reconciliation = z.strictObject({ sources: C.SkillSourceRevisionsSchema });

export class SkillFileError extends Error {
  constructor(status, code, detail, details) { super(detail); this.status = status; this.code = code; this.details = details; }
}
async function exists(target) {
  try { return await fs.lstat(target); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// The selected Host root is trusted. Managed components cannot redirect to external discovery roots.
async function confined(root, relative, createParents = false) {
  RelativePath.parse(relative);
  const parts = relative.split('/');
  let current = root;
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    let stat = await exists(current);
    if (!stat && createParents && index < parts.length - 1) {
      try { await fs.mkdir(current, { mode: 0o700 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      stat = await fs.lstat(current);
    }
    if (stat?.isSymbolicLink()) throw new SkillFileError(403, 'UNAUTHORIZED', 'Linked skill sources are read-only.');
    if (index < parts.length - 1 && stat && !stat.isDirectory()) throw new SkillFileError(400, 'INVALID_REQUEST', 'A skill path component is not a directory.');
  }
  return current;
}
async function atomicWrite(target, content) {
  const temporary = path.join(path.dirname(target), `.openchamber-${randomUUID()}.tmp`);
  try {
    const original = await exists(target);
    const handle = await fs.open(temporary, 'wx', original?.isFile() ? original.mode & 0o777 : 0o600);
    try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temporary, target);
  } finally { await fs.rm(temporary, { force: true }); }
}

/** Host commits bytes; the supervisor alone orchestrates commit, publication, discovery and admission. */
export function createSkillFileOwner({ service }) {
  const queues = new Map();
  const operations = new Map();
  function serialize(key, operation) {
    const previous = queues.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => {}).then(operation);
    const settled = pending.then(() => {}, () => {});
    queues.set(key, settled);
    settled.then(() => { if (queues.get(key) === settled) queues.delete(key); });
    return pending;
  }
  async function source(scope, selection) {
    const selectedRoot = await fs.realpath(selection === 'workspace' ? scope.cwd : scope.agentDirectory);
    const relative = selection === 'workspace' ? '.omp/skills' : 'skills';
    const root = path.join(selectedRoot, relative);
    let ledger;
    try { ledger = await confined(selectedRoot, selection === 'workspace' ? '.omp/.openchamber-skill-source.json' : '.openchamber-skill-source.json'); }
    catch (error) { if (!(error instanceof SkillFileError && error.code === 'UNAUTHORIZED')) throw error; ledger = null; }
    return { root, ledger, selectedRoot, relative };
  }
  async function authoringRoot(owner, create) {
    if (owner.ledger === null) throw new SkillFileError(403, 'UNAUTHORIZED', 'Linked skill sources are read-only.');
    await confined(owner.selectedRoot, create ? `${owner.relative}/.source` : owner.relative, create);
    if (!(await fs.lstat(owner.root)).isDirectory()) throw new SkillFileError(400, 'INVALID_REQUEST', 'The skill source root is not a directory.');
  }
  async function applyPending(owner, pending) {
    if (pending.kind === 'install') {
      for (const replacement of pending.replacements) {
        const target = await confined(owner.root, replacement.target, true);
        const staging = await confined(path.dirname(owner.root), replacement.staging);
        const backup = await confined(path.dirname(owner.root), replacement.backup);
        if (await exists(staging)) {
          if (await exists(target) && !await exists(backup)) await fs.rename(target, backup);
          await fs.rename(staging, target);
        } else if (!await exists(target)) throw new Error('Committed skill staging is unavailable.');
        await fs.rm(backup, { recursive: true, force: true });
      }
      return;
    }
    const target = await confined(owner.root, pending.target, pending.kind === 'write');
    if (pending.kind === 'write') await atomicWrite(target, pending.content);
    else if (pending.kind === 'delete') await fs.rm(target, { recursive: true, force: true });
    else {
      const destination = await confined(owner.root, pending.destination, true);
      if (await exists(target)) {
        if (await exists(destination)) throw new SkillFileError(409, 'CATALOG_CONFLICT', 'The destination skill already exists.');
        await fs.rename(target, destination);
      } else if (!await exists(destination)) throw new SkillFileError(404, 'NOT_FOUND', 'The skill does not exist.');
    }
  }
  async function state(owner, recover = false) {
    if (owner.ledger === null) return { revision: '0' };
    let result;
    try { result = SourceState.parse(JSON.parse(await fs.readFile(owner.ledger, 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; result = { revision: '0' }; }
    if (result.pending) {
      if (!recover) throw new SkillFileError(503, 'SERVICE_UNAVAILABLE', 'The committed skill source requires Host recovery.');
      // Only a supervisor-serialized trusted callback may replay filesystem intents.
      await authoringRoot(owner, true);
      await applyPending(owner, result.pending);
      result = { revision: result.revision };
      await atomicWrite(owner.ledger, JSON.stringify(result));
    }
    return result;
  }
  async function walk(root, relative = '') {
    const entries = await fs.readdir(relative ? await confined(root, relative) : root, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.openchamber-')) continue;
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) files.push(...await walk(root, child));
      else if (entry.isFile()) files.push(child);
    }
    return files.sort();
  }
  function commitResult(scope, selection, revision, apply = null) {
    return C.SkillInstallResultSchema.parse({
      scope: selection === 'workspace' ? { kind: 'workspace', workspaceId: scope.workspaceId } : { kind: 'agent', agentDirectoryId: scope.agentDirectoryId },
      sourceRevision: revision, persistence: 'committed', apply,
    });
  }
  async function privateRequest(scope, operation, body) {
    try {
      const response = await service.request(`/internal/workspaces/${encodeURIComponent(scope.workspaceId)}/skill-files/${operation}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!response.ok) {
        const problem = C.ProblemDetailsSchema.parse(await response.json());
        throw new SkillFileError(response.status, problem.code, problem.detail, problem.details);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof SkillFileError) throw error;
      throw new SkillFileError(503, 'SERVICE_UNAVAILABLE', 'The trusted skill source service is unavailable.');
    }
  }
  async function reconcile(scope) {
    const result = Reconciliation.safeParse(await privateRequest(scope, 'reconcile', { agentDirectoryId: scope.agentDirectoryId }));
    if (!result.success) throw new SkillFileError(503, 'SERVICE_UNAVAILABLE', 'The trusted skill source response is invalid.');
    return result.data;
  }
  async function run(scope, selection, expectedSourceRevision, operation) {
    Scope.parse(selection); C.CounterSchema.parse(expectedSourceRevision);
    const operationId = randomUUID();
    const record = { scope: Object.freeze({ ...scope }), selection, expectedSourceRevision, operation, committedRevision: null };
    operations.set(operationId, record);
    try {
      const result = C.SkillInstallResultSchema.safeParse(await privateRequest(scope, 'commit', { scope: selection, agentDirectoryId: scope.agentDirectoryId, expectedSourceRevision, operationId }));
      const committed = record.committedRevision === null ? null : commitResult(scope, selection, record.committedRevision);
      if (!result.success || !committed || result.data.sourceRevision !== committed.sourceRevision
        || JSON.stringify(result.data.scope) !== JSON.stringify(committed.scope) || result.data.apply === null)
        throw new SkillFileError(503, 'SERVICE_UNAVAILABLE', 'The trusted skill source did not acknowledge this commit.');
      return result.data;
    } catch (error) {
      if (record.committedRevision !== null) {
        const applied = z.strictObject({ result: C.SkillsApplyResultSchema }).safeParse(error.details);
        const committed = commitResult(scope, selection, record.committedRevision);
        const outcome = C.SkillInstallResultSchema.safeParse({ ...committed, apply: applied.success ? applied.data.result : null });
        throw new SkillFileError(503, 'SKILL_APPLY_FAILED', 'The source was committed, but active skill application is incomplete.', {
          result: outcome.success ? outcome.data : committed,
        });
      }
      throw error;
    } finally { operations.delete(operationId); }
  }
  async function prepareInstall(owner, installations) {
    const replacements = [];
    try {
      for (const installation of installations) {
        const name = RelativePath.parse(installation.name);
        if (replacements.some(item => item.target === name)) throw new SkillFileError(400, 'INVALID_REQUEST', 'Duplicate skill installation.');
        if (await exists(await confined(owner.root, name)) && !installation.overwrite) throw new SkillFileError(409, 'CATALOG_CONFLICT', 'A skill already exists at this destination.');
        const staging = `.openchamber-skill-stage-${randomUUID()}`;
        const backup = `.openchamber-skill-backup-${randomUUID()}`;
        replacements.push({ target: name, staging, backup });
        await fs.cp(installation.stagingDirectory, await confined(path.dirname(owner.root), staging), {
          recursive: true, errorOnExist: true, force: false,
          filter: async source => { if ((await fs.lstat(source)).isSymbolicLink()) throw new SkillFileError(403, 'UNAUTHORIZED', 'Linked repository skill files cannot be installed.'); return true; },
        });
      }
      return Pending.parse({ kind: 'install', replacements });
    } catch (error) {
      for (const replacement of replacements) await fs.rm(await confined(path.dirname(owner.root), replacement.staging), { recursive: true, force: true });
      throw error;
    }
  }
  async function commit(record) {
    const owner = await source(record.scope, record.selection);
    return serialize(owner.ledger, async () => {
      const current = await state(owner, true);
      if (current.revision !== record.expectedSourceRevision) throw new SkillFileError(409, 'CATALOG_CONFLICT', 'The skill source changed. Reload before editing.', { currentRevision: current.revision });
      await authoringRoot(owner, true);
      const revision = C.CounterSchema.parse((BigInt(current.revision) + 1n).toString());
      const pending = record.operation.kind === 'install'
        ? await prepareInstall(owner, record.operation.installations) : Pending.parse(record.operation);
      if (pending.kind !== 'install') {
        const target = await confined(owner.root, pending.target);
        const targetStat = await exists(target);
        if (pending.kind === 'write' && targetStat && !targetStat.isFile()) throw new SkillFileError(400, 'INVALID_REQUEST', 'A skill file cannot replace a directory.');
        if (pending.kind === 'rename') {
          if (!targetStat) throw new SkillFileError(404, 'NOT_FOUND', 'The skill does not exist.');
          if (await exists(await confined(owner.root, pending.destination))) throw new SkillFileError(409, 'CATALOG_CONFLICT', 'The destination skill already exists.');
        }
      }
      try { await atomicWrite(owner.ledger, JSON.stringify({ revision, pending })); }
      catch (error) {
        if (pending.kind === 'install') for (const replacement of pending.replacements)
          await fs.rm(await confined(path.dirname(owner.root), replacement.staging), { recursive: true, force: true });
        throw error;
      }
      await applyPending(owner, pending);
      await atomicWrite(owner.ledger, JSON.stringify({ revision }));
      record.committedRevision = revision;
      return revision;
    });
  }

  const api = {
    async handle(raw, trustedScope) {
      const input = HostSkillSourceOperationSchema.parse(raw);
      if (!trustedScope || input.workspaceId !== trustedScope.workspaceId || input.projectId !== trustedScope.projectId || input.agentDirectoryId !== trustedScope.agentDirectoryId)
        return { status: 'failed', code: 'SERVICE_UNAVAILABLE' };
      try {
        if (input.action === 'reconcile') {
          const sources = { workspace: '0', agent: '0' };
          for (const selection of ['workspace', 'agent']) {
            const owner = await source(trustedScope, selection);
            sources[selection] = await serialize(owner.ledger, async () => (await state(owner, true)).revision);
          }
          return { status: 'reconciled', sources };
        }
        const record = operations.get(input.operationId);
        if (!record || record.scope.workspaceId !== input.workspaceId || record.scope.projectId !== input.projectId || record.scope.agentDirectoryId !== input.agentDirectoryId
          || record.selection !== input.scope || record.expectedSourceRevision !== input.expectedSourceRevision
          || record.scope.cwd !== trustedScope.cwd || record.scope.agentDirectory !== trustedScope.agentDirectory)
          return { status: 'failed', code: 'SERVICE_UNAVAILABLE' };
        return { status: 'committed', sourceRevision: await commit(record) };
      } catch (error) {
        return { status: 'failed', code: ['CATALOG_CONFLICT', 'INVALID_REQUEST', 'UNAUTHORIZED', 'NOT_FOUND'].includes(error.code) ? error.code : 'SKILL_INSTALL_FAILED',
          ...(error.details?.currentRevision === undefined ? {} : { currentRevision: error.details.currentRevision }) };
      }
    },
    async catalog(scope) {
      await reconcile(scope);
      const skills = [];
      const sources = { workspace: '0', agent: '0' };
      for (const selection of ['workspace', 'agent']) {
        const owner = await source(scope, selection);
        await serialize(owner.ledger, async () => {
          sources[selection] = (await state(owner)).revision;
          try { await authoringRoot(owner, false); }
          catch (error) { if (error.code === 'UNAUTHORIZED' || error.code === 'ENOENT') return; throw error; }
          const files = await walk(owner.root);
          for (const file of files.filter(file => file.endsWith('/SKILL.md'))) {
            const skillId = file.slice(0, -'/SKILL.md'.length);
            skills.push({ skillId, name: skillId, scope: selection, files: files.filter(child => child.startsWith(`${skillId}/`)).map(child => child.slice(skillId.length + 1)) });
          }
        });
      }
      return C.SkillFileCatalogStateSchema.parse({ workspaceId: scope.workspaceId, sources, skills });
    },
    async read(scope, selection, skillId, filePath) {
      Scope.parse(selection); RelativePath.parse(skillId); if (filePath) RelativePath.parse(filePath);
      await reconcile(scope);
      const owner = await source(scope, selection);
      return serialize(owner.ledger, async () => {
        const { revision: sourceRevision } = await state(owner);
        await authoringRoot(owner, false);
        if (filePath) return C.SkillFileReadSchema.parse({ workspaceId: scope.workspaceId, scope: selection, skillId, sourceRevision, filePath,
          content: await fs.readFile(await confined(owner.root, `${skillId}/${filePath}`), 'utf8') });
        const root = await confined(owner.root, skillId);
        const files = [];
        for (const filePath of await walk(root)) files.push({ filePath, content: await fs.readFile(await confined(root, filePath), 'utf8') });
        return C.SkillFilesStateSchema.parse({ workspaceId: scope.workspaceId, scope: selection, skillId, sourceRevision, files });
      });
    },
    mutate(scope, selection, expectedSourceRevision, skillId, operation) {
      RelativePath.parse(skillId);
      return run(scope, selection, expectedSourceRevision, Pending.parse(operation));
    },
    install(scope, selection, expectedSourceRevision, installations) {
      return run(scope, selection, expectedSourceRevision, { kind: 'install', installations });
    },
    async apply(scope, selection, expectedSourceRevision) {
      Scope.parse(selection); C.CounterSchema.parse(expectedSourceRevision);
      const { sources } = await reconcile(scope);
      if (sources[selection] !== expectedSourceRevision) throw new SkillFileError(409, 'CATALOG_CONFLICT', 'The skill source changed. Reload before applying.');
      try {
        return commitResult(scope, selection, expectedSourceRevision, C.SkillsApplyResultSchema.parse(await privateRequest(scope, 'apply', {
          scope: selection, sourceRevision: expectedSourceRevision, agentDirectoryId: scope.agentDirectoryId,
        })));
      } catch (error) {
        const result = z.strictObject({ result: C.SkillsApplyResultSchema }).safeParse(error.details);
        const committed = commitResult(scope, selection, expectedSourceRevision);
        const outcome = C.SkillInstallResultSchema.safeParse({ ...committed, apply: result.success ? result.data.result : null });
        throw new SkillFileError(error.status ?? 503, error.code ?? 'SKILL_APPLY_FAILED', 'The committed skill source could not be applied.', {
          result: outcome.success ? outcome.data : committed,
        });
      }
    },
  };
  return api;
}
