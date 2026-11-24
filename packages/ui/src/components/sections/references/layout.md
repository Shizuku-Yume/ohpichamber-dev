# Settings Layout

The public primitives and class constants below come from
`packages/ui/src/components/sections/shared/SettingsSection.tsx` and
`SettingsPageLayout.tsx`. Import their public exports; use heading components
instead of reaching into their private classes or declaring local equivalents.

## Page Skeleton

```tsx
<SettingsPageLayout
  title={t('settings.page.x.title')}
  description={t('settings.page.x.description')}
  showSaveStatus
>
  <SettingsSection title={t('...sectionA')} divider={false}>…</SettingsSection>
  <SettingsSection title={t('...sectionB')}>…</SettingsSection>
</SettingsPageLayout>
```

- `SettingsPageLayout` owns scrolling, page padding, the `@container` context, the `max-w-[840px]` page cap, and the quiet save indicator (`showSaveStatus`). It takes no padding utility of its own (`px-6 py-6 @3xl:px-12 @3xl:py-8` is the page's inset). The entity editors use the autosave contract instead ([save feedback](../PATTERNS.md#save-feedback)).
- Every settings page renders its title and description, matching the v2.7.0 release and the fork's own pages. A detail page (one agent, provider, server) keeps its visible title. A line the user must read (a consequence, a warning) goes into the content, not the page description.
- Sections separate with a top border (`divider`, default true); the first section under the page header passes `divider={false}`.
- Section titles are real headers (L2). Do not nest an umbrella section around a list of `SettingsControlGroup`s when each group deserves its own header — promote groups to sections instead (see the Chat page precedent).

The skeleton above is for ordinary settings. Omit `showSaveStatus` on OpenCode configuration autosave pages and use their owning hook contract instead.

## Hierarchy Levels

| Level | Component / class | Use |
|---|---|---|
| L1 | `SETTINGS_PAGE_TITLE_CLASS` (via `SettingsPageLayout`) | Page title |
| L2 | `SettingsSection` title (`SETTINGS_SECTION_TITLE_CLASS`) | Section |
| L3 | `SettingsGroupTitle` (also rendered by `SettingsControlGroup` for its title) | Sub-cluster inside a section |
| L4 | `SETTINGS_FIELD_LABEL_CLASS` | Field / control labels |
| Helper | `SETTINGS_HELPER_CLASS`, `SETTINGS_DESCRIPTION_CLASS` | Rare visible helper text (most goes behind `info`; see the [description policy](../PATTERNS.md#description-policy-info-hints)) |

## Navigation Placement

Sidebar groups are defined in `packages/ui/src/lib/settings/metadata.ts`; `pageOrder` in `SettingsView.tsx` sets their order.

Placement rules:

- **General** hosts app-level settings that don't belong to a feature page: startup/tray/window, network access + UI password, passkeys, terminal shell/navigation, message stream transport, privacy.
- Feature pages (Appearance, Chat, Sessions…) keep only settings about that feature. If a setting reads awkwardly on its page, move it to General rather than inventing a new page.
- New pages need metadata, `pageOrder`, nav icon, `settings.page.<slug>.title/description` in every locale, and mobile whitelist (`MOBILE_SETTINGS_PAGES` in `MobileApp.tsx`) when relevant.

## Responsiveness: Container Queries

The settings pane is far narrower than the viewport (3-pane dialog). All
pane content responds to the pane via container queries — `@xl:` (36rem) and
`@3xl:` (48rem) — never viewport `sm:`/`md:`/`lg:`/`xl:`/`2xl:`. `SettingsPageLayout`
provides the `@container` scope; `SettingsFieldRow`, `SettingsTwoColumn`,
`SettingsSection`, and the width constants already carry the right variants,
so a page adds no breakpoint of its own. A viewport breakpoint in pane
content sizes against the window and breaks inside the dialog.

Exception: `SettingsView` navigation chrome (outside the pane) uses viewport
`sm:` to give phones 44px touch rows and plain `bg-background`; keep that
pattern when touching nav.

Dialogs size to the window, so a `Dialog`/`AlertDialog` body may use viewport
breakpoints; its control widths still follow the row rules. A hover-only
opacity affordance (`md:group-hover:opacity-100`) is desktop pointer
behaviour, not a pane width, and also passes. The layout guard describes both
in [layout guard](#layout-guard).

## Rows

One row pattern covers Settings, whatever the control:

- `SettingsFieldRow` — label in a fixed `@xl:w-56` column; the control column
  is `flex-1` and packs its content to the trailing edge (`alignEnd`, default
  true). Below `@xl` the row stacks to label above control, so a narrow pane
  never overflows. This is the default for every control row.
- `SettingsStackedField` — only inside `SettingsTwoColumn` cells and for
  controls too wide for the row's control column. A `SettingsFieldRow`
  overflows a half-width cell.
- `SettingsCheckboxRow` — booleans and independent on/off options.
- `SettingsDisclosure` — a flat list item that expands into an editor. One ghost
  toggle header (chevron, name, optional quiet summary) with an optional
  `accessory` beside it, and the editor renders only while expanded. No card
  or divide/border chrome; the rows' own padding sets their rhythm.
- `OmpRowControl` — one OMP registry row per primitive: numbers, strings and
  enums render as field rows; booleans render as checkbox rows.

## Widths

Controls take their width from these named classes. A settings control
carries no raw width utility of its own: the guard rejects `w-48`, `w-[…]`,
`w-fit`, `max-w-md`, `min-w-[1rem]` and their variants on a control's
`className`, and in any `controlClassName`, `containerClassName` or
`triggerClassName`. `w-full`, `min-w-0`, `max-w-none` and `max-w-full`
express fill or shrink and stay allowed.

| Control | Class | Value |
|---|---|---|
| Select trigger in a field row | `SETTINGS_WIDTH_SELECT_CLASS` | `w-fit min-w-[8ch] max-w-[28ch]` |
| Short text input (name, id, path) | `SETTINGS_WIDTH_SHORT_TEXT_CLASS` | `w-full @xl:w-56` |
| Textarea, long text, stacked control cluster | `SETTINGS_WIDTH_LONG_TEXT_CLASS` | `w-full max-w-[24rem]` |
| `NumberInput` stepper input | `SETTINGS_WIDTH_NUMBER_CLASS` inside `SETTINGS_NUMBER_STEPPER_ROW_CLASS` | `typography-ui-label w-[calc(5.75rem+5ch)]` |
| Select trigger in a stacked cell or dialog | `SETTINGS_SELECT_TRIGGER_CLASS` | `w-fit max-w-[28ch]` |
| Custom dropdown trigger (ModelSelector, AgentSelector) | `SETTINGS_CUSTOM_TRIGGER_CLASS` | `dropdownTriggerVariants()` + hug |

A row select hugs its value between `8ch` and `28ch` while `SettingsFieldRow`
packs controls to the trailing edge (`@xl:justify-end`), so selects and other
controls share one right edge without stretching short labels into wide empty
bars; short text inputs keep `w-full @xl:w-56`. The number stepper keeps its own
font-relative width and never grows; its unit label uses
`SETTINGS_NUMBER_UNIT_CLASS`. A control that must fill the whole row passes
`controlClassName` from the call site; a dialog textarea uses the documented
opt-out in [control sizing](controls.md#standard-sizes-and-widths).

## Spacing

Sections own vertical rhythm; pages only list them.

- Between sections: `SettingsSection`'s top border and `py-8`. Never wrap
  sections in a non-zero `space-y-*` on a page: it doubles the gap and
  bypasses `SettingsPageLayout`'s first-section rule. `space-y-0` is the
  allowed "no extra spacing" spelling.
- Between titled groups inside one section's content: `space-y-6`.
- Field rows and mixed shapes (a field row beside a checkbox row, a role
  editor beside OMP rows): `SETTINGS_SPACE_ROW_CLASS` (`space-y-4`). A plain
  list of field rows stacks directly; each row carries `py-1`.
- Pure checkbox and radio lists: `SETTINGS_SPACE_CHECKBOX_CLASS`
  (`space-y-1.5`), already applied inside `SettingsRadioGroup`.
- `SettingsControlGroup` owns the spacing of its title, description and
  controls (`space-y-2`). Space the group itself with the stack class that
  matches its neighbours; its `contentClassName` takes no `space-y-*` of its
  own.
- Two-column areas: `SettingsTwoColumn` (`@3xl:grid-cols-2`), fields inside
  as `SettingsStackedField`.
- No elevated backgrounds, rounded rows, or hover fills without explicit UX
  value.

## Layout Guard

`packages/ui/src/components/sections/settingsLayoutGuard.test.ts` scans the
TSX under `components/sections` and the settings-pane views rendered outside it
(`views/usage/UsageStatsView.tsx`, `views/PreviewToggleButton.tsx`,
`views/git/GitOperationStatus.tsx`, `update/ReleaseNotesBody.tsx`) and reports
the offending `file:line` for:
- W — a raw width utility (`w-48`, `w-[…]`, `w-fit`, `max-w-md`,
  `min-w-[1rem]`, with or without a variant prefix) on a settings control
  (`Input`, `Textarea`, `NumberInput`, `Select`/`SelectTrigger`, the
  model/agent/project pickers, `SettingsColorField`) or in a
  `controlClassName`, `containerClassName` or `triggerClassName`. `w-full`,
  `min-w-0`, `max-w-none` and `max-w-full` pass: they say fill, shrink, or
  stay in the column.
- S — a non-zero `space-y-*` on a wrapper with `SettingsSection` among its
  direct children. `space-y-0` is the allowed "no extra spacing" spelling.
- P — any padding utility on `SettingsPageLayout`.
- B — a viewport breakpoint (`sm:`–`2xl:`) in pane content. Exempt: elements
  inside a `Dialog`/`AlertDialog` body, values whose every viewport prefix is
  a hover-only opacity affordance (`md:group-hover:opacity-100`), and the
  sidebar/navigation files and project-settings dialog shell in the guard's
  file exception list.
- N — `SETTINGS_WIDTH_NUMBER_CLASS` outside a `SETTINGS_NUMBER_STEPPER_ROW_CLASS`
  row.
- G — margin, non-zero `gap-*` and non-zero `space-x-*`/`space-y-*` on a
  settings control or on `SettingsFieldRow`/`SettingsStackedField`/`SettingsCheckboxRow`
  (`className` and `controlClassName`), plus non-zero `space-y-*` in a
  `SettingsSection` or `SettingsControlGroup` `contentClassName`. Zero
  values (`m-0`, `gap-0`, `space-y-0`) pass, and a generic `div` wrapper may
  carry its own gap.

- F — a lowercase `<input>`, `<button>`, `<select>`, `<textarea>` or `<form>`
  where a shared `Input`/`Button`/`Select`/`Textarea`/disclosure primitive
  belongs. Exempt per file: hidden `type="file"`/`type="color"` pickers and
  `type="range"` sliders (no shared primitive), bespoke entity-selection
  sidebar rows and picker/disclosure toggles (no shared list-item primitive),
  and explicit non-autosave submit `<form>`s. An `input` exemption is further
  narrowed to the declared `type` so a raw text input in the same file still
  fails.
- M — on an autosave page (`useAutosave`/`useOmpPageSettings`/
  `reportSettingsSaveState`) a manual Save/Apply `Button` (matched within the
  element's own slice, including `t('common.save')`-style or literal Save/Apply
  labels) or a `toast.success` (matched within its own call slice) reintroduces
  the save chrome the contract removed: saves are silent and only failures
  toast. Exempt per file: entity/credential lifecycle toasts (create/connect/
  delete/install/import) matched by their i18n key, and explicit draft-buffer
  saves such as the plugins Apply or the MCP key/value env-header commit.
- T — a `SettingsFieldRow`/`SettingsCheckboxRow` `label` bound to a bare
  identifier, a hardcoded literal, a non-`t()` helper, or JSX containing
  hardcoded text instead of a word-boundary `t(...)` call. Exempt per file:
  labels resolved from a `t()` alias, a deliberately unlabeled continuation row
  (`label={null}`), and dynamic model/entity keys (role names, tool names,
  tracker teams, modality enums, user-named passkeys, caller-supplied `item.label`).
- X — box chrome (`border`, `rounded-*`, `bg-surface-*`, `oc-tile`) on a
  container tag that wraps a flat row primitive (including
  `SettingsDisclosure`), or a `p-*` padding utility on a row/control primitive
  whose own band owns the inset. Chrome inside a `SettingsCard` grid or a
  status callout, and on non-container tags, passes.
- A — search-index and `data-settings-item` anchor parity (enforced by
  `packages/ui/src/components/sections/settingsSearchAnchors.test.ts`; see
  [search](search.md#required-integration)): every static `settingsItem`/
  `data-settings-item` anchor is indexed or allowlisted, every `SETTINGS_SEARCH_ITEMS`
  entry (including `omp.<id>` rows) resolves to its owning page's anchor or
  OMP page placement, and synthetic probes reject unindexed anchors, wrong-page
  items, and unanchored entries.
File exceptions stay narrow: sidebar/navigation chrome (the Responsiveness
exception above), the project settings dialog shell, and two shared editors
that are not settings field rows (`SettingsColorField` for widths,
`EnvironmentVariablesEditor` for widths). `shared/SettingsSection.tsx` is
excluded because it defines the vocabulary. F/M/T/X exemptions are keyed
per file (and, for `input`s, per `type`/`key`) so a new violation beside a
documented one still fails; every entry carries a `reason`.
