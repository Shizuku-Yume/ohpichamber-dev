import React from 'react';
<<<<<<< HEAD
||||||| bc50ba56aa
import type { FormValue, IntegrationKeyMethod } from '@opencode/client';
=======
import type { FormValue, IntegrationKeyMethod } from '@/lib/opencode/model';
>>>>>>> upstream/main
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui';
import {
  SettingsStackedField,
  SETTINGS_HELPER_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { useI18n } from '@/lib/i18n';
import { problemMessage } from '@/lib/problemMessage';

interface ProviderApiKeyFormProps {
<<<<<<< HEAD
  /** Stores the credential through the native canonical write; never retained here. */
  writeCanonicalKey: (apiKey: string) => Promise<void>;
  onSaved?: () => void;
  disabled?: boolean;
||||||| bc50ba56aa
  integrationId: string;
  /**
   * The integration's key method. Its `form` (an Azure resource name, a
   * Cloudflare account id) is answered alongside the key. Undefined for a
   * provider OpenCode has no integration for, which takes a bare key.
   */
  keyMethod: IntegrationKeyMethod | undefined;
  /** Stores the credential; injected so the form does not own the SDK call. */
  connectKey: (request: IntegrationKeyRequest) => Promise<void>;
  onSaved: () => void;
=======
  integrationId: string;
  keyMethod: IntegrationKeyMethod | undefined;
  connectKey: (request: IntegrationKeyRequest) => Promise<void>;
  onSaved: () => void;
>>>>>>> upstream/main
}

<<<<<<< HEAD
/**
 * The API key form for one provider. Mount with `key={providerId}` so a
 * different provider starts from an empty, write-only input.
 */
||||||| bc50ba56aa
/**
 * The API key form for one integration. Mount with `key={integrationId}` so a
 * different provider starts from an empty form.
 */
=======
>>>>>>> upstream/main
export const ProviderApiKeyForm: React.FC<ProviderApiKeyFormProps> = ({
  writeCanonicalKey,
  onSaved,
  disabled = false,
}) => {
  const { t } = useI18n();
  const [apiKey, setApiKey] = React.useState('');
<<<<<<< HEAD
||||||| bc50ba56aa
  // Only what the user typed; declared defaults fill the rest, so a catalog
  // refresh that changes the form never leaves a field without a value.
  const [editedValues, setEditedValues] = React.useState<Record<string, FormValue>>({});
  const fieldValues = React.useMemo(
    () => ({ ...defaultFieldValues(fields), ...editedValues }),
    [fields, editedValues],
  );
  const [fieldError, setFieldError] = React.useState<string | null>(null);
=======
  const [editedValues, setEditedValues] = React.useState<Record<string, FormValue>>({});
  const fieldValues = React.useMemo(
    () => ({ ...defaultFieldValues(fields), ...editedValues }),
    [fields, editedValues],
  );
  const [fieldError, setFieldError] = React.useState<string | null>(null);
>>>>>>> upstream/main
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
      toast.error(problemMessage(error, t('settings.providers.page.toast.apiKeySaveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
<<<<<<< HEAD
    <div className="space-y-3 py-1.5">
      <SettingsStackedField
        label={t('settings.providers.page.auth.apiKeyLabel')}
        info={t('settings.providers.page.auth.apiKeyTooltip')}
        controlClassName="w-full max-w-none"
      >
||||||| bc50ba56aa
    <div className="space-y-3">
      {/* The card around the form names it, so the field carries its label for assistive tech only. */}
      <div className="flex flex-col @xl:flex-row @xl:items-center gap-2">
=======
    <div className="space-y-3">
      <div className="flex flex-col @xl:flex-row @xl:items-center gap-2">
>>>>>>> upstream/main
        <Input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={t('settings.providers.page.auth.apiKeyPlaceholder')}
          autoComplete="new-password"
          disabled={saving || disabled}
          inputSize="compact"
          className="min-w-0 flex-1 font-mono"
        />
        <Button
          size="xs"
          className="shrink-0"
          onClick={() => void save()}
          disabled={saving || disabled}
        >
          {saving ? t('settings.providers.page.actions.saving') : t('settings.providers.page.actions.saveKey')}
        </Button>
      </SettingsStackedField>
      <p className={SETTINGS_HELPER_CLASS}>{t('settings.providers.native.secretHint')}</p>
      {failed ? (
        <p role="alert" className="typography-meta text-[var(--status-error)]">
          {t('settings.providers.page.toast.apiKeySaveFailed')}
        </p>
      ) : null}
    </div>
  );
};
