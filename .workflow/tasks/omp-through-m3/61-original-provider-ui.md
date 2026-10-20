# 61: Restore original provider management and connection UI

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** e848504602333955b1d134bba3345d8bbc2ed065
**Status:** paused

**Delivers:** Restores the original OpenChamber provider management experience (`packages/ui/src/components/sections/providers/`) from pre-M1 baseline (`bfa8edacb9b0096aabf40b12886794ce62df8ddb`), including the visual `ProviderGrid`, connection picker, multi-account management roster, OAuth sign-in modal with manual callback prompts, custom provider configuration forms, and detailed model rows. Replaces simplified or unstyled model lists with the original interactive provider cards while strictly preserving native OAuth flows, write-only credential storage, revision CAS, enterprise mode gates, and runtime guards.

**Blocked by:** 65, 67
**Files:** `packages/ui/src/components/sections/providers/`, related provider UI tests
**Read first:** Visual reference at `bfa8edacb9b0096aabf40b12886794ce62df8ddb` (`packages/ui/src/components/sections/providers/`); canonical provider and OAuth contracts in `packages/agent-contract/src/catalogs.ts` and `provider-management.ts`; `.workflow/specs/omp-through-m3.md` W9, W10
**Covers:** W9, W10

**Check:** Focused behavioral tests in `packages/ui`, strict UI type-check (`bun run --cwd packages/ui type-check`), single parent UI build (`bun run --cwd packages/ui build`), and actual Web and Electron visual verification of provider card rendering, OAuth connect flow, account roster management, custom provider discovery, and model selection; no source/copy/wiring tests.

 - [ ] Restore original `ProviderGrid` and interactive card picker layout displaying official provider logos, connection status badges, and active model summaries from pre-M1 baseline (`bfa8edacb9b0096aabf40b12886794ce62df8ddb`).
 - [ ] Restore detailed provider view with multi-account roster, default account selector, and active model lists, rather than a simplified flat list.
 - [ ] Restore native OAuth connect modal, external browser authorization link, manual callback code input, and loading/retry states.
 - [ ] Restore the original custom provider editor and model-discovery interaction for the actual native provider configuration schema, including endpoint and write-only credential fields. Do not substitute a raw JSON editor for the original controls.
 - [ ] Preserve canonical OAuth transactional flows, opaque `credentialRef` tokens, revision CAS, and enterprise mode egress blocks; do not touch `SettingsView`, shared primitives, or i18n dictionaries (request parent integrator if shared changes needed).

## Background & UI Restoration Scope

The current user explicitly prioritizes restoring the original OpenChamber UI appearance and interaction behavior, with no redesign. Investigation identified commit `bfa8edacb9b0096aabf40b12886794ce62df8ddb` as the assembled pre-M1 baseline visually inherited upstream. The current integration worktree (`e848504602333955b1d134bba3345d8bbc2ed065`) retains the authoritative native Canonical contracts.

This task restores the provider management surface:
- **Interactive Provider Cards:** Re-establishes the rich `ProviderGrid` visual cards featuring brand logos, enabled/configured badges, available model counts, and direct action buttons (Connect, Add Account, Configure, Disconnect).
- **Multi-Account Roster:** Restores the accounts management sub-panel allowing users to configure and label multiple credentials per provider, toggle active defaults, and view opaque credential references without exposing secret values.
- **Transactional Native OAuth:** Integrates with native Agent Service OAuth coordinator flows (`flowId`, browser launch link, manual code submission fallback, and transactional credential commit).
- **Custom Provider & Model Discovery:** Restores custom provider forms with endpoint validation, keyless gateway support, and live model listing verification.
- **Enterprise & Security Integrity:** Obeys Host enterprise policy restrictions (refusing external OAuth/custom endpoints when enterprise mode is active) and ensures write-only credential fields never display stored tokens.

## Progress

Native provider setup and model catalog configuration returned successful canonical API responses during the Web proof, and the original provider presentation is integrated.
The initial observation of indefinite "Loading..." on packaged Electron (`/tmp/ui-restored-electron-settings-proof.json`) was superseded by directory resolution fixes and verified provider UI flows across both Web and Electron:
- **Settings directory resolution:** Settled in source (`packages/ui/src/components/sections/useSettingsDirectory.ts`) as explicit pick > active project > first project > Host `useChatsRoot`, with no home fallback. When directory is null, Providers renders an explicit "Unavailable" state rather than perpetual "Loading..." (focused tests passed 11 tests / 24 assertions).
- **Web verification (`final-web-acceptance-receipt.json`):** Verified 89 provider cards rendered in UI, Connect provider picker, custom provider dialog fields, and clean cancel removing inputs with nothing stored (screenshots 07, 08, 12, 13, 14).
- **Packaged Electron verification (`ACCEPTANCE-RECEIPT.md`):** Verified native OMP cards + Anthropic detail view with 28 models; custom API-key form cancel removed password/save-key with nothing stored (screenshots 03-07). The OMP navigation across 13 locales with Providers nav present was observed on the superseded AppImage `7528f0c9307d86cf21c2316284dc7073271f95100f4985a286e652e3ceb8460b`, which is provider evidence for a historical artifact, not the final package. The final UI-proofed AppImage `0a188692…` embeds Web dist `42170a97…` (whose provider card/picker/custom-provider flows passed Web acceptance) and the current on-disk Task55 rebundle is `598bf582…`; packaged provider UI was not rerun on the final artifacts.
- **Preserved gaps:** Live third-party provider keys and external browser OAuth callback redirects remain unverified in packaged acceptance. This task stays open. No M3 gate or task complete claims.

### Resume verification (2026-10-21)

- Resumed at HEAD `ac33b1c73` on the current integration branch. Provider sources are the committed restore `6f1fe19fe`, clean in `git status`; unrelated dirty `packages/ui/src/sync/*` and agent-service session files were preserved untouched.
- **Focused tests:** the Task61-only packet (`ProvidersPage.test.ts`, `custom-provider-form.test.ts`, `ProviderOAuthMethods.test.tsx`, `useSettingsDirectory.test.ts`) passed **19 tests / 43 expect() calls**. No provider backend/API suite was duplicated.
- **Actual Web (`dist c438247e…`, Host `127.0.0.1:3171`, isolated HOME):** 96 provider cards / 98 logos with `Not signed in` and `Connected` states plus model counts; Popular/Recommended picker with Custom provider and 89 in “show all”; custom form fields including write-only API key and headers, no raw JSON; live discovery of 2 of 2 models from a local OpenAI-compatible fixture; saved `campus-local` with a 2-model detail; two opaque accounts with rename, `use` default switch, and removal; Anthropic OAuth modal with the real `claude.ai/oauth/authorize…` link, manual `Paste authorization code` input, waiting state, and clean cancel (no OAuth grant); model row hide/show/restore. Clean custom-provider cancel left no provider, no password value, and no canonical record.
- **Actual current packaged Electron (`AppImage 598bf582…`, packaged UI `42170a97…`, isolated HOME):** independently repeated the provider cards (95/97), picker search (`anth` → 5 rows), custom-provider cancel/create (`campus-electron`, 2 discovered models), two-account roster rename/default switch/removal, OAuth modal states with manual callback and cancel, and model hide/show. Canonical account responses contained only opaque `credentialRef`/label values.
- **Locale/style review:** no hardcoded user-facing copy in provider `.tsx`; all 157 used `settings.providers.*` keys exist in all 12 non-English merged dictionaries, and English-identical values are only placeholders, product/protocol literals, or `ctx`/`out`.
- **Check result:** focused behavioral tests pass (19/43) and Web plus current packaged Electron visual verification pass for provider card rendering, OAuth modal states, roster management, custom provider discovery, and model selection. The Check is not fully green: `bun run --cwd packages/ui type-check` and `bun run --cwd packages/ui build` were not run, because the shared tree has unrelated in-flight `packages/ui/src/sync/*` work and a workspace-wide typecheck was explicitly forbidden. Acceptance boxes remain unticked; no archive.
- **Blocked follow-up:** once the dirty sync work lands (or in a clean snapshot at the same provider source), run `bun run --cwd packages/ui type-check` and one parent `bun run --cwd packages/ui build`, then complete the Check and archive. No provider source change is pending from this session.
- **Dependency (Task60, outside this UI scope):** the Web Search provider catalog returns chat models as providers (`catalog-websearch.ts` `readCurrent` web-role model list). No backend/catalog change and no UI filtering/masking was added. Task61’s Providers grid/picker is unaffected; Task60 owns the catalog fix.
- **Location and uncommitted work:** current integration branch `omp-through-m3/recovery-20261013`, worktree `/home/shizuku/Project/ohpichamber-worktrees/m1-integration`, Base `e8485046`. This session’s uncommitted work is the pause/handoff edits in this task file, the Task61 paragraph in `.workflow/development.md`, and the new receipt `.workflow/omp-migration/m3/task61-provider-ui-2026-10-21.json` (committed as the pause handoff). Provider sources are clean and committed.
- **Dirty at start (preserved, never staged):** `.workflow/tasks/omp-through-m3/60-original-settings-ui.md`; `packages/agent-service/src/sessions/registry-native.test.ts`; `packages/agent-service/src/sessions/registry.ts`; `packages/agent-service/src/supervisor/service.ts`; `packages/ui/src/sync/DOCUMENTATION.md`; `packages/ui/src/sync/bootstrap.test.ts`; `packages/ui/src/sync/bootstrap.ts`; `packages/ui/src/sync/child-store.test.ts`; `packages/ui/src/sync/child-store.ts`; `packages/ui/src/sync/retry.ts`; `packages/ui/src/sync/session-message-loader.ts`; `packages/ui/src/sync/sync-context.tsx`; untracked `.workflow/omp-migration/m3/task36-recovery-guest-2026-10-20.json`.
- Evidence: `.workflow/omp-migration/m3/task61-provider-ui-2026-10-21.json`; screenshots `~/.cache/ohpi-acceptance/evidence/t61-*.png`.
