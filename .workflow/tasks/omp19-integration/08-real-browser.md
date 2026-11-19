# 08: Verify OMP 19 in the development browser

**Effort:** omp19-integration
**Blocked by:** 07
**Covers:** W7, W8, W9
**Check:** `bun run dev` with isolated HOME/data/userData under `/tmp/ohpi-dev`; browser at localhost:5180 shows streaming then idle, todos, ask form answer round-trip, Bash result, task HUD progress, handoff compaction and Stop cancellation
**Base commit:** 14bc8ce25

- [ ] Configure an OpenAI-compatible provider through the browser using bound test secrets, a /v1 endpoint, and only devin-swe-2 or gemini-3.5-flash-lite.
- [ ] Exercise each requested behavior and capture screenshots under `/home/ubuntu/omp19-artifacts/screens/`.
- [ ] Fix any demonstrated bugs on their owning boundaries, verify and commit locally.
- [ ] Record pass/fail evidence and remaining limits in development.md.

## Progress

No push or main integration is authorized. The browser checks use the real Host Gateway and OMP workers, without mock provider responses.
