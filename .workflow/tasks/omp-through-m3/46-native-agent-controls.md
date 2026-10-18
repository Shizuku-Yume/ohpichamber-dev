# 46: Native agent selection and ModelControls cutover

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** <commit-sha>

**Delivers:** End-to-end native agent selection closure across ModelControls, App readiness, and ConfigStore. Removes the duplicate legacy OpenCode agent catalog, migrates remaining agent consumers to `useAgentsStore`, preserves canonical model and variant control behavior, binds agent profile default models via `providerId`/`modelId`, and maintains favorite and cycling controls by native `agentId` and `name`.

**Blocked by:** None
**Files:** `packages/ui/src/components/chat/ModelControls.tsx`, `packages/ui/src/stores/useConfigStore.ts`, `packages/ui/src/App.tsx`, `packages/ui/src/stores/useAgentsStore.ts`, `packages/ui/src/hooks/useOpenCodeReadiness.ts`, `packages/ui/src/lib/agentColors.ts`, `packages/ui/src/hooks/useAgentColors.ts`, `packages/ui/src/lib/agentLabel.ts`, `.workflow/development.md`, `.workflow/specs/omp-through-m3.md`
**Read first:** `.workflow/specs/omp-through-m3.md` W7, W9, W10; `decisions.md: 2026-10-18 - Canonical agent profiles are the selectable UI roster`; `decisions.md: 2026-10-18 - Native agent controls and ConfigStore catalog retirement`; `packages/agent-contract/src/session.ts`; `packages/ui/src/stores/useAgentsStore.ts`; `packages/ui/src/components/chat/ModelControls.tsx`; `packages/ui/src/stores/useConfigStore.ts`
**Covers:** W7, W9, W10

**Change:**

- Migrate `ModelControls.tsx` from `useConfigStore`'s legacy `agents` record to `useAgentsStore` directory projections.
- Retain canonical model selection, variant controls, and provider capability behaviors.
- Map agent profile model binding to native `providerId`/`modelId`.
- Drive favorites and cycling via native `agentId` and `name`.
- Retire legacy `mode`, `hidden`, and `displayName` filtering per `decisions.md: 2026-10-18 - Canonical agent profiles are the selectable UI roster`.
- Retire legacy sampling tooltip metadata; invent no Canonical sampling fields. Native per-profile model/variant selection is retained, and tool availability is distinct from authorization.
- Display native `allowedTools` tool availability and `permissionPresetId`. Never equate `allowedTools` membership to authorization allow/deny rules.
- Retain Host approval edit mode controls unchanged; the native SDK owns authorization policy without client-side `PermissionRuleset` simulation.
- Remove duplicate legacy agent loading and state from `useConfigStore`, `useOpenCodeReadiness.ts`, and `App.tsx` startup sequence, stopping legacy `/api/agent` polling loops.
- Preserve deliberate distinction between empty agent catalog and error states.
- Do not reshape native SDK fields or add compatibility shims to mimic legacy UI shapes.

**Check:** `bun test packages/ui/src/components/chat/ModelControls.variant.behavior.test.tsx`; `packages/ui/src/stores/useConfigStore.test.ts`; UI test-project type-check (`bunx tsc --noEmit --pretty false -p packages/ui/tsconfig.test.json`); UI build (`bun run --cwd packages/ui build`); browser profile selection check and absence of `/api/agent` startup polling loops after web rebuild.

**Acceptance:**

- [ ] `ModelControls.tsx` and remaining chat callers read native agents from `useAgentsStore`.
- [ ] Duplicate OpenCode agent catalog and `/api/agent` polling are removed from `useConfigStore`, `useOpenCodeReadiness.ts`, and `App.tsx`.
- [ ] Canonical model and variant controls remain operational with native agent profile model bindings.
- [ ] Tool availability displays native `allowedTools` and `permissionPresetId` without simulating legacy `PermissionRuleset`.
- [ ] Empty catalog and error states remain distinct.
- [ ] Focused component/store tests pass, UI build passes, and UI test-project type-check exits 0.
