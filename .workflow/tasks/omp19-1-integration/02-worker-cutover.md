# 02: Adapt Canonical worker integration

**Effort:** omp19-1-integration
**Blocked by:** 01
**Covers:** W2, W3
**Check:** `bun run --cwd packages/agent-service test && bun run type-check` → Canonical smoke, integration regressions and workspace type-check pass.

- [x] Preserve Host authorization, plan review, MCP worker isolation, and shell observation across the new SDK.
- [x] Preserve configured tool-command preferences and refuse magic edit mode.

## Progress

The Canonical loopback smoke exercised real Agent Service and SDK workers:
plan proposal and approval, a Host refusal of a Bash-mounted tool, a modern
MCP connection and its published tool, and shell output retrieval. No live
provider was required. Focused tests covered both MCP protocol generations.
The uncapped Agent Service run completed with 703 passes, 12 skips, and
no failures. Root type-check passed with the staged Electron runtime after
the wiring audit excluded the generated SDK. No OpenChamber sync changes
were made.

PR review found that Task and Vibe children did not receive the Host Bash
authorizer. The SDK now passes it into fresh and restored child sessions. A real Task child test
checks that Host denial stops a shell command and that a Bash-mounted LSP
command receives separate Host checks for Bash and the validated LSP input.

Review: skipped — this session cannot spawn fresh workflow or security reviewers.
