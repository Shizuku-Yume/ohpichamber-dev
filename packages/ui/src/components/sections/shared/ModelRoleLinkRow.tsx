import React from 'react';
import { SettingsInlineLink } from '@/components/sections/classification/JevAccessNote';
import { SettingsFieldRow } from '@/components/sections/shared/SettingsSection';

interface ModelRoleLinkRowProps {
  label: React.ReactNode;
  info?: React.ReactNode;
  /** The role's current selector as written, or the inherit text when unset. */
  value: React.ReactNode;
  linkLabel: React.ReactNode;
  onOpen: () => void;
  settingsItem?: string;
}

/** A model role shown where it is used and edited by the page that owns it. */
export const ModelRoleLinkRow: React.FC<ModelRoleLinkRowProps> = ({ label, info, value, linkLabel, onOpen, settingsItem }) => (
  <SettingsFieldRow label={label} info={info} settingsItem={settingsItem}>
    <div className="flex min-w-0 items-center gap-3">
      <span className="typography-ui-label min-w-0 truncate text-muted-foreground">{value}</span>
      <SettingsInlineLink onClick={onOpen}>{linkLabel}</SettingsInlineLink>
    </div>
  </SettingsFieldRow>
);
