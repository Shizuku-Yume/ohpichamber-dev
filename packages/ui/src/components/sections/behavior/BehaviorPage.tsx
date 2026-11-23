import React from 'react';
import { z } from 'zod';
import { Textarea } from '@/components/ui/textarea';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { loadDesktopSettings, updateDesktopSettings } from '@/lib/persistence';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DEFAULT_RESPONSE_STYLE_PRESET,
  isResponseStylePreset,
  RESPONSE_STYLE_PRESETS,
  resolveResponseStyleInstruction,
  type ResponseStylePreset,
} from '@/lib/responseStyle';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  useAutosave,
  AUTOSAVE_SAVED,
  AUTOSAVE_UNCHANGED,
  autosaveFailed,
  type AutosaveResult,
} from '@/components/sections/shared/SettingsAutosave';
import {
  SettingsSection,
  SettingsCheckboxRow,
  SettingsChipGroup,
  SettingsFieldRow,
  SettingsStackedField,
  SETTINGS_SPACE_ROW_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { useOmpPageSettings } from '@/components/sections/shared/useOmpPageSettings';
import { OmpRowControl } from '@/components/sections/shared/OmpRowControl';
import { NativeBehaviorFiles } from './NativeBehaviorFiles';

const agentsMdResponseSchema = z.object({
  content: z.string(),
  exists: z.boolean(),
  path: z.string().min(1).optional(),
});

const readApiError = async (response: Response, fallback: string) => {
  const data = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof data?.error === 'string' && data.error.trim() ? data.error : fallback;
};

const normalizeAgentsMdContent = (content: string) => (
  content.length > 0 && !content.endsWith('\n') ? `${content}\n` : content
);

/** The file both scopes edit; a path literal, so it stays untranslated. */
const AGENTS_MD_FILE_NAME = 'AGENTS.md';

type RulesScope = 'global' | 'project';

// `default` reuses the shared localized "Default" label; every other preset has
// its own name under the Behavior page's existing keys.
const RESPONSE_STYLE_OPTION_LABEL_KEYS: Record<ResponseStylePreset, I18nKey> = {
  default: 'settings.openchamber.defaults.option.default',
  concise: 'settings.behavior.page.responseStyle.option.concise',
  detailed: 'settings.behavior.page.responseStyle.option.detailed',
  mentor: 'settings.behavior.page.responseStyle.option.mentor',
  pushback: 'settings.behavior.page.responseStyle.option.pushback',
  noFiller: 'settings.behavior.page.responseStyle.option.noFiller',
  matchEnergy: 'settings.behavior.page.responseStyle.option.matchEnergy',
  warmPeer: 'settings.behavior.page.responseStyle.option.warmPeer',
  custom: 'settings.behavior.page.responseStyle.option.custom',
};


const buildRulesQuery = (scope: RulesScope, directory: string | null) => {
  const params = new URLSearchParams({ scope });
  if (scope === 'project' && directory) params.set('directory', directory);
  return params.toString();
};

/**
 * Behavior settings: the AGENTS.md rules the agent reads (global and the
 * selected project's), and an opt-in response style.
 *
 * The AGENTS.md editors write the files OMP loads natively as context files;
 * nothing here injects that text into a prompt a second time.
 *
 * The response style is off unless the user turns it on and picks a preset:
 * `default`, an unset preference and an empty custom preset all persist an
 * empty instruction, which prompt delivery does not send at all.
 */
export const BehaviorPage: React.FC = () => {
  const { t } = useI18n();
  const settingsDirectory = useSettingsDirectory();
  const { form: ompForm, updateSetting: updateOmpSetting, getSectionSettings, loading: ompLoading } = useOmpPageSettings('behavior');
  const promptSettings = getSectionSettings('prompt');

  const [rulesScope, setRulesScope] = React.useState<RulesScope>('global');
  const [globalRules, setGlobalRules] = React.useState('');
  const [projectRules, setProjectRules] = React.useState('');
  const [responseStyleEnabled, setResponseStyleEnabled] = React.useState(false);
  const [responseStylePreset, setResponseStylePreset] = React.useState<ResponseStylePreset>('default');
  const [responseStyleCustomInstructions, setResponseStyleCustomInstructions] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);

  // What is currently on disk. Every field is compared against this, so a save
  // writes only what actually changed and a refreshed value is never clobbered.
  const savedRef = React.useRef<{
    globalRules: string;
    projectRules: string;
    responseStyleEnabled: boolean;
    responseStylePreset: ResponseStylePreset;
    responseStyleCustomInstructions: string;
  } | null>(null);
  // AGENTS.md exactly as last read or written per scope (null: no file). A save
  // sends it so the server refuses to overwrite a file edited elsewhere.
  const agentsMdOnDiskRef = React.useRef<{ global: string | null; project: string | null }>({ global: null, project: null });

  const readRules = React.useCallback(async (scope: RulesScope, signal?: AbortSignal) => {
    const query = buildRulesQuery(scope, settingsDirectory);
    const response = await runtimeFetch(`/api/behavior/agents-md?${query}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!response.ok) return null;
    return agentsMdResponseSchema.parse(await response.json());
  }, [settingsDirectory]);

  React.useEffect(() => {
    const abort = new AbortController();

    const load = async () => {
      try {
        const [settings, globalFile, projectFile] = await Promise.all([
          loadDesktopSettings(),
          readRules('global', abort.signal).catch(() => null),
          readRules('project', abort.signal).catch(() => null),
        ]);
        if (abort.signal.aborted) return;

        const next = {
          globalRules: globalFile?.content ?? '',
          projectRules: projectFile?.content ?? '',
          responseStyleEnabled: settings?.responseStyleEnabled === true,
          responseStylePreset: isResponseStylePreset(settings?.responseStylePreset)
            ? settings.responseStylePreset
            : DEFAULT_RESPONSE_STYLE_PRESET,
          responseStyleCustomInstructions: settings?.responseStyleCustomInstructions ?? '',
        };
        agentsMdOnDiskRef.current = {
          global: globalFile?.exists ? globalFile.content : null,
          project: projectFile?.exists ? projectFile.content : null,
        };
        setGlobalRules(next.globalRules);
        setProjectRules(next.projectRules);
        setResponseStyleEnabled(next.responseStyleEnabled);
        setResponseStylePreset(next.responseStylePreset);
        setResponseStyleCustomInstructions(next.responseStyleCustomInstructions);
        savedRef.current = next;
      } catch (error) {
        if ((error as Error).name !== 'AbortError') console.warn('Failed to load behavior settings:', error);
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    };

    void load();
    return () => abort.abort();
  }, [readRules]);

  // AGENTS.md is often edited in another editor while this page stays open, so
  // coming back to the window re-reads both scopes. A draft with an edit of its
  // own is kept; the pending save then names the stale text and is refused.
  const globalRulesRef = React.useRef(globalRules);
  globalRulesRef.current = globalRules;
  const projectRulesRef = React.useRef(projectRules);
  projectRulesRef.current = projectRules;
  React.useEffect(() => {
    let abort: AbortController | null = null;
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || !savedRef.current) return;
      abort?.abort();
      const controller = new AbortController();
      abort = controller;
      try {
        const [globalFile, projectFile] = await Promise.all([
          readRules('global', controller.signal).catch(() => null),
          readRules('project', controller.signal).catch(() => null),
        ]);
        const saved = savedRef.current;
        if (controller.signal.aborted || !saved) return;
        for (const [scope, file, ref, set] of [
          ['global', globalFile, globalRulesRef, setGlobalRules],
          ['project', projectFile, projectRulesRef, setProjectRules],
        ] as const) {
          const onDisk = agentsMdOnDiskRef.current[scope];
          const content = file?.exists === true ? file.content : '';
          if (file === null || content === onDisk) continue;
          // A draft still holding exactly what was on disk has no edit of its
          // own to keep; anything else is a pending edit the save coexists with.
          const unchanged = normalizeAgentsMdContent(ref.current) === onDisk;
          agentsMdOnDiskRef.current[scope] = content;
          savedRef.current = { ...savedRef.current, [scope === 'global' ? 'globalRules' : 'projectRules']: content };
          if (unchanged) set(content);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) console.warn('Failed to refresh AGENTS.md:', error);
      }
    };
    const onRefresh = () => { void refresh(); };
    window.addEventListener('focus', onRefresh);
    document.addEventListener('visibilitychange', onRefresh);
    return () => {
      abort?.abort();
      window.removeEventListener('focus', onRefresh);
      document.removeEventListener('visibilitychange', onRefresh);
    };
  }, [readRules]);

  // `null` means the draft matches the last saved text, so nothing is written.
  const saveRules = React.useCallback(async (
    scope: RulesScope,
    draft: string,
    onDisk: string | null,
    baseline: string,
  ): Promise<AutosaveResult | null> => {
    if (draft === baseline) return null;
    const content = normalizeAgentsMdContent(draft);
    const response = await runtimeFetch(`/api/behavior/agents-md?${buildRulesQuery(scope, settingsDirectory)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ content, expectedContent: onDisk, scope, directory: settingsDirectory }),
    });
    if (response.status === 409) return autosaveFailed(t('settings.behavior.page.toast.agentsMdChangedOnDisk'));
    if (!response.ok) return autosaveFailed(await readApiError(response, t('settings.behavior.page.toast.saveFailed')));
    agentsMdOnDiskRef.current[scope] = content;
    return AUTOSAVE_SAVED;
  }, [settingsDirectory, t]);

  const save = React.useCallback(async (): Promise<AutosaveResult> => {
    const saved = savedRef.current;
    if (!saved || isLoading) return AUTOSAVE_UNCHANGED;

    const globalResult = await saveRules('global', globalRules, agentsMdOnDiskRef.current.global, saved.globalRules);
    if (globalResult && !globalResult.ok) return globalResult;
    const wroteGlobal = globalResult !== null;

    const projectResult = await saveRules('project', projectRules, agentsMdOnDiskRef.current.project, saved.projectRules);
    if (projectResult && !projectResult.ok) return projectResult;

    // `default` is an explicit choice with the same zero-injection result as an
    // unset preference; switching the feature off also resolves to no text.
    const instruction = responseStyleEnabled
      ? resolveResponseStyleInstruction({ preset: responseStylePreset, customInstructions: responseStyleCustomInstructions })
      : '';
    const settingsChanged = responseStyleEnabled !== saved.responseStyleEnabled
      || responseStylePreset !== saved.responseStylePreset
      || responseStyleCustomInstructions !== saved.responseStyleCustomInstructions;

    if (settingsChanged) {
      const result = await updateDesktopSettings({
        responseStyleEnabled,
        responseStylePreset,
        responseStyleInstruction: instruction,
        responseStyleCustomInstructions,
      });
      if (!result.ok) return autosaveFailed(t('settings.behavior.page.toast.saveFailed'));
    }

    const nextSaved = {
      ...saved,
      globalRules: normalizeAgentsMdContent(globalRules),
      projectRules: normalizeAgentsMdContent(projectRules),
      responseStyleEnabled,
      responseStylePreset,
      responseStyleCustomInstructions,
    };
    savedRef.current = nextSaved;
    // Normalize only the submitted drafts. A newer edit must survive this
    // response so the autosave follow-up can still write it.
    setGlobalRules((current) => current === globalRules ? normalizeAgentsMdContent(globalRules) : current);
    setProjectRules((current) => current === projectRules ? normalizeAgentsMdContent(projectRules) : current);

    return wroteGlobal || settingsChanged || projectResult !== null
      ? AUTOSAVE_SAVED
      : AUTOSAVE_UNCHANGED;
  }, [
    globalRules,
    isLoading,
    projectRules,
    responseStyleCustomInstructions,
    responseStyleEnabled,
    responseStylePreset,
    saveRules,
    t,
  ]);

  const autosave = useAutosave(save);
  const { requestSave } = autosave;

  const rulesValue = rulesScope === 'global' ? globalRules : projectRules;
  const setRulesValue = rulesScope === 'global' ? setGlobalRules : setProjectRules;
  const rulesDisabled = isLoading || (rulesScope === 'project' && !settingsDirectory);

  return (
    <SettingsPageLayout
      title={t('settings.behavior.page.title')}
      description={t('settings.page.behavior.description')}
      onBlurCapture={autosave.onBlurCapture}
    >
      {settingsDirectory && <NativeBehaviorFiles key={settingsDirectory} directory={settingsDirectory} />}
      <SettingsSection
        title={t('settings.behavior.page.section.systemPrompt')}
        info={(
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              {t('settings.behavior.page.warning.title')}
            </p>
            <p>
              {t('settings.behavior.page.warning.description', { path: AGENTS_MD_FILE_NAME })}
            </p>
          </div>
        )}
        settingsItem="behavior.system-prompt"
        contentClassName={SETTINGS_SPACE_ROW_CLASS}
      >
        <SettingsChipGroup<RulesScope>
          value={rulesScope}
          onChange={(scope) => setRulesScope(scope)}
          options={[
            { value: 'global', label: t('settings.common.scope.global') },
            { value: 'project', label: t('settings.common.scope.project'), disabled: !settingsDirectory },
          ]}
          aria-label={t('settings.behavior.page.section.systemPrompt')}
        />
        <SettingsStackedField
          label={AGENTS_MD_FILE_NAME}
          controlClassName="w-full max-w-none flex-col items-stretch"
        >
          <Textarea
            value={rulesValue}
            onChange={(event) => setRulesValue(event.target.value)}
            placeholder={t('settings.behavior.page.field.systemPromptPlaceholder')}
            rows={12}
            disabled={rulesDisabled}
            outerClassName="min-h-[160px]"
            className="w-full font-mono typography-meta bg-transparent"
          />
        </SettingsStackedField>
      </SettingsSection>

      <SettingsSection
        title={t('settings.behavior.page.section.responseStyle')}
        info={t('settings.behavior.page.responseStyle.tooltip')}
        settingsItem="behavior.response-style"
        contentClassName={SETTINGS_SPACE_ROW_CLASS}
      >
        <SettingsCheckboxRow
          checked={responseStyleEnabled}
          onChange={(next) => {
            setResponseStyleEnabled(next);
            requestSave();
          }}
          disabled={isLoading}
          label={t('settings.behavior.page.responseStyle.enable')}
          ariaLabel={t('settings.behavior.page.responseStyle.enableAria')}
        />

        <SettingsFieldRow
          label={t('settings.behavior.page.responseStyle.preset')}
        >
          <Select<ResponseStylePreset>
            value={responseStylePreset}
            onValueChange={(value) => {
              setResponseStylePreset(value);
              requestSave();
            }}
            disabled={isLoading || !responseStyleEnabled}
          >
            <SelectTrigger className={SETTINGS_WIDTH_SELECT_CLASS}>
              <SelectValue>
                {(value) => (isResponseStylePreset(value) ? t(RESPONSE_STYLE_OPTION_LABEL_KEYS[value]) : null)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {RESPONSE_STYLE_PRESETS.map((preset) => (
                <SelectItem key={preset} value={preset}>
                  {t(RESPONSE_STYLE_OPTION_LABEL_KEYS[preset])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFieldRow>

        {responseStylePreset === 'custom' ? (
          <SettingsStackedField
            label={t('settings.behavior.page.responseStyle.option.custom')}
            controlClassName="w-full max-w-none flex-col items-stretch"
          >
            <Textarea
              aria-label={t('settings.behavior.page.responseStyle.option.custom')}
              value={responseStyleCustomInstructions}
              onChange={(event) => setResponseStyleCustomInstructions(event.target.value)}
              placeholder={t('settings.behavior.page.responseStyle.customPlaceholder')}
              rows={5}
              disabled={isLoading || !responseStyleEnabled}
              outerClassName="min-h-[120px]"
              className="w-full font-mono typography-meta bg-transparent"
            />
          </SettingsStackedField>
        ) : null}
      </SettingsSection>

      {/* OMP Prompt & Personality */}
      <SettingsSection
        title={t('settings.behavior.section.prompt.title')}
        description={t('settings.behavior.section.prompt.description')}
        settingsItem="behavior.section.prompt"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>
          {promptSettings.map((s) => (
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
};
