# 04: Give the Agent Service and workers an allowlisted environment

**Effort:** post-m3-hardening
**Task type:** bugfix
**Base commit:** f72010e3e
**Started:** 2026-10-23T12:49:03+08:00
**Finished:** 2026-10-23T14:20:00+08:00

**Delivers:** Agent tools can no longer read Host secrets or the internal service token from their environment, and real provider prompts still work.

**Blocked by:** None
**Files:** `packages/web/server/lib/host/agent-service-supervisor.js` (spawn at lines 225-242); `packages/agent-service/src/supervisor/workers.ts` (`workerEnvironment`, lines 216-220; spawn at 277-281); the service-side reader of the internal secret

**Read first:** `.workflow/specs/post-m3-hardening.md`; `/home/shizuku/Project/ohpichamber-omp-artifacts/post-m3-review-2026-10-23/``HostReview2.md` and `AgentServiceReview.md` finding 1; `.workflow/omp-migration/architecture.md` (environment overlays, ADR-03); `.agents/skills/enterprise-boundary/SKILL.md`; `packages/web/server/lib/host/DOCUMENTATION.md` if present
**Covers:** H3

**Check:** A regression test starts the supervisor with sentinel values for `OPENCHAMBER_UI_PASSWORD`, an unrelated `*_TOKEN` and the internal secret, then reads a worker's environment and the service's `/proc/<pid>/environ` → no sentinel present. It fails before the change. Then the real path: `bun run dev`, send a chat that completes through the provider from `standards.md`.

Root cause at `842a48adc`: `childEnv = { ...process.env, ...env, [SECRET_ENV]: secret, ... }` passes the whole Host environment, and `workerEnvironment` copies `process.env` again, deleting only `OHPICHAMBER_INTERNAL_SECRET`. Same-UID workers can still read the parent's `/proc/<pid>/environ`.

## Done when

- [x] The supervisor builds the service environment from an explicit allowlist (PATH, HOME, locale, proxy, XDG, required Bun/OMP variables and the directory-scoped overlays the architecture names) instead of `...process.env`.
- [x] The internal secret reaches the service through a channel worker processes cannot read (IPC or a pipe), not the environment.
- [x] Which provider credential variables workers legitimately need is decided and documented; the rest are excluded.
- [x] The security pass (CONVENTIONS §7) runs on the spawn boundary.

## Progress

Dirty at start: none.

Check before (worktree detach at `f72010e3e` with the new tests copied in):
- `bun test packages/agent-service/src/supervisor/workers.environment.test.ts` → 0 pass / 1 fail; the real worker's `env` contained `OPENCHAMBER_UI_PASSWORD=sentinel`.
- `bun run --cwd packages/web test -- server/lib/host/agent-service-supervisor.environment.test.js` → 2 tests failed; `/proc/<pid>/environ` of the real service contained the sentinels and the generated token.

Check after (this branch):
- Worker shell test → 1 pass / 0 fail / 13 expects.
- Supervisor env suite → 2 pass / 0 fail, including a real `packages/agent-service/src/index.ts` start and `/proc/<pid>/environ` inspection.
- Credential strategy: workers inherit no ambient provider credentials. The Host-authorized directory overlay and OMP `AuthStorage` are the supported sources; the overlay cannot override `OHPICHAMBER_INTERNAL_SECRET`, `OPENCHAMBER_MANAGED_PROCESS_TOKEN` or `PI_CODING_AGENT_DIR`.
- Env-only provider evidence: settings user variables and project variables are the directory overlay (`packages/web/server/lib/environment/runtime.js:124-131,246-263`), the Host passes that overlay to workspace admission (`packages/web/server/lib/host/agent-runtime.js:60-64`), and workers receive it as `input.env` (`packages/agent-service/src/supervisor/workers.ts`). The pinned SDK resolves provider credentials from env (`pi-ai` `envKeys`), so values configured through OpenPCHamber still reach workers; only ambient shell exports are intentionally not inherited.
- Standalone start contract: removed the misleading `packages/agent-service` `start` script. The service is Host-spawned only; an IPC-less start exits 1 without listening.
- Scope limit: this removes environment leakage. It is not a claim of isolation from same-UID `/proc` memory access, ptrace, or a compromised Host.
- Docs updated to the delivered contract: `packages/agent-service/README.md` (Host-only startup, IPC handshake, worker allowlist/overlay, provider source scope), `packages/agent-service/DOCUMENTATION.md` (catalog env-credential scope, captured effective environment), `packages/web/server/lib/host/DOCUMENTATION.md` (supervisor IPC handshake, Host overlay hand-off), and `.workflow/omp-migration/architecture.md` (token channel, worker provider-credential sources). Obsolete env-secret and direct-start claims removed.
- Real smoke passed. `bun run dev` started the Host and real Agent Service (`/health` 200, `agentService.phase=ready`; `/api/agent/v1/ready` 200). After `POST /auth/session` with an explicit local smoke password and a matching `Origin`, a session in the registered managed Chats workspace ran the prompt "Reply with exactly one word: pong" through `CLIProxyAPI/deepseek-v4.1-flash`; the turn completed with usage input 8749 / output 4 and assistant text `pong`. Receipts: `dev-smoke.log` (host/service readiness and the pre-auth 401), `provider-smoke.log` (authenticated completed turn). Credentials, cookies and tokens are not recorded.
- The earlier home-directory workspace attempt was scope-denied by the native-operation authorizer (home root is not an eligible workspace); it was not a credential or allowlist failure. The managed Chats workspace is the supported real-path target.
- Root suite: after rebasing onto the task 01 fix, `/home/shizuku/Project/ohpichamber-omp-artifacts/post-m3-hardening-task04-2026-10-23/root-test-after-a01-final.log` records `EXIT:0`; task 04 landed at `d09f22829`. The earlier failed `root-test.log` (802/804 files, `useQuotaStore.test.ts` failures) is retained as a historical failure, not a pass receipt.
- Review boundary: `f72010e3e...HEAD` + working tree (docs/task); paths: `agent-service-supervisor.js`, `agent-service/src/index.ts`, `workers.ts`+env test, host supervisor env test, four docs, task file; round: 1; briefs: Task04QualityReview and Task04SecurityReview completed; boundaries: Host→Agent Service spawn, Agent Service→worker spawn, private IPC token channel, provider.use authorization path; findings: 2 blocking (case-insensitive reserved keys; provider prompt unproven) both fixed/closed, plus nonblocking hardening applied.
- Quality review (completed): blocking — reserved worker keys must be filtered case-insensitively (fixed: reserved names matched case-insensitively before re-injection, including lower-case overlay variants); blocking — provider prompt unproven (closed by the completed authenticated smoke above); nonblocking — test restore ordering (fixed: registry close is inside a nested finally). Overall source correctness was otherwise confirmed.
- Security review (completed): no blocking findings. Applied nonblocking hardening: supervisor `env` overrides are filtered through the service allowlist; Windows/POSIX process variables were added to both allowlists; `PI_CODING_AGENT_DIR` is reserved/re-injected; `OMP_PROFILE`/`PI_PROFILE` deliberately remain overlay values because named profiles are a supported workspace feature (canonical-plugins regression covers it). The documented scope excludes same-UID memory/ptrace and a compromised Host.
- Security pass: reviewed the spawn boundaries and their direct callers. Ambient Host env, UI password, `*_TOKEN` and the internal secret are excluded from service and worker spawns; the overlay cannot set the reserved keys; the secret is read-only over the child IPC channel with 64-hex validation and a 10s timeout. No bypass found.
