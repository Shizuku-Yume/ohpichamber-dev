import { z } from 'zod';
import {
  type JsonValue,
  type Model,
  type WebSearchProviderEntry,
} from '@openchamber/agent-contract';
import {
  formatRoleDisplayValue,
  levelLabel,
  splitRoleSelector,
} from '@/components/sections/shared/modelRoleSelectors';
import type { SettingsSortableListItem } from '@/components/sections/shared/SettingsSortableList';
import { getWebSearchProviderName } from '@/components/sections/websearch/websearchProviderName';
import type { I18nKey } from '@/lib/i18n';

export const CHAIN_ROLE_OPTIONS: readonly { role: string; labelKey: I18nKey }[] = [
  { role: 'default', labelKey: 'settings.omp.modelRoles.role.default.label' },
  { role: 'smol', labelKey: 'settings.omp.modelRoles.role.smol.label' },
  { role: 'slow', labelKey: 'settings.omp.modelRoles.role.slow.label' },
  { role: 'vision', labelKey: 'settings.omp.modelRoles.role.vision.label' },
  { role: 'plan', labelKey: 'settings.omp.modelRoles.role.plan.label' },
  { role: 'commit', labelKey: 'settings.omp.modelRoles.role.commit.label' },
  { role: 'tiny', labelKey: 'settings.omp.modelRoles.role.tiny.label' },
  { role: 'memory', labelKey: 'settings.omp.modelRoles.role.memory.label' },
  { role: 'task', labelKey: 'settings.omp.modelRoles.role.task.label' },
  { role: 'advisor', labelKey: 'settings.omp.modelRoles.role.advisor.label' },
  { role: 'widget', labelKey: 'settings.omp.modelRoles.role.widget.label' },
  { role: 'judge', labelKey: 'settings.omp.modelRoles.role.judge.label' },
  { role: 'image', labelKey: 'settings.omp.modelRoles.role.image.label' },
  { role: 'speech', labelKey: 'settings.omp.modelRoles.role.speech.label' },
  { role: 'dictation', labelKey: 'settings.omp.modelRoles.role.dictation.label' },
];

export type ChainKeyKind = 'role' | 'model' | 'wildcard';
export type TargetKind = 'model' | 'wildcard';

export interface FallbackTargetItem extends SettingsSortableListItem {
  selector: string;
}

export function isChain(value: JsonValue): value is string[] {
  return z.array(z.string()).safeParse(value).success;
}

export function isValidWildcardSelector(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed) || !trimmed.endsWith('/*')) return false;
  const prefix = trimmed.slice(0, -2);
  return prefix.length > 0 && !prefix.startsWith('/') && !prefix.endsWith('/');
}

export function buildTargetItems(chain: readonly string[]): FallbackTargetItem[] {
  const counts = new Map<string, number>();
  return chain.map((selector) => {
    const occurrence = counts.get(selector) ?? 0;
    counts.set(selector, occurrence + 1);
    return {
      id: `${selector}::${occurrence}`,
      label: selector,
      selector,
    };
  });
}

export function chainKeyDisplayLabel(key: string, translate: (key: I18nKey) => string): string {
  const roleOption = CHAIN_ROLE_OPTIONS.find((option) => option.role === key);
  return roleOption ? translate(roleOption.labelKey) : key;
}

export function formatWebFallbackPreview(
  chain: readonly string[],
  models: readonly Model[],
  webProviders: readonly Pick<WebSearchProviderEntry, 'providerId' | 'name'>[],
  t: (key: I18nKey) => string,
): string {
  if (chain.length === 0) return t('settings.retryFallback.emptyChain');
  const primary = chain[0];
  const { model: modelRef, effort } = splitRoleSelector(primary, models);
  const matchedProvider = webProviders.find(
    (provider) => provider.providerId === primary || provider.providerId === modelRef,
  );
  if (matchedProvider || modelRef === 'web/hosted') {
    const providerLabel = matchedProvider
      ? getWebSearchProviderName(matchedProvider, t)
      : getWebSearchProviderName({ providerId: 'web/hosted', name: 'web/hosted' }, t);
    const effortText = effort ? levelLabel(t, effort) : '';
    const base = effortText ? `${providerLabel} · ${effortText}` : providerLabel;
    return chain.length > 1 ? `${base} +${chain.length - 1}` : base;
  }
  return formatRoleDisplayValue(chain, models, t);
}
