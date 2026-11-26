# Closeout: omp19-integration

**Accepted:** 2026-11-26 by the maintainer

## Shipped

The OMP 19 integration (`881705d19b..6794919fd5`, tasks 01-09) landed on `main` before close. OMP 19.1 has since superseded its 19.0.0 pin (`omp19-1-integration`). At close, the W checks were rerun on current `main`; final numbers are from `b3c03cafa8`:

- **W1, W4, W5, W9:** the Agent Service suite passed 819, skipped 26 and failed none (845 tests). Root `bun run type-check` passed all five check steps through mobile.
- **W2, W7, W8:** Agent Contract passed 287 tests. The effort's 15 UI test files passed 318 tests: todos, FormDock controls, questions, Markdown/SVG media, tool parts, reducer and sequence gating, session actions, and subagents.
- **W3, W6:** root lint exited 0, and none of its warnings fall in the effort's 170 changed files. `bun run dead-code` keeps its repository-wide baseline; no finding is an export this effort introduced. Independent workflow and security reviews ran at close (see below).
- **Main user flow:** an isolated browser run against a real provider passed chat streaming, todos, Ask forms, Bash with approval, subagent progress and Stop. Evidence: `ohpichamber-omp-artifacts/omp19-close-2026-11-26/realpath/REPORT.md`.

## Key decisions & plan changes

- The eight OMP 19 source decisions are recorded in the spec. Later efforts superseded parts on purpose: the 19.1 pin, `help` replacing `xd`, and SubagentsPanel replacing SubagentHudTray. These are not regressions.
- The close review's security findings led to the authorization fixes recorded under `omp19-1-integration` (decisions.md, 2026-11-26). They cover the compaction, widget, summary and recovery credential paths this effort's runtime exposes.
- The branch history was rewritten before landing, so task Base commits named SHAs that no longer exist. At close, they were mapped by commit subject to their rewritten equivalents, with no backup refs to confirm them: task 01 to `a416b13b28` (native integration plan), task 04 to `79d474a8da` (behavioral plan), tasks 05-06 to `57479dba7a` (the Stage 2b implementation, formerly `593f4de1f`), and tasks 07-09 to `cdbeff359b` (real-path plan).

## Waived checks & skipped reviews

All nine tasks originally recorded `Review: skipped`. At close, an independent workflow review covered `881705d19b..6794919fd5` and current `main`. Its only blocking findings were stale spec and development.md statements, corrected at close. The security review's findings are fixed in `b3c03cafa8`. The original receipts under `/home/ubuntu/omp19-artifacts/` are on another machine; the close reruns replace them.

## Remaining debt & follow-ups

- Native form draft updates send one CAS request and one `question.requested` event per keystroke. This is correct but noisy; a short trailing debounce would keep the countdown-reset behavior.
- `/handoff` completion was not shown visually at close; the session stayed below the compaction floor. The Stage 3 run under a lowered-retention profile remains the visual evidence.
- Not verified: Electron GUI, non-Linux platforms.
