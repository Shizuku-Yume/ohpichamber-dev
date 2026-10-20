import React from 'react';
import type { ModelSelection } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { selectCommandsForDirectory, useCommandsStore, type CommandConfig, type CommandScope } from '@/stores/useCommandsStore';
import { ModelSelector } from '../agents/ModelSelector';
import { selectAgentsForDirectory, useAgentsStore } from '@/stores/useAgentsStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { useAutosave, AUTOSAVE_SAVED, AUTOSAVE_UNCHANGED, autosaveFailed, type AutosaveResult } from '@/components/sections/shared/SettingsAutosave';
import { SettingsSection, SettingsFieldRow, SETTINGS_SELECT_SIZE, SETTINGS_CUSTOM_TRIGGER_CLASS } from '@/components/sections/shared/SettingsSection';

interface CommandForm {
  name: string;
  scope: CommandScope;
  description: string;
  content: string;
  argumentHint: string;
  agentId: string;
  modelSelection: ModelSelection | null;
}

export const CommandsPage: React.FC = () => {
  const { t } = useI18n();
  const directory = useSettingsDirectory();
  const selectedName = useCommandsStore(state => state.selectedCommandName);
  const commands = useCommandsStore(state => selectCommandsForDirectory(state, directory));
  const agents = useAgentsStore(state => selectAgentsForDirectory(state, directory));
  const loadAgents = useAgentsStore(state => state.loadAgents);
  React.useEffect(() => { if (directory) void loadAgents(directory); }, [directory, loadAgents]);
  const draft = useCommandsStore(state => state.commandDraft);
  const entity = commands.find(command => command.name === selectedName);
  const isNew = Boolean(draft && draft.name === selectedName && !entity);
  const readOnly = Boolean(entity && !entity.editable);
  const [form, setForm] = React.useState<CommandForm>({ name: '', scope: 'agent', description: '', content: '', argumentHint: '', agentId: '', modelSelection: null });
  const [creating, setCreating] = React.useState(false);
  const identity = JSON.stringify([directory, selectedName]);
  const identityRef = React.useRef(identity);
  identityRef.current = identity;
  const saved = React.useRef<CommandForm | null>(null);
  const loadedIdentity = React.useRef<string | null>(null);
  const echo = React.useRef<{ identity: string; form: CommandForm } | null>(null);
  React.useEffect(() => {
    const source = isNew ? draft : entity;
    if (!source) return;
    const next: CommandForm = {
      name: source.name, scope: source.scope === 'workspace' ? 'workspace' : 'agent',
      description: source.description ?? '', content: source.content ?? '', argumentHint: source.argumentHint ?? '',
      agentId: source.agentId ?? '', modelSelection: source.modelSelection ?? null,
    };
    const sameIdentity = loadedIdentity.current === identity;
    loadedIdentity.current = identity;
    if (sameIdentity && [saved.current, echo.current?.identity === identity ? echo.current.form : null]
      .some(value => value && JSON.stringify(value) === JSON.stringify(next))) return;
    setForm(next);
    saved.current = next;
  }, [draft, entity, identity, isNew]);
  const config: CommandConfig = {
    name: form.name, scope: form.scope, description: form.description, content: form.content,
    argumentHint: form.argumentHint || undefined, agentId: form.agentId || undefined, modelSelection: form.modelSelection ?? undefined,
    group: isNew ? draft?.group : entity?.group,
  };
  const save = React.useCallback(async (): Promise<AutosaveResult> => {
    if (isNew || readOnly || !entity || !saved.current || JSON.stringify(saved.current) === JSON.stringify(form)) return AUTOSAVE_UNCHANGED;
    if (!form.content.trim()) return autosaveFailed(t('settings.commands.page.toast.templateRequired'));
    const pending = { identity, form };
    echo.current = pending;
    try {
      const success = await useCommandsStore.getState().updateCommand(entity.name, {
        name: form.name, description: form.description, content: form.content, argumentHint: form.argumentHint,
        agentId: form.agentId || undefined, modelSelection: form.modelSelection ?? undefined,
      }, directory);
      if (!success) return autosaveFailed(t('settings.commands.page.toast.updateFailed'));
      if (identityRef.current === identity) saved.current = form;
      return AUTOSAVE_SAVED;
    } finally { if (echo.current === pending) echo.current = null; }
  }, [directory, entity, form, identity, isNew, readOnly, t]);
  const autosave = useAutosave(save);
  const create = async () => {
    if (!form.name.trim()) { toast.error(t('settings.commands.sidebar.toast.commandNameRequired')); return; }
    if (!form.content.trim()) { toast.error(t('settings.commands.page.toast.templateRequired')); return; }
    setCreating(true);
    try {
      const success = await useCommandsStore.getState().createCommand(config, directory);
      if (!success) { toast.error(t('settings.commands.page.toast.createFailed')); return; }
      useCommandsStore.getState().setCommandDraft(null);
      useCommandsStore.getState().setSelectedCommand(form.name);
      toast.success(t('settings.commands.page.toast.created'));
    } finally { setCreating(false); }
  };
  if (!selectedName) return <div className="p-6 text-muted-foreground">{t('settings.commands.page.empty.title')}</div>;
  return <SettingsPageLayout title={isNew ? t('settings.commands.page.title.new') : `/${selectedName}`}
    description={entity?.source} onBlurCapture={autosave.onBlurCapture}>
    <fieldset disabled={readOnly} className="min-w-0">
      <SettingsSection title={t('settings.commands.page.section.identity')} divider={false}>
        {isNew && <SettingsFieldRow label={t('settings.commands.page.field.commandName')}>
          <Input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="h-7 w-40" />
          <Select value={form.scope} onValueChange={scope => { if (scope === 'agent' || scope === 'workspace') setForm({ ...form, scope }); }}>
            <SelectTrigger size={SETTINGS_SELECT_SIZE}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="agent">{t('settings.common.scope.global')}</SelectItem><SelectItem value="workspace">{t('settings.common.scope.project')}</SelectItem></SelectContent>
          </Select>
        </SettingsFieldRow>}
        <SettingsFieldRow label={t('settings.common.field.description')}>
          <Textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} rows={2} />
        </SettingsFieldRow>
        <SettingsFieldRow label="$ARGUMENTS">
          <Input value={form.argumentHint} onChange={event => setForm({ ...form, argumentHint: event.target.value })} />
        </SettingsFieldRow>
      </SettingsSection>
      <SettingsSection title={t('settings.commands.page.section.executionContext')}>
        <SettingsFieldRow label={t('settings.commands.page.field.overrideAgent')}>
          <Select value={form.agentId || '__none__'} onValueChange={value => { setForm({ ...form, agentId: value === '__none__' ? '' : value }); autosave.requestSave(); }}>
            <SelectTrigger className={SETTINGS_CUSTOM_TRIGGER_CLASS}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t('settings.commands.agentSelector.notSelected')}</SelectItem>
              {form.agentId && !agents.some(agent => agent.agentId === form.agentId) && <SelectItem value={form.agentId}>{form.agentId}</SelectItem>}
              {agents.map(agent => <SelectItem key={agent.agentId} value={agent.agentId}>{agent.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </SettingsFieldRow>
        <SettingsFieldRow label={t('settings.agents.page.field.overrideModel')}>
          <ModelSelector providerId={form.modelSelection?.providerId ?? ''} modelId={form.modelSelection?.modelId ?? ''}
            directory={directory ?? undefined} onChange={(providerId, modelId) => {
              setForm({ ...form, modelSelection: providerId && modelId ? { ...form.modelSelection, providerId, modelId } : null }); autosave.requestSave();
            }} className={SETTINGS_CUSTOM_TRIGGER_CLASS} />
        </SettingsFieldRow>
      </SettingsSection>
      <SettingsSection title={t('settings.commands.page.section.template')}>
        <Textarea value={form.content} onChange={event => setForm({ ...form, content: event.target.value })} rows={12}
          className="w-full font-mono typography-meta min-h-[160px] bg-transparent" />
        <p className="mt-2 typography-meta text-muted-foreground"><code>$ARGUMENTS</code> {t('settings.commands.page.templateHint.userInput')}</p>
        {isNew && <div className="flex gap-2 pt-3">
          <Button size="xs" disabled={creating} onClick={() => void create()}>{t('settings.common.actions.create')}</Button>
          <Button size="xs" variant="ghost" onClick={() => { useCommandsStore.getState().setCommandDraft(null); useCommandsStore.getState().setSelectedCommand(null); }}>{t('settings.common.actions.cancel')}</Button>
        </div>}
      </SettingsSection>
    </fieldset>
  </SettingsPageLayout>;
};
