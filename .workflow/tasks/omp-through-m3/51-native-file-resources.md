# 51: Native file resources: slash commands, prompt templates, and authored skills

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** <commit-sha>

**Delivers:** Canonical workspace file-resource contracts and runtime integration for custom slash commands, prompt templates (snippets), and authored skills. Implements `/commands`, `/prompt-templates`, and `/skills/files` canonical endpoints backed by native SDK loaders (`loadSlashCommands`, `loadPromptTemplates`, skill discovery and builder) in the Bun Agent Service worker. Preserves Host authoritative skill source installation and revision CAS fanout, confines storage to native `.omp/` workspace and agent directories, replaces legacy `/api/config/*` callers in UI stores, and maintains user arguments, Markdown editing, and native agent/model metadata bindings without OpenCode compatibility shims.

**Blocked by:** None
**Files:** `packages/agent-contract/src/catalogs.ts`, `packages/agent-contract/src/resources.ts`, `packages/agent-service/src/worker/catalog-resources.ts`, `packages/agent-service/src/worker/catalogs.ts`, `packages/agent-service/src/supervisor/workspace-routes.ts`, `packages/web/server/lib/host/canonical-routes.js`, `packages/web/server/lib/fs/`, `packages/ui/src/api/canonicalClient.ts`, `packages/ui/src/stores/useCommandsStore.ts`, `packages/ui/src/stores/useSkillsStore.ts`, `packages/ui/src/stores/useSnippetsStore.ts`, `packages/ui/src/components/sections/commands/`, `packages/ui/src/components/sections/skills/`, `packages/ui/src/components/sections/snippets/`, `packages/ui/src/components/chat/`, `.workflow/development.md`, `.workflow/specs/omp-through-m3.md`
**Read first:** `.workflow/specs/omp-through-m3.md` W6, W9, W10; `.workflow/omp-migration/contracts.md` §Skill operations and §Skill storage and expansion; `packages/agent-contract/src/catalogs.ts`; installed native SDK `@oh-my-pi/pi-coding-agent/src/extensibility/slash-commands.ts` (`loadSlashCommands`), `src/config/prompt-templates.ts` (`loadPromptTemplates`), and `src/extensibility/skills.ts` (`loadSkills`, `buildSkillPromptMessage`); `packages/ui/src/stores/useCommandsStore.ts`; `packages/ui/src/stores/useSkillsStore.ts`; `packages/ui/src/stores/useSnippetsStore.ts`
**Covers:** W6, W9, W10

## Installed Native SDK Owner & Evidence

Custom slash commands, prompt templates, and skills are built-in native capabilities of `@oh-my-pi/pi-coding-agent`, verified in installed source:
- `extensibility/slash-commands.ts`: exports `loadSlashCommands(options)` which loads command markdown definitions from registered providers (project `.omp/commands/`, agent directory, and builtins). Commands parse frontmatter description, body, and argument hints into typed `FileSlashCommand`.
- `config/prompt-templates.ts`: exports `loadPromptTemplates(options)` which loads templates from project `cwd/.omp/prompts/` and global `agentDir/prompts/`, and `expandPromptTemplate(text, templates)` supporting positional and inline argument substitution.
- `extensibility/skills.ts`: exports native skill discovery, filtering, and `buildSkillPromptMessage`.
- Source evidence: exact function signatures and directory conventions are verified directly in installed package sources. The speculative Host SDK proposal from earlier reports is rejected: the SDK runs strictly inside the Bun Agent Service worker, while the Host owns filesystem source commits and boundary enforcement.

## Architecture & Boundaries

- **Worker ownership:** Dedicated Bun Agent Service worker owns native SDK instances, command parsing, prompt template expansion, and skill discovery. UI and Node Host never import or execute native SDK modules.
- **Host authority & skill source commit:**
  - Per migration contracts §Skill operations, Host Gateway already owns trusted skill source installation, atomic file writes to `.omp/skills/` or the selected agent directory, and the authoritative `sourceRevision` counter.
  - Authored skill file CRUD (`GET/PUT/DELETE /skills/files`) preserves Host source-commit authority: Host commits changes atomically to disk, advances the source revision, and dispatches fanout to active root workers via the existing supervisor `apply` protocol.
  - Persisted source revisions and active applied revisions remain strictly separated. A disk commit never claims active application until the worker returns `SkillsApplyResult`.
  - Commands and prompt templates are workspace and agent configuration files managed through canonical workspace routes.
- **Canonical API & wire contract:**
  - `GET /api/agent/v1/workspaces/:workspaceId/commands` returns `CommandCatalogState`: `{ workspaceId, revision, commands: CommandEntry[] }`.
  - `POST /api/agent/v1/workspaces/:workspaceId/commands` creates a command file under revision CAS with `{ expectedRevision, name, description?, content, argumentHint?, scope: "workspace" | "agent", modelSelection?, agentId? }`.
  - `PATCH /api/agent/v1/workspaces/:workspaceId/commands/:commandId` updates an existing command file under revision CAS (`expectedRevision`).
  - `DELETE /api/agent/v1/workspaces/:workspaceId/commands/:commandId` removes a command file under revision CAS (`expectedRevision`).
  - `GET /api/agent/v1/workspaces/:workspaceId/prompt-templates` returns `PromptTemplateCatalogState`: `{ workspaceId, revision, templates: PromptTemplateEntry[] }`.
  - `POST/PATCH/DELETE /api/agent/v1/workspaces/:workspaceId/prompt-templates[/:templateId]` manages prompt template files under revision CAS (`expectedRevision`).
  - `GET/PUT/DELETE /api/agent/v1/workspaces/:workspaceId/skills/files/:skillId/:filePath` manages authored skill files under Host source revision CAS (`expectedSourceRevision`), triggering per-root apply fanout.
- **Path confinement & safety:**
  - Resource files are confined strictly to `.omp/commands/`, `.omp/prompts/`, `.omp/skills/` within the authorized workspace root, or the authorized selected agent directory.
  - Arbitrary client filesystem paths, path traversal (`../`), and symlink escapes outside the roots are rejected.
  - External roots and inherited system layers are strictly read-only.
  - No OpenCode file reader or import formats.
  - Listing resources never invokes LLM models.
- **User experience & metadata preservation:**
  - Retain user-visible command arguments, argument hints, and Markdown editing.
  - If a command binds to a specific model or agent, preserve this as intentional application metadata referencing canonical `agentId` or `modelSelection` (`providerId`/`modelId`); do not silently drop metadata or invent fake schemas.
  - Autocomplete and expansion in chat composer use native expansion rules; client never performs hidden expansion incompatible with the SDK.
  - Builtin catalog lists only commands with actual Web/UI actions or native expansion; terminal-only commands do not promise executable HTTP behavior.
- **Module ownership:**
  - Task 51 owns `useCommandsStore.ts`, `useSkillsStore.ts`, `useSnippetsStore.ts`, canonical client resource methods, and associated Settings/autocomplete UI components.
  - Does not touch plugins, web search, session warming, or provider management UI.

## Check

- Unit and contract tests for `CommandEntrySchema`, `PromptTemplateEntrySchema`, and skill file mutation schemas.
- Service tests verifying atomic file persistence in `.omp/commands/` and `.omp/prompts/`, revision CAS conflict rejection (HTTP 409), and directory traversal rejection (HTTP 400/403).
- Skill authoring tests verifying Host source commit, `sourceRevision` advancement, and explicit active worker apply/failure reporting (`SKILL_APPLY_FAILED`).
- UI store tests verifying migration to CanonicalClient and removal of legacy `/api/config/*` routes.
- Parent runs integration tests and connected UI verification once after task delivery.

## Acceptance

- [ ] Canonical contract defines schemas for commands, prompt templates, and authored skill files with uint64 decimal revision counters.
- [ ] Agent Service and Host Gateway implement `/commands`, `/prompt-templates`, and `/skills/files` workspace endpoints under revision CAS.
- [ ] Files are confined strictly to native `.omp/` directories and authorized agent directories; traversal and arbitrary paths are rejected.
- [ ] Host source-commit authority is preserved for skill file writes, advancing `sourceRevision` and fanout to active workers.
- [ ] `useCommandsStore`, `useSkillsStore`, and `useSnippetsStore` cut over to CanonicalClient; legacy `/api/config/commands`, `/api/config/snippets`, `/api/config/skills` routes are removed.
- [ ] Command arguments, Markdown formatting, and native agent/model bindings are preserved.
- [ ] Node Host and UI remain free of native SDK imports.
