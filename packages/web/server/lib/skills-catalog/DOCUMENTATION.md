# Skills Catalog Module Documentation

## Purpose
This module scans trusted Git skill repositories and prepares installation trees for the Canonical Host Gateway. Native skill discovery and prompt expansion remain exclusively in the Bun Agent Service. Repository preparation never writes an active skill source itself.

## Entrypoints and structure
- `packages/web/server/lib/skills-catalog/`: Skills catalog module directory containing all skill-related functionality.
  - `cache.js`: In-memory cache for scan results with TTL support.
  - `curated-sources.js`: Predefined skill sources (Anthropic, OpenAI, Cursor, Matt Pocock).
  - `github-meta.js`: Best-effort GitHub repository metadata (stars, last push) with in-memory TTL cache.
  - `git.js`: Git operations helpers for cloning and auth error detection.
  - `install.js`: Skills installation from git repositories.
  - `remove-directory.js`: Deletes a clone or staging folder, retrying a delete Windows refuses for a moment.
  - `scan.js`: Skills scanning from git repositories.
  - `source.js`: Source string parsing for git repositories.

## Public API

The following functions are exported and used by the web server:

### Cache (`cache.js`)
- `getCacheKey({ normalizedRepo, subpath, identityId })`: Generate cache key for scan results.
- `getCachedScan(key)`: Retrieve cached scan result if not expired.
- `setCachedScan(key, value, ttlMs)`: Store scan result with TTL (default 3 hours).
- `scanWithCache(key, loader, { refresh })`: Run a scan loader with cache lookup, in-flight deduplication, and a global concurrency limit (2 concurrent scans); only `ok: true` results are cached.
- `clearCache()`: Clear all cached scan results.
- Scan results persist to `skills-catalog-cache.json` in the OpenChamber data dir (debounced, atomic rename) and survive server restarts within the TTL.

### Curated Sources (`curated-sources.js`)
- `getCuratedSkillsSources()`: Return list of curated skill sources (Anthropic, OpenAI, Cursor, Matt Pocock).
- `CURATED_SKILLS_SOURCES`: Constant array of predefined sources.

### GitHub Repository Metadata (`github-meta.js`)
- `fetchGitHubRepoMetas(normalizedRepos)`: Fetch `{ stars, repoUpdatedAt }` for GitHub `owner/repo` strings. Best-effort: failures resolve to `null`; in-flight requests deduplicate; results cached in memory and on disk (`skills-github-meta.json`) for three hours.
- `clearGitHubMetaCache()`: Test-only cache reset.

### Source Parsing (`source.js`)
- `parseSkillRepoSource(source, { subpath })`: Parse git repository source string into structured object with SSH/HTTPS clone URLs, normalized repo, and effective subpath. Supports SSH URLs, HTTPS URLs, and shorthand `owner/repo[/subpath]` format.

### Git Repository Scanning (`scan.js`)
- `scanSkillsRepository({ source, subpath, defaultSubpath, identity })`: Scan git repository for skills by cloning and analyzing SKILL.md files. Returns array of skill items with metadata.

### Git Repository Installation (`install.js`)
- `prepareSkillsFromRepository({ source, subpath, identity, credentialResolver, selections }, consume)`: Download selected directories using the existing noninteractive sparse checkout flow. Reject traversal, duplicate destination names and symlinks (including linked source ancestors), preserve binary supporting files, and invoke `consume` with trusted temporary staging directories. The callback finishes before cleanup, including on failure. No legacy OpenCode or compatibility destination exists.
- `../host/skill-catalog-owner.ts`: Resolves current administrator-visible builtins and configured custom repositories at use time, reuses scan/cache and Host Git identity policy, and accepts installs only by approved `sourceId` plus scanned relative skill selections. Client source URLs, identity overrides and destination paths are not install authority. License exclusions remain enforced during both listing and installation.
- `../host/skill-catalog-routes.ts`: Registers workspace `/skills/repositories` (GET), `/source`, `/scan`, and `/install` (POST) through the authenticated Canonical Gateway. Strict schemas live in `@openchamber/agent-contract` (`skill-repositories.ts`).
- The shared `skill-file-owner` commits prepared directories to workspace `.omp/skills` or the selected agent directory's `skills` root. It owns CAS, same-source staging, durable replacement recovery, a single source revision for each batch, publication and worker apply fanout. Committed persistence is reported separately from active apply failure; a prepared download is never treated as a committed source.

### Runtime surfaces and UI ownership
- Web/PWA uses the authenticated Canonical Host Gateway for repository catalog, scanning and installation.
- Electron uses the same Host routes; its renderer never downloads repositories or imports the native SDK.
- Hosted mobile uses its configured runtime gateway with identical Host authorization and enterprise catalog visibility.
- Capacitor mobile uses that same configured gateway; it has no separate local filesystem installation fallback.
- `useSkillsCatalogStore` consumes canonical schemas/client methods, preserves failed authoritative reads, deduplicates same-source loads, rejects obsolete runtime/workspace/refresh results and resets on endpoint changes. Installed badges carry the native authored source identity, independent of native discovery IDs; uninstall targets that authored identity under source CAS.
- Source repositories are user-selected downloads, not conversation-content egress. Existing Git credential policy, administrator `hideBuiltinSkillCatalogs`, and builtin license exclusions remain authoritative in the Host, not UI visibility checks.

## Internal Helpers

The following functions are internal helpers used by exported functions:

### Git Helpers (`git.js`)
- `runGit(args, options)`: Execute git command with optional SSH identity, timeout, and max buffer. Returns `{ ok, stdout, stderr, message, code, signal }`.
- `looksLikeAuthError(message)`: Detect if error message indicates authentication failure (permission denied, publickey, etc.).
- `assertGitAvailable()`: Check if git is available in PATH.

### Skill Name Validation (used in `install.js`, `scan.js`)
- `validateSkillName(skillName)`: Validate skill name against pattern `/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/` (1-64 chars, lowercase alphanumeric with hyphens).

### File System Helpers (`install.js`, `scan.js`, `remove-directory.js`)
- `removeDirectory(dir, { warn })` (`remove-directory.js`): Remove a directory recursively, trying again after 250, 500, 1000 and 2000 ms. A delete that still fails logs a warning naming the folder and leaves it; the scan or install still succeeds.
- `removeStaleCatalogFolders()` (`remove-directory.js`): Remove `openchamber-(vscode-)?skills-(scan|install)-*` folders the current user owns and that are older than an hour from the temp directory. Every scan and install starts it right before creating its own clone and does not wait for it. One sweep runs at a time per process. A folder it cannot delete stays without a log line; a failed delete removes some of its files and so makes the folder new again, and the first sweep an hour after that tries again.
- `ensureDir(dirPath)`: Ensure directory exists with recursive creation.
- `copyDirectoryNoSymlinks(srcDir, dstDir)`: Copy directory contents without symlinks, with path traversal protection.

### Git Clone Helpers (`install.js`, `scan.js`)
- `cloneRepo({ cloneUrl, identity, tempDir })`: Clone git repository with preferred partial clone (`--filter=blob:none`) and fallback. Uses non-interactive mode.

### SKILL.md Parsing (`scan.js`)
- `parseSkillMd(content)`: Parse YAML frontmatter from SKILL.md content. Returns `{ ok, frontmatter, warnings }`.

### Path Helpers (`install.js`)
- `toFsPath(repoDir, repoRelPosixPath)`: Convert POSIX path to filesystem path.

## Response Contracts

### Scan Skills Repository Response
- `ok`: Boolean indicating success.
- `normalizedRepo`: Normalized repo string (`owner/repo`).
- `effectiveSubpath`: Effective subpath used for scanning (may be from source string or defaultSubpath).
- `items`: Array of skill items with `{ repoSource, repoSubpath, skillDir, skillName, frontmatterName, description, installable, warnings }`.
- `error`: Error object with `{ kind, message }` on failure.

### Canonical Install Skills Response
- `ok: true`: `workspaceId`, native-scope `installed` entries, `skipped` entries and `commit` (`SkillInstallResult`, or null when every selection was skipped).
- `commit` retains the Host-authoritative `sourceRevision`, `persistence: committed`, and independent per-worker apply outcomes. A failed/unavailable active apply does not undo or conceal committed disk state.
- `ok: false`: Explicit conflict/download failure, never an authoritative empty install. Invalid requests and unauthorized sources use canonical Problem Details.
- A committed source with partial, failed or unavailable active application returns HTTP 503 `SKILL_APPLY_FAILED`, not HTTP success. Typed failure details retain `result: SkillInstallResult` and `repository` (installed/skipped/commit outcome). The UI parses those details, refreshes saved sources and warns without repeating the installation. `no-active-workers` is a legitimate committed HTTP success, not a claim that a worker applied it.

### Parse Source Response
- `ok`: Boolean indicating success.
- `host`: Git host (e.g., `github.com`, `gitlab.com`).
- `owner`: Repository owner.
- `repo`: Repository name.
- `cloneUrlSsh`: SSH clone URL.
- `cloneUrlHttps`: HTTPS clone URL.
- `effectiveSubpath`: Subpath for scanning (from source string or options).
- `normalizedRepo`: Normalized repo string (`owner/repo`).
- `error`: Error object with `{ kind, message }` on failure.

## Notes for Contributors

### Adding a New Skill Source
1. Add a builtin source to `curated-sources.js`, or let the user explicitly scan and save a custom repository through Settings.
2. Preserve `hideBuiltinSkillCatalogs` and per-source license exclusions. The Host resolves approved sources and credential references at request time.
3. Keep downloads in the repository preparation layer; all active source writes must pass through the shared Host source owner.

### Skill Name Validation
- All skill names must match `/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/` (1-64 chars).
- Skill names are derived from directory basenames for git repos.
- Invalid names result in non-installable skills with appropriate warnings.

### Git Cloning Strategy
- Use sparse checkout to minimize clone size: `sparse-checkout init`, `sparse-checkout set`, `checkout HEAD`.
- Preferred clone uses `--depth=1 --filter=blob:none` for partial clone with fallback to `--depth=1`.
- Always use non-interactive mode (`GIT_TERMINAL_PROMPT=0`) to avoid hangs.
- SSH keys are injected via `core.sshCommand` in git config.

### Conflict Resolution
- Installation checks for existing skills before downloading/cloning.
- Three conflict policies: `prompt`, `skipAll`, `overwriteAll`.
- Per-skill decision entries override the global policy. Conflicts use native `workspace` / `agent` scope.
- The source owner repeats CAS and overwrite checks inside its serialized transaction, so an install cannot overwrite a newer edit discovered after the catalog check.

### Why an SSH source takes its subpath only from options
An SSH URL is `git@host:owner/repo.git`, so the part after the colon is the repository itself and nothing in the URL can name a skill subpath. `options.subpath` is the only source of a subpath for an SSH source. A shorthand source reads the subpath from the URL tail, as in `owner/repo/sub/path`.

### Cache Management
- Cache keys include Git host, normalized repository, ref, subpath, and selected identity for isolation.
- Default TTL is 3 hours for both scan results and GitHub repository metadata.
- Scan and GitHub metadata caches persist to JSON files in the OpenChamber data dir, so app restarts and page refreshes reuse previous results instead of re-hitting GitHub.
- GitHub metadata lookups time out after 1.5 seconds, well under the catalog route's client request deadline, so optional enrichment never aborts catalog loading. A failed lookup is cached for five minutes, which keeps a rate-limited or failing API from being hit on every catalog load.
- Scans run through a global concurrency limiter (2 at a time) with per-key in-flight deduplication.
- The refresh button passes `refresh: true` and bypasses the cache.

### Security Considerations
- Path traversal protection in `copyDirectoryNoSymlinks`: resolves real paths and checks containment.
- Symlinks are explicitly rejected to prevent escape from skill directory.
- Git credentials are resolved only through Host-managed references. Credential IDs and source authentication overrides never become browser-install authority.
- Temporary directories are cleaned up in `finally` blocks.

### Error Handling
- All exported functions return `{ ok, ... }` result objects, not throw.
- Error kinds: `authRequired`, `networkError`, `conflicts`, `invalidSource`, `unknown`.
- Use `looksLikeAuthError` to detect SSH/HTTPS auth failures for better UX.
- Log errors to console for debugging but return structured errors to callers.

### Testing
- Run `bun run type-check`, `bun run lint`, and `bun run build` before finalizing changes.
- Consider edge cases: non-existent repos, private repos without auth, missing SKILL.md files, invalid skill names, conflicts, network failures.

## Verification Commands
- Type-check: `bun run type-check`
- Lint: `bun run lint`
- Build: `bun run build`
