# 31: Verify public SDK online model discovery

**Effort:** omp-through-m3
**Task type:** spike
**Base commit:** 981d05f03
**Started:** 2026-10-12
**Status:** active
**Dirty at start:** 3,235 pre-existing assembled-source, workflow, skill and documentation paths; preserved and excluded except this task and its new sanitized artifact.
**Question:** Does the pinned-source installed SDK perform real online model discovery and publish its result through the public registry rather than static registration or a cached fallback?
**Time box:** One bounded public-SDK discovery scenario against the operator-approved custom test provider; no completion, permission, MCP, platform or broad capability-suite rerun.

**Delivers:** An observed online model-discovery result with the actual public SDK owner, request/result/cache provenance, timeout/exit and cleanup, or a precise failed/unavailable boundary that remains for gate 03 to decide.

**Blocked by:** 29
**Files:** `.workflow/omp-migration/m0/model-discovery.json`; this task; disposable external task-24 consumer state only

**Read first:** `.workflow/specs/omp-through-m3.md` M0/W1; implementation-plan M0 model-discovery requirement; archived task 29 and `provider-oauth-feasibility.json`; task-24 immutable source-install identity; installed public ModelRegistry/model-discovery owners; enterprise boundary and task-29 secret-launch correction.
**Covers:** W1

**Check:** Run one bounded direct installed public-SDK online discovery scenario using only the approved provider inputs and actual supported SDK discovery API. Record whether the underlying approved provider transport was reached, the HTTP/result status and whether returned registry records came from online discovery rather than static models/cache. Emit sanitized status/counts/comparisons only, retain errors or fallback status as failures/limits, and observe owned-store/process/private-root cleanup. A registered static-model echo, mocked HTTP response, CLI/RPC substitution or nonempty fallback catalog does not satisfy the requirement.

- [ ] Resolve the installed public discovery owner and supported provider configuration before execution; do not invent private API access.
- [ ] Use unchanged immutable package inputs and isolated owned AuthStorage/model cache/config paths; never read legacy stores or change approved inputs/application dependencies.
- [ ] Query only the operator-approved provider destination through the public SDK; no completion call, unrelated provider discovery, telemetry or unapproved endpoint.
- [ ] Keep credentials out of external argv, output, source and artifacts; inherit approved variables through fish builtins, then clear them before SDK imports.
- [ ] Distinguish real online HTTP/registry publication from offline/static/cache fallback and preserve failed, partial, unavailable or empty outcomes honestly.
- [ ] Capture source/package/runtime identity, bounds, sanitized request/result observations and cleanup; teardown failure must not preserve a successful probe result.
- [ ] Parent reviews evidence, removes disposable source and archives this investigation; only gate 03 can release M1.

## Progress

- Check before: skipped for a spike. Gate 03 Brief A found `onlineModelDiscovery` still unexercised in tasks 24/25/29; the maintainer selected verification rather than accepting this additional limit. All other M0 evidence and provider/platform decisions remain reusable.
