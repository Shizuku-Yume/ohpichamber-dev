import React from 'react';
import { CanonicalApiError, canonicalClient } from '@/api/canonicalClient';
import { JsonObjectSchema } from '@openchamber/agent-contract';
import type { JsonValue, Model, OmpSettingsState } from '@openchamber/agent-contract';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  SettingsSection,
  SettingsFieldRow,
  SettingsCheckboxRow,
  SettingsInset,
  SETTINGS_OPTION_STACK_CLASS,
  SETTINGS_SELECT_ROW_TRIGGER_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { SessionWarmingCheckbox } from './SessionWarmingCheckbox';
import { PermissionDefaultModeField } from './PermissionDefaultModeField';
import { AgentSelector } from '@/components/sections/agents/AgentSelector';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { updateDesktopSettings } from '@/lib/persistence';
import { useSessionDisplayStore } from '@/stores/useSessionDisplayStore';
import { useUIStore } from '@/stores/useUIStore';
import { useConfigStore } from '@/stores/useConfigStore';


type SessionModeValue = 'main' | 'plan' | 'vibe' | 'goal';

const SESSION_MODE_OPTIONS: readonly { value: SessionModeValue; labelKey: I18nKey }[] = [
  { value: 'main', labelKey: 'chat.chatInput.mode.main' },
  { value: 'plan', labelKey: 'chat.chatInput.mode.plan' },
  { value: 'vibe', labelKey: 'chat.chatInput.mode.vibe' },
  { value: 'goal', labelKey: 'chat.chatInput.mode.goal' },
] as const;


const DEFAULT_EFFORT_OPTIONS: readonly { value: string; labelKey: I18nKey }[] = [
  { value: 'minimal', labelKey: 'settings.omp.modelRoles.effort.minimal' },
  { value: 'low', labelKey: 'settings.omp.modelRoles.effort.low' },
  { value: 'medium', labelKey: 'settings.omp.modelRoles.effort.medium' },
  { value: 'high', labelKey: 'settings.omp.modelRoles.effort.high' },
  { value: 'max', labelKey: 'settings.omp.modelRoles.effort.max' },
] as const;

function parseRoleSelector(selector: unknown): { model: string; effort: string } {
  if (typeof selector !== 'string') return { model: '', effort: '' };
  const trimmed = selector.trim();
  if (!trimmed) return { model: '', effort: '' };
  const colonIndex = trimmed.lastIndexOf(':');
  if (colonIndex > 0) {
    const base = trimmed.slice(0, colonIndex);
    const suffix = trimmed.slice(colonIndex + 1);
    const knownEfforts = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'auto'];
    if (knownEfforts.includes(suffix.toLowerCase())) {
      return { model: base, effort: suffix };
    }
  }
  return { model: trimmed, effort: '' };
}

function formatRoleSelector(model: string, effort: string): string {
  const trimmedModel = model.trim();
  if (!trimmedModel) return '';
  const trimmedEffort = effort.trim();
  if (!trimmedEffort || trimmedEffort === 'default' || trimmedEffort === '__default__') return trimmedModel;
  return `${trimmedModel}:${trimmedEffort}`;
}

/** Every entry the native `modelRoles` record holds, arrays and objects included. */
function parseRolesRecord(val: unknown): Record<string, JsonValue> {
  const parsed = JsonObjectSchema.safeParse(val);
  return parsed.success ? parsed.data : {};
}

/** The selector shown for a role; native role values may be arrays of fallbacks. */
function roleSelector(value: JsonValue | undefined): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.selector === 'string') return value.selector;
  return '';
}

/**
 * The entries `next` really changed relative to `previous`: written values plus
 * the keys it removed. A conflict retry re-applies exactly these, so a role or
 * fallback chain a concurrent edit added is never overwritten or deleted.
 */
const changedRoles = (previous: Record<string, JsonValue>, next: Record<string, JsonValue>) => {
  const removed = Object.keys(previous).filter(role => !Object.hasOwn(next, role));
  const written: Record<string, JsonValue> = {};
  for (const [role, value] of Object.entries(next)) {
    if (previous[role] !== value) written[role] = value;
  }
  return { written, removed };
};

export const DefaultsSettings: React.FC = () => {
  const { t } = useI18n();
  const directory = useSettingsDirectory();

  const showChatsSection = useSessionDisplayStore((state) => state.showChatsSection);
  const setShowChatsSection = useSessionDisplayStore((state) => state.setShowChatsSection);
  const showDeletionDialog = useUIStore((state) => state.showDeletionDialog);
  const setShowDeletionDialog = useUIStore((state) => state.setShowDeletionDialog);
  const defaultSessionMode = useUIStore((state) => state.defaultSessionMode);
  const setDefaultSessionMode = useUIStore((state) => state.setDefaultSessionMode);
  const [ompState, setOmpState] = React.useState<OmpSettingsState | null>(null);
  const [models, setModels] = React.useState<Model[]>([]);
  const [isSavingOmp, setIsSavingOmp] = React.useState(false);


  const ompStateRef = React.useRef<OmpSettingsState | null>(null);
  ompStateRef.current = ompState;

  React.useEffect(() => {
    if (!directory) {
      setOmpState(null);
      setModels([]);
      return;
    }

    const abort = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const workspace = await canonicalClient.resolveWorkspace(directory);
        if (cancelled || abort.signal.aborted) return;
        const [snapshot, modelCatalog] = await Promise.all([
          canonicalClient.getOmpSettings(workspace.workspaceId, abort.signal),
          canonicalClient.getModels(workspace.workspaceId).catch(() => null),
        ]);
        if (cancelled || abort.signal.aborted) return;
        setOmpState(snapshot);
        if (modelCatalog?.models) {
          setModels(modelCatalog.models);
        }
      } catch (err) {
        if (!cancelled && !(err instanceof Error && err.name === 'AbortError')) {
          setOmpState(null);
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
    () => parseRoleSelector(roleSelectors.default),
    [roleSelectors.default],
  );

  const matchedModel = React.useMemo(
    () => models.find((m) => `${m.provider}/${m.modelId}` === selectedModelId),
    [models, selectedModelId],
  );

  const supportsReasoning = Boolean(
    matchedModel?.reasoningEffortSupported ||
    (matchedModel?.reasoningOptions && matchedModel.reasoningOptions.length > 0),
  );

  // The trigger shows the option's label, as the list does, not the raw value.
  const defaultModelLabel = React.useMemo(() => {
    if (!selectedModelId) return t('settings.omp.modelRoles.inheritFallback');
    if (!matchedModel) return `${selectedModelId} (${t('settings.omp.modelRoles.customModel')})`;
    return `${matchedModel.name || matchedModel.modelId} (${matchedModel.provider})`;
  }, [matchedModel, selectedModelId, t]);

  const effortOptions = React.useMemo(() => (
    matchedModel?.reasoningOptions && matchedModel.reasoningOptions.length > 0
      ? matchedModel.reasoningOptions.map((opt) => ({ value: opt.reasoningEffort, label: opt.label }))
      : DEFAULT_EFFORT_OPTIONS.map((opt) => ({ value: opt.value, label: t(opt.labelKey) }))
  ), [matchedModel, t]);

  const defaultEffortLabel = selectedEffort
    ? effortOptions.find((opt) => opt.value === selectedEffort)?.label ?? selectedEffort
    : t('settings.omp.modelRoles.thinkingDefault');

  const updateRolesOnServer = React.useCallback(
    async (nextRoles: Record<string, JsonValue>) => {
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
            changes: [{ id: 'modelRoles', value: nextRoles }],
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
              changes: [{ id: 'modelRoles', value: merged }],
            });
          } else {
            throw error;
          }
        }
        setOmpState(next);
      } catch (err) {
        console.warn('Failed to update default model role:', err);
      } finally {
        setIsSavingOmp(false);
      }
    },
    [],
  );

  const handleDefaultModelChange = React.useCallback(
    (val: string) => {
      const nextRoles = { ...rolesMap };
      if (val === '__inherit__') {
        delete nextRoles.default;
      } else {
        const nextModel = models.find((m) => `${m.provider}/${m.modelId}` === val);
        const nextSupportsReasoning = Boolean(
          nextModel?.reasoningEffortSupported ||
          (nextModel?.reasoningOptions && nextModel.reasoningOptions.length > 0),
        );
        const effortToKeep = nextSupportsReasoning ? selectedEffort : '';
        nextRoles.default = formatRoleSelector(val, effortToKeep);
      }
      void updateRolesOnServer(nextRoles);
    },
    [models, rolesMap, selectedEffort, updateRolesOnServer],
  );

  const handleDefaultEffortChange = React.useCallback(
    (val: string) => {
      const nextRoles = { ...rolesMap };
      const effort = val === '__default__' ? '' : val;
      nextRoles.default = formatRoleSelector(selectedModelId, effort);
      void updateRolesOnServer(nextRoles);
    },
    [rolesMap, selectedModelId, updateRolesOnServer],
  );

  /**
   * Write one native model role and nothing else. `smol` is the small model,
   * `slow` the changes walkthrough. The fallback chain is not a role and is
   * written separately through `retry.fallbackChains`.
   */
  const setRole = React.useCallback(
    (role: string, value: string) => {
      const nextRoles: Record<string, JsonValue> = { ...rolesMap };
      if (!value || value === '__inherit__') delete nextRoles[role];
      else nextRoles[role] = value;
      void updateRolesOnServer(nextRoles);
    },
    [rolesMap, updateRolesOnServer],
  );

  /** The walkthrough resolves its model through the native `slow` role. */
  const setWalkthroughModel = React.useCallback(
    (selector: string) => setRole('slow', selector || ''),
    [setRole],
  );

  /** The stored selector for a role, custom values included; '' means unset. */
  const roleModel = (role: string): string => roleSelectors[role] ?? '';

  /**
   * What a closed trigger shows for a selector. `SelectValue` otherwise prints
   * the raw value, so sentinels (`__inherit__`, `__none__`), raw mode ids and
   * custom selectors would leak into the control.
   */
  const selectorLabel = (selector: string): string => {
    const model = models.find((m) => `${m.provider}/${m.modelId}` === selector);
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

  /** A role is set only when a "use default" toggle is off. */
  const roleSelect = (
    role: string,
    ariaLabel: string,
    placeholder: string,
    disabled: boolean,
  ): React.ReactNode => {
    const value = roleModel(role);
    const known = models.some((m) => `${m.provider}/${m.modelId}` === value);
    return (
      <Select
        value={value || '__inherit__'}
        onValueChange={(val) => setRole(role, val)}
        disabled={disabled || isSavingOmp || !ompState}
      >
        <SelectTrigger className={SETTINGS_SELECT_ROW_TRIGGER_CLASS} aria-label={ariaLabel}>
          <SelectValue placeholder={placeholder}>{value ? selectorLabel(value) : placeholder}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__inherit__">{placeholder}</SelectItem>
          {models.map((m) => {
            const id = `${m.provider}/${m.modelId}`;
            return (
              <SelectItem key={id} value={id}>
                {m.name || m.modelId} ({m.provider})
              </SelectItem>
            );
          })}
          {/* A configured value the catalog does not list stays visible, once. */}
          {value && !known && (
            <SelectItem value={value}>
              {value} ({t('settings.omp.modelRoles.customModel')})
            </SelectItem>
          )}
        </SelectContent>
      </Select>
    );
  };

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
        className={SETTINGS_SELECT_ROW_TRIGGER_CLASS}
        aria-label={t('settings.openchamber.defaults.field.fallbackModel')}
      >
        <SelectValue placeholder={t('settings.openchamber.defaults.field.fallbackModelNone')}>
          {fallbackRoles.current ? selectorLabel(fallbackRoles.current) : t('settings.openchamber.defaults.field.fallbackModelNone')}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">{t('settings.openchamber.defaults.field.fallbackModelNone')}</SelectItem>
        {models.map((m) => {
          const id = `${m.provider}/${m.modelId}`;
          return (
            <SelectItem key={id} value={id}>
              {m.name || m.modelId} ({m.provider})
            </SelectItem>
          );
        })}
        {fallbackRoles.current && !models.some((m) => `${m.provider}/${m.modelId}` === fallbackRoles.current) && (
          <SelectItem value={fallbackRoles.current}>
            {fallbackRoles.current} ({t('settings.omp.modelRoles.customModel')})
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );

  const defaultAgent = useConfigStore((state) => state.settingsDefaultAgent);
  const setSettingsDefaultAgent = useConfigStore((state) => state.setSettingsDefaultAgent);
  const setAgent = useConfigStore((state) => state.setAgent);
  const autoApplyAgentModel = useUIStore((state) => state.autoApplyAgentModel);
  const setAutoApplyAgentModel = useUIStore((state) => state.setAutoApplyAgentModel);
  const planModeAllowAgents = useUIStore((state) => state.planModeAllowAgents);
  const setPlanModeAllowAgents = useUIStore((state) => state.setPlanModeAllowAgents);

  return (
    <>
    <SettingsSection title={t('settings.openchamber.defaults.title')} divider={false}>
      <div className="space-y-4">
        <SettingsFieldRow
          settingsItem="sessions.default-model"
          label={t('settings.openchamber.defaults.field.defaultModel')}
        >
          <div className="flex flex-col @xl:flex-row gap-2 items-start @xl:items-center">
            <Select
              value={selectedModelId || '__inherit__'}
              onValueChange={handleDefaultModelChange}
              disabled={isSavingOmp || !ompState}
            >
              <SelectTrigger
                className={SETTINGS_SELECT_ROW_TRIGGER_CLASS}
                aria-label={t('settings.openchamber.defaults.field.defaultModel')}
              >
                <SelectValue placeholder={t('settings.omp.modelRoles.inheritFallback')}>
                  {defaultModelLabel}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__inherit__">
                  {t('settings.omp.modelRoles.inheritFallback')}
                </SelectItem>
                {models.map((m) => {
                  const id = `${m.provider}/${m.modelId}`;
                  return (
                    <SelectItem key={id} value={id}>
                      {m.name || m.modelId} ({m.provider})
                    </SelectItem>
                  );
                })}
                {selectedModelId && !models.some((m) => `${m.provider}/${m.modelId}` === selectedModelId) && (
                  <SelectItem value={selectedModelId}>
                    {selectedModelId} ({t('settings.omp.modelRoles.customModel')})
                  </SelectItem>
                )}
              </SelectContent>
            </Select>

            {supportsReasoning && (
              <Select
                value={selectedEffort || '__default__'}
                onValueChange={handleDefaultEffortChange}
                disabled={isSavingOmp || !ompState}
              >
                <SelectTrigger
                  className={SETTINGS_SELECT_ROW_TRIGGER_CLASS}
                  aria-label={t('settings.openchamber.defaults.field.defaultThinking')}
                >
                  <SelectValue placeholder={t('settings.omp.modelRoles.thinkingDefault')}>
                    {defaultEffortLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">
                    {t('settings.omp.modelRoles.thinkingDefault')}
                  </SelectItem>
                  {effortOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </SettingsFieldRow>

        <SettingsFieldRow
          settingsItem="sessions.default-mode"
          label={t('chat.chatInput.mode.label')}
        >
          <Select value={defaultSessionMode} onValueChange={(val) => setDefaultSessionMode(val as SessionModeValue)}>
            <SelectTrigger
              className={SETTINGS_SELECT_ROW_TRIGGER_CLASS}
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
          settingsItem="sessions.default-agent"
          label={t('settings.openchamber.defaults.field.defaultAgent')}
        >
          <AgentSelector
            agentId={defaultAgent ?? ''}
            onChange={(agentId) => {
              const next = agentId || undefined;
              setSettingsDefaultAgent(next);
              // Auto-apply means the agent's pinned model wins, so `keepModel`
              // is the opposite. Without it the chat keeps the model it had.
              if (next) setAgent(next, { keepModel: !autoApplyAgentModel });
              void updateDesktopSettings({ defaultAgent: next ?? '' });
            }}
            directory={directory ?? undefined}
            className={SETTINGS_SELECT_ROW_TRIGGER_CLASS}
          />
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
      <SettingsSection title={t('settings.layout.sessions.helperModels.title')} contentClassName="space-y-2">
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
        <SettingsFieldRow label={t('settings.openchamber.defaults.smallModel.title')}>
          {roleSelect('smol', t('settings.openchamber.defaults.smallModel.title'), t('settings.openchamber.defaults.smallModel.useDefault'), !usesOwnSmallModel)}
        </SettingsFieldRow>
        <SettingsCheckboxRow
          settingsItem="sessions.walkthrough-use-default"
          checked={!usesOwnWalkthroughModel}
          onChange={(useDefault) => {
            if (useDefault) { setWalkthroughModel(''); setWalkthroughChoice(undefined); return; }
            setWalkthroughChoice('__pending__');
            setWalkthroughModel(roleSelectors.default ?? '');
          }}
          label={t('settings.openchamber.defaults.smallModel.useDefault')}
          ariaLabel={t('settings.openchamber.defaults.smallModel.useDefaultAria')}
        />
        <SettingsFieldRow
          settingsItem="sessions.walkthrough-model"
          label={t('settings.openchamber.defaults.walkthroughModel.title')}
          info={t('settings.openchamber.defaults.walkthroughModel.description')}
        >
          {roleSelect('slow', t('settings.openchamber.defaults.walkthroughModel.title'), t('settings.openchamber.defaults.walkthroughModel.usesSmallModel'), !usesOwnWalkthroughModel)}
        </SettingsFieldRow>
      </SettingsSection>

      <SettingsSection title={t('settings.sessions.permissions.defaultMode')} contentClassName="space-y-1">
        <PermissionDefaultModeField agentName={defaultAgent} />
      </SettingsSection>

      <SettingsSection title={t('settings.openchamber.visual.section.sessionAssistance')} contentClassName="space-y-1">
        <SettingsInset className={SETTINGS_OPTION_STACK_CLASS}>
          <SettingsCheckboxRow
            settingsItem="sessions.auto-apply-agent-model"
            checked={autoApplyAgentModel}
            onChange={(checked) => {
              setAutoApplyAgentModel(checked);
              void updateDesktopSettings({ autoApplyAgentModel: checked });
            }}
            label={t('settings.openchamber.defaults.field.autoApplyAgentModel')}
            ariaLabel={t('settings.openchamber.defaults.field.autoApplyAgentModelAria')}
            description={t('settings.openchamber.defaults.field.autoApplyAgentModelInfo')}
          />
          <SettingsCheckboxRow
            settingsItem="sessions.plan-mode-allow-agents"
            checked={planModeAllowAgents}
            onChange={(checked) => {
              setPlanModeAllowAgents(checked);
              void updateDesktopSettings({ planModeAllowAgents: checked });
            }}
            label={t('settings.openchamber.defaults.field.planModeAllowAgents')}
            ariaLabel={t('settings.openchamber.defaults.field.planModeAllowAgentsAria')}
            description={t('settings.openchamber.defaults.field.planModeAllowAgentsInfo')}
          />
          <SettingsCheckboxRow
            settingsItem="sessions.deletion-dialog"
            checked={showDeletionDialog}
            onChange={(checked) => {
              setShowDeletionDialog(checked);
              void updateDesktopSettings({ showDeletionDialog: checked });
            }}
            label={t('settings.openchamber.defaults.field.showDeletionDialog')}
            ariaLabel={t('settings.openchamber.defaults.field.showDeletionDialogAria')}
          />
          <SessionWarmingCheckbox />
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
