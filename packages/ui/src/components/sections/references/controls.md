# Settings Controls

Button/icon/color contracts belong to [UI styling](../../../lib/theme/STYLING.md);
visible and accessible strings follow the existing [localization contract](../../../../../../.agents/skills/locale-ui-patterns/SKILL.md).
All primitives/constants come from
`packages/ui/src/components/sections/shared/SettingsSection.tsx` (+ `SettingsInfoHint.tsx`).

## Standard Sizes And Widths

Use the shared control class constants; every desktop dropdown footprint is
`h-7` in `components/ui/dropdown-trigger.ts`:

- `SelectTrigger`: no size prop — its chrome comes from `dropdownTriggerVariants()`.
- Custom dropdown triggers (ModelSelector / AgentSelector): `SETTINGS_CUSTOM_TRIGGER_CLASS`.
- Text `Input` and `NumberInput`: inside settings pages (`SettingsPageLayout` `[data-settings-page]`), desktop inputs and stepper clusters share the `h-7` (`28 px`) dropdown-trigger footprint automatically; elsewhere (toolbars, dialogs), pass `inputSize="compact"` when an `Input` sits next to dropdowns.
- Icon action next to a control: `SETTINGS_ICON_BUTTON_CLASS` (`h-7 w-7`) in a settings page; `SETTINGS_DIALOG_ICON_BUTTON_CLASS` (`h-8 w-8`) in a dialog, matching its `Input` default.
Widths come from the named classes — never let controls span the pane, and
give an individual control no raw width utility of its own. `w-full`,
`min-w-0`, `max-w-none` and `max-w-full` are the allowed fill/shrink tokens,
so genuinely full-width content (dialog textareas) opts out with
`controlClassName="w-full max-w-none"`. [Widths](layout.md#widths) owns the
class-per-control table and [layout guard](layout.md#layout-guard) lists the
rejected utilities.

## Field Rows

```tsx
<SettingsFieldRow
  label={t('...label')}
  info={t('...hint')}                 // helper text behind the info icon
  settingsItem="page.some-setting"
>
  <Select …>
    <SelectTrigger className={SETTINGS_WIDTH_SELECT_CLASS} aria-label={t('...aria')}>…
```

Use `SettingsStackedField` (label above control) inside `SettingsTwoColumn`
cells or when the control is wide; same `info` / `settingsItem` props.
[Rows](layout.md#rows) owns the row shapes and their container-query
fallback.

## Boolean

For a self-explanatory enable/disable setting, use only a checkbox and label;
no separate group title or description is needed.

```tsx
<SettingsCheckboxRow
  checked={value}
  onChange={setValue}
  label={t('...label')}
  ariaLabel={t('...aria')}
  info={t('...explanation')}          // optional; see Description Policy
  settingsItem="page.some-setting"
/>
```

Row click + keyboard toggling are built in. A visible `description` is only
for text that must stay visible (warnings, dynamic status).

## Mutually Exclusive Options

Use radios for mutually exclusive modes, not independent checkboxes. Keep
self-explanatory choices compact; a title or description is not mandatory.

When the [description policy](../PATTERNS.md#description-policy-info-hints) calls for a visible explanation, wrap
the controls in `SettingsControlGroup`: title, description, then options.
Explain the choice once at group level. Use checkbox rows for independent
choices and radio options for mutually exclusive choices. Group spacing is
defined in [layout](layout.md#spacing).

```tsx
<SettingsControlGroup title={t('...group')} description={t('...description')}>
  <SettingsRadioGroup aria-label={t('...group')}>
    <SettingsRadioOption selected={…} onSelect={…} label={t('...')} ariaLabel={t('...')} />
  </SettingsRadioGroup>
</SettingsControlGroup>
```

Skip per-option descriptions when labels are self-explanatory. For short
segmented choices use `SettingsChipGroup` (chips with `aria-pressed`).

## Numeric Value / Override

`NumberInput` with `SETTINGS_WIDTH_NUMBER_CLASS` inside
`SETTINGS_NUMBER_STEPPER_ROW_CLASS`, `SETTINGS_NUMBER_UNIT_CLASS` for the
unit and an adjacent `SETTINGS_ICON_BUTTON_CLASS` reset button. Never
flex-grow the stepper. Optional overrides: empty means "inherit"; provide
`fallbackValue`, `onClear`, `emptyLabel="—"`.

## Info Hints

`SettingsInfoHint` is the only info-icon implementation: it opens on hover
AND on click (touch devices have no hover), and closes on outside tap.
Prefer the `info` prop of the enclosing primitive; use the component
directly only next to raw labels/headings. Never build info icons from raw
`<Tooltip>` + `<Icon name="information">` — those don't work on mobile.

## Mobile Constraints

- `packages/ui/src/styles/mobile.css` may force `.overflow-hidden` to scroll; use explicit x/y clipping only when required.
- Touch CSS enforces minimum button height. Do not put custom segmented buttons in a container too short for them.

## Picker Rows

- Place icon/color palettes beneath their label.
- Keep option dimensions and gaps consistent.
- Use stable border/ring/background selection; avoid scale transforms that shift layout.
- A picker whose extra options come from extensions stays visible and disabled when none is installed: the row and its info hint are how users learn such extensions exist (Settings → OpenChamber Tools → Browser provider). Keep it when there is nothing to choose.

## Dialogs

Dialogs reuse the same primitives (`SettingsCheckboxRow`,
`SETTINGS_FIELD_LABEL_CLASS`, `SettingsStackedField`) and the same sizes.
Dividers between dialog form groups are acceptable; wizard step
instructions guiding an active flow stay visible (not behind info).
