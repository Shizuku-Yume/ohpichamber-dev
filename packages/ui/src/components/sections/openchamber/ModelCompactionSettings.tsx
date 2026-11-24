import React from 'react';
import { formatModelRef, parseModelSelector, type OmpSettingsState, type OmpSettingValue } from '@openchamber/agent-contract';
import { Icon } from '@/components/icon/Icon';
import { ModelSelector } from '@/components/sections/agents/ModelSelector';
import {
  SETTINGS_CUSTOM_TRIGGER_CLASS,
  SETTINGS_ICON_BUTTON_CLASS,
  SETTINGS_NUMBER_STEPPER_ROW_CLASS,
  SETTINGS_NUMBER_UNIT_CLASS,
  SETTINGS_SELECT_TRIGGER_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
  SETTINGS_WIDTH_NUMBER_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
  SettingsCheckboxRow,
  SettingsDisclosure,
  SettingsFieldRow,
  SettingsInset,
  SettingsStackedField,
} from '@/components/sections/shared/SettingsSection';
import type { UseOmpPageSettingsResult } from '@/components/sections/shared/useOmpPageSettings';
import { Button } from '@/components/ui/button';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useI18n, type I18nKey, type I18nParams } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const MODEL_THRESHOLDS = 'compaction.modelThresholds';
const MODEL_THRESHOLDS_ENABLED = 'compaction.modelThresholdsEnabled';
const DEFAULT_PERCENT = 80;
const DEFAULT_TOKENS = 90000;

type ThresholdMode = 'percent' | 'tokens' | 'fixed';
type Translate = (key: I18nKey, params?: I18nParams) => string;

function isThresholdMode(value: string): value is ThresholdMode {
  return value === 'percent' || value === 'tokens' || value === 'fixed';
}

function modelThresholds(value: OmpSettingValue | undefined) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isTokenThreshold(value: OmpSettingValue | undefined): boolean {
  return typeof value === 'number' || (typeof value === 'string' && /^f\d+$/i.test(value));
}

function validateModelSelectorKey(raw: string): boolean {
  const key = raw.trim();
  if (!key) return false;
  const star = key.indexOf('*');
  if (star !== -1 && star !== key.length - 1) return false;
  const slash = key.indexOf('/');
  if (slash <= 0 || slash === key.length - 1) return false;
  return true;
}

function parseThreshold(value: string | number | undefined): { mode: ThresholdMode; numeric: number } {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return { mode: 'tokens', numeric: Math.round(value) };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const fixedMatch = /^f(\d+)$/i.exec(trimmed);
    if (fixedMatch) {
      const tokens = Number(fixedMatch[1]);
      if (Number.isSafeInteger(tokens) && tokens > 0) {
        return { mode: 'fixed', numeric: tokens };
      }
    }
    const percentMatch = /^(\d+(?:\.\d+)?)%$/.exec(trimmed);
    if (percentMatch) {
      const percent = Number(percentMatch[1]);
      if (Number.isFinite(percent) && percent > 0 && percent <= 100) {
        return { mode: 'percent', numeric: percent };
      }
    }
  }
  return { mode: 'percent', numeric: DEFAULT_PERCENT };
}

function serializeThreshold(mode: ThresholdMode, numeric: number | undefined): string | number | undefined {
  if (numeric === undefined || !Number.isFinite(numeric) || numeric <= 0) return undefined;
  if (mode === 'percent') {
    if (numeric > 100) return undefined;
    return `${numeric}%`;
  }
  const rounded = Math.round(numeric);
  if (!Number.isSafeInteger(rounded) || rounded <= 0) return undefined;
  return mode === 'fixed' ? `f${rounded}` : rounded;
}

function defaultValueForMode(nextMode: ThresholdMode, currentMode: ThresholdMode, currentNumeric: number | undefined): number {
  if (nextMode === 'percent') {
    return currentMode === 'percent' && currentNumeric !== undefined && currentNumeric > 0 && currentNumeric <= 100
      ? currentNumeric
      : DEFAULT_PERCENT;
  }
  if (currentMode !== 'percent' && currentNumeric !== undefined && currentNumeric > 0) {
    return Math.round(currentNumeric);
  }
  return DEFAULT_TOKENS;
}

function formatRuleSummary(value: string | number, t: Translate): string {
  const parsed = parseThreshold(value);
  if (parsed.mode === 'percent') return `${parsed.numeric}%`;
  if (parsed.mode === 'fixed') {
    return t('settings.openchamber.defaults.compaction.fixedTokensSummary', { count: parsed.numeric });
  }
  return t('settings.openchamber.defaults.compaction.tokens', { count: parsed.numeric });
}

interface RuleThresholdFieldsProps {
  selector: string;
  value: string | number;
  disabled: boolean;
  onSave: (key: string, nextValue: string | number | undefined, previousValue: string | number | undefined) => Promise<boolean | undefined>;
}

function RuleThresholdFields({ selector, value, disabled, onSave }: RuleThresholdFieldsProps) {
  const { t } = useI18n();
  const parsed = parseThreshold(value);
  const [failed, setFailed] = React.useState(false);

  const commit = async (nextMode: ThresholdMode, nextNumeric: number) => {
    const serialized = serializeThreshold(nextMode, nextNumeric);
    if (serialized === undefined || serialized === value) return;
    setFailed(false);
    const saved = await onSave(selector, serialized, value);
    if (saved !== undefined) setFailed(!saved);
  };

  const modeLabel = t('settings.openchamber.defaults.compaction.modelRuleMode');
  const valueLabel = t('settings.openchamber.defaults.compaction.modelRuleValue');

  return (
    <>
      <SettingsFieldRow label={modeLabel}>
        <Select
          value={parsed.mode}
          disabled={disabled}
          onValueChange={(nextMode) => {
            if (!isThresholdMode(nextMode) || nextMode === parsed.mode) return;
            void commit(nextMode, defaultValueForMode(nextMode, parsed.mode, parsed.numeric));
          }}
        >
          <SelectTrigger className={SETTINGS_WIDTH_SELECT_CLASS} aria-label={modeLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percent">{t('settings.openchamber.defaults.compaction.mode.percent')}</SelectItem>
            <SelectItem value="tokens">{t('settings.openchamber.defaults.compaction.mode.tokens')}</SelectItem>
            <SelectItem value="fixed">{t('settings.openchamber.defaults.compaction.mode.fixed')}</SelectItem>
          </SelectContent>
        </Select>
      </SettingsFieldRow>
      <SettingsFieldRow label={valueLabel}>
        <div className={SETTINGS_NUMBER_STEPPER_ROW_CLASS}>
          <NumberInput
            value={parsed.numeric}
            onValueChange={(nextNumeric) => void commit(parsed.mode, nextNumeric)}
            deferExternalValueWhileFocused
            min={1}
            max={parsed.mode === 'percent' ? 100 : undefined}
            step={parsed.mode === 'percent' ? 1 : 1000}
            disabled={disabled}
            className={SETTINGS_WIDTH_NUMBER_CLASS}
            aria-label={valueLabel}
          />
          <span className={SETTINGS_NUMBER_UNIT_CLASS}>
            {t(parsed.mode === 'percent' ? 'settings.omp.unit.percent' : 'settings.omp.unit.tokens')}
          </span>
        </div>
      </SettingsFieldRow>
      {failed && (
        <p role="alert" className="typography-ui-label text-[var(--status-error)]">
          {t('settings.omp.saveFailed')}
        </p>
      )}
    </>
  );
}

interface AddCompactionRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingSelectors: readonly string[];
  directory?: string;
  saving: boolean;
  onAdd: (selector: string, value: string | number) => Promise<boolean | undefined>;
}

function AddCompactionRuleDialog({
  open,
  onOpenChange,
  existingSelectors,
  directory,
  saving,
  onAdd,
}: AddCompactionRuleDialogProps) {
  const { t } = useI18n();
  const [selector, setSelector] = React.useState('');
  const [mode, setMode] = React.useState<ThresholdMode>('percent');
  const [numericValue, setNumericValue] = React.useState<number | undefined>(DEFAULT_PERCENT);
  const [submitted, setSubmitted] = React.useState(false);
  const [saveFailed, setSaveFailed] = React.useState(false);

  const errorId = React.useId();
  const selectorErrorId = `${errorId}-selector`;
  const valueErrorId = `${errorId}-value`;

  React.useEffect(() => {
    if (!open) return;
    setSelector('');
    setMode('percent');
    setNumericValue(DEFAULT_PERCENT);
    setSubmitted(false);
    setSaveFailed(false);
  }, [open]);

  const trimmedSelector = selector.trim();
  const parsedCatalogModel = !trimmedSelector.includes('*') ? parseModelSelector(trimmedSelector) : null;
  const isDuplicate = trimmedSelector.length > 0 && existingSelectors.includes(trimmedSelector);

  const selectorError = (() => {
    if (isDuplicate) return t('settings.openchamber.defaults.compaction.modelRuleExists');
    if (!submitted) return null;
    if (!trimmedSelector) return t('settings.openchamber.defaults.compaction.modelRuleSelectorRequired');
    if (!validateModelSelectorKey(trimmedSelector)) {
      return t('settings.openchamber.defaults.compaction.modelRuleSelectorInvalid');
    }
    return null;
  })();

  const serializedValue = serializeThreshold(mode, numericValue);
  const valueError = (() => {
    if (!submitted || serializedValue !== undefined) return null;
    return t(
      mode === 'percent'
        ? 'settings.openchamber.defaults.compaction.modelRulePercentInvalid'
        : 'settings.openchamber.defaults.compaction.modelRuleValueInvalid',
    );
  })();

  const handleSubmit = async () => {
    setSubmitted(true);
    setSaveFailed(false);
    if (!trimmedSelector || !validateModelSelectorKey(trimmedSelector) || isDuplicate || serializedValue === undefined) {
      return;
    }
    const saved = await onAdd(trimmedSelector, serializedValue);
    if (saved === true) {
      onOpenChange(false);
    } else if (saved === false) {
      setSaveFailed(true);
    }
  };

  const modeLabel = t('settings.openchamber.defaults.compaction.modelRuleMode');
  const valueLabel = t('settings.openchamber.defaults.compaction.modelRuleValue');
  const selectorLabel = t('settings.openchamber.defaults.compaction.modelRuleSelector');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('settings.openchamber.defaults.compaction.modelRuleAdd')}</DialogTitle>
          <DialogDescription>{t('settings.openchamber.defaults.compaction.modelRulesInfo')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <SettingsStackedField
            label={t('settings.openchamber.defaults.field.model')}
            controlClassName="w-full max-w-none"
          >
            <ModelSelector
              providerId={parsedCatalogModel?.providerId ?? ''}
              modelId={parsedCatalogModel?.modelId ?? ''}
              directory={directory}
              disabled={saving}
              onChange={(providerId, modelId) => {
                setSaveFailed(false);
                setSelector(providerId && modelId ? formatModelRef({ provider: providerId, modelId }) : '');
              }}
              className={cn(SETTINGS_CUSTOM_TRIGGER_CLASS, 'w-full')}
              placeholder={t('settings.routing.model.placeholder')}
            />
          </SettingsStackedField>
          <SettingsStackedField
            label={selectorLabel}
            info={t('settings.openchamber.defaults.compaction.modelRuleWildcardInfo')}
            controlClassName="w-full max-w-none"
          >
            <div className="w-full">
              <Input
                value={selector}
                onChange={(event) => {
                  setSaveFailed(false);
                  setSelector(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleSubmit();
                  }
                }}
                disabled={saving}
                placeholder="provider/*"
                aria-label={selectorLabel}
                aria-invalid={selectorError ? true : undefined}
                aria-describedby={selectorError ? selectorErrorId : undefined}
                className="w-full"
                spellCheck={false}
                autoCapitalize="none"
              />
              {selectorError ? (
                <p id={selectorErrorId} role="alert" className="mt-1 typography-meta text-[var(--status-error)]">
                  {selectorError}
                </p>
              ) : null}
            </div>
          </SettingsStackedField>
          <SettingsStackedField label={modeLabel}>
            <Select
              value={mode}
              disabled={saving}
              onValueChange={(nextMode) => {
                if (!isThresholdMode(nextMode)) return;
                setSaveFailed(false);
                setNumericValue((prev) => defaultValueForMode(nextMode, mode, prev));
                setMode(nextMode);
              }}
            >
              <SelectTrigger className={SETTINGS_SELECT_TRIGGER_CLASS} aria-label={modeLabel}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">{t('settings.openchamber.defaults.compaction.mode.percent')}</SelectItem>
                <SelectItem value="tokens">{t('settings.openchamber.defaults.compaction.mode.tokens')}</SelectItem>
                <SelectItem value="fixed">{t('settings.openchamber.defaults.compaction.mode.fixed')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingsStackedField>
          <SettingsStackedField label={valueLabel}>
            <div className="w-full">
              <div className={SETTINGS_NUMBER_STEPPER_ROW_CLASS}>
                <NumberInput
                  value={numericValue}
                  onValueChange={(nextValue) => {
                    setSaveFailed(false);
                    setNumericValue(nextValue);
                  }}
                  onClear={() => setNumericValue(undefined)}
                  min={1}
                  max={mode === 'percent' ? 100 : undefined}
                  step={mode === 'percent' ? 1 : 1000}
                  disabled={saving}
                  className={SETTINGS_WIDTH_NUMBER_CLASS}
                  aria-label={valueLabel}
                  aria-invalid={valueError ? true : undefined}
                  aria-describedby={valueError ? valueErrorId : undefined}
                />
                <span className={SETTINGS_NUMBER_UNIT_CLASS}>
                  {t(mode === 'percent' ? 'settings.omp.unit.percent' : 'settings.omp.unit.tokens')}
                </span>
              </div>
              {valueError ? (
                <p id={valueErrorId} role="alert" className="mt-1 typography-meta text-[var(--status-error)]">
                  {valueError}
                </p>
              ) : null}
            </div>
          </SettingsStackedField>
          {saveFailed ? (
            <p role="alert" className="typography-ui-label text-[var(--status-error)]">
              {t('settings.omp.saveFailed')}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => onOpenChange(false)}>
            {t('settings.common.actions.cancel')}
          </Button>
          <Button type="button" size="sm" disabled={saving || isDuplicate} onClick={() => void handleSubmit()}>
            {t('settings.openchamber.defaults.compaction.modelRuleAddAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ModelCompactionSettings({
  state,
  saving,
  updateSettings,
}: Pick<UseOmpPageSettingsResult, 'state' | 'saving' | 'updateSettings'>) {
  const { t } = useI18n();
  const directory = useSettingsDirectory();
  const { confirm, dialog } = useConfirmDialog({
    backdropProps: { className: 'z-[55]' },
    layerClassName: 'z-[60]',
  });
  const [expandedSelector, setExpandedSelector] = React.useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = React.useState(false);
  const confirmingRef = React.useRef(false);
  const [toggleFailed, setToggleFailed] = React.useState(false);
  const [deleteFailed, setDeleteFailed] = React.useState(false);

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

  const confirmTokenRules = async () => {
    confirmingRef.current = true;
    try {
      return await confirm({
        title,
        message: t('settings.openchamber.defaults.compaction.modelRuleCostWarning'),
        action: t('settings.common.actions.saveChanges'),
      });
    } finally {
      confirmingRef.current = false;
    }
  };

  const saveThreshold = async (
    selector: string,
    value: string | number | undefined,
    previousValue?: string | number | undefined,
  ) => {
    if (isTokenThreshold(value) && !isTokenThreshold(previousValue) && !(await confirmTokenRules())) {
      return undefined;
    }
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
      return [{ id: MODEL_THRESHOLDS, value: next, expectedValue: setting.value }];
    });
    if (saved && value === undefined && expandedSelector === selector) {
      setExpandedSelector(null);
    }
    return saved;
  };

  const handleDelete = async (selector: string) => {
    setDeleteFailed(false);
    const saved = await saveThreshold(selector, undefined);
    if (saved === false) setDeleteFailed(true);
  };

  const toggle = async (value: boolean) => {
    setToggleFailed(false);
    if (value && rules.some(([, threshold]) => isTokenThreshold(threshold)) && !(await confirmTokenRules())) return;
    setToggleFailed(!(await updateSettings(() => [{ id: MODEL_THRESHOLDS_ENABLED, value }])));
  };

  const canEdit = enabled && !overridden;

  return (
    <SettingsInset className={SETTINGS_SPACE_ROW_CLASS}>
      <SettingsCheckboxRow
        settingsItem="sessions.model-compaction"
        label={title}
        info={info}
        description={toggleOverridden ? overrideNote : undefined}
        checked={enabled}
        disabled={saving || toggleOverridden}
        onChange={(checked) => void toggle(checked)}
      />
      {toggleFailed && (
        <p role="alert" className="typography-ui-label text-[var(--status-error)]">
          {t('settings.omp.saveFailed')}
        </p>
      )}
      {overridden && !toggleOverridden && (
        <p className="typography-ui-label text-muted-foreground">{overrideNote}</p>
      )}
      {rules.length > 0 && (
        <div>
          {rules.map(([selector, threshold]) => (
            <SettingsDisclosure
              key={selector}
              title={selector}
              secondary={formatRuleSummary(threshold, t)}
              expanded={expandedSelector === selector}
              onToggle={() => setExpandedSelector(expandedSelector === selector ? null : selector)}
              accessory={canEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={saving}
                  className={SETTINGS_ICON_BUTTON_CLASS}
                  aria-label={t('settings.openchamber.defaults.compaction.modelRuleDeleteAria', { selector })}
                  title={t('settings.common.actions.delete')}
                  onClick={() => void handleDelete(selector)}
                >
                  <Icon name="delete-bin" className="size-3.5" />
                </Button>
              ) : undefined}
            >
              <RuleThresholdFields
                selector={selector}
                value={threshold}
                disabled={saving || !canEdit}
                onSave={saveThreshold}
              />
            </SettingsDisclosure>
          ))}
        </div>
      )}
      {deleteFailed && (
        <p role="alert" className="typography-ui-label text-[var(--status-error)]">
          {t('settings.omp.saveFailed')}
        </p>
      )}
      {canEdit && (
        <div className="pt-1">
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={saving}
            onClick={() => setAddDialogOpen(true)}
          >
            <Icon name="add" className="size-3.5" />
            {t('settings.openchamber.defaults.compaction.modelRuleAddAction')}
          </Button>
        </div>
      )}
      <AddCompactionRuleDialog
        open={addDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && confirmingRef.current) return;
          setAddDialogOpen(nextOpen);
        }}
        existingSelectors={selectors}
        directory={directory ?? undefined}
        saving={saving}
        onAdd={(selector, value) => saveThreshold(selector, value)}
      />
      {dialog}
    </SettingsInset>
  );
}
