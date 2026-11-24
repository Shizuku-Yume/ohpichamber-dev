import { expect, test } from 'bun:test';
import type { Model } from '@openchamber/agent-contract';
import { dict as en } from '@/lib/i18n/messages/en';
import { dict as zhCn } from '@/lib/i18n/messages/zh-CN';
import type { I18nKey } from '@/lib/i18n';
import { formatRoleDisplayValue, replaceFirstSelector, roleSelector } from './modelRoleSelectors';

const makeTranslate = (dict: Readonly<Record<string, string>>) => (key: I18nKey): string =>
  dict[key] ?? key;

const catalog: readonly Model[] = [
  {
    provider: 'CLIProxyAPI',
    modelId: 'devin-swe-2',
    name: 'Devin SWE-2',
    modalities: ['text'],
    contextWindow: 200000,
    maxOutputTokens: 32000,
    reasoningEffortSupported: true,
    reasoningOptions: [
      { reasoningEffort: 'high', label: 'High', budgetTokens: 16000 },
      { reasoningEffort: 'max', label: 'Max', budgetTokens: 32000 },
    ],
    variants: [],
    pricing: null,
  },
  {
    provider: 'CLIProxyAPI',
    modelId: 'glm-4.7:max',
    name: 'GLM 4.7 Max',
    modalities: ['text'],
    contextWindow: 128000,
    maxOutputTokens: 8192,
    reasoningEffortSupported: false,
    reasoningOptions: [],
    variants: [],
    pricing: null,
  },
];

test('replacing the primary selector preserves the configured fallback list verbatim', () => {
  const configured = 'first/old:low, @smol, backup/latest';
  expect(roleSelector(configured)).toBe('first/old:low');
  expect(replaceFirstSelector(configured, 'first/new')).toBe('first/new, @smol, backup/latest');
  expect(replaceFirstSelector(null, 'first/new')).toBe('first/new');
});

test('formatRoleDisplayValue resolves catalog model name and localized effort label', () => {
  const tEn = makeTranslate(en);
  const tZh = makeTranslate(zhCn);

  expect(formatRoleDisplayValue('CLIProxyAPI/devin-swe-2:max', catalog, tEn)).toBe('Devin SWE-2 · Max');
  expect(formatRoleDisplayValue('CLIProxyAPI/devin-swe-2:max', catalog, tZh)).toBe('Devin SWE-2 · 最高');
  expect(formatRoleDisplayValue('CLIProxyAPI/devin-swe-2', catalog, tEn)).toBe('Devin SWE-2');
  expect(formatRoleDisplayValue('CLIProxyAPI/glm-4.7:max', catalog, tEn)).toBe('GLM 4.7 Max');
});

test('formatRoleDisplayValue strips provider prefix cleanly for uncatalogued models', () => {
  const tEn = makeTranslate(en);
  const tZh = makeTranslate(zhCn);

  expect(formatRoleDisplayValue('CLIProxyAPI/foo:max', catalog, tEn)).toBe('foo · Max');
  expect(formatRoleDisplayValue('CLIProxyAPI/foo:max', catalog, tZh)).toBe('foo · 最高');
  expect(formatRoleDisplayValue('CLIProxyAPI/foo', [], tEn)).toBe('foo');
  expect(formatRoleDisplayValue('@smol', catalog, tEn)).toBe('@smol');
});

test('formatRoleDisplayValue formats comma, array, and object fallback chains with +N suffix', () => {
  const tEn = makeTranslate(en);

  expect(formatRoleDisplayValue('CLIProxyAPI/devin-swe-2:high, @smol, backup/other', catalog, tEn)).toBe('Devin SWE-2 · High +2');
  expect(formatRoleDisplayValue(['CLIProxyAPI/devin-swe-2:max', 'backup/other'], catalog, tEn)).toBe('Devin SWE-2 · Max +1');
  expect(formatRoleDisplayValue(['CLIProxyAPI/foo:low,backup/a', '@smol'], catalog, tEn)).toBe('foo · Low +2');
  expect(formatRoleDisplayValue({ selector: 'CLIProxyAPI/devin-swe-2:high' }, catalog, tEn)).toBe('Devin SWE-2 · High');
  expect(formatRoleDisplayValue('web/exa → web/tavily', catalog, tEn)).toBe('web/exa → web/tavily');
});

test('formatRoleDisplayValue returns localized inherit fallback when unset', () => {
  const tEn = makeTranslate(en);
  const tZh = makeTranslate(zhCn);

  expect(formatRoleDisplayValue(undefined, catalog, tEn)).toBe(en['settings.omp.modelRoles.inheritFallback']);
  expect(formatRoleDisplayValue(null, catalog, tEn)).toBe(en['settings.omp.modelRoles.inheritFallback']);
  expect(formatRoleDisplayValue('', catalog, tEn)).toBe(en['settings.omp.modelRoles.inheritFallback']);
  expect(formatRoleDisplayValue([], catalog, tZh)).toBe(zhCn['settings.omp.modelRoles.inheritFallback']);
  expect(formatRoleDisplayValue({}, catalog, tEn)).toBe(en['settings.omp.modelRoles.inheritFallback']);
});
