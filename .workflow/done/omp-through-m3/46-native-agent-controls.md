# 46: Native agent selection and ModelControls cutover

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 6a630f3e957ce0becba70b416a98b1a39eec83d2
**Finished:** 2026-10-21T02:22:46+08:00

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

- [x] `ModelControls.tsx` and remaining chat callers read native agents from `useAgentsStore`.
- [x] Duplicate OpenCode agent catalog and `/api/agent` polling are removed from `useConfigStore`, `useOpenCodeReadiness.ts`, and `App.tsx`.
- [x] Canonical model and variant controls remain operational with native agent profile model bindings.
- [x] Tool availability displays native `allowedTools` and `permissionPresetId` without simulating legacy `PermissionRuleset`.
- [x] Empty catalog and error states remain distinct.
- [x] Focused component/store tests pass, UI build passes, and UI test-project type-check exits 0.
## Progress

Dirty at start: Existing in-flight M3 changes across `.workflow`, `packages/agent-contract`, `packages/agent-service`, `packages/ui`, `packages/web/server`, `packages/web/src`, `packages/electron`, and `packages/docs`; kept intact.

The desktop dropdown failure came from statically importing `TooltipProvider` before Happy DOM globals initialized Base UI. Importing it after the globals restored portal mounting; `ModelControls.variant.behavior.test.tsx` now passes 23/23 (77 assertions), including desktop and mobile controlled selection. `useConfigStore.test.ts` passes 114/114 (440 assertions; it logs an expected transient-load diagnostic). UI test-project type-check and UI build both exit 0. Chrome against the rebuilt Web app selected native `reviewer`, then restored `writer`; startup requests used `/api/agent/v1` for canonical agents/models and showed no `/api/agent` requests in the captured 314-request trace. Source inspection confirms `allowedTools` and `permissionPresetId` presentation, native roster reads, and removed OpenCode readiness module. Connected W7–W10 acceptance remains open.

2026-10-21 closure review: the recorded evidence is current because no named Task46 source or test file changed after `66fbdec99`; the tests, UI build, and Chrome trace are reused without rerunning. `ModelControls.tsx` reads the roster through `useAgentsStore`/`selectAgentsForDirectory`. `useConfigStore` intentionally retains `currentAgentName`, `setAgent`, settings defaults, and per-agent model selections as session/default selection state; these are not a duplicate agent catalog. No persisted/local `agents` catalog remains, and startup loads the roster through `useAgentsStore.loadAgents`. The former `useOpenCodeReadiness.ts` is absent; current readiness is `useCatalogReadiness.ts` over canonical catalog status, with no legacy `/api/agent` polling. The recorded 314-request Chrome trace selected native `reviewer`, restored `writer`, and used `/api/agent/v1` only.

Review boundary: actual Base commit `6a630f3e957ce0becba70b416a98b1a39eec83d2`; implementation/evidence state `66fbdec99`; archive-only task-record delta from `15d7603fd`. Requirements and quality pass with no blocking findings. Security not triggered for this record-only closure. Task36/18 retain the connected W10/E2E gaps; this slice does not claim they are closed.
