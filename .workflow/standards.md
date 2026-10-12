# Standards

## What this project is

OhPiChamber is an OpenChamber fork. The [active effort](specs/omp-through-m3.md) migrates the adopted application baseline to OMP through M3 acceptance. The [rebaseline spec](specs/upstream-rebaseline.md) records the closed source/document prerequisite and unverified runtime certification. Recover the next task through the workflow.

The pinned upstream application source has been adopted; unavailable runtime certification remains explicit. M0 SDK evidence and the recorded provider/platform limits are accepted for entry into M1 Host extraction and VS Code extension retirement. Application execution still uses the inherited OpenCode integration. The target is OMP-only across Web/PWA, Electron, mobile and Guest SDK surfaces; the Agent Service, Canonical API and client cutover remain proposed. [development.md](development.md) owns current evidence; the [old upstream assessment](upstream-review.md) is historical research, not a selective-import policy.

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

## Layout

`packages/ui` - shared UI, state, sync, and runtime contracts.
`packages/web` - web surface, Host Gateway, and CLI.
`packages/electron` - native desktop shell and privileged boundary.
`packages/mobile` - Capacitor shell and mobile surface.
`packages/sdk` - Guest SDK contract and examples.
`.workflow/omp-migration` - OMP migration scope, architecture, proposed contracts, and gates.
`.workflow/isolated-spaces` - inherited sandbox design and dated experiments, subject to OMP migration decisions.
`.workflow/development.md` - current progress, evidence limits, and next step.
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

Landing: direct

Local Git work follows the landing mode below. GitHub commands still require explicit user instruction under the root guide. Preserve unrelated worktree changes and use focused commits.

Work lands on the current branch. `.workflow/merge-strategy.md` describes alternate task-branch modes. Parallel implementation needs separate worktrees; parallel read-only research does not.
