# 01: Fold Usage Auto-Reset Rules & Redesign Model Roles (Custom Roles + Inline Controls)

**Effort:** ux-audit-remediation-2026-11-24
**Blocked by:** None
**Covers:** W1

**Files:**
- `packages/agent-service/src/worker/settings-ui.ts`
- `packages/agent-service/src/worker/settings-ui.test.ts`
- `packages/agent-service/src/worker/catalog-settings.ts`
- `packages/ui/src/components/sections/usage/UsagePage.tsx`
- `packages/ui/src/components/sections/usage/UsagePage.test.tsx`
- `packages/ui/src/components/sections/model-roles/ModelRolesPage.tsx`
- `packages/ui/src/components/sections/model-roles/ModelRolesPage.test.tsx`
- `packages/ui/src/components/sections/model-roles/modelRoleLayout.ts`
- `packages/ui/src/components/sections/model-roles/modelRoleLayout.test.ts`
- `packages/ui/src/components/sections/shared/ModelRoleLinkRow.tsx`
- `packages/ui/src/components/sections/shared/ModelRoleEditor.tsx`
- `packages/ui/src/components/sections/shared/modelRoleSelectors.ts`
- `packages/ui/src/components/sections/shared/openModelRoleEditor.ts`
- `packages/ui/src/components/sections/openchamber/DefaultsSettings.tsx`
- `packages/ui/src/components/sections/openchamber/GitSettings.tsx`
- `packages/ui/src/components/sections/memory/MemoryPage.tsx`
- `packages/ui/src/components/sections/agents/AgentsPage.tsx`
- `packages/ui/src/components/sections/tools/ToolsPage.tsx`
- `packages/ui/src/lib/settings/search.ts`
- `packages/ui/src/lib/i18n/messages/omp-settings.i18n.ts`
- `packages/ui/src/lib/i18n/messages/usage-stats.i18n.ts`

**Read first:**
- `.workflow/specs/ux-audit-remediation-2026-11-24.md`
- `packages/ui/src/components/sections/PATTERNS.md`
- `packages/ui/src/components/sections/references/layout.md`
- `packages/ui/src/components/sections/references/controls.md`
- `packages/ui/src/lib/theme/STYLING.md`
- `packages/agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/config/model-roles.ts`
- `packages/agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/config/model-settings.ts`
- `.agents/skills/locale-ui-patterns/SKILL.md`

**Check:** `bun run --cwd packages/agent-service test src/worker/settings-ui.test.ts && bun run --cwd packages/ui test src/components/sections/usage/UsagePage.test.tsx src/components/sections/model-roles/ src/components/sections/settingsLayoutGuard.test.ts src/components/sections/settingsItemOwnership.test.ts src/components/sections/settingsSearchAnchors.test.ts && bun run --cwd packages/agent-service type-check && bun run --cwd packages/ui type-check`

## Context

Maintainer feedback (Images #1, #3, #7):
1. Usage (`用量`) renders 6 flat `重置额度规则` numeric steppers (`Codex/Claude · 最短等待时间/保留重置额度/提前使用重置额度`) uncollapsed while the `autoRedeem*` switches are `boundary`-hidden.
2. Contextual pages (`Sessions`, `Git`, `Memory`, `Agents`, `Tools`) and `ModelRolesPage` render ugly underlined `SettingsInlineLink` jump links (`在模型角色中设置`, `在网页搜索中设置`, `打开语音设置`) paired with raw `CLIProxyAPI/devin-swe-2:max` strings that clash with OpenChamber's `ModelSelector` chrome.
3. `ModelRolesPage` hardcodes 15 built-in roles and omits OMP 19.1 custom role creation/editing/deletion (`modelRoles` custom keys + `modelTags` metadata).

## Checklist

- [ ] **Usage Auto-Reset Exposure & Default-Collapsed Disclosures**:
  - In `packages/agent-service/src/worker/settings-ui.ts`, move `codexResets.autoRedeem5h`, `codexResets.autoRedeemWeekly`, `claudeResets.autoRedeem5h`, `claudeResets.autoRedeemWeekly`, and `claudeResets.autoRedeemFable` from `boundary` to `page('usage', 'resets')` (update `settings-ui.test.ts` accordingly).
  - In `packages/ui/src/components/sections/usage/UsagePage.tsx`, redesign `ResetCreditSettings` so it NEVER dumps 6 flat steppers onto the Usage page:
    - Render one `SettingsSection` titled for auto-use reset credits (with `info` explanation) containing **two default-collapsed `SettingsDisclosure` rows**: `Codex` and `Claude` (`expanded` initialized to `false`!).
    - Each disclosure's `secondary` prop shows a concise localized summary of current state/thresholds (e.g., auto-redeem status + wait/keep/horizon numbers).
    - Inside each expanded disclosure: render that provider's `autoRedeem*` tri-state rows first, followed by its 3 threshold rows (`minBlockedMinutes`, `keepCredits`, `salvageHorizonHours`) with clean labels (no redundant `Codex · ` / `Claude · ` prefix inside the provider disclosure) and any `conditionActive === false` shared-config override note preserved.
  - Ensure all 11 `usage:resets` settings have real translated labels/descriptions in `omp-settings.i18n.ts` across all 15 locales and are indexed properly in `packages/ui/src/lib/settings/search.ts`.
- [ ] **Inline Role Pickers on Contextual Pages & Redesigned `ModelRoleLinkRow`**:
  - Add a shared helper in `packages/ui/src/components/sections/shared/modelRoleSelectors.ts` (`formatRoleDisplayValue`) that resolves `provider/model:effort` through `useSettingsModels` into friendly `model.name` + localized thinking level label (plus `+N` when a fallback chain has extra entries), NEVER showing raw `CLIProxyAPI/foo:max` when catalog metadata exists.
  - Replace `ModelRoleLinkRow` on `DefaultsSettings.tsx` (`smol`, `slow`, `plan`), `GitSettings.tsx` (`commit`), `MemoryPage.tsx` (`memory`), `AgentsPage.tsx` (`task`, `advisor`), and `ToolsPage.tsx` (`image`) with **real inline `ModelRoleEditor` / `ImageModelSelector` controls** bound directly to the canonical `omp.modelRoles.<role>` record (via `useOmpPageSettings`, using the same `modelRoleChange` helper — ONE canonical source of truth, zero duplicate keys, uniform OpenChamber dropdown height & chrome!). Keep each contextual page's existing `settingsItem` anchor distinct from `omp.modelRoles.<role>` so `settingsItemOwnership.test.ts` stays unique.
  - Redesign `ModelRoleLinkRow.tsx` for the genuinely distinct linked subsystems (`web` → Web Search, `speech` → Voice on `ModelRolesPage`, plus `RetryFallbackChains` web chain):
    - NEVER use bare underlined `SettingsInlineLink`.
    - Display the friendly resolved value via `formatRoleDisplayValue` (using `useSettingsModels` internally so callers don't pass raw strings) paired with a standard `Button variant="outline" size="xs"` with trailing `<Icon name="arrow-right" className="size-3.5" />`.
- [ ] **OMP 19.1 Custom Model Roles (Add / Edit / Rename / Delete)**:
  - In `packages/agent-service/src/worker/settings-ui.ts`, expose `modelTags` as `owned-by('model-roles', 'model-roles.section.custom')` (or `'model-roles.section.chat'`) so `canonicalClient.updateOmpSettings` accepts reads & writes of `{ [roleId]: { name?: string; color?: string; hidden?: boolean } }`. Verify `catalog-settings.ts` persists deletions cleanly when a custom key is removed from `modelRoles` and `modelTags`.
  - In `packages/ui/src/components/sections/model-roles/ModelRolesPage.tsx`:
    - Derive custom role IDs dynamically by unioning keys in `parseRolesRecord(rolesValue)` and `parseModelTagsRecord(tagsValue)` that are NOT in built-in `CHAT_ROLES`, `KIND_ROLES`, or `OMITTED_ROLES` (matching OMP 19.1 `getKnownRoleIds`).
    - Add a `SettingsSection` **"Custom roles" (`自定义角色`)** with `headerAction` `<Button variant="outline" size="sm">` (`+ Add role` / `+ 添加角色`) and a clean empty state when none exist.
    - Clicking `+ Add role` opens a `PATTERNS.md`-compliant `Dialog` with:
      - Role ID (`id`, validated `/^[a-z0-9][a-z0-9_-]*$/`, rejecting collisions with built-in or existing role IDs)
      - Display Name (`name`, optional — stored in `modelTags[id].name`)
      - Model & Thinking Level (`ModelRoleEditor`)
      - Save writes both `modelRoles` and `modelTags` in one CAS `updateSettings` call; show specific localized message on `409 CATALOG_CONFLICT` (project-scoped override) instead of generic saveFailed.
    - Each custom role row renders `ModelRoleEditor` (showing display name + subtle mono ID badge if different) plus rename/edit and delete icon buttons (`SETTINGS_ICON_BUTTON_CLASS`, delete confirmed via `useConfirmDialog`) that remove the key from both `modelRoles` and `modelTags`.
  - Translate every new/changed key across ALL 15 locales in `omp-settings.i18n.ts` / `usage-stats.i18n.ts` (zero English placeholders).
  - Add/update tests in `UsagePage.test.tsx`, `ModelRolesPage.test.tsx`, `modelRoleLayout.test.ts`, and `settings-ui.test.ts` covering default-collapsed Usage disclosures, inline pickers, friendly role formatting, and custom role add/edit/delete persistence.

## Progress

- Planned; ready for wave 1 implementation.
