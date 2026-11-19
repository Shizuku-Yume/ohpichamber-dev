import React from 'react';
import type { AutosaveResult } from '@/components/sections/shared/SettingsAutosave';
import type { Agent, AgentThinkingLevel, JsonValue, ToolCatalogEntry } from '@openchamber/agent-contract';
import { CanonicalApiError } from '@/api/canonicalClient';
import { useSettingsModels } from '@/hooks/useSettingsModels';
import { useOmpPageSettings } from '@/components/sections/shared/useOmpPageSettings';
import { OmpRowControl } from '@/components/sections/shared/OmpRowControl';
import { ModelRoleEditor } from '@/components/sections/shared/ModelRoleEditor';
import { parseRolesRecord, roleSelector } from '@/components/sections/shared/modelRoleSelectors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { canonicalClient } from '@/api/canonicalClient';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { normalizePath } from '@/lib/pathNormalization';
import { AgentPermissionsEditor } from './AgentPermissionsEditor';
import { toast } from '@/components/ui';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { selectAgentsForDirectory, useAgentsStore } from '@/stores/useAgentsStore';
import { useShallow } from 'zustand/react/shallow';
import { ModelSelector } from './ModelSelector';
import { useI18n } from '@/lib/i18n';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  useAutosave, AUTOSAVE_SAVED, AUTOSAVE_UNCHANGED, autosaveFailed,
} from '@/components/sections/shared/SettingsAutosave';
import {
  SettingsSection,
  SettingsFieldRow,
  SettingsStackedField,
  SETTINGS_CUSTOM_TRIGGER_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
  SETTINGS_WIDTH_SHORT_TEXT_CLASS,
} from '@/components/sections/shared/SettingsSection';

<<<<<<< HEAD
||||||| bc50ba56aa
type AgentVariantProvider = {
  id: string;
  models: Array<{ id: string; modelID: string; variants: Array<{ id: string }> }>;
};

const getVariantOptionsForModel = (
  providers: AgentVariantProvider[],
  modelValue: string,
): string[] => {
  const parsedModel = parseModelIdentifier(modelValue);
  if (!parsedModel) {
    return [];
  }

  const provider = providers.find((item) => item.id === parsedModel.providerId);
  const model = findCatalogModel(provider?.models, parsedModel.modelId);
  return modelVariantNames(model);
};
/** The colour the form shows for a stored value; empty reads as automatic, as in the colour resolver. */
const storedAgentColor = (stored: string | null | undefined): string => configuredAgentColor(stored)?.toLowerCase() ?? '';

/** Everything the page writes into the agent's config file. */
=======
type AgentVariantProvider = {
  id: string;
  models: Array<{ id: string; modelID: string; variants: Array<{ id: string }> }>;
};

const getVariantOptionsForModel = (
  providers: AgentVariantProvider[],
  modelValue: string,
): string[] => {
  const parsedModel = parseModelIdentifier(modelValue);
  if (!parsedModel) {
    return [];
  }

  const provider = providers.find((item) => item.id === parsedModel.providerId);
  const model = findCatalogModel(provider?.models, parsedModel.modelId);
  return modelVariantNames(model);
};
const storedAgentColor = (stored: string | null | undefined): string => configuredAgentColor(stored)?.toLowerCase() ?? '';

>>>>>>> upstream/main
interface FormState {
  name: string;
  description: string;
<<<<<<< HEAD
  model: Agent['model'];
  systemPromptOverride: string;
  allowedTools: string[] | null;
  thinkingLevel: AgentThinkingLevel | 'default';
  spawns: string;
||||||| bc50ba56aa
  mode: 'primary' | 'subagent' | 'all';
  model: string;
  variant: string;
  steps: number | undefined;
  temperature: number | undefined;
  topP: number | undefined;
  system: string;
  /** Six-digit hex, or '' for the automatic theme colour. */
  color: string;
=======
  mode: 'primary' | 'subagent' | 'all';
  model: string;
  variant: string;
  steps: number | undefined;
  temperature: number | undefined;
  topP: number | undefined;
  system: string;
  color: string;
>>>>>>> upstream/main
}

const fieldsForAgent = (agent: Agent): FormState => ({
  name: agent.name,
  description: agent.description,
  model: agent.model,
  systemPromptOverride: agent.systemPromptOverride ?? '',
  allowedTools: agent.allowedTools === null ? null : [...agent.allowedTools],
  thinkingLevel: agent.thinkingLevel ?? 'default',
  spawns: agent.spawns === '*' ? '*' : Array.isArray(agent.spawns) ? agent.spawns.join(', ') : '',
});
const toolsEqual = (left: string[] | null, right: string[] | null): boolean => {
  if (left === null || right === null) return left === right;
  return left.length === right.length && left.every((tool, index) => tool === right[index]);
};
const fieldsEqual = (left: FormState, right: FormState): boolean =>
  left.name === right.name && left.description === right.description &&
  left.model?.providerId === right.model?.providerId && left.model?.modelId === right.model?.modelId &&
  left.systemPromptOverride === right.systemPromptOverride &&
  toolsEqual(left.allowedTools, right.allowedTools) &&
  left.thinkingLevel === right.thinkingLevel &&
  left.spawns === right.spawns;

const thinkingLevelLabel = (level: AgentThinkingLevel | 'default', t: ReturnType<typeof useI18n>['t']): string => {
  switch (level) {
    case 'default': return t('sessions.scheduledTasks.editor.thinkingLevel.default');
    case 'off': return t('settings.skills.page.use.off');
    case 'minimal': return t('settings.omp.modelRoles.effort.minimal');
    case 'low': return t('settings.omp.modelRoles.effort.low');
    case 'medium': return t('settings.omp.modelRoles.effort.medium');
    case 'high': return t('settings.omp.modelRoles.effort.high');
    case 'xhigh': return t('settings.omp.modelRoles.effort.high');
    case 'max': return t('settings.omp.modelRoles.effort.max');
    case 'auto': return t('settings.remoteInstances.page.field.auto');
    default: return level;
  }
};

export const AgentsPage: React.FC = () => {
  const { t } = useI18n();
<<<<<<< HEAD
||||||| bc50ba56aa
  const providers = useConfigStore((state) => state.providers) as AgentVariantProvider[];
  const {
    selectedAgentName,
    getAgentByName,
    createAgent,
    updateAgent,
    fetchAgentEntity,
    agentDraft,
    setAgentDraft,
    setSelectedAgent,
  } = useAgentsStore(useShallow((s) => ({
    selectedAgentName: s.selectedAgentName,
    getAgentByName: s.getAgentByName,
    createAgent: s.createAgent,
    updateAgent: s.updateAgent,
    fetchAgentEntity: s.fetchAgentEntity,
    agentDraft: s.agentDraft,
    setAgentDraft: s.setAgentDraft,
    setSelectedAgent: s.setSelectedAgent,
  })));

  // Settings browses whichever project its own selector points at; the app
  // stays where it is.
=======
  const providers = useConfigStore((state) => state.providers) as AgentVariantProvider[];
  const {
    selectedAgentName,
    getAgentByName,
    createAgent,
    updateAgent,
    fetchAgentEntity,
    agentDraft,
    setAgentDraft,
    setSelectedAgent,
  } = useAgentsStore(useShallow((s) => ({
    selectedAgentName: s.selectedAgentName,
    getAgentByName: s.getAgentByName,
    createAgent: s.createAgent,
    updateAgent: s.updateAgent,
    fetchAgentEntity: s.fetchAgentEntity,
    agentDraft: s.agentDraft,
    setAgentDraft: s.setAgentDraft,
    setSelectedAgent: s.setSelectedAgent,
  })));

>>>>>>> upstream/main
  const settingsDirectory = useSettingsDirectory();
<<<<<<< HEAD
  const directoryKey = settingsDirectory?.trim() || '__default__';
  const {
    selectedAgentName, createAgent, updateAgent, loadAgents, agentDraft, setAgentDraft, setSelectedAgent,
  } = useAgentsStore(useShallow((state) => ({
    selectedAgentName: state.selectedAgentName, createAgent: state.createAgent,
    updateAgent: state.updateAgent, loadAgents: state.loadAgents,
    agentDraft: state.agentDraft, setAgentDraft: state.setAgentDraft, setSelectedAgent: state.setSelectedAgent,
  })));
  const models = useSettingsModels(settingsDirectory);
  const { state: ompState, form: ompForm, updateSetting: updateOmpSetting, getSectionSettings, loading: ompLoading } = useOmpPageSettings('agents');
  const subagentSettings = getSectionSettings('subagents');
  const prewalkSettings = getSectionSettings('prewalk');
  const advisorSettings = getSectionSettings('advisor');
||||||| bc50ba56aa
  const agents = useAgentsStore((state) => selectAgentsForDirectory(state, settingsDirectory));
  // SAFETY: the agents store attaches scope, group, path and legacy to every
  // entry it loads (`AgentWithExtras`); the editable fields are read from the
  // stored entry, not from the resolved `AgentInfo`.
  const selectedAgent = (selectedAgentName ? getAgentByName(selectedAgentName, settingsDirectory) : null) as AgentWithExtras | null;
  const isNewAgent = Boolean(agentDraft && agentDraft.name === selectedAgentName && !selectedAgent);
  // The resolved runtime values (built-in defaults, plugin-injected agents) are
  // shown only as placeholder hints; the form state stays the stored entry, so
  // a save never writes them back.
  const runtimeDescription = isNewAgent ? '' : selectedAgent?.description?.trim() ?? '';
  const runtimeSystem = isNewAgent ? '' : selectedAgent?.system?.trim() ?? '';
=======
  const agents = useAgentsStore((state) => selectAgentsForDirectory(state, settingsDirectory));
  // SAFETY: the agents store attaches scope, group, path and legacy to every
  // entry it loads (`AgentWithExtras`); the editable fields are read from the
  // stored entry, not from the resolved `AgentInfo`.
  const selectedAgent = (selectedAgentName ? getAgentByName(selectedAgentName, settingsDirectory) : null) as AgentWithExtras | null;
  const isNewAgent = Boolean(agentDraft && agentDraft.name === selectedAgentName && !selectedAgent);
  const runtimeDescription = isNewAgent ? '' : selectedAgent?.description?.trim() ?? '';
  const runtimeSystem = isNewAgent ? '' : selectedAgent?.system?.trim() ?? '';
>>>>>>> upstream/main

<<<<<<< HEAD
  const modelRolesSetting = ompState?.settings.find((s) => s.id === 'modelRoles');
  const rolesMap = React.useMemo(() => parseRolesRecord(modelRolesSetting?.value), [modelRolesSetting?.value]);
  const roleSelectors = React.useMemo(
    () => Object.fromEntries(Object.entries(rolesMap).map(([role, value]) => [role, roleSelector(value)])),
    [rolesMap],
||||||| bc50ba56aa
  const [draftName, setDraftName] = React.useState('');
  const [draftScope, setDraftScope] = React.useState<AgentScope>('user');
  const [description, setDescription] = React.useState('');
  const [mode, setMode] = React.useState<'primary' | 'subagent' | 'all'>('subagent');
  const [model, setModel] = React.useState('');
  const [variant, setVariant] = React.useState('');
  const [steps, setSteps] = React.useState<number | undefined>(undefined);
  const [temperature, setTemperature] = React.useState<number | undefined>(undefined);
  const [topP, setTopP] = React.useState<number | undefined>(undefined);
  const [system, setSystem] = React.useState('');
  const [color, setColor] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);
  const [storedAt, setStoredAt] = React.useState<{ legacy: boolean; path: string | null; source: AgentEntityEnvelope['source'] } | null>(null);

  /**
   * The agent's stored entry. A save rewrites `request` wholesale, so the
   * headers and body keys this form does not expose are carried over from here
   * instead of being dropped.
   */
  const entityRef = React.useRef<AgentEntity>({});

  /**
   * The permissions section's save routine. It writes its own request, but the
   * page owns the indicator, so the page's save runs it too and reports one
   * outcome for both.
   */
  const permissionsSaveRef = React.useRef<(() => Promise<AutosaveResult>) | null>(null);
  const registerPermissionsSave = React.useCallback(
    (routine: (() => Promise<AutosaveResult>) | null) => {
      permissionsSaveRef.current = routine;
    },
    [],
=======
  const [draftName, setDraftName] = React.useState('');
  const [draftScope, setDraftScope] = React.useState<AgentScope>('user');
  const [description, setDescription] = React.useState('');
  const [mode, setMode] = React.useState<'primary' | 'subagent' | 'all'>('subagent');
  const [model, setModel] = React.useState('');
  const [variant, setVariant] = React.useState('');
  const [steps, setSteps] = React.useState<number | undefined>(undefined);
  const [temperature, setTemperature] = React.useState<number | undefined>(undefined);
  const [topP, setTopP] = React.useState<number | undefined>(undefined);
  const [system, setSystem] = React.useState('');
  const [color, setColor] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);
  const [storedAt, setStoredAt] = React.useState<{ legacy: boolean; path: string | null; source: AgentEntityEnvelope['source'] } | null>(null);

  const entityRef = React.useRef<AgentEntity>({});

  const permissionsSaveRef = React.useRef<(() => Promise<AutosaveResult>) | null>(null);
  const registerPermissionsSave = React.useCallback(
    (routine: (() => Promise<AutosaveResult>) | null) => {
      permissionsSaveRef.current = routine;
    },
    [],
>>>>>>> upstream/main
  );

<<<<<<< HEAD
  const handleRoleChange = React.useCallback(
    async (role: 'task' | 'advisor', selector: string) => {
      if (!ompState) return;
      const nextRoles: Record<string, JsonValue> = { ...rolesMap };
      if (selector) nextRoles[role] = selector;
      else delete nextRoles[role];
      try {
        await canonicalClient.updateOmpSettings(ompState.workspaceId, {
          expectedRevision: ompState.revision,
          changes: [{ id: 'modelRoles', value: nextRoles }],
        });
      } catch (err) {
        if (err instanceof CanonicalApiError && err.problem.status === 409) {
          const latest = await canonicalClient.getOmpSettings(ompState.workspaceId);
          const latestRoles = parseRolesRecord(latest.settings.find((s) => s.id === 'modelRoles')?.value);
          const merged: Record<string, JsonValue> = { ...latestRoles };
          if (selector) merged[role] = selector;
          else delete merged[role];
          await canonicalClient.updateOmpSettings(latest.workspaceId, {
            expectedRevision: latest.revision,
            changes: [{ id: 'modelRoles', value: merged }],
          });
        }
      }
    },
    [ompState, rolesMap],
  );
  const agents = useAgentsStore((state) => selectAgentsForDirectory(state, settingsDirectory));
  const revision = useAgentsStore((state) => state.revisionsByDirectory[directoryKey]);
  const catalogError = useAgentsStore((state) => state.errorsByDirectory[directoryKey]);
  const selectedAgent = agents.find((agent) => agent.name === selectedAgentName) ?? null;
  const isNewAgent = Boolean(agentDraft && agentDraft.name === selectedAgentName && !selectedAgent);
  const source = isNewAgent ? agentDraft : selectedAgent;
  const selectionKey = JSON.stringify([settingsDirectory, source?.agentId, selectedAgentName, isNewAgent]);
||||||| bc50ba56aa
  // What the agent's config file currently holds. A save writes only when the
  // form differs from it, and an incoming refresh only repopulates the form
  // when the stored value moved away from it.
  const savedRef = React.useRef<FormState | null>(null);
  const selectionKey = JSON.stringify([selectedAgentName, settingsDirectory, isNewAgent]);
=======
  const savedRef = React.useRef<FormState | null>(null);
  const selectionKey = JSON.stringify([selectedAgentName, settingsDirectory, isNewAgent]);
>>>>>>> upstream/main
  const selectionRef = React.useRef(selectionKey);
  selectionRef.current = selectionKey;
  const creationOwnerRef = React.useRef({ directory: settingsDirectory, name: selectedAgentName });
  creationOwnerRef.current = { directory: settingsDirectory, name: selectedAgentName };
  const hydratedSelectionRef = React.useRef<string | null>(null);
  const entityRef = React.useRef<Agent | null>(null);
  const revisionRef = React.useRef<string | undefined>(undefined);
  const savedRef = React.useRef<FormState | null>(null);
  const savingRef = React.useRef(false);
  const [form, setForm] = React.useState<FormState>({
    name: '', description: '', model: null, systemPromptOverride: '', allowedTools: null,
    thinkingLevel: 'default', spawns: '',
  });
  const formRef = React.useRef(form);
  formRef.current = form;
  const [toolsCatalog, setToolsCatalog] = React.useState<ToolCatalogEntry[]>([]);
  const [toolsCatalogError, setToolsCatalogError] = React.useState<string | null>(null);
  const [catalogRetryCount, setCatalogRetryCount] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    const loadCatalog = async () => {
      setToolsCatalogError(null);
      try {
        if (!settingsDirectory) {
          if (active) setToolsCatalog([]);
          return;
        }
        const workspace = await canonicalClient.resolveWorkspace(settingsDirectory);
        let loadedTools: ToolCatalogEntry[] | null = null;
        const currentSessionId = useSessionUIStore.getState().currentSessionId;
        if (currentSessionId) {
          const sessionDir = useSessionUIStore.getState().getDirectoryForSession(currentSessionId);
          const matchesOwnership = Boolean(
            sessionDir &&
            settingsDirectory &&
            normalizePath(sessionDir) === normalizePath(settingsDirectory)
          );
          if (matchesOwnership) {
            try {
              const catalog = await canonicalClient.getTools({ sessionId: currentSessionId });
              loadedTools = catalog.tools;
            } catch {
              // Fall back to workspace endpoint
            }
          }
        }
        if (!loadedTools) {
          const catalog = await canonicalClient.getTools({ workspaceId: workspace.workspaceId });
          loadedTools = catalog.tools;
        }
        if (active) {
          setToolsCatalog(loadedTools);
          setToolsCatalogError(null);
        }
      } catch (err) {
        if (active) {
          setToolsCatalog([]);
          setToolsCatalogError(err instanceof Error ? err.message : 'SERVICE_UNAVAILABLE');
        }
      }
    };
    void loadCatalog();
    return () => { active = false; };
  }, [settingsDirectory, catalogRetryCount]);
  const [isCreating, setIsCreating] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => { void loadAgents(settingsDirectory); }, [loadAgents, settingsDirectory]);

  React.useEffect(() => {
<<<<<<< HEAD
    if (!source) {
      hydratedSelectionRef.current = null;
      entityRef.current = null;
      savedRef.current = null;
      revisionRef.current = undefined;
      setSaveError(null);
      return;
||||||| bc50ba56aa
    if (!isNewAgent || !agentDraft) return;
    hydratedSelectionRef.current = null;
    const parsedModel = parseModelSelection(agentDraft.model);
    const draftNameValue = agentDraft.name || '';
    const draftScopeValue = agentDraft.scope || 'user';
    const descriptionValue = agentDraft.description || '';
    const modeValue = agentDraft.mode || 'subagent';
    const modelValue = parsedModel ? `${parsedModel.providerID}/${parsedModel.modelID}` : '';
    const variantValue = parsedModel?.variant || '';
    const stepsValue = agentDraft.steps ?? undefined;
    const temperatureValue = agentDraft.temperature ?? undefined;
    const topPValue = agentDraft.top_p ?? undefined;
    const systemValue = agentDraft.system || '';
    const colorValue = '';

    entityRef.current = {};
    setStoredAt(null);
    setDraftName(draftNameValue);
    setDraftScope(draftScopeValue);
    setDescription(descriptionValue);
    setMode(modeValue);
    setModel(modelValue);
    setVariant(variantValue);
    setSteps(stepsValue);
    setTemperature(temperatureValue);
    setTopP(topPValue);
    setSystem(systemValue);
    setColor(colorValue);

    savedRef.current = {
      draftName: draftNameValue,
      draftScope: draftScopeValue,
      description: descriptionValue,
      mode: modeValue,
      model: modelValue,
      variant: variantValue,
      steps: stepsValue,
      temperature: temperatureValue,
      topP: topPValue,
      system: systemValue,
      color: colorValue,
    };
  }, [agentDraft, isNewAgent]);

  // An existing agent is edited from its OWN stored entry, not from the
  // resolved `AgentInfo`: the resolved view already merges built-in defaults
  // and global config, and writing that back would bake them into the file.
  React.useEffect(() => {
    if (isNewAgent || !selectedAgentName) return;
    let cancelled = false;
    void (async () => {
      const envelope = await fetchAgentEntity(selectedAgentName, settingsDirectory);
      if (cancelled || selectionRef.current !== selectionKey || !envelope) return;
      const entity = envelope.config;
      entityRef.current = entity;
      const parsedModel = parseModelSelection(entity.model);
      const body = entity.request?.body;
      const next: FormState = {
        draftName: '',
        draftScope: 'user',
        description: entity.description || '',
        // A stored override often omits `mode` (built-in build/plan); fall back
        // to the resolved mode so an unrelated edit never writes `subagent`.
        mode: entity.mode || selectedAgent?.mode || 'subagent',
        model: parsedModel ? `${parsedModel.providerID}/${parsedModel.modelID}` : '',
        variant: parsedModel?.variant || '',
        steps: entity.steps ?? undefined,
        temperature: body?.temperature,
        topP: body?.top_p,
        system: entity.system || '',
        color: storedAgentColor(entity.color),
      };

      const saved = savedRef.current;
      const current = currentFieldsRef.current;
      const dirty = saved !== null && (
        current.description !== saved.description || current.mode !== saved.mode ||
        current.model !== saved.model || current.variant !== saved.variant ||
        current.steps !== saved.steps || current.temperature !== saved.temperature ||
        current.topP !== saved.topP || current.system !== saved.system ||
        current.color !== saved.color
      );
      setStoredAt({ legacy: envelope.legacy === true, path: envelope.path, source: envelope.source });
      // A refresh can publish an older write while the next draft is still being edited.
      if (hydratedSelectionRef.current === selectionKey && dirty) return;
      hydratedSelectionRef.current = selectionKey;

      setDescription(next.description);
      setMode(next.mode);
      setModel(next.model);
      setVariant(next.variant);
      setSteps(next.steps);
      setTemperature(next.temperature);
      setTopP(next.topP);
      setSystem(next.system);
      setColor(next.color);
      savedRef.current = next;
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchAgentEntity, isNewAgent, selectedAgent, selectedAgentName, settingsDirectory, selectionKey]);

  const buildConfig = React.useCallback((agentName: string): AgentConfig => {
    const parsedModel = parseModelIdentifier(model.trim());
    const joinedModel = parsedModel
      ? formatModelSelection({
          providerID: parsedModel.providerId,
          modelID: parsedModel.modelId,
          variant: variant.trim() || undefined,
        })
      : null;

    // `request` is replaced as a whole on write, so the headers and any body
    // keys this form does not own are carried over from the stored entry.
    const storedRequest = entityRef.current.request;
    const body: AgentRequestBody = { ...storedRequest?.body };
    if (temperature === undefined) delete body.temperature;
    else body.temperature = temperature;
    if (topP === undefined) delete body.top_p;
    else body.top_p = topP;

    const headers = storedRequest?.headers;
    const request: AgentRequest = {};
    if (headers && Object.keys(headers).length > 0) request.headers = headers;
    if (Object.keys(body).length > 0) request.body = body;

    const trimmedDescription = description.trim();
    const trimmedSystem = system.trim();
    const config: AgentConfig = {
      name: agentName,
      mode,
      model: joinedModel,
      steps: steps ?? null,
      system: trimmedSystem || (isNewAgent ? undefined : null),
      request: Object.keys(request).length > 0 ? request : null,
    };
    if (trimmedDescription) config.description = trimmedDescription;
    // Written only when it changed, so an untouched agent keeps whatever its
    // file holds; null removes the key and the theme colour returns.
    if (color !== (savedRef.current?.color ?? '')) config.color = color || null;
    if (isNewAgent && draftScope) config.scope = draftScope;
    if (isNewAgent && agentDraft?.hidden !== undefined) config.hidden = agentDraft.hidden;
    // A duplicate carries the source agent's rules; the permissions editor only
    // appears once the agent exists, so this is the one path that writes them
    // at creation time.
    if (isNewAgent && agentDraft?.permissions?.length) {
      config.permissions = agentDraft.permissions;
=======
    if (!isNewAgent || !agentDraft) return;
    hydratedSelectionRef.current = null;
    const parsedModel = parseModelSelection(agentDraft.model);
    const draftNameValue = agentDraft.name || '';
    const draftScopeValue = agentDraft.scope || 'user';
    const descriptionValue = agentDraft.description || '';
    const modeValue = agentDraft.mode || 'subagent';
    const modelValue = parsedModel ? `${parsedModel.providerID}/${parsedModel.modelID}` : '';
    const variantValue = parsedModel?.variant || '';
    const stepsValue = agentDraft.steps ?? undefined;
    const temperatureValue = agentDraft.temperature ?? undefined;
    const topPValue = agentDraft.top_p ?? undefined;
    const systemValue = agentDraft.system || '';
    const colorValue = '';

    entityRef.current = {};
    setStoredAt(null);
    setDraftName(draftNameValue);
    setDraftScope(draftScopeValue);
    setDescription(descriptionValue);
    setMode(modeValue);
    setModel(modelValue);
    setVariant(variantValue);
    setSteps(stepsValue);
    setTemperature(temperatureValue);
    setTopP(topPValue);
    setSystem(systemValue);
    setColor(colorValue);

    savedRef.current = {
      draftName: draftNameValue,
      draftScope: draftScopeValue,
      description: descriptionValue,
      mode: modeValue,
      model: modelValue,
      variant: variantValue,
      steps: stepsValue,
      temperature: temperatureValue,
      topP: topPValue,
      system: systemValue,
      color: colorValue,
    };
  }, [agentDraft, isNewAgent]);

  React.useEffect(() => {
    if (isNewAgent || !selectedAgentName) return;
    let cancelled = false;
    void (async () => {
      const envelope = await fetchAgentEntity(selectedAgentName, settingsDirectory);
      if (cancelled || selectionRef.current !== selectionKey || !envelope) return;
      const entity = envelope.config;
      entityRef.current = entity;
      const parsedModel = parseModelSelection(entity.model);
      const body = entity.request?.body;
      const next: FormState = {
        draftName: '',
        draftScope: 'user',
        description: entity.description || '',
        mode: entity.mode || selectedAgent?.mode || 'subagent',
        model: parsedModel ? `${parsedModel.providerID}/${parsedModel.modelID}` : '',
        variant: parsedModel?.variant || '',
        steps: entity.steps ?? undefined,
        temperature: body?.temperature,
        topP: body?.top_p,
        system: entity.system || '',
        color: storedAgentColor(entity.color),
      };

      const saved = savedRef.current;
      const current = currentFieldsRef.current;
      const dirty = saved !== null && (
        current.description !== saved.description || current.mode !== saved.mode ||
        current.model !== saved.model || current.variant !== saved.variant ||
        current.steps !== saved.steps || current.temperature !== saved.temperature ||
        current.topP !== saved.topP || current.system !== saved.system ||
        current.color !== saved.color
      );
      setStoredAt({ legacy: envelope.legacy === true, path: envelope.path, source: envelope.source });
      if (hydratedSelectionRef.current === selectionKey && dirty) return;
      hydratedSelectionRef.current = selectionKey;

      setDescription(next.description);
      setMode(next.mode);
      setModel(next.model);
      setVariant(next.variant);
      setSteps(next.steps);
      setTemperature(next.temperature);
      setTopP(next.topP);
      setSystem(next.system);
      setColor(next.color);
      savedRef.current = next;
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchAgentEntity, isNewAgent, selectedAgent, selectedAgentName, settingsDirectory, selectionKey]);

  const buildConfig = React.useCallback((agentName: string): AgentConfig => {
    const parsedModel = parseModelIdentifier(model.trim());
    const joinedModel = parsedModel
      ? formatModelSelection({
          providerID: parsedModel.providerId,
          modelID: parsedModel.modelId,
          variant: variant.trim() || undefined,
        })
      : null;

    const storedRequest = entityRef.current.request;
    const body: AgentRequestBody = { ...storedRequest?.body };
    if (temperature === undefined) delete body.temperature;
    else body.temperature = temperature;
    if (topP === undefined) delete body.top_p;
    else body.top_p = topP;

    const headers = storedRequest?.headers;
    const request: AgentRequest = {};
    if (headers && Object.keys(headers).length > 0) request.headers = headers;
    if (Object.keys(body).length > 0) request.body = body;

    const trimmedDescription = description.trim();
    const trimmedSystem = system.trim();
    const config: AgentConfig = {
      name: agentName,
      mode,
      model: joinedModel,
      steps: steps ?? null,
      system: trimmedSystem || (isNewAgent ? undefined : null),
      request: Object.keys(request).length > 0 ? request : null,
    };
    if (trimmedDescription) config.description = trimmedDescription;
    if (color !== (savedRef.current?.color ?? '')) config.color = color || null;
    if (isNewAgent && draftScope) config.scope = draftScope;
    if (isNewAgent && agentDraft?.hidden !== undefined) config.hidden = agentDraft.hidden;
    if (isNewAgent && agentDraft?.permissions?.length) {
      config.permissions = agentDraft.permissions;
>>>>>>> upstream/main
    }
    const sameSelection = hydratedSelectionRef.current === selectionKey;
    // Catalog events may publish an older save while the user is editing the next draft.
    // Keep both the draft and its original concurrency revision until it is saved.
    if (sameSelection && (savingRef.current || (savedRef.current && !fieldsEqual(formRef.current, savedRef.current)))) return;
    const next = fieldsForAgent(source);
    entityRef.current = source;
    revisionRef.current = revision;
    savedRef.current = next;
    hydratedSelectionRef.current = selectionKey;
    setForm(next);
    setSaveError(null);
  }, [source, revision, selectionKey]);

  const buildAgent = React.useCallback((name: string): Agent | null => {
    const entity = entityRef.current;
    if (!entity) return null;
    let allowedTools = form.allowedTools === null ? null : [...form.allowedTools];
    if (toolsCatalogError) {
      allowedTools = savedRef.current?.allowedTools ?? entity.allowedTools ?? null;
    }
    const agent: Agent = {
      ...entity,
      name,
      description: form.description,
      model: form.model,
      allowedTools,
    };
    // An untouched optional prompt retains its exact native representation.
    if (form.systemPromptOverride !== (entity.systemPromptOverride ?? '')) {
      if (form.systemPromptOverride) agent.systemPromptOverride = form.systemPromptOverride;
      else delete agent.systemPromptOverride;
    }
    if (form.thinkingLevel !== 'default') agent.thinkingLevel = form.thinkingLevel;
    else delete agent.thinkingLevel;
    const spawnsTrimmed = form.spawns.trim();
    if (spawnsTrimmed === '*') agent.spawns = '*';
    else if (spawnsTrimmed.length > 0) agent.spawns = spawnsTrimmed.split(',').map((s) => s.trim()).filter(Boolean);
    else delete agent.spawns;
    return agent;
  }, [form, toolsCatalogError]);

  const save = React.useCallback(async (): Promise<AutosaveResult> => {
    const saved = savedRef.current;
<<<<<<< HEAD
    if (isNewAgent || !selectedAgent || !saved || hydratedSelectionRef.current !== selectionKey) return AUTOSAVE_UNCHANGED;
    if (fieldsEqual(form, saved)) return AUTOSAVE_UNCHANGED;
    if (toolsCatalogError && form.allowedTools !== saved.allowedTools) return AUTOSAVE_UNCHANGED;
    const agent = buildAgent(selectedAgent.name);
    const expectedRevision = revisionRef.current;
    if (!agent || expectedRevision === undefined) return autosaveFailed(t('common.unavailable'));
    savingRef.current = true;
    try {
      const result = await updateAgent(agent, settingsDirectory, expectedRevision);
      if (!result.ok) {
        const reason = result.error || t('settings.agents.page.toast.updateFailed');
        if (selectionRef.current === selectionKey) setSaveError(reason);
        return autosaveFailed(reason);
      }
      if (selectionRef.current !== selectionKey) return AUTOSAVE_SAVED;
      entityRef.current = agent;
      savedRef.current = form;
      revisionRef.current = result.revision ?? expectedRevision;
      setSaveError(null);
      return AUTOSAVE_SAVED;
    } catch (error) {
      const reason = error instanceof Error ? error.message : t('settings.agents.page.toast.saveUnexpectedError');
      if (selectionRef.current === selectionKey) setSaveError(reason);
      return autosaveFailed(reason);
    } finally {
      savingRef.current = false;
    }
  }, [isNewAgent, selectedAgent, selectionKey, form, buildAgent, updateAgent, settingsDirectory, toolsCatalogError, t]);
||||||| bc50ba56aa
    const agentName = selectedAgentName?.trim();
    if (isNewAgent || !saved || !agentName) return AUTOSAVE_UNCHANGED;

    // The permissions section is part of this page, so its write goes out with
    // the page's and both report through one indicator.
    const permissionsResult = permissionsSaveRef.current
      ? await permissionsSaveRef.current()
      : AUTOSAVE_UNCHANGED;

    const unchanged =
      description === saved.description &&
      mode === saved.mode &&
      model === saved.model &&
      variant === saved.variant &&
      steps === saved.steps &&
      temperature === saved.temperature &&
      topP === saved.topP &&
      system === saved.system &&
      color === saved.color;
    if (unchanged) return permissionsResult;
    if (!permissionsResult.ok) return permissionsResult;

    const config = buildConfig(agentName);
    const result: AgentMutationResult = await updateAgent(agentName, config, settingsDirectory);
    if (!result.ok) return autosaveFailed(t('settings.agents.page.toast.updateFailed'));
    if (selectionRef.current !== selectionKey) return AUTOSAVE_SAVED;

    entityRef.current = {
      ...entityRef.current,
      model: config.model,
      system: config.system ?? undefined,
      steps: config.steps,
      request: config.request ?? undefined,
    };
    savedRef.current = {
      ...saved,
      description,
      mode,
      model,
      variant,
      steps,
      temperature,
      topP,
      system,
      color,
    };
    return AUTOSAVE_SAVED;
  }, [
    buildConfig,
    color,
    description,
    isNewAgent,
    mode,
    model,
    selectedAgentName,
    selectionKey,
    settingsDirectory,
    steps,
    system,
    t,
    temperature,
    topP,
    updateAgent,
    variant,
  ]);

=======
    const agentName = selectedAgentName?.trim();
    if (isNewAgent || !saved || !agentName) return AUTOSAVE_UNCHANGED;

    const permissionsResult = permissionsSaveRef.current
      ? await permissionsSaveRef.current()
      : AUTOSAVE_UNCHANGED;

    const unchanged =
      description === saved.description &&
      mode === saved.mode &&
      model === saved.model &&
      variant === saved.variant &&
      steps === saved.steps &&
      temperature === saved.temperature &&
      topP === saved.topP &&
      system === saved.system &&
      color === saved.color;
    if (unchanged) return permissionsResult;
    if (!permissionsResult.ok) return permissionsResult;

    const config = buildConfig(agentName);
    const result: AgentMutationResult = await updateAgent(agentName, config, settingsDirectory);
    if (!result.ok) return autosaveFailed(t('settings.agents.page.toast.updateFailed'));
    if (selectionRef.current !== selectionKey) return AUTOSAVE_SAVED;

    entityRef.current = {
      ...entityRef.current,
      model: config.model,
      system: config.system ?? undefined,
      steps: config.steps,
      request: config.request ?? undefined,
    };
    savedRef.current = {
      ...saved,
      description,
      mode,
      model,
      variant,
      steps,
      temperature,
      topP,
      system,
      color,
    };
    return AUTOSAVE_SAVED;
  }, [
    buildConfig,
    color,
    description,
    isNewAgent,
    mode,
    model,
    selectedAgentName,
    selectionKey,
    settingsDirectory,
    steps,
    system,
    t,
    temperature,
    topP,
    updateAgent,
    variant,
  ]);

>>>>>>> upstream/main
  const autosave = useAutosave(save);
  const { requestSave } = autosave;

  const handleCreate = async () => {
    const name = form.name.trim().replace(/\s+/g, '-');
    if (!name) { toast.error(t('settings.agents.sidebar.toast.agentNameRequired')); return; }
    if (agents.some((agent) => agent.name === name)) { toast.error(t('settings.agents.sidebar.toast.agentExists')); return; }
    const agent = buildAgent(name);
    if (!agent) return;
    const owner = creationOwnerRef.current;
    setIsCreating(true);
    try {
      const result = await createAgent(agent, settingsDirectory);
      if (creationOwnerRef.current.directory !== owner.directory ||
        (creationOwnerRef.current.name !== owner.name && creationOwnerRef.current.name !== name)) return;
      if (result.ok) {
        setAgentDraft(null);
        setSelectedAgent(name);
        toast.success(t('settings.agents.page.toast.created'));
      } else {
        const reason = result.error || t('settings.agents.page.toast.createFailed');
        setSaveError(reason);
        toast.error(reason);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : t('settings.agents.page.toast.saveUnexpectedError');
      if (creationOwnerRef.current.directory === owner.directory &&
        (creationOwnerRef.current.name === owner.name || creationOwnerRef.current.name === name)) setSaveError(reason);
      toast.error(reason);
    } finally { setIsCreating(false); }
  };

  const error = saveError || catalogError;
  if (!selectedAgentName) {
    return (
      <SettingsPageLayout
        title={t('settings.agents.page.globalTitle')}
        description={t('settings.agents.page.globalDescription')}
        showSaveStatus
      >
        {/* Subagents */}
        <SettingsSection
          title={t('settings.omp.section.subagents.title')}
          description={t('settings.omp.section.subagents.description')}
          divider={false}
          settingsItem="agents.section.subagents"
        >
          <div className={SETTINGS_SPACE_ROW_CLASS}>
            <ModelRoleEditor
              role="task"
              roles={roleSelectors}
              models={models}
              directory={settingsDirectory ?? undefined}
              disabled={ompLoading}
              label={t('settings.omp.modelRoles.role.task.label')}
              info={t('settings.omp.modelRoles.role.task.desc')}
              settingsItem="omp.modelRoles.task"
              onChange={(selector) => void handleRoleChange('task', selector)}
            />
            {subagentSettings.map((s) => (
              <OmpRowControl
                key={s.id}
                setting={s}
                value={ompForm[s.id] !== undefined ? ompForm[s.id] : s.value}
                disabled={ompLoading}
                onChange={(val) => void updateOmpSetting(s.id, val)}
              />
            ))}
          </div>
        </SettingsSection>

        {/* Prewalk */}
        <SettingsSection
          title={t('settings.agents.section.prewalk.title')}
          description={t('settings.agents.section.prewalk.description')}
          settingsItem="agents.section.prewalk"
        >
          <div className={SETTINGS_SPACE_ROW_CLASS}>
            {prewalkSettings.map((s) => (
              <OmpRowControl
                key={s.id}
                setting={s}
                value={ompForm[s.id] !== undefined ? ompForm[s.id] : s.value}
                disabled={ompLoading}
                onChange={(val) => void updateOmpSetting(s.id, val)}
              />
            ))}
          </div>
        </SettingsSection>

        {/* Advisor */}
        <SettingsSection
          title={t('settings.agents.section.advisor.title')}
          description={t('settings.agents.section.advisor.description')}
          settingsItem="agents.section.advisor"
        >
          <div className={SETTINGS_SPACE_ROW_CLASS}>
            <ModelRoleEditor
              role="advisor"
              roles={roleSelectors}
              models={models}
              directory={settingsDirectory ?? undefined}
              disabled={ompLoading}
              label={t('settings.omp.modelRoles.role.advisor.label')}
              info={t('settings.omp.modelRoles.role.advisor.desc')}
              settingsItem="omp.modelRoles.advisor"
              onChange={(selector) => void handleRoleChange('advisor', selector)}
            />
            {advisorSettings.map((s) => (
              <OmpRowControl
                key={s.id}
                setting={s}
                value={ompForm[s.id] !== undefined ? ompForm[s.id] : s.value}
                disabled={ompLoading}
                onChange={(val) => void updateOmpSetting(s.id, val)}
              />
            ))}
          </div>
        </SettingsSection>
      </SettingsPageLayout>
    );
  }

<<<<<<< HEAD
  return <SettingsPageLayout
    title={isNewAgent ? t('settings.agents.page.title.new') : selectedAgentName}
    description={isNewAgent ? t('settings.agents.page.subtitle.new') : t('settings.agents.page.subtitle.edit')}
    onBlurCapture={autosave.onBlurCapture}
  >
    {error && <p role="alert" className="mb-4 typography-meta text-destructive">{error}</p>}
    {!source || (!isNewAgent && revision === undefined) ? <p role="status">{t('common.unavailable')}</p> : <>
      <SettingsSection title={t('settings.agents.page.section.identityRole')} divider={false} contentClassName={SETTINGS_SPACE_ROW_CLASS}>
        {isNewAgent && <SettingsFieldRow settingsItem="agents.name" label={t('settings.agents.page.field.agentName')}>
          <div className="flex items-center">
            <span className="typography-ui-label text-muted-foreground mr-1">@</span>
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={t('settings.agents.page.field.agentNamePlaceholder')} className={SETTINGS_WIDTH_SHORT_TEXT_CLASS} />
          </div>
        </SettingsFieldRow>}
        <SettingsStackedField label={t('settings.common.field.description')} controlClassName="w-full max-w-none">
          <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder={t('settings.agents.page.field.descriptionPlaceholder')} rows={2}
            className="w-full resize-none min-h-[60px] bg-transparent" />
        </SettingsStackedField>
      </SettingsSection>
      <SettingsSection title={t('settings.agents.page.section.modelParameters')} contentClassName={SETTINGS_SPACE_ROW_CLASS}>
        <SettingsFieldRow settingsItem="agents.model" label={t('settings.agents.page.field.overrideModel')}>
          <ModelSelector providerId={form.model?.providerId ?? ''} modelId={form.model?.modelId ?? ''}
            directory={settingsDirectory ?? undefined}
            onChange={(providerId, modelId) => {
              setForm({ ...form, model: providerId && modelId ? { providerId, modelId } : null });
              requestSave();
            }} className={SETTINGS_CUSTOM_TRIGGER_CLASS} />
        </SettingsFieldRow>
        <SettingsFieldRow settingsItem="agents.thinking-level" label={t('sessions.scheduledTasks.editor.thinkingLevel.label')}>
          <Select
            value={form.thinkingLevel}
            onValueChange={(value) => {
              setForm({ ...form, thinkingLevel: value as AgentThinkingLevel | 'default' });
              requestSave();
            }}
||||||| bc50ba56aa
  return (
    <SettingsPageLayout
      title={isNewAgent ? t('settings.agents.page.title.new') : selectedAgentName}
      description={isNewAgent ? t('settings.agents.page.subtitle.new') : t('settings.agents.page.subtitle.edit')}
      onBlurCapture={autosave.onBlurCapture}
    >
      {!isNewAgent && storedAt && (
        <SettingsLegacyFormatNote legacy={storedAt.legacy} path={storedAt.path} />
      )}
      {!isNewAgent && storedAt?.source === 'none' && (
        <p className={`mb-4 flex items-start gap-1.5 ${SETTINGS_HELPER_CLASS}`}>
          <Icon name="information" className="mt-[0.2em] h-3.5 w-3.5 shrink-0 opacity-70" />
          <span>{t('settings.agents.page.runtimeProvided.note')}</span>
        </p>
      )}
      <SettingsSection
        title={t('settings.agents.page.section.identityRole')}
        divider={false}
        contentClassName="space-y-3"
      >
        {isNewAgent && (
          <SettingsFieldRow
            settingsItem="agents.name"
            label={t('settings.agents.page.field.agentName')}
=======
  return (
    <SettingsPageLayout
      title={isNewAgent ? t('settings.agents.page.title.new') : selectedAgentName}
      description={isNewAgent ? t('settings.agents.page.subtitle.new') : t('settings.agents.page.subtitle.edit')}
      onBlurCapture={autosave.onBlurCapture}
    >
      {!isNewAgent && storedAt && (
        <SettingsLegacyFormatNote legacy={storedAt.legacy} path={storedAt.path} />
      )}
      {!isNewAgent && storedAt?.source === 'none' && (
        <p className={`mb-4 flex items-start gap-1.5 ${SETTINGS_HELPER_CLASS}`}>
          <Icon name="information" className="mt-[0.2em] h-3.5 w-3.5 shrink-0 opacity-70" />
          <span>{t('settings.agents.page.runtimeProvided.note')}</span>
        </p>
      )}
      <SettingsSection
        title={t('settings.agents.page.section.identityRole')}
        contentClassName="space-y-3"
      >
        {isNewAgent && (
          <SettingsFieldRow
            settingsItem="agents.name"
            label={t('settings.agents.page.field.agentName')}
>>>>>>> upstream/main
          >
            <SelectTrigger className={SETTINGS_WIDTH_SELECT_CLASS} aria-label={t('sessions.scheduledTasks.editor.thinkingLevel.label')}>
              <SelectValue>{thinkingLevelLabel(form.thinkingLevel, t)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{t('sessions.scheduledTasks.editor.thinkingLevel.default')}</SelectItem>
              <SelectItem value="off">{t('settings.skills.page.use.off')}</SelectItem>
              <SelectItem value="minimal">{t('settings.omp.modelRoles.effort.minimal')}</SelectItem>
              <SelectItem value="low">{t('settings.omp.modelRoles.effort.low')}</SelectItem>
              <SelectItem value="medium">{t('settings.omp.modelRoles.effort.medium')}</SelectItem>
              <SelectItem value="high">{t('settings.omp.modelRoles.effort.high')}</SelectItem>
              <SelectItem value="xhigh">{t('settings.omp.modelRoles.effort.high')}</SelectItem>
              <SelectItem value="max">{t('settings.omp.modelRoles.effort.max')}</SelectItem>
              <SelectItem value="auto">{t('settings.remoteInstances.page.field.auto')}</SelectItem>
            </SelectContent>
          </Select>
        </SettingsFieldRow>
        <SettingsFieldRow settingsItem="agents.spawns" label={t('settings.agents.page.mode.subagent')}>
          <Input
            value={form.spawns}
            placeholder={t('settings.commands.agentSelector.selectAgentPlaceholder')}
            aria-label={t('settings.agents.page.mode.subagent')}
            onChange={(event) => {
              setForm({ ...form, spawns: event.target.value });
              requestSave();
            }}
            className={`${SETTINGS_WIDTH_SHORT_TEXT_CLASS} font-mono typography-meta`}
          />
        </SettingsFieldRow>
      </SettingsSection>
      <SettingsSection title={t('settings.agents.page.section.systemPrompt')} settingsItem="agents.system-prompt">
        <Textarea value={form.systemPromptOverride}
          onChange={(event) => setForm({ ...form, systemPromptOverride: event.target.value })}
          placeholder={t('settings.agents.page.field.systemPromptPlaceholder')} rows={8}
          className="w-full font-mono typography-meta min-h-[120px] max-h-[60vh] bg-transparent" />
      </SettingsSection>
      <SettingsSection title={t('settings.agents.page.section.toolPermissions')} settingsItem="agents.permissions" contentClassName={SETTINGS_SPACE_ROW_CLASS}>
        {toolsCatalogError ? (
          <div
            role="status"
            className="flex items-center justify-between gap-2 rounded-lg border border-[var(--status-warning)]/30 bg-[var(--status-warning)]/10 px-3 py-2 typography-meta text-[var(--status-warning)]"
          >
            <span>{t('common.unavailable')}</span>
            <Button size="xs" variant="outline" onClick={() => setCatalogRetryCount((c) => c + 1)}>
              {t('settings.agents.page.permissionsEditor.actions.retry')}
            </Button>
          </div>
        ) : null}
        <AgentPermissionsEditor
          allowedTools={form.allowedTools}
          toolsCatalog={toolsCatalog}
          disabled={Boolean(toolsCatalogError)}
          onChange={(nextTools) => {
            if (toolsCatalogError) return;
            setForm((current) => ({ ...current, allowedTools: nextTools }));
            requestSave();
          }}
        />
      </SettingsSection>
      {isNewAgent && <div className="flex items-center gap-2 pb-8">
        <Button onClick={() => void handleCreate()} disabled={isCreating || !form.name.trim()} size="xs" className="!font-normal">
          {isCreating ? t('settings.common.actions.saving') : t('settings.common.actions.create')}
        </Button>
        <Button variant="ghost" onClick={() => { setAgentDraft(null); setSelectedAgent(null); }}
          disabled={isCreating} size="xs" className="!font-normal">{t('settings.common.actions.cancel')}</Button>
      </div>}
    </>}
  </SettingsPageLayout>;
};
