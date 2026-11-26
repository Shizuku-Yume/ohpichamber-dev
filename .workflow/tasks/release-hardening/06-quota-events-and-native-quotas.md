# 06: Emit Guest marks and quota change events; replace covered Host quota scrapers

**Effort:** release-hardening
**Blocked by:** None
**Covers:** W3
**Files:** `packages/web/server/lib/quota/**`, Host Guest marks owner, the shared control stream producer and UI consumer, Guest SDK quota and Work Status callers in `packages/ui`, `packages/sdk` if its quota contract changes
**Read first:** `.workflow/specs/release-hardening.md`; `.workflow/decisions.md` entry "Native OMP quotas replace the Host scrapers they cover"; `.workflow/technical-debt.md` entry "Guest marks and quota providers lack Host change producers"; `.workflow/development.md` Usage paragraph (Current state); `packages/web/server/lib/quota/DOCUMENTATION.md`; `packages/sdk/DOCUMENTATION.md`; `.agents/skills/relay-transport/SKILL.md`; `.agents/skills/sync-state-invariants/SKILL.md`
**Check:** `bun run --cwd packages/web test -- server/lib/quota` plus the Guest marks and control-stream tests, and `cd packages/ui && bun test src/stores src/components/chat/work-status` → pass, including new producer tests (scoped, validated, emitted only after a successful write) and a coverage test listing the same quota providers before and after. A two-client isolated run shows a quota and a Guest mark change refreshing the other client without reconnect; receipts in `task06/`.

- [ ] Record the provider coverage table (native OMP versus Host scraper) before any removal and save it to `task06/`.
- [ ] Successful Host writes emit `guest-marks-changed` and `quota-providers-changed`; clients refresh through the shared control stream.
- [ ] Guest SDK quotas and Work Status read native OMP quotas for covered providers; covered Host scrapers and their tests are removed; uncovered providers keep theirs.
- [ ] Update quota and SDK DOCUMENTATION and the development.md Usage paragraph; delete the `technical-debt.md` entry in the fixing commit.
