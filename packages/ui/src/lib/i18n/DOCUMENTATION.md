<<<<<<< HEAD
# Internationalization (i18n) & RTL Architecture

## Overview

The i18n subsystem in `@openchamber/ui` manages localized message strings and layout direction across 15 supported locales, including right-to-left (RTL) Arabic (`ar`) and Hebrew (`he`).

## Core Invariants

1. **Direction Authority**: `getLocaleDirection(locale)` is the single authority for UI direction (`'rtl'` for `'ar'` and `'he'`, `'ltr'` for all others). `I18nProvider` sets `document.documentElement.dir = direction` and binds `@base-ui/react/direction-provider`.
2. **Logical Properties**: All layout styling must use logical CSS properties (`start`, `end`, `ms-`, `me-`, `ps-`, `pe-`, `inset-inline-start`, etc.) rather than physical sides (`left`, `right`, `pl-`, `pr-`, `ml-`, `mr-`). Physical sides are reserved for fixed hardware/window chrome controls.
3. **Reactive Text Resolution**: UI strings are resolved dynamically within React components via `useI18n()` (`const { t, direction, locale } = useI18n()`). Do not resolve translations at module scope.
4. **Fallback Chain**: `formatMessage(dictionary, key, params)` looks up keys in `dictionary[key]`, then falls back to `enDict[key]`, then returns the literal `key`.
5. **Dictionary Code Splitting**: The default English dictionary is bundled synchronously; non-English locales are loaded on demand via `useI18nStore.setLocale(locale)`.
||||||| bc50ba56aa
=======
# Locale runtime and text direction

## Ownership

This module owns locale selection, message formatting, locale loading and shared direction helpers. Message catalogs own translated strings; components own the layout that consumes the current direction.

## Invariants

- The active locale sets document direction and the Base UI direction provider because menus and sliders read provider state independently of the document. Physical OS window controls retain their edge through logical mapping.
- Element direction reads the nearest explicit `dir` attribute so older WebKit can use the same contract without unsupported selector syntax. Retired Hebrew locale `iw` normalizes to the supported locale, and host language applies before a user choice.
- Inserted string values use Unicode first-strong isolation only where RTL text and letters require it, preventing reordering without adding invisible characters to ordinary LTR or numeric values. Numbers retain numeric formatting behavior instead of string isolation.
- Prose direction counts words instead of letters so long quoted Latin terms do not override RTL prose; ties favor RTL, and inline code and URLs do not count. This avoids first-letter direction errors for paragraphs beginning with a product name.
- Numeric display uses Western digits alongside code, token counts and identifiers.
>>>>>>> upstream/main
