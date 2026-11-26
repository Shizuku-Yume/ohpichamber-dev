# 04: Edit and send-now for queued messages through an atomic Host take

**Effort:** release-hardening
**Blocked by:** None
**Covers:** W1
**Files:** `packages/web/server/lib/message-queue/**`, `packages/ui/src/stores/messageQueueStore.ts`, the queue UI under `packages/ui/src/components/chat/**`, queue schemas in `packages/agent-contract` if the projection changes
**Read first:** `.workflow/specs/release-hardening.md`; `.workflow/technical-debt.md` entry "Queued message editing needs preserved original drafts and atomic Host take"; `packages/web/server/lib/message-queue/` docs; `.agents/skills/sync-state-invariants/SKILL.md`; `.agents/skills/ui-api-decoupling/SKILL.md`
**Check:** `bun run --cwd packages/web test -- server/lib/message-queue` and `cd packages/ui && bun test src/stores/messageQueueStore` → pass, including new tests for concurrent delivery against take, a leased item refused, a stale revision refused, a failed take leaving the item queued, and an old record without an original draft. A real isolated run queues two messages during a run, edits one and sends the other immediately, with attachments preserved; screenshots in `task04/`.

- [ ] The Host stores the original public draft (text, attachments, model options, context) beside its capture; old records are marked as having no recoverable original.
- [ ] An authenticated atomic take/restore transfers ownership with a revision check and returns the full draft only after the transfer succeeds.
- [ ] Edit and send-now are enabled in the UI on web, Electron and mobile; the Host stays the only delivery authority.
- [ ] Localize new copy in all 15 locales; delete the `technical-debt.md` entry in the fixing commit.
