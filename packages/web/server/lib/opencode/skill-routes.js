import { buildAppliedResponse } from './config-mutation-response.js';

export const registerSkillRoutes = (app, dependencies) => {
  const {
    resolveProjectDirectory,
    resolveOptionalProjectDirectory,
    readSettingsFromDisk,
    sanitizeSkillCatalogs,
    isUnsafeSkillRelativePath,
    getSkillSources,
    discoverSkills,
    createSkill,
    updateSkill,
    deleteSkill,
    renameSkill,
    isManagedSkillPath,
    readSkillSupportingFile,
    writeSkillSupportingFile,
    deleteSkillSupportingFile,
    SKILL_SCOPE,
    SKILL_DIR,
    getCuratedSkillsSources,
    getCacheKey,
    scanWithCache,
    parseSkillRepoSource,
    scanSkillsRepository,
    installSkillsFromRepository,
    fetchGitHubRepoMetas,
    getProfiles,
    getProfile,
    createHttpsCredentialReference,
    resolveSourceControlAccount,
    credentialResolver,
  } = dependencies;

  const resolveCatalogGitIdentity = async (identityId, source) => {
    if (!identityId || identityId === 'global') return { ok: true, identity: null };

    const profile = getProfile(identityId);
    if (!profile) {
      return { ok: false, error: { kind: 'authRequired', message: 'Selected Git identity is unavailable' } };
    }

    const transport = profile.transport ?? 'system';
    if (transport === 'system') return { ok: true, identity: null };
    if (transport === 'anonymous') return { ok: true, identity: { anonymous: true, transport } };

    const parsed = parseSkillRepoSource(source);
    if (!parsed.ok) return { ok: true, identity: null };

    if (transport === 'ssh') {
      return {
        ok: true,
        identity: {
          transport,
          credentialId: profile.sshCredentialId,
          endpoint: parsed.cloneUrlSsh,
        },
      };
    }

    if (transport === 'account' && profile.account && resolveSourceControlAccount && createHttpsCredentialReference) {
      const account = await resolveSourceControlAccount(profile.account);
      if (account?.credentialId !== profile.account.accountId
        || account.status !== 'valid'
        || !Number.isSafeInteger(account.credentialRevision)
        || account.credentialRevision < 1) {
        return { ok: false, error: { kind: 'authRequired', message: 'Selected Git identity is unavailable' } };
      }

      let credentialId;
      try {
        credentialId = createHttpsCredentialReference({
          provider: profile.account.provider,
          instance: profile.account.instance,
          credentialId: account.credentialId,
          credentialRevision: account.credentialRevision,
          providerUserId: account.providerUserId,
        });
      } catch {
        return { ok: false, error: { kind: 'authRequired', message: 'Selected Git identity is unavailable' } };
      }

      return {
        ok: true,
        identity: {
          transport: 'https',
          credentialId,
          endpoint: parsed.cloneUrlHttps,
        },
      };
    }

    return { ok: false, error: { kind: 'authRequired', message: 'Selected Git identity is unavailable' } };
  };



  const listGitIdentitiesForResponse = () => {
    try {
      const profiles = getProfiles();
      return profiles.map((p) => ({ id: p.id, name: p.name }));
    } catch {
      return [];
    }
  };

  // Prefer an explicit request directory, then soft-fallback to the active
  // project / lastDirectory so repository-local skills stay visible when the
  // client omits `directory` (create already used resolveProjectDirectory).
  const resolveSkillsDirectory = async (req) => {
    const optional = await resolveOptionalProjectDirectory(req);
    if (optional.error) {
      return optional;
    }
    if (optional.directory) {
      return optional;
    }

    try {
      const fallback = await resolveProjectDirectory(req);
      if (fallback.directory) {
        return { directory: fallback.directory, error: null };
      }
    } catch {
      // ignore — listing user-scoped skills without a project is valid
    }

    return { directory: null, error: null };
  };

  app.get('/api/config/skills', async (req, res) => {
    try {
      const { directory, error } = await resolveSkillsDirectory(req);
      if (error) {
        return res.status(400).json({ error });
      }
      const skills = await discoverSkills(directory);

      // One skill at a time: each await hands the event loop back, so other
      // requests are served while hundreds of skills are read.
      const enrichedSkills = [];
      for (const skill of skills) {
        const sources = await getSkillSources(skill.name, directory, skill, { includeSupportingFiles: false });
        const skillPath = typeof skill.path === 'string' ? skill.path : null;
        enrichedSkills.push({
          ...skill,
          sources,
          renamable: Boolean(
            skillPath
            && skillPath !== '<built-in>'
            && isManagedSkillPath(skillPath, directory)
          ),
        });
      }

      res.json({ skills: enrichedSkills });
    } catch (error) {
      console.error('Failed to list skills:', error);
      res.status(500).json({ error: 'Failed to list skills' });
    }
  });

  app.get('/api/config/skills/catalog', async (req, res) => {
    try {
      const { error } = await resolveOptionalProjectDirectory(req);
      if (error) {
        return res.status(400).json({ error });
      }

      const curatedSources = getCuratedSkillsSources();
      const settings = await readSettingsFromDisk();
      const customSourcesRaw = sanitizeSkillCatalogs(settings.skillCatalogs) || [];

      const customSources = customSourcesRaw.map((entry) => ({
        id: entry.id,
        label: entry.label,
        description: entry.source,
        source: entry.source,
        defaultSubpath: entry.subpath,
        gitIdentityId: entry.gitIdentityId,
      }));

      const sources = [...curatedSources, ...customSources];

      const githubRepos = sources
        .map((src) => parseSkillRepoSource(src.source))
        .filter((parsed) => parsed.ok && parsed.host === 'github.com')
        .map((parsed) => parsed.normalizedRepo);
      const repoMetas = await fetchGitHubRepoMetas(githubRepos);

      const sourcesForUi = sources.map(({ gitIdentityId, excludedSkills, ...rest }) => {
        const parsed = parseSkillRepoSource(rest.source);
        const meta = parsed.ok && parsed.host === 'github.com'
          ? repoMetas[parsed.normalizedRepo] || {}
          : {};
        return {
          ...rest,
          stars: typeof meta.stars === 'number' ? meta.stars : null,
          repoUpdatedAt: typeof meta.repoUpdatedAt === 'string' ? meta.repoUpdatedAt : null,
        };
      });

      res.json({ ok: true, sources: sourcesForUi, itemsBySource: {} });
    } catch (error) {
      console.error('Failed to load skills catalog:', error);
      res.status(500).json({ ok: false, error: { kind: 'unknown', message: error.message || 'Failed to load catalog' } });
    }
  });

  app.get('/api/config/skills/catalog/source', async (req, res) => {
    try {
      const { directory, error } = await resolveSkillsDirectory(req);
      if (error) {
        return res.status(400).json({ ok: false, error: { kind: 'invalidSource', message: error } });
      }

      const sourceId = typeof req.query.sourceId === 'string' ? req.query.sourceId : null;
      if (!sourceId) {
        return res.status(400).json({ ok: false, error: { kind: 'invalidSource', message: 'Missing sourceId' } });
      }

      const refresh = String(req.query.refresh || '').toLowerCase() === 'true';

      const curatedSources = getCuratedSkillsSources();
      const settings = await readSettingsFromDisk();
      const customSourcesRaw = sanitizeSkillCatalogs(settings.skillCatalogs) || [];

      const customSources = customSourcesRaw.map((entry) => ({
        id: entry.id,
        label: entry.label,
        description: entry.source,
        source: entry.source,
        defaultSubpath: entry.subpath,
        gitIdentityId: entry.gitIdentityId,
      }));

      const sources = [...curatedSources, ...customSources];
      const src = sources.find((entry) => entry.id === sourceId);

      if (!src) {
        return res.status(404).json({ ok: false, error: { kind: 'invalidSource', message: 'Unknown source' } });
      }

      const resolvedDiscovered = await discoverSkills(directory);
      const installedByName = new Map(resolvedDiscovered.map((s) => [s.name, s]));

      const parsed = parseSkillRepoSource(src.source);
      if (!parsed.ok) {
        return res.status(400).json({ ok: false, error: parsed.error });
      }

      const effectiveSubpath = src.defaultSubpath || parsed.effectiveSubpath || null;
      const cacheKey = getCacheKey({
        normalizedRepo: parsed.normalizedRepo,
        ref: parsed.ref,
        subpath: effectiveSubpath || '',
        identityId: src.gitIdentityId || '',
      });
      const resolvedIdentity = await resolveCatalogGitIdentity(src.gitIdentityId, src.source);
      if (!resolvedIdentity.ok) {
        return res.status(401).json({
          ok: false,
          error: { ...resolvedIdentity.error, identities: listGitIdentitiesForResponse() },
        });
      }

      const scanResult = await scanWithCache(
        cacheKey,
        () => scanSkillsRepository({
          source: src.source,
          subpath: src.defaultSubpath,
          defaultSubpath: src.defaultSubpath,
          identity: resolvedIdentity.identity,
          credentialResolver,
        }),
        { refresh },
      );

      if (!scanResult.ok) {
        if (scanResult.error?.kind === 'authRequired') {
          return res.status(401).json({
            ok: false,
            error: { ...scanResult.error, identities: listGitIdentitiesForResponse() },
          });
        }
        return res.status(500).json({ ok: false, error: scanResult.error });
      }

      const excludedSkills = new Set(src.excludedSkills || []);
      const items = (scanResult.items || []).filter((item) => !excludedSkills.has(item.skillName)).map((item) => {
        const installed = installedByName.get(item.skillName);
        return {
          sourceId: src.id,
          ...item,
          gitIdentityId: src.gitIdentityId,
          installed: installed
            ? { isInstalled: true, scope: installed.scope, source: installed.source }
            : { isInstalled: false },
        };
      });

      return res.json({ ok: true, items });
    } catch (error) {
      console.error('Failed to load catalog source:', error);
      return res.status(500).json({
        ok: false,
        error: { kind: 'unknown', message: error.message || 'Failed to load catalog source' },
      });
    }
  });

  app.post('/api/config/skills/scan', async (req, res) => {
    try {
      const { source, subpath, gitIdentityId } = req.body || {};
      const resolvedIdentity = await resolveCatalogGitIdentity(gitIdentityId, source);
      if (!resolvedIdentity.ok) {
        return res.status(401).json({
          ok: false,
          error: { ...resolvedIdentity.error, identities: listGitIdentitiesForResponse() },
        });
      }

      const result = await scanSkillsRepository({
        source,
        subpath,
        identity: resolvedIdentity.identity,
        credentialResolver,
      });

      if (!result.ok) {
        if (result.error?.kind === 'authRequired') {
          return res.status(401).json({
            ok: false,
            error: {
              ...result.error,
              identities: listGitIdentitiesForResponse(),
            },
          });
        }

        return res.status(400).json({ ok: false, error: result.error });
      }

      res.json({ ok: true, items: result.items });
    } catch (error) {
      console.error('Failed to scan skills repository:', error);
      res.status(500).json({ ok: false, error: { kind: 'unknown', message: error.message || 'Failed to scan repository' } });
    }
  });

  app.post('/api/config/skills/install', async (req, res) => {
    try {
      const {
        source,
        subpath,
        gitIdentityId,
        scope,
        targetSource,
        selections,
        conflictPolicy,
        conflictDecisions,
      } = req.body || {};

      let workingDirectory = null;
      if (scope === 'project') {
        const resolved = await resolveProjectDirectory(req);
        if (!resolved.directory) {
          return res.status(400).json({
            ok: false,
            error: { kind: 'invalidSource', message: resolved.error || 'Project installs require a directory parameter' },
          });
        }
        workingDirectory = resolved.directory;
      }

      const resolvedIdentity = await resolveCatalogGitIdentity(gitIdentityId, source);
      if (!resolvedIdentity.ok) {
        return res.status(401).json({
          ok: false,
          error: { ...resolvedIdentity.error, identities: listGitIdentitiesForResponse() },
        });
      }

      const result = await installSkillsFromRepository({
        source,
        subpath,
        identity: resolvedIdentity.identity,
        credentialResolver,
        scope,
        targetSource,
        workingDirectory,
        userSkillDir: SKILL_DIR,
        selections,
        conflictPolicy,
        conflictDecisions,
      });

      if (!result.ok) {
        if (result.error?.kind === 'conflicts') {
          return res.status(409).json({ ok: false, error: result.error });
        }

        if (result.error?.kind === 'authRequired') {
          return res.status(401).json({
            ok: false,
            error: {
              ...result.error,
              identities: listGitIdentitiesForResponse(),
            },
          });
        }

        return res.status(400).json({ ok: false, error: result.error });
      }

      const installed = result.installed || [];
      const skipped = result.skipped || [];
      const installedAny = installed.length > 0;

      res.json({
        ok: true,
        installed,
        skipped,
        ...(installedAny
          ? buildAppliedResponse('Skills installed successfully.')
          : {
            requiresReload: false,
            message: 'No skills were installed',
          }),
      });
    } catch (error) {
      console.error('Failed to install skills:', error);
      res.status(500).json({ ok: false, error: { kind: 'unknown', message: error.message || 'Failed to install skills' } });
    }
  });

  app.get('/api/config/skills/:name', async (req, res) => {
    try {
      const skillName = req.params.name;
      const { directory, error } = await resolveSkillsDirectory(req);
      if (error) {
        return res.status(400).json({ error });
      }
      const discoveredSkill = (await discoverSkills(directory))
        .find((skill) => skill.name === skillName) || null;
      const sources = await getSkillSources(skillName, directory, discoveredSkill);

      res.json({
        name: skillName,
        sources: sources,
        scope: sources.md.scope,
        source: sources.md.source,
        exists: sources.md.exists
      });
    } catch (error) {
      console.error('Failed to get skill sources:', error);
      res.status(500).json({ error: 'Failed to get skill configuration metadata' });
    }
  });

  app.get('/api/config/skills/:name/files/*filePath', async (req, res) => {
    try {
      const skillName = req.params.name;
      const filePath = decodeURIComponent(req.params.filePath);
      if (isUnsafeSkillRelativePath(filePath)) {
        return res.status(400).json({ error: 'Invalid file path' });
      }
      const { directory, error } = await resolveSkillsDirectory(req);
      if (error) {
        return res.status(400).json({ error });
      }

      const discoveredSkill = (await discoverSkills(directory))
        .find((skill) => skill.name === skillName) || null;
      const sources = await getSkillSources(skillName, directory, discoveredSkill);
      if (!sources.md.exists || !sources.md.dir) {
        return res.status(404).json({ error: 'Skill not found' });
      }

      const content = readSkillSupportingFile(sources.md.dir, filePath);
      if (content === null) {
        return res.status(404).json({ error: 'File not found' });
      }

      res.json({ path: filePath, content });
    } catch (error) {
      if (error && typeof error === 'object' && (error.code === 'EACCES' || error.code === 'EPERM')) {
        return res.status(403).json({ error: 'Access to file denied' });
      }
      console.error('Failed to read skill file:', error);
      res.status(500).json({ error: 'Failed to read skill file' });
    }
  });

  app.post('/api/config/skills/:name', async (req, res) => {
    try {
      const skillName = req.params.name;
      const { scope, source: skillSource, ...config } = req.body;
      const { directory, error } = scope === SKILL_SCOPE.PROJECT
        ? await resolveProjectDirectory(req)
        : await resolveSkillsDirectory(req);
      if (error || (scope === SKILL_SCOPE.PROJECT && !directory)) {
        return res.status(400).json({ error: error || 'Project skill creation requires a directory' });
      }

      console.log('[Server] Creating skill:', skillName);
      console.log('[Server] Scope:', scope, 'Working directory:', directory);

      await createSkill(skillName, { ...config, source: skillSource }, directory, scope);
      res.json(buildAppliedResponse(
        `Skill ${skillName} created successfully.`,
      ));
    } catch (error) {
      console.error('Failed to create skill:', error);
      res.status(500).json({ error: error.message || 'Failed to create skill' });
    }
  });

  app.patch('/api/config/skills/:name', async (req, res) => {
    try {
      const skillName = req.params.name;
      const updates = req.body;
      const { directory, error } = await resolveSkillsDirectory(req);
      if (error) {
        return res.status(400).json({ error });
      }

      if (typeof updates?.renameTo === 'string') {
        const newName = updates.renameTo.trim();
        console.log(`[Server] Renaming skill: ${skillName} -> ${newName}`);
        console.log('[Server] Working directory:', directory);
        await renameSkill(skillName, newName, directory);
        return res.json({
          ...buildAppliedResponse(`Skill renamed to ${newName} successfully.`),
          name: newName,
        });
      }

      console.log(`[Server] Updating skill: ${skillName}`);
      console.log('[Server] Working directory:', directory);

      await updateSkill(skillName, updates, directory, updates?.targetPath);
      res.json(buildAppliedResponse(
        `Skill ${skillName} updated successfully.`,
      ));
    } catch (error) {
      console.error('[Server] Failed to update skill:', error);
      res.status(500).json({ error: error.message || 'Failed to update skill' });
    }
  });

  app.put('/api/config/skills/:name/files/*filePath', async (req, res) => {
    try {
      const skillName = req.params.name;
      const filePath = decodeURIComponent(req.params.filePath);
      if (isUnsafeSkillRelativePath(filePath)) {
        return res.status(400).json({ error: 'Invalid file path' });
      }
      const { content } = req.body;
      const { directory, error } = await resolveSkillsDirectory(req);
      if (error) {
        return res.status(400).json({ error });
      }

      const discoveredSkill = (await discoverSkills(directory))
        .find((skill) => skill.name === skillName) || null;
      const sources = await getSkillSources(skillName, directory, discoveredSkill);
      if (!sources.md.exists || !sources.md.dir) {
        return res.status(404).json({ error: 'Skill not found' });
      }

      writeSkillSupportingFile(sources.md.dir, filePath, content || '');

      res.json({
        success: true,
        message: `File ${filePath} saved successfully`,
      });
    } catch (error) {
      if (error && typeof error === 'object' && (error.code === 'EACCES' || error.code === 'EPERM')) {
        return res.status(403).json({ error: 'Access to file denied' });
      }
      console.error('Failed to write skill file:', error);
      res.status(500).json({ error: error.message || 'Failed to write skill file' });
    }
  });

  app.delete('/api/config/skills/:name/files/*filePath', async (req, res) => {
    try {
      const skillName = req.params.name;
      const filePath = decodeURIComponent(req.params.filePath);
      if (isUnsafeSkillRelativePath(filePath)) {
        return res.status(400).json({ error: 'Invalid file path' });
      }
      const { directory, error } = await resolveSkillsDirectory(req);
      if (error) {
        return res.status(400).json({ error });
      }

      const discoveredSkill = (await discoverSkills(directory))
        .find((skill) => skill.name === skillName) || null;
      const sources = await getSkillSources(skillName, directory, discoveredSkill);
      if (!sources.md.exists || !sources.md.dir) {
        return res.status(404).json({ error: 'Skill not found' });
      }

      deleteSkillSupportingFile(sources.md.dir, filePath);

      res.json({
        success: true,
        message: `File ${filePath} deleted successfully`,
      });
    } catch (error) {
      if (error && typeof error === 'object' && (error.code === 'EACCES' || error.code === 'EPERM')) {
        return res.status(403).json({ error: 'Access to file denied' });
      }
      console.error('Failed to delete skill file:', error);
      res.status(500).json({ error: error.message || 'Failed to delete skill file' });
    }
  });

  app.delete('/api/config/skills/:name', async (req, res) => {
    try {
      const skillName = req.params.name;
      const { directory, error } = await resolveSkillsDirectory(req);
      if (error) {
        return res.status(400).json({ error });
      }

      deleteSkill(skillName, directory);
      res.json(buildAppliedResponse(
        `Skill ${skillName} deleted successfully.`,
      ));
    } catch (error) {
      console.error('Failed to delete skill:', error);
      res.status(500).json({ error: error.message || 'Failed to delete skill' });
    }
  });
};
