import React from 'react';
import type { FileContents } from '@pierre/diffs';
import { ensurePierreThemeRegistered } from '@/lib/shiki/appThemeRegistry';
import type { Theme } from '@/types/theme';

export function getFilePreviewTheme(light: Theme, dark: Theme) {
  return { light: ensurePierreThemeRegistered(light), dark: ensurePierreThemeRegistered(dark) };
}

export function useFilePreviewDescriptor({ name, contents, lang, header, cacheKey }: FileContents) {
  // Pierre compares the prepared layout and rendered file by object identity.
  return React.useMemo(() => ({ name, contents, lang, header, cacheKey }), [name, contents, lang, header, cacheKey]);
}
