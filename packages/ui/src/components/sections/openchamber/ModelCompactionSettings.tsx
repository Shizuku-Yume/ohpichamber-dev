import React from 'react';
import type { OmpSettingsState, OmpSettingValue } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import {
  SettingsCheckboxRow,
  SettingsDisclosure,
  SettingsFieldRow,
  SETTINGS_WIDTH_SHORT_TEXT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import type { UseOmpPageSettingsResult } from '@/components/sections/shared/useOmpPageSettings';

const MODEL_THRESHOLDS = 'compaction.modelThresholds';
const MODEL_THRESHOLDS_ENABLED = 'compaction.modelThresholdsEnabled';

function modelThresholds(value: OmpSettingValue | undefined) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

interface ThresholdEditorProps {
  selector?: string;
  value?: string | number;
  selectors: readonly string[];
  disabled: boolean;
  onSave: (key: string, value: string | number | undefined) => Promise<boolean>;
}

function ThresholdEditor({ selector, value, selectors, disabled, onSave }: ThresholdEditorProps) {
  const { t } = useI18n();
  const [key, setKey] = React.useState(selector ?? '');
  const [threshold, setThreshold] = React.useState(value?.toString() ?? '');
  const [failed, setFailed] = React.useState(false);
  const keyLabel = t('settings.openchamber.defaults.compaction.modelRuleSelector');
  const valueLabel = t('settings.openchamber.defaults.compaction.modelRuleValue');
  const enteredKey = key.trim();
  const enteredValue = threshold.trim();
  const duplicate = !selector && selectors.includes(enteredKey);
  const canSave = !disabled && Boolean(enteredKey && enteredValue) && !duplicate && enteredValue !== value?.toString();

  const save = async (nextValue: string | number | undefined) => {
    setFailed(!(await onSave(enteredKey, nextValue)));
  };

  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!canSave) return;
      void save(/^\d+$/.test(enteredValue) ? Number(enteredValue) : enteredValue);
    }}>
      {!selector && (
        <SettingsFieldRow label={keyLabel}>
          <Input aria-label={keyLabel} className={SETTINGS_WIDTH_SHORT_TEXT_CLASS}
            value={key} onChange={(event) => setKey(event.target.value)} disabled={disabled}
            placeholder="provider/model" spellCheck={false} autoCapitalize="none" />
        </SettingsFieldRow>
      )}
      <SettingsFieldRow label={valueLabel}>
        <Input aria-label={valueLabel} className={SETTINGS_WIDTH_SHORT_TEXT_CLASS}
          value={threshold} onChange={(event) => setThreshold(event.target.value)} disabled={disabled}
          placeholder="80%" spellCheck={false} autoCapitalize="none" />
      </SettingsFieldRow>
      {(failed || duplicate) && (
        <p role="alert" className="text-destructive typography-ui-label">
          {t(duplicate ? 'settings.openchamber.defaults.compaction.modelRuleExists' : 'settings.omp.saveFailed')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!canSave}>
          {t('settings.common.actions.saveChanges')}
        </Button>
        {selector && (
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => void save(undefined)}>
            {t('settings.common.actions.delete')}
          </Button>
        )}
      </div>
    </form>
  );
}

export function ModelCompactionSettings({ state, saving, updateSettings }: Pick<UseOmpPageSettingsResult, 'state' | 'saving' | 'updateSettings'>) {
  const { t } = useI18n();
  const [editing, setEditing] = React.useState<{ selector?: string } | null>(null);
  const [toggleFailed, setToggleFailed] = React.useState(false);
  const mapSetting = state?.settings.find((setting) => setting.id === MODEL_THRESHOLDS);
  const enabledSetting = state?.settings.find((setting) => setting.id === MODEL_THRESHOLDS_ENABLED);
  if (!mapSetting || !enabledSetting) return null;

  const entries = modelThresholds(mapSetting.value);
  const rules = Object.entries(entries).filter((entry): entry is [string, string | number] =>
    typeof entry[1] === 'number' || typeof entry[1] === 'string');
  const selectors = rules.map(([selector]) => selector);
  const enabled = enabledSetting.value === true;
  const overridden = mapSetting.conditionActive === false;
  const toggleOverridden = enabledSetting.conditionActive === false;
  const title = t('settings.openchamber.defaults.compaction.modelRules');
  const info = t('settings.openchamber.defaults.compaction.modelRulesInfo');
  const overrideNote = t('settings.openchamber.defaults.compaction.modelRulesOverridden');

  const saveThreshold = async (selector: string, value: string | number | undefined) => {
    const previous = Object.hasOwn(entries, selector) ? entries[selector] : undefined;
    const saved = await updateSettings((latest: OmpSettingsState) => {
      const setting = latest.settings.find(({ id }) => id === MODEL_THRESHOLDS);
      const current = modelThresholds(setting?.value);
      const currentValue = Object.hasOwn(current, selector) ? current[selector] : undefined;
      if (!setting || setting.conditionActive === false || currentValue !== previous) {
        throw new Error('Per-model compaction rule changed');
      }
      const next = value === undefined ? { ...current } : { ...current, [selector]: value };
      if (value === undefined) delete next[selector];
      return [{ id: 'compaction.modelThresholds', value: next }];
    });
    if (saved) setEditing(null);
    return saved;
  };

  const toggle = async (value: boolean) => {
    setToggleFailed(!(await updateSettings(() => [{ id: 'compaction.modelThresholdsEnabled', value }])));
  };
  const canEdit = enabled && !overridden;

  return (
    <div>
      <SettingsCheckboxRow
        settingsItem="sessions.model-compaction"
        label={title}
        info={info}
        description={toggleOverridden ? overrideNote : undefined}
        checked={enabled}
        disabled={saving || toggleOverridden}
        onChange={(checked) => void toggle(checked)}
      />
      {toggleFailed && <p role="alert" className="text-destructive typography-ui-label">{t('settings.omp.saveFailed')}</p>}
      {overridden && !toggleOverridden && <p className="text-muted-foreground typography-ui-label">{overrideNote}</p>}
      {rules.map(([selector, threshold]) => (
        <SettingsDisclosure key={selector} title={selector} secondary={String(threshold)}
          expanded={editing?.selector === selector}
          onToggle={() => setEditing(editing?.selector === selector ? null : { selector })}>
          <ThresholdEditor key={JSON.stringify(threshold)} selector={selector} value={threshold} selectors={selectors}
            disabled={saving || !canEdit} onSave={saveThreshold} />
        </SettingsDisclosure>
      ))}
      {canEdit && (
        <SettingsDisclosure
          title={t('settings.openchamber.defaults.compaction.modelRuleAdd')}
          expanded={editing !== null && editing.selector === undefined}
          onToggle={() => setEditing(editing !== null && editing.selector === undefined ? null : {})}
        >
          <ThresholdEditor selectors={selectors} disabled={saving} onSave={saveThreshold} />
        </SettingsDisclosure>
      )}
    </div>
  );
}
