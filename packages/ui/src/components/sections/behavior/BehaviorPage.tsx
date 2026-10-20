import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { loadDesktopSettings, updateDesktopSettings } from '@/lib/persistence';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getResponseStylePresetInstructions,
  isResponseStylePreset,
  RESPONSE_STYLE_PRESETS,
  type ResponseStylePreset,
} from '@/lib/responseStyle';
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
  SETTINGS_SELECT_ROW_TRIGGER_CLASS,
  SETTINGS_SELECT_SIZE,
} from '@/components/sections/shared/SettingsSection';

type ResponseStyleValue = ResponseStylePreset | 'custom';

type BehaviorSettingsState = {
  responseStyleEnabled: boolean;
  responseStylePreset: ResponseStyleValue;
  responseStyleCustomInstructions: string;
};

const DEFAULT_BEHAVIOR_SETTINGS: BehaviorSettingsState = {
  responseStyleEnabled: false,
  responseStylePreset: 'concise',
  responseStyleCustomInstructions: '',
};

const getResponseStylePreview = (preset: ResponseStyleValue, customInstructions: string) => {
  return preset === 'custom' ? customInstructions : getResponseStylePresetInstructions(preset);
};

const sanitizeResponseStylePreset = (value: ResponseStyleValue | undefined): ResponseStyleValue => {
  if (value === 'custom') return 'custom';
  return value && isResponseStylePreset(value) ? value : 'concise';
};

const RESPONSE_STYLE_OPTION_LABEL_KEYS = {
  concise: 'settings.behavior.page.responseStyle.option.concise',
  detailed: 'settings.behavior.page.responseStyle.option.detailed',
  mentor: 'settings.behavior.page.responseStyle.option.mentor',
  pushback: 'settings.behavior.page.responseStyle.option.pushback',
  noFiller: 'settings.behavior.page.responseStyle.option.noFiller',
  matchEnergy: 'settings.behavior.page.responseStyle.option.matchEnergy',
  warmPeer: 'settings.behavior.page.responseStyle.option.warmPeer',
} satisfies Record<ResponseStylePreset, I18nKey>;

export const BehaviorPage: React.FC = () => {
  const { t } = useI18n();
  const [responseStyleEnabled, setResponseStyleEnabled] = React.useState(DEFAULT_BEHAVIOR_SETTINGS.responseStyleEnabled);
  const [responseStylePreset, setResponseStylePreset] = React.useState<ResponseStyleValue>(DEFAULT_BEHAVIOR_SETTINGS.responseStylePreset);
  const [responseStyleCustomInstructions, setResponseStyleCustomInstructions] = React.useState(DEFAULT_BEHAVIOR_SETTINGS.responseStyleCustomInstructions);
  const [isLoading, setIsLoading] = React.useState(true);
  // What is currently persisted. Every field is compared against this, so a
  // save writes only what actually changed.
  const savedRef = React.useRef<BehaviorSettingsState | null>(null);

  React.useEffect(() => {
    const abort = new AbortController();

    const load = async () => {
      try {
        const data = await loadDesktopSettings();
        if (abort.signal.aborted) return;

        const nextSettings: BehaviorSettingsState = {
          ...DEFAULT_BEHAVIOR_SETTINGS,
          responseStyleEnabled: data?.responseStyleEnabled === true,
          responseStylePreset: sanitizeResponseStylePreset(data?.responseStylePreset),
          responseStyleCustomInstructions: data?.responseStyleCustomInstructions ?? '',
        };

        setResponseStyleEnabled(nextSettings.responseStyleEnabled);
        setResponseStylePreset(nextSettings.responseStylePreset);
        setResponseStyleCustomInstructions(nextSettings.responseStyleCustomInstructions);
        savedRef.current = nextSettings;
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'AbortError') {
          console.warn('Failed to load behavior settings:', error);
        }
      } finally {
        setIsLoading(false);
      }
    };

    void load();
    return () => abort.abort();
  }, []);

  const save = React.useCallback(async (): Promise<AutosaveResult> => {
    const saved = savedRef.current;
    if (!saved || isLoading) return AUTOSAVE_UNCHANGED;

    const settingsChanged =
      responseStyleEnabled !== saved.responseStyleEnabled ||
      responseStylePreset !== saved.responseStylePreset ||
      responseStyleCustomInstructions !== saved.responseStyleCustomInstructions;

    if (!settingsChanged) return AUTOSAVE_UNCHANGED;

    const result = await updateDesktopSettings({
      responseStyleEnabled,
      responseStylePreset,
      responseStyleCustomInstructions,
    });
    if (!result.ok) {
      return autosaveFailed(t('settings.behavior.page.toast.saveFailed'));
    }

    savedRef.current = {
      responseStyleEnabled,
      responseStylePreset,
      responseStyleCustomInstructions,
    };
    return AUTOSAVE_SAVED;
  }, [
    isLoading,
    responseStyleCustomInstructions,
    responseStyleEnabled,
    responseStylePreset,
    t,
  ]);

  const autosave = useAutosave(save);
  const { requestSave } = autosave;

  const responseStylePreview = getResponseStylePreview(responseStylePreset, responseStyleCustomInstructions);

  return (
    <SettingsPageLayout
      title={t('settings.behavior.page.title')}
      description={t('settings.page.behavior.description')}
      onBlurCapture={autosave.onBlurCapture}
    >
      <SettingsSection
        title={t('settings.behavior.page.section.responseStyle')}
        info={t('settings.behavior.page.responseStyle.tooltip')}
        settingsItem="behavior.response-style"
        divider={false}
        contentClassName="space-y-3"
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
          alignEnd={false}
        >
          <Select<ResponseStyleValue>
            value={responseStylePreset}
            onValueChange={(value) => {
              setResponseStylePreset(value);
              requestSave();
            }}
            disabled={isLoading || !responseStyleEnabled}
          >
            <SelectTrigger size={SETTINGS_SELECT_SIZE} className={SETTINGS_SELECT_ROW_TRIGGER_CLASS}>
              <SelectValue>
                {(value) => {
                  if (value === 'custom') return t('settings.behavior.page.responseStyle.option.custom');
                  if (isResponseStylePreset(value)) return t(RESPONSE_STYLE_OPTION_LABEL_KEYS[value]);
                  return null;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {RESPONSE_STYLE_PRESETS.map((preset) => (
                <SelectItem key={preset} value={preset}>
                  {t(RESPONSE_STYLE_OPTION_LABEL_KEYS[preset])}
                </SelectItem>
              ))}
              <SelectItem value="custom">
                {t('settings.behavior.page.responseStyle.option.custom')}
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingsFieldRow>

        <Textarea
          value={responseStylePreview}
          onChange={(event) => setResponseStyleCustomInstructions(event.target.value)}
          placeholder={t('settings.behavior.page.responseStyle.customPlaceholder')}
          rows={5}
          disabled={isLoading || !responseStyleEnabled || responseStylePreset !== 'custom'}
          outerClassName="min-h-[120px]"
          className="w-full font-mono typography-meta bg-transparent"
        />
      </SettingsSection>
    </SettingsPageLayout>
  );
};
