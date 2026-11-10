# Updater Testing

## Contents

- What a run proves and does not prove
- Preparing the builds
- The three feed gates
- Driving the run without a GUI
- Verifying more than the version number
- Exercising the failure
- Cleanup

This runs a real update against a loopback feed, so the platform installer runs for real while the feed does not. One missing gate, or a window closed the wrong way, gives a run that completes the update and reports success while testing nothing, so follow the steps in order and stop at a step that fails.

Copy this checklist and keep it updated as you go:

```
Update run:
- [ ] 1. Builds prepared, each reporting the version intended
- [ ] 2. All three feed gates confirmed in the log
- [ ] 3. Test one: plain update installs, app returns on N+1
- [ ] 4. Test one verified beyond the version number
- [ ] 5. Test two: window closed inside the shutdown window
- [ ] 6. Test two's close proven to have reached the app's quit handling
- [ ] 7. Cleanup done, ports closed, what was left behind recorded
```

Step 6 is a gate, not a formality. If you cannot point at the log line, the run failed and you repeat it with a faster close. Do not report a pass.

## What a Run Proves And Does Not Prove

A passing run proves the update installed on **the platform you ran it on**. It says nothing about the others: macOS goes through Squirrel.Mac and a different `quitAndInstall()`, Windows through NSIS, Linux through AppImage replacement. Name the platform in every result.

macOS cannot reproduce the class of defect where closing a window ends the app, because the quit-on-last-window-closed paths are guarded to non-darwin. Linux and Windows share that arbitration and differ only in the installer, so a Linux run is a real result for the logic and Windows still owns NSIS and the unsigned artifact.

A passing run proves:
- the platform installer replaced the running artifact with the N+1 payload;
- the app relaunches and executes main from the updated location or mount;
- the embedded Node Host initializes and starts its supervised Bun Agent Service from the staged `resources/agent-runtime` payload;
- quit arbitration handles normal shutdown or window closure during installation handover without leaving processes behind.

A passing run does not prove:
- updater behavior on unexercised platforms or target architectures (for example, testing x64 says nothing about arm64 packaging);
- agent functional execution: supervisor startup and readiness confirm the child process spawned and bound its port, but do not exercise session streaming, model routing, or tool execution;
- automated runtime verification: the updater fixture script (`packages/electron/scripts/updater-e2e-fixture.mjs`) only stages feed files and launches the binary. It has no built-in post-update assertion suite, leaving post-restart checks to manual operator observation.

## Prepare The Builds

Usually one build is enough. The compile-time marker is only needed in the app that **runs**; the newer artifact is just a file the updater downloads and executes. So build N from your branch at a version below a published release, and use that published installer as N+1, taking its size and checksum from the published manifest. Build both only when the newer side also has to carry your change.

1. Work in a separate source copy, a separate application profile, and a writable run directory. The working installation and its data stay untouched. The feed fixture alone is not profile isolation: check the launcher and runtime configuration.

   Isolation through environment variables can leak after the update on Windows, and you cannot prevent it from the test side: the NSIS installer relaunches the app through `explorer.exe`, whose environment predates anything you set, so the updated app falls back to the real profile. Say so in the result instead of claiming an isolation you did not have. NSIS also reuses a remembered install location rather than the default, so record what is there before you install over it.
2. Bump the version across the root and the three workspaces together, once per build. A partial bump produces builds that disagree about their own version:

   ```bash
   npm pkg set version=<version> \
     --workspace @openchamber/electron \
     --workspace @openchamber/web \
     --workspace @openchamber/ui \
     --include-workspace-root
   ```

3. Package on a native host of the target architecture, each build into its own output directory, with the fixture's compile-time gate set while bundling main. `packages/electron/scripts/updater-e2e-fixture.md` carries the exact commands and stays current with the scripts; read it rather than copying commands from here, and follow it literally rather than adapting it.

Preparation is done when both artifacts exist, each reports the version you intended, and the run directory holds its own copy of N for the updater to replace.

## Three Gates, All Required

The loopback feed activates only with all three present. Missing one silently falls back to the production GitHub feed, and the run then tests nothing:

- `OPENCHAMBER_UPDATER_E2E_BUILD=1` embedded while bundling main;
- `OPENCHAMBER_E2E=1` at run time;
- `OPENCHAMBER_UPDATER_E2E_URL` pointing at the loopback feed.

Do not assume they took. The app says so on startup, and that line is the only proof the run is pointed at your feed rather than at GitHub:

```
updater feed configured { provider: 'generic', target: 'http://127.0.0.1:<port>/' }
```

`provider: 'github'` there means the gates did not take. Stop and fix them; everything after this point would be theatre.

Published release artifacts can never be used as N: they carry no build-time marker.

## Drive It Without A GUI

The update does not need a human clicking Update. The running app's own server exposes the same operation, which is what makes this testable over SSH on a headless host:

- `POST /api/openchamber/update-install` requests the install and reports `updateOwner: electron-updater`.

Check the current route contract and authentication before relying on it; it is a product route, not a test harness.

Launching and closing the window is the part that differs per platform. On Windows an SSH shell lands in session 0 while the desktop is session 1, so an app started from SSH has no visible window: launch it into the interactive session with `schtasks`, and confirm it really is in session 1 before trusting anything you see. To close it, `taskkill /PID <pid>` **without** `/F` posts a normal close request, which is what you want; `/F` kills the process and proves nothing. On Linux, drive the close on the live display.

## Verify More Than The Version Number

A version bump is the weakest possible evidence. Record each of these:

- the restarted app reports N+1 over HTTP via `GET /health` (`openchamberVersion: "<N+1>"`);
- the binary artifact (such as the AppImage) at the run path was replaced, and its checksum matches the prepared N+1 artifact;
- the new Electron main process runs from the new mount path, verified through `/proc/<pid>/exe`;
- the live Bun Agent Service child process runs from the new mount:
  - Host `GET /health` reports `agentService.phase: "ready"` and `agentService.pid`;
  - `/proc/<agentService.pid>/exe` on Linux verifies the process executable points to the staged Bun runtime in the new mount (`<mount>/resources/agent-runtime/bun`);
  - `/proc/<agentService.pid>/cmdline` verifies the entrypoint resolves to the staged service entrypoint under the new mount (`<mount>/resources/agent-runtime/service/dist/index.js`);
- the Host and Agent Service report readiness over HTTP:
  - `GET /health` returns HTTP 200 with `status: "ok"` and `agentService: { phase: "ready", pid: <number>, port: <number> }`;
  - `GET /api/agent/v1/health` returns HTTP 200 with `status: "ok"`, `engine: "omp"`, and `agent: { status: "ready", ready: true }`;
  - `GET /api/agent/v1/ready` returns HTTP 200 with `ready: true`, `engine: "omp"`, and `version: "<version>"`.

Capture the version over HTTP and the artifact checksum rather than a screenshot of a rendered number; on a headless host they are cheaper and say more.

<<<<<<< HEAD
The check on the child process executable exists because of an inherited packaging hazard: when the parent process resolves staged runtime paths into environment variables (`OHPICHAMBER_BUN` and `OHPICHAMBER_AGENT_SERVICE_ENTRYPOINT`), an inherited stale environment across restarts could cause the replacement app to spawn the old mount's binaries. OpenCode lifecycle is retired and no longer in production: there is no `OPENCODE_BINARY` variable, no OpenCode executable, no "Restart OpenCode" action, and legacy OpenCode health endpoints like `/api/opencode/health` return 404. The supervised Bun Agent Service replaces those legacy checks.

### Missing Verification Prerequisites in the Fixture

The loopback updater fixture (`packages/electron/scripts/updater-e2e-fixture.mjs`) provides `stage`, `serve`, and `run` commands to serve local update manifests and launch the initial AppImage. It does not contain an automated runtime check command or post-restart assertion hook. Testing must manually query the Host HTTP endpoints (`/health`, `/api/agent/v1/health`, `/api/agent/v1/ready`) and inspect `/proc/<pid>/exe` on Linux. Automated validation of the restarted process tree and Agent Service health is a missing verification prerequisite in the test harness.
=======
That fourth check guards a real regression. A bundled path exported through `OPENCODE_BINARY` reached the replacement process as a user override, so everything but the running binary looked updated.
>>>>>>> bc50ba56a

## Exercise The Failure, Not Only The Happy Path

Run the update a second time and close the application window immediately after requesting the install, while the backend is still shutting down. Quit arbitration during that window is where installs get cancelled with the download sitting unused, and the happy path never touches it.

**A close that bypasses the app's own close path proves nothing.** This is the single most expensive trap here: `xdotool windowclose` destroys the X window without Electron ever seeing a close, and a run using it completes the update and looks like a pass while testing nothing at all. Decide in advance which log line shows the close reached the app's quit handling; that line is step 6.

Measure the close budget on the host rather than assuming it: it has ranged from about 150 ms on a fast, idle Linux desktop to about 2 s on a slow Windows machine. Where it is narrow, close through the menu's close role, which the main process handles in about 60 ms; the app's own close button goes through the renderer (about 200 ms) and lands after the handover. Keep the input tool warm, since spawning it per click costs about 100 ms.

An idle, freshly started profile gives the narrowest window there is. A user with terminals, sessions or SSH open has a wider one, so a miss on a clean profile is not evidence that a defect is gone.

## Cleanup

Stop the test application, the fixture server, and any test service, then confirm their ports are no longer listening. Report tested versions, architecture, artifact checksums, process paths, and every check you could not complete.
