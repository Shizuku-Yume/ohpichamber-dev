import React from 'react';
<<<<<<< HEAD
import { CanonicalApiError, canonicalClient } from '@/api/canonicalClient';
import { formatModelRef } from '@openchamber/agent-contract';
import type { JsonValue, OmpSettingsChange, OmpSettingsState } from '@openchamber/agent-contract';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
||||||| bc50ba56aa
import { ModelSelector } from '@/components/sections/agents/ModelSelector';
import { AgentSelector } from '@/components/sections/commands/AgentSelector';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
=======
import { ModelSelector } from '@/components/sections/agents/ModelSelector';
import { AgentSelector } from '@/components/sections/commands/AgentSelector';
>>>>>>> upstream/main
import {
  SettingsSection,
  SettingsFieldRow,
  SettingsCheckboxRow,
<<<<<<< HEAD
  SettingsInset,
  SettingsChipGroup,
  SETTINGS_WIDTH_NUMBER_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
  SETTINGS_NUMBER_STEPPER_ROW_CLASS,
||||||| bc50ba56aa
  SETTINGS_CUSTOM_TRIGGER_CLASS,
  SETTINGS_HELPER_CLASS,
  SETTINGS_SELECT_ROW_TRIGGER_CLASS,
=======
  SETTINGS_CUSTOM_TRIGGER_CLASS,
  SETTINGS_HELPER_CLASS,
>>>>>>> upstream/main
} from '@/components/sections/shared/SettingsSection';
import { NumberInput } from '@/components/ui/number-input';
import { OmpRowControl } from '@/components/sections/shared/OmpRowControl';
import { SessionGoalCheckerField, SessionGoalMaxTurnsField } from './SessionGoalCheckerField';
import { ModelEffortPicker, ModelRoleEditor } from '@/components/sections/shared/ModelRoleEditor';
import { changedRoles, formatRoleSelector, modelForSelector, parseRolesRecord, roleSelector, splitRoleSelector } from '@/components/sections/shared/modelRoleSelectors';
import { SessionWarmingCheckbox } from './SessionWarmingCheckbox';
import { SessionWarmingField } from './SessionWarmingField';
import { PermissionDefaultModeField } from './PermissionDefaultModeField';
<<<<<<< HEAD
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { updateDesktopSettings } from '@/lib/persistence';
import { useSessionDisplayStore } from '@/stores/useSessionDisplayStore';
||||||| bc50ba56aa
import { isVSCodeRuntime } from '@/lib/desktop';
import { loadDesktopSettings, updateDesktopSettings } from '@/lib/persistence';
import { useConfigStore } from '@/stores/useConfigStore';
=======
import { isVSCodeRuntime } from '@/lib/desktop';
import { loadDesktopSettings, updateDesktopSettings } from '@/lib/persistence';
import { selectIsModelMissingFromCatalog, useConfigStore } from '@/stores/useConfigStore';
>>>>>>> upstream/main
import { useUIStore } from '@/stores/useUIStore';
<<<<<<< HEAD
import { useSettingsModels } from '@/hooks/useSettingsModels';
import { refreshDirectoryCatalogs } from '@/sync/sync-refs';
||||||| bc50ba56aa
import { useSelectionStore } from '@/sync/selection-store';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useI18n } from '@/lib/i18n';
import { parseModelIdentifier } from '@/lib/modelIdentifier';
import { isAutoModel } from '@/lib/routing/autoModel';
import { useCallableModelProviders } from '@/hooks/useCallableModelProviders';
import { isPrimaryMode } from '@/components/chat/mobileControlsUtils';
import { listModelVariantIds, type ModelVariantSource } from '@/lib/modelVariants';
=======
import { useSelectionStore } from '@/sync/selection-store';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useI18n } from '@/lib/i18n';
import { parseModelIdentifier } from '@/lib/modelIdentifier';
import { isAutoModel } from '@/lib/routing/autoModel';
import { useCallableModelProviders } from '@/hooks/useCallableModelProviders';
import { isPrimaryMode } from '@/components/chat/mobileControlsUtils';
import { listModelVariantIds, type ModelVariantSource } from '@/lib/modelVariants';
import { ModelVariantSelect } from './ModelVariantSelect';
>>>>>>> upstream/main


type SessionModeValue = 'main' | 'plan' | 'vibe' | 'goal';

const SESSION_MODE_OPTIONS: readonly { value: SessionModeValue; labelKey: I18nKey }[] = [
  { value: 'main', labelKey: 'chat.chatInput.mode.main' },
  { value: 'plan', labelKey: 'chat.chatInput.mode.plan' },
  { value: 'vibe', labelKey: 'chat.chatInput.mode.vibe' },
  { value: 'goal', labelKey: 'chat.chatInput.mode.goal' },
] as const;

<<<<<<< HEAD


||||||| bc50ba56aa
const DEFAULT_VARIANT_VALUE = '__default__';

/**
 * The thinking level beside a model picker, shown only when that model has
 * levels. A saved level also keeps it on screen while the catalog loads, so
 * the choice never looks lost.
 */
const ModelVariantSelect: React.FC<{
  variants: string[];
  value: string | undefined;
  onChange: (variant: string | undefined) => void;
  ariaLabel: string;
}> = ({ variants, value, onChange, ariaLabel }) => {
  const { t } = useI18n();
  if (variants.length === 0 && !value) return null;
  const label = (variant: string) => (variant === DEFAULT_VARIANT_VALUE
    ? t('settings.openchamber.defaults.option.default')
    : variant.charAt(0).toUpperCase() + variant.slice(1));
  return (
    <Select
      value={value ?? DEFAULT_VARIANT_VALUE}
      onValueChange={(next) => onChange(next === DEFAULT_VARIANT_VALUE ? undefined : next || undefined)}
      disabled={variants.length === 0}
    >
      <SelectTrigger className={SETTINGS_SELECT_ROW_TRIGGER_CLASS} aria-label={ariaLabel}>
        <SelectValue placeholder={t('settings.openchamber.defaults.field.thinkingPlaceholder')}>
          {label(value ?? DEFAULT_VARIANT_VALUE)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT_VARIANT_VALUE}>{label(DEFAULT_VARIANT_VALUE)}</SelectItem>
        {variants.map((variant) => (
          <SelectItem key={variant} value={variant}>{label(variant)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

=======
>>>>>>> upstream/main
export const DefaultsSettings: React.FC = () => {
  const { t } = useI18n();
<<<<<<< HEAD
  const directory = useSettingsDirectory();
||||||| bc50ba56aa
  const setProvider = useConfigStore((state) => state.setProvider);
  const setModel = useConfigStore((state) => state.setModel);
  const setAgent = useConfigStore((state) => state.setAgent);
  const setCurrentVariant = useConfigStore((state) => state.setCurrentVariant);
  const setCurrentVariantOverride = useConfigStore((state) => state.setCurrentVariantOverride);
  const setSettingsDefaultModel = useConfigStore((state) => state.setSettingsDefaultModel);
  const setSettingsDefaultVariant = useConfigStore((state) => state.setSettingsDefaultVariant);
  const setSettingsDefaultAgent = useConfigStore((state) => state.setSettingsDefaultAgent);
  // A default describes new sessions. Applying it to the open chat is a
  // convenience, not the point, so it stops where the chat carries a choice the
  // user made for it — the same pair of signals ModelControls restores from
  // (`shouldPreserveManualModelOverride`).
  const selectionIsManual = useConfigStore((state) => state.selectionSource === 'manual');
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const getSessionModelSelection = useSelectionStore((state) => state.getSessionModelSelection);
  const getSessionAgentSelection = useSelectionStore((state) => state.getSessionAgentSelection);
  const agentIsPicked = useConfigStore((state) => state.agentSelectionSource === 'manual');
  // An agent picked for this chat brings the model its config pins, and a pin
  // outranks the global default the same way it does in `setAgent`.
  const pickedAgentPinsModel = useConfigStore((state) => {
    if (state.agentSelectionSource !== 'manual') return false;
    const agent = state.agents.find((candidate) => candidate.name === state.currentAgentName);
    return Boolean(agent?.model?.providerID && agent.model.id);
  });
  const chatHasOwnModel = Boolean(
    pickedAgentPinsModel
    || (selectionIsManual && currentSessionId && getSessionModelSelection(currentSessionId)),
  );
  const chatHasOwnAgent = Boolean(
    agentIsPicked && currentSessionId && getSessionAgentSelection(currentSessionId),
  );
  const isVSCode = React.useMemo(() => isVSCodeRuntime(), []);
  const requestSettingsJump = useUIStore((state) => state.requestSettingsJump);
  const providers = useConfigStore((state) => state.providers);
  const modelsMetadata = useConfigStore((state) => state.modelsMetadata);
=======
  const setProvider = useConfigStore((state) => state.setProvider);
  const setModel = useConfigStore((state) => state.setModel);
  const setAgent = useConfigStore((state) => state.setAgent);
  const setCurrentVariant = useConfigStore((state) => state.setCurrentVariant);
  const setCurrentVariantOverride = useConfigStore((state) => state.setCurrentVariantOverride);
  const setSettingsDefaultModel = useConfigStore((state) => state.setSettingsDefaultModel);
  const setSettingsDefaultVariant = useConfigStore((state) => state.setSettingsDefaultVariant);
  const setSettingsDefaultAgent = useConfigStore((state) => state.setSettingsDefaultAgent);
  const selectionIsManual = useConfigStore((state) => state.selectionSource === 'manual');
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const getSessionModelSelection = useSelectionStore((state) => state.getSessionModelSelection);
  const getSessionAgentSelection = useSelectionStore((state) => state.getSessionAgentSelection);
  const agentIsPicked = useConfigStore((state) => state.agentSelectionSource === 'manual');
  const pickedAgentPinsModel = useConfigStore((state) => {
    if (state.agentSelectionSource !== 'manual') return false;
    const agent = state.agents.find((candidate) => candidate.name === state.currentAgentName);
    return Boolean(agent?.model?.providerID && agent.model.id);
  });
  const chatHasOwnModel = Boolean(
    pickedAgentPinsModel
    || (selectionIsManual && currentSessionId && getSessionModelSelection(currentSessionId)),
  );
  const chatHasOwnAgent = Boolean(
    agentIsPicked && currentSessionId && getSessionAgentSelection(currentSessionId),
  );
  const isVSCode = React.useMemo(() => isVSCodeRuntime(), []);
  const requestSettingsJump = useUIStore((state) => state.requestSettingsJump);
  const providers = useConfigStore((state) => state.providers);
  const modelsMetadata = useConfigStore((state) => state.modelsMetadata);
>>>>>>> upstream/main

<<<<<<< HEAD
  const showChatsSection = useSessionDisplayStore((state) => state.showChatsSection);
  const setShowChatsSection = useSessionDisplayStore((state) => state.setShowChatsSection);
  const defaultSessionMode = useUIStore((state) => state.defaultSessionMode);
  const setDefaultSessionMode = useUIStore((state) => state.setDefaultSessionMode);
  const [ompState, setOmpState] = React.useState<OmpSettingsState | null>(null);
  // A failed settings read leaves `ompState` null, which the role editors
  // cannot tell apart from "still loading": the row would spin forever.
  const [ompStateFailed, setOmpStateFailed] = React.useState(false);
  // The catalog loader already read this directory's models; a second fetch
  // here duplicated the slowest request the Settings page made.
  const models = useSettingsModels(directory);
  const [isSavingOmp, setIsSavingOmp] = React.useState(false);
||||||| bc50ba56aa
  const [defaultModel, setDefaultModel] = React.useState<string | undefined>();
  const [defaultVariant, setDefaultVariant] = React.useState<string | undefined>();
  const [defaultAgent, setDefaultAgent] = React.useState<string | undefined>();
  const [smallModelUseDefault, setSmallModelUseDefault] = React.useState(true);
  const [smallModelOverride, setSmallModelOverride] = React.useState<string | undefined>();
  const [smallModelVariant, setSmallModelVariant] = React.useState<string | undefined>();
  // Fail closed: never offer providers whose credentials were not verified.
  const smallModelProviders = useCallableModelProviders() ?? [];
  const [walkthroughModelOverride, setWalkthroughModelOverride] = React.useState<string | undefined>();
  const [walkthroughModelVariant, setWalkthroughModelVariant] = React.useState<string | undefined>();
  const [fallbackModel, setFallbackModel] = React.useState<string | undefined>();
  const [fallbackVariant, setFallbackVariant] = React.useState<string | undefined>();
  const [isLoading, setIsLoading] = React.useState(true);
=======
  const [defaultModel, setDefaultModel] = React.useState<string | undefined>();
  const [defaultVariant, setDefaultVariant] = React.useState<string | undefined>();
  const [defaultAgent, setDefaultAgent] = React.useState<string | undefined>();
  const [smallModelUseDefault, setSmallModelUseDefault] = React.useState(true);
  const [smallModelOverride, setSmallModelOverride] = React.useState<string | undefined>();
  const [smallModelVariant, setSmallModelVariant] = React.useState<string | undefined>();
  const smallModelProviders = useCallableModelProviders() ?? [];
  const [walkthroughModelOverride, setWalkthroughModelOverride] = React.useState<string | undefined>();
  const [walkthroughModelVariant, setWalkthroughModelVariant] = React.useState<string | undefined>();
  const [fallbackModel, setFallbackModel] = React.useState<string | undefined>();
  const [fallbackVariant, setFallbackVariant] = React.useState<string | undefined>();
  const [isLoading, setIsLoading] = React.useState(true);
>>>>>>> upstream/main

<<<<<<< HEAD

  const ompStateRef = React.useRef<OmpSettingsState | null>(null);
  ompStateRef.current = ompState;
||||||| bc50ba56aa
  const parsedModel = React.useMemo(() => getDisplayModel(defaultModel), [defaultModel]);
=======
  const parsedModel = React.useMemo(() => getDisplayModel(defaultModel), [defaultModel]);
  const defaultModelMissing = useConfigStore((state) => (
    selectIsModelMissingFromCatalog(state, undefined, parsedModel.providerId, parsedModel.modelId)
  ));
>>>>>>> upstream/main

  React.useEffect(() => {
    if (!directory) {
      setOmpState(null);
      setOmpStateFailed(false);
      return;
    }

    const abort = new AbortController();
    let cancelled = false;
    setOmpStateFailed(false);

    void (async () => {
      try {
        const workspace = await canonicalClient.resolveWorkspace(directory);
        if (cancelled || abort.signal.aborted) return;
        const snapshot = await canonicalClient.getOmpSettings(workspace.workspaceId, abort.signal);
        if (cancelled || abort.signal.aborted) return;
        setOmpState(snapshot);
      } catch (err) {
        if (!cancelled && !(err instanceof Error && err.name === 'AbortError')) {
          // Failure is not loading: the row must stop spinning.
          setOmpState(null);
          setOmpStateFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [directory]);

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

<<<<<<< HEAD
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

  /**
   * Write the role record, plus any settings that must land with it. Two writes
   * from one user action would race the same revision: the first moves it and
   * the second conflicts, so the value the user picked halfway never persists.
   */
  const updateRolesOnServer = React.useCallback(
    async (nextRoles: Record<string, JsonValue>, also: OmpSettingsChange[] = []) => {
      const currentState = ompStateRef.current;
      if (!currentState) return;
      // The snapshot this write was computed against, so a 409 re-applies only
      // the entries it actually changed.
      const previousRoles = parseRolesRecord(currentState.settings.find((s) => s.id === 'modelRoles')?.value);
      setIsSavingOmp(true);
      try {
        let next: OmpSettingsState;
        try {
          next = await canonicalClient.updateOmpSettings(currentState.workspaceId, {
            expectedRevision: currentState.revision,
            changes: [{ id: 'modelRoles', value: nextRoles }, ...also],
          });
        } catch (error) {
          if (error instanceof CanonicalApiError && error.problem.status === 409) {
            const latest = await canonicalClient.getOmpSettings(currentState.workspaceId);
            const latestRoles = parseRolesRecord(latest.settings.find((s) => s.id === 'modelRoles')?.value);
            // Re-apply only the entries this write changed. Any role or fallback
            // chain someone else wrote in the newer snapshot stays untouched.
            const merged: Record<string, JsonValue> = { ...latestRoles };
            const changed = changedRoles(previousRoles, nextRoles);
            for (const [role, value] of Object.entries(changed.written)) merged[role] = value;
            for (const role of changed.removed) delete merged[role];
            next = await canonicalClient.updateOmpSettings(latest.workspaceId, {
              expectedRevision: latest.revision,
              // The accompanying values are this action's own: the newer
              // snapshot's value for them was never the user's choice.
              changes: [{ id: 'modelRoles', value: merged }, ...also],
            });
          } else {
            throw error;
||||||| bc50ba56aa
        if (providerId && modelId) {
          const provider = providers.find((p) => p.id === providerId);
          // Auto is not a provider OpenCode lists; the picker only offers it while the server can honour it.
          if (provider || isAutoModel(providerId, modelId)) {
            setProvider(providerId);
            setModel(modelId);
=======
        if (providerId && modelId) {
          const provider = providers.find((p) => p.id === providerId);
          if (provider || isAutoModel(providerId, modelId)) {
            setProvider(providerId);
            setModel(modelId);
>>>>>>> upstream/main
          }
        }
        setOmpState(next);
        // `modelRoles` lives in the shared agent directory, so this write moved
        // `planRoleAvailable` for every workspace — not only the one Settings
        // is describing. The composer reads the catalog of its session's
        // directory, which can be a managed chat or another project, so every
        // initialized directory re-reads through the bootstrap lane that owns
        // the read.
        refreshDirectoryCatalogs();
      } catch (err) {
        console.warn('Failed to update default model role:', err);
      } finally {
        setIsSavingOmp(false);
      }
    },
    [],
  );

  const handleDefaultModelChange = React.useCallback(
    (selector: string) => {
      const nextRoles = { ...rolesMap };
      if (selector) nextRoles.default = selector;
      else delete nextRoles.default;
      void updateRolesOnServer(nextRoles);
    },
    [rolesMap, updateRolesOnServer],
  );

  const handleDefaultEffortChange = React.useCallback(
    (level: string) => {
      const nextRoles = { ...rolesMap };
      const selector = formatRoleSelector(selectedModelId, level);
      if (selector) nextRoles.default = selector;
      else delete nextRoles.default;
      // Keep the session-wide level in step: a model with no configured role
      // level inherits it, so the one picker sets both in one write.
      void updateRolesOnServer(nextRoles, [{ id: 'defaultThinkingLevel', value: level || null }]);
    },
    [rolesMap, selectedModelId, updateRolesOnServer],
  );

  /**
   * Write one native model role and nothing else. `smol` is the small model,
   * `slow` the changes walkthrough. The fallback chain is not a role and is
   * written separately through `retry.fallbackChains`.
   */
  const setRole = React.useCallback(
    (role: string, selector: string) => {
      const nextRoles: Record<string, JsonValue> = { ...rolesMap };
      if (selector) nextRoles[role] = selector;
      else delete nextRoles[role];
      void updateRolesOnServer(nextRoles);
    },
    [rolesMap, updateRolesOnServer],
  );

<<<<<<< HEAD
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
  const fallbackRoles = React.useMemo(() => {
    const value = ompState?.settings.find((s) => s.id === 'retry.fallbackChains')?.value;
    const parsed = typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, JsonValue> : {};
    const chain = parsed.default;
    const first = Array.isArray(chain) && typeof chain[0] === 'string' ? chain[0] : '';
    return { chains: parsed, current: first };
  }, [ompState]);

  const updateFallbackChain = React.useCallback(
    async (selector: string) => {
      const currentState = ompStateRef.current;
      if (!currentState) return;
      const revision = currentState.revision;
      const nextChains: Record<string, JsonValue> = { ...fallbackRoles.chains };
      if (selector) {
        // One configured fallback, replacing whatever was there: a longer chain
        // would continue on models this row never shows.
        nextChains.default = [selector];
      } else {
        // "None" clears the default chain outright; leaving a later link would
        // keep continuing on a model the row says is not configured.
        delete nextChains.default;
      }
      setIsSavingOmp(true);
||||||| bc50ba56aa
  const handleSmallModelOverrideChange = React.useCallback(
    async (providerId: string, modelId: string) => {
      const newValue = providerId && modelId ? `${providerId}/${modelId}` : undefined;
      setSmallModelOverride(newValue);
      // The effort belongs to the model it was picked for.
      setSmallModelVariant(undefined);
=======
  const handleSmallModelOverrideChange = React.useCallback(
    async (providerId: string, modelId: string) => {
      const newValue = providerId && modelId ? `${providerId}/${modelId}` : undefined;
      setSmallModelOverride(newValue);
      setSmallModelVariant(undefined);
>>>>>>> upstream/main
      try {
        const next = await canonicalClient.updateOmpSettings(currentState.workspaceId, {
          expectedRevision: revision,
          changes: selector
            // The chain alone never runs while native model fallback is off.
            ? [{ id: 'retry.fallbackChains', value: nextChains }, { id: 'retry.modelFallback', value: true }]
            : [{ id: 'retry.fallbackChains', value: nextChains }],
        });
        setOmpState(next);
      } catch (err) {
        console.warn('Failed to update the fallback model:', err);
      } finally {
        setIsSavingOmp(false);
      }
    },
    [fallbackRoles.chains],
  );

  const fallbackSelect = (): React.ReactNode => (
    <Select
      value={fallbackRoles.current || '__none__'}
      onValueChange={(val) => void updateFallbackChain(val === '__none__' ? '' : val)}
      disabled={isSavingOmp || !ompState}
    >
      <SelectTrigger
        className={SETTINGS_WIDTH_SELECT_CLASS}
        aria-label={t('settings.openchamber.defaults.field.fallbackModel')}
      >
        <SelectValue placeholder={t('settings.openchamber.defaults.field.fallbackModelNone')}>
          {fallbackRoles.current ? selectorLabel(fallbackRoles.current) : t('settings.openchamber.defaults.field.fallbackModelNone')}
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
        {fallbackRoles.current && !models.some((m) => formatModelRef(m) === fallbackRoles.current) && (
          <SelectItem value={fallbackRoles.current}>
            {fallbackRoles.current} ({t('settings.omp.modelRoles.customModel')})
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

  const handleOmpChange = React.useCallback(
    async (id: string, value: JsonValue | null) => {
      const currentState = ompStateRef.current;
      if (!currentState) return;
      setIsSavingOmp(true);
      try {
        const next = await canonicalClient.updateOmpSettings(currentState.workspaceId, {
          expectedRevision: currentState.revision,
          changes: [{ id, value }],
        });
        setOmpState(next);
      } catch (err) {
        if (err instanceof CanonicalApiError && err.problem.status === 409) {
          const latest = await canonicalClient.getOmpSettings(currentState.workspaceId);
          const next = await canonicalClient.updateOmpSettings(latest.workspaceId, {
            expectedRevision: latest.revision,
            changes: [{ id, value }],
          });
          setOmpState(next);
        } else {
          console.warn(`Failed to update OMP setting ${id}:`, err);
        }
      } finally {
        setIsSavingOmp(false);
      }
    },
    [],
  );

<<<<<<< HEAD
  const getSectionRows = React.useCallback(
    (section: string) => {
      if (!ompState) return [];
      return ompState.settings.filter(
        (s) => s.placement?.type === 'page' && s.placement.page === 'sessions' && s.placement.section === section
          // A record of per-model chains has no equal-length option list, so the
          // generic row would draw an empty chip group. The fallback selector
          // above is the control that writes it.
          && s.id !== 'retry.fallbackChains',
      );
||||||| bc50ba56aa
  const handleWalkthroughModelOverrideChange = React.useCallback(
    async (providerId: string, modelId: string) => {
      const newValue = providerId && modelId ? `${providerId}/${modelId}` : undefined;
      setWalkthroughModelOverride(newValue);
      // The thinking level belongs to the model it was picked for.
      setWalkthroughModelVariant(undefined);
      try {
        // Clearing the picker is how the user goes back to the small model, so
        // an empty value is a real choice rather than a no-op.
        await updateDesktopSettings({ walkthroughModelOverride: newValue ?? '', walkthroughModelVariant: '' });
      } catch (error) {
        console.warn('Failed to save walkthrough model override:', error);
      }
=======
  const handleWalkthroughModelOverrideChange = React.useCallback(
    async (providerId: string, modelId: string) => {
      const newValue = providerId && modelId ? `${providerId}/${modelId}` : undefined;
      setWalkthroughModelOverride(newValue);
      setWalkthroughModelVariant(undefined);
      try {
        await updateDesktopSettings({ walkthroughModelOverride: newValue ?? '', walkthroughModelVariant: '' });
      } catch (error) {
        console.warn('Failed to save walkthrough model override:', error);
      }
>>>>>>> upstream/main
    },
    [ompState],
  );

<<<<<<< HEAD
||||||| bc50ba56aa
  const handleWalkthroughModelVariantChange = React.useCallback(
    async (variant: string | undefined) => {
      setWalkthroughModelVariant(variant);
      try {
        await updateDesktopSettings({ walkthroughModelVariant: variant ?? '' });
      } catch (error) {
        console.warn('Failed to save walkthrough model variant:', error);
      }
    },
    []
  );

  // Read by the server when a provider's usage limit stops a session; nothing
  // in the client changes until then.
  const handleFallbackModelChange = React.useCallback(
    async (providerId: string, modelId: string) => {
      const newValue = providerId && modelId ? `${providerId}/${modelId}` : undefined;
      setFallbackModel(newValue);
      // Thinking levels belong to a model; another model starts from its default.
      setFallbackVariant(undefined);
      try {
        await updateDesktopSettings({ fallbackModel: newValue ?? '', fallbackVariant: '' });
      } catch (error) {
        console.warn('Failed to save fallback model:', error);
      }
    },
    []
  );

  const handleFallbackVariantChange = React.useCallback(
    async (variant: string | undefined) => {
      setFallbackVariant(variant);
      try {
        await updateDesktopSettings({ fallbackVariant: variant ?? '' });
      } catch (error) {
        console.warn('Failed to save fallback thinking:', error);
      }
    },
    []
  );

  // The walkthrough cannot work at all without schema-shaped output, so models
  // the catalog says cannot do it are hidden rather than offered and then
  // refused. A missing capability is not a "no": roughly half the catalog omits
  // the field, and those models usually work.
  const isStructuredOutputCapable = React.useCallback(
    (providerId: string, modelId: string) =>
      modelsMetadata.get(`${providerId}/${modelId}`)?.structured_output !== false,
    [modelsMetadata]
  );

  const parsedSmallModel = React.useMemo(() => getDisplayModel(smallModelOverride), [smallModelOverride]);
  const parsedWalkthroughModel = React.useMemo(
    () => getDisplayModel(walkthroughModelOverride),
    [walkthroughModelOverride]
  );
  const parsedFallbackModel = React.useMemo(() => getDisplayModel(fallbackModel), [fallbackModel]);
  const variantsOf = React.useCallback((providerId: string, modelId: string) => {
    if (!providerId || !modelId) return [];
    const provider = providers.find((p) => p.id === providerId);
    const model = provider?.models.find((m: Record<string, unknown>) => (m as { id?: string }).id === modelId) as
      | { variants?: ModelVariantSource }
      | undefined;
    return listModelVariantIds(model?.variants);
  }, [providers]);
  const availableVariants = React.useMemo(
    () => variantsOf(parsedModel.providerId, parsedModel.modelId),
    [parsedModel.modelId, parsedModel.providerId, variantsOf]
  );
  const fallbackVariants = React.useMemo(
    () => variantsOf(parsedFallbackModel.providerId, parsedFallbackModel.modelId),
    [parsedFallbackModel.modelId, parsedFallbackModel.providerId, variantsOf]
  );
  const smallModelVariants = React.useMemo(
    () => variantsOf(parsedSmallModel.providerId, parsedSmallModel.modelId),
    [parsedSmallModel.modelId, parsedSmallModel.providerId, variantsOf]
  );
  const walkthroughModelVariants = React.useMemo(
    () => variantsOf(parsedWalkthroughModel.providerId, parsedWalkthroughModel.modelId),
    [parsedWalkthroughModel.modelId, parsedWalkthroughModel.providerId, variantsOf]
  );

  if (isLoading) {
    return null;
  }

=======
  const handleWalkthroughModelVariantChange = React.useCallback(
    async (variant: string | undefined) => {
      setWalkthroughModelVariant(variant);
      try {
        await updateDesktopSettings({ walkthroughModelVariant: variant ?? '' });
      } catch (error) {
        console.warn('Failed to save walkthrough model variant:', error);
      }
    },
    []
  );

  const handleFallbackModelChange = React.useCallback(
    async (providerId: string, modelId: string) => {
      const newValue = providerId && modelId ? `${providerId}/${modelId}` : undefined;
      setFallbackModel(newValue);
      setFallbackVariant(undefined);
      try {
        await updateDesktopSettings({ fallbackModel: newValue ?? '', fallbackVariant: '' });
      } catch (error) {
        console.warn('Failed to save fallback model:', error);
      }
    },
    []
  );

  const handleFallbackVariantChange = React.useCallback(
    async (variant: string | undefined) => {
      setFallbackVariant(variant);
      try {
        await updateDesktopSettings({ fallbackVariant: variant ?? '' });
      } catch (error) {
        console.warn('Failed to save fallback thinking:', error);
      }
    },
    []
  );

  const isStructuredOutputCapable = React.useCallback(
    (providerId: string, modelId: string) =>
      modelsMetadata.get(`${providerId}/${modelId}`)?.structured_output !== false,
    [modelsMetadata]
  );

  const parsedSmallModel = React.useMemo(() => getDisplayModel(smallModelOverride), [smallModelOverride]);
  const parsedWalkthroughModel = React.useMemo(
    () => getDisplayModel(walkthroughModelOverride),
    [walkthroughModelOverride]
  );
  const parsedFallbackModel = React.useMemo(() => getDisplayModel(fallbackModel), [fallbackModel]);
  const variantsOf = React.useCallback((providerId: string, modelId: string) => {
    if (!providerId || !modelId) return [];
    const provider = providers.find((p) => p.id === providerId);
    const model = provider?.models.find((m: Record<string, unknown>) => (m as { id?: string }).id === modelId) as
      | { variants?: ModelVariantSource }
      | undefined;
    return listModelVariantIds(model?.variants);
  }, [providers]);
  const availableVariants = React.useMemo(
    () => variantsOf(parsedModel.providerId, parsedModel.modelId),
    [parsedModel.modelId, parsedModel.providerId, variantsOf]
  );
  const fallbackVariants = React.useMemo(
    () => variantsOf(parsedFallbackModel.providerId, parsedFallbackModel.modelId),
    [parsedFallbackModel.modelId, parsedFallbackModel.providerId, variantsOf]
  );
  const smallModelVariants = React.useMemo(
    () => variantsOf(parsedSmallModel.providerId, parsedSmallModel.modelId),
    [parsedSmallModel.modelId, parsedSmallModel.providerId, variantsOf]
  );
  const walkthroughModelVariants = React.useMemo(
    () => variantsOf(parsedWalkthroughModel.providerId, parsedWalkthroughModel.modelId),
    [parsedWalkthroughModel.modelId, parsedWalkthroughModel.providerId, variantsOf]
  );

  if (isLoading) {
    return null;
  }

>>>>>>> upstream/main
  return (
    <>
<<<<<<< HEAD
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
||||||| bc50ba56aa
      <SettingsSection
        title={t('settings.openchamber.defaults.newSessionsTitle')}
        divider={false}
      >
        <div>
          <SettingsFieldRow
=======
      <SettingsSection
        title={t('settings.openchamber.defaults.newSessionsTitle')}
      >
        <div>
          <SettingsFieldRow
>>>>>>> upstream/main
            settingsItem="sessions.default-model"
<<<<<<< HEAD
            disabled={isSavingOmp || !ompState}
            loading={!ompState && !ompStateFailed}
            label={t('settings.openchamber.defaults.field.defaultModel')}
            onChange={handleDefaultModelChange}
          />
          <SettingsFieldRow
            settingsItem="sessions.default-thinking"
            label={t('settings.openchamber.defaults.field.defaultThinking')}
            info={t('settings.omp.modelRoles.thinkingDefaultInfo')}
||||||| bc50ba56aa
            label={t('settings.openchamber.defaults.field.model')}
=======
            label={t('settings.openchamber.defaults.field.model')}
            description={defaultModelMissing
              ? <span className="text-[var(--status-warning)]">{t('settings.openchamber.defaults.field.modelUnavailable')}</span>
              : undefined}
>>>>>>> upstream/main
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

<<<<<<< HEAD
||||||| bc50ba56aa
          {isVSCode ? null : <PermissionDefaultModeField agentName={defaultAgent} />}
        </div>
      </SettingsSection>

      {/* Models the app runs on its own: summaries, titles, the changes walkthrough. */}
      <SettingsSection title={t('settings.layout.sessions.helperModels.title')} contentClassName="space-y-2">
        <SettingsCheckboxRow
          settingsItem="sessions.small-model"
          checked={smallModelUseDefault}
          onChange={(checked) => {
            void handleSmallModelUseDefaultChange(checked);
          }}
          label={t('settings.openchamber.defaults.smallModel.useDefault')}
          ariaLabel={t('settings.openchamber.defaults.smallModel.useDefaultAria')}
          info={t('settings.openchamber.defaults.smallModel.description')}
        />
        <div>
          {!smallModelUseDefault ? (
            <>
              <SettingsFieldRow label={t('settings.openchamber.defaults.smallModel.title')}>
                <ModelSelector
                  providerId={parsedSmallModel.providerId}
                  modelId={parsedSmallModel.modelId}
                  onChange={handleSmallModelOverrideChange}
                  allowedProviderIds={smallModelProviders}
                  className={SETTINGS_CUSTOM_TRIGGER_CLASS}
                />
                <ModelVariantSelect
                  variants={smallModelVariants}
                  value={smallModelVariant}
                  onChange={handleSmallModelVariantChange}
                  ariaLabel={t('settings.openchamber.defaults.smallModel.thinking')}
                />
              </SettingsFieldRow>
            </>
          ) : null}
          <SettingsFieldRow
            settingsItem="sessions.walkthrough-model"
            label={t('settings.openchamber.defaults.walkthroughModel.title')}
            info={t('settings.openchamber.defaults.walkthroughModel.description')}
          >
            <ModelSelector
              providerId={parsedWalkthroughModel.providerId}
              modelId={parsedWalkthroughModel.modelId}
              onChange={handleWalkthroughModelOverrideChange}
              allowedProviderIds={smallModelProviders}
              isModelAllowed={isStructuredOutputCapable}
              placeholder={t('settings.openchamber.defaults.walkthroughModel.usesSmallModel')}
              className={SETTINGS_CUSTOM_TRIGGER_CLASS}
            />
            <ModelVariantSelect
              variants={walkthroughModelVariants}
              value={walkthroughModelVariant}
              onChange={handleWalkthroughModelVariantChange}
              ariaLabel={t('settings.openchamber.defaults.smallModel.thinking')}
            />
          </SettingsFieldRow>
        </div>
      </SettingsSection>

      {/* The managed OpenCode plugin does both switches; VS Code runs its own OpenCode without it. */}
      {isVSCode ? null : (
        <SettingsSection title={t('settings.openchamber.defaults.usageLimitsTitle')} contentClassName="space-y-1">
=======
          {isVSCode ? null : <PermissionDefaultModeField agentName={defaultAgent} />}
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.layout.sessions.helperModels.title')} contentClassName="space-y-2">
        <SettingsCheckboxRow
          settingsItem="sessions.small-model"
          checked={smallModelUseDefault}
          onChange={(checked) => {
            void handleSmallModelUseDefaultChange(checked);
          }}
          label={t('settings.openchamber.defaults.smallModel.useDefault')}
          ariaLabel={t('settings.openchamber.defaults.smallModel.useDefaultAria')}
          info={t('settings.openchamber.defaults.smallModel.description')}
        />
        <div>
          {!smallModelUseDefault ? (
            <>
              <SettingsFieldRow label={t('settings.openchamber.defaults.smallModel.title')}>
                <ModelSelector
                  providerId={parsedSmallModel.providerId}
                  modelId={parsedSmallModel.modelId}
                  onChange={handleSmallModelOverrideChange}
                  allowedProviderIds={smallModelProviders}
                  className={SETTINGS_CUSTOM_TRIGGER_CLASS}
                />
                <ModelVariantSelect
                  variants={smallModelVariants}
                  value={smallModelVariant}
                  onChange={handleSmallModelVariantChange}
                  ariaLabel={t('settings.openchamber.defaults.smallModel.thinking')}
                />
              </SettingsFieldRow>
            </>
          ) : null}
          <SettingsFieldRow
            settingsItem="sessions.walkthrough-model"
            label={t('settings.openchamber.defaults.walkthroughModel.title')}
            info={t('settings.openchamber.defaults.walkthroughModel.description')}
          >
            <ModelSelector
              providerId={parsedWalkthroughModel.providerId}
              modelId={parsedWalkthroughModel.modelId}
              onChange={handleWalkthroughModelOverrideChange}
              allowedProviderIds={smallModelProviders}
              isModelAllowed={isStructuredOutputCapable}
              placeholder={t('settings.openchamber.defaults.walkthroughModel.usesSmallModel')}
              className={SETTINGS_CUSTOM_TRIGGER_CLASS}
            />
            <ModelVariantSelect
              variants={walkthroughModelVariants}
              value={walkthroughModelVariant}
              onChange={handleWalkthroughModelVariantChange}
              ariaLabel={t('settings.openchamber.defaults.smallModel.thinking')}
            />
          </SettingsFieldRow>
        </div>
      </SettingsSection>

      {isVSCode ? null : (
        <SettingsSection title={t('settings.openchamber.defaults.usageLimitsTitle')} contentClassName="space-y-1">
>>>>>>> upstream/main
          <SettingsFieldRow
            settingsItem="sessions.fallback-model"
            label={t('settings.openchamber.defaults.field.fallbackModel')}
            info={t('settings.openchamber.defaults.field.fallbackModelInfo')}
          >
            {fallbackSelect()}
          </SettingsFieldRow>
<<<<<<< HEAD
        </div>
||||||| bc50ba56aa
          {/* Account switching comes first and lives on each provider's page; without this line nobody finds it from here. */}
          <p className={SETTINGS_HELPER_CLASS}>
            {t('settings.openchamber.defaults.usageLimits.accountSwitching')}
            {' '}
            <SettingsInlineLink onClick={() => requestSettingsJump('providers')}>
              {t('settings.openchamber.defaults.usageLimits.openProviders')}
            </SettingsInlineLink>
          </p>
        </SettingsSection>
      )}

      <SettingsSection title={t('settings.openchamber.defaults.promptCacheTitle')}>
        {/* VS Code has no OpenChamber server to warm chosen sessions: OpenCode's switch for all of them only. */}
        {isVSCode ? <SessionWarmingCheckbox /> : <SessionWarmingModeField />}
=======
          <p className={SETTINGS_HELPER_CLASS}>
            {t('settings.openchamber.defaults.usageLimits.accountSwitching')}
            {' '}
            <SettingsInlineLink onClick={() => requestSettingsJump('providers')}>
              {t('settings.openchamber.defaults.usageLimits.openProviders')}
            </SettingsInlineLink>
          </p>
        </SettingsSection>
      )}
    </>
  );
};

export const SessionContextSettings: React.FC = () => {
  const { t } = useI18n();
  const isVSCode = isVSCodeRuntime();
  return (
    <>
      <CompactionSettings />
      <SettingsSection title={t('settings.openchamber.defaults.promptCacheTitle')}>
        {isVSCode ? <SessionWarmingCheckbox /> : <SessionWarmingModeField />}
>>>>>>> upstream/main
      </SettingsSection>
<<<<<<< HEAD

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
||||||| bc50ba56aa

      <CompactionSettings />
=======
>>>>>>> upstream/main
    </>
  );
};
