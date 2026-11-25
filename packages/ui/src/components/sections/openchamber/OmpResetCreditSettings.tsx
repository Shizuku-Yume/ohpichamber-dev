import React from 'react';
import type { OmpSetting, OmpSettingValue } from '@openchamber/agent-contract';
import { useI18n, type I18nKey } from '@/lib/i18n';
import {
  SettingsSection,
  SettingsDisclosure,
  SETTINGS_SPACE_ROW_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { OmpRowControl } from '@/components/sections/shared/OmpRowControl';

interface ResetProviderGroup {
  readonly key: 'codexResets' | 'claudeResets';
  readonly title: string;
  readonly redeemIds: readonly string[];
  readonly thresholdIds: readonly string[];
}

const RESET_PROVIDER_GROUPS: readonly ResetProviderGroup[] = [
  {
    key: 'codexResets',
    title: 'Codex',
    redeemIds: ['autoRedeem5h', 'autoRedeemWeekly'],
    thresholdIds: ['minBlockedMinutes', 'keepCredits', 'salvageHorizonHours'],
  },
  {
    key: 'claudeResets',
    title: 'Claude',
    redeemIds: ['autoRedeem5h', 'autoRedeemWeekly', 'autoRedeemFable'],
    thresholdIds: ['minBlockedMinutes', 'keepCredits', 'salvageHorizonHours'],
  },
];

const RESET_MODE_KEYS = {
  yes: 'settings.usage.resets.mode.on',
  no: 'settings.usage.resets.mode.off',
  unset: 'settings.usage.resets.mode.ask',
  mixed: 'settings.usage.resets.mode.mixed',
} as const satisfies Record<string, I18nKey>;

interface OmpResetCreditSettingsProps {
  readonly settings: readonly OmpSetting[];
  readonly form: Record<string, OmpSettingValue>;
  readonly disabled: boolean;
  readonly divider?: boolean;
  readonly onChange: (setting: OmpSetting, value: OmpSettingValue) => void;
  readonly onImmediate: (setting: OmpSetting, value: OmpSettingValue) => void;
}

export const OmpResetCreditSettings: React.FC<OmpResetCreditSettingsProps> = ({
  settings,
  form,
  disabled,
  divider,
  onChange,
  onImmediate,
}) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = React.useState<Readonly<Record<string, boolean>>>({});
  const byId = new Map(settings.map((setting) => [setting.id, setting]));

  const renderRow = (setting: OmpSetting) => {
    const isSelectNumber = setting.type === 'number' && Boolean(setting.options && setting.options.length > 0);
    return (
      <React.Fragment key={setting.id}>
        <OmpRowControl
          setting={setting}
          value={form[setting.id] !== undefined ? form[setting.id] : setting.value}
          disabled={disabled || setting.conditionActive === false}
          onChange={(value) => {
            if (setting.type === 'number' && !isSelectNumber) {
              onChange(setting, value);
            } else {
              onImmediate(setting, value);
            }
          }}
        />
        {setting.conditionActive === false && (
          <p className="typography-meta text-muted-foreground">{t('settings.omp.sharedConfig.overridden')}</p>
        )}
      </React.Fragment>
    );
  };

  return (
    <SettingsSection
      title={t('settings.usage.resets.title')}
      info={t('settings.usage.resets.info')}
      divider={divider}
      contentClassName={SETTINGS_SPACE_ROW_CLASS}
    >
      {RESET_PROVIDER_GROUPS.map((provider) => {
        const rows = [
          ...provider.redeemIds.map((id) => byId.get(`${provider.key}.${id}`)),
          ...provider.thresholdIds.map((id) => byId.get(`${provider.key}.${id}`)),
        ].filter((setting): setting is OmpSetting => setting !== undefined);
        if (rows.length === 0) return null;
        const modes = provider.redeemIds.map((id) => {
          const setting = byId.get(`${provider.key}.${id}`);
          const value = setting ? (form[setting.id] ?? setting.value) : null;
          return value === 'yes' || value === 'no' ? value : 'unset';
        });
        const mode: keyof typeof RESET_MODE_KEYS = new Set(modes).size === 1 ? modes[0] : 'mixed';
        const number = (id: string): number => {
          const setting = byId.get(`${provider.key}.${id}`);
          const parsed = Number(setting ? (form[setting.id] ?? setting.value) : 0);
          return Number.isFinite(parsed) ? parsed : 0;
        };
        const secondary = t('settings.usage.resets.summary', {
          mode: t(RESET_MODE_KEYS[mode]),
          wait: number('minBlockedMinutes'),
          keep: number('keepCredits'),
          horizon: number('salvageHorizonHours'),
        });
        return (
          <SettingsDisclosure
            key={provider.key}
            title={provider.title}
            secondary={secondary}
            expanded={expanded[provider.key] === true}
            onToggle={() => setExpanded((current) => ({ ...current, [provider.key]: current[provider.key] !== true }))}
          >
            {rows.map(renderRow)}
          </SettingsDisclosure>
        );
      })}
    </SettingsSection>
  );
};
