# 39: Assess the ModelControls canonical agent contract

**Effort:** omp-through-m3
**Task type:** spike
**Base commit:** 803d102df95f01e2e4af242e41412997e46296f0
**Finished:** 2026-10-21T02:15:10+08:00

**Delivers:** A checked contract decision for ModelControls' remaining agent presentation and pinned-model details: permission rules, sampling values, role/mode display, and model identity. The result identifies the canonical owner or records the exact missing contract without changing visible behavior.

**Question:** Which existing canonical contract and owner covers every remaining ModelControls agent detail, and which permission, sampling, role/mode, or pinned-model presentation field still lacks an authoritative source?
**Time box:** One field-inventory and contract-mapping pass over the listed files; stop after recording the canonical owner or the exact missing field. No source edits, tests, builds, or field-dropping UI changes.

**Blocked by:** 36
**Files:** `packages/ui/src/components/chat/ModelControls.tsx`, `packages/ui/src/stores/useConfigStore.ts`, `packages/agent-contract/src/session.ts`, `packages/agent-service/src/worker/catalog-agents.ts`, relevant migration contracts

**Read first:** `.workflow/specs/omp-through-m3.md` M3/W9/W10; `.workflow/tasks/omp-through-m3/37-m3-chat-agent-callers.md`; `decisions.md: 2026-10-18 - Canonical agent profiles are the selectable UI roster`; `packages/ui/src/components/chat/ModelControls.tsx`; `packages/agent-contract/src/session.ts`; `packages/agent-service/src/worker/catalog-agents.ts`; `packages/ui/src/stores/useAgentsStore.ts`
**Covers:** W9, W10

**Check:** Compare every ModelControls agent detail with an existing canonical contract and owner. Record `resolved` only for fields with an authoritative source; record `blocked` for missing permission, sampling, role/mode, or pinned-model presentation semantics. No source edits, tests, builds, or field-dropping UI changes.

- [x] Inventory the remaining ModelControls Agent field accesses.
- [x] Map each field to a canonical source or record it as missing.
- [x] Decide the smallest contract-owning follow-up; do not add a pass-through adapter or infer native values.
- [x] Keep Task17/36/18 open until the resulting callers and connected acceptance are verified.


## Progress

Task46 and the settled 2026-10-18 decisions resolve this spike's field inventory and canonical-owner decision. Task46 owns the source cutover and records focused test/build/type-check and browser evidence. No additional contract or source change remains in Task39. Task39 remained paused until Task36 supplied connected W7-W10 evidence; that evidence is now recorded, so this archive-only closure does not duplicate Task46 work.

2026-10-21 archive-only closure: the original baseline was never recorded because this spike was first added already `Status: blocked` with a placeholder, and no commit sets an active start or a real source baseline. The `Base commit` above is the current pre-edit HEAD `803d102df`, used only as the comparison point for the resumed task-record/archive diff; it is not a claim about the historical source baseline. Task36 is archived at that commit and its receipt records connected W7-W10 acceptance, satisfying the dependency. Task46's record has all six acceptance checks checked: ModelControls 23/23, ConfigStore 114/114, UI test-project type-check and build exit 0, browser native profile selection, and no `/api/agent` startup polling. Current source recheck confirms the four Findings: canonical `agentId`/`name`/`description`, `allowedTools`/`permissionPresetId` presentation, no client `PermissionRuleset` or sampling paths, and profile `providerId`/`modelId` bindings with native variants; only ignored `.tsbuild` declarations retain old names. No code, tests, or build were run for this archive-only closure.

## Findings

- Agent presentation uses the enabled canonical profile roster (`name`, `description`, `agentId`); legacy `hidden`, `mode`, and `displayName` fields are retired.
- `allowedTools` describes tool availability and `permissionPresetId` identifies the native preset; Host approval and the native SDK own authorization. Client-side `PermissionRuleset` simulation is retired.
- Per-agent sampling was tooltip-only metadata and is retired. Profile model bindings use canonical `providerId`/`modelId` with native variant selection.
- No adapter, alias, or new Canonical schema is required. See Task46 and decisions `Canonical agent profiles are the selectable UI roster` and `Native agent controls and ConfigStore catalog retirement`.