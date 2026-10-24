# 15: Run the Docker image on the Agent Service

**Effort:** post-m3-hardening
**Task type:** feature
**Base commit:** 243b0efc0c16adbac63601715d8954e1362049fb
**Base branch:** post-m3-hardening/11-release-workflows-agent-runtime
**Started:** 2026-10-24T12:02:00+08:00
**Finished:** 2026-10-24T12:10:00+08:00

**Delivers:** The Docker image starts the Host and Agent Service from the pinned vendored runtime, without installing the OpenCode CLI or the `oh-my-opencode` bootstrap.

**Blocked by:** 11
**Files:** `Dockerfile` (line 60: `npm install -g @opencode/cli@2.0.25`); `scripts/docker-entrypoint.sh` (6-7, 53-60); docs that describe Docker setup

**Read first:** `.workflow/specs/post-m3-hardening.md`; `/home/shizuku/Project/ohpichamber-omp-artifacts/post-m3-review-2026-10-23/``PlanGapAnalysis.md` finding 8; `packages/web/README.md`; `.agents/skills/openchamber-change-discipline/SKILL.md` (Dockerfile workspace rule)
**Covers:** H10

**Check:** `docker build` then `docker run` → `/api/agent/v1/ready` returns 200 and a prompt completes. No Docker daemon is available on this workstation; if that is still true, the Check is recorded as not run and the build inputs are validated statically, stated as such.

## Done when

- [x] No `OPENCODE_*` or `oh-my-opencode` handling remains in the image.
- [x] arm64 images depend on task 29 (the follow-up to task 12); this is stated in `## Progress`.

## Progress

- Dirty at start: `packages/electron/scripts/prepare-agent-runtime.test.mjs` (inherited unstaged native test change; not staged).
- Check before: cannot run (no Docker CLI/daemon). Static inputs show the image installed `@opencode/cli@2.0.25`, exported `OPENCODE_CONFIG_DIR`, and bootstrapped `oh-my-opencode` on demand.
- Work: removed the OpenCode CLI install; removed the `OPENCODE_CONFIG_DIR` export and the `OH_MY_OPENCODE`/`oh-my-opencode` block from the entrypoint. Kept `nodejs`/`npm` and the npm prefix/PATH because `packages/web/README.md` documents Node as a Host prerequisite and the image's tooling/plugin paths rely on npm; no other image behavior changed.
- Check after: Docker build/run, `/api/agent/v1/ready` and prompt completion were not run because Docker is absent on this workstation; no container result is claimed. Static receipt `/home/shizuku/Project/ohpichamber-omp-artifacts/task15-2026-10-24/task15-static-checks.log` (`PIPESTATUS=0`): `sh -n scripts/docker-entrypoint.sh` passes; no `OPENCODE_`/`oh-my-opencode`/`@opencode/cli` references remain in `Dockerfile` or the entrypoint; every non-stage `COPY` source exists; SDK, agent-contract and agent-service builds pass. `bun run build:web`, which the builder stage also runs, was exercised by the Task11 package smoke in this stack.
- **arm64 dependency:** the image can build only linux-x64 today because root overrides/lock carry only the `@oh-my-pi/pi-natives-linux-x64` leaf. Linux arm64 and the other non-Linux leaves are owned by task 29 (`29-vendor-native-leaves.md`, blocked by task 12); arm64 images remain unsupported and unverified until it lands. The release workflows fail such targets at staging with the explicit task 29 message.
- Docs: no repository document describes a Docker build/run procedure to update; `packages/web/README.md` states OpenCode is not a startup prerequisite, which remains true. A tunnel-container path note is unrelated.
- Review boundary: `243b0efc0` + `Dockerfile`, `scripts/docker-entrypoint.sh`; round: 1; briefs: A,B; boundaries: container dependency inputs, entrypoint env/startup, Host→Agent Service launch; findings: 2 blocking (A) / Brief B unavailable. Brief A's blocking findings were record completeness (arm64 dependency and check receipt), fixed in this record. Brief B produced no result: its review agent was interrupted by a process restart and returned no output, so its brief is explicitly unavailable and is passed to the coordinator rather than claimed as passed. No Brief B finding was received or acted on.
- Next: Task27 (vendor runbook) follows on its own branch; Task14 remains blocked on the maintainer signing choice (open question 4).
