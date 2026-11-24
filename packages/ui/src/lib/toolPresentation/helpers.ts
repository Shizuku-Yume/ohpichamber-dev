import type { JsonObject, JsonValue } from '@openchamber/agent-contract';
import { z } from 'zod';

import { formatMessage, useI18nStore, type I18nKey, type I18nParams } from '@/lib/i18n/store';
import type { ToolGroup, ToolPresentation } from './types';

export const tt = (key: I18nKey, params?: I18nParams): string =>
    formatMessage(useI18nStore.getState().dictionary, key, params);

export const text = (value: JsonValue | undefined, max = 160): string | null => {
    const parsed = z.string().safeParse(value).data?.trim();
    if (!parsed) return null;
    const line = parsed.split('\n')[0]?.trim() ?? '';
    return line ? line.slice(0, max) : null;
};

export const inputText = (input: JsonObject, ...keys: readonly string[]): string | null => {
    for (const key of keys) {
        const value = text(input[key]);
        if (value) return value;
    }
    return null;
};

export const detailValue = (value: JsonValue | undefined, key: string): JsonValue | undefined =>
    z.record(z.string(), z.json()).safeParse(value).data?.[key];

export const detailNumber = (value: JsonValue | undefined, key: string): number | null =>
    z.number().safeParse(detailValue(value, key)).data ?? null;

export const detailText = (value: JsonValue | undefined, key: string): string | null => text(detailValue(value, key));

const counted = (value: JsonValue | undefined, amountKey: string, fileKey: string): string | null => {
    const amount = detailNumber(value, amountKey);
    const files = detailNumber(value, fileKey);
    if (amount === null && files === null) return null;
    const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
    return [amount !== null ? plural(amount, 'match', 'matches') : null, files !== null ? plural(files, 'file', 'files') : null]
        .filter(Boolean).join(' · ');
};

export const searchResultSummary = (value: JsonValue | undefined): string | null => {
    const matches = counted(value, 'matchCount', 'fileCount');
    if (matches) return matches;
    const files = detailNumber(value, 'fileCount');
    if (files !== null) return `${files} ${files === 1 ? 'file' : 'files'}`;
    const hits = z.array(z.unknown()).safeParse(detailValue(value, 'hits')).data?.length;
    if (hits !== undefined) return `${hits} ${hits === 1 ? 'hit' : 'hits'}`;
    return counted(value, 'totalReplacements', 'filesTouched');
};

export const jsonSummary: ToolPresentation['describeResult'] = (result) => {
    const root = z.record(z.string(), z.json()).safeParse(result).data;
    if (!root) return null;
    const keys = Object.keys(root);
    return keys.length > 0 ? `${keys.length} fields` : null;
};

export const queryTool = (label: string, icon: ToolPresentation['icon'], keys: readonly string[], group: ToolGroup = 'search'): ToolPresentation => ({
    label, icon, group, outputLanguage: 'text',
    describeCall: (input) => inputText(input, ...keys),
    describeResult: group === 'search' ? searchResultSummary : jsonSummary,
});

export const plainTool = (label: string, icon: ToolPresentation['icon'], keys: readonly string[] = ['action'], group: ToolGroup = 'call'): ToolPresentation => ({
    label, icon, group, outputLanguage: 'text',
    describeCall: (input) => inputText(input, ...keys),
    describeResult: () => null,
});
