# Standards

## What this project is

OhPiChamber is an OpenChamber fork that runs on OMP instead of OpenCode, across Web/PWA, Electron, mobile and the Guest SDK. Where it stands lives in the specs (`specs/*.md` headers) and `.workflow/bin/workflow next`, not here; [development.md](development.md) keeps the evidence history and accepted limits.

## Starting a conversation

Use `flow-start` and `.workflow/bin/workflow next --no-color` at conversation start or after lost context. Resume the active task; use the matching workflow skill for its next step. Read-only agents may investigate independent boundaries in parallel. One coordinator owns edits in a shared tree.


## Running it

```sh
bun install
bun run dev
bun run test
bun run type-check
bun run lint
```

Real path: build and run the app the way a user gets it (`bun run electron:build` and launch the packaged app, or `bun run dev` for the Web surface), then drive the visible UI: send a chat that completes through a real provider. Real provider settings come from `~/.config/ohpichamber/omp-m0-provider.env` (operator-managed, outside the repository; load it with `source`).

Evidence: `/home/shizuku/Project/ohpichamber-omp-artifacts/`, outside the repository, one directory per task and date (for example `task78-2026-10-24/`). Never a temporary directory.

## Layout

`packages/ui` - shared UI, state, sync, and runtime contracts.
`packages/web` - web surface, Host Gateway, and CLI.
`packages/electron` - native desktop shell and privileged boundary.
`packages/mobile` - Capacitor shell and mobile surface.
`packages/sdk` - Guest SDK contract and examples.
`.workflow/omp-migration` - OMP migration scope, architecture, implemented contract and design records, and gates.
`.workflow/isolated-spaces` - inherited sandbox design and dated experiments, subject to OMP migration decisions.
`.workflow/development.md` - evidence history and accepted limits; task and effort state live in specs and tasks.
`.workflow/upstream-review.md` - historical pinned selective-sync assessment.
`.workflow/specs/upstream-rebaseline.md` - current baseline-update scope and acceptance criteria.
`packages/**/DOCUMENTATION.md` - module-owned contracts.
`docs` and `packages/docs` - operational references, assets, and inherited product guides.

## How code is written here

Keep host-owned capabilities behind the Host Gateway and keep agent SDK objects private to the Agent Service.
Use package scripts as the command source of truth; validate the narrowest affected surface before broader checks.

## What we do not do

Do not add OMP compatibility layers, dual-engine selectors or fallback engines, or expand VS Code as a final supported surface. These are final migration constraints, not reasons to hold the prerequisite baseline update on OpenCode 1.x. Preserve fork-owned workflow and guidance rather than replacing them with upstream collaboration machinery.

## Branches and landing

Landing: local-merge

Local Git work follows the landing mode below. GitHub commands still require explicit user instruction under the root guide. Preserve unrelated worktree changes and use focused commits.

Tasks land on the main branch, or on the effort's integration branch when its spec header names one; that branch lands on main at `flow-close` (CONVENTIONS §7). Parallel implementation needs separate worktrees; parallel read-only research does not.

Worktrees: `/home/shizuku/Project/ohpichamber-worktrees/`, outside the repository, one per task; remove each after landing.
