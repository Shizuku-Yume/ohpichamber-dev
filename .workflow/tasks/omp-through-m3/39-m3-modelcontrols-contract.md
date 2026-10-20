# 39: Assess the ModelControls canonical agent contract

**Effort:** omp-through-m3
**Task type:** spike
**Base commit:** <commit-sha>

**Delivers:** A checked contract decision for ModelControls' remaining agent presentation and pinned-model details: permission rules, sampling values, role/mode display, and model identity. The result identifies the canonical owner or records the exact missing contract without changing visible behavior.

**Blocked by:** 36
**Files:** `packages/ui/src/components/chat/ModelControls.tsx`, `packages/ui/src/stores/useConfigStore.ts`, `packages/agent-contract/src/session.ts`, `packages/agent-service/src/worker/catalog-agents.ts`, relevant migration contracts

**Read first:** `.workflow/specs/omp-through-m3.md` M3/W9/W10; `.workflow/tasks/omp-through-m3/37-m3-chat-agent-callers.md`; `decisions.md: 2026-10-18 - Canonical agent profiles are the selectable UI roster`; `packages/ui/src/components/chat/ModelControls.tsx`; `packages/agent-contract/src/session.ts`; `packages/agent-service/src/worker/catalog-agents.ts`; `packages/ui/src/stores/useAgentsStore.ts`
**Covers:** W9, W10

**Check:** Compare every ModelControls agent detail with an existing canonical contract and owner. Record `resolved` only for fields with an authoritative source; record `blocked` for missing permission, sampling, role/mode, or pinned-model presentation semantics. No source edits, tests, builds, or field-dropping UI changes.

- [x] Inventory the remaining ModelControls Agent field accesses.
- [x] Map each field to a canonical source or record it as missing.
- [x] Decide the smallest contract-owning follow-up; do not add a pass-through adapter or infer native values.
- [x] Keep Task17/36/18 open until the resulting callers and connected acceptance are verified.


**Status:** paused

## Progress

Task46 and the settled 2026-10-18 decisions resolve this spike's field inventory and canonical-owner decision. Task46 owns the source cutover and records focused test/build/type-check and browser evidence. No additional contract or source change remains in Task39. This task stays paused until Task36 supplies connected W7-W10 evidence, then it can be archived without duplicating Task46 work.

## Findings

- Agent presentation uses the enabled canonical profile roster (`name`, `description`, `agentId`); legacy `hidden`, `mode`, and `displayName` fields are retired.
- `allowedTools` describes tool availability and `permissionPresetId` identifies the native preset; Host approval and the native SDK own authorization. Client-side `PermissionRuleset` simulation is retired.
- Per-agent sampling was tooltip-only metadata and is retired. Profile model bindings use canonical `providerId`/`modelId` with native variant selection.
- No adapter, alias, or new Canonical schema is required. See Task46 and decisions `Canonical agent profiles are the selectable UI roster` and `Native agent controls and ConfigStore catalog retirement`.