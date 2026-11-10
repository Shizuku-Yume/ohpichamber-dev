import React from 'react';
import type { AutosaveResult } from '@/components/sections/shared/SettingsAutosave';
import type { Agent, AgentThinkingLevel } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { NATIVE_TOOL_NAMES } from '@/lib/toolHelpers';
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
  SETTINGS_HELPER_CLASS,
  SETTINGS_ICON_BUTTON_CLASS,
  SETTINGS_SELECT_ROW_TRIGGER_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { Icon } from '@/components/icon/Icon';

interface FormState {
  name: string;
  description: string;
  model: Agent['model'];
  systemPromptOverride: string;
  allowedTools: string[] | null;
  permissionPresetId: string;
  thinkingLevel: AgentThinkingLevel | 'default';
  spawns: string;
}

const fieldsForAgent = (agent: Agent): FormState => ({
  name: agent.name,
  description: agent.description,
  model: agent.model,
  systemPromptOverride: agent.systemPromptOverride ?? '',
  allowedTools: agent.allowedTools === null ? null : [...agent.allowedTools],
  permissionPresetId: agent.permissionPresetId ?? '',
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
  left.permissionPresetId === right.permissionPresetId &&
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
  const settingsDirectory = useSettingsDirectory();
  const directoryKey = settingsDirectory?.trim() || '__default__';
  const {
    selectedAgentName, createAgent, updateAgent, loadAgents, agentDraft, setAgentDraft, setSelectedAgent,
  } = useAgentsStore(useShallow((state) => ({
    selectedAgentName: state.selectedAgentName, createAgent: state.createAgent,
    updateAgent: state.updateAgent, loadAgents: state.loadAgents,
    agentDraft: state.agentDraft, setAgentDraft: state.setAgentDraft, setSelectedAgent: state.setSelectedAgent,
  })));
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
    name: '', description: '', model: null, systemPromptOverride: '', allowedTools: null, permissionPresetId: '',
    thinkingLevel: 'default', spawns: '',
  });
  const formRef = React.useRef(form);
  formRef.current = form;
  const [toolDraft, setToolDraft] = React.useState('');
  const [toolsEditing, setToolsEditing] = React.useState(false);
  const toolDraftSelectionRef = React.useRef(selectionKey);
  const [isCreating, setIsCreating] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => { void loadAgents(settingsDirectory); }, [loadAgents, settingsDirectory]);

  React.useEffect(() => {
    if (!source) {
      hydratedSelectionRef.current = null;
      entityRef.current = null;
      savedRef.current = null;
      revisionRef.current = undefined;
      toolDraftSelectionRef.current = selectionKey;
      setToolDraft('');
      setToolsEditing(false);
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
    setToolsEditing(false);
    if (toolDraftSelectionRef.current !== selectionKey) {
      toolDraftSelectionRef.current = selectionKey;
      setToolDraft('');
    }
    setSaveError(null);
  }, [source, revision, selectionKey]);

  const buildAgent = React.useCallback((name: string): Agent | null => {
    const entity = entityRef.current;
    if (!entity) return null;
    const agent: Agent = {
      ...entity,
      name,
      description: form.description,
      model: form.model,
      allowedTools: form.allowedTools === null ? null : [...form.allowedTools],
    };
    // An untouched optional prompt retains its exact native representation.
    if (form.systemPromptOverride !== (entity.systemPromptOverride ?? '')) {
      if (form.systemPromptOverride) agent.systemPromptOverride = form.systemPromptOverride;
      else delete agent.systemPromptOverride;
    }
    if (form.permissionPresetId) agent.permissionPresetId = form.permissionPresetId;
    else delete agent.permissionPresetId;
    if (form.thinkingLevel !== 'default') agent.thinkingLevel = form.thinkingLevel;
    else delete agent.thinkingLevel;
    const spawnsTrimmed = form.spawns.trim();
    if (spawnsTrimmed === '*') agent.spawns = '*';
    else if (spawnsTrimmed.length > 0) agent.spawns = spawnsTrimmed.split(',').map((s) => s.trim()).filter(Boolean);
    else delete agent.spawns;
    return agent;
  }, [form]);

  const save = React.useCallback(async (): Promise<AutosaveResult> => {
    const saved = savedRef.current;
    if (isNewAgent || !selectedAgent || !saved || hydratedSelectionRef.current !== selectionKey) return AUTOSAVE_UNCHANGED;
    if (fieldsEqual(form, saved)) return AUTOSAVE_UNCHANGED;
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
  }, [isNewAgent, selectedAgent, selectionKey, form, buildAgent, updateAgent, settingsDirectory, t]);
  const autosave = useAutosave(save);
  const { requestSave } = autosave;

  const addTool = () => {
    const tool = toolDraft.trim();
    if (!tool) return;
    setToolDraft('');
    const tools = formRef.current.allowedTools ?? [];
    if (tools.includes(tool)) return;
    setForm((current) => ({ ...current, allowedTools: [...(current.allowedTools ?? []), tool] }));
    requestSave();
  };

  const removeTool = (index: number) => {
    setForm((current) => ({ ...current, allowedTools: (current.allowedTools ?? []).filter((_, toolIndex) => toolIndex !== index) }));
    requestSave();
  };

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
    return <div className="flex h-full items-center justify-center">
      <div className="text-center text-muted-foreground">
        <Icon name="robot-2" className="mx-auto mb-3 h-12 w-12 opacity-50" />
        {error ? <p role="alert">{error}</p> : <>
          <p className="typography-body">{t('settings.agents.page.empty.title')}</p>
          <p className="typography-meta mt-1 opacity-75">{t('settings.agents.page.empty.description')}</p>
        </>}
      </div>
    </div>;
  }

  return <SettingsPageLayout
    title={isNewAgent ? t('settings.agents.page.title.new') : selectedAgentName}
    description={isNewAgent ? t('settings.agents.page.subtitle.new') : t('settings.agents.page.subtitle.edit')}
    onBlurCapture={autosave.onBlurCapture}
  >
    {error && <p role="alert" className="mb-4 typography-meta text-destructive">{error}</p>}
    {!source || (!isNewAgent && revision === undefined) ? <p role="status">{t('common.unavailable')}</p> : <>
      <SettingsSection title={t('settings.agents.page.section.identityRole')} divider={false} contentClassName="space-y-3">
        {isNewAgent && <SettingsFieldRow settingsItem="agents.name" label={t('settings.agents.page.field.agentName')}>
          <div className="flex items-center">
            <span className="typography-ui-label text-muted-foreground mr-1">@</span>
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={t('settings.agents.page.field.agentNamePlaceholder')} className="h-7 w-40 px-2" />
          </div>
        </SettingsFieldRow>}
        <SettingsStackedField label={t('settings.common.field.description')} controlClassName="w-full max-w-none">
          <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder={t('settings.agents.page.field.descriptionPlaceholder')} rows={2}
            className="w-full resize-none min-h-[60px] bg-transparent" />
        </SettingsStackedField>
      </SettingsSection>
      <SettingsSection title={t('settings.agents.page.section.modelParameters')} contentClassName="space-y-3">
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
            <SelectTrigger className={SETTINGS_SELECT_ROW_TRIGGER_CLASS} aria-label={t('sessions.scheduledTasks.editor.thinkingLevel.label')}>
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
            className="h-8 w-64 px-2 font-mono text-xs"
          />
        </SettingsFieldRow>
      </SettingsSection>
      <SettingsSection title={t('settings.agents.page.section.systemPrompt')} settingsItem="agents.system-prompt">
        <Textarea value={form.systemPromptOverride}
          onChange={(event) => setForm({ ...form, systemPromptOverride: event.target.value })}
          placeholder={t('settings.agents.page.field.systemPromptPlaceholder')} rows={8}
          className="w-full font-mono typography-meta min-h-[120px] max-h-[60vh] bg-transparent" />
      </SettingsSection>
      <SettingsSection title={t('settings.agents.page.section.toolPermissions')} settingsItem="agents.permissions" contentClassName="space-y-3">
        <SettingsStackedField
          settingsItem="agents.allowed-tools"
          label={t('settings.agents.page.field.allowedTools')}
          controlClassName="w-full max-w-none flex-col items-stretch"
        >
          {form.allowedTools === null && !toolsEditing ? (
            <div className="flex items-center justify-between gap-2 py-1">
              <p className={SETTINGS_HELPER_CLASS}>{t('settings.agents.page.field.allowedToolsInherit')}</p>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setToolsEditing(true)}
              >
                {t('settings.agents.page.field.allowedToolsEdit')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setToolsEditing(false);
                    setForm((current) => ({ ...current, allowedTools: null }));
                    requestSave();
                  }}
                >
                  {t('settings.agents.page.field.allowedToolsUseDefault')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setToolsEditing(true);
                    setForm((current) => ({ ...current, allowedTools: [...NATIVE_TOOL_NAMES] }));
                    requestSave();
                  }}
                >
                  {t('settings.providers.page.actions.showAll')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setToolsEditing(true);
                    setForm((current) => ({ ...current, allowedTools: [] }));
                    requestSave();
                  }}
                >
                  {t('settings.providers.page.actions.hideAll')}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {NATIVE_TOOL_NAMES.map((tool) => {
                  const checked = (form.allowedTools ?? []).includes(tool);
                  return (
                    <label
                      key={tool}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-border/40 p-2 text-xs font-mono hover:bg-[var(--surface-subtle)]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setToolsEditing(true);
                          const currentTools = form.allowedTools ?? [];
                          const next = e.target.checked
                            ? [...currentTools, tool]
                            : currentTools.filter((t) => t !== tool);
                          setForm((current) => ({ ...current, allowedTools: next }));
                          requestSave();
                        }}
                        className="size-3.5 rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="truncate">{tool}</span>
                    </label>
                  );
                })}
              </div>

              {form.allowedTools !== null && form.allowedTools.length > 0 ? (
                <ul className="w-full">
                  {form.allowedTools.map((tool, index) => (
                    <li key={`${tool}-${index}`} className="flex min-h-8 items-center gap-2 border-t border-border/40 py-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{tool}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className={SETTINGS_ICON_BUTTON_CLASS}
                        aria-label={t('settings.environment.editor.removeAria', { name: tool })}
                        title={t('settings.environment.editor.remove')}
                        onClick={() => removeTool(index)}
                      >
                        <Icon name="close" className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <form
                className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  addTool();
                }}
              >
                <Input
                  value={toolDraft}
                  onChange={(event) => setToolDraft(event.target.value)}
                  aria-label={t('settings.agents.page.field.allowedTools')}
                  className="h-8 w-full max-w-[16rem] font-mono text-xs"
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="xs"
                  disabled={!toolDraft.trim()}
                  className="!font-normal"
                  aria-label={t('settings.environment.editor.add')}
                  title={t('settings.environment.editor.add')}
                >
                  <Icon name="add" className="mr-1 h-3.5 w-3.5" />
                  {t('settings.environment.editor.add')}
                </Button>
              </form>
            </div>
          )}
        </SettingsStackedField>
        <SettingsFieldRow settingsItem="agents.permission-preset" label={t('settings.agents.page.field.permissionPreset')}>
          <Input value={form.permissionPresetId}
            aria-label={t('settings.agents.page.field.permissionPreset')}
            onChange={(event) => setForm({ ...form, permissionPresetId: event.target.value })}
            className="h-8 w-64 px-2" />
        </SettingsFieldRow>
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
