# 11: Convert the fork-owned server JavaScript to strict TypeScript

**Effort:** release-hardening
**Blocked by:** 04, 05, 06
**Task type:** refactor
**Covers:** W4
**Files:** every path in `packages/web/scripts/fork-owned-server-untyped.json`; `packages/web/scripts/fork-owned-server-javascript.mjs`; the no-check referenced project and its tsconfig
**Read first:** `.workflow/specs/release-hardening.md`; `.workflow/technical-debt.md` entry "Fork-owned server JavaScript awaits TypeScript conversion"; nearest `DOCUMENTATION.md` of each converted module; `.agents/skills/openchamber-change-discipline/SKILL.md`; `.agents/skills/isolated-space-boundary/SKILL.md` for the isolated-space modules
**Check:** `bun run type-check && bun run --cwd packages/web test && bunx oxlint packages/web/server` → type-check passes with strict server checks, all Web tests pass, and oxlint reports 0 errors on converted files; `fork-owned-server-untyped.json` and the no-check project no longer exist.

- [ ] Convert by owner directory with real types: parse external input with Zod, no `any`, no unjustified casts, no `Record<string, unknown>` boundaries.
- [ ] Behavior is unchanged: the existing runtime tests of each module pass without edits other than import paths.
- [ ] The isolated-space release exclusion (`ISOLATED_SPACES_RELEASED = false`) and Canonical/Host boundaries are preserved.
- [ ] Remove the explicit list, the generator exemption and the no-check project; delete the `technical-debt.md` entry in the fixing commit.
