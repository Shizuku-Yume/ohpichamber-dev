# Technical Debt

Code that makes the next change expensive, one entry per finding, so reviews don't
rediscover it and the reason it wasn't fixed yet is kept. `flow-architect` adds
entries; any skill that finds debt may add one.

## Format

Each entry is a level-2 heading naming the concrete symptom, under `## Entries`.
Refer to an entry by its heading.

```markdown
## Order total computed in three places

- **Where:** <files or modules>
- **Added:** <YYYY-MM-DD>
- **Priority:** fix-now | worth-doing | only-if-grows
- **Problem:** <what is wrong, with evidence>
- **Impact:** <what gets harder while it stays>
- **Solution:** <the change, in plain terms>
- **Cost:** <what the fix risks, how big it is>
```

An entry leaves this file in one of two ways:

- Fixed: the task that fixes it deletes the entry in its own commit.
- Declined by the user: delete the entry and append a decision entry to
  `decisions.md` (Decided: not fixing <symptom>; Instead of: fixing it; Because;
  Mine: no; Revisit when), so reviews don't re-propose it.

## Entries

## Fork-owned server JavaScript awaits TypeScript conversion

The merge also carried untyped fork JavaScript bodies into upstream `.ts`
destinations. `packages/web/scripts/fork-owned-server-untyped.json` records each
retained path and its original fork path. Historical worktree measurements:
fork `881705d19b` passed its frontend-only web check (2,299 files, two projects)
and had zero server implementation TypeScript; upstream `1928155551` passed its
strict server check. Their strict compiler configurations are unchanged by this
scope repair. The explicit legacy set supplies generated declarations through a
no-check referenced project; all other roots, including new neighbors, retain
strict checking and server lint. Remove entries as their bodies gain real type
annotations and pass those checks. This is preserved prior coverage, not a
claim that the carried-over bodies have been type-verified.

- **Where:** `packages/web/scripts/fork-owned-server-javascript.mjs`, `packages/web/server/`
- **Priority:** worth-doing
- **Problem:** the upstream TypeScript-only guard conflicts with 95 retained fork-owned JavaScript modules, including excluded isolated-space modules. The explicit generated list freezes only those existing paths; new server modules still require TypeScript.
- **Impact:** the listed implementations are not covered by the server TypeScript conversion gate.
- **Solution:** convert the retained modules by owner with real types and existing runtime tests, removing each path from the explicit list. Preserve the isolated-space release exclusion and Canonical/Host boundaries.
- **Cost:** a separate server migration rather than mechanical renames or broad guard exemptions.

## Security docs enterprise mode still mentions update checks

- **Where:** `packages/docs/content/docs/security.mdx:157` (and localized `packages/docs/content/docs/*/security.mdx`)
- **Added:** 2026-11-18
- **Effort:** rebrand
- **Priority:** worth-doing
- **Problem:** the enterprise mode section still states that "Update checks keep running, so security fixes still reach you, but they never report usage, not even the anonymous install ID", even though Phase A removed the CLI/host update check and telemetry reporting (`rebrand/03`, `rebrand/05`).
- **Impact:** readers configuring enterprise mode are told update checks run when the fork has removed that check.
- **Solution:** update or remove that bullet in `packages/docs/content/docs/security.mdx` and its localized translations.
- **Cost:** small docs-only edit across the security MDX files.

## Composer model label temporarily shows the previous model during a new-session run

- **Where:** shared composer model presentation during new-session streaming.
- **Added:** 2026-11-20
- **Priority:** minor
- **Problem:** while a devin-swe-2 reply streams in a new session, the composer label shows the previously selected gemini-3.5-flash-lite model and reverts after completion.
- **Impact:** display-only; the run uses devin-swe-2. No routing or response-loss regression is established by this report.
- **Solution:** identify the stale presentation owner and derive the streaming label from the authoritative session/run selection, preserving ordinary draft selection outside a run. Cover promotion, streaming, completion and interruption ordering.
- **Cost:** focused composer state investigation and regression coverage; the source cause is not yet verified.

## Exact slash-command matches need a second Enter

- **Where:** shared composer slash-command autocomplete
- **Added:** 2026-11-26
- **Priority:** worth-doing
- **Problem:** When typed text exactly matches a command, the autocomplete stays open. The first Enter only selects the item and appends a space; a second Enter submits. After a control command fails, the typed text is not visibly restored. Observed in the isolated browser run (`ohpichamber-omp-artifacts/omp19-close-2026-11-26/realpath/REPORT.md`); the cause has not been traced in source.
- **Impact:** Every exact slash command costs an extra keypress, and a failed command loses the typed text.
- **Solution:** Submit on Enter when the input already equals the highlighted command. Restore the draft when a control command is rejected. Cover keyboard and touch submission.
- **Cost:** Composer input state changes and regression tests across desktop and mobile layouts.
