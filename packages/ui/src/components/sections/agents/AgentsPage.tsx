import React from 'react';
import type { AutosaveResult } from '@/components/sections/shared/SettingsAutosave';
import type { Agent } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  SettingsSection, SettingsFieldRow, SettingsStackedField, SETTINGS_CUSTOM_TRIGGER_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { Icon } from '@/components/icon/Icon';

interface FormState {
  name: string;
  description: string;
  model: Agent['model'];
  systemPromptOverride: string;
  allowedTools: string;
  permissionPresetId: string;
}

const fieldsForAgent = (agent: Agent): FormState => ({
  name: agent.name,
  description: agent.description,
  model: agent.model,
  systemPromptOverride: agent.systemPromptOverride ?? '',
  allowedTools: agent.allowedTools.join('\n'),
  permissionPresetId: agent.permissionPresetId ?? '',
});
const fieldsEqual = (left: FormState, right: FormState): boolean =>
  left.name === right.name && left.description === right.description &&
  left.model?.providerId === right.model?.providerId && left.model?.modelId === right.model?.modelId &&
  left.systemPromptOverride === right.systemPromptOverride &&
  left.allowedTools === right.allowedTools && left.permissionPresetId === right.permissionPresetId;

export const AgentsPage: React.FC = () => {
  const { t } = useI18n();
  const settingsDirectory = useSettingsDirectory();
  const directoryKey = settingsDirectory?.trim() || '__default__';
  const {
    selectedAgentName, createAgent, updateAgent, loadAgents, agentDraft, setAgentDraft, setSelectedAgent,
  } = useAgentsStore(useShallow((state) => ({
    selectedAgentName: state.selectedAgentName,
    createAgent: state.createAgent,
    updateAgent: state.updateAgent,
    loadAgents: state.loadAgents,
    agentDraft: state.agentDraft,
    setAgentDraft: state.setAgentDraft,
    setSelectedAgent: state.setSelectedAgent,
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
    name: '', description: '', model: null, systemPromptOverride: '', allowedTools: '', permissionPresetId: '',
  });
  const formRef = React.useRef(form);
  formRef.current = form;
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
    const agent: Agent = {
      ...entity,
      name,
      description: form.description,
      model: form.model,
    };
    if (form.allowedTools !== entity.allowedTools.join('\n')) {
      agent.allowedTools = form.allowedTools.split('\n').map((tool) => tool.trim()).filter(Boolean);
    }
    // An untouched optional prompt retains its exact native representation.
    if (form.systemPromptOverride !== (entity.systemPromptOverride ?? '')) {
      if (form.systemPromptOverride) agent.systemPromptOverride = form.systemPromptOverride;
      else delete agent.systemPromptOverride;
    }
    if (form.permissionPresetId) agent.permissionPresetId = form.permissionPresetId;
    else delete agent.permissionPresetId;
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
          <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder={t('settings.agents.page.field.agentNamePlaceholder')} className="h-7 w-40 px-2" />
        </SettingsFieldRow>}
        <SettingsStackedField label={t('settings.common.field.description')} controlClassName="w-full max-w-none">
          <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder={t('settings.agents.page.field.descriptionPlaceholder')} rows={2}
            className="w-full resize-none min-h-[60px] bg-transparent" />
        </SettingsStackedField>
      </SettingsSection>
      <SettingsSection title={t('settings.agents.page.field.overrideModel')} contentClassName="space-y-3">
        <SettingsFieldRow settingsItem="agents.model" label={t('settings.agents.page.field.overrideModel')}>
          <ModelSelector providerId={form.model?.providerId ?? ''} modelId={form.model?.modelId ?? ''}
            directory={settingsDirectory ?? undefined}
            onChange={(providerId, modelId) => {
              setForm({ ...form, model: providerId && modelId ? { providerId, modelId } : null });
              requestSave();
            }} className={SETTINGS_CUSTOM_TRIGGER_CLASS} />
        </SettingsFieldRow>
      </SettingsSection>
      <SettingsSection title={t('settings.agents.page.section.systemPrompt')} settingsItem="agents.system-prompt">
        <Textarea value={form.systemPromptOverride}
          onChange={(event) => setForm({ ...form, systemPromptOverride: event.target.value })}
          placeholder={t('settings.agents.page.field.systemPromptPlaceholder')} rows={8}
          className="w-full font-mono typography-meta min-h-[120px] max-h-[60vh] bg-transparent" />
      </SettingsSection>
      <SettingsSection title={t('settings.agents.page.section.toolPermissions')} settingsItem="agents.permissions" contentClassName="space-y-3">
        <SettingsStackedField label={t('settings.agents.page.field.allowedTools')}>
          <Textarea value={form.allowedTools}
            aria-label={t('settings.agents.page.field.allowedTools')}
            onChange={(event) => setForm({ ...form, allowedTools: event.target.value })}
            placeholder={t('settings.agents.page.field.allowedToolsHint')} rows={4}
            className="w-full font-mono typography-meta bg-transparent" />
        </SettingsStackedField>
        <SettingsFieldRow label={t('settings.agents.page.field.permissionPreset')}>
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
