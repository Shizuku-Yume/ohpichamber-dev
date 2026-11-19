# 09: Verify the Linux x64 packaged Agent runtime

**Effort:** omp19-integration
**Blocked by:** None
**Covers:** W9
**Check:** in packages/electron, `bun run prepare:agent-runtime && bun run verify:agent-runtime` succeeds for Linux x64 and reports OMP readiness
**Base commit:** 14bc8ce25

- [x] Stage the installed runtime closure using pinned Bun 1.4.4.
- [x] Verify native imports, manifest target and packaged supervisor readiness.

## Progress

Check after: prepare and verify exit 0 on Linux x86_64. Manifest identifies linux/x64 and Bun 1.4.4. Verifier reports 123 packages and `{"ready":true,"engine":"omp","version":"1.0.0"}`. Receipts: `/home/ubuntu/omp19-artifacts/logs/stage3-{prepare,verify}-runtime.log`.

Review: skipped — verification-only task; fresh independent review remains required before effort close. This is packaged Agent Service verification, not Electron GUI or non-Linux certification.
