# 05: Reconcile interrupted sends through durable Canonical receipts

**Effort:** release-hardening
**Blocked by:** None
**Covers:** W1
**Files:** `packages/agent-contract/src/**` (prompt submission and receipt schemas), Agent Service prompt submission and persistence, Host Gateway route if it proxies the query, `packages/ui/src/sync/send-failure-classification.ts` and its callers
**Read first:** `.workflow/specs/release-hardening.md`; `.workflow/technical-debt.md` entry "Interrupted sends lack durable Canonical receipts"; `.workflow/omp-migration/contracts.md`; `packages/ui/src/sync/DOCUMENTATION.md`; `.agents/skills/sync-state-invariants/SKILL.md`; `.agents/skills/ui-api-decoupling/SKILL.md`
**Check:** `bun run --cwd packages/agent-contract test && TMPDIR=<task tmp> bun run --cwd packages/agent-service test && cd packages/ui && bun test src/sync` → pass, including new tests: lost response after acceptance reconciles to the accepted turn with no duplicate; rejection restores the draft; an unknown receipt after restart stays pending, never auto-restored; generated clients are current. A real isolated run drops the send response (kill the Host connection mid-request) and shows the turn once; receipt in `task05/`.

- [ ] Receipts are persisted keyed by the caller's correlation/idempotency ID, survive worker and service restarts, and expire by a documented rule.
- [ ] A Canonical query returns accepted, rejected or unknown; the UI reconciles from it and never guesses.
- [ ] Update `contracts.md` and the sync DOCUMENTATION; delete the `technical-debt.md` entry in the fixing commit.
