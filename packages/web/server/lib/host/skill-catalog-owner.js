import { z } from 'zod';
import * as C from '@openchamber/agent-contract';
import { getCuratedSkillsSources } from '../skills-catalog/curated-sources.js';
import { getCacheKey, scanWithCache } from '../skills-catalog/cache.js';
import { parseSkillRepoSource } from '../skills-catalog/source.js';
import { scanSkillsRepository } from '../skills-catalog/scan.js';
import { prepareSkillsFromRepository } from '../skills-catalog/install.js';
import { fetchGitHubRepoMetas } from '../skills-catalog/github-meta.js';
import { SkillFileError } from './skill-file-owner.js';

/** Repository download policy stays in the Host; native discovery stays in Bun. */
export function createSkillCatalogOwner({ owner, getDependencies, policyOptions, scan = scanSkillsRepository, prepare = prepareSkillsFromRepository, metadata = fetchGitHubRepoMetas }) {
  async function sources() {
    const { readSettingsFromDisk, sanitizeSkillCatalogs } = getDependencies();
    const settings = await readSettingsFromDisk();
    return [...getCuratedSkillsSources(policyOptions), ...(sanitizeSkillCatalogs(settings.skillCatalogs) ?? []).map(entry => ({
      id: entry.id, label: entry.label, description: entry.source, source: entry.source,
      defaultSubpath: entry.subpath, gitIdentityId: entry.gitIdentityId,
    }))];
  }
  async function identity(input) {
    const { resolveCatalogGitIdentity } = getDependencies();
    const result = await resolveCatalogGitIdentity(input.gitIdentityId, input.source);
    if (!result.ok) throw new SkillFileError(401, 'SKILL_INSTALL_FAILED', result.error.message);
    return result.identity;
  }
  async function items(scope, input, sourceId = '', excludedSkills = [], refresh = false) {
    const parsed = parseSkillRepoSource(input.source, { subpath: input.subpath });
    if (!parsed.ok) throw new SkillFileError(400, 'INVALID_REQUEST', parsed.error.message);
    const selectedIdentity = await identity(input);
    const { credentialResolver } = getDependencies();
    const result = await scanWithCache(getCacheKey({ normalizedRepo: `${parsed.host}/${parsed.normalizedRepo}`, ref: parsed.ref, subpath: parsed.effectiveSubpath ?? '', identityId: input.gitIdentityId ?? '' }),
      () => scan({ ...input, identity: selectedIdentity, credentialResolver }), { refresh });
    if (!result.ok) throw new SkillFileError(result.error.kind === 'authRequired' ? 401 : 400, 'SKILL_INSTALL_FAILED', result.error.message);
    const authored = await owner.catalog(scope);
    return C.SkillRepositoryItemsSchema.parse({ workspaceId: scope.workspaceId, items: result.items.filter(item => !excludedSkills.includes(item.skillName)).map(item => {
      const installed = authored.skills.find(skill => skill.scope === 'workspace' && skill.skillId === item.skillName)
        ?? authored.skills.find(skill => skill.scope === 'agent' && skill.skillId === item.skillName);
      return { ...item, sourceId, ...(input.gitIdentityId ? { gitIdentityId: input.gitIdentityId } : {}), installed: installed
        ? { isInstalled: true, scope: installed.scope, authoredSkillId: installed.skillId } : { isInstalled: false } };
    }) });
  }
  return {
    async catalog(scope) {
      const available = await sources();
      const repos = available.map(source => parseSkillRepoSource(source.source)).filter(parsed => parsed.ok && parsed.host === 'github.com').map(parsed => parsed.normalizedRepo);
      const metas = await metadata(repos);
      return C.SkillRepositoryCatalogSchema.parse({ workspaceId: scope.workspaceId, sources: available.map(({ gitIdentityId, excludedSkills, ...source }) => {
        const parsed = parseSkillRepoSource(source.source);
        const meta = parsed.ok && parsed.host === 'github.com' ? metas[parsed.normalizedRepo] : null;
        return { ...source, stars: meta?.stars ?? null, repoUpdatedAt: meta?.repoUpdatedAt ?? null };
      }) });
    },
    async source(scope, request) {
      const input = C.SkillRepositorySourceRequestSchema.parse(request);
      const source = (await sources()).find(source => source.id === input.sourceId);
      if (!source) throw new SkillFileError(404, 'NOT_FOUND', 'The skill repository is unavailable.');
      return items(scope, { source: source.source, subpath: source.defaultSubpath, gitIdentityId: source.gitIdentityId }, source.id, source.excludedSkills ?? [], input.refresh);
    },
    async scan(scope, request) { return items(scope, C.SkillRepositoryScanRequestSchema.parse(request)); },
    async install(scope, request) {
      const input = C.SkillRepositoryInstallRequestSchema.parse(request);
      const source = (await sources()).find(source => source.id === input.sourceId);
      if (!source) throw new SkillFileError(404, 'NOT_FOUND', 'The skill repository is unavailable.');
      const repository = { source: source.source, subpath: source.defaultSubpath, gitIdentityId: source.gitIdentityId };
      const authorized = await items(scope, repository, source.id, source.excludedSkills ?? []);
      if (input.selections.some(selection => !authorized.items.some(item => item.skillDir === selection.skillDir && item.installable))) {
        throw new SkillFileError(403, 'UNAUTHORIZED', 'Select an installable skill from the approved repository catalog.');
      }
      const { credentialResolver } = getDependencies();
      const selectedIdentity = await identity(repository);
      const catalog = await owner.catalog(scope);
      const conflicts = [];
      const skipped = [];
      const selections = [];
      for (const selection of input.selections) {
        const name = selection.skillDir.split('/').at(-1);
        const existing = catalog.skills.some(skill => skill.scope === input.scope && skill.skillId === name);
        const decision = input.conflictDecisions?.find(entry => entry.skillName === name)?.decision
          ?? (input.conflictPolicy === 'skipAll' ? 'skip' : input.conflictPolicy === 'overwriteAll' ? 'overwrite' : null);
        if (existing && decision === 'skip') skipped.push({ skillName: name, reason: 'Already installed (skipped)' });
        else if (existing && !decision) conflicts.push({ skillName: name, scope: input.scope });
        else selections.push({ ...selection, overwrite: existing && decision === 'overwrite' });
      }
      if (conflicts.length) return C.SkillRepositoryInstallResultSchema.parse({ ok: false, error: { kind: 'conflicts', message: 'Some skills already exist in the selected scope', conflicts } });
      if (!selections.length) return C.SkillRepositoryInstallResultSchema.parse({ ok: true, workspaceId: scope.workspaceId, installed: [], skipped, commit: null });
      const result = await prepare({ ...repository, selections, identity: selectedIdentity, credentialResolver }, async installations => {
        let commit;
        let applyFailure = null;
        try {
          commit = await owner.install(scope, input.scope, input.expectedSourceRevision, installations.map(installation => ({
            ...installation, overwrite: selections.find(selection => selection.skillDir.split('/').at(-1) === installation.name).overwrite,
          })));
        } catch (error) {
          if (!(error instanceof SkillFileError) || error.code !== 'SKILL_APPLY_FAILED') throw error;
          const persisted = z.strictObject({ result: C.SkillInstallResultSchema }).safeParse(error.details);
          if (!persisted.success) throw error;
          commit = persisted.data.result;
          applyFailure = error.message;
        }
        const repository = C.SkillRepositoryInstallSuccessSchema.parse({ ok: true, workspaceId: scope.workspaceId, installed: installations.map(installation => ({ skillName: installation.name, scope: input.scope })), skipped, commit });
        if (applyFailure || !commit.apply || !['applied', 'no-active-workers'].includes(commit.apply.status)) {
          throw new SkillFileError(503, 'SKILL_APPLY_FAILED', applyFailure ?? 'The skill source was saved, but active skill application is incomplete.',
            C.SkillRepositoryInstallFailureDetailsSchema.parse({ result: commit, repository }));
        }
        return repository;
      });
      return C.SkillRepositoryInstallResultSchema.parse(result);
    },
  };
}
