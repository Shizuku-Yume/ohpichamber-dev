# 01: Pin the OMP 19.1 runtime

**Effort:** omp19-1-integration
**Blocked by:** None
**Covers:** W1
**Check:** `bun run --cwd packages/electron prepare:agent-runtime && bun run --cwd packages/electron verify:agent-runtime` → staged Linux runtime reaches readiness with the verified 19.1.0 leaf.
**Base commit:** 19613812d592da249a5a12bd1d152054800c9fa8
**Status:** active

- [x] Pin the published SDK closure and rebase the offline startup and Bash job observations.
- [x] Include the MCP protocol fallback and keep lock, Docker and Electron staging coherent.

## Progress

Check after: Pristine SDK patch check passed. Linux Electron preparation staged
the runtime, and verification reported 123 packages and OMP readiness on Bun
1.4.4. The workspace source registration hook supplied the unbuilt Web Host
module.

Review: skipped — this session cannot spawn fresh workflow or security reviewers.
