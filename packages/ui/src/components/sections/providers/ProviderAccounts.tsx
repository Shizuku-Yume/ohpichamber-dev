import React from 'react';
import type { ProviderAccounts as Accounts, ProviderAccountMutationRequest } from '@openchamber/agent-contract';
import { SETTINGS_ICON_BUTTON_CLASS, SETTINGS_WIDTH_SHORT_TEXT_CLASS, SettingsChipGroup, SettingsFieldRow } from '@/components/sections/shared/SettingsSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface ProviderAccountsProps {
  roster: Accounts;
  /** Credential with an account write in flight; every account action waits for it. */
  busyId: string | null;
  onMutate: (request: ProviderAccountMutationRequest) => void;
  disabled?: boolean;
}

const AccountTile: React.FC<{ icon: IconName }> = ({ icon }) => (
  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-muted-foreground">
    <Icon name={icon} className="size-4" />
  </span>
);

const RenameField: React.FC<{
  initial: string;
  onSave: (label: string) => void;
  onCancel: () => void;
}> = ({ initial, onSave, onCancel }) => {
  const { t } = useI18n();
  const [value, setValue] = React.useState(initial);
  const trimmed = value.trim();
  const save = () => {
    if (trimmed.length === 0 || trimmed === initial) {
      onCancel();
      return;
    }
    onSave(trimmed);
  };

  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
        }}
        aria-label={t('settings.providers.accounts.nameAria')}
        inputSize="compact"
        className={SETTINGS_WIDTH_SHORT_TEXT_CLASS}
        maxLength={128}
      />
      <Button type="submit" size="xs">{t('settings.providers.accounts.save')}</Button>
      <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
        {t('settings.providers.page.actions.cancel')}
      </Button>
    </form>
  );
};

export const ProviderAccounts: React.FC<ProviderAccountsProps> = ({
  roster,
  busyId,
  onMutate,
  disabled = false,
}) => {
  const { t } = useI18n();
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const enabledAccounts = roster.accounts.filter((account) => !account.disabled);
  const pinnedAccount = enabledAccounts.find((account) => account.active);
  const canSwitch = enabledAccounts.length > 1;
  const selectionDisabled = busyId !== null || disabled || roster.selectionOverriddenBy !== null;
  const accountName = (account: Accounts['accounts'][number]) => {
    const index = roster.accounts.indexOf(account);
    const method = t(account.method === 'oauth' ? 'settings.providers.accounts.method.oauth' : 'settings.providers.accounts.method.key');
    return account.label || account.email || account.accountId || `${method} ${index + 1}`;
  };
  const overrideKeys = {
    'stored-credential': 'settings.providers.accounts.selection.override.stored',
    'managed-environment': 'settings.providers.accounts.selection.override.managed',
    'external-environment': 'settings.providers.accounts.selection.override.external',
  } as const;

  return (
    <div className="divide-y divide-[var(--surface-subtle)]">
      {canSwitch ? (
        <SettingsFieldRow label={t('settings.providers.accounts.selection.label')}>
          <SettingsChipGroup
            aria-label={t('settings.providers.accounts.selection.label')}
            value={roster.selectionMode === 'automatic' ? 'automatic' : pinnedAccount ? `account:${pinnedAccount.credentialRef}` : ''}
            options={[
              { value: 'automatic', label: t('settings.providers.accounts.selection.automatic'), disabled: selectionDisabled },
              ...enabledAccounts.map((account) => ({
                value: `account:${account.credentialRef}`, label: accountName(account), disabled: selectionDisabled,
              })),
            ]}
            onChange={(value) => onMutate(value === 'automatic'
              ? { action: 'automatic', expectedRevision: roster.revision }
              : { action: 'select', expectedRevision: roster.revision, credentialRef: value.slice('account:'.length) })}
          />
        </SettingsFieldRow>
      ) : null}
      {roster.selectionOverriddenBy !== null ? (
        <p className="py-2 typography-micro text-muted-foreground">{t(overrideKeys[roster.selectionOverriddenBy])}</p>
      ) : roster.selectionMode === 'automatic' ? (
        <p className="py-2 typography-micro text-muted-foreground">{t('settings.providers.accounts.selection.info')}</p>
      ) : null}
      {roster.accounts.map((account) => {
        const active = roster.selectionMode === 'pinned' && account.active;
        const busy = busyId !== null;
        const methodLabel = account.method === 'oauth'
          ? t('settings.providers.accounts.method.oauth')
          : t('settings.providers.accounts.method.key');
        const name = accountName(account);
        const methodIcon: IconName = account.method === 'oauth' ? 'user-3' : 'key';

        return (
          <div key={account.credentialRef} className={cn('flex min-w-0 items-center gap-3 py-2.5', account.disabled && 'opacity-60')}>
            <AccountTile icon={methodIcon} />
            {renamingId === account.credentialRef ? (
              <RenameField
                initial={account.label ?? ''}
                onCancel={() => setRenamingId(null)}
                onSave={(label) => {
                  setRenamingId(null);
                  onMutate({
                    action: 'label',
                    expectedRevision: roster.revision,
                    credentialRef: account.credentialRef,
                    label,
                  });
                }}
              />
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate typography-ui-label font-medium text-foreground">{name}</span>
                    {active ? (
                      <span className="shrink-0 rounded-full bg-[var(--interactive-selection)] px-2 py-px typography-micro font-medium text-[var(--interactive-selection-foreground)]">
                        {t('settings.providers.accounts.selection.pinned')}
                      </span>
                    ) : null}
                  </div>
                  {account.disabled ? (
                    <div className="typography-micro text-[var(--status-warning)] break-words">
                      {t('settings.providers.card.status.reauthNeeded')}
                    </div>
                  ) : (
                    <div className="typography-micro text-muted-foreground">{methodLabel}</div>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy || disabled}
                      className={cn(SETTINGS_ICON_BUTTON_CLASS, 'shrink-0')}
                      aria-label={t('settings.providers.accounts.menuAria', { account: name })}
                    >
                      <Icon name="more-2" className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setRenamingId(account.credentialRef)}>
                      <Icon name="pencil" className="size-4" />
                      {t('settings.providers.accounts.rename')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onMutate({
                        action: 'remove',
                        expectedRevision: roster.revision,
                        credentialRef: account.credentialRef,
                      })}
                    >
                      <Icon name="delete-bin" className="size-4" />
                      {t('settings.providers.accounts.remove')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};
