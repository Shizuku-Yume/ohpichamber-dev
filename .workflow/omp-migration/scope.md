# Project scope and feature traceability

This document defines the target product scope, feature-by-feature disposition, and platform boundaries for OhPiChamber. The repository has adopted the pinned upstream code baseline. The subsequent target remains Oh My Pi as the sole agent execution engine, removing OpenCode runtime dependencies and retiring the VS Code extension form while preserving Web/PWA, Electron Desktop, Mobile, and the Guest SDK contract.

## Document purpose and authority

This specification records the OMP target and source-aware traceability for the [rebaseline effort](../specs/upstream-rebaseline.md). The historical inventory remains a dated comparison input. The refreshed-source section below accounts for Board, environment management, Quake, file-tree moves, Node/build changes, Guest lifecycle, small-model generation, and isolated-space wiring. Source presence is not runtime acceptance; OMP behavior remains subject to M0 evidence.

### Document hierarchy

When resolving design conflicts, documents take precedence in the following strict order:
1. User decisions and explicit directives.
2. `scope.md` (this document: product scope, retained features, and boundary commitments).
3. `contracts.md` (protocol schemas, canonical events, and lifecycle semantics).
4. `architecture.md` (system boundaries, process topology, and state ownership).
5. `implementation-plan.md` (milestone execution order and delivery gates).
6. `feature-inventory.md` (historical baseline inventory).

### Cross-document references

All internal design references use simple filenames in the same directory:
- System overview and index: `README.md`
- System topology and component boundaries: `architecture.md`
- Protocol definitions and API schemas: `contracts.md`
- Migration phases and testing gates: `implementation-plan.md`
- Historical baseline inventory: `feature-inventory.md`

Codebase references use paths relative to the repository root, such as `../../packages/ui` or `../../packages/web/server`.

## Platform matrix and surface boundaries

OhPiChamber maintains multi-surface availability across three client platforms and one guest extension runtime. The retirement of the VS Code extension form does not reduce the capabilities of the remaining surfaces.

### Surface support matrix

| Feature area | Web / PWA | Electron Desktop | Mobile (Capacitor) | Guest SDK |
|---|---|---|---|---|
| Primary UI Layout and Composer | Full | Full | Mobile-adapted layout and drawer | Embedded in host surfaces |
| Canonical Client Connection | HTTP / WebSocket to Host | In-process loopback or remote | Remote HTTP / WebSocket via pairing | Host-authorized Guest document bootstraps a one-shot `MessageChannel` before authored scripts; protocol traffic then uses its transferred `MessagePort` |
| Interactive Terminal (PTY) | WebSocket stream | WebSocket stream to local/remote | Remote PTY with touch scroll/selection | Shell monitoring only, not an interactive PTY |
| In-app File Editing (CodeMirror) | Full | Full | Read / light edit | Capability-granted custom file editors on supported host surfaces |
| Git and Working Tree Diff | Full | Full | Branch status / commit review | Host bridge (scoped) |
| Chromium CDP Browser Pane | External browser broker | Embedded CDP / Browser View | Web preview via system browser | Provider registration only |
| Dev Server Discovery and Tunnels | Remote / Local ports | Local and remote port scanning | Access via tunnel URLs | Not exposed |
| Push Notifications | Web Push (VAPID) | System tray and OS notifications | APNs and FCM native notifications | Notification requests via bridge |
| Biometric and Local Auth | WebAuthn / Passkey | Passkey or local system unlock | Biometric unlock and Secure Storage | Inherited from host session |
| External Editor Launch | Protocol handler (`vscode://`) | Native app launcher and `shell.openPath` | System document viewer | Not exposed |
| VS Code Theme Import | Archive upload and marketplace | File picker and archive import | Synced via host settings | UI theme token consumption |
| Guest SDK Extension Hosting | Iframe panels and dialogs | Iframe panels and dialogs | Sandboxed iframe panels only | Protocol provider |
| Guest Background Service Processes | Host-managed child processes | Host-managed child processes | Not supported (no child processes) | Service provider (desktop/web) |

### Explicit boundaries for Mobile and Guest SDK

1. Mobile Guest constraints:
   Mobile Guest support remains deferred until M5. The current Capacitor shell does not host Guest iframes or run Guest extension runtimes; when that boundary is implemented, sandboxed panels may use the same one-shot `MessageChannel` and transferred `MessagePort` contract. Mobile does not run background daemon processes, compile native binaries, or spawn child service processes for Guest extensions.
2. Guest service execution:
   Guest extensions that register background services (`service` contribution in extension manifests) execute exclusively on the Node.js Host Gateway (or Electron embedded host). These processes run in a Node child process environment with whitelisted environment variables. They do not possess operating system level sandbox isolation (such as Linux namespaces or seccomp profiles).
3. External editor and theme retention:
   Dropping the VS Code extension package (`../../packages/vscode`) does not eliminate developer desktop workflows. Electron retains the ability to reveal files in the OS file manager, open files in default applications, and launch external editors including VS Code, Cursor, Windsurf, and Sublime Text. The Web and Desktop applications retain the VS Code theme archive (`.vsix` and JSON) importer.

## Retirement scope: OpenCode and VS Code extension

The final OMP cutover removes dependencies on OpenCode and the VS Code extension host: no dual-engine selector, compatibility shim, or fallback will exist in the final codebase. The prior baseline-refresh phase may inherit upstream OpenCode runtime and dependency changes coherently; this does not make OpenCode a supported engine in the OMP target or advance a migration gate.

### OpenCode retirement breakdown

M1 extracts retained Host owners and prepares the explicit credential handoff. Final lifecycle, proxy and legacy configuration/credential removal occurs at the coordinated M3 cutover, after canonical service, server consumers, UI callers and the handoff are ready. Extraction does not pass final retirement acceptance.

The following subsystems and files are scheduled for complete removal:
1. OpenCode server proxy and lifecycle manager:
   - `packages/web/server/lib/opencode/lifecycle.js` and process watchers.
   - OpenCode proxy routing, SSE proxying, and custom proxy headers.
   - OpenCode CLI downloader, binary resolution, and orphan process termination.
   - Multi-directory port probing and auto-spawning mechanisms.
2. OpenCode configuration and credentials:
   - Primary `opencode.json` configuration read and write pipelines.
   - OpenCode credential API access and legacy credential-file import paths.
   - OpenCode Agent profiles and custom provider endpoint schemas.
   - OpenCode MCP configuration format, location-scoped connections, and managed config-reload behavior.
3. OpenCode UI artifacts:
   - OpenCode CLI setup screens and binary path configuration inputs.
   - OpenCode update notifications and in-app upgrade banners.
   - Remote OpenCode instance switcher and connection dialogues.
   - OpenCode specific LSP error cleanup patterns (such as `<file_diagnostics>` stripping).
   - Upstream OpenCode session sharing client (`session.share`).

### Preserving host infrastructure in `lib/opencode`

The legacy directory `packages/web/server/lib/opencode/` contains general Host Gateway infrastructure intertwined with OpenCode proxy code. Deleting this directory without refactoring would break core OpenChamber features.

Prior to deleting OpenCode logic, the following host modules must be extracted to `packages/web/server/lib/host/`:
- `settings-runtime.js`, `settings-registry.json`, `settings-files.js`, `settings-helpers.js`, `settings-normalization-runtime.js`: The four-tier settings engine (Instance, Profile, Device, Surface).
- `theme-catalog.js`, `theme-runtime.js`, `theme-archive.js`: Theme discovery, active theme persistence, and the VS Code `.vsix` theme unpacker and importer.
- `tunnel-auth.js`, `tunnel-wiring-runtime.js`: Authentication guards and loopback wiring for E2EE relays and remote access tunnels.
- `pwa-manifest-routes.js`: Dynamic web application manifest generation for PWA installs.
- `project-icon-routes.js`, `project-directory-runtime.js`: Project workspace root tracking and favicon generation.
- `network-runtime.js`: Local area network detection, interface enumeration, and host header rebinding protection.
- `login-shell-env.js`: Extraction of system shell environment variables for PTY terminals and background commands.
- `server-startup-runtime.js`, `startup-pipeline-runtime.js`, `static-routes-runtime.js`: HTTP asset serving and server initialization.
- `managed-process-registry.js`: Background process lifecycle and graceful shutdown tracking.

### VS Code extension package retirement

The package `packages/vscode` will be completely removed from the repository.
- Retired components: Extension host entry points, tree view data providers, webview bridge wrappers, editor inline diff adapters, and VS Code command registrations.
- Retained capabilities: All editor and collaboration workflows previously displayed in VS Code (ChatView, Session Tree, Diff view, Composer, File Explorer) remain fully functional in the Web and Electron surfaces.
- Replacement mechanism: When users select "Open in Editor" within Electron or Web, the host triggers the external editor launcher (via `vscode://file/...` URI or `shell.openPath`), handing off the file to the user's desktop editor.

## Comprehensive functional inventory and traceability table

The table below maps every functional area from Sections 2.1 through 15.3, 16, 17.1 through 17.4, and each security domain in Section 18 of `feature-inventory.md` to a stable ID, an architectural decision, an owner, a migration milestone, and checkable acceptance criteria.

Decisions are classified as:
- `Retain`: Preserved with minimal or no API adaptation.
- `Rewrite`: Product capability and UI preserved, but underlying protocol, store, or service rewritten for OMP / Canonical API.
- `Replatform`: Service extracted from OpenCode host/proxy and moved to the Host Gateway or Bun Agent Service.
- `Delegate`: Capability handed over directly to the OMP engine or SDK.
- `Retire`: Feature or component eliminated completely.

Milestones adhere to the project roadmap:
- `M0`: Capability probe and contract definition.
- `M1`: Host boundary extraction and VS Code retirement.
- `M2`: SDK service execution closure and security boundaries.
- `M3`: UI data layer cutover to Canonical Client and coordinated final OpenCode retirement.
- `M4`: Advanced autonomous features (Goals, Assist, Walkthrough, Queue, Routing, Memory, Scheduled Tasks).
- `M5`: Retained surfaces verification and release switchover.

| Stable ID | Baseline section | Functional domain | Decision | Specific retained sub-features | Owner | Milestone | Observable acceptance criteria |
|---|---|---|---|---|---|---|---|
| `SCOPE-2.1` | 2.1 | Web / Desktop Main App | Rewrite | Layout rendering, multi-project navigation, session restore, global events, offline recovery | Client UI / Host Gateway | M3 | Web client loads, authenticates against Host Gateway `/api/agent/v1`, and renders active sessions without OpenCode network requests. |
| `SCOPE-2.2` | 2.2 | Electron Desktop Shell | Retain | Frameless window, tray icon, deep links, native file dialogs, auto updater, mini chat, embedded host | Electron Shell / Host Gateway | M5 | Packaged Electron binary launches embedded Host Gateway, renders main window via loopback, and executes native menu and update checks. |
| `SCOPE-2.3` | 2.3 | VS Code Extension | Retire | Feature retention limited to external editor launch (`vscode://`) and VS Code theme import; extension form dropped | Host Gateway / Client UI | M1 | `packages/vscode` removed from workspace; clicking Open in Editor launches desktop editor via system URI scheme or Electron IPC. |
| `SCOPE-2.4` | 2.4 | Mobile / Capacitor Shell | Rewrite | Touch drawer, Edge Swipe, QR pairing, Secure Storage, APNs/FCM notifications, background reconnect | Mobile Shell / Host Gateway | M5 | Capacitor app on iOS and Android pairs with Host Gateway via QR code, receives native push notifications, and streams chat sessions. |
| `SCOPE-3.1` | 3.1 | MainLayout, Header, Context Panel | Retain | Three-column layout, context rail, surface dragging, session header, Git branch badge, model badge | Client UI | M3 | Header displays active session title, Git branch, and model indicator powered by Canonical API session metadata. |
| `SCOPE-3.2` | 3.2 | Session Sidebar | Retain | Multi-project tree, Worktree groupings, subagent hierarchy, search, filter, pin, folder organization | Client UI / Host Gateway | M3 | Sidebar renders nested project, worktree, and session trees with full drag-and-drop folder persistence via Host Gateway. |
| `SCOPE-4.1` | 4.1 | ChatView and Timeline | Rewrite | Virtualized timeline, auto-scroll, duration counter, abort, retry, tool cards, subagent navigation | Client UI / Agent Service | M3 | Chat timeline renders streamed assistant tokens, tool call cards, and turn timing from Canonical WebSocket events. |
| `SCOPE-4.2` | 4.2 | Message Parts Rendering | Retain | Rendering components for Text, Reasoning, Tool, Attachment, Diff, Subagent, and Error parts | Client UI | M3 | UI renders markdown, reasoning blocks, file cards, diffs, and structured JSON outputs using native Canonical Part types. |
| `SCOPE-4.3` | 4.3 | ToolPart Execution and Display | Rewrite | Tool name, parameters, execution state, output display, diff presentation, patch review, subagent links | Client UI / Agent Service | M2 | Tool execution renders live states (pending, running, success, error, rejected) with diff previews for file modification tools. |
| `SCOPE-5.1` | 5.1 | ComposerEditor | Rewrite | CodeMirror 6 input, auto-expand, history navigation, file drag-and-drop, `@file`, `@agent`, `@skill` mentions | Client UI / Host Gateway | M3 | Composer mentions query Host FS and OMP registries, constructing canonical prompt payloads with file attachments. |
| `SCOPE-5.2` | 5.2 | Slash Commands and Snippets | Rewrite | Command suggestions, prompt snippets, skill catalog integration, template expansion | Client UI / Agent Service | M3 | Slash command menu auto-completes OMP built-in commands and installed skills without referencing `.opencode/commands`. |
| `SCOPE-6.1` | 6.1 | Permission and Approvals | Rewrite | Tool approval cards, session-level rules, always-allow / always-deny decisions, approval queue | Client UI / Agent Service | M2 | Dangerous tool calls pause execution and emit `approval.requested`; approving resumes execution; rejecting returns error to model. |
| `SCOPE-6.2` | 6.2 | Question Request and Interactive Input | Rewrite | Multi-choice prompt, freeform text input, session blocking during wait, mobile input sync | Client UI / Agent Service | M2 | Model interactive questions emit `question.requested`, blocking turn progress until user submits choice or text reply. |
| `SCOPE-6.3` | 6.3 | Gatekeeper Security Defense | Replatform | Command injection filters, root directory restrictions, environment stripping, PTY clean-up | Host Gateway | M2 | Host Gatekeeper validates every shell command and file mutation against canonical root, rejecting paths outside workspace. |
| `SCOPE-7.1` | 7.1 | Canonical Host Filesystem API | Retain | Directory tree, file read/write, delete, rename, file upload, image/audio/video preview, HTTP 206 Range | Host Gateway | M1 | Host Gateway serves `/api/fs/*` endpoints enforcing canonical realpath validation, symlink checks, and streaming media chunks. |
| `SCOPE-7.2` | 7.2 | CodeMirror File Editing | Retain | CodeMirror 6 editor, Vim keymap, Shiki syntax highlighting, markdown/diagram/drawio previews | Client UI | M3 | Built-in editor opens workspace files, saves changes via Host FS API, and renders syntax highlighting and diagram previews. |
| `SCOPE-7.3` | 7.3 | Git and Working Tree Diff | Retain | Side-by-side and inline diff, stage/unstage hunks, discard changes, worker-based diff calculation | Client UI / Host Gateway | M1 | Diff view renders working tree modifications, executes hunk-level staging, and handles large files via background worker. |
| `SCOPE-8.1` | 8.1 | Canonical Host Git Service | Retain | Status, branch, checkout, commit, push, pull, stash, conflict resolution, SSH key handling | Host Gateway | M1 | Git operations execute via Host Git service with `GIT_TERMINAL_PROMPT=0` and root path validation, independent of agent runtime. |
| `SCOPE-8.2` | 8.2 | AI Commit Message Generation | Rewrite | Diff analysis, commit subject and body generation, conventional commit conventions | Agent Service / OMP SDK | M4 | Clicking generate commit message queries OMP completion endpoint with staged diff, populating the commit message input. |
| `SCOPE-8.3` | 8.3 | Worktree Lifecycle and Management | Retain | Worktree creation, deletion, branch binding, bootstrap hook execution, project configuration | Host Gateway | M1 | Creating a worktree establishes a new Git worktree directory, registers it in project metadata, and assigns a dedicated session cwd. |
| `SCOPE-9.1` | 9.1 | Interactive Terminal (PTY) | Retain | Xterm.js terminal, multiple tabs, shell detection, binary WebSocket PTY, scrollback replay, clean exit | Host Gateway | M1 | Terminal tabs open interactive shells via Host Gateway PTY service, supporting resize, signal forwarding, and process cleanup. |
| `SCOPE-9.2` | 9.2 | Browser Control and Automation | Rewrite | Browser Open, Snapshot, Click, Type, Scroll, Inspect, Capture, Resize, multi-client claim broker | Host Gateway / Agent Service | M4 | Agent invokes browser tools via OMP; Host Browser Broker routes commands to CDP or Browser Pane with exclusive client claim. |
| `SCOPE-9.3` | 9.3 | Dev Server and Dev Tunneling | Retain | Local port scanning, `/proc/net/tcp` probe, embedded preview, Cloudflare / ngrok tunnel, E2EE relay | Host Gateway | M1 | Dev Server panel discovers active project ports and provisions authenticated external tunnel URLs for preview. |
| `SCOPE-10.1` | 10.1 | Diff Walkthrough Summaries | Rewrite | Hunk decomposition, stable hunk IDs, generated file filtering, structured JSON summaries, tour UI | Host Gateway / Agent Service | M4 | Walkthrough engine analyzes commit or branch diffs, calls OMP for structured explanation, and anchors commentary to diff lines. |
| `SCOPE-10.2` | 10.2 | Session Goals | Replatform | Objective and token budget, OMP continuation, pause/resume/drop, "Run as goal" from fork, plan, scheduled tasks and CLI, goal notifications; Host supervisor and audit model retired | Agent Service / OMP SDK | M4 | OMP goal mode runs in the session worker; worker-originated runs continue until the agent declares completion, the budget is exhausted, no progress is possible, or the user stops the goal. The Host does not own goal state or run a separate loop. |
| `SCOPE-10.3` | 10.3 | Session Assist and Turn Recaps | Rewrite | Post-turn idle cooling, last three turns extraction, tool noise stripping, recap and suggestion generation | Host Gateway / Agent Service | M4 | Host triggers assist task after session idle, generating recap and next steps into session metadata without polluting transcript. |
| `SCOPE-10.4` | 10.4 | Durable Message Queue | Replatform | SQLite message queue (target), atomic writes, ordered delivery, retry with exponential backoff, lease holds | Host Gateway | M2 | User messages submitted while session is busy or offline are persisted to SQLite queue and dispatched sequentially on idle. |
| `SCOPE-10.5` | 10.5 | Model and Intent Routing Pipeline | Replatform | `openchamber/auto` route, intent classification, model parameter rewrite, fallback safeguards | Host Gateway | M4 | Messages sent to auto router are classified by complexity, rewriting model and reasoning effort parameters before dispatch. |
| `SCOPE-11.1` | 11.1 | Project Context and Notes | Retain | Project notes, architectural plans, project todos, atomic file locking under `.openchamber/plans/` | Host Gateway / Client UI | M1 | Notes and plans persist to workspace disk under `.openchamber/`, supporting concurrent edits with atomic file locking. |
| `SCOPE-11.2` | 11.2 | Session Knowledge Injection | Rewrite | Delivery receipts, pinned context injection, compaction re-injection, cross-client sync | Host Gateway / Agent Service | M3 | Pinned context cards and knowledge snippets are prepended to prompt payloads and re-injected following context compaction. |
| `SCOPE-11.3` | 11.3 | Agent Memory Management | Retain | Global and project scope memories, CRUD interface, prompt injection, threat pattern filtering | Host Gateway / Client UI | M4 | Memories manage user preferences and repository instructions, injecting matching entries into the agent system prompt. |
| `SCOPE-11.4` | 11.4 | Agent Todo and Task Tracking | Rewrite | Todo list UI, project todo persistence, task execution status tracking (in-progress, done, blocked) | Client UI / Host Gateway | M3 | Todo items update dynamically from canonical tool events and project storage, independent of legacy OpenCode todo events. |
| `SCOPE-11.5` | 11.5 | Session Folders and Retention | Retain | Folder hierarchy, drag-and-drop categorization, pin, archive, cascade deletion, retention sweep | Host Gateway / Client UI | M3 | Sessions organize into custom folders with metadata stored in Host database; retention policy purges inactive sessions safely. |
| `SCOPE-12.1` | 12.1 | Scheduled Tasks and Loops | Replatform | Once, Daily, Weekly, CRON schedules, timezone support, `.agents/loops/` storage, claim locking | Host Gateway | M4 | Host scheduler triggers automated sessions based on CRON expressions, claiming execution locks to prevent duplicate runs. |
| `SCOPE-12.2` | 12.2 | Multi-run Concurrent Execution | Rewrite | Parallel model/agent execution, multi-session dispatch, worktree binding, result aggregation | Host Gateway / Client UI | M4 | User triggers multi-run across selected models; Host Gateway provisions isolated sessions and aggregates outputs side-by-side. |
| `SCOPE-12.3` | 12.3 | Multi-branch Result Fusion | Retain | Collection of parallel branch outputs, text synthesis, unified context generation, fusion session | Host Gateway / Client UI | M4 | Fusion action merges outputs from multiple sessions into a synthesized prompt for a master review session. |
| `SCOPE-13.1` | 13.1 | Multi-tier Settings Registry | Replatform | Four-tier hierarchy (Instance, Profile, Device, Surface), validation schemas, disk persistence | Host Gateway | M1 | Settings read and write through Host Gateway `/api/settings/*`, storing configuration in `~/.config/ohpichamber/settings.json`. |
| `SCOPE-13.2` | 13.2 | Provider and Model Registry | Rewrite | Model selection, custom base URL, API keys, OAuth tokens, capability flags, context window, pricing | Agent Service / Host Gateway | M2 | Provider configuration maps directly to OMP ModelRegistry and AuthStorage; UI displays models with token limits and tags. |
| `SCOPE-13.3` | 13.3 | Agent Profile Configuration | Rewrite | Agent profile editor, system prompt override, tool whitelist, model binding, permission presets | Agent Service / Client UI | M2 | Custom agent configurations map to OMP model roles and subagent specs, applying tool approval policies per agent profile. |
| `SCOPE-13.4` | 13.4 | Model Context Protocol (MCP) | Rewrite | Stdio, SSE, and HTTP MCP servers, OAuth handshake, tool discovery, dynamic enable/disable | Agent Service / OMP SDK | M2 | MCP configuration writes to OMP MCP configuration; Agent Service connects to MCP servers without deferred restart delays. |
| `SCOPE-13.5` | 13.5 | Skills Management and Execution | Retain | Standard `SKILL.md` parser, skill catalog download, workspace and global installation, prompt injection | Agent Service / Host Gateway | M3 | Skills catalog downloads and installs into the selected OMP agent directory's `skills/` (default `~/.omp/agent/skills/`) or project skill directories, including retained `.agents/skills/` support, exposing them to agent runtime through the service-owned expansion boundary. |
| `SCOPE-14.1` | 14.1 | GitHub Integration | Retain | OAuth Device Flow, token encryption, PR status, multi-remote fork detection, PR review UI | Host Gateway | M1 | GitHub integration authenticates via Device Flow, queries GitHub GraphQL API, and renders PR reviews and checks. |
| `SCOPE-14.2` | 14.2 | Linear Integration | Retain | OAuth PKCE, GraphQL API, team/project mapping, issue list, session progress comments, URL filter | Host Gateway | M1 | Linear integration links issues to sessions and posts progress updates while sanitizing localhost and internal network URLs. |
| `SCOPE-14.3` | 14.3 | Quota and Usage Tracking | Rewrite | Provider usage APIs, token accounting, rate-limit cooldown, concurrency merging | Host Gateway | M4 | Usage dashboard queries provider billing endpoints using credentials from OMP AuthStorage, displaying token spend and rate limits. |
| `SCOPE-14.4` | 14.4 | Multi-channel Notifications | Retain | UI Toasts, Web Push (VAPID), APNs, FCM, Desktop notifications, presence-aware suppression | Host Gateway | M3 | Host Gateway emits OS and push notifications on turn completion, approvals, and errors, suppressing toasts when window has focus. |
| `SCOPE-14.5` | 14.5 | Voice Services (TTS / STT) | Retain | Speech-to-text WebSocket streaming, Text-to-speech synthesis, macOS `say`, markdown cleaning | Host Gateway / Client UI | M3 | Voice input streams microphone audio over WebSocket for transcription; assistant responses synthesize audio on demand. |
| `SCOPE-15.1` | 15.1 | UI Authentication and Passkey | Retain | Password hash verification, WebAuthn / Passkey registration, port-scoped cookies, rate limiting | Host Gateway | M1 | Host Gateway enforces HTTP cookie authentication and WebAuthn challenges before granting access to web or desktop APIs. |
| `SCOPE-15.2` | 15.2 | Remote Client Pairing | Retain | Long-lived Bearer tokens, token revocation, Pairing v2 handshake, ephemeral tokens, QR export | Host Gateway | M1 | Remote clients pair via encrypted token exchange or QR code, establishing authenticated sessions with explicit permission scopes. |
| `SCOPE-15.3` | 15.3 | Remote Access Tunnels and Relays | Retain | Cloudflare Quick / Managed Tunnels, ngrok, E2EE Relay (ECDH + AEAD), Host Lock verification | Host Gateway | M1 | Host Gateway establishes outbound encrypted tunnels and relays, allowing secure remote browser and mobile connections. |
| `SCOPE-16.0` | 16.0 | Guest Extension SDK | Retain | Iframe sandbox, early document bootstrap with one-shot `MessageChannel`, transferred `MessagePort` protocol, manifest parser, permission whitelist, background services | Host Gateway / Guest SDK | M5 | Guest extensions run in sandboxed iframes using `@openchamber/sdk`, receive a port only after an authorized document's early bootstrap, and invoke host services according to manifest permissions. Unapproved self-navigation receives no replacement port. |
| `SCOPE-17.1` | 17.1 | OpenCode Proxy and Lifecycle | Retire | None; all proxy routing, port probing, and process management deleted | Host Gateway / Agent Service | M3 | All OpenCode proxy endpoints and process managers removed; no network connections attempt to dial OpenCode binaries. M1 extracts retained Host owners; task 17 performs final removal after replacement consumers are ready. |
| `SCOPE-17.2` | 17.2 | OpenCode Configs and Credentials | Retire | None; `opencode.json` and legacy `auth.json` loading removed | Host Gateway / Agent Service | M3 | Application config exclusively uses OhPiChamber settings and OMP configuration paths without creating OpenCode files. M1 prepares authenticated explicit intent/preflight; the real M2 service handoff passes gate 23 before task 17 removes legacy readers and importer. |
| `SCOPE-17.3` | 17.3 | OpenCode-specific UI Controls | Retire | None; OpenCode settings tabs, upgrade toasts, and LSP error cleaners removed | None | M3 | Settings UI displays only OhPiChamber and OMP options; chat rendering parses canonical errors without OpenCode cleanup regexes. |
| `SCOPE-17.4` | 17.4 | OpenCode Cloud Session Sharing | Retire | None; upstream cloud sharing removed; local export retained | None | M1 | Session share button removed or adapted to local JSON/markdown export; no calls made to external OpenCode sharing servers. |
| `SCOPE-18.1` | 18.1 | FS Security Invariant | Retain | Canonical realpath comparison, symlink destination verification, path traversal denial, Range checks | Host Gateway | M1 | Host FS rejects requests targeting paths outside canonical workspace root, symlink escapes, or unverified path segments. |
| `SCOPE-18.2` | 18.2 | Git Security Invariant | Retain | Denial of dangerous roots (`/`, `$HOME`), `GIT_TERMINAL_PROMPT=0`, SSH path escaping, index lock protection | Host Gateway | M1 | Host Git service enforces non-interactive execution, blocks dangerous repository paths, and sanitizes remote URLs. |
| `SCOPE-18.3` | 18.3 | PTY Security Invariant | Retain | Stripping `ARGV0`, `NODE_CHANNEL_FD`, `ELECTRON_RUN_AS_NODE`, 20s graceful SIGTERM, SIGKILL fallback, process tree sweep | Host Gateway | M1 | Host Terminal service strips sensitive environment variables before spawning PTY, terminating child process trees cleanly on exit. |
| `SCOPE-18.4` | 18.4 | Browser Security Invariant | Retain | Multi-client exclusive claim broker, operation timeouts, settle delay, mutation idempotency | Host Gateway | M4 | Browser broker prevents concurrent conflicting browser actions by requiring an exclusive claim lock before mutating page state. |
| `SCOPE-18.5` | 18.5 | Linear Issue Leakage Invariant | Retain | Sanitization of `localhost`, `127.0.0.1`, private IP subnets, and unqualified hostnames in posted comments | Host Gateway | M1 | Linear sync module scans comments and issue payloads, scrubbing internal network URLs and credentials before transmission. |
| `SCOPE-18.6` | 18.6 | Guest Extension Security Invariant | Retain | Manifest permission enforcement, filesystem path jail, network destination whitelist, child process env filtering | Host Gateway / Guest SDK | M5 | Guest host enforces manifest declared capabilities, blocking unauthorized filesystem access, network sockets, or service calls. |

## Refreshed-source traceability

This table extends the historical inventory rather than rewriting its dated findings. Paths refer to the assembled source. Milestones describe later OMP work, not completed implementation.

| Stable ID | Current source and retained behavior | Target owner / milestone | Acceptance added by the rebaseline review |
|---|---|---|---|
| `SCOPE-14.6` | `components/sourceBoard/SourceBoardView.tsx`, `useSourceBoardStore.ts`, and the mobile Board unify GitHub, GitLab and Linear issues/change requests, comments and session/worktree launch. | Host Gateway and Client UI / M1, M3 | Preserve provider grants and Board state; launch a canonical session in the selected workspace without making Board reads depend on the agent service. Exercise account unavailable, failed provider reads, and mobile presentation. |
| `SCOPE-13.6` | `server/lib/environment/` owns user/project overlays, command-derived values and private `environment.json`; Git, PTY, worktree setup and exec consume resolved overlays. | Host Gateway / M1, M2 | Keep values off client responses and logs. Resolve the correct directory's environment before spawning its SDK worker; one project's overlay must not reach another worker. Preserve explicit command-evaluation failure behavior. |
| `SCOPE-2.2-Q` | `quake-mode.mjs` and Electron IPC own the global shortcut, full-width dropdown, 30–100% height, close-to-hide and Mini Chat shortcut collision handling. | Electron Shell / M5 | Show/hide the real window with its registered shortcut without reloading sessions; reject shortcut conflicts and keep transient dropdown bounds out of normal saved geometry. |
| `SCOPE-7.2-M` | `filePathMoves.ts` and `views/files/moveWorkspacePath.ts` coordinate moves with open tabs, unsaved buffers and saves in flight. | Host FS and Client UI / M1, M3 | Rename and move an open dirty file or containing folder; retain its buffer, update every descendant path, and save only to the new path. A failed move leaves old paths and buffers valid. |
| `SCOPE-16.1` | `sdk/src/shells.ts`, UI Guest shell observation and `useBackgroundShellsStore` expose scoped running/ended snapshots, bounded output and stop. The current backend is OpenCode Shell. | Guest SDK, Client UI and Agent Service / M0, M2, M5 | Keep the Guest contract and capability checks. Prove start, output, terminal status, exit code, stop, reconnect and scope isolation using a real command. M0 must establish the OMP execution owner before choosing its canonical projection. Never substitute an empty lifecycle store. |
| `SCOPE-16.2` | `sdk/src/file-editor.ts`, manifest `fileEditors`, `deviceStorage`, status sections and commit navigation extend the Guest contract. Mobile and inherited VS Code currently do not load guests. | Host Gateway and Guest SDK / M5 | Preserve granted custom editors and dirty/save transitions on Web/Electron. Keep device storage partitioned by runtime, guest and storage identity. Add the planned mobile iframe behavior without local child services. |
| `SCOPE-10.6` | `server/lib/small-model/{client,index,routes}.js` forwards to OpenCode stateless generation. Magic Prompts, Git/PR text, titles, goals and walkthrough remain callers. Removed direct-provider helpers are obsolete, not evidence that the capability disappeared. | Agent Service and Client UI / M0, M4 | Prove stateless text/structured completion, cancellation, provider failure and unavailable-model behavior before migrating every caller to canonical service access. Remove OpenCode routes and fallback calls at cutover; do not preserve their shape as a compatibility API. |
| `SCOPE-6.4` | `server/lib/spaces/` now includes code transfer, dispatcher, journey, preview and credential handling. The UI release flag remains false; manual host opt-in does not prove containment. | Host Gateway, Electron and Agent Service / M0, M2, M5 | Preserve gatekeeper/space separation, grants, quarantined apply, untrusted responses and failure isolation. Rework runtime, events and credential ownership for OMP. Run real Docker escape and allowed-operation controls before acceptance. |

The assembled prompt queue currently persists atomically to `message-queue.json`, not SQLite. `SCOPE-10.4` specifies the intentional target persistence change for M2. The current source still contains legacy `.opencode/commands` and uses `~/.config/openchamber`; removing those commands and adopting `~/.config/ohpichamber` are target cutover specifications, not current-source facts. Settings currently separate instance `settings.json`, profile `preferences.json` and device/browser state; Mini Chat and Quake settings are Electron-managed IPC state. The four-tier target model is not a claim that every current setting already follows it. Build/runtime pins are recorded in the package manifests and baseline inventory, not copied into the target protocol.

The current event bridge translates OpenCode execution and text/reasoning/tool deltas before WebSocket delivery. M0 must measure OMP event semantics and fragment density; M3 replaces the OpenCode translator and data client. Do not freeze a token-coalescing implementation merely because it exists in the inherited transport.

## Subsystem domain specifications

This section provides granular technical requirements, constraints, and implementation details for the major functional groups in the traceability table.

### Execution and streaming

#### ChatView and virtualized timeline (`SCOPE-4.1`, `SCOPE-4.2`)
The chat interface renders an append-only timeline of conversation turns. The UI preserves virtualized scrolling via `@tanstack/react-virtual` to support transcripts with thousands of events without performance degradation.
- Streaming state machine: The client tracks session state across `idle`, `running`, `waiting_approval`, `waiting_input`, and `error`.
- Turn lifecycle distinction: The client must distinguish model turn completion from outer user request completion. Raw OMP `turn_end` is projected into canonical `turn.completed`; the dotted name is an intentional service event, not an observed SDK alias. Tool calls, approval waits and autonomous follow-ups can keep the overall request active. The timeline spinner remains active until canonical `run.completed` resolves that request.
- Reasoning blocks: Assistant reasoning tokens render inside collapsible thought containers. The container auto-expands while streaming and collapses on completion if configured by user preferences.

#### Tool execution and cards (`SCOPE-4.3`)
Tools execute via OMP SDK tool adapters.
- Live states: Tool parts transition through `pending` (queued), `running` (executing in sandbox), `success` (completed with return value), `error` (failed with message), and `rejected` (declined by user or policy).
- File modifications: Tool executions that alter files (such as `write` or `edit`) emit structured diff payloads. The ToolPart renders an inline unified or split diff component with syntax highlighting, allowing users to inspect exact file mutations.
- Subagent sessions: Tool calls that spawn subagents (such as OMP `task`) render a nested subagent card displaying progress, active tool calls, and a direct link to navigate to the child session timeline.

### Input, commands, and skills

#### Composer input system (`SCOPE-5.1`)
The composer uses CodeMirror 6 with custom extensions for auto-resizing, multi-line keybindings, history navigation (Up/Down arrow across past submissions), and drag-and-drop file attachment.
- Mention parsing: Typing `@` opens an autocomplete menu supporting:
  - `@file`: Queries the Host FS search API and inserts relative file references.
  - `@agent`: Lists configured OMP model roles and subagents.
  - `@skill`: Lists installed skills from the skills registry.
- Attachment handling: Dropping images or text files uploads them to the Host temporary storage and embeds canonical attachment metadata into the outgoing message payload.

#### Slash commands and skill catalog (`SCOPE-5.2`, `SCOPE-13.5`)
Slash commands provide rapid invocation of agent actions and installed prompt templates.
- Command runtime (target cutover): All legacy references to `.opencode/commands` are deleted. Slash commands are registered through two sources:
  1. Built-in OMP commands (such as `/clear`, `/help`, `/compact`).
  2. Workspace and user skills formatted as standard `SKILL.md` documents.
- Skills storage: Global skills use the selected OMP agent directory's `skills/` (default `~/.omp/agent/skills/`); project `.omp/skills/` was exercised, while retained `.agents/skills/` discovery remains a requirement to prove. The Host catalog installs files; the Agent Service discovers and expands skills through OMP, not client-side substitution. See [the skill contract](contracts.md#skill-storage-and-expansion) for the observed and required boundaries. The catalog supports browsing, installing and updating without modifying core application code.

### Approvals, interactive input, and safety

#### Tool approvals and permission queue (`SCOPE-6.1`)
Dangerous operations require explicit user approval.
- Approval categories: File writes outside workspace, destructive shell commands (such as `rm -rf`, `git reset --hard`), network calls, and privileged guest service operations.
- Granular decisions: The approval dialog supports four responses: `approve` (allow this execution), `reject` (deny with optional feedback text to the agent), `always-allow` (whitelist this tool/pattern for the session), and `always-deny` (permanently block this tool/pattern).
- Concurrent sessions: Approvals are assigned unique UUIDs and synchronized across all open browser tabs, desktop windows, and paired mobile devices via WebSocket broadcasts.

#### Interactive question requests (`SCOPE-6.2`)
When an agent requires disambiguation or user input, it invokes an interactive question tool.
- Protocol separation: Question requests are architecturally distinct from permission approvals. Permissions ask for execution authorization; Questions ask for business guidance or requirement choices.
- UI presentation: Questions render as interactive cards offering pre-defined option buttons or freeform text entry. The agent session enters a paused `waiting_input` state until answered or cancelled.

#### Host Gatekeeper defense (`SCOPE-6.3`, `SCOPE-18.1` - `SCOPE-18.3`)
The Host Gateway acts as the trusted gatekeeper for all machine interactions, enforcing security boundaries independently of model prompts or client-side checks.
- Command defense: Gatekeeper parses compound shell commands (`&&`, `||`, `;`, pipes), rejecting unauthorized command chaining, subshell execution (`$(...)`, backticks), and attempts to access sensitive system files (`/etc/passwd`, `~/.ssh`).
- Environment sanitization: All background processes and PTY sessions strip dangerous runtime variables including `NODE_CHANNEL_FD`, `ELECTRON_RUN_AS_NODE`, `LD_PRELOAD`, and cloud provider credentials before spawning.

### Content, files, and git

#### Canonical Filesystem API (`SCOPE-7.1`, `SCOPE-18.1`)
The Host Gateway exposes a comprehensive filesystem API (`/api/fs/*`) supporting workspace navigation and media rendering.
- Path traversal prevention: Every path parameter is resolved via `fs.realpath` and verified to reside within the canonical root of the workspace. Symlinks resolving outside the root are rejected with HTTP 403 Forbidden.
- Media streaming: The FS API supports HTTP 206 Partial Content Range requests, enabling seeking in large video and audio files in preview panes.
- File editing and diffs (`SCOPE-7.2`, `SCOPE-7.3`): CodeMirror 6 provides in-app editing with Shiki syntax highlighting, Vim mode emulation, and live preview of Markdown, SVG, Mermaid diagrams, and Draw.io charts. Diffs calculate line and hunk level changes, supporting staging and discarding directly from the UI.

#### Git and Worktree management (`SCOPE-8.1`, `SCOPE-8.3`, `SCOPE-18.2`)
The Git service operates natively on the Host Gateway using system `git` binaries.
- Safe execution: All Git commands set `GIT_TERMINAL_PROMPT=0` to prevent background hangs on credential prompts. Execution is blocked if the target directory is a system root (`/`) or user home directory (`$HOME`).
- Worktree isolation: Users can create and switch between Git worktrees. Creating a worktree establishes an isolated checkout directory and binds a new session workspace context, allowing agents to work on separate branches concurrently without file conflicts.

### Terminal, browser, and preview

#### Interactive PTY terminals (`SCOPE-9.1`, `SCOPE-18.3`)
The Host Gateway manages interactive PTY sessions using `node-pty`.
- Streaming: Terminal I/O streams over dedicated binary WebSocket connections directly into Xterm.js client instances.
- Reconnection buffer: The host maintains a circular scrollback ring buffer per terminal. Clients reconnecting after network interruption receive replayed scrollback history to restore screen state.
- Lifecycle: Closing a terminal tab or session sends `SIGHUP` followed by `SIGTERM`. If child processes do not exit within 20 seconds, the host issues `SIGKILL` to clean up the entire process tree.

#### Browser automation broker (`SCOPE-9.2`, `SCOPE-18.4`)
Browser automation allows agents to inspect and interact with web applications.
- Broker architecture: The Host Browser Broker manages connections to local Chrome instances via Chrome DevTools Protocol (CDP) or the Electron embedded Browser Pane.
- Exclusive claim lock: To prevent multiple connected clients or concurrent subagents from issuing conflicting clicks or navigation commands, the broker enforces an atomic claim lease. Only one agent session or user can claim active control of a browser target at a time.

#### Dev server detection and tunnels (`SCOPE-9.3`, `SCOPE-15.3`)
The Host Gateway scans listening TCP ports to identify active development servers (such as Vite, Next.js, or Webpack).
- Tunnels: For remote or mobile preview, the host integrates with Cloudflare Tunnels and ngrok, or provisions an end-to-end encrypted (E2EE) relay connection using ECDH key exchange and AEAD ciphers. Tunnel endpoints are strictly restricted to verified project ports.

### Autonomous workflows and scheduling

#### Session Goals (`SCOPE-10.2`)
Session Goals provide autonomous agent operation across multi-turn tasks. They run on OMP goal mode (decisions.md: 2026-10-25 - Use OMP goal mode as the only goal loop).
- Loop: OMP's `RpcGoalController` in the Agent Service worker continues the session after each turn, counts tokens against the optional budget, and stops when the agent marks the goal complete, a continuation makes no progress, or the user pauses, drops or aborts. The Host only forwards goal controls and reports the goal through the session mode.
- Retired: the Host supervisor's goal files under the data directory, idle timer and small-model progress audit.

#### Durable message queue (target M2, `SCOPE-10.4`)
The target Host Gateway maintains a durable SQLite message queue.
- Target queuing: User messages submitted while an agent session is busy, paused for approval, or temporarily disconnected are written atomically to the queue table.
- Target ordered delivery: Once the session returns to `idle`, the queue dispatcher delivers pending messages in strict FIFO order, ensuring no user instructions are dropped during long-running tasks.

#### Scheduled tasks and loops (`SCOPE-12.1`)
Tasks can be scheduled to run periodically using CRON syntax or interval definitions.
- Storage: Scheduled loops are stored as Markdown configuration files in `.agents/loops/` or `~/.agents/loops/`.
- Deduplication: In multi-instance deployments, task occurrences are claimed via database locks to ensure a scheduled event runs exactly once across all active host instances.

### Extensibility, settings, and integrations

#### Multi-tier settings registry (`SCOPE-13.1`)
Configuration is managed through a hierarchical settings engine:
1. `Instance`: Defaults shipped with OhPiChamber.
2. `Profile`: User settings synchronized across machines.
3. `Device`: Machine-specific hardware and path configurations (stored in `~/.config/ohpichamber/`).
4. `Surface`: Transient UI layout states (panel widths, active tabs, theme overrides).

#### Provider, model, and MCP registry (`SCOPE-13.2` - `SCOPE-13.4`)
Model providers and Model Context Protocol (MCP) servers map directly to OMP configurations.
- Model definitions: Provider base URLs, API keys, and context window limits configure OMP SDK model adapters.
- MCP integration: MCP servers (stdio, SSE, HTTP) are registered in the OMP MCP configuration. Dynamic tool refresh updates available tools in active sessions without requiring server restarts.

#### Guest Extension SDK (`SCOPE-16.0`, `SCOPE-18.6`)
The Guest SDK (`@openchamber/sdk`) allows third-party extensions to embed custom panels, dialogs, and background services into OhPiChamber.
- Isolation: Web/PWA and Electron Guest iframes use `sandbox="allow-scripts"` with opaque origins. Both direct and relay HTML inject the same SDK-owned inline bootstrap before authored scripts and after any effective authored CSP meta. It transfers one private per-document `MessageChannel` port to `PluginPane`; the host validates `event.source` against the exact current iframe `contentWindow`, requires exactly one port, and sends the ordinary SDK port back over the private channel. `connectHost` consumes that port through an internal same-document event; all Guest protocol traffic uses the SDK port. `iframe load` is not an authority signal. A blocking CSP yields no Host capabilities, with no load fallback. Electron's existing external-navigation guard remains unchanged; after a document receives its bootstrap port, later navigations cannot obtain a replacement SDK port.
- Capabilities and permissions: Extension manifests declare required permissions (`filesystem`, `network`, `service`, `storage`). The Host validates requests against the manifest whitelist.
- Mobile boundary: hosted mobile and Capacitor currently have no Guest iframe/runtime; Guest panels and local service child processes remain unsupported until M5. This task does not extend VS Code Guest support; its platform behavior is unchanged.

## Unresolved decisions and technical boundaries

The following technical areas contain known constraints, deferred capabilities, or pending empirical validations that must be handled conservatively during implementation.

### Multi-session isolation in OMP SDK
- Status: Dedicated-worker fixture isolation passed; shared-process cwd/env modes failed on Linux. See [the isolation artifact](m0/isolation-artifact.json).
- Constraint: The exercised SDK shares process state that prevents independent concurrent cwd and environment ownership in one Bun process. Fixture success is not actual Agent Service resource or cross-platform evidence.
- Decision: Each active root session has a dedicated worker process; its OMP subagents remain within that worker's ownership. Shared-process pooling is not the chosen topology. Preserve the failed 100 MiB result and existing maintainer acceptance of measured Linux RSS as an M0 limitation; actual service measurements belong to M2.

### Turn completion semantics
- Status: Architectural invariant.
- Constraint: Raw OMP `turn_end`, projected as canonical `turn.completed`, does not imply that the overarching user request is finished. A model turn may trigger tools, wait on approvals, request interactive input, or initiate autonomous follow-ups. Canonical `run.completed` is the service's outer-request completion signal, not another name for the raw model event.
- Decision: The Host Gateway maintains an explicit User Request state machine. A turn is only declared finished and notifications emitted when the agent reaches a stable `idle` state with no pending tool calls, approvals, or supervisor goals.

### Cloud session sharing
- Status: Retired without cloud replacement.
- Constraint: Upstream OpenCode session sharing depended on proprietary OpenCode cloud relays (`session.share`).
- Decision: Cloud session sharing is dropped from the baseline commitment. OhPiChamber supports local file export (Markdown and JSON transcript bundles). Self-hosted sharing relay infrastructure is deferred beyond milestone `M5`.

### Legacy session history migration
- Status: Clean cutover; no automatic import.
- Constraint: OpenCode session transcripts use an incompatible internal part schema and storage layout. Writing automated migrators for legacy transcripts introduces high maintenance overhead and testing fragility.
- Decision: Existing OpenCode session databases will not be automatically imported. Users starting OhPiChamber begin with fresh OMP transcript stores. Legacy directories may be inspected via read-only file viewing if needed.

### Identity and credential migration
- Status: Required one-time explicit user-triggered importer with provider feasibility gate; no automatic startup import.
- Constraint: The refreshed Host obtains OpenCode credentials through its secret-bearing credential API; historical auth files alone do not describe the current source. Stored-format conversion, OAuth refresh and scope compatibility remain unverified. No credential may enter public DTOs or logs; selected-provider authenticated traffic remains necessary and permitted under existing policy.
- Decision: M1 task 05 prepares the authenticated one-time user intent/preflight and reports service absence truthfully, without reading/staging secrets, writing SDK AuthStorage from Node or claiming imported. M2 task 22, after the real service exists, obtains only explicitly selected Host credential records or supported selected files, hands them privately to the Bun OMP owner, validates AuthStorage write/read-reload and provider-specific success or explicit unsupported/re-authentication failure. No unsupported conversion is promised, startup never imports, and no runtime fallback exists. M2 gate 23 preserves the actual handoff acceptance; task 17 removes importer and legacy readers at M3, leaving no legacy credential path for M5.
### Guest SDK declarative tools
- Status: Declaration only; no runtime execution.
- Constraint: The historical Guest inspection found that `contributes.tools` in the Guest extension manifest is declarative metadata used to display tool cards; it does not provide an in-process executable tool dispatch runtime in the adopted source.
- Decision: Guest declared tools will not be treated as executable agent tools until an explicit MCP or OMP custom tool bridge is designed. Extensions continue to provide UI panels, dialogs, and background HTTP services.

### Guest background service sandboxing
- Status: Process-level separation without kernel sandboxing.
- Constraint: Guest background services execute as standard Node.js child processes on the Host Gateway.
- Decision: The documentation and security contracts must not promise operating system level containerization (such as Docker, bubblewrap, or jail). Security relies strictly on environment variable filtering, loopback network binding, and Host Gateway reverse proxy guards.

### Permission model coverage
- Status: Independent Host Gateway validation.
- Constraint: While OMP provides built-in tool approval hooks, it cannot be assumed to cover all host-specific security invariants (such as canonical workspace path escapes, symlink traversal, Git root protection, and PTY process tree cleanup).
- Decision: The Host Gatekeeper remains the primary, authoritative security boundary. OMP permission hooks are used to request user consent, but all mutations are validated by Host Gatekeeper before execution.
