import React from 'react';
import type { AutosaveResult } from '@/components/sections/shared/SettingsAutosave';
import type { Agent, AgentThinkingLevel, ToolCatalogEntry } from '@openchamber/agent-contract';
import { useOmpPageSettings } from '@/components/sections/shared/useOmpPageSettings';
import { OmpRowControl } from '@/components/sections/shared/OmpRowControl';
import { ModelRoleEditor } from '@/components/sections/shared/ModelRoleEditor';
import { defaultThinkingLevelFromState, modelRoleChange, parseRolesRecord, roleSelector } from '@/components/sections/shared/modelRoleSelectors';
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
import { useSettingsModels } from '@/hooks/useSettingsModels';
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

interface FormState {
  name: string;
  description: string;
  model: Agent['model'];
  systemPromptOverride: string;
  allowedTools: string[] | null;
  thinkingLevel: AgentThinkingLevel | 'default';
  spawns: string;
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
    case 'xhigh': return t('settings.omp.modelRoles.effort.xhigh');
    case 'max': return t('settings.omp.modelRoles.effort.max');
    case 'auto': return t('settings.remoteInstances.page.field.auto');
    default: return level;
  }
};

export const AgentsPage: React.FC = () => {
  const { t } = useI18n();
  const settingsDirectory = useSettingsDirectory();
  const directoryKey = settingsDirectory?.trim() || '__default__';
  const {
    selectedAgentName, createAgent, updateAgent, loadAgents, agentDraft, setAgentDraft, setSelectedAgent,
  } = useAgentsStore(useShallow((state) => ({
    selectedAgentName: state.selectedAgentName, createAgent: state.createAgent,
    updateAgent: state.updateAgent, loadAgents: state.loadAgents,
    agentDraft: state.agentDraft, setAgentDraft: state.setAgentDraft, setSelectedAgent: state.setSelectedAgent,
  })));
  const models = useSettingsModels(settingsDirectory);
  const { state: ompState, form: ompForm, updateSetting: updateOmpSetting, updateSettings, getSectionSettings, loading: ompLoading, saving: ompSaving } = useOmpPageSettings('agents');
  const subagentSettings = getSectionSettings('subagents').filter((s) => s.conditionActive !== false);
  const prewalkSettings = getSectionSettings('prewalk').filter((s) => s.conditionActive !== false);
  const advisorSettings = getSectionSettings('advisor').filter((s) => s.conditionActive !== false);

  const modelRolesSetting = ompState?.settings.find((s) => s.id === 'modelRoles');
  const rolesMap = React.useMemo(() => parseRolesRecord(modelRolesSetting?.value), [modelRolesSetting?.value]);
  const roleSelectors = React.useMemo(
    () => Object.fromEntries(Object.entries(rolesMap).map(([role, value]) => [role, roleSelector(value)])),
    [rolesMap],
  );
  const globalLevel = React.useMemo(() => defaultThinkingLevelFromState(ompState), [ompState]);
  const setRole = React.useCallback(async (role: string, selector: string) => {
    const saved = await updateSettings((state) => [modelRoleChange(state, role, selector)]);
    if (!saved) toast.error(t('settings.omp.modelRoles.saveFailed'));
  }, [t, updateSettings]);

  const agents = useAgentsStore((state) => selectAgentsForDirectory(state, settingsDirectory));
  const revision = useAgentsStore((state) => state.revisionsByDirectory[directoryKey]);
  const catalogError = useAgentsStore((state) => state.errorsByDirectory[directoryKey]);
  const selectedAgent = agents.find((agent) => agent.name === selectedAgentName) ?? null;
  const isNewAgent = Boolean(agentDraft && agentDraft.name === selectedAgentName && !selectedAgent);
  const source = isNewAgent ? agentDraft : selectedAgent;
  const selectionKey = JSON.stringify([settingsDirectory, source?.agentId, selectedAgentName, isNewAgent]);
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
    if (!source) {
      hydratedSelectionRef.current = null;
      entityRef.current = null;
      savedRef.current = null;
      revisionRef.current = undefined;
      setSaveError(null);
      return;
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
              globalLevel={globalLevel}
              disabled={ompLoading || ompSaving || !ompState}
              loading={ompLoading && !ompState}
              label={t('settings.omp.modelRoles.role.task.label')}
              info={t('settings.omp.modelRoles.role.task.desc')}
              onChange={(selector) => void setRole('task', selector)}
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
              globalLevel={globalLevel}
              disabled={ompLoading || ompSaving || !ompState}
              loading={ompLoading && !ompState}
              label={t('settings.omp.modelRoles.role.advisor.label')}
              info={t('settings.omp.modelRoles.role.advisor.desc')}
              onChange={(selector) => void setRole('advisor', selector)}
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
              <SelectItem value="xhigh">{t('settings.omp.modelRoles.effort.xhigh')}</SelectItem>
              <SelectItem value="max">{t('settings.omp.modelRoles.effort.max')}</SelectItem>
              <SelectItem value="auto">{t('settings.remoteInstances.page.field.auto')}</SelectItem>
            </SelectContent>
          </Select>
        </SettingsFieldRow>
        <SettingsFieldRow
          settingsItem="agents.spawns"
          label={t('settings.agents.page.spawns.label')}
          info={t('settings.agents.page.spawns.info')}
        >
          <Input
            value={form.spawns}
            aria-label={t('settings.agents.page.spawns.label')}
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
