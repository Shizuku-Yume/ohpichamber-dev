# 07: Canonical per-turn diff contract and the Last-turn diff surface

**Effort:** release-hardening
**Blocked by:** None
**Covers:** W1
**Files:** `packages/agent-contract/src/**` (turn/message DTOs), Agent Service turn projection and persistence, the Last-turn diff presentation in `packages/ui` (`components/chat/lib/turns/**`, `apps/MobileChangesSurface.tsx` and the diff view it opens)
**Read first:** `.workflow/specs/release-hardening.md`; `.workflow/technical-debt.md` entry "Last-turn diff lacks a Canonical per-turn diff contract"; `.workflow/omp-migration/contracts.md`; upstream behavior via `git show 30c70496a5:<path>` for the Last-turn diff surface; `.agents/skills/sync-state-invariants/SKILL.md`
**Check:** `bun run --cwd packages/agent-contract test && TMPDIR=<task tmp> bun run --cwd packages/agent-service test && cd packages/ui && bun test src/components/chat/lib/turns` → pass, including new tests for normal, empty, unsupported (turns recorded before the contract) and failed states, edits by subagents attributed to their own turn, and no fallback to a workspace diff. A real isolated run makes two turns with edits and shows each turn's diff on desktop and mobile; screenshots in `task07/`.

- [ ] Each turn records the files it changed, with before/after content provenance from OMP edit/write results, not from tool-history guessing.
- [ ] The Last-turn diff surface reads only that contract and shows each state explicitly.
- [ ] Update `contracts.md`; delete the `technical-debt.md` entry in the fixing commit.
