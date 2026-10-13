# 23: Verify the M2 service gate

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** <commit-sha>

**Delivers:** A disposable authenticated Host/Agent Service run proves the complete M2 service boundary before M3 client migration starts.

**Blocked by:** 11, 22
**Files:** `.workflow/development.md`, `.workflow/omp-migration/implementation-plan.md`, sanitized M2 acceptance evidence

**Read first:** `.workflow/specs/omp-through-m3.md` M2/W3-W6/W8; authoritative M2 gate; artifacts from tasks 08-12 and 22
**Covers:** W3, W4, W5, W6, W8

**Check:** One real disposable service scenario creates a temporary-workspace session, submits an attached prompt, observes ordered reasoning/tool/terminal events, aborts, reloads history, recovers snapshot/cursor, resolves competing approval/question replies, restarts workers, exercises durable queue and scoped Shell/catalog/completion. Close workers and prove no later publication or surviving owned descendants. Reuse focused evidence for unchanged edges. An unresolved required item keeps this gate unarchived.

- [ ] Prove Host auth and internal auth separately, including denied scope and malformed input.
- [ ] Verify stale request replies are rejected at the service boundary after restart, not inferred from killed fixture workers.
- [ ] Prove queue attachment/order/revision durability across Host restart and failure isolation.
- [ ] Prove Guest Shell running/ended reconnect snapshots, bounded output and cross-session ownership enforcement.
- [ ] Verify sibling cwd/env isolation and the accepted worker resource target.
- [ ] Record limitations and release task 13 only after required M2 evidence exists. This is not Web/Electron M3 acceptance.
