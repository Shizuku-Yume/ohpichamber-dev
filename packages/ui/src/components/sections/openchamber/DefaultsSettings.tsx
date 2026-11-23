import React from 'react';
import { useOmpPageSettings } from '@/components/sections/shared/useOmpPageSettings';
import { formatModelRef } from '@openchamber/agent-contract';
import type { OmpSettingsChange } from '@openchamber/agent-contract';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  SettingsSection,
  SettingsFieldRow,
  SettingsCheckboxRow,
  SettingsInset,
  SettingsChipGroup,
  SETTINGS_WIDTH_NUMBER_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
  SETTINGS_NUMBER_STEPPER_ROW_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { NumberInput } from '@/components/ui/number-input';
import { OmpRowControl } from '@/components/sections/shared/OmpRowControl';
import { SessionGoalCheckerField, SessionGoalMaxTurnsField } from './SessionGoalCheckerField';
import { ModelEffortPicker, ModelRoleEditor } from '@/components/sections/shared/ModelRoleEditor';
import { modelRoleChange, formatRoleSelector, modelForSelector, parseRolesRecord, roleSelector, splitRoleSelector } from '@/components/sections/shared/modelRoleSelectors';
import { SessionWarmingCheckbox } from './SessionWarmingCheckbox';
import { SessionWarmingField } from './SessionWarmingField';
import { PermissionDefaultModeField } from './PermissionDefaultModeField';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { updateDesktopSettings } from '@/lib/persistence';
import { useSessionDisplayStore } from '@/stores/useSessionDisplayStore';
import { useUIStore } from '@/stores/useUIStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSettingsModels } from '@/hooks/useSettingsModels';
import { refreshDirectoryCatalogs } from '@/sync/sync-refs';


type SessionModeValue = 'main' | 'plan' | 'vibe' | 'goal';

const SESSION_MODE_OPTIONS: readonly { value: SessionModeValue; labelKey: I18nKey }[] = [
  { value: 'main', labelKey: 'chat.chatInput.mode.main' },
  { value: 'plan', labelKey: 'chat.chatInput.mode.plan' },
  { value: 'vibe', labelKey: 'chat.chatInput.mode.vibe' },
  { value: 'goal', labelKey: 'chat.chatInput.mode.goal' },
] as const;



export const DefaultsSettings: React.FC = () => {
  const directory = useSettingsDirectory();
  return <DefaultsSettingsContent key={directory} directory={directory} />;
};

const DefaultsSettingsContent: React.FC<{ directory: string | null }> = ({ directory }) => {
  const { t } = useI18n();

  const showChatsSection = useSessionDisplayStore((state) => state.showChatsSection);
  const setShowChatsSection = useSessionDisplayStore((state) => state.setShowChatsSection);
  const defaultSessionMode = useUIStore((state) => state.defaultSessionMode);
  const setDefaultSessionMode = useUIStore((state) => state.setDefaultSessionMode);
  const { state: ompState, loading, saving: isSavingOmp, updateSettings, updateSetting: handleOmpChange, getSectionSettings } = useOmpPageSettings('sessions');
  const ompStateFailed = Boolean(directory && !loading && !ompState);
  // The catalog loader already read this directory's models; a second fetch
  // here duplicated the slowest request the Settings page made.
  const models = useSettingsModels(directory);
  const chatsDefaultModel = useConfigStore((state) => state.chatsDefaultModel);
  const chatsDefaultVariant = useConfigStore((state) => state.chatsDefaultVariant);
  const chatsDefaultsLoaded = useConfigStore((state) => state.settingsDefaultsLoaded);
  const setChatsDefaultModel = useConfigStore((state) => state.setChatsDefaultModel);
  const setChatsDefaultVariant = useConfigStore((state) => state.setChatsDefaultVariant);
  const modelRolesSetting = ompState?.settings.find((s) => s.id === 'modelRoles');
  const rolesMap = React.useMemo(
    () => parseRolesRecord(modelRolesSetting?.value),
    [modelRolesSetting?.value],
  );
  /** The selector each role currently shows; arrays keep their first entry. */
  const roleSelectors = React.useMemo(
    () => Object.fromEntries(Object.entries(rolesMap).map(([role, value]) => [role, roleSelector(value)])),
    [rolesMap],
  );

  const { model: selectedModelId, effort: selectedEffort } = React.useMemo(
    () => splitRoleSelector(roleSelectors.default, models),
    [roleSelectors.default, models],
  );

  const matchedModel = React.useMemo(
    () => modelForSelector(models, selectedModelId),
    [models, selectedModelId],
  );

  /**
   * OMP's session-wide thinking level, which is what a model with no level of
   * its own resolves to. The page shows it as the default model's effort
   * control, so a user picks one level rather than two competing defaults.
   */
  const configuredThinkingLevel = React.useMemo(() => {
    const value = ompState?.settings.find((s) => s.id === 'defaultThinkingLevel')?.value;
    return typeof value === 'string' ? value : '';
  }, [ompState]);

  const setRole = React.useCallback(
    async (role: string, selector: string, also: OmpSettingsChange[] = []) => {
      const saved = await updateSettings((state) => [modelRoleChange(state, role, selector), ...also]);
      if (saved) refreshDirectoryCatalogs();
    },
    [updateSettings],
  );

  const handleDefaultModelChange = (selector: string) => void setRole('default', selector);
  const handleDefaultEffortChange = (level: string) => {
    const selector = formatRoleSelector(selectedModelId, level);
    if (selector) {
      void setRole('default', selector, [{ id: 'defaultThinkingLevel', value: level || null }]);
    } else {
      void handleOmpChange('defaultThinkingLevel', level || null);
    }
  };

  /** The walkthrough resolves its model through the native `slow` role. */
  const setWalkthroughModel = React.useCallback(
    (selector: string) => setRole('slow', selector || ''),
    [setRole],
  );

  /**
   * What a closed trigger shows for a selector. `SelectValue` otherwise prints
   * the raw value, so sentinels (`__inherit__`, `__none__`), raw mode ids and
   * custom selectors would leak into the control.
   */
  const selectorLabel = (selector: string): string => {
    const model = models.find((m) => formatModelRef(m) === selector);
    if (model) return `${model.name || model.modelId} (${model.provider})`;
    const mode = SESSION_MODE_OPTIONS.find((opt) => opt.value === selector);
    if (mode) return t(mode.labelKey);
    return `${selector} (${t('settings.omp.modelRoles.customModel')})`;
  };

  /**
   * Small and walkthrough models are opt-outs: the toggle is what turns the
   * native role on, so a user can uncheck it before any cheap model exists.
   * The choice is local until it is written; the role remains unset meanwhile.
   */
  const [smallModelChoice, setSmallModelChoice] = React.useState<string | undefined>(undefined);
  const usesOwnSmallModel = Boolean(roleSelectors.smol) || smallModelChoice !== undefined;
  const [walkthroughChoice, setWalkthroughChoice] = React.useState<string | undefined>(undefined);
  const usesOwnWalkthroughModel = Boolean(roleSelectors.slow) || walkthroughChoice !== undefined;

  /**
   * The native retry fallback chain for the `default` selector, which is what
   * actually continues a session when a usage limit stops it. Writing
   * `retry.fallbackChains` keeps every other chain and wildcard entry intact.
   */
  const chains = parseRolesRecord(ompState?.settings.find((setting) => setting.id === 'retry.fallbackChains')?.value);
  const defaultChain = Array.isArray(chains.default) ? chains.default : [];
  const fallback = typeof defaultChain[0] === 'string' ? defaultChain[0] : '';

  const updateFallbackChain = (selector: string) => updateSettings((state) => {
    const latestChains = parseRolesRecord(state.settings.find((setting) => setting.id === 'retry.fallbackChains')?.value);
    const tail = Array.isArray(latestChains.default) ? latestChains.default.slice(1) : [];
    if (selector) latestChains.default = [selector, ...tail];
    else if (tail.length) latestChains.default = tail;
    else delete latestChains.default;
    return selector
      ? [{ id: 'retry.fallbackChains', value: latestChains }, { id: 'retry.modelFallback', value: true }]
      : [{ id: 'retry.fallbackChains', value: latestChains }];
  });

  const fallbackSelect = (): React.ReactNode => (
    <Select
      value={fallback || '__none__'}
      onValueChange={(val) => void updateFallbackChain(val === '__none__' ? '' : val)}
      disabled={isSavingOmp || !ompState}
    >
      <SelectTrigger
        className={SETTINGS_WIDTH_SELECT_CLASS}
        aria-label={t('settings.openchamber.defaults.field.fallbackModel')}
      >
        <SelectValue placeholder={t('settings.openchamber.defaults.field.fallbackModelNone')}>
          {fallback ? selectorLabel(fallback) : t('settings.openchamber.defaults.field.fallbackModelNone')}
          {defaultChain.length > 1 && <span title={defaultChain.slice(1).join(', ')}> +{defaultChain.length - 1}</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">{t('settings.openchamber.defaults.field.fallbackModelNone')}</SelectItem>
        {models.map((m) => {
          const id = formatModelRef(m);
          return (
            <SelectItem key={id} value={id}>
              {m.name || m.modelId} ({m.provider})
            </SelectItem>
          );
        })}
        {fallback && !models.some((m) => formatModelRef(m) === fallback) && (
          <SelectItem value={fallback}>
            {fallback} ({t('settings.omp.modelRoles.customModel')})
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );

  const planModeAllowAgents = useUIStore((state) => state.planModeAllowAgents);
  const setPlanModeAllowAgents = useUIStore((state) => state.setPlanModeAllowAgents);
  const sessionGoalDefaultBudgetEnabled = useUIStore((state) => state.sessionGoalDefaultBudgetEnabled);
  const setSessionGoalDefaultBudgetEnabled = useUIStore((state) => state.setSessionGoalDefaultBudgetEnabled);
  const sessionGoalDefaultBudget = useUIStore((state) => state.sessionGoalDefaultBudget);
  const setSessionGoalDefaultBudget = useUIStore((state) => state.setSessionGoalDefaultBudget);

  const getSectionRows = (section: string) => getSectionSettings(section)
    .filter((setting) => setting.id !== 'retry.fallbackChains');

  return (
    <>
      {/* The section anchor is the model-roles record itself: the three editors
          below all write `modelRoles`, and the OMP settings table names
          `omp.modelRoles` as that record's owner. Stamping the record here is
          what makes that claim name a real control rather than a search entry. */}
      <SettingsSection title={t('settings.openchamber.defaults.title')} divider={false} settingsItem="omp.modelRoles">
        {ompStateFailed && (
          // A read failure is a notice, not a control: it carries no settings
          // anchor, because every anchor is a jump target the search index must
          // name, and listing a failure notice there would target nothing.
          <SettingsInset>
            <p className="text-xs text-muted-foreground" role="status">
              {t('settings.openchamber.spaces.idleStop.loadFailed')}
            </p>
          </SettingsInset>
        )}
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          <ModelRoleEditor
            role="default"
            roles={roleSelectors}
            models={models}
            directory={directory ?? undefined}
            globalLevel={configuredThinkingLevel || undefined}
            settingsItem="sessions.default-model"
            disabled={isSavingOmp || !ompState}
            loading={!ompState && !ompStateFailed}
            label={t('settings.openchamber.defaults.field.defaultModel')}
            onChange={handleDefaultModelChange}
          />
          <SettingsFieldRow
            settingsItem="sessions.default-thinking"
            label={t('settings.openchamber.defaults.field.defaultThinking')}
            info={t('settings.omp.modelRoles.thinkingDefaultInfo')}
          >
            {matchedModel ? (
              <ModelEffortPicker
                model={matchedModel}
                effort={selectedEffort || configuredThinkingLevel}
                ariaLabel={t('settings.openchamber.defaults.field.defaultThinking')}
                disabled={isSavingOmp || !ompState}
                onChange={handleDefaultEffortChange}
              />
            ) : (
              <SettingsChipGroup
                value={configuredThinkingLevel || 'off'}
                aria-label={t('settings.openchamber.defaults.field.defaultThinking')}
                options={['off', 'low', 'medium', 'high'].map((level) => ({
                  value: level,
                  label: t(`settings.omp.modelRoles.effort.${level}` as I18nKey),
                }))}
                onChange={handleDefaultEffortChange}
              />
            )}
          </SettingsFieldRow>

          <ModelRoleEditor
            role="chats"
            roles={{ chats: formatRoleSelector(chatsDefaultModel || '', chatsDefaultVariant || '') }}
            models={models}
            directory={directory ?? undefined}
            settingsItem="sessions.chats-default-model"
            globalLevel={configuredThinkingLevel || undefined}
            label={t('settings.openchamber.defaults.field.chatsDefaultModel')}
            disabled={!chatsDefaultsLoaded}
            loading={!chatsDefaultsLoaded}
            onChange={(selector) => {
              const { model, effort } = splitRoleSelector(selector, models);
              setChatsDefaultModel(model || undefined);
              setChatsDefaultVariant(effort || undefined);
            }}
          />
          <SettingsFieldRow
            settingsItem="sessions.default-mode"
            label={t('chat.chatInput.mode.label')}
          >
            <Select value={defaultSessionMode} onValueChange={(val) => setDefaultSessionMode(val as SessionModeValue)}>
              <SelectTrigger
                className={SETTINGS_WIDTH_SELECT_CLASS}
                aria-label={t('chat.chatInput.mode.label')}
              >
                <SelectValue>{selectorLabel(defaultSessionMode)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SESSION_MODE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsFieldRow>

          <SettingsFieldRow
            settingsItem="sessions.fallback-model"
            label={t('settings.openchamber.defaults.field.fallbackModel')}
            info={t('settings.openchamber.defaults.field.fallbackModelInfo')}
          >
            {fallbackSelect()}
          </SettingsFieldRow>
        </div>
      </SettingsSection>

      {/* Models the app runs on its own: summaries, titles, the walkthrough. */}
      <SettingsSection title={t('settings.layout.sessions.helperModels.title')} contentClassName={SETTINGS_SPACE_ROW_CLASS}>
        <SettingsCheckboxRow
          settingsItem="sessions.small-model"
          checked={!usesOwnSmallModel}
          onChange={(useDefault) => {
            if (useDefault) { setRole('smol', ''); setSmallModelChoice(undefined); return; }
            // Off: write the `smol` role so the picker is usable at once. The
            // local choice is the model the user picked; the session default
            // seeds it, and it stays `''` until one exists.
            setSmallModelChoice('__pending__');
            setRole('smol', roleSelectors.default ?? '');
          }}
          label={t('settings.openchamber.defaults.smallModel.useDefault')}
          ariaLabel={t('settings.openchamber.defaults.smallModel.useDefaultAria')}
          info={t('settings.openchamber.defaults.smallModel.description')}
        />
        <ModelRoleEditor
          role="smol"
          roles={roleSelectors}
          models={models}
          directory={directory ?? undefined}
          globalLevel={configuredThinkingLevel || undefined}
          settingsItem="sessions.small-model"
          disabled={!usesOwnSmallModel || isSavingOmp || !ompState}
          loading={!ompState && !ompStateFailed}
          label={t('settings.openchamber.defaults.smallModel.title')}
          onChange={(selector) => setRole('smol', selector)}
        />
        <SettingsCheckboxRow
          settingsItem="sessions.walkthrough-use-default"
          checked={!usesOwnWalkthroughModel}
          onChange={(useDefault) => {
            if (useDefault) { setWalkthroughModel(''); setWalkthroughChoice(undefined); return; }
            setWalkthroughChoice('__pending__');
            setWalkthroughModel(roleSelectors.default ?? '');
          }}
          label={t('settings.openchamber.defaults.walkthroughModel.useDefault')}
          ariaLabel={t('settings.openchamber.defaults.walkthroughModel.useDefault')}
          info={t('settings.openchamber.defaults.walkthroughModel.useDefaultInfo')}
        />
        <ModelRoleEditor
          role="slow"
          roles={roleSelectors}
          models={models}
          directory={directory ?? undefined}
          globalLevel={configuredThinkingLevel || undefined}
          settingsItem="sessions.walkthrough-model"
          disabled={!usesOwnWalkthroughModel || isSavingOmp || !ompState}
          loading={!ompState && !ompStateFailed}
          label={t('settings.openchamber.defaults.walkthroughModel.title')}
          info={t('settings.openchamber.defaults.walkthroughModel.description')}
          onChange={(selector) => setWalkthroughModel(selector)}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.sessions.permissions.defaultMode')}>
        <PermissionDefaultModeField />
      </SettingsSection>
      {/* Plan & Goal Modes */}
      <SettingsSection
        title={t('settings.omp.group.modes.label')}
        description={t('settings.omp.section.modes.description')}
        settingsItem="sessions.plan-goal"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {/* The composer disables Plan when the workspace catalog says the
              `plan` role is unresolvable; this is the one control that writes
              that role, so it sits with the modes it unlocks. */}
          <ModelRoleEditor
            role="plan"
            roles={roleSelectors}
            models={models}
            directory={directory ?? undefined}
            globalLevel={configuredThinkingLevel || undefined}
            settingsItem="sessions.default-plan"
            disabled={isSavingOmp || !ompState}
            loading={!ompState && !ompStateFailed}
            label={t('settings.openchamber.defaults.planModel.title')}
            info={t('settings.openchamber.defaults.planModel.description')}
            onChange={(selector) => setRole('plan', selector)}
          />
          {getSectionRows('plan').map((s) => (
            <OmpRowControl
              key={s.id}
              setting={s}
              value={s.value}
              disabled={isSavingOmp}
              onChange={(val) => void handleOmpChange(s.id, val)}
            />
          ))}
          <SettingsCheckboxRow
            settingsItem="sessions.plan-mode-allow-agents"
            checked={planModeAllowAgents}
            onChange={(checked) => {
              setPlanModeAllowAgents(checked);
              void updateDesktopSettings({ planModeAllowAgents: checked });
            }}
            label={t('settings.openchamber.defaults.field.planModeAllowAgents')}
            ariaLabel={t('settings.openchamber.defaults.field.planModeAllowAgentsAria')}
            info={t('settings.openchamber.defaults.field.planModeAllowAgentsInfo')}
          />
          {ompState?.settings.find((s) => s.id === 'goal.enabled')?.value === true ? (
            <div className={`ps-6 pt-2 ${SETTINGS_SPACE_ROW_CLASS}`}>
              <SessionGoalCheckerField />
              <SessionGoalMaxTurnsField />
              <SettingsFieldRow
                label={
                  <SettingsCheckboxRow
                    checked={sessionGoalDefaultBudgetEnabled}
                    onChange={(checked) => {
                      setSessionGoalDefaultBudgetEnabled(checked);
                      void updateDesktopSettings({ sessionGoalDefaultBudgetEnabled: checked });
                    }}
                    label={t('settings.openchamber.visual.goal.budgetLabel')}
                    ariaLabel={t('settings.openchamber.visual.goal.budgetAria')}
                  />
                }
                settingsItem="chat.session-goal-budget"
              >
                <div className={SETTINGS_NUMBER_STEPPER_ROW_CLASS}>
                  <NumberInput
                    value={sessionGoalDefaultBudget}
                    onValueChange={(value) => {
                      if (Number.isFinite(value) && value > 0) {
                        setSessionGoalDefaultBudget(Math.floor(value));
                        void updateDesktopSettings({ sessionGoalDefaultBudget: Math.floor(value) });
                      }
                    }}
                    min={1000}
                    max={100000000}
                    step={50000}
                    disabled={!sessionGoalDefaultBudgetEnabled}
                    className={SETTINGS_WIDTH_NUMBER_CLASS}
                    aria-label={t('settings.openchamber.visual.goal.budgetAria')}
                  />
                </div>
              </SettingsFieldRow>
            </div>
          ) : null}
        </div>
      </SettingsSection>

      {/* Sampling */}
      <SettingsSection
        title={t('settings.sessions.section.sampling.title')}
        description={t('settings.sessions.section.sampling.description')}
        settingsItem="sessions.sampling"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {getSectionRows('sampling').map((s) => (
            <OmpRowControl
              key={s.id}
              setting={s}
              value={s.value}
              disabled={isSavingOmp}
              onChange={(val) => void handleOmpChange(s.id, val)}
            />
          ))}
        </div>
      </SettingsSection>

      {/* Context handling */}
      <SettingsSection
        title={t('settings.sessions.section.context.title')}
        description={t('settings.sessions.section.context.description')}
        settingsItem="sessions.context"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {getSectionRows('context').map((s) => (
            <OmpRowControl
              key={s.id}
              setting={s}
              value={s.value}
              disabled={isSavingOmp}
              onChange={(val) => void handleOmpChange(s.id, val)}
            />
          ))}
        </div>
      </SettingsSection>

      {/* Startup */}
      <SettingsSection
        title={t('settings.sessions.section.startup.title')}
        description={t('settings.sessions.section.startup.description')}
        settingsItem="sessions.startup"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {getSectionRows('general').map((s) => (
            <OmpRowControl
              key={s.id}
              setting={s}
              value={s.value}
              disabled={isSavingOmp}
              onChange={(val) => void handleOmpChange(s.id, val)}
            />
          ))}
        </div>
      </SettingsSection>

      {/* Execution, Steering & Follow-up */}
      <SettingsSection
        title={t('settings.sessions.section.execution.title')}
        description={t('settings.sessions.section.execution.description')}
        settingsItem="sessions.execution"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {getSectionRows('execution').map((s) => (
            <OmpRowControl
              key={s.id}
              setting={s}
              value={s.value}
              disabled={isSavingOmp}
              onChange={(val) => void handleOmpChange(s.id, val)}
            />
          ))}
        </div>
      </SettingsSection>

      {/* Context Compaction */}
      <SettingsSection
        title={t('settings.omp.group.compaction.label')}
        description={t('settings.omp.section.compaction.description')}
        settingsItem="sessions.compaction"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {getSectionRows('compaction').map((s) => (
            <OmpRowControl
              key={s.id}
              setting={s}
              value={s.value}
              disabled={isSavingOmp}
              onChange={(val) => void handleOmpChange(s.id, val)}
            />
          ))}
        </div>
      </SettingsSection>

      {/* Retry & Model Fallback */}
      <SettingsSection
        title={t('settings.omp.group.retry_fallback.label')}
        description={t('settings.omp.section.retry.description')}
        settingsItem="sessions.retry"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {getSectionRows('retry').map((s) => (
            <OmpRowControl
              key={s.id}
              setting={s}
              value={s.value}
              disabled={isSavingOmp}
              onChange={(val) => void handleOmpChange(s.id, val)}
            />
          ))}
        </div>
      </SettingsSection>

      {/* Worktree & Isolation */}
      <SettingsSection
        title={t('settings.sessions.section.isolation.title')}
        description={t('settings.sessions.section.isolation.description')}
        settingsItem="sessions.isolation"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {[...getSectionRows('isolation'), ...getSectionRows('worktree')].map((s) => (
            <OmpRowControl
              key={s.id}
              setting={s}
              value={s.value}
              disabled={isSavingOmp}
              onChange={(val) => void handleOmpChange(s.id, val)}
            />
          ))}
        </div>
      </SettingsSection>

      {/* Session Titles */}
      <SettingsSection
        title={t('settings.sessions.section.title.title')}
        description={t('settings.sessions.section.title.description')}
        settingsItem="sessions.title"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {getSectionRows('title').map((s) => (
            <OmpRowControl
              key={s.id}
              setting={s}
              value={s.value}
              disabled={isSavingOmp}
              onChange={(val) => void handleOmpChange(s.id, val)}
            />
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.openchamber.visual.section.sessionAssistance')}>
        <SettingsInset className={SETTINGS_SPACE_ROW_CLASS}>
          <SessionWarmingCheckbox />
          <SessionWarmingField />
          <SettingsCheckboxRow
            settingsItem="sessions.show-chats"
            checked={showChatsSection}
            onChange={(checked) => {
              setShowChatsSection(checked);
              void updateDesktopSettings({ sidebarShowChatsSection: checked });
            }}
            label={t('settings.openchamber.defaults.field.showChats')}
            ariaLabel={t('settings.openchamber.defaults.field.showChats')}
          />
        </SettingsInset>
      </SettingsSection>
    </>
  );
};
