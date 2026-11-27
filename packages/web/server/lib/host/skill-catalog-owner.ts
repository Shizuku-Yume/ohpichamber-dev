import { z } from 'zod';
import * as C from '@openchamber/agent-contract';
import type { EnterprisePolicyOptions } from '../enterprise-mode.js';
import type { SettingsDocument } from '../settings/settings-helpers.js';
import type { NormalizedSkillCatalog } from '../settings/settings-normalization-runtime.js';
import { getCuratedSkillsSources } from '../skills-catalog/curated-sources.js';
import { getCacheKey, scanWithCache } from '../skills-catalog/cache.js';
import { parseSkillRepoSource } from '../skills-catalog/source.js';
import { scanSkillsRepository } from '../skills-catalog/scan.js';
import { prepareSkillsFromRepository } from '../skills-catalog/install.js';
import { fetchGitHubRepoMetas } from '../skills-catalog/github-meta.js';
import type { CatalogGitIdentity, CatalogGitOptions } from '../skills-catalog/git.js';
import { SkillFileError, type SkillFileOwner, type SkillFileScope } from './skill-file-owner.js';
import type { SkillRepositoryIdentityResult } from './skill-repository-identity.js';

export interface SkillCatalogDependencies {
  readSettingsFromDisk: () => Promise<SettingsDocument>;
  sanitizeSkillCatalogs: (raw: SettingsDocument[string]) => readonly NormalizedSkillCatalog[] | undefined;
  resolveCatalogGitIdentity: (
    identityId: string | null | undefined,
    source: string,
  ) => Promise<SkillRepositoryIdentityResult>;
  credentialResolver: CatalogGitOptions['credentialResolver'];
}

export interface SkillCatalogOwnerOptions {
  owner: Pick<SkillFileOwner, 'catalog' | 'install'>;
  getDependencies: () => SkillCatalogDependencies;
  policyOptions?: EnterprisePolicyOptions | undefined;
  scan?: typeof scanSkillsRepository;
  prepare?: typeof prepareSkillsFromRepository;
  metadata?: typeof fetchGitHubRepoMetas;
}

interface AvailableSkillSource {
  id: string;
  label: string;
  description?: string | undefined;
  source: string;
  defaultSubpath?: string | undefined;
  sourceType?: 'github' | undefined;
  excludedSkills?: readonly string[] | undefined;
  gitIdentityId?: string | undefined;
}

interface ScanInput {
  source: string;
  subpath?: string | undefined;
  gitIdentityId?: string | undefined;
}

interface PlannedSelection {
  skillDir: string;
  overwrite: boolean;
}

const ScanSuccessItemSchema = z.object({
  repoSource: z.string(),
  repoSubpath: z.string().optional(),
  skillDir: z.string(),
  skillName: z.string(),
  frontmatterName: z.string().optional(),
  description: z.string().optional(),
  installable: z.boolean(),
  warnings: z.array(z.string()).optional(),
});

const ScanCacheResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    normalizedRepo: z.string().optional(),
    effectiveSubpath: z.string().nullable().optional(),
    items: z.array(ScanSuccessItemSchema),
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      kind: z.enum(['gitUnavailable', 'invalidSource', 'authRequired', 'networkError']),
      message: z.string(),
    }),
  }),
]);

const GitHubRepoMetaSchema = z.object({
  stars: z.number().int().nonnegative().nullable(),
  repoUpdatedAt: z.string().nullable(),
});
export function createSkillCatalogOwner({
  owner,
  getDependencies,
  policyOptions,
  scan = scanSkillsRepository,
  prepare = prepareSkillsFromRepository,
  metadata = fetchGitHubRepoMetas,
}: SkillCatalogOwnerOptions) {
  async function sources(): Promise<AvailableSkillSource[]> {
    const { readSettingsFromDisk, sanitizeSkillCatalogs } = getDependencies();
    const settings = await readSettingsFromDisk();
    const customSources: AvailableSkillSource[] = (sanitizeSkillCatalogs(settings.skillCatalogs) ?? []).map((entry) => ({
      id: entry.id,
      label: entry.label,
      description: entry.source,
      source: entry.source,
      defaultSubpath: entry.subpath,
      gitIdentityId: entry.gitIdentityId,
    }));
    return [...getCuratedSkillsSources(policyOptions), ...customSources];
  }

  async function identity(input: ScanInput): Promise<CatalogGitIdentity | null> {
    const { resolveCatalogGitIdentity } = getDependencies();
    const result = await resolveCatalogGitIdentity(input.gitIdentityId, input.source);
    if (!result.ok) throw new SkillFileError(401, 'SKILL_INSTALL_FAILED', result.error.message);
    return result.identity;
  }

  async function items(
    scope: SkillFileScope,
    input: ScanInput,
    sourceId = '',
    excludedSkills: readonly string[] = [],
    refresh = false,
  ): Promise<C.SkillRepositoryItems> {
    const parsed = parseSkillRepoSource(input.source, { subpath: input.subpath });
    if (!parsed.ok) throw new SkillFileError(400, 'INVALID_REQUEST', parsed.error.message);
    const selectedIdentity = await identity(input);
    const { credentialResolver } = getDependencies();
    const rawResult = await scanWithCache(
      getCacheKey({
        normalizedRepo: `${parsed.host}/${parsed.normalizedRepo}`,
        ref: parsed.ref,
        subpath: parsed.effectiveSubpath ?? '',
        identityId: input.gitIdentityId ?? '',
      }),
      () => scan({ ...input, identity: selectedIdentity, credentialResolver }),
      { refresh },
    );
    const result = ScanCacheResultSchema.parse(rawResult);
    if (!result.ok) {
      throw new SkillFileError(result.error.kind === 'authRequired' ? 401 : 503, 'SKILL_INSTALL_FAILED', result.error.message);
    }
    const authored = await owner.catalog(scope);
    return C.SkillRepositoryItemsSchema.parse({
      workspaceId: scope.workspaceId,
      items: result.items
        .filter((item) => !excludedSkills.includes(item.skillName))
        .map((item) => {
          const installed = authored.skills.find((skill) => skill.scope === 'workspace' && skill.skillId === item.skillName)
            ?? authored.skills.find((skill) => skill.scope === 'agent' && skill.skillId === item.skillName);
          const repositoryItem: z.input<typeof C.SkillRepositoryItemSchema> = {
            ...item,
            sourceId,
            installed: installed
              ? { isInstalled: true, scope: installed.scope, authoredSkillId: installed.skillId }
              : { isInstalled: false },
          };
          if (input.gitIdentityId) repositoryItem.gitIdentityId = input.gitIdentityId;
          return repositoryItem;
        }),
    });
  }

  return {
    async catalog(scope: SkillFileScope): Promise<C.SkillRepositoryCatalog> {
      const available = await sources();
      const repos: string[] = [];
      for (const source of available) {
        const parsed = parseSkillRepoSource(source.source);
        if (parsed.ok && parsed.host === 'github.com') repos.push(parsed.normalizedRepo);
      }
      const metas = await metadata(repos);
      return C.SkillRepositoryCatalogSchema.parse({
        workspaceId: scope.workspaceId,
        sources: available.map((source) => {
          const parsed = parseSkillRepoSource(source.source);
          const rawMeta = parsed.ok && parsed.host === 'github.com' ? metas[parsed.normalizedRepo] : null;
          const parsedMeta = rawMeta ? GitHubRepoMetaSchema.safeParse(rawMeta) : null;
          const meta = parsedMeta?.success ? parsedMeta.data : null;
          const entry: z.input<typeof C.SkillRepositorySourceSchema> = {
            id: source.id,
            label: source.label,
            source: source.source,
            stars: meta?.stars ?? null,
            repoUpdatedAt: meta?.repoUpdatedAt ?? null,
          };
          if (source.description !== undefined) entry.description = source.description;
          if (source.defaultSubpath !== undefined) entry.defaultSubpath = source.defaultSubpath;
          if (source.sourceType !== undefined) entry.sourceType = source.sourceType;
          return entry;
        }),
      });
    },

    async source(scope: SkillFileScope, request: C.SkillRepositorySourceRequest): Promise<C.SkillRepositoryItems> {
      const input = C.SkillRepositorySourceRequestSchema.parse(request);
      const source = (await sources()).find((entry) => entry.id === input.sourceId);
      if (!source) throw new SkillFileError(404, 'NOT_FOUND', 'The skill repository is unavailable.');
      return items(
        scope,
        { source: source.source, subpath: source.defaultSubpath, gitIdentityId: source.gitIdentityId },
        source.id,
        source.excludedSkills ?? [],
        input.refresh ?? false,
      );
    },

    async scan(scope: SkillFileScope, request: C.SkillRepositoryScanRequest): Promise<C.SkillRepositoryItems> {
      return items(scope, C.SkillRepositoryScanRequestSchema.parse(request));
    },

    async install(scope: SkillFileScope, request: C.SkillRepositoryInstallRequest): Promise<C.SkillRepositoryInstallResult> {
      const input = C.SkillRepositoryInstallRequestSchema.parse(request);
      const source = (await sources()).find((entry) => entry.id === input.sourceId);
      if (!source) throw new SkillFileError(404, 'NOT_FOUND', 'The skill repository is unavailable.');
      const repository: ScanInput = {
        source: source.source,
        subpath: source.defaultSubpath,
        gitIdentityId: source.gitIdentityId,
      };
      const authorized = await items(scope, repository, source.id, source.excludedSkills ?? []);
      if (input.selections.some((selection) => !authorized.items.some((item) => item.skillDir === selection.skillDir && item.installable))) {
        throw new SkillFileError(403, 'UNAUTHORIZED', 'Select an installable skill from the approved repository catalog.');
      }
      const { credentialResolver } = getDependencies();
      const selectedIdentity = await identity(repository);
      const catalog = await owner.catalog(scope);
      const conflicts: Array<{ skillName: string; scope: C.FileResourceScope }> = [];
      const skipped: Array<{ skillName: string; reason: string }> = [];
      const selections: PlannedSelection[] = [];
      for (const selection of input.selections) {
        const name = selection.skillDir.split('/').at(-1);
        if (!name) throw new SkillFileError(400, 'INVALID_REQUEST', 'Invalid repository skill selection.');
        const existing = catalog.skills.some((skill) => skill.scope === input.scope && skill.skillId === name);
        const decision = input.conflictDecisions?.find((entry) => entry.skillName === name)?.decision
          ?? (input.conflictPolicy === 'skipAll' ? 'skip' : input.conflictPolicy === 'overwriteAll' ? 'overwrite' : null);
        if (existing && decision === 'skip') skipped.push({ skillName: name, reason: 'Already installed (skipped)' });
        else if (existing && !decision) conflicts.push({ skillName: name, scope: input.scope });
        else selections.push({ ...selection, overwrite: existing && decision === 'overwrite' });
      }
      if (conflicts.length) {
        return C.SkillRepositoryInstallResultSchema.parse({
          ok: false,
          error: { kind: 'conflicts', message: 'Some skills already exist in the selected scope', conflicts },
        });
      }
      if (!selections.length) {
        return C.SkillRepositoryInstallResultSchema.parse({
          ok: true,
          workspaceId: scope.workspaceId,
          installed: [],
          skipped,
          commit: null,
        });
      }
      const result = await prepare({ ...repository, selections, identity: selectedIdentity, credentialResolver }, async (installations) => {
        let commit: C.SkillInstallResult;
        let applyFailure: string | null = null;
        try {
          commit = await owner.install(
            scope,
            input.scope,
            input.expectedSourceRevision,
            installations.map((installation) => ({
              ...installation,
              overwrite: selections.find((selection) => selection.skillDir.split('/').at(-1) === installation.name)?.overwrite ?? false,
            })),
          );
        } catch (error) {
          if (!(error instanceof SkillFileError) || error.code !== 'SKILL_APPLY_FAILED') throw error;
          const persisted = z.strictObject({ result: C.SkillInstallResultSchema }).safeParse(error.details);
          if (!persisted.success) throw error;
          commit = persisted.data.result;
          applyFailure = error.message;
        }
        const repositoryResult = C.SkillRepositoryInstallSuccessSchema.parse({
          ok: true,
          workspaceId: scope.workspaceId,
          installed: installations.map((installation) => ({ skillName: installation.name, scope: input.scope })),
          skipped,
          commit,
        });
        if (applyFailure || !commit.apply || !['applied', 'no-active-workers'].includes(commit.apply.status)) {
          throw new SkillFileError(
            503,
            'SKILL_APPLY_FAILED',
            applyFailure ?? 'The skill source was saved, but active skill application is incomplete.',
            C.SkillRepositoryInstallFailureDetailsSchema.parse({ result: commit, repository: repositoryResult }),
          );
        }
        return repositoryResult;
      });
      return C.SkillRepositoryInstallResultSchema.parse(result);
    },
  };
}

export type SkillCatalogOwner = ReturnType<typeof createSkillCatalogOwner>;
