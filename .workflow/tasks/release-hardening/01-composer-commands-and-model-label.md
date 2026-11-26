# 01: Submit exact slash commands on Enter and show the running model

**Effort:** release-hardening
**Blocked by:** None
**Task type:** bugfix
**Covers:** W1
**Files:** `packages/ui/src/components/chat/composer/**`, `packages/ui/src/components/chat/ModelControls.tsx`, composer and model-selection stores they read
**Read first:** `.workflow/specs/release-hardening.md`; `.workflow/technical-debt.md` entries "Exact slash-command matches need a second Enter" and "Composer model label temporarily shows the previous model during a new-session run"; `ohpichamber-omp-artifacts/omp19-close-2026-11-26/realpath/REPORT.md`; `.agents/skills/sync-state-invariants/SKILL.md`
**Check:** `cd packages/ui && bun test src/components/chat/composer src/components/chat/ModelControls` → all pass, including new tests for exact-match Enter, draft restore after a rejected control command, and the streaming model label. Then a real isolated Web run (desktop 1600 px and 390×844) shows `/compact` submitting on one Enter, a rejected command restoring its text, and a new session's label matching the model of its run; screenshots in `task01/`.

- [ ] Trace and record the cause of each defect before fixing it.
- [ ] Enter on an input that exactly equals the highlighted command submits it; a partial match still completes first. Keyboard and touch submit behave the same.
- [ ] A control command the runtime rejects restores the typed text and keeps the error visible.
- [ ] While a new session's first run streams, the model label comes from the authoritative session/run selection; ordinary draft selection outside a run is unchanged. Promotion, streaming, completion and interruption order are covered.
- [ ] Delete both `technical-debt.md` entries in the fixing commit.
