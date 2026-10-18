# 42: Classify residual UI OpenCode helper ownership

**Effort:** omp-through-m3
**Task type:** spike
**Base commit:** 0a56f63a18d3b2bbab34ba44612afaef4e223740

**Delivers:** A durable inventory of the remaining non-test UI imports from `lib/opencode/*`, grouped into (1) existing canonical contract/client owners, (2) Host-owned capability owners, and (3) genuine contract gaps. Each group gets a bounded follow-up or an explicit blocker; no caller is changed merely to reduce grep output.

**Blocked by:** None
**Files:** `packages/ui/src/lib/opencode/`, remaining non-test UI callers, `packages/agent-contract/src/`, `.workflow/omp-migration/`, `.workflow/development.md`, `.workflow/specs/omp-through-m3.md`

**Read first:** residual packet R2/R3 in `.workflow/specs/omp-through-m3.md`; `packages/agent-contract` catalogs/session contracts; `packages/ui/src/api/canonicalClient.ts`; relevant UI store and Host module documentation; Tasks 17, 39, 41.

**Covers:** W9, W10

**Question:** Which remaining helper calls can be cut over now, and which need a canonical contract decision before Task17 retirement?

**Method:** Inventory production imports and call sites only. For each symbol record its current observable behavior, the authoritative replacement if complete, affected retained surfaces (Web, Electron, hosted mobile, Capacitor), focused proof, and the smallest next task. Treat tests and fixtures as invalidated consumers, not production evidence. Do not add an adapter, fallback, guessed schema, or source edit during the spike.

**Check:** A source-backed classification receipt and updated task/spec/development records; no implementation checks are required because this is a spike.

## Progress

- [x] Inventory the full non-test `lib/opencode/*` reach-in set and remove generated/build artifacts from the count.
- [x] Resolve canonical owners for helper/type-only callers where contracts already exist.
- [x] Record explicit gaps for tools, web search, plugins, usage stats, IDs, permissions, commands and remaining provider operations.
- [x] Split only contract-complete implementation tasks; keep unresolved items blocked.
- [x] Update the residual effort table and Task17 dependency list without claiming W9/W10.
**Finished:** 2026-10-18

## Findings

The durable classification receipt is `.workflow/omp-migration/m3/task42-residual-helper-ownership.json`. Twenty-four production files have existing canonical owners, four are Host-owned, seventeen remain blocked by missing contracts, and four are orphaned dead weight. Five bounded implementation slices are ready; Task39 and Task43 remain blockers for the missing-contract group. No connected W7-W10 evidence is claimed.
 
## Closure evidence (2026-10-18)

The bounded pure tool/Host follow-up is now evidenced without changing the original ownership classification: tool predicates, tool constants, and `isFinalToolStatus` cut over to `packages/ui/src/lib/toolHelpers.ts`. `sessionEvents` and `fileTreeChanges` retain only the blocked legacy `Part` and `toolListingChanges` shapes; those contract gaps remain open rather than being replaced with inferred adapters.

The orphan cleanup deleted `formCardState`, `formSerializers`, and `dispatched-session` with their tests. `subagent-run` is retained because `client.ts` still imports its cancellation helper, so it is not treated as deleted dead weight in the closure evidence. UI type-check and the focused `sessionEvents`/`fileTreeChanges` tests pass; `dead-code` remains the known nonblocking baseline exit 1. The existing Task39 and Task43 blockers and classifications remain unchanged. No W7-W10 or M3 completion is claimed.

**Stop condition:** Stop after the inventory and ownership classification are durable. Do not implement speculative contract replacements in this spike.
