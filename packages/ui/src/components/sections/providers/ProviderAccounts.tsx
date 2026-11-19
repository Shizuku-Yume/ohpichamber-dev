import React from 'react';
<<<<<<< HEAD
import type { ProviderAccounts as Accounts, ProviderAccountMutationRequest } from '@openchamber/agent-contract';
import { SETTINGS_ICON_BUTTON_CLASS, SETTINGS_WIDTH_SHORT_TEXT_CLASS } from '@/components/sections/shared/SettingsSection';
||||||| bc50ba56aa
import type { ConnectionInfo } from '@opencode/client';
import { SETTINGS_ICON_BUTTON_CLASS } from '@/components/sections/shared/SettingsSection';
=======
import type { IntegrationConnection as ConnectionInfo } from '@/lib/opencode/model';
import { SETTINGS_ICON_BUTTON_CLASS } from '@/components/sections/shared/SettingsSection';
>>>>>>> upstream/main
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
<<<<<<< HEAD
  roster: Accounts;
  /** Credential with an account write in flight; every account action waits for it. */
||||||| bc50ba56aa
  /** Stored credentials first, then environment variables the server can see. */
  connections: readonly ConnectionInfo[];
  /** The one credential requests go through, when a stored credential is in use. */
  activeId: string | null;
  /**
   * Credentials stored under an integration the provider does not use right now
   * (OpenCode Go keys while the Console sign-in serves Go). Removable, never switchable.
   */
  unusedIds: ReadonlySet<string>;
  /** Credential id with a write in flight; every account action waits for it. */
=======
  connections: readonly ConnectionInfo[];
  activeId: string | null;
  unusedIds: ReadonlySet<string>;
>>>>>>> upstream/main
  busyId: string | null;
<<<<<<< HEAD
  onMutate: (request: ProviderAccountMutationRequest) => void;
  disabled?: boolean;
||||||| bc50ba56aa
  /**
   * Judged over all of the provider's accounts, which may be split across
   * several lists: whether an idle account offers Use, and whether the active
   * one carries its Active mark.
   */
  canSwitch: boolean;
  showActive: boolean;
  onActivate: (account: CredentialConnection) => void;
  onRename: (account: CredentialConnection, label: string) => void;
  onRemove: (account: CredentialConnection) => void;
=======
  canSwitch: boolean;
  showActive: boolean;
  onActivate: (account: CredentialConnection) => void;
  onRename: (account: CredentialConnection, label: string) => void;
  onRemove: (account: CredentialConnection) => void;
>>>>>>> upstream/main
}

const AccountTile: React.FC<{ icon: IconName }> = ({ icon }) => (
  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-muted-foreground">
    <Icon name={icon} className="size-4" />
  </span>
);

<<<<<<< HEAD
||||||| bc50ba56aa
/**
 * The line under an account: what OpenCode reported when the connection needs
 * a new sign-in, otherwise how the account connects.
 */
const AccountSubtitle: React.FC<{ connection: ConnectionInfo; fallback: string }> = ({ connection, fallback }) => (
  connectionNeedsAuth(connection) && connection.status ? (
    <div className="typography-micro text-[var(--status-warning)] break-words">{connection.status.message}</div>
  ) : (
    <div className="typography-micro text-muted-foreground">{fallback}</div>
  )
);

/** Opens the page OpenCode named for signing in again (an SSO login, for one). */
const SignInAgainButton: React.FC<{ connection: ConnectionInfo; account: string }> = ({ connection, account }) => {
  const { t } = useI18n();
  const url = connectionNeedsAuth(connection) ? connection.status?.url : undefined;
  if (!url) return null;
  return (
    <Button
      variant="outline"
      size="xs"
      onClick={() => { void openExternalUrl(url); }}
      aria-label={t('settings.providers.accounts.signInAria', { account })}
    >
      {t('settings.providers.accounts.signIn')}
    </Button>
  );
};

=======
const AccountSubtitle: React.FC<{ connection: ConnectionInfo; fallback: string }> = ({ connection, fallback }) => (
  connectionNeedsAuth(connection) && connection.status ? (
    <div className="typography-micro text-[var(--status-warning)] break-words">{connection.status.message}</div>
  ) : (
    <div className="typography-micro text-muted-foreground">{fallback}</div>
  )
);

const SignInAgainButton: React.FC<{ connection: ConnectionInfo; account: string }> = ({ connection, account }) => {
  const { t } = useI18n();
  const url = connectionNeedsAuth(connection) ? connection.status?.url : undefined;
  if (!url) return null;
  return (
    <Button
      variant="outline"
      size="xs"
      onClick={() => { void openExternalUrl(url); }}
      aria-label={t('settings.providers.accounts.signInAria', { account })}
    >
      {t('settings.providers.accounts.signIn')}
    </Button>
  );
};

>>>>>>> upstream/main
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

<<<<<<< HEAD
/** Stored native credentials for one provider, one row per account. */
||||||| bc50ba56aa
/** Stored accounts and environment connections for one provider. */
=======
>>>>>>> upstream/main
export const ProviderAccounts: React.FC<ProviderAccountsProps> = ({
  roster,
  busyId,
  onMutate,
  disabled = false,
}) => {
  const { t } = useI18n();
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const switchableCount = roster.accounts.filter((account) => !account.disabled).length;
  // With a single usable account there is nothing to switch between, so it
  // carries no Use button; the Active mark still shows when idle ones sit next to it.
  const canSwitch = switchableCount > 1;
  const showActive = roster.accounts.length > 1;

  return (
    <div className="divide-y divide-[var(--surface-subtle)]">
      {roster.accounts.map((account, index) => {
        const active = account.active;
        const busy = busyId !== null;
<<<<<<< HEAD
        const methodLabel = account.method === 'oauth'
          ? t('settings.providers.accounts.method.oauth')
          : t('settings.providers.accounts.method.key');
        const name = account.label || account.email || account.accountId || `${methodLabel} ${index + 1}`;
        const methodIcon: IconName = account.method === 'oauth' ? 'user-3' : 'key';
||||||| bc50ba56aa
        const methodLabel = connection.method === 'oauth'
          ? (unused ? t('settings.providers.accounts.method.oauthUnused') : t('settings.providers.accounts.method.oauth'))
          : connection.method === 'external'
            ? (unused ? t('settings.providers.accounts.method.externalUnused') : t('settings.providers.accounts.method.external'))
            : (unused ? t('settings.providers.accounts.method.keyUnused') : t('settings.providers.accounts.method.key'));
        // An external credential (a cloud CLI login or profile) lives outside OpenCode's store.
        const methodIcon = connection.method === 'oauth' ? 'user-3' : connection.method === 'external' ? 'terminal-box' : 'key';
=======
        const methodLabel = connection.method === 'oauth'
          ? (unused ? t('settings.providers.accounts.method.oauthUnused') : t('settings.providers.accounts.method.oauth'))
          : connection.method === 'external'
            ? (unused ? t('settings.providers.accounts.method.externalUnused') : t('settings.providers.accounts.method.external'))
            : (unused ? t('settings.providers.accounts.method.keyUnused') : t('settings.providers.accounts.method.key'));
        const methodIcon = connection.method === 'oauth' ? 'user-3' : connection.method === 'external' ? 'terminal-box' : 'key';
>>>>>>> upstream/main

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
                    {showActive && active ? (
                      <span className="shrink-0 rounded-full bg-[var(--interactive-selection)] px-2 py-px typography-micro font-medium text-[var(--interactive-selection-foreground)]">
                        {t('settings.providers.accounts.active')}
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
                {canSwitch && !active && !account.disabled ? (
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={busy || disabled}
                    onClick={() => onMutate({
                      action: 'select',
                      expectedRevision: roster.revision,
                      credentialRef: account.credentialRef,
                    })}
                    aria-label={t('settings.providers.accounts.useAria', { account: name })}
                  >
                    {busyId === account.credentialRef ? <Icon name="loader-4" className="size-3.5 animate-spin" /> : null}
                    {t('settings.providers.accounts.use')}
                  </Button>
                ) : null}
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
