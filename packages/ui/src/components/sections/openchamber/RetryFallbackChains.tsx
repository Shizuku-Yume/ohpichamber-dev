import React from 'react';
import {
  THINKING_LEVELS,
  formatModelRef,
  parseModelSelector,
  type JsonValue,
  type Model,
} from '@openchamber/agent-contract';
import { Icon } from '@/components/icon/Icon';
import { ModelSelector } from '@/components/sections/agents/ModelSelector';
import { ModelEffortPicker } from '@/components/sections/shared/ModelRoleEditor';
import { ModelRoleLinkRow } from '@/components/sections/shared/ModelRoleLinkRow';
import {
  formatRoleSelector,
  levelLabel,
  modelForSelector,
  parseRolesRecord,
  splitRoleSelector,
} from '@/components/sections/shared/modelRoleSelectors';
import {
  SETTINGS_CUSTOM_TRIGGER_CLASS,
  SETTINGS_HELPER_CLASS,
  SETTINGS_ICON_BUTTON_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
  SETTINGS_WIDTH_SHORT_TEXT_CLASS,
  SettingsChipGroup,
  SettingsControlGroup,
  SettingsDisclosure,
  SettingsFieldRow,
  SettingsStackedField,
} from '@/components/sections/shared/SettingsSection';
import { SettingsSortableList, type SettingsSortableListItem } from '@/components/sections/shared/SettingsSortableList';
import type { UseOmpPageSettingsResult } from '@/components/sections/shared/useOmpPageSettings';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';

const WEB_CHAIN = 'web';
const INHERIT_EFFORT = '__inherit__';
const FALLBACK_EFFORT_LEVELS = [...THINKING_LEVELS.filter((level) => level !== 'inherit'), 'auto'] as const;

const CHAIN_ROLE_OPTIONS: readonly { role: string; labelKey: I18nKey }[] = [
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

type ChainKeyKind = 'role' | 'model' | 'wildcard';
type TargetKind = 'model' | 'wildcard';

interface FallbackTargetItem extends SettingsSortableListItem {
  selector: string;
}

function isChain(value: JsonValue): value is string[] {
  return Array.isArray(value) && value.every((selector) => typeof selector === 'string');
}

function isValidWildcardSelector(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed) || !trimmed.endsWith('/*')) return false;
  const prefix = trimmed.slice(0, -2);
  return prefix.length > 0 && !prefix.startsWith('/') && !prefix.endsWith('/');
}

function buildTargetItems(chain: readonly string[]): FallbackTargetItem[] {
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

function chainKeyDisplayLabel(key: string, translate: (key: I18nKey) => string): string {
  const roleOption = CHAIN_ROLE_OPTIONS.find((option) => option.role === key);
  return roleOption ? translate(roleOption.labelKey) : key;
}

type SaveChainFn = (
  key: string,
  previous: readonly string[] | undefined,
  next: string[] | undefined,
) => Promise<boolean>;

interface FallbackTargetRowProps {
  selector: string;
  index: number;
  models: readonly Model[];
  globalLevel?: string;
  directory?: string;
  disabled: boolean;
  isModelAllowed: (providerId: string, modelId: string) => boolean;
  onChangeSelector: (index: number, nextSelector: string) => void;
  onRemove: (index: number) => void;
}

const FallbackTargetRow: React.FC<FallbackTargetRowProps> = ({
  selector,
  index,
  models,
  globalLevel,
  directory,
  disabled,
  isModelAllowed,
  onChangeSelector,
  onRemove,
}) => {
  const { t } = useI18n();
  const { model: modelRef, effort } = splitRoleSelector(selector, models);
  const isWildcard = selector.endsWith('/*');
  const isRoleAlias = selector.startsWith('@');
  const parsed = !isWildcard && !isRoleAlias ? parseModelSelector(modelRef) : null;
  const matchedModel = parsed ? modelForSelector(models, modelRef) : undefined;

  const handleModelChange = (provider: string, nextModelId: string) => {
    if (!provider || !nextModelId) {
      onRemove(index);
      return;
    }
    const nextModel = models.find((candidate) => candidate.provider === provider && candidate.modelId === nextModelId);
    const nextEfforts = nextModel?.reasoningEffortSupported ? nextModel.reasoningOptions : [];
    const keepsEffort = effort !== '' && (nextEfforts.length === 0 || nextEfforts.some((option) => option.reasoningEffort === effort));
    onChangeSelector(index, formatRoleSelector(formatModelRef({ provider, modelId: nextModelId }), keepsEffort ? effort : ''));
  };

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 py-0.5">
      <span className="typography-meta shrink-0 tabular-nums text-muted-foreground">
        {index + 1}.
      </span>
      {parsed ? (
        <>
          <ModelSelector
            providerId={parsed.providerId}
            modelId={parsed.modelId}
            directory={directory}
            disabled={disabled}
            isModelAllowed={isModelAllowed}
            className={SETTINGS_WIDTH_SELECT_CLASS}
            onChange={handleModelChange}
          />
          {matchedModel?.reasoningEffortSupported ? (
            <ModelEffortPicker
              model={matchedModel}
              effort={effort}
              globalLevel={globalLevel}
              disabled={disabled}
              ariaLabel={t('settings.retryFallback.targetEffortAria', { target: selector })}
              onChange={(level) => onChangeSelector(index, formatRoleSelector(modelRef, level))}
            />
          ) : effort ? (
            <Select
              value={effort}
              disabled={disabled}
              onValueChange={(level) => onChangeSelector(index, formatRoleSelector(modelRef, level === INHERIT_EFFORT ? '' : level))}
            >
              <SelectTrigger
                className={SETTINGS_WIDTH_SELECT_CLASS}
                aria-label={t('settings.retryFallback.targetEffortAria', { target: selector })}
              >
                <SelectValue>{levelLabel(t, effort)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={INHERIT_EFFORT}>{t('settings.omp.modelRoles.thinkingDefault')}</SelectItem>
                {FALLBACK_EFFORT_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>{levelLabel(t, level)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </>
      ) : (
        <span className="typography-ui-label min-w-0 flex-1 truncate text-foreground">
          {selector}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        className={cn(SETTINGS_ICON_BUTTON_CLASS, 'ms-auto shrink-0')}
        aria-label={t('settings.retryFallback.removeTargetAria', { target: selector })}
        title={t('settings.retryFallback.removeTargetAria', { target: selector })}
        onClick={() => onRemove(index)}
      >
        <Icon name="close" className="size-3.5" />
      </Button>
    </div>
  );
};

interface ChainEditorRowProps {
  chainKey: string;
  chain: readonly string[];
  models: readonly Model[];
  globalLevel?: string;
  directory?: string;
  writable: boolean;
  saving: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSave: SaveChainFn;
}

const ChainEditorRow: React.FC<ChainEditorRowProps> = ({
  chainKey,
  chain,
  models,
  globalLevel,
  directory,
  writable,
  saving,
  expanded,
  onToggle,
  onSave,
}) => {
  const { t } = useI18n();
  const [wildcardDraft, setWildcardDraft] = React.useState('');
  const [targetError, setTargetError] = React.useState<string | null>(null);
  const [saveFailed, setSaveFailed] = React.useState(false);

  const disabled = saving || !writable;
  const displayTitle = chainKeyDisplayLabel(chainKey, t);
  const targetItems = React.useMemo(() => buildTargetItems(chain), [chain]);

  const isModelAllowed = React.useCallback(
    (provider: string, id: string) => models.some((model) => model.provider === provider && model.modelId === id && model.enabled !== false),
    [models],
  );

  const commitChain = async (next: string[] | undefined): Promise<boolean> => {
    setSaveFailed(false);
    setTargetError(null);
    const saved = await onSave(chainKey, chain, next);
    if (!saved) setSaveFailed(true);
    return saved;
  };

  const handleReorder = (orderedIds: string[]) => {
    const byId = new Map(targetItems.map((item) => [item.id, item.selector]));
    const reordered = orderedIds.map((id) => byId.get(id)).filter((selector): selector is string => selector !== undefined);
    if (reordered.length === chain.length) {
      void commitChain(reordered);
    }
  };

  const handleChangeSelector = (index: number, nextSelector: string) => {
    const next = [...chain];
    next[index] = nextSelector;
    void commitChain(next);
  };

  const handleRemoveTarget = (index: number) => {
    void commitChain(chain.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleAddTarget = async (selector: string): Promise<boolean> => {
    if (chain.includes(selector)) {
      setTargetError(t('settings.retryFallback.duplicateTarget'));
      return false;
    }
    return commitChain([...chain, selector]);
  };

  const submitWildcard = async () => {
    const trimmed = wildcardDraft.trim();
    if (!isValidWildcardSelector(trimmed)) {
      setTargetError(t('settings.retryFallback.invalidWildcard'));
      return;
    }
    if (await handleAddTarget(trimmed)) {
      setWildcardDraft('');
    }
  };

  return (
    <SettingsDisclosure
      title={displayTitle}
      secondary={chain.length > 0 ? chain.join(' → ') : t('settings.retryFallback.emptyChain')}
      expanded={expanded}
      onToggle={onToggle}
      accessory={writable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={saving}
          className={cn(SETTINGS_ICON_BUTTON_CLASS, 'shrink-0')}
          aria-label={t('settings.retryFallback.deleteChainAria', { key: displayTitle })}
          title={t('settings.retryFallback.deleteChainAria', { key: displayTitle })}
          onClick={() => void commitChain(undefined)}
        >
          <Icon name="delete-bin" className="size-3.5" />
        </Button>
      ) : undefined}
    >
      {targetItems.length > 0 ? (
        <SettingsSortableList
          items={targetItems}
          disabled={disabled}
          dragInstructions={t('settings.retryFallback.dragInstructions')}
          listClassName="gap-1"
          onReorder={handleReorder}
          renderRow={(item, index) => (
            <FallbackTargetRow
              selector={item.selector}
              index={index}
              models={models}
              globalLevel={globalLevel}
              directory={directory}
              disabled={disabled}
              isModelAllowed={isModelAllowed}
              onChangeSelector={handleChangeSelector}
              onRemove={handleRemoveTarget}
            />
          )}
        />
      ) : (
        <p className={SETTINGS_HELPER_CLASS}>{t('settings.retryFallback.emptyChainHint')}</p>
      )}
      {writable ? (
        <>
          <SettingsFieldRow label={t('settings.retryFallback.addModel')}>
            <ModelSelector
              providerId=""
              modelId=""
              directory={directory}
              disabled={disabled}
              isModelAllowed={isModelAllowed}
              placeholder={t('settings.retryFallback.selectModelPlaceholder')}
              className={SETTINGS_WIDTH_SELECT_CLASS}
              onChange={(provider, modelId) => {
                if (provider && modelId) {
                  void handleAddTarget(formatModelRef({ provider, modelId }));
                }
              }}
            />
          </SettingsFieldRow>
          <SettingsFieldRow label={t('settings.retryFallback.addWildcard')}>
            <Input
              aria-label={t('settings.retryFallback.addWildcard')}
              value={wildcardDraft}
              onChange={(event) => {
                setWildcardDraft(event.target.value);
                setTargetError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void submitWildcard();
                }
              }}
              placeholder="provider/*"
              spellCheck={false}
              autoCapitalize="none"
              disabled={disabled}
              className={SETTINGS_WIDTH_SHORT_TEXT_CLASS}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || !wildcardDraft.trim()}
              onClick={() => void submitWildcard()}
            >
              {t('settings.retryFallback.addTargetAction')}
            </Button>
          </SettingsFieldRow>
        </>
      ) : null}
      {targetError ? (
        <p role="alert" className="typography-ui-label text-[var(--status-error)]">
          {targetError}
        </p>
      ) : null}
      {saveFailed ? (
        <p role="alert" className="typography-ui-label text-[var(--status-error)]">
          {t('settings.omp.saveFailed')}
        </p>
      ) : null}
    </SettingsDisclosure>
  );
};

interface AddChainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingKeys: readonly string[];
  models: readonly Model[];
  globalLevel?: string;
  directory?: string;
  saving: boolean;
  onCreate: (key: string, firstTarget: string) => Promise<boolean>;
}

const AddChainDialog: React.FC<AddChainDialogProps> = ({
  open,
  onOpenChange,
  existingKeys,
  models,
  globalLevel,
  directory,
  saving,
  onCreate,
}) => {
  const { t } = useI18n();
  const firstAvailableRole = React.useMemo(
    () => CHAIN_ROLE_OPTIONS.find((option) => !existingKeys.includes(option.role))?.role ?? CHAIN_ROLE_OPTIONS[0].role,
    [existingKeys],
  );

  const [keyKind, setKeyKind] = React.useState<ChainKeyKind>('role');
  const [roleKey, setRoleKey] = React.useState(firstAvailableRole);
  const [modelKey, setModelKey] = React.useState<{ provider: string; modelId: string } | null>(null);
  const [modelKeyEffort, setModelKeyEffort] = React.useState('');
  const [wildcardKey, setWildcardKey] = React.useState('');

  const [targetKind, setTargetKind] = React.useState<TargetKind>('model');
  const [targetModel, setTargetModel] = React.useState<{ provider: string; modelId: string } | null>(null);
  const [targetEffort, setTargetEffort] = React.useState('');
  const [targetWildcard, setTargetWildcard] = React.useState('');

  const [submitted, setSubmitted] = React.useState(false);
  const [saveFailed, setSaveFailed] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setKeyKind('role');
    setRoleKey(firstAvailableRole);
    setModelKey(null);
    setModelKeyEffort('');
    setWildcardKey('');
    setTargetKind('model');
    setTargetModel(null);
    setTargetEffort('');
    setTargetWildcard('');
    setSubmitted(false);
    setSaveFailed(false);
  }, [firstAvailableRole, open]);

  const isModelAllowed = React.useCallback(
    (provider: string, id: string) => models.some((model) => model.provider === provider && model.modelId === id && model.enabled !== false),
    [models],
  );

  const resolvedKey = React.useMemo(() => {
    if (keyKind === 'role') return roleKey;
    if (keyKind === 'model') {
      if (!modelKey) return '';
      return formatRoleSelector(formatModelRef(modelKey), modelKeyEffort);
    }
    return wildcardKey.trim();
  }, [keyKind, modelKey, modelKeyEffort, roleKey, wildcardKey]);

  const resolvedTarget = React.useMemo(() => {
    if (targetKind === 'model') {
      if (!targetModel) return '';
      return formatRoleSelector(formatModelRef(targetModel), targetEffort);
    }
    return targetWildcard.trim();
  }, [targetEffort, targetKind, targetModel, targetWildcard]);

  const keyModel = React.useMemo(
    () => (modelKey ? modelForSelector(models, formatModelRef(modelKey)) : undefined),
    [modelKey, models],
  );
  const firstTargetModel = React.useMemo(
    () => (targetModel ? modelForSelector(models, formatModelRef(targetModel)) : undefined),
    [models, targetModel],
  );

  const duplicateKey = Boolean(resolvedKey) && existingKeys.includes(resolvedKey);
  const wildcardKeyInvalid = keyKind === 'wildcard' && wildcardKey.trim().length > 0 && !isValidWildcardSelector(wildcardKey);
  const wildcardTargetInvalid = targetKind === 'wildcard' && targetWildcard.trim().length > 0 && !isValidWildcardSelector(targetWildcard);

  const canSubmit = Boolean(resolvedKey)
    && Boolean(resolvedTarget)
    && !duplicateKey
    && !(keyKind === 'wildcard' && !isValidWildcardSelector(wildcardKey))
    && !(targetKind === 'wildcard' && !isValidWildcardSelector(targetWildcard))
    && !saving;

  const handleSubmit = async () => {
    setSubmitted(true);
    setSaveFailed(false);
    if (!canSubmit) return;
    const saved = await onCreate(resolvedKey, resolvedTarget);
    if (!saved) setSaveFailed(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('settings.retryFallback.addChain')}</DialogTitle>
          <DialogDescription>{t('settings.retryFallback.addDialogDescription')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <SettingsStackedField label={t('settings.retryFallback.key')} controlClassName="w-full max-w-none">
            <div className="flex w-full flex-col gap-2">
              <SettingsChipGroup
                value={keyKind}
                aria-label={t('settings.retryFallback.keyKindAria')}
                onChange={(next) => {
                  setKeyKind(next);
                  setSubmitted(false);
                  setSaveFailed(false);
                }}
                options={[
                  { value: 'role', label: t('settings.retryFallback.keyKind.role') },
                  { value: 'model', label: t('settings.retryFallback.keyKind.model') },
                  { value: 'wildcard', label: t('settings.retryFallback.keyKind.wildcard') },
                ]}
              />
              {keyKind === 'role' ? (
                <Select value={roleKey} onValueChange={setRoleKey} disabled={saving}>
                  <SelectTrigger className={SETTINGS_WIDTH_SELECT_CLASS} aria-label={t('settings.retryFallback.key')}>
                    <SelectValue placeholder={t('settings.retryFallback.rolePlaceholder')}>
                      {chainKeyDisplayLabel(roleKey, t)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CHAIN_ROLE_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.role}
                        value={option.role}
                        disabled={existingKeys.includes(option.role)}
                      >
                        {t(option.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : keyKind === 'model' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <ModelSelector
                    providerId={modelKey?.provider ?? ''}
                    modelId={modelKey?.modelId ?? ''}
                    directory={directory}
                    disabled={saving}
                    isModelAllowed={isModelAllowed}
                    placeholder={t('settings.retryFallback.selectModelPlaceholder')}
                    className={cn(SETTINGS_CUSTOM_TRIGGER_CLASS, 'w-full')}
                    onChange={(provider, modelId) => {
                      setModelKey(provider && modelId ? { provider, modelId } : null);
                      setModelKeyEffort('');
                    }}
                  />
                  {keyModel?.reasoningEffortSupported ? (
                    <ModelEffortPicker
                      model={keyModel}
                      effort={modelKeyEffort}
                      globalLevel={globalLevel}
                      disabled={saving}
                      ariaLabel={t('settings.retryFallback.keyEffortAria')}
                      onChange={setModelKeyEffort}
                    />
                  ) : null}
                </div>
              ) : (
                <Input
                  aria-label={t('settings.retryFallback.key')}
                  value={wildcardKey}
                  onChange={(event) => setWildcardKey(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleSubmit();
                    }
                  }}
                  placeholder="provider/*"
                  spellCheck={false}
                  autoCapitalize="none"
                  disabled={saving}
                  className="w-full"
                />
              )}
              {duplicateKey ? (
                <p role="alert" className="typography-meta text-[var(--status-error)]">
                  {t('settings.retryFallback.duplicate')}
                </p>
              ) : null}
              {(wildcardKeyInvalid || (submitted && keyKind === 'wildcard' && !isValidWildcardSelector(wildcardKey))) ? (
                <p role="alert" className="typography-meta text-[var(--status-error)]">
                  {t('settings.retryFallback.invalidWildcard')}
                </p>
              ) : null}
            </div>
          </SettingsStackedField>

          <SettingsStackedField label={t('settings.retryFallback.firstTarget')} controlClassName="w-full max-w-none">
            <div className="flex w-full flex-col gap-2">
              <SettingsChipGroup
                value={targetKind}
                aria-label={t('settings.retryFallback.targetKindAria')}
                onChange={(next) => {
                  setTargetKind(next);
                  setSubmitted(false);
                  setSaveFailed(false);
                }}
                options={[
                  { value: 'model', label: t('settings.retryFallback.keyKind.model') },
                  { value: 'wildcard', label: t('settings.retryFallback.keyKind.wildcard') },
                ]}
              />
              {targetKind === 'model' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <ModelSelector
                    providerId={targetModel?.provider ?? ''}
                    modelId={targetModel?.modelId ?? ''}
                    directory={directory}
                    disabled={saving}
                    isModelAllowed={isModelAllowed}
                    placeholder={t('settings.retryFallback.selectModelPlaceholder')}
                    className={cn(SETTINGS_CUSTOM_TRIGGER_CLASS, 'w-full')}
                    onChange={(provider, modelId) => {
                      setTargetModel(provider && modelId ? { provider, modelId } : null);
                      setTargetEffort('');
                    }}
                  />
                  {firstTargetModel?.reasoningEffortSupported ? (
                    <ModelEffortPicker
                      model={firstTargetModel}
                      effort={targetEffort}
                      globalLevel={globalLevel}
                      disabled={saving}
                      ariaLabel={t('settings.retryFallback.targetEffortAria', { target: formatModelRef(firstTargetModel) })}
                      onChange={setTargetEffort}
                    />
                  ) : null}
                </div>
              ) : (
                <Input
                  aria-label={t('settings.retryFallback.firstTarget')}
                  value={targetWildcard}
                  onChange={(event) => setTargetWildcard(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleSubmit();
                    }
                  }}
                  placeholder="provider/*"
                  spellCheck={false}
                  autoCapitalize="none"
                  disabled={saving}
                  className="w-full"
                />
              )}
              {(wildcardTargetInvalid || (submitted && targetKind === 'wildcard' && !isValidWildcardSelector(targetWildcard))) ? (
                <p role="alert" className="typography-meta text-[var(--status-error)]">
                  {t('settings.retryFallback.invalidWildcard')}
                </p>
              ) : null}
            </div>
          </SettingsStackedField>

          {saveFailed ? (
            <p role="alert" className="typography-ui-label text-[var(--status-error)]">
              {t('settings.omp.saveFailed')}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => onOpenChange(false)}>
              {t('settings.common.actions.cancel')}
            </Button>
            <Button type="button" size="sm" disabled={!canSubmit} onClick={() => void handleSubmit()}>
              {t('settings.common.actions.create')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export function RetryFallbackChains({
  state,
  saving,
  updateSettings,
  directory,
  models,
}: Pick<UseOmpPageSettingsResult, 'state' | 'saving' | 'updateSettings'> & {
  directory?: string;
  models: readonly Model[];
}) {
  const { t } = useI18n();
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);

  const setting = state?.settings.find(({ id }) => id === 'retry.fallbackChains');
  if (!setting) return null;

  const thinkingSetting = state?.settings.find(({ id }) => id === 'defaultThinkingLevel');
  const globalLevel = typeof thinkingSetting?.value === 'string' ? thinkingSetting.value : undefined;

  const entries = parseRolesRecord(setting.value);
  const keys = Object.keys(entries);
  const writable = setting.conditionActive === true;

  const saveChain: SaveChainFn = async (key, previous, next) => {
    const saved = await updateSettings((latest) => {
      const current = latest.settings.find(({ id }) => id === 'retry.fallbackChains');
      const chains = parseRolesRecord(current?.value);
      if (
        !current?.conditionActive
        || JSON.stringify(Object.hasOwn(chains, key) ? chains[key] : undefined) !== JSON.stringify(previous)
      ) {
        throw new Error('Retry fallback chain changed');
      }
      const value = next === undefined ? chains : { ...chains, [key]: next };
      if (next === undefined) delete value[key];
      return [{ id: 'retry.fallbackChains', value, expectedValue: current.value }];
    });
    if (saved && next === undefined && expandedKey === key) {
      setExpandedKey(null);
    }
    return saved;
  };

  const handleCreateChain = async (key: string, firstTarget: string): Promise<boolean> => {
    const saved = await saveChain(key, undefined, [firstTarget]);
    if (saved) {
      setAddOpen(false);
      setExpandedKey(key);
    }
    return saved;
  };

  return (
    <SettingsControlGroup
      settingsItem="sessions.fallback-model"
      title={t('settings.omp.items.retry.fallbackChains.label')}
      info={t('settings.omp.items.retry.fallbackChains.description')}
      description={writable ? undefined : t(setting.conditionActive === false
        ? 'settings.retryFallback.overridden'
        : 'settings.view.unavailable.title')}
    >
      {Object.entries(entries).map(([key, chain]) => isChain(chain) && (key === WEB_CHAIN ? (
        <ModelRoleLinkRow
          key={key}
          label={t('settings.omp.modelRoles.role.web.label')}
          value={chain.length > 0 ? chain.join(' → ') : t('settings.retryFallback.emptyChain')}
          linkLabel={t('settings.omp.modelRoles.link.webSearch')}
          onOpen={() => useUIStore.getState().requestSettingsJump('web-search', 'web-search.fallbacks')}
        />
      ) : (
        <ChainEditorRow
          key={key}
          chainKey={key}
          chain={chain}
          models={models}
          globalLevel={globalLevel}
          directory={directory}
          writable={writable}
          saving={saving}
          expanded={expandedKey === key}
          onToggle={() => setExpandedKey(expandedKey === key ? null : key)}
          onSave={saveChain}
        />
      )))}
      {writable ? (
        <div className="pt-1">
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={saving}
            onClick={() => setAddOpen(true)}
          >
            <Icon name="add" className="size-3.5" />
            {t('settings.retryFallback.addChain')}
          </Button>
        </div>
      ) : null}
      <AddChainDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        existingKeys={keys}
        models={models}
        globalLevel={globalLevel}
        directory={directory}
        saving={saving}
        onCreate={handleCreateChain}
      />
    </SettingsControlGroup>
  );
}
