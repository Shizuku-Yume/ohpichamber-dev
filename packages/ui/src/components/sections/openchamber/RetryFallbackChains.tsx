import React from 'react';
import { formatModelRef, type JsonValue, type Model } from '@openchamber/agent-contract';
import { ModelSelector } from '@/components/sections/agents/ModelSelector';
import { parseRolesRecord } from '@/components/sections/shared/modelRoleSelectors';
import {
  SettingsControlGroup,
  SettingsDisclosure,
  SettingsFieldRow,
  SettingsStackedField,
  SETTINGS_WIDTH_SELECT_CLASS,
  SETTINGS_WIDTH_SHORT_TEXT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import type { UseOmpPageSettingsResult } from '@/components/sections/shared/useOmpPageSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n';

const CHAINS = 'retry.fallbackChains';

function isChain(value: JsonValue): value is string[] {
  return Array.isArray(value) && value.every((selector) => typeof selector === 'string');
}

type ChainEditorProps = {
  rule?: { key: string; chain: string[] };
  keys: readonly string[];
  models: readonly Model[];
  directory?: string;
  disabled: boolean;
  onSave: (key: string, previous: readonly string[] | undefined, next: string[] | undefined) => Promise<boolean>;
};

function ChainEditor({ rule, keys, models, directory, disabled, onSave }: ChainEditorProps) {
  const { t } = useI18n();
  const [key, setKey] = React.useState(rule?.key ?? '');
  const [previous] = React.useState(rule?.chain);
  const [selectors, setSelectors] = React.useState(rule?.chain.join('\n') ?? '');
  const [failed, setFailed] = React.useState(false);
  const nextKey = key.trim();
  const duplicate = !rule && keys.includes(nextKey);
  const selectorLabel = t('settings.retryFallback.selectors');
  const keyLabel = t('settings.retryFallback.key');
  const save = async (next: string[] | undefined) => {
    setFailed(!(await onSave(nextKey, previous, next)));
  };
  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!disabled && nextKey && !duplicate) {
        void save(selectors.split('\n').map((selector) => selector.trim()).filter(Boolean));
      }
    }}>
      {!rule && (
        <SettingsFieldRow label={keyLabel}>
          <Input aria-label={keyLabel} value={key} onChange={(event) => setKey(event.target.value)}
            className={SETTINGS_WIDTH_SHORT_TEXT_CLASS} placeholder="default, provider/model, provider/*"
            spellCheck={false} autoCapitalize="none" disabled={disabled} />
        </SettingsFieldRow>
      )}
      <SettingsStackedField label={selectorLabel} controlClassName="max-w-none">
        <Textarea aria-label={selectorLabel} value={selectors} onChange={(event) => setSelectors(event.target.value)}
          placeholder={'provider/model:high\n@smol'} disabled={disabled} />
      </SettingsStackedField>
      <SettingsFieldRow label={t('settings.retryFallback.addModel')}>
        <ModelSelector providerId="" modelId="" directory={directory} disabled={disabled}
          className={SETTINGS_WIDTH_SELECT_CLASS}
          isModelAllowed={(provider, id) => models.some((model) => model.provider === provider && model.modelId === id && model.enabled !== false)}
          onChange={(provider, modelId) => {
            if (provider && modelId) setSelectors((input) => [input.trimEnd(), formatModelRef({ provider, modelId })].filter(Boolean).join('\n'));
          }} />
      </SettingsFieldRow>
      {(duplicate || failed) && (
        <p role="alert" className="text-destructive typography-ui-label">
          {t(duplicate ? 'settings.retryFallback.duplicate' : 'settings.omp.saveFailed')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={disabled || !nextKey || duplicate}>{t('settings.common.actions.saveChanges')}</Button>
        {rule && (
          <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => void save(undefined)}>
            {t('settings.common.actions.delete')}
          </Button>
        )}
      </div>
    </form>
  );
}

export function RetryFallbackChains({
  state, saving, updateSettings, directory, models,
}: Pick<UseOmpPageSettingsResult, 'state' | 'saving' | 'updateSettings'> & {
  directory?: string;
  models: readonly Model[];
}) {
  const { t } = useI18n();
  const [editing, setEditing] = React.useState<{ key?: string } | null>(null);
  const setting = state?.settings.find(({ id }) => id === CHAINS);
  if (!setting) return null;

  const entries = parseRolesRecord(setting.value);
  const keys = Object.keys(entries);
  const writable = setting.conditionActive === true;
  const save: ChainEditorProps['onSave'] = async (key, previous, next) => {
    const saved = await updateSettings((latest) => {
      const current = latest.settings.find(({ id }) => id === CHAINS);
      const chains = parseRolesRecord(current?.value);
      if (!current?.conditionActive ||
          JSON.stringify(Object.hasOwn(chains, key) ? chains[key] : undefined) !== JSON.stringify(previous)) {
        throw new Error('Retry fallback chain changed');
      }
      const value = next === undefined ? chains : { ...chains, [key]: next };
      if (next === undefined) delete value[key];
      return [{ id: CHAINS, value, expectedValue: current.value }];
    });
    if (saved) setEditing(null);
    return saved;
  };
  const editorProps = { keys, models, directory, disabled: saving || !writable, onSave: save };

  return (
    <SettingsControlGroup settingsItem="sessions.fallback-model"
      title={t('settings.omp.items.retry.fallbackChains.label')}
      info={t('settings.omp.items.retry.fallbackChains.description')}
      description={writable ? undefined : t(setting.conditionActive === false
        ? 'settings.retryFallback.overridden' : 'settings.view.unavailable.title')}>
      {Object.entries(entries).map(([key, chain]) => isChain(chain) && (
        <SettingsDisclosure key={key} title={key} secondary={chain.join(' → ')}
          expanded={editing?.key === key} onToggle={() => setEditing(editing?.key === key ? null : { key })}>
          <ChainEditor rule={{ key, chain }} {...editorProps} />
        </SettingsDisclosure>
      ))}
      {writable && (
        <SettingsDisclosure title={t('settings.retryFallback.addChain')} expanded={editing !== null && editing.key === undefined}
          onToggle={() => setEditing(editing !== null && editing.key === undefined ? null : {})}>
          <ChainEditor {...editorProps} />
        </SettingsDisclosure>
      )}
    </SettingsControlGroup>
  );
}
