# 10: Render the transcript through upstream ChatViewport on Canonical records

**Effort:** release-hardening
**Blocked by:** 07
**Task type:** refactor
**Covers:** W5
**Files:** `packages/ui/src/components/chat/**` (new `column/ChatViewport.tsx`, `timeline/*`, `message/body/*`, `message/parts/toolRow/*`; deleted `ChatContainer` transcript path, `MessageList.tsx`, `ChatMessage.tsx`, `message/MessageBody.tsx`, `message/parts/ToolPart.tsx` and their callers)
**Read first:** `.workflow/specs/release-hardening.md`; `.workflow/technical-debt.md` entry "Chat transcript still renders through ChatContainer instead of upstream ChatViewport" (read line 99 whole); upstream sources via `git show 30c70496a5:packages/ui/src/components/chat/<path>`; `.workflow/upstream-deltas.tsv` rows for these paths; `packages/ui/src/sync/DOCUMENTATION.md`; `.agents/skills/performance-engineering/SKILL.md`; `.agents/skills/sync-state-invariants/SKILL.md`
**Check:** `cd packages/ui && bun test src/components/chat src/sync && cd ../.. && bun run type-check` → pass. Before any edit, capture the fixed parity session set on the current tree (text, reasoning, every OMP tool card, subagents, background shells, compaction, errors, long transcript scroll) at 1600 px and 390×844; capture it again after the port; `task10/PARITY.md` pairs every screenshot and records no missing content and no console errors.

- [ ] Port the upstream owners onto Canonical session, message and part records from `@openchamber/agent-contract`, keeping Canonical-only behavior (subagent child sessions, background shells, prompt origin, OMP tool cards, the Last-turn diff from task 07).
- [ ] Switch every caller to `ChatViewport` and delete the monolithic path in the same change; no adapters back to OpenCode shapes.
- [ ] Keep streaming and scroll performance at least at the current level on a long transcript; record the measurement.
- [ ] Update `upstream-deltas.tsv` for the adopted paths; delete the `technical-debt.md` entry in the fixing commit.
