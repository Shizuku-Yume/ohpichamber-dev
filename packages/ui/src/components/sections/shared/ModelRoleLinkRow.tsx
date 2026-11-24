import React from 'react';
import { z } from 'zod';
import { JsonValueSchema, type JsonValue, type Model } from '@openchamber/agent-contract';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { SettingsFieldRow } from '@/components/sections/shared/SettingsSection';
import { formatRoleDisplayValue } from '@/components/sections/shared/modelRoleSelectors';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useSettingsModels } from '@/hooks/useSettingsModels';
import { useI18n } from '@/lib/i18n';

interface ModelRoleLinkRowProps {
  label: React.ReactNode;
  info?: React.ReactNode;
  value: JsonValue | React.ReactNode;
  models?: readonly Model[];
  linkLabel: React.ReactNode;
  onOpen: () => void;
  settingsItem?: string;
}

/** A model role shown where it is used and edited by the page that owns it. */
export const ModelRoleLinkRow: React.FC<ModelRoleLinkRowProps> = ({
  label,
  info,
  value,
  models,
  linkLabel,
  onOpen,
  settingsItem,
}) => {
  const { t } = useI18n();
  const directory = useSettingsDirectory();
  const directoryModels = useSettingsModels(models ? null : directory);
  const resolvedModels = models ?? directoryModels;

  const displayValue: React.ReactNode = React.useMemo(() => {
    if (React.isValidElement(value)) return value;
    const stringValue = z.string().safeParse(value);
    if (stringValue.success) {
      return formatRoleDisplayValue(stringValue.data, resolvedModels, t);
    }
    if (value === undefined || value === null) {
      return formatRoleDisplayValue(undefined, resolvedModels, t);
    }
    const scalarValue = z.union([z.number(), z.boolean()]).safeParse(value);
    if (scalarValue.success) return String(scalarValue.data);
    const parsed = JsonValueSchema.safeParse(value);
    if (parsed.success) return formatRoleDisplayValue(parsed.data, resolvedModels, t);
    return null;
  }, [resolvedModels, t, value]);

  return (
    <SettingsFieldRow label={label} info={info} settingsItem={settingsItem}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="typography-ui-label min-w-0 truncate text-muted-foreground">{displayValue}</span>
        <Button variant="outline" size="xs" onClick={onOpen}>
          <span>{linkLabel}</span>
          <Icon name="arrow-right" className="size-3.5" />
        </Button>
      </div>
    </SettingsFieldRow>
  );
};
