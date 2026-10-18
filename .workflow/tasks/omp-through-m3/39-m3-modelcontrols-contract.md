# 39: Assess the ModelControls canonical agent contract

**Effort:** omp-through-m3
**Task type:** spike
**Base commit:** <commit-sha>

**Delivers:** A checked contract decision for ModelControls' remaining agent presentation and pinned-model details: permission rules, sampling values, role/mode display, and model identity. The result identifies the canonical owner or records the exact missing contract without changing visible behavior.

**Blocked by:** 37
**Files:** `packages/ui/src/components/chat/ModelControls.tsx`, `packages/ui/src/stores/useConfigStore.ts`, `packages/agent-contract/src/session.ts`, `packages/agent-service/src/worker/catalog-agents.ts`, relevant migration contracts

**Read first:** `.workflow/specs/omp-through-m3.md` M3/W9/W10; `.workflow/tasks/omp-through-m3/37-m3-chat-agent-callers.md`; `decisions.md: 2026-10-18 - Canonical agent profiles are the selectable UI roster`; `packages/ui/src/components/chat/ModelControls.tsx`; `packages/agent-contract/src/session.ts`; `packages/agent-service/src/worker/catalog-agents.ts`; `packages/ui/src/stores/useAgentsStore.ts`
**Covers:** W9, W10

**Check:** Compare every ModelControls agent detail with an existing canonical contract and owner. Record `resolved` only for fields with an authoritative source; record `blocked` for missing permission, sampling, role/mode, or pinned-model presentation semantics. No source edits, tests, builds, or field-dropping UI changes.

- [ ] Inventory the remaining ModelControls Agent field accesses.
- [ ] Map each field to a canonical source or record it as missing.
- [ ] Decide the smallest contract-owning follow-up; do not add a pass-through adapter or infer native values.
- [ ] Keep Task17/36/18 open until the resulting callers and connected acceptance are verified.


**Status:** blocked

## Blocked

`ModelControls.tsx` still reads legacy `Agent.permissions`, `Agent.request.body` sampling, `Agent.mode`, and OpenCode model identifiers. The canonical Agent schema exposes none of the permission-rule, sampling, or role fields and uses a different pinned-model shape. Evidence is recorded in `.workflow/omp-migration/m3/task39-modelcontrols-contract-blocked.json`. Keep the caller unchanged until a canonical owner is intentionally specified; do not add an adapter or silently remove the visible details.