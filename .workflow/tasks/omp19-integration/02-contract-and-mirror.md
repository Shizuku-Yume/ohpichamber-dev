# 02: Todo history, settings and internal URLs

**Effort:** omp19-integration
**Blocked by:** 01
**Covers:** W2, W3
**Check:** `bun test src` in packages/agent-contract and `bun test src/worker --timeout 15000` in packages/agent-service → passes

- [ ] Remove blocked from live todos and normalize historical blocked to pending.
- [ ] Update settings placement and all locale labels.
- [ ] Follow native local URL grammar without expanding authority.

## Progress

Web/PWA, Electron, hosted mobile and Capacitor share canonical todo/run behavior; Guest SDK and native process ownership remain unchanged.
