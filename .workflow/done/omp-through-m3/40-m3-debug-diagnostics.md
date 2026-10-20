# 40: Cut diagnostics location probes to the canonical workspace owner

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 0a56f63a18d3b2bbab34ba44612afaef4e223740

**Delivers:** The diagnostics report resolves the active workspace through the Canonical Client and Host/project stores instead of calling OpenCode location/project endpoints. Debug output keeps explicit failure data and no longer names the legacy client directory field.

**Blocked by:** None
**Files:** `packages/ui/src/lib/debug.ts`, directly invalidated debug tests/types, `.workflow/development.md`

**Read first:** `.workflow/specs/omp-through-m3.md` M3/W10; `packages/ui/src/lib/debug.ts`; `packages/ui/src/api/canonicalClient.ts`; `packages/ui/src/stores/useProjectsStore.ts`; `packages/ui/src/lib/host-filesystem.ts`; UI debug consumers
**Covers:** W10

**Check:** `bun run --cwd packages/ui build && bunx tsc --noEmit --pretty false -p packages/ui/tsconfig.test.json && bunx oxlint packages/ui/src/lib/debug.ts` → build/type-check pass; lint may report only unchanged debug-report baseline findings. Do not run workspace-wide checks or connected acceptance for this slice.

- [x] Resolve active workspace through `canonicalClient.resolveWorkspace` when a directory exists.
- [x] Use Host/project state for the project diagnostic and preserve explicit unavailable/error output.
- [x] Remove the OpenCode client location/project calls and stale client-directory detail field.
- [x] Verify build, strict UI test-project type-check, and touched-file lint classification.
- [x] Do not claim connected W10 or M3 acceptance from this focused slice.
**Finished:** 2026-10-18

## Progress

The implementation and focused checks are complete. `debug.ts` resolves the workspace through `canonicalClient.resolveWorkspace`, reads the active project from `useProjectsStore`, and no longer calls the OpenCode location/project methods. UI build and strict UI test-project type-check pass; touched-file oxlint retains only the pre-existing debug-report baseline findings. Connected W10 and M3 acceptance remain open.
