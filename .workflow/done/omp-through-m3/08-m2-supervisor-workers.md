# 08: Build the supervised Agent Service and isolated workers

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 5ac4e9c85ac6adcc0ae58fcdcc6b3c36bbdb5e07
**Base branch:** omp-through-m3/m1-integration
**Started:** 2026-10-12T16:06:42+00:00
**Finished:** 2026-10-12T18:07:54+00:00

**Delivers:** A Bun Agent Service supervisor starts, health-checks, stops and restarts one dedicated SDK worker per active root session with authenticated private transport and cleanup of owned children.

**Blocked by:** 07
**Files:** `packages/agent-service/`, `packages/web/server/lib/host/agent-service-supervisor.js`, service tests and package documentation

**Read first:** `.workflow/specs/omp-through-m3.md` M2/W3; architecture process and security sections; `packages/web/server/lib/guests/service.js`; extracted managed-process registry; OMP SDK and worker entrypoints; SDK identity/path artifacts from task 19 and installed-source artifact inputs from task 24
**Covers:** W3

**Check:** Build and type-check the Agent Service; run its touched-source lint and `bun run --cwd packages/web test server/lib/host/managed-process-registry.test.mjs`. Then use one temporary real Node supervisor → compiled Bun service → SDK worker scenario for private binding/auth refusal, authoritative factory readiness, independent roots/cwd/env, generation restart, crash isolation, measured RSS and cleanup. Record commands and remove temporary smoke code. Do not add empty/wiring-only package tests or rerun completed M0/M1 probes.

- [x] Keep SDK imports and SDK registry/session objects inside worker processes.
- [x] Install the source-derived SDK closure verified by task 24 through reproducible package inputs. Preserve first-party artifact/hash bindings and required third-party/native resolutions; do not select divergent registry packages merely because their version matches. Runtime SDK imports must resolve inside the service installation, not an operator's external source checkout.
- [x] Allocate one worker identity per active root session, including its subagents. Independent roots in the same workspace remain separate workers with process cwd/env isolation, as required by ADR-03.
- [x] Use loopback or Unix-socket binding only, internal secret injection, bounded startup/stop timeouts and orphan cleanup.
- [x] Make health reflect worker/service readiness rather than a process PID alone.
- [x] Record measured RSS and restart evidence against the resource decision accepted at task 03. Any unmet accepted target keeps the gate open.

## Progress

Dirty at start: none after the landed task07 contract commit on the isolated integration branch. Task07 is archived; original dirty main remains untouched. Check before: `packages/agent-service` and its Host supervisor do not exist, so no service Check can run. Reuse task24 retained artifact identities and the accepted M0 provider/platform/resource limits, without repeating SDK behavior probes.

Parent owns shared package/lock/Docker registration, private readiness contract, composition, documentation and the single integrated verification. Parallel isolated slices own retained portable SDK inputs, Bun supervisor/SDK workers, and Node Host lifecycle/managed-process registry. No child runs checks, installation, builds, formatters or commits.

Surfaces: Web/PWA starts the service through its Node Host; Electron keeps that Host in process and supervises the same separate Bun service; hosted mobile reaches its remote Host and starts no local service; Capacitor likewise starts no local service; Guest clients remain capability-scoped through the Host; VS Code stays retired. Application execution is not switched during this task; task22 and coordinated M3 activation remain responsible.

Boundary classes: the new listener is private loopback exposure only, always internally authenticated; SDK initialization stays in dedicated workers; no credential import, provider entry, telemetry or new policy knob is introduced. User Settings/project environment overlays must remain refused for agent execution in enterprise mode at use time. Existing admin policy precedence remains authoritative.

Measurement contract: authoritative SDK-factory readiness within the existing 15-second startup deadline; one dedicated worker per admitted root, including distinct roots sharing a workspace; bounded orderly stop/restart and no owned child left behind. Record actual service/worker RSS, not JS heap. The accepted failed 100 MiB M0 target is not replaced with a guessed application SLO. No browser/render optimization or profile is proposed.

Check after: the compiled service build and strict application type-check passed. The latter uses actual declarations emitted from installed SDK source, matching upstream `tsconfig.publish.json`; authored code stays strict while unrelated raw SDK CLI/library implementation is not rechecked as application source. Touched-source oxlint passed. The focused managed-process registry suite passed 14 cases, including assigned ephemeral port matching and refusing to signal a recycled PID. The original isolated runner only accepts directories and does not run Vitest files, so this Check names the owning Web package runner instead.

Real-path command: `node /tmp/ohpi-m208-acceptance.mjs`. Its receipt `/tmp/ohpi-m208-acceptance-receipt.json` passed auth, isolation, generation replacement, crash isolation and cleanup; measured values and limits are owned by [development progress](../../development.md#next-implementation-step). Earlier failures were missing declared Host contract dependency and the throwaway harness inspecting unrelated `/proc` environments; the dependency is declared and the harness restricts inspection to owned children. No failed run is reported as passed.

Inputs: 13 unchanged source-derived archives and two retained patches are bound by `vendor/omp/c9de2b02/copy-manifest.json`; 225 parent-version dependency pins preserve the observed closure without globally replacing application versions. The optional SDK embedding peers are explicit service dependencies so they cannot fall through to inherited application's incompatible ONNX package. Frozen installation passed after these bindings. Production gateway, provider execution, credential handoff and non-Linux behavior remain outside this task's measured claim. Docker remains unavailable under the accepted platform evidence limit; no image build is claimed.

Cross-workspace package checks: `bun run --filter '*' type-check` passed all seven packages once; `bun run lint` passed with the unchanged `PluginPane.tsx` Hook warning. `bun run dead-code` reported the existing four i18n exports/eight types, the intentionally uncomposed Host supervisor awaiting task22, and two new unnecessary private schema exports that were removed. No inherited backlog was mass-fixed. Final private peer resolution observed `fastembed@3.0.0` and `onnxruntime-node@1.26.0` from the actual SDK memory owner, both inside the installation.

Independent requirements and quality reviews passed. Security review withdrew TASK08-SEC-001 because Host-authorized private paths are intentional, and withdrew the URL exfiltration claim after actual Node fetch rejected its userinfo form before sending. TASK08-SEC-002 was fixed at both Bun launches with `--no-env-file`; the same flag is used by the package start command. An actual Bun invocation in a private cwd containing a dotenv marker confirmed the marker stayed absent. Delta build, Host syntax and two-file oxlint passed; the full lifecycle scenario and completed M0/M1 checks were not repeated. Exact security-delta re-review passed with no remaining findings.
