# 03: Make user-file MCP credential references workspace-independent

**Effort:** release-hardening
**Blocked by:** None
**Covers:** W2
**Files:** `packages/agent-service/src/worker/{mcp-credentials,mcp,stateless}.ts` and their tests, the MCP catalog install scope dialog in `packages/ui/src/components/sections/mcp/**`
**Read first:** `.workflow/specs/release-hardening.md`; `.workflow/decisions.md` entries "User-file MCP credential references are workspace-independent" and "2026-11-16 - Catalog installs that collect environment values are project-scope only"; `.workflow/technical-debt.md` entry "A user-scope credential reference breaks every other workspace's MCP save"; `packages/agent-service/DOCUMENTATION.md` MCP sections; `.agents/skills/enterprise-boundary/SKILL.md`
**Check:** `TMPDIR=<task tmp> bun run --cwd packages/agent-service test` and `cd packages/ui && bun test src/components/sections/mcp` → pass, including new tests: a user-file reference written in workspace A saves from workspace B; a legacy workspace-hashed user-file reference is migrated and resolves; a project-file reference from another workspace is still refused. A real isolated run installs a token catalog entry at user scope in one project and saves MCP config from a second project; receipts in `task03/`.

- [ ] User-file references use a workspace-independent credential provider name; project-file references keep the workspace hash.
- [ ] Existing user-file references are migrated once, idempotently, with no secret written to logs; a reference whose credential cannot be found reports which entry needs re-entry instead of blocking unrelated saves.
- [ ] Catalog installs that collect environment values offer user scope again; the scope dialog copy is updated in all 15 locales.
- [ ] Update `DOCUMENTATION.md`; delete the `technical-debt.md` entry in the fixing commit.
