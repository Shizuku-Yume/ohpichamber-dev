# 03: Fix Behavior Uncreated Files Editor & Redesign OMP Plugins / Marketplace

**Effort:** ux-audit-remediation-2026-11-24
**Blocked by:** None
**Covers:** W3

**Files:**
- `packages/ui/src/components/sections/behavior/BehaviorPage.tsx`
- `packages/ui/src/components/sections/behavior/BehaviorSidebar.tsx`
- `packages/ui/src/components/sections/behavior/NativeBehaviorFiles.tsx`
- `packages/ui/src/components/sections/behavior/behaviorTypes.ts`
- `packages/ui/src/components/sections/behavior/NativeBehaviorFiles.test.tsx`
- `packages/ui/src/components/sections/plugins/PluginsPage.tsx`
- `packages/ui/src/components/sections/plugins/ExtensionControlCenter.tsx`
- `packages/ui/src/components/sections/plugins/AddPluginDialog.tsx`
- `packages/ui/src/components/sections/plugins/MarketplaceSourcesDialog.tsx`
- `packages/ui/src/components/sections/plugins/*.test.tsx`
- `packages/ui/src/stores/usePluginsStore.ts`
- `packages/agent-service/src/worker/catalog-plugins.ts`
- `packages/agent-service/src/worker/catalog-plugins.test.ts`
- `packages/agent-contract/src/plugins.ts` (ONLY if needed for optional error/status metadata — preserve backward compatibility)
- `packages/ui/src/lib/i18n/messages/behavior-files.i18n.ts`
- `packages/ui/src/lib/i18n/messages/plugins-grid.i18n.ts`
- `packages/ui/src/lib/i18n/messages/plugins-marketplace.i18n.ts`

**Read first:**
- `.workflow/specs/ux-audit-remediation-2026-11-24.md`
- `packages/ui/src/components/sections/PATTERNS.md`
- `packages/ui/src/lib/theme/STYLING.md`
- `packages/agent-service/src/worker/catalog-resources.ts`
- `packages/web/server/lib/host/behavior-routes.js`
- `packages/agent-service/src/worker/catalog-extensions.ts`
- `packages/agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/plugins/marketplace/manager.ts`
- `.agents/skills/locale-ui-patterns/SKILL.md`

**Check:** `bun run --cwd packages/agent-service test src/worker/catalog-plugins.test.ts && bun run --cwd packages/ui test src/components/sections/behavior/ src/components/sections/plugins/ src/components/sections/settingsLayoutGuard.test.ts && bun run --cwd packages/agent-service type-check && bun run --cwd packages/ui type-check`

## Context

Maintainer feedback (Images #4, #5, #6):
1. **Behavior (`行为`)**: Clicking `RULES.md` or `SYSTEM.md` in the sidebar shows a red error `此文件在目录中已不存在。` and a `返回行为文件` button because `BehaviorSidebar` renders `FIXED_NATIVE_FILES` unconditionally while `catalog-resources.ts` omits files that do not yet exist on disk.
2. **OMP Plugins (`OMP 插件`)**: The `能力` section embeds `ExtensionControlCenter` listing ALL 11 OMP capability kinds — including `OpenSSH Config (10)` (`~/.ssh/config` hosts like `bohr`, `alicloud`, `57.180.29.83`, `gitee.com`) and `内置默认 (26)` built-in rules, skills, context files, and MCP servers — completely unrelated to plugins! Also the `Apply` (`应用`) button always fails with `RELOAD_REQUIRED`.
3. **Plugin Marketplace (`插件市场`)**: `catalog-plugins.ts:366` swallows every error into one hardcoded English sentence (`Native marketplace operation failed. Check the source, name and network access.`), `updateAllMarketplaces` fails the entire refresh if any single source is broken (such as a deleted `/tmp/native-plugins-*` path), and `AddPluginDialog` has scope-matching & empty-state bugs.

## Checklist

- [x] **Behavior Page: Clean Ready-to-Edit Create Flow for `RULES.md` / `SYSTEM.md` (Image #4)**:
  - In `packages/ui/src/components/sections/behavior/NativeBehaviorFiles.tsx`:
    - Distinguish fixed standard files (`kind === 'sticky-rules' || kind === 'system'`, i.e., `RULES.md` & `SYSTEM.md`) from dynamic files (`rule` / `instruction`).
    - When a fixed standard file (`RULES.md` or `SYSTEM.md`) is selected and `!existingEntry` (file does not exist on disk yet), **NEVER render the red `settings.behavior.files.missing` error or `返回行为文件` button!**
    - Instead, mirror `AGENTS.md`'s exact clean UX: render the standard `SettingsPageLayout` (`showSaveStatus`) with the file title (`RULES.md` / `SYSTEM.md`), scope subtitle (`全局 (~/.omp/agent)` or `项目 (.omp)`), concise description of what the file controls, a subtle muted note that the file does not exist yet and will be created when saved, and a ready-to-type empty markdown `<Textarea>` wired to `SettingsAutosave` (writing with `expectedVersion: undefined` via the existing `upsertBehaviorFile` write path, which `catalog-resources.ts:183-234` already supports!).
    - Hide the header Delete button when `!existingEntry`; show Delete (confirmed via `useConfirmDialog`) only once the file exists on disk. After deleting a fixed file, stay cleanly on the empty uncreated editor state instead of jumping to a red missing error!
    - Keep the missing-file fallback ONLY for dynamic `rule`/`instruction` entries that disappeared externally while open.
  - In `packages/ui/src/components/sections/behavior/BehaviorPage.tsx`: revalidate the native behavior catalog on window focus (mirroring `AGENTS.md` focus reload) so externally created/deleted files stay fresh.
  - Ensure `BehaviorSidebar.tsx` renders `RULES.md` and `SYSTEM.md` cleanly and consistently with `AGENTS.md` (subtle visual indicator if helpful, zero broken clicks).
- [x] **OMP Plugins: Remove Unrelated Capabilities (`ssh`, `builtin-defaults`, rules/skills/MCP/commands) & Dead Apply Button (Image #5)**:
  - In `packages/ui/src/components/sections/plugins/PluginsPage.tsx` and `ExtensionControlCenter.tsx`:
    - Filter the extension inventory shown on `OMP 插件` STRICTLY to actual plugin/extension code surfaces: **ONLY `kind === 'extension-module' || kind === 'hook' || kind === 'tool'`** AND **NEVER** include `ssh` (`OpenSSH Config`), `rule`, `context-file`, `skill`, `slash-command`, `prompt`, `mcp`, `instruction`, or `builtin-defaults` (`内置默认`)!
    - Recalculate provider counts and hide providers with 0 remaining items after filtering! If zero plugin/extension capabilities exist, **do NOT render a sprawling empty capability browser** (either omit the capability section cleanly or show a compact single-line note only when relevant).
    - If plugin-contributed extension modules/hooks/tools DO exist, render them cleanly in a focused section (or default-collapsed disclosure) with NO SSH hosts and NO built-in rules!
  - Remove the permanently-broken `plugins.apply` (`应用`) button from `PluginsPage.tsx` (`catalog-plugins.ts:313-321` always returns `RELOAD_REQUIRED` failure) and replace it with an honest, non-failing informational note (`settings.plugins.apply.nextSession` — new or restarted sessions load plugin changes).
  - Fix `AddPluginDialog.tsx`:
    - Key installed marketplace plugins by `${name}@${marketplace}@${scope}` (matching `PluginsPage.tsx`) instead of ignoring scope.
    - Fix empty-state copy: distinguish "no marketplace sources configured" (`sources.length === 0`) from "sources configured, no plugins available" (`sources.length > 0 && marketplace.length === 0`).
- [x] **Plugin Marketplace: Real Error Reporting, Per-Source Resilience, Guaranteed Removal, & Test Isolation (Image #6)**:
  - In `packages/agent-service/src/worker/catalog-plugins.ts`:
    - Stop swallowing native marketplace errors into one generic English sentence (`line 366`). Inspect the real error and return structured, actionable error messages / codes (e.g., local path does not exist, source already registered, invalid source URI/manifest, git/network failure) with private home paths sanitized cleanly.
    - For `action === 'update'` with `name === undefined` (`updateAllMarketplaces`): iterate registered sources individually and refresh each one! If a `local` source's `sourceUri` does not exist on disk (`!existsSync(sourceUri)`), record a clean per-source failure instead of aborting valid sources, and return a clear actionable error listing the failed source name & reason.
    - For `action === 'remove'`: guarantee `removeMarketplace(request.name)` succeeds even when `sourceUri` or `catalogPath` no longer exists on disk (if the native manager throws on missing files, ensure the registry entry is still cleanly removed or handled so broken sources like `local-proof` can ALWAYS be deleted in 1 click!).
    - For `marketplaceEntries`: guard per-source catalog reads so one corrupted/missing cached `catalogPath` does not 503 the entire `plugins.read` or `plugins.marketplace` response!
  - In `packages/ui/src/components/sections/plugins/MarketplaceSourcesDialog.tsx` & `PluginsPage.tsx`:
    - Map structured marketplace error codes/types through `@/lib/i18n` (all 15 locales!) so the user NEVER sees a raw English `Native marketplace operation failed...` string in Chinese or any other locale!
    - Show per-source status cleanly (e.g., missing local path warning), ensure clicking the trash icon deletes broken sources immediately and refreshes the marketplace list without error, and ensure adding a valid source (GitHub `owner/repo`, git URL, or local directory) works smoothly end-to-end.
  - In `packages/agent-service/src/worker/catalog-plugins.test.ts`:
    - Add a hard guard at the top of the test file asserting isolated HOME (`OPENCHAMBER_PLUGIN_FIXTURE_HOME` / temp dir ≠ real user home) so running tests can NEVER pollute `~/.omp/marketplaces.json` again!
    - Add tests covering: missing local source path error detail, resilient `updateAll` when one source is broken and another is valid, removing a broken/missing-path source, and `plugins.read` surviving a missing `catalogPath`.
- [x] **i18n & Tests**:
  - Translate every added/changed key across ALL 15 locales in `behavior-files.i18n.ts`, `plugins-grid.i18n.ts`, and `plugins-marketplace.i18n.ts`.
  - Add/update UI tests in `NativeBehaviorFiles.test.tsx`, `PluginsPage.test.tsx` (verifying zero `ssh`/`OpenSSH Config`/`builtin-defaults`, zero dead Apply button, AddPluginDialog scope check, localized marketplace error & broken-source deletion).

## Progress

- Implemented Behavior uncreated `RULES.md`/`SYSTEM.md` ready-to-edit autosave flow and window-focus revalidation (`BehaviorPage.tsx`, `NativeBehaviorFiles.tsx`, `behavior-files.i18n.ts`).
- Scoped `ExtensionControlCenter` / `PluginsPage` strictly to `extension-module`, `hook`, `tool` via `pluginCapabilities.ts` (excluding `ssh`, `openssh-config`, `builtin-defaults`, and non-plugin kinds), removed the permanently-failing `plugins.apply` button in favor of `settings.plugins.apply.nextSession`, and fixed `AddPluginDialog` scope keys and empty states.
- Added structured `MARKETPLACE_SOURCE_MISSING`, `MARKETPLACE_SOURCE_EXISTS`, `MARKETPLACE_INVALID_SOURCE`, `MARKETPLACE_NETWORK_ERROR` problem codes and `MarketplaceErrorDetailsSchema` (`packages/agent-contract/src/errors.ts`, `plugins.ts`), forwarded `ProjectionError.details` across worker IPC (`protocol.ts`, `worker/index.ts`, `supervisor/workers.ts`), implemented sanitized error classification, resilient per-source `updateAll`, guaranteed `remove`, and fault-tolerant `marketplaceEntries` reads (`catalog-plugins.ts`), localized marketplace errors across all 15 locales (`marketplaceError.ts`, `plugins-marketplace.i18n.ts`), and added fail-fast `HOME` isolation guards + regression tests (`catalog-plugins.test.ts`).

Check after: `catalog-plugins.test.ts` (2 pass + 24 isolated child pass, 0 fail), `packages/agent-contract` test (284 pass, 0 fail), isolated UI `behavior/` + `plugins/` (3/3 test files pass), `settingsLayoutGuard.test.ts` (14 pass), `messages.test.ts` (17 pass / 4860 expect), `agent-contract` / `agent-service` / `ui` type-checks (0 errors), `check:changed --ratchet-only` (0 new findings, file size OK), `oxlint` (0 findings), and `agent-contract` + `agent-service` builds + `canonical-plugins.test.js` (6 pass); receipts in `/home/shizuku/Project/ohpichamber-omp-artifacts/ux-audit-remediation-2026-11-24/task03/` (`check.log`, `ratchet-and-oxlint.log`, `backend-build.log`, `plugins-ui-tests.log`, `behavior-tests.log`).

Review: pass (base 1637a063b39aacc078b88188b8821ad176dc1f1f)
