# Release notes authoring

License: MIT (retained from the original authoring reference).

This is an on-demand release-time reference, not a skill. The [root changelog write gate](../../AGENTS.md#always-on-constraints) controls when it may be used. The protected [historical format reference](../../changelog/README.md) retains inherited examples; its `packages/vscode/CHANGELOG.md` output and old skill path are obsolete. The generation rules below apply to this fork.

## Gate

The changelog is written once per release, by the maintainer, as one story. `changelog/` stays untouched by every other task; a fix or a merged PR lands without a changelog line. Proceed only when the current message asks to update the changelog.

When explicitly asked, write `changelog/unreleased.md` and nothing else. Generation is the maintainer's release step: `oc-dev create-release` turns it into `changelog/<version>.md` with the date and renders `changelog/index.json`, refreshing the legacy root `CHANGELOG.md` only while it exists. Never run the generator or edit released/generated files or the legacy root `CHANGELOG.md`. `bun run changelog:check` validates without writing.

The inherited format opens `unreleased.md` with a `title:` front matter line and supports:

- `## App` — Web, Desktop, Mobile/PWA, shared UI and Guest SDK.
- `## VS Code` — retained only when parsing historical releases. Do not write a new extension section; the extension form is retired.

## The shape of a release

Every release section is grouped. Under the version header come, in this order and only when non-empty:

```markdown
### New
- **Project actions:** Run a saved action from a worktree.

### Improvements
- Chat: Markdown tables use the width their content needs.

### Fixes
- Chat: Large patches in tool cards open without freezing the page.

### SDK
- Actions: Use `mode: "background"` to handle a message action without opening a panel.

### Misc
- Bundled tool version updated.
```

Where a change goes:

- **New** — something the user could not do before: a feature, a surface, a language.
- **Improvements** — something they could do works better or reads clearer now.
- **Fixes** — something was broken and showed a wrong result; the bullet names the symptom.
- **SDK** — capabilities and API changes for extension authors, under `## App`, after Fixes and before Misc. Name the API and what an author can build with it. User-visible extension features and fixes stay in the regular groups.
- **Misc** — bundled tool versions, packaging, platform support, retirements. Rarely more than a few lines.

The generator emits the groups in this order whatever order the source lists them and drops empty ones; version, date, and headers are its concern, not yours.

## The title

Every release carries a one-line `title:` in its front matter. The website lists it beside the version and uses it as the heading of the release page, so it is the one line most people read. It answers "what would a user remember this release for":

- **Two to six words** naming the change most users will notice. For a fix-only patch, name what works again: `Terminal works again on Windows`, `Faster session switching`.
- **Plain words, sentence case**; product names keep their casing. No area prefix with a colon, no trailing period, no version number, no credit.
- **Never a category alone** (`Fixes`, `Stability`, `Improvements`, `Polish`) and **never a bare area** (`Git`, `Chat`): the title has to teach the reader something.
- Two headliners at most, joined with `and`, and only when the release really has two.

`oc-dev create-release` refuses a release without a title. In `unreleased.md` it sits at the top:

```markdown
---
title: Project actions from worktrees
---

## App
```

## The bullet

The reader is an app user who has not opened the code. Write bullets they can understand in about five seconds:

- **One sentence, two at most.** A bold highlight may take three. Under about 200 characters for a regular bullet.
- **Name what they see or do.** The screen, the button, the gesture, the outcome. When a fix removed a symptom, name the symptom in plain words ("froze the page", "sent the comment by accident", "stopped at the first page").
- **Plain words only.** Anything a user would have to look up is out: store, cache, route, payload, reconcile, authoritative, lifecycle, runtime, listing, revision, PTY, bridge. Internal component names are out unless the user sees them on screen.
- **State the new behaviour directly.** Say what happens now. Framing it against the old way ("X, not Y", "instead of Y", "rather than Y") is the tell of machine-written notes; drop the second half and let the sentence stand.
- **Area prefix, then the fact.** `Chat:`, `Settings/Providers:`, `Git:`, `Mobile:`, `Server:`, `CLI:` in the main file. A highlight bolds its prefix: `- **Project actions:** ...`.
- **Keep implementation detail out.** No commit hashes, file paths, numbers that do not change what the user does, or mechanism. One concrete number is fine when it is the whole point ("more than 200 sessions").

Worked example, same change:

> Weak: *a saved action counts as running exactly while its command runs. When the command exits, the stop icon goes away even if the terminal tab stays open, and a second client can start the action again. Every client shows the same run, and the sidebar marks a directory that has one. Sessions in a linked worktree can use the parent project's actions; they run in the worktree by default.*
>
> Good: *the running state of a saved action is reliable now. It shows as running only while the command is really running, every device sees the same state, and the sidebar shows which project has something running. Worktrees can use the parent project's actions.*

The weak version is accurate and lost the reader at the first comma. The good version keeps the three things a user notices and drops the mechanics that explain them.

SDK bullets address Guest extension authors: use exact API names in backticks and state how to use the new capability. Keep the same short bullet format; omit implementation internals.

## Gather

Use the maintainer's release range and actual source/evidence to identify changes since the preceding release. Read the affected implementation and existing validation evidence rather than turning commit subjects into claims. Local Git work requires its existing authorization; GitHub commands require an explicit request under the root guide. This reference does not authorize either or require remote review material.

Fold follow-up changes into the same user-visible behavior rather than giving internal completion work separate bullets. Tooling, CI, tests, docs, dead-code removal and internal guards with no user or SDK effect get no entry.

Gathering is complete when every included user-visible or SDK change has factual evidence, observed platform reach and a contributor identity where available. Unknown behavior remains uncertain; never advertise unexercised platform support as verified.

## Order and highlights

- Inside each group, sort by user impact: breaking changes, then what most users meet daily, then the rest, visual polish last.
- Bold the prefix of the strongest one to three bullets in the whole release and put each at the top of its group. A highlight introduces a capability, changes a common workflow, or fixes something severe. Size of the diff and effort spent are not reasons to bold.
- A change that is both a feature and a fix (a reworked area) gets one bullet in the group that describes what the user gains most; a second bullet only when the two halves are things a user would look for separately.

## Historical VS Code section

Released sources and their `## VS Code` sections remain historical inputs to the parser and release index. There is no extension changelog output or current extension surface to trace. Preserve those released records; the protected `changelog/README.md` describes inherited output and does not restore extension support.

## Credit

When a contributor is known, end the bullet with `(thanks to @username)` using the evidenced GitHub login. Follow the maintainer's credit convention; no upstream repository owner is hardcoded here.

## Done when

Read each finished section top to bottom and check every bullet:

- A user could point at it in the app within five seconds of reading it; an SDK entry tells an extension author which API to use and why.
- It is one or two sentences (three for a highlight) in plain words, with no mechanism and no contrast against the old behaviour.
- It sits in the group its wording claims (a Fix names a symptom, a New names a capability) and no higher than the bullets above it in impact.
- Empty groups are absent; present groups appear in the order New, Improvements, Fixes, SDK, Misc.
- It appears only in the section whose runtime receives it.
- Known contributors are credited according to the maintainer's convention.
- The `title:` line names the release's headline change in two to six plain words.
- `bun run changelog:check` passes; only the authorized unreleased source was written, with no released/generated file edits.
