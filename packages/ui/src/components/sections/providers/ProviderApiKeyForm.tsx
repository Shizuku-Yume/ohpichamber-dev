import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui';
import { SettingsInfoHint } from '@/components/sections/shared/SettingsInfoHint';
import { useI18n } from '@/lib/i18n';

interface ProviderApiKeyFormProps {
  /** Stores the credential through the native canonical write; never retained here. */
  writeCanonicalKey: (apiKey: string) => Promise<void>;
  onSaved?: () => void;
  disabled?: boolean;
}

/**
 * The API key form for one provider. Mount with `key={providerId}` so a
 * different provider starts from an empty, write-only input.
 */
export const ProviderApiKeyForm: React.FC<ProviderApiKeyFormProps> = ({
  writeCanonicalKey,
  onSaved,
  disabled = false,
}) => {
  const { t } = useI18n();
  const [apiKey, setApiKey] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const save = async () => {
    const key = apiKey.trim();
    if (!key) {
      toast.error(t('settings.providers.page.toast.apiKeyRequired'));
      return;
    }
    setFailed(false);
    setSaving(true);
    try {
      await writeCanonicalKey(key);
      setApiKey('');
      toast.success(t('settings.providers.page.toast.apiKeySaved'));
      onSaved?.();
    } catch (error) {
      console.error('Failed to save API key:', error);
      setFailed(true);
      toast.error(t('settings.providers.page.toast.apiKeySaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 py-1.5">
      <div>
        <label className="typography-ui-label text-foreground flex items-center gap-1.5">
          {t('settings.providers.page.auth.apiKeyLabel')}
          <SettingsInfoHint>{t('settings.providers.page.auth.apiKeyTooltip')}</SettingsInfoHint>
        </label>
        <div className="mt-1.5 flex flex-col gap-2 @xl:flex-row @xl:items-center">
          <Input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={t('settings.providers.page.auth.apiKeyPlaceholder')}
            autoComplete="new-password"
            disabled={saving || disabled}
            className="flex-1 font-mono text-xs"
          />
          <Button
            size="xs"
            className="!font-normal shrink-0"
            onClick={() => void save()}
            disabled={saving || disabled}
          >
            {saving ? t('settings.providers.page.actions.saving') : t('settings.providers.page.actions.saveKey')}
          </Button>
        </div>
      </div>
      <p className="typography-meta text-muted-foreground">{t('settings.providers.native.secretHint')}</p>
      {failed ? (
        <p role="alert" className="typography-meta text-[var(--status-error)]">
          {t('settings.providers.page.toast.apiKeySaveFailed')}
        </p>
      ) : null}
    </div>
  );
};
