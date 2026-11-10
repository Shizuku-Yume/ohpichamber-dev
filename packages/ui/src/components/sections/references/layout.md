# Settings Layout

The public primitives and class constants below come from
`packages/ui/src/components/sections/shared/SettingsSection.tsx` and
`SettingsPageLayout.tsx`. Import their public exports; use heading components
instead of reaching into their private classes or declaring local equivalents.

## Page Skeleton

```tsx
<SettingsPageLayout
  title={t('settings.page.x.title')}
  namedBySidebar
  showSaveStatus
>
  <SettingsSection title={t('...sectionA')} divider={false}>…</SettingsSection>
  <SettingsSection title={t('...sectionB')}>…</SettingsSection>
</SettingsPageLayout>
```

<<<<<<< HEAD:packages/ui/src/components/sections/references/layout.md
- `SettingsPageLayout` owns scrolling, page padding and the `@container` context. Enable its quiet indicator (`showSaveStatus`) only for the ordinary persistence flow described in [save feedback](../PATTERNS.md#save-feedback); the [OpenCode config autosave pages](../DOCUMENTATION.md#autosave-on-the-opencode-configuration-pages) use failure toasts and no indicator.
=======
- `SettingsPageLayout` owns scrolling, page padding, the `@container` context, and the quiet save indicator (`showSaveStatus`).
- A page opened from the settings sidebar passes `namedBySidebar` and no `description`: the sidebar already names it, so the title stays only for screen readers and focus, and only `headerEnd` actions show. A detail page (one agent, provider, server) keeps its visible title. A line the user must read (a consequence, a warning) goes into the content, not the page description.
>>>>>>> bc50ba56a:.agents/skills/settings-ui-patterns/references/layout.md
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
`@3xl:` (48rem) — never viewport `sm:`/`lg:`. `SettingsPageLayout` provides
the `@container` scope; `SettingsFieldRow`, `SettingsTwoColumn`, and the
trigger-width constants already carry the right variants.

Exception: `SettingsView` navigation chrome (outside the pane) uses viewport
`sm:` to give phones 44px touch rows and plain `bg-background`; keep that
pattern when touching nav.

## Spacing

- Sections own vertical rhythm: divider + `py-8` come from `SettingsSection`.
- Fields inside a column: `SETTINGS_FIELDS_STACK_CLASS` (`space-y-4`).
- Checkbox/radio lists: `SETTINGS_OPTION_STACK_CLASS` (`space-y-1.5`).
- Groups requiring a title and visible description: separate them from preceding controls with `space-y-6` on the parent. Keep simple checkbox/radio lists compact. The title sits closer to its own description and controls than to the preceding group; use `SettingsControlGroup`'s internal spacing.
- Two-column areas: `SettingsTwoColumn` (`@3xl:grid-cols-2`); use `SettingsStackedField` inside cells (a `SettingsFieldRow` overflows half-width columns).
- No elevated backgrounds, rounded rows, or hover fills without explicit UX value.
