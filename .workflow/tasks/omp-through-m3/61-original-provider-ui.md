# 61: Restore original provider management and connection UI

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** e848504602333955b1d134bba3345d8bbc2ed065

**Delivers:** Restores the original OpenChamber provider management experience (`packages/ui/src/components/sections/providers/`) from pre-M1 baseline (`bfa8edacb9b0096aabf40b12886794ce62df8ddb`), including the visual `ProviderGrid`, connection picker, multi-account management roster, OAuth sign-in modal with manual callback prompts, custom provider configuration forms, and detailed model rows. Replaces simplified or unstyled model lists with the original interactive provider cards while strictly preserving native OAuth flows, write-only credential storage, revision CAS, enterprise mode gates, and runtime guards.

**Blocked by:** None
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
