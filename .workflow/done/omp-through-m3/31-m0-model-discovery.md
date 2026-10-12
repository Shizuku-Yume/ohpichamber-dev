# 31: Verify public SDK online model discovery

**Effort:** omp-through-m3
**Task type:** spike
**Base commit:** 981d05f03
**Started:** 2026-10-12
**Finished:** 2026-10-12
**Dirty at start:** 3,235 pre-existing assembled-source, workflow, skill and documentation paths; preserved and excluded except this task and its new sanitized artifact.
**Question:** Does the pinned-source installed SDK perform real online model discovery and publish its result through the public registry rather than static registration or a cached fallback?
**Time box:** One bounded public-SDK discovery scenario against the operator-approved custom test provider; no completion, permission, MCP, platform or broad capability-suite rerun.

**Delivers:** An observed online model-discovery result with the actual public SDK owner, request/result/cache provenance, timeout/exit and cleanup, or a precise failed/unavailable boundary that remains for gate 03 to decide.

**Blocked by:** 29
**Files:** `.workflow/omp-migration/m0/model-discovery.json`; this task; disposable external task-24 consumer state only

**Read first:** `.workflow/specs/omp-through-m3.md` M0/W1; implementation-plan M0 model-discovery requirement; archived task 29 and `provider-oauth-feasibility.json`; task-24 immutable source-install identity; installed public ModelRegistry/model-discovery owners; enterprise boundary and task-29 secret-launch correction.
**Covers:** W1

**Check:** Run one bounded direct installed public-SDK online discovery scenario using only the approved provider inputs and actual supported SDK discovery API. Record whether the underlying approved provider transport was reached, the HTTP/result status and whether returned registry records came from online discovery rather than static models/cache. Emit sanitized status/counts/comparisons only, retain errors or fallback status as failures/limits, and observe owned-store/process/private-root cleanup. A registered static-model echo, mocked HTTP response, CLI/RPC substitution or nonempty fallback catalog does not satisfy the requirement.

- [x] Resolve the installed public discovery owner and supported provider configuration before execution; do not invent private API access.
- [x] Use unchanged immutable package inputs and isolated owned AuthStorage/model cache/config paths; never read legacy stores or change approved inputs/application dependencies.
- [x] Query only the operator-approved provider destination through the public SDK; no completion call, unrelated provider discovery, telemetry or unapproved endpoint.
- [x] Keep credentials out of external argv, output, source and artifacts; inherit approved variables through fish builtins, then clear them before SDK imports.
- [x] Distinguish real online HTTP/registry publication from offline/static/cache fallback and preserve failed, partial, unavailable or empty outcomes honestly.
- [x] Capture source/package/runtime identity, bounds, sanitized request/result observations and cleanup; teardown failure must not preserve a successful probe result.
- [x] Parent reviews evidence, removes disposable source and archives this investigation; only gate 03 can release M1.

## Progress

- Check before: skipped for a spike. Gate 03 Brief A found `onlineModelDiscovery` still unexercised in tasks 24/25/29; the maintainer selected verification rather than accepting this additional limit. All other M0 evidence and provider/platform decisions remain reusable.
- Exact reviewed/run source: `/tmp/ohpi-m0-evidence-consumer/task31-model-discovery.ts`, SHA-256 `fa7179682d63a24841da32b1c5fbe9b8acdb0f64d3e5cfd86d7e4be70660ba8a` (review tag070C). Sanitized `.workflow/omp-migration/m0/model-discovery.json` records the exact receipt from `artifact://457:raw:1-1`, reused immutable task24/source revision `c9de2b02b997f37cc89639282ed35dec86f139e8`, Linux-x64 and Bun1.4.2. No identity-suite rerun or package write.
- Public owner: installed `ModelRegistry` constructor with `modelsPath` and public `settings/cacheDbPath/fetch`; `refreshDiscoverableProviders([providerId], "online")` targets only the configured provider without static reload/unrelated discovery. Public `getProviderDiscoveryState` and `getProviderModels` provide the measured state and actual records. Config declares required unchanged approved `api/baseUrl`, `discovery.type=openai-models-list`, `injectV1=false`, timeout10s and no static models/configured key. Unsupported approved input fails closed.
- Actual parent-authorized invocation: `/home/shizuku/.bun/bin/bun run task31-model-discovery.ts` from `/tmp/ohpi-m0-evidence-consumer`, outer timeout180s, worker/launcher hard bound150s and discovery timeout10s. Parent alone ran exactly one scenario after pre-run security PASS; delegated worker did not execute/retry. Fish builtins privately source/export/allowlist the four inputs, set private environment, and exec Bun directly; no secret-bearing external argv. Worker deletes all four variables before SDK imports; SDK stdout/stderr discarded.
- Real public fetch observer permitted only documented approved-base `/models` GET, refused redirects/other destinations, counted calls/status only and passed the untouched real response to SDK. Cold-cache/idle-empty baseline, real2xx transport and fresh matching nonempty publication distinguished online discovery; configured public state omitted optional `source`, so the probe observed null rather than inventing it. No completion rerun, mock/static echo, package write or additional invocation.
- Pre-run security finding `TASK31-SIGNAL-CLEANUP`: default SIGINT/SIGTERM/SIGHUP exit could bypass normal cleanup. Narrow correction installs idempotent handlers before spawn, marks interruption/non-success, kills the owned worker if present and retains the existing child-exit await/single finally/root removal. Success requires no interruption; handlers are removed after finalization. The same pre-run security review passed exact070C/SHA before parent authorization. Actual normal run reports interruptionfalse; signal cleanup path itself was not exercised.
- Observed 2026-10-12T05:16:01.265Z–05:16:02.416Z: one real approved GET, HTTP200, denied0, transportErrors0. Cold cache and initial idle/zero-model registry became fresh statusok, stalefalse, noerror, fetchedAtpresent, registry8/modelCount8, private state/registry ID sets match and approved selected model presenttrue. Public state `source:null` is preserved honestly; provenance is cold-empty→realHTTP→freshregistry-publication, not static/cache fallback or model echo.
- Parent outer command exit0/wall1.21s; owned worker exit0, childExitedtrue, workerTimedOutfalse and interruptedfalse. Public AuthStorage.close returned and private root removal/absence was observed. Native model-cache handles rely on explicit worker exit before root removal; no globalservice guarantee or independently tested abnormal cleanup guarantee is claimed. No further invocation.
- Requirements review passed and resolved gate03's sole online-discovery blocker subject to cleanup/archive/document validation. Quality review passed after a nonblocking P2 finding was fixed: the durable artifact now records owned `agent/auth.db`, `config/models.yml`, `cache/models.db` and root/WAL/SHM cleanup. The finding did not invalidate this observed receipt; no rerun was needed. Available reviewer agents substituted for the unavailable workflow-reviewer role.
- Parent deleted the reviewed disposable source without reuse. The artifact keeps `m0Accepted:false`: only gate03 accepts the M0 handoff. Existing provider/platform limits and later service/application gates are unchanged.

## Findings

The pinned-source installed public registry performed real online discovery and published the approved provider's records from a cold empty catalog. One GET returned HTTP200; eight records matched the fresh public discovery state, including the approved selected model. Public AuthStorage closed, the owned worker exited0 and its private root was removed. The nullable public `source` field is not provenance by itself; the observed cold→realHTTP→freshpublication transition establishes this result. No official-provider/OAuth, non-Linux, service or application acceptance is claimed.
