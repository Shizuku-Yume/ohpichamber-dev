# 20: i18n and RTL

**Effort:** upstream-refresh
**Task type:** feature
**Base commit:** aa0954a966b5c89572abb15c08e710c63ae2d5be
**Finished:** 2026-10-27

**Delivers:** Arabic and Hebrew locales with mirrored layout, plus the refreshed message catalog and RTL-safe components, work across the shell, chat and settings.

**Blocked by:** 10, 23
**Files:** Path list: `/home/shizuku/Project/ohpichamber-omp-artifacts/upstream-sync-2026-10-27/plan-paths/20.tsv` (109 paths: 66 clean/new, 41 both-side, 27 conflicts; +41.7k lines). Main locations: `packages/ui/src/lib/i18n/`. Deferred from task 10: `components/ui/{OverlayScrollbar.tsx,sonner.tsx,sonner.test.tsx,sortable-tabs-strip.tsx}` (need this task's `direction`/`isRightToLeft`/`getLocaleDirection`), plus the RTL logical-class changes in `components/onboarding/ChooserScreen.tsx` that task 10 kept. Use the shared clock (`components/ui/pause-clock.tsx`, `hooks/useDurationTicker.ts`, `hooks/usePageColors.ts`) for spinners/busy indicators in scope so they are not dead code.

**Read first:** Spec W6; `.agents/skills/locale-ui-patterns/SKILL.md`; `packages/ui/src/lib/i18n/DOCUMENTATION.md`; the fork's locale rules.
**Covers:** W6

**Check:** `bun install --frozen-lockfile` and `bun run type-check` and `bun run lint` and `bun run test` all exit 0, the i18n tests pass, and in the running app switching to Arabic mirrors the layout, keeps icons directional, and no label is clipped in the sidebar, chat composer or settings. Real path: send one message in RTL mode.

## Done when

- [x] The layout uses logical CSS properties where the new locales need them; no physical-side duplication.
- [x] Message keys are shared across locales; missing keys fall back visibly.
- [x] The fork's existing locales keep their translations; no key is silently dropped.
- [x] RTL is exercised on the settings and chat surfaces, not only the shell.
- [x] OverlayScrollbar, sonner and the sortable tab strip adopt upstream with the direction helpers; ChooserScreen gets the logical-class changes.
- [x] `pause-clock`, `useDurationTicker` and `usePageColors` have their consumers where this task touches spinners/busy indicators.

## Progress

### Base and Commit Lineage
- Base SHA: `aa0954a966b5c89572abb15c08e710c63ae2d5be`
- Worktree: `/home/shizuku/Project/ohpichamber-worktrees/upstream-refresh-20`
- Branch: `upstream-refresh/20`

### Catalog Merge Results
1. **Upstream Catalog Adoption**: Adopted upstream 0056bf6a9 message catalog across all domains. Added Arabic (`ar`) and Hebrew (`he`) locale catalogs directly from upstream (`ar.ts`, `ar.settings.ts`, `he.ts`, `he.settings.ts`).
2. **Retained Fork Keys (372 keys)**:
   - Preserved all 372 active fork keys across all 13 existing fork locales (`en`, `de`, `fr`, `nl`, `es`, `ja`, `pt-BR`, `uk`, `ko`, `pl`, `zh-CN`, `zh-TW`, `tr`).
   - Covered Task 15 attachment error strings (`chat.composer.error.binaryAttachmentNotSupported`, `chat.composer.error.textAttachmentTooLarge`), OMP session warming (`settings.openchamber.defaults.warming.*`), legacy data notification (`startup.legacyNotice.*`), native providers (`settings.providers.native.*`), merged worktree cleanup (`settings.openchamber.mergedWorktreeCleanup.*`), and mobile navigation copy.
   - For `ar` and `he`, the 375 fork-only keys without upstream translations fall back visibly through the catalog fallback mechanism (`dictionary[key] ?? enDict[key] ?? key`).
3. **Dropped Keys (27 keys)**: Verified with `git grep` that 27 obsolete/superseded keys had 0 call sites across `packages/ui/src` and the entire repository outside i18n (e.g. `settings.providers.page.openCodeGo.authCookie`, `mobileUpdate.toast.actions.dismiss`, `settings.skills.page.field.disableModelInvocation`, `chat.chatInput.toast.largeTextPaste.*`). Removed from all locales.
4. **Excluded Upstream Engine Keys**: Excluded 15 `opencodeCompatibility.*` keys that name OpenCode as the engine.

### Per-Locale Key Counts (compared to English `en` with 9,083 keys)
- `de`: 9,083 total, 0 missing, 0 extra
- `fr`: 9,083 total, 0 missing, 0 extra
- `nl`: 9,083 total, 0 missing, 0 extra
- `es`: 9,083 total, 0 missing, 0 extra
- `ja`: 9,083 total, 0 missing, 0 extra
- `pt-BR`: 9,083 total, 0 missing, 0 extra
- `uk`: 9,083 total, 0 missing, 0 extra
- `ko`: 9,083 total, 0 missing, 0 extra
- `pl`: 9,083 total, 0 missing, 0 extra
- `zh-CN`: 9,083 total, 0 missing, 0 extra
- `zh-TW`: 9,083 total, 0 missing, 0 extra
- `tr`: 9,083 total, 0 missing, 0 extra
- `ar`: 8,739 total, 349 missing (visible fallback to English), 0 extra
- `he`: 8,739 total, 349 missing (visible fallback to English), 0 extra

### Real Path Evidence
Captured live via `chrome-devtools` against dev server running on port 5280 with isolated data dir and real OMP Gemini 3.8 Flash provider:
- `01-arabic-settings-rtl.png`: Arabic selected in Settings Appearance; `document.documentElement.dir === 'rtl'`; sidebar mirrored to inline-start (right), settings labels unclipped.
- `02-arabic-chat-reply.png`: Sent Arabic prompt "مرحبا، اكتب كلمة واحدة: تأكيد", received model reply "تأكيد" from Gemini 3.8 Flash; work status telemetry, mirrored composer input, and RTL message layout verified.
- `03-arabic-visible-fallback.png`: Visible fallback verified in Sessions settings; fork keys without upstream Arabic translation (e.g. `settings.openchamber.sessionWork.field.keepInGroup`: "Keep tracked sessions in their project group" and `settings.openchamber.mergedWorktreeCleanup.title`: "After a PR is merged") display clean English text instead of raw translation keys.
- `04-hebrew-shell-rtl.png`: Hebrew selected; `document.documentElement.dir === 'rtl'`; shell rendered in Hebrew with mirrored navigation and panel layouts.
- `05-english-restored-ltr.png`: Switched back to English; `document.documentElement.dir === 'ltr'`; layout and LTR direction fully restored.

### Logical CSS Properties & Spinner Consumers
- `OverlayScrollbar.tsx`: `horizontalScrollOrigin` tracks scrollLeft in RTL (negative offset); horizontal thumb transform maps appropriately.
- `sonner.tsx`: `dir={getLocaleDirection(locale)}` bound on Toaster; consumes `<Spinner />` (line 110), which consumes `useSpinnerPhase` from `useDurationTicker.ts:39`.
- `sortable-tabs-strip.tsx`: Mirrors active pill nudge direction in RTL (`towardLater = isRtl ? -PILL_NUDGE_PX : PILL_NUDGE_PX`), uses logical `start`/`end` overflow detection, and logical shadow gradients.
- `ChooserScreen.tsx`: Uses symmetric logical spacing (`p-8`, `px-3`, `py-1.5`, `gap-1`, `items-center`, `justify-center`, `text-center`) with zero physical sides.

### Validation Gates
- `bun install --frozen-lockfile`: exit code 0 (`logs/root-install.log`)
- `bun run type-check`: exit code 0 (`logs/root-type-check.log`)
- `bun run lint`: exit code 0 (`logs/root-lint.log`)
- `bunx oxlint`: exit code 0 (`logs/oxlint-authored.log`)
- `VITEST_MAX_WORKERS=2 bun run test`: exit code 0 across 7/7 workspaces (`logs/root-test.log`):
  - UI: 924/924 test files passed
  - Web: 446/446 test files passed, 7,171 tests passed (9 skipped)
  - Electron: 54/54 test files passed
- `bun run build`: exit code 0 (`logs/root-build.log`)
- `bun run dead-code`: exit code 1 (baseline knip finding count), `diff -u baseline-dead-code.log root-dead-code.log` is completely identical with 0 diff lines (`logs/root-dead-code.log`)

## Follow-up: OpenCode-as-engine review and the warming error (2026-10-29)

Branch `upstream-refresh/fix-ar-he`, worktree `upstream-refresh-fix-ar-he`, on top of
the integration tip `c4ce06dc0f`. Not landed.

### The ar/he catalog fix under review

The handoff commits `c461747495` + `028bab9252` were reviewed value by value against
the English source. Corrected count: the change covers **41 keys** in each locale,
written as **51 catalog entries** per locale (10 of those keys also live in the
`*.settings.ts` split), i.e. **102 values** — not "51 values, 26 ar / 25 he".

- Every replaced value now says what its English value says. The engine references
  became `Agent Service` / `جلسات الوكيل` / `הפעלות סוכן`, and
  `settings.view.nav.group.opencode` became `OMP` in both locales, matching `en`.
- Host-infrastructure names stay: keys where `en` still says OpenCode (the CLI,
  `opencode.json`, OpenCode Go, plugins) keep the name in ar/he. A scan of the built
  catalogs reports **0** ar and **0** he values that name OpenCode where `en` does not.
- Two values were rewritten beyond the engine name, and both match the current
  English: `settings.providers.page.custom.field.apiKey.info` (dropped the stale
  `{env:VAR_NAME}` sentence) and `sessions.sidebar.session.action.upstreamErrorWithRef`
  (drops the "search the OpenCode log" clause). No `{placeholder}` set changed.
- `028bab9252` fixed the mangled `sessionWarming*` values the first commit left;
  both now match `en` sentence for sentence.

The test in `messages.test.ts` pins the rule, not the source text: it reads the built
dictionaries and fails when any locale names OpenCode on a key whose English value
does not. Run against the pre-fix catalogs it reports 41 failures per locale (82
total), 0 after the fix. It previously indexed English with a `key as keyof typeof
enDict` assertion; it now uses a `Record<string, string>` view.

### Settings → Sessions warming error

Symptom under Arabic: "Could not read or save warming settings…" in English, next to
an unchecked box.

- The message is `settings.openchamber.defaults.warming.error`, and none of the twelve
  `settings.openchamber.defaults.warming.*` keys (nor `summaryPrefix`,
  `summaryRuntimeDefault`, `sessionWarming.label`, `smallModel.overrideModel`,
  `walkthroughModel.overrideModel`, `option.defaultLowercase`) existed in ar/he — the
  English came from the catalog fallback.
- The failure underneath is a real read failure, reproducible: when the Settings
  project directory no longer exists, `POST /api/agent/v1/workspaces/resolve` answers
  `404 UNAUTHORIZED` and `SessionWarmingCheckbox` sets its error state, leaving the box
  unchecked and disabled. Reproduced with the previous run's data directory, whose
  only project (`…/worktrees/upstream-refresh-20`) had been deleted.
- In a clean dev run the read and the save both work: the row reads `Idle mode`,
  `PUT …/cache-warming` returns `applied`/`no-active-workers`, and no error appears.
  So the read/save path itself is healthy; the error comes from resolving a stale
  project directory, and the visible defect was the missing translation.
- Fix: the 17 keys added to `ar.ts`, `ar.settings.ts`, `he.ts`, `he.settings.ts`.
  The stale-project condition and its misleading wording are left as a limit below.
- Removed one more untranslated string found in the real path: the header rendered a
  hardcoded `'Untitled Session'` (`Header.tsx`) while the sidebar used the translated
  key; it now resolves `sessions.sidebar.session.untitled`.

### Real path evidence (headless)

Dev server on `127.0.0.1:3750` (UI) / `3751` (API), isolated data dir and HOME under
the artifact directory, real OMP provider (Gemini 3.8 Flash). Browser automation ran
headless: `chrome-devtools start --headless=true`, viewport 1280x800 via
`chrome-devtools emulate <page> --viewport "1280x800"`; no visible window, no Xvfb.
Bounding rects per shot: `logs/screenshot-bounding-rects.md`.

- `03-arabic-visible-fallback.png` (retaken): Arabic Sessions page, `dir=rtl`; the
  warming label sits right of its checkbox (`label x 706..859`, `checkbox 680..700`,
  pane right edge 881) and reads `إبقاء الجلسات الخاملة نشطة / وضع الخمول`; the saved
  outcome is Arabic. Remaining Latin text is product names only (`OPENCHAMBER`, `Git`,
  `OMP`); no OpenCode.
- `06-arabic-warming-error.png` (new): same page in the stale-project data dir — the
  error line is now Arabic (`تعذّرت قراءة إعدادات الإبقاء على النشاط أو حفظها…`),
  `direction: rtl`, box unchecked, and the nav group reads `OMP` instead of `OPENCODE`.
- `07-hebrew-sessions-rtl.png` (new): Hebrew Sessions page, `dir=rtl`, row
  `שמור הפעלות לא פעילות חמות / מצב סרק`, checked; `label x 680..859`,
  `checkbox 654..674`.
- `08-arabic-chat-reply.png` (new): Arabic chat that completed through the provider —
  prompt `مرحبًا، اكتب كلمة واحدة فقط: تم`, reply `تم`, header title
  `جلسة بلا عنوان` after the `Untitled Session` fix; mirrored layout.

### Validation

- `bun run type-check`: exit 0 (`logs/followup-type-check.log`)
- `bun run lint`: exit 0, only the three pre-existing react-hooks warnings
  (`logs/followup-lint.log`)
- focused i18n tests `bun test src/lib/i18n src/components/sections/openchamber/DefaultsSettings.test.tsx src/components/layout/HeaderSessionArchiveMenuItem.test.tsx`:
  exit 0, 67 tests / 39 files (`logs/followup-focused-i18n-tests.log`)
- `bunx oxlint -c oxlint.anti-slop.config.ts packages/ui/src/lib/i18n/messages.test.ts`:
  exit 0. The same command over `Header.tsx` reports 21 findings, all on lines this
  branch did not touch (pre-existing backlog); none at the changed lines.
- `bun run dead-code`: exit 1 (baseline finding count); the report is identical to the
  integration-tip baseline apart from bunx resolution lines —
  `logs/followup-dead-code.diff`
- A wider `bun test` over whole component directories (not the repository's suite
  runner) reports 22 failures in unrelated suites that surface missing desktop-settings
  fixtures (`parseVimMappings(undefined)`), panel timers and SSH inventory mocks; they
  do not touch this change and were not investigated further.

### Remaining limits

- 349 English-fallback keys remain in ar/he by task decision; on the Sessions page
  this still shows `Keep tracked sessions in their project group` and
  `Move sessions into work automatically` in English.
- The per-session warming section (`/api/session-warming`) answered 404 on this tip,
  a documented task 21 gap. The combined branch below removes that feature, so the
  `Prompt cache` heading no longer renders.
- A Settings project whose directory has been deleted still makes the warming row
  report a read failure (now in the user's language) instead of saying the workspace
  is unavailable. The read runs once per directory and runtime, so the row keeps the
  error until the Settings page points at a different, authorized directory or the
  runtime reconnects; there is no retry.

## Rebase onto task 21 and the Runtime status dialog (2026-10-29)

Branch `upstream-refresh/fix-ar-he` rebased onto the integration tip
`8ee84af280` (task 21). The rebase applied cleanly: none of the four branch
commits conflicted with `c4ce06dc0f..8ee84af280`.

### What task 21 left untranslated

`git diff c4ce06dc0f..8ee84af280 -- packages/ui/src/lib/i18n/messages/` shows
four new `runtimeStatusDialog.*` keys in each of the twelve maintained locales,
plus `overview.error.loadFailed` in all fourteen — including ar and he, so that
one needed nothing. The rest of the dialog (`title`, `description`,
`actions.copy`, the copy toasts, the empty state) and the command palette entry
that opens it were never translated either, so an Arabic or Hebrew UI opened a
fully English dialog around the new action.

Translated into ar and he: the four keys task 21 added, the eight surrounding
`runtimeStatusDialog.*` keys, and `commandPalette.item.showRuntimeStatus` — 13
keys per locale, placed with the same meaning as `en`. Engine references stay
`Agent Service`; diagnostics reuse the About dialog's wording
(`بيانات التشخيص` / `נתוני אבחון`). ar/he now hold 8,739 of the 9,088 English
keys. The two-language placeholder check is unchanged (the one known exception,
`sessions.sidebar.draft.attachmentsSingle`, drops `{count}` on purpose because
the singular needs no number).

### Real path

Dev server on `127.0.0.1:3750/3751`, isolated data dir under the artifact
directory, provider variables from `~/.config/ohpichamber/omp-m0-provider.env`,
Arabic locale. Headless Chrome (`chrome-devtools start --headless=true`,
`emulate <page> --viewport "1280x800"`).

- Command palette (`Ctrl+P`) lists `إظهار حالة التشغيل`; opening it shows the
  dialog `حالة التشغيل` / `اعرض جاهزية المضيف و Agent Service والتشخيصات الحالية.`
  with `تنزيل بيانات التشخيص` and `نسخ`, `dir=rtl`, dialog right edge 976 and the
  action row on the dialog's left (trailing) edge. The diagnostics body below it
  is generated status text (timestamps, URLs, HTTP codes) and stays as it is.
- `screenshots/08-arabic-runtime-status.png` holds the Arabic dialog;
  `screenshots/08-arabic-runtime-status.txt` holds its DOM text and direction.
- The same flow in Hebrew renders `מצב סביבת ההרצה`, `הורדת נתוני אבחון`, `העתק`.

### Validation

- `bun run type-check`: exit 0 (`logs/rebase-type-check.log`)
- `bun run lint`: exit 0, the same three pre-existing react-hooks warnings
  (`logs/rebase-lint.log`)
- focused tests `bun test src/lib/i18n src/components/sections/openchamber/DefaultsSettings.test.tsx src/components/layout/HeaderSessionArchiveMenuItem.test.tsx src/components/ui`:
  exit 0, 152 tests / 59 files (`logs/rebase-focused-i18n-tests.log`)
- `bunx oxlint -c oxlint.anti-slop.config.ts` over `ar.ts`, `he.ts`,
  `messages.test.ts`, `Header.tsx`: exit 1 from the 21 pre-existing `Header.tsx`
  findings, none on the two lines this branch changes and none in the catalogs or
  the test (`logs/rebase-oxlint.log`)


## Diagnostics text under RTL (2026-10-29)

The Arabic Runtime status dialog rendered its generated status body inside a
`<pre>` that inherited `dir=rtl`, so the bidi algorithm reordered neutral
characters: `Log files:` displayed as `:Log files`, a leading `-` moved to the
end of its line, `(api=/api/)` flipped its parentheses, and every line was
right-aligned. Generated status text is shown to users, so it must read LTR.

### Fixed here

- `components/ui/RuntimeStatusDialog.tsx`: the status body now carries
  `dir="ltr"` and logical `text-start`; the dialog chrome keeps following the
  document direction.
- `apps/MobileConnectionDebugPanel.tsx`: the connection debug trail is the same
  kind of generated Latin text on a hidden diagnostics surface; same fix.
- `components/ui/RuntimeStatusDialog.test.tsx`: asserts the body's `dir` is
  `ltr` while the document and dialog shell stay RTL.

### Surveyed, already correct or not a text block

- Markdown code blocks (`MarkdownCode` via `CodeBlockContainer`),
  `MarkdownMermaid`, `FrontmatterProperties`, `WorkflowsPanel`,
  `WorkflowAnswerBlock` and two blocks in `UserTextPart` already set
  `dir="ltr"`.
- The terminal (`components/terminal/TerminalViewport`) renders through the
  libghostty canvas surface, so bidi does not reorder its output.
- `AboutDialog` only copies diagnostics to the clipboard; it renders no text
  block.

### Surveyed, same defect, not fixed in this task

- `chat/message/parts/PlainDiffFallback.tsx` — plain patch text.
- `chat/BackgroundShellsStrip.tsx` — shell command in the row tooltip.
- `chat/message/parts/ToolPart.tsx` — shell tool input text.
- `chat/PermissionCard.tsx` — permission details JSON.
- `chat/message/parts/GeneratedJsonResultCard.tsx` — JSON tool result.
- `chat/ErrorResponseDetails.tsx` — error payload body.
- `chat/ChatErrorBoundary.tsx` and `ui/ErrorBoundary.tsx` — component stacks.
- `session/spaces/SpaceSetupOutput.tsx` — space setup command output.
- `sections/remote-instances/RemoteInstancesPage.tsx` — remote output block.
- `chat/message/parts/UserTextPart.tsx:337` — pasted context text.

### Real path

Headless Chrome, dev server on `127.0.0.1:3750/3751`, Arabic locale,
1280x800. `screenshots/09-arabic-runtime-status-ltr-body.png` shows the dialog;
`screenshots/09-arabic-runtime-status-ltr-body.txt` records the document
`dir=rtl`, dialog computed direction `rtl`, the body's `dir` attribute `ltr`,
computed direction `ltr`, `text-align: start`, and span rects proving the body
starts at the left edge of its padding box (`Log files:` x=341, `- Host
console:` x=341, pre x=325).

### Validation

- `bun run type-check`: exit 0 (`logs/rtl-pre-type-check.log`)
- `bun run lint`: exit 0 (`logs/rtl-pre-lint.log`)
- focused tests `bun test src/lib/i18n src/components/ui src/components/sections/openchamber/DefaultsSettings.test.tsx src/components/layout/HeaderSessionArchiveMenuItem.test.tsx`:
  exit 0, 153 tests / 60 files (`logs/rtl-pre-focused-tests.log`); the new test
  alone is `logs/rtl-pre-test.log`
- `bunx oxlint -c oxlint.anti-slop.config.ts` over `RuntimeStatusDialog.tsx`,
  `MobileConnectionDebugPanel.tsx`, `RuntimeStatusDialog.test.tsx`: exit 0
  (`logs/rtl-pre-oxlint.log`)
- A run that also included `src/apps` failed on 78 mobile gesture tests in this
  environment (edge swipe, host-switch); those suites are unrelated to this
  change and were not investigated.

## Combined follow-up branch: ar/he plus the warming removal (2026-10-30)

Branch `upstream-refresh/ar-he-warming-linear`, worktree
`upstream-refresh-ar-he-warming-linear`, built linearly on the integration tip
`43dcd6ffc1`. It carries the ar/he follow-up (`upstream-refresh/fix-ar-he`) and
the per-session warming removal (`upstream-refresh/21-warming`) so either can
land without landing the other into a conflicted tree. Both source branches and
the merge-based reference branch below are kept.

### How it was built

`git cherry-pick` of the fifteen local follow-up commits in their existing
order — the eight from `fix-ar-he`, then the seven from `21-warming` — onto
`43dcd6ffc1`. No merge commits, so the history stays linear as
`.workflow/merge-strategy.md` requires. The upstream range was not involved.

Two commits conflicted and were resolved the same way in both attempts:

- `refactor(warming): remove upstream's per-session warming`: four catalog files.
  Kept this branch's translation of `settings.openchamber.defaults.field.sessionWarmingInfo`
  (the English sentence it translates is unchanged by the removal), and took the
  removal's side for the retired per-session block.
- `docs(workflow): record the per-session warming deletion…`: `.workflow/technical-debt.md`.
  Kept both appended entries — integration's "Host tool errors collapse to
  SERVICE_UNAVAILABLE" first, then "Per-session warming has no Agent Service
  implementation".

One follow-up commit, `fix(i18n): drop the retired per-session warming key from
ar/he`, removes `settings.openchamber.defaults.sessionWarming.label`. The ar/he
branch had added it for the retired Settings field; the removal never saw it
because it did not exist in that branch's base, so it survived the pick and
would have broken key parity.

### The merge-based reference branch

`upstream-refresh/ar-he-warming` (worktree `upstream-refresh-ar-he-warming`) was
built first with two `--no-ff` merges and the identical resolutions. It is kept
only as a resolution reference: at the code boundary, `git diff
upstream-refresh/ar-he-warming ada837a5e1` (the linear branch's last non-doc
commit) is empty, so the linear branch carries exactly that tree, task records
included. This record commit is the only later difference.

### Post-merge state

- Catalogs: en 9,064 keys; ar and he 8,715 each; 0 keys in ar/he that en lacks;
  349 English-fallback keys per locale; 0 ar/he values naming OpenCode on a key
  whose English does not; no `{placeholder}` drift beyond the intentional
  `sessions.sidebar.draft.attachmentsSingle` singular.
- The retired namespace is gone from every locale: no
  `settings.openchamber.defaults.sessionWarming.*`, `promptCacheTitle`,
  `sessions.warming.toggleFailed`, `chat.workStatus.warming.*`,
  `sessions.sidebar.session.menu(.Hint).keepWarm/stopWarm`, and no
  `session-warming.i18n.ts` import anywhere.
- The supported workspace warming copy survives and is translated in ar/he:
  `settings.openchamber.defaults.field.sessionWarming`,
  `…field.sessionWarmingInfo`, and all eleven `…warming.*` keys.

### Checks on the combined branch

- `bun run type-check`: exit 0 (`logs/combined-linear-type-check.log`)
- `bun run lint`: exit 0, the same three pre-existing react-hooks warnings
  (`logs/combined-linear-lint.log`)
- UI focused `bun test src/lib/i18n src/components/ui
  src/components/sections/openchamber/DefaultsSettings.test.tsx
  src/components/layout/HeaderSessionArchiveMenuItem.test.tsx`: exit 0,
  152 tests / 59 files (`logs/combined-linear-ui-focused-tests.log`)
- Web focused `bunx vitest run lib/host/settings-helpers.test.js`: exit 0,
  59 tests (`logs/combined-linear-web-focused-tests.log`)
- `bunx oxlint -c oxlint.anti-slop.config.ts` over the changed UI and server
  files: exit 1 from the findings the file already carries. Two of them land on
  lines the warming removal added (`settings-helpers.js:1107`, `:1116`, both a
  `typeof` guard in the same style as every other branch of that sanitizer); the
  rest predate this branch. Nothing was rewritten here because the code is not
  this branch's and the file's convention is uniform
  (`logs/combined-linear-oxlint.log`).
- `bun run dead-code`: exit 1 (baseline finding count); versus the pinned
  integration-tip baseline it reports no new file, and two disappear —
  `WorkStatusWarmingToggle.tsx` (deleted with the feature) and
  `project-knowledge.js` (adopted by integration after that baseline was taken)
  (`logs/combined-linear-dead-code.log`, `logs/combined-linear-dead-code.diff`).

### Held for the heavy slot

No dev server, app build or root test ran here; task 19 owns that slot. When it
frees: the Arabic/Hebrew real path (Sessions warming row, Runtime status dialog,
one Arabic chat) and `bun run test` at this tip.
