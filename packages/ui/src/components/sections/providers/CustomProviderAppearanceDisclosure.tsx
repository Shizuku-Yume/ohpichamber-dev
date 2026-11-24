import React from 'react';
import {
  SettingsDisclosure,
  SettingsFieldRow,
  SettingsStackedField,
  SETTINGS_HELPER_CLASS,
  SETTINGS_ICON_BUTTON_CLASS,
  SETTINGS_WIDTH_LONG_TEXT_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { useProviderLogo } from '@/hooks/useProviderLogo';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { CUSTOM_PROVIDER_ICONS } from '@/lib/customProviderIcons';
import { providerLogoUploadSupported } from '@/lib/customProviderLogos';
import { useUIStore } from '@/stores/useUIStore';
import { cn } from '@/lib/utils';
import { ProviderLogoImageControl } from './ProviderLogoImageControl';
import { TriStateSelect } from './OmpProviderSubforms';
import type { ConfigApiKeyAction, CustomProviderFormState } from './custom-provider-form';

interface CustomProviderAppearanceDisclosureProps {
  form: CustomProviderFormState;
  setForm: React.Dispatch<React.SetStateAction<CustomProviderFormState>>;
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
}
export const CustomProviderAppearanceDisclosure: React.FC<CustomProviderAppearanceDisclosureProps> = ({
  form,
  setForm,
  expanded,
  onToggle,
  disabled = false,
}) => {
  const { t } = useI18n();
  const logoProviderId = form.providerId.trim() || 'custom';
  const { hasLogo: providerHasLogo } = useProviderLogo(logoProviderId);
  const storedLogo = useUIStore((state) => state.customProviderLogos[logoProviderId]);
  const pickedLogoFile = form.logo instanceof File ? form.logo : null;
  const pickedLogoUrl = useObjectUrl(pickedLogoFile);

  const configApiKeyStatusText = (): string => {
    const status = form.configApiKeyStatus;
    if (!status.configured) return t('settings.providers.page.custom.omp.configApiKey.statusNone');
    switch (status.source) {
      case 'env':
        return t('settings.providers.page.custom.omp.configApiKey.statusEnv', { envVar: status.envVar });
      case 'command':
        return t('settings.providers.page.custom.omp.configApiKey.statusCommand');
      case 'literal':
        return t('settings.providers.page.custom.omp.configApiKey.statusLiteral');
    }
  };

  const configApiKeyActionLabel = (action: ConfigApiKeyAction): string => {
    switch (action) {
      case 'keep':
        return t('settings.providers.page.custom.omp.configApiKey.keep');
      case 'set':
        return t('settings.providers.page.custom.omp.configApiKey.set');
      case 'clear':
        return t('settings.providers.page.custom.omp.configApiKey.clear');
    }
  };

  const hasCustomLogo = Boolean(pickedLogoUrl || (form.logo === null && storedLogo));
  const configApiKeySummary = form.configApiKeyAction === 'set'
    ? t('settings.providers.page.custom.appearance.summary.configKeySet')
    : form.configApiKeyAction === 'clear'
      ? t('settings.providers.page.custom.appearance.summary.configKeyClear')
      : form.configApiKeyStatus.configured
        ? configApiKeyStatusText()
        : null;
  const iconOptionKey = form.icon
    ? (`settings.providers.page.custom.field.icon.option.${form.icon}` as const)
    : null;
  const appearanceSummary = [
    form.logo === 'removed'
      ? t('settings.providers.page.custom.appearance.summary.logoRemoved')
      : hasCustomLogo
        ? t('settings.providers.page.custom.appearance.summary.customLogo')
        : null,
    iconOptionKey
      ? t('settings.providers.page.custom.appearance.summary.icon', { icon: t(iconOptionKey) })
      : null,
    form.authHeader === 'true'
      ? t('settings.providers.page.custom.appearance.summary.authHeaderOn')
      : form.authHeader === 'false'
        ? t('settings.providers.page.custom.appearance.summary.authHeaderOff')
        : null,
    configApiKeySummary,
  ].filter(Boolean).join(' · ') || undefined;

  return (
    <SettingsDisclosure
      title={t('settings.providers.page.custom.appearance.title')}
      secondary={appearanceSummary}
      expanded={expanded}
      onToggle={onToggle}
    >
      <SettingsStackedField
        label={t('settings.providers.page.custom.field.icon.label')}
        info={t('settings.providers.page.custom.field.icon.info')}
      >
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('settings.providers.page.custom.field.icon.label')}>
          <Button
            type="button"
            variant={form.icon === null ? 'chip' : 'ghost'}
            size="icon"
            className={cn(SETTINGS_ICON_BUTTON_CLASS, form.icon === null && 'text-foreground')}
            aria-label={t('settings.providers.page.custom.field.icon.option.default')}
            title={t('settings.providers.page.custom.field.icon.option.default')}
            aria-pressed={form.icon === null}
            disabled={disabled}
            onClick={() => setForm((previous) => ({ ...previous, icon: null }))}
          >
            {providerHasLogo
              ? <ProviderLogo providerId={logoProviderId} className="size-4" ignoreCustomIcon />
              : <Icon name="checkbox-blank-circle" className="size-4 text-muted-foreground" />}
          </Button>
          {CUSTOM_PROVIDER_ICONS.map((entry) => (
            <Button
              key={entry.id}
              type="button"
              variant={form.icon === entry.id ? 'chip' : 'ghost'}
              size="icon"
              className={cn(SETTINGS_ICON_BUTTON_CLASS, form.icon === entry.id && 'text-foreground')}
              aria-label={t(`settings.providers.page.custom.field.icon.option.${entry.id}`)}
              title={t(`settings.providers.page.custom.field.icon.option.${entry.id}`)}
              aria-pressed={form.icon === entry.id}
              disabled={disabled}
              onClick={() => setForm((previous) => ({ ...previous, icon: entry.id }))}
            >
              <Icon name={entry.icon} className="size-4" />
            </Button>
          ))}
        </div>
      </SettingsStackedField>

      {providerLogoUploadSupported() ? (
        <SettingsFieldRow
          label={t('settings.providers.page.logo.title')}
          info={t('settings.providers.page.logo.info')}
          settingsItem="providers.logo"
        >
          <ProviderLogoImageControl
            preview={pickedLogoUrl
              ? <img src={pickedLogoUrl} alt="" className="size-5 object-contain" />
              : form.logo === null && storedLogo ? <ProviderLogo providerId={logoProviderId} alt="" className="size-5" /> : null}
            busy={disabled}
            onPick={(file) => setForm((previous) => ({ ...previous, logo: file }))}
            onRemove={() => setForm((previous) => ({ ...previous, logo: 'removed' }))}
          />
        </SettingsFieldRow>
      ) : null}

      <SettingsFieldRow
        label={t('settings.providers.page.custom.omp.authHeader.label')}
        info={t('settings.providers.page.custom.omp.authHeader.info')}
      >
        <TriStateSelect
          value={form.authHeader}
          onChange={(authHeader) => setForm((previous) => ({ ...previous, authHeader }))}
          ariaLabel={t('settings.providers.page.custom.omp.authHeader.label')}
          disabled={disabled}
          triggerClassName={SETTINGS_WIDTH_SELECT_CLASS}
        />
      </SettingsFieldRow>

      <SettingsFieldRow
        label={t('settings.providers.page.custom.omp.configApiKey.label')}
        info={t('settings.providers.page.custom.omp.configApiKey.info')}
      >
        <div className={cn('flex min-w-0 flex-col gap-1.5', SETTINGS_WIDTH_LONG_TEXT_CLASS)}>
          <p className={SETTINGS_HELPER_CLASS}>{configApiKeyStatusText()}</p>
          <Select
            value={form.configApiKeyAction}
            onValueChange={(next) => {
              if (next === 'keep' || next === 'set' || next === 'clear') {
                setForm((previous) => ({ ...previous, configApiKeyAction: next }));
              }
            }}
            disabled={disabled}
          >
            <SelectTrigger aria-label={t('settings.providers.page.custom.omp.configApiKey.label')} className="w-full">
              <SelectValue>{configApiKeyActionLabel(form.configApiKeyAction)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keep">{t('settings.providers.page.custom.omp.configApiKey.keep')}</SelectItem>
              <SelectItem value="set">{t('settings.providers.page.custom.omp.configApiKey.set')}</SelectItem>
              {form.configApiKeyStatus.configured ? (
                <SelectItem value="clear">{t('settings.providers.page.custom.omp.configApiKey.clear')}</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
          {form.configApiKeyAction === 'set' ? (
            <Input
              type="password"
              value={form.configApiKeyValue}
              onChange={(event) => setForm((previous) => ({ ...previous, configApiKeyValue: event.target.value }))}
              disabled={disabled}
              placeholder={t('settings.providers.page.custom.omp.configApiKey.placeholder')}
              autoComplete="new-password"
              inputSize="compact"
              className="w-full rounded-md px-3 font-mono text-xs"
              aria-label={t('settings.providers.page.custom.omp.configApiKey.placeholder')}
            />
          ) : null}
        </div>
      </SettingsFieldRow>
    </SettingsDisclosure>
  );
};
