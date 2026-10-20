# 62: Restore running-session Stop visibility

**Effort:** omp-through-m3
**Task type:** bugfix
**Base commit:** e848504602333955b1d134bba3345d8bbc2ed065

**Delivers:** The original Composer shows Stop while a canonical run is still live, even when a transient SSE/snapshot failure marks the directory-scoped status unavailable. Pending approval/question precedence remains unchanged, and Stop still invokes the canonical abort owner.

**Blocked by:** None
**Files:** `packages/ui/src/hooks/useSessionActivity.ts`, focused hook/composer tests
**Read first:** Task36 packaged receipt `stopControlGap`, `packages/ui/src/sync/global-session-status.ts`, `packages/ui/src/sync/sync-context.tsx`, `packages/ui/src/components/chat/ChatInput.tsx`, `.workflow/specs/omp-through-m3.md` W7
**Covers:** W7, W10

**Check:** Focused hook/composer behavior tests, strict UI type-check (`bun run --cwd packages/ui type-check`), parent UI build, and actual Web plus packaged Electron running prompt showing Stop and cancelling through the canonical abort path.

- [ ] Treat `unavailable` or invalidated directory status as unknown, not authoritative idle.
- [ ] Use the existing global live-session authority when it reports the addressed session running, while preserving pending permission/question precedence.
- [ ] Keep runtime identity and canonical abort ownership unchanged.
- [ ] Verify the Stop control and keyboard abort on Web and packaged Electron after the original UI restoration slices land.
