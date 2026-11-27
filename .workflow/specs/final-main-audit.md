# Final repository-wide code style, code quality, and full-product audit

**Status:** done
**Priority:** high
**Integration branch:** final-main-audit/integration

## What this is for

Once `ux-feedback-2026-11-15` (Rounds 1 and 2), `tech-debt-sweep`, and `rebrand` (Phases A and B) have all landed on `main`, the repository holds the complete OhPiChamber 1.0.0 codebase ahead of M7 release packaging/device distribution. Before cutting release artifacts, the maintainer requested a comprehensive, repository-wide audit and remediation pass across the entire `main` branch covering:

1. **Code style, typing discipline, and static quality** across every workspace (`packages/agent-contract`, `packages/agent-service`, `packages/web`, `packages/ui`, `packages/electron`, `packages/mobile`, `packages/sdk`, `packages/extensions`, `scripts/`): zero lint errors/warnings, zero dead code, zero fork-authored `anti-slop` violations (`as any` / unjustified casts, `Record<string, unknown>` boundary laundering, ad hoc narrowing, module mocks), zero OpenCode/VS Code/upstream-service leftovers, and clean security/resource-lifecycle invariants.
2. **UI design-system, settings layout, and 15-locale compliance** across all 30+ settings pages and every primary workbench surface (`Chat`, `Plan`, `Board`, `Files`, `Diff`, `Git`, `Terminal`, `Archive`, `MobileApp`): `PATTERNS.md`, `STYLING.md`, `settingsLayoutGuard.test.ts`, semantic tokens, container queries, and `OhPiChamber` product naming with zero raw English leaks in `zh-CN`.
3. **Full-product end-to-end runtime walkthrough** on the packaged `OhPiChamber-1.0.0-linux-x86_64.AppImage`, standalone `ohpichamber` Web/PWA server, mobile viewport (`MobileApp` 390x844), CLI, and Guest SDK.

## What it does

- **Task 01 (`01-agent-contract-and-service-audit.md`):** Audits and fixes code style, `anti-slop` typing, error handling, worker/process cleanup, and OMP SDK parity across `packages/agent-contract` and `packages/agent-service`.
- **Task 02 (`02-host-cli-electron-mobile-sdk-audit.md`):** Audits and fixes code style, security/Gatekeeper/enterprise boundaries, Electron IPC/updater, CLI (`clack` patterns, `ohpichamber` binary), Mobile shell, and Guest SDK (`ohpichamber-sdk`) across `packages/web`, `packages/electron`, `packages/mobile`, `packages/sdk`, `packages/extensions`, and `scripts/`.
- **Task 03 (`03-ui-code-style-and-design-compliance.md`):** Audits and fixes fork-authored `anti-slop` findings, React hook/sync invariants, `PATTERNS.md` / `STYLING.md` token/layout rules, and 15-locale copy consistency across `packages/ui`.
- **Task 04 (`04-full-product-web-and-mobile-walkthrough.md`):** Runs a real-provider end-to-end product walkthrough across Web desktop (1600 px, `zh-CN` & `en`) and Mobile (`MobileApp` 390x844) covering sessions, chat streaming, reasoning, tools, vibe/plan/goal modes, effort, compaction, todos, subagents, background shells, per-session warming, Board/Git/Files/Diff/Terminal, and all 30 settings pages — fixing any UI or runtime bug discovered.
- **Task 05 (`05-packaged-appimage-and-cli-product-audit.md`):** Builds and exercises `OhPiChamber-1.0.0-linux-x86_64.AppImage` and `ohpichamber-1.0.0.tgz` CLI (`serve`, `--version`, `--help`, deep links, isolated `~/.config/ohpichamber` & `~/.config/OhPiChamber`, About bundled release notes & credit, offline zero-`openchamber.dev` egress) — fixing any desktop/CLI integration defect discovered.
- **Task 06 (`06-final-main-convergence-and-signoff-gate.md`):** Merges fixes from 01–05, runs the complete root workspace gate (`brand:generate --check`, `check`, `type-check`, `lint` 0 warnings, `dead-code` 0 findings, `docs:validate`, `VITEST_MAX_WORKERS=2 bun run test`, `workflow validate`), conducts an independent whole-product review, updates `development.md`, and writes `FINAL-AUDIT-REPORT.md` ready for maintainer sign-off and M7.

## What it must not do

- Mass-rewrite untouched upstream OpenChamber files solely to clear pre-existing inherited upstream `anti-slop` findings (per `AGENTS.md`: fix findings in fork-authored/modified modules, never silence rules, weaken severity, or launder types).
- Touch `~/.config/ohpichamber` or `~/.config/OhPiChamber` directly (the maintainer's live data directories after `rebrand/07`); every run isolates `HOME`, `OPENCHAMBER_DATA_DIR`, and `OPENCHAMBER_DESKTOP_USER_DATA_DIR` under `/tmp` or the evidence directory.
- Edit `changelog/` or `CHANGELOG.md`, add dependencies, or run GitHub/publish commands.

## How we will know it works

- **W1 (Backend, Host, Desktop & SDK Code Quality).** `packages/agent-contract`, `packages/agent-service`, `packages/web`, `packages/electron`, `packages/mobile`, `packages/sdk`, and `scripts/` pass `type-check`, `oxlint` (0 warnings, 0 fork-authored `anti-slop` violations), security/boundary audits, and all package test suites.
- **W2 (UI Code Style, Design System & Localization).** `packages/ui` passes `type-check`, `oxlint` (0 warnings, 0 fork-authored `anti-slop` violations), `settingsLayoutGuard.test.ts`, and 15-locale completeness/brand checks (`OhPiChamber` everywhere except the About credit; zero untranslated English leaks in `zh-CN`).
- **W3 (Full-Product Web & Mobile Walkthrough).** Every workbench view and all 30 settings pages are driven against a real provider on Web (1600 px `zh-CN` & `en`) and Mobile (`390x844`), with screenshots and zero console/page errors or unhandled rejections.
- **W4 (Packaged Desktop & CLI Product Audit).** `OhPiChamber-1.0.0-linux-x86_64.AppImage` and packed `ohpichamber-1.0.0.tgz` pass clean-HOME startup, `/api/agent/v1/ready` 200, real-provider chat, deep links, and zero `openchamber.dev` network egress.
- **W5 (Zero-Defect Root Gate).** `bun run brand:generate --check`, `bun run check`, `bun run type-check`, `bun run lint` (0 warnings), `bun run dead-code` (0 findings), `bun run docs:validate`, `VITEST_MAX_WORKERS=2 bun run test` (all suites 0 failures), and `.workflow/bin/workflow validate` all exit 0, documented in `FINAL-AUDIT-REPORT.md`.
