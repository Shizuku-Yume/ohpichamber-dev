import React from 'react';
import { z } from 'zod';
import type { BehaviorFileCatalog, OmpSettingValue } from '@openchamber/agent-contract';
import { canonicalClient, CanonicalApiError } from '@/api/canonicalClient';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { loadDesktopSettings, reportSettingsSaveState, updateDesktopSettings } from '@/lib/persistence';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useDeviceInfo } from '@/lib/device';
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
  SettingsFieldRow,
  SettingsStackedField,
  SETTINGS_SPACE_ROW_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { useOmpPageSettings } from '@/components/sections/shared/useOmpPageSettings';
import { OmpRowControl } from '@/components/sections/shared/OmpRowControl';
import { toast } from '@/components/ui';
import { Icon } from '@/components/icon/Icon';
import { cn } from '@/lib/utils';
import { BehaviorCreateDialog } from './BehaviorCreateDialog';
import { BehaviorSidebar } from './BehaviorSidebar';
import { NativeBehaviorFiles } from './NativeBehaviorFiles';
import {
  type BehaviorDraftTarget,
  type BehaviorSelection,
} from './behaviorTypes';

const agentsMdResponseSchema = z.object({
  content: z.string(),
  exists: z.boolean(),
  path: z.string().min(1).optional(),
});

const apiErrorSchema = z.object({ error: z.string().optional() });

const readApiError = async (response: Response, fallback: string) => {
  const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
  const message = parsed.success ? parsed.data.error : undefined;
  return message && message.trim() ? message : fallback;
};

const normalizeAgentsMdContent = (content: string) => (
  content.length > 0 && !content.endsWith('\n') ? `${content}\n` : content
);

/** The file both scopes edit; a path literal, so it stays untranslated. */
const AGENTS_MD_FILE_NAME = 'AGENTS.md';

type RulesScope = 'global' | 'project';

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
 * Behavior settings: unified entity browser for Global and Project AGENTS.md,
 * RULES.md, SYSTEM.md, `.omp/rules/*`, `.omp/instructions/*`, plus Prompt &
 * Personality settings.
 */
export const BehaviorPage: React.FC = () => {
  const { t } = useI18n();
  const settingsDirectory = useSettingsDirectory();
  const { isMobile } = useDeviceInfo();
  const {
    form: ompForm,
    updateSettings: updateOmpSettings,
    getSectionSettings,
    loading: ompLoading,
  } = useOmpPageSettings('behavior');
  const promptSettings = getSectionSettings('prompt');

  const [selection, setSelection] = React.useState<BehaviorSelection>({
    type: 'agents-md',
    scope: 'global',
  });
  const [mobileShowDetail, setMobileShowDetail] = React.useState(false);

  const [globalRules, setGlobalRules] = React.useState('');
  const [projectRules, setProjectRules] = React.useState('');
  const [responseStyleEnabled, setResponseStyleEnabled] = React.useState(false);
  const [responseStylePreset, setResponseStylePreset] = React.useState<ResponseStylePreset>('default');
  const [responseStyleCustomInstructions, setResponseStyleCustomInstructions] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [agentsMdLoadError, setAgentsMdLoadError] = React.useState<{ global: boolean; project: boolean }>({
    global: false,
    project: false,
  });

  const [nativeCatalog, setNativeCatalog] = React.useState<BehaviorFileCatalog | undefined>(undefined);
  const [nativeUnavailable, setNativeUnavailable] = React.useState(false);
  const [nativeLoadError, setNativeLoadError] = React.useState<string | null>(null);
  const [nativeReloadCount, setNativeReloadCount] = React.useState(0);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [stagedDraft, setStagedDraft] = React.useState<BehaviorDraftTarget | null>(null);

  const savedRef = React.useRef<{
    globalRules: string;
    projectRules: string;
    responseStyleEnabled: boolean;
    responseStylePreset: ResponseStylePreset;
    responseStyleCustomInstructions: string;
  } | null>(null);
  const agentsMdOnDiskRef = React.useRef<{ global: string | null; project: string | null }>({
    global: null,
    project: null,
  });
  const catalogAbortRef = React.useRef<AbortController | null>(null);

  const readRules = React.useCallback(async (scope: RulesScope, signal?: AbortSignal) => {
    const query = buildRulesQuery(scope, settingsDirectory);
    const response = await runtimeFetch(`/api/behavior/agents-md?${query}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!response.ok) {
      throw new Error(await readApiError(response, t('settings.behavior.files.loadFailed')));
    }
    return agentsMdResponseSchema.parse(await response.json());
  }, [settingsDirectory, t]);

  React.useEffect(() => {
    const abort = new AbortController();

    const load = async () => {
      try {
        const [settings, globalResult, projectResult] = await Promise.all([
          loadDesktopSettings(),
          readRules('global', abort.signal).then(
            (data) => ({ ok: true as const, data }),
            (error: unknown) => ({ ok: false as const, error }),
          ),
          settingsDirectory
            ? readRules('project', abort.signal).then(
              (data) => ({ ok: true as const, data }),
              (error: unknown) => ({ ok: false as const, error }),
            )
            : Promise.resolve({ ok: true as const, data: null }),
        ]);
        if (abort.signal.aborted) return;

        const globalFile = globalResult.ok ? globalResult.data : null;
        const projectFile = projectResult.ok ? projectResult.data : null;

        setAgentsMdLoadError({
          global: !globalResult.ok,
          project: Boolean(settingsDirectory) && !projectResult.ok,
        });

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
        if ((error as Error).name !== 'AbortError') {
          console.warn('Failed to load behavior settings:', error);
        }
      } finally {
        if (!abort.signal.aborted) setIsLoading(false);
      }
    };

    void load();
    return () => abort.abort();
  }, [readRules, settingsDirectory]);

  React.useEffect(() => {
    if (!settingsDirectory) {
      setNativeCatalog(undefined);
      setNativeUnavailable(false);
      setNativeLoadError(null);
      return;
    }
    let active = true;
    setNativeLoadError(null);
    setNativeUnavailable(false);
    void canonicalClient
      .resolveWorkspace(settingsDirectory)
      .then((workspace) => canonicalClient.fileResources.getBehaviorFiles(workspace.workspaceId))
      .then(
        (result) => {
          if (!active) return;
          setNativeCatalog(result);
          setNativeUnavailable(false);
          setNativeLoadError(null);
        },
        (failure: unknown) => {
          if (!active) return;
          if (failure instanceof CanonicalApiError && failure.problem.status === 404) {
            setNativeUnavailable(true);
            setNativeCatalog(undefined);
            setNativeLoadError(null);
          } else {
            setNativeLoadError(failure instanceof Error ? failure.message : t('settings.behavior.files.loadFailed'));
          }
        },
      );
    return () => {
      active = false;
    };
  }, [settingsDirectory, nativeReloadCount, t]);

  React.useEffect(() => {
    setStagedDraft(null);
  }, [settingsDirectory]);

  React.useEffect(() => {
    if (settingsDirectory) return;
    setSelection((current) => {
      if (current.type === 'agents-md' && current.scope === 'project') return { type: 'agents-md', scope: 'global' };
      if (current.type !== 'agents-md' && current.type !== 'prompt') return { type: 'agents-md', scope: 'global' };
      return current;
    });
  }, [settingsDirectory]);
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
          settingsDirectory ? readRules('project', controller.signal).catch(() => null) : Promise.resolve(null),
        ]);
        const saved = savedRef.current;
        if (controller.signal.aborted || !saved) return;
        for (const [scope, file, ref, set] of [
          ['global', globalFile, globalRulesRef, setGlobalRules],
          ['project', projectFile, projectRulesRef, setProjectRules],
        ] as const) {
          if (file === null) continue;
          setAgentsMdLoadError((previous) => (previous[scope] ? { ...previous, [scope]: false } : previous));
          const onDisk = agentsMdOnDiskRef.current[scope];
          const content = file.exists === true ? file.content : '';
          if (content === onDisk) continue;
          const unchanged = normalizeAgentsMdContent(ref.current) === onDisk;
          agentsMdOnDiskRef.current[scope] = content;
          savedRef.current = {
            ...savedRef.current,
            [scope === 'global' ? 'globalRules' : 'projectRules']: content,
          };
          if (unchanged) set(content);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.warn('Failed to refresh AGENTS.md:', error);
        }
      }
    };
    const reloadNativeCatalog = () => {
      if (!settingsDirectory || document.visibilityState !== 'visible') return;
      const controller = new AbortController();
      catalogAbortRef.current?.abort();
      catalogAbortRef.current = controller;
      const directory = settingsDirectory;
      void canonicalClient
        .resolveWorkspace(directory)
        .then((workspace) => canonicalClient.fileResources.getBehaviorFiles(workspace.workspaceId))
        .then(
          (result) => {
            if (controller.signal.aborted || catalogAbortRef.current !== controller) return;
            setNativeCatalog(result);
            setNativeUnavailable(false);
            setNativeLoadError(null);
          },
          () => undefined,
        );
    };
    const onRefresh = () => {
      void refresh();
      reloadNativeCatalog();
    };
    window.addEventListener('focus', onRefresh);
    document.addEventListener('visibilitychange', onRefresh);
    return () => {
      abort?.abort();
      catalogAbortRef.current?.abort();
      window.removeEventListener('focus', onRefresh);
      document.removeEventListener('visibilitychange', onRefresh);
    };
  }, [readRules, settingsDirectory]);

  const saveRules = React.useCallback(
    async (
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
      setAgentsMdLoadError((previous) => (previous[scope] ? { ...previous, [scope]: false } : previous));
      return AUTOSAVE_SAVED;
    },
    [settingsDirectory, t],
  );

  const save = React.useCallback(async (): Promise<AutosaveResult> => {
    const saved = savedRef.current;
    if (!saved || isLoading) return AUTOSAVE_UNCHANGED;

    const globalResult = await saveRules('global', globalRules, agentsMdOnDiskRef.current.global, saved.globalRules);
    if (globalResult && !globalResult.ok) return globalResult;
    const wroteGlobal = globalResult !== null;

    const projectResult = await saveRules('project', projectRules, agentsMdOnDiskRef.current.project, saved.projectRules);
    if (projectResult && !projectResult.ok) return projectResult;

    const instruction = responseStyleEnabled
      ? resolveResponseStyleInstruction({
        preset: responseStylePreset,
        customInstructions: responseStyleCustomInstructions,
      })
      : '';
    const settingsChanged =
      responseStyleEnabled !== saved.responseStyleEnabled ||
      responseStylePreset !== saved.responseStylePreset ||
      responseStyleCustomInstructions !== saved.responseStyleCustomInstructions;

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
    setGlobalRules((current) => (current === globalRules ? normalizeAgentsMdContent(globalRules) : current));
    setProjectRules((current) => (current === projectRules ? normalizeAgentsMdContent(projectRules) : current));

    return wroteGlobal || settingsChanged || projectResult !== null ? AUTOSAVE_SAVED : AUTOSAVE_UNCHANGED;
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

  const handleSelect = (next: BehaviorSelection) => {
    setSelection(next);
    if (isMobile) setMobileShowDetail(true);
  };


  const mobileBackButton = isMobile ? (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="-ms-2 h-7 w-7 shrink-0"
      onClick={() => setMobileShowDetail(false)}
      aria-label={t('settings.behavior.files.sidebar.back')}
    >
      <Icon name="arrow-left-s" className="size-4" />
    </Button>
  ) : undefined;

  const handleOmpChange = async (settingId: string, value: OmpSettingValue) => {
    reportSettingsSaveState('saving');
    const ok = await updateOmpSettings(() => [{ id: settingId, value }]);
    if (!ok) {
      reportSettingsSaveState('error');
      toast.error(t('settings.common.status.saveFailed'));
      return;
    }
    reportSettingsSaveState('saved');
  };

  const renderDetail = () => {
    if (selection.type === 'prompt') {
      return (
        <SettingsPageLayout
          title={t('settings.behavior.section.prompt.title')}
          description={t('settings.behavior.section.prompt.description')}
          titleLeading={mobileBackButton}
          showSaveStatus
          onBlurCapture={autosave.onBlurCapture}
        >
          <SettingsSection
            title={t('settings.behavior.page.section.responseStyle')}
            info={t('settings.behavior.page.responseStyle.tooltip')}
            divider={false}
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

            <SettingsFieldRow label={t('settings.behavior.page.responseStyle.preset')}>
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

          <SettingsSection
            title={t('settings.behavior.section.prompt.title')}
            description={t('settings.behavior.section.prompt.description')}
            settingsItem="behavior.prompt-personality"
          >
            <div className={SETTINGS_SPACE_ROW_CLASS}>
              {promptSettings.map((s) => (
                <OmpRowControl
                  key={s.id}
                  setting={s}
                  value={ompForm[s.id] !== undefined ? ompForm[s.id] : s.value}
                  disabled={ompLoading}
                  onChange={(val) => void handleOmpChange(s.id, val)}
                />
              ))}
            </div>
          </SettingsSection>
        </SettingsPageLayout>
      );
    }

    if (selection.type === 'agents-md') {
      const scope = selection.scope;
      const rulesValue = scope === 'global' ? globalRules : projectRules;
      const setRulesValue = scope === 'global' ? setGlobalRules : setProjectRules;
      const rulesDisabled = isLoading || (scope === 'project' && !settingsDirectory);
      const loadFailed = scope === 'global' ? agentsMdLoadError.global : agentsMdLoadError.project;
      const title =
        scope === 'global'
          ? t('settings.behavior.page.section.systemPrompt')
          : t('settings.behavior.files.agentsMd.projectSection');
      const scopeDescription =
        scope === 'global'
          ? t('settings.behavior.files.agentsMd.scopeGlobal')
          : t('settings.behavior.files.agentsMd.scopeProject');

      return (
        <SettingsPageLayout
          title={title}
          description={scopeDescription}
          titleLeading={mobileBackButton}
          showSaveStatus
          fillHeight
          onBlurCapture={autosave.onBlurCapture}
        >
          {loadFailed ? (
            <p role="alert" className="mb-4 typography-meta text-[var(--status-error)]">
              {t('settings.behavior.files.loadFailed')}
            </p>
          ) : null}

          <SettingsSection
            title={t('settings.behavior.page.warning.title')}
            info={t('settings.behavior.page.warning.description', { path: AGENTS_MD_FILE_NAME })}
            divider={false}
            settingsItem={scope === 'global' ? 'behavior.system-prompt' : undefined}
            className="flex min-h-0 flex-1 flex-col"
            contentClassName="flex min-h-0 flex-1 flex-col"
          >
            <Textarea
              aria-label={AGENTS_MD_FILE_NAME}
              value={rulesValue}
              onChange={(event) => setRulesValue(event.target.value)}
              placeholder={t('settings.behavior.page.field.systemPromptPlaceholder')}
              disabled={rulesDisabled}
              outerClassName="min-h-[360px] flex-1"
              className="w-full font-mono typography-meta bg-transparent"
            />
          </SettingsSection>
        </SettingsPageLayout>
      );
    }

    if (settingsDirectory) {
      return (
        <NativeBehaviorFiles
          directory={settingsDirectory}
          selection={selection}
          catalog={nativeCatalog}
          error={nativeLoadError}
          unavailable={nativeUnavailable}
          onCatalogChange={setNativeCatalog}
          onSelect={handleSelect}
          onClearDraft={() => setStagedDraft(null)}
          titleLeading={mobileBackButton}
        />
      );
    }

    return null;
  };

  return (
    <div className={cn('flex h-full min-h-0 flex-1 overflow-hidden @container')}>
      {(!isMobile || !mobileShowDetail) ? (
        <div
          className={cn(
            'h-full min-h-0 shrink-0 border-r bg-background',
            isMobile ? 'w-full border-r-0' : 'w-[280px]',
          )}
          style={{ borderColor: 'var(--interactive-border)' }}
        >
          <BehaviorSidebar
            selection={selection}
            onSelect={handleSelect}
            hasProjectDirectory={Boolean(settingsDirectory)}
            catalog={nativeCatalog}
            nativeUnavailable={nativeUnavailable}
            nativeLoadError={nativeLoadError}
            onRetryNative={() => setNativeReloadCount((count) => count + 1)}
            stagedDraft={stagedDraft}
            onOpenCreate={() => setCreateOpen(true)}
          />
        </div>
      ) : null}

      {(!isMobile || mobileShowDetail) ? (
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
          {renderDetail()}
        </div>
      ) : null}

      <BehaviorCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        availableScopes={nativeCatalog?.scopes ?? ['agent']}
        existingFiles={nativeCatalog?.files ?? []}
        onCreateDraft={(target) => {
          setStagedDraft(target);
          handleSelect({
            type: 'new-draft',
            scope: target.scope,
            kind: target.kind,
            name: target.name,
          });
        }}
      />
    </div>
  );
};
