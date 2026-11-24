import React from 'react';
import type { BehaviorFileCatalog, BehaviorFileEntry, FileResourceScope } from '@openchamber/agent-contract';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { SettingsProjectSelector } from '@/components/sections/shared/SettingsProjectSelector';
import { SettingsBadge, SETTINGS_SECTION_TITLE_CLASS } from '@/components/sections/shared/SettingsSection';
import { SettingsSidebarItem } from '@/components/sections/shared/SettingsSidebarItem';
import { SettingsSidebarLayout } from '@/components/sections/shared/SettingsSidebarLayout';
import { SettingsSidebarNoMatches, SettingsSidebarSearch } from '@/components/sections/shared/SettingsSidebarSearch';
import { useI18n } from '@/lib/i18n';
import { matchesRankQuery } from '@/lib/search/fuzzySearch';
import {
  FIXED_NATIVE_FILES,
  selectionKey,
  type BehaviorDraftTarget,
  type BehaviorSelection,
} from './behaviorTypes';

interface BehaviorSidebarProps {
  selection: BehaviorSelection;
  onSelect: (selection: BehaviorSelection) => void;
  hasProjectDirectory: boolean;
  catalog: BehaviorFileCatalog | undefined;
  nativeUnavailable: boolean;
  nativeLoadError: string | null;
  onRetryNative: () => void;
  stagedDraft: BehaviorDraftTarget | null;
  onOpenCreate: () => void;
}

export const BehaviorSidebar: React.FC<BehaviorSidebarProps> = ({
  selection,
  onSelect,
  hasProjectDirectory,
  catalog,
  nativeUnavailable,
  nativeLoadError,
  onRetryNative,
  stagedDraft,
  onOpenCreate,
}) => {
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  const activeKey = selectionKey(selection);
  const canCreate = !nativeUnavailable && Boolean(catalog);

  const scopeEntries = (scope: FileResourceScope) => {
    const files = catalog?.files.filter((entry) => entry.scope === scope) ?? [];
    const rules = files
      .filter((entry): entry is BehaviorFileEntry & { kind: 'rule' } => entry.kind === 'rule')
      .sort((a, b) => a.name.localeCompare(b.name));
    const instructions = files
      .filter((entry): entry is BehaviorFileEntry & { kind: 'instruction' } => entry.kind === 'instruction')
      .sort((a, b) => a.name.localeCompare(b.name));
    return { rules, instructions };
  };

  const showNativeForScope = (scope: FileResourceScope): boolean => {
    if (nativeUnavailable || !catalog) return false;
    return catalog.scopes.includes(scope);
  };

  const matchesQuery = (terms: Array<string | null | undefined>) => {
    if (!query.trim()) return true;
    return matchesRankQuery(terms.filter((term): term is string => Boolean(term)), query);
  };

  const renderScopeGroup = (
    scopeKey: 'global' | 'project',
    fileScope: FileResourceScope,
    groupLabel: string,
    includeNative: boolean,
  ) => {
    const { rules, instructions } = scopeEntries(fileScope);
    const hasDraftInScope = stagedDraft?.scope === fileScope;
    const draftRule = hasDraftInScope && stagedDraft.kind === 'rule' ? stagedDraft : null;
    const draftInstruction = hasDraftInScope && stagedDraft.kind === 'instruction' ? stagedDraft : null;

    const showAgentsMd = matchesQuery(['AGENTS.md', groupLabel]);
    const visibleFixed = includeNative
      ? FIXED_NATIVE_FILES.filter((file) => matchesQuery([file.name, groupLabel]))
      : [];
    const visibleRules = includeNative
      ? rules.filter((file) => matchesQuery([file.name, file.fields.description, t('settings.behavior.files.rules')]))
      : [];
    const visibleInstructions = includeNative
      ? instructions.filter((file) => matchesQuery([file.name, file.fields.applyTo, t('settings.behavior.files.instructions')]))
      : [];
    const showDraftRule = Boolean(draftRule && matchesQuery([draftRule.name, t('settings.behavior.files.rules')]));
    const showDraftInstruction = Boolean(
      draftInstruction && matchesQuery([draftInstruction.name, t('settings.behavior.files.instructions')]),
    );

    if (
      !showAgentsMd &&
      visibleFixed.length === 0 &&
      visibleRules.length === 0 &&
      visibleInstructions.length === 0 &&
      !showDraftRule &&
      !showDraftInstruction
    ) {
      return null;
    }

    return (
      <div key={scopeKey} className="pt-2">
        <div className="px-2 pb-1 pt-2 text-xs font-semibold tracking-wide text-muted-foreground">
          {groupLabel}
        </div>

        {showAgentsMd ? (
          <SettingsSidebarItem
            title="AGENTS.md"
            icon={<Icon name="file-text" className="size-3.5 shrink-0 text-muted-foreground" />}
            selected={activeKey === `agents-md:${scopeKey}`}
            onSelect={() => onSelect({ type: 'agents-md', scope: scopeKey })}
          />
        ) : null}

        {visibleFixed.map((file) => {
          const itemAnchor =
            scopeKey === 'global'
              ? file.kind === 'sticky-rules'
                ? 'behavior.files.rules-md'
                : 'behavior.files.system-md'
              : undefined;
          return (
            <div key={`${fileScope}:${file.kind}`} data-settings-item={itemAnchor}>
              <SettingsSidebarItem
                title={file.name}
                icon={<Icon name="file-text" className="size-3.5 shrink-0 text-muted-foreground" />}
                selected={activeKey === `native-file:${fileScope}:${file.kind}:${file.name}`}
                onSelect={() =>
                  onSelect({ type: 'native-file', scope: fileScope, kind: file.kind, name: file.name })
                }
              />
            </div>
          );
        })}

        {(visibleRules.length > 0 || showDraftRule) ? (
          <div data-settings-item={scopeKey === 'global' ? 'behavior.rules' : undefined} className="pt-1">
            <div className="px-2 pb-0.5 pt-1 typography-micro font-medium text-muted-foreground">
              {t('settings.behavior.files.rules')}
            </div>
            {showDraftRule && draftRule ? (
              <SettingsSidebarItem
                title={(
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{draftRule.name}</span>
                    <SettingsBadge>{t('settings.behavior.files.sidebar.newDraftBadge')}</SettingsBadge>
                  </span>
                )}
                icon={<Icon name="shield" className="size-3.5 shrink-0 text-muted-foreground" />}
                selected={activeKey === `new-draft:${draftRule.scope}:rule:${draftRule.name}`}
                onSelect={() =>
                  onSelect({ type: 'new-draft', scope: draftRule.scope, kind: 'rule', name: draftRule.name })
                }
              />
            ) : null}
            {visibleRules.map((rule) => (
              <SettingsSidebarItem
                key={`${fileScope}:rule:${rule.name}`}
                title={(
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{rule.name}</span>
                    {rule.fields.enabled === false ? (
                      <SettingsBadge>{t('settings.behavior.files.sidebar.disabledBadge')}</SettingsBadge>
                    ) : null}
                  </span>
                )}
                metadata={rule.fields.description || undefined}
                icon={<Icon name="shield" className="size-3.5 shrink-0 text-muted-foreground" />}
                selected={activeKey === `native-file:${fileScope}:rule:${rule.name}`}
                onSelect={() =>
                  onSelect({ type: 'native-file', scope: fileScope, kind: 'rule', name: rule.name })
                }
              />
            ))}
          </div>
        ) : null}

        {(visibleInstructions.length > 0 || showDraftInstruction) ? (
          <div data-settings-item={scopeKey === 'global' ? 'behavior.instructions' : undefined} className="pt-1">
            <div className="px-2 pb-0.5 pt-1 typography-micro font-medium text-muted-foreground">
              {t('settings.behavior.files.instructions')}
            </div>
            {showDraftInstruction && draftInstruction ? (
              <SettingsSidebarItem
                title={(
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{draftInstruction.name}</span>
                    <SettingsBadge>{t('settings.behavior.files.sidebar.newDraftBadge')}</SettingsBadge>
                  </span>
                )}
                icon={<Icon name="book-open" className="size-3.5 shrink-0 text-muted-foreground" />}
                selected={activeKey === `new-draft:${draftInstruction.scope}:instruction:${draftInstruction.name}`}
                onSelect={() =>
                  onSelect({
                    type: 'new-draft',
                    scope: draftInstruction.scope,
                    kind: 'instruction',
                    name: draftInstruction.name,
                  })
                }
              />
            ) : null}
            {visibleInstructions.map((instruction) => (
              <SettingsSidebarItem
                key={`${fileScope}:instruction:${instruction.name}`}
                title={instruction.name}
                metadata={instruction.fields.applyTo || undefined}
                icon={<Icon name="book-open" className="size-3.5 shrink-0 text-muted-foreground" />}
                selected={activeKey === `native-file:${fileScope}:instruction:${instruction.name}`}
                onSelect={() =>
                  onSelect({
                    type: 'native-file',
                    scope: fileScope,
                    kind: 'instruction',
                    name: instruction.name,
                  })
                }
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const promptMatches = matchesQuery([
    t('settings.behavior.section.prompt.title'),
    t('settings.behavior.page.section.responseStyle'),
  ]);
  const globalGroup = renderScopeGroup(
    'global',
    'agent',
    t('settings.behavior.files.sidebar.globalGroup'),
    showNativeForScope('agent'),
  );
  const projectGroup = hasProjectDirectory
    ? renderScopeGroup(
      'project',
      'workspace',
      t('settings.behavior.files.sidebar.projectGroup'),
      showNativeForScope('workspace'),
    )
    : null;
  const noMatches = Boolean(query.trim()) && !promptMatches && !globalGroup && !projectGroup;

  return (
    <SettingsSidebarLayout
      variant="sidebar"
      header={(
        <div className="border-b px-3 pt-4 pb-3" style={{ borderColor: 'var(--interactive-border)' }}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className={SETTINGS_SECTION_TITLE_CLASS}>{t('settings.behavior.page.title')}</h2>
            {canCreate ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                data-settings-item="behavior.files.create"
                onClick={onOpenCreate}
                aria-label={t('settings.behavior.files.create')}
              >
                <Icon name="add" className="size-3.5 me-1" />
                {t('settings.behavior.files.sidebar.createButton')}
              </Button>
            ) : null}
          </div>
          <SettingsProjectSelector className="mb-3" />
          <SettingsSidebarSearch value={query} onChange={setQuery} />
        </div>
      )}
    >
      {promptMatches ? (
        <SettingsSidebarItem
          title={t('settings.behavior.section.prompt.title')}
          icon={<Icon name="settings-3" className="size-3.5 shrink-0 text-muted-foreground" />}
          selected={activeKey === 'prompt'}
          onSelect={() => onSelect({ type: 'prompt' })}
        />
      ) : null}

      {nativeLoadError ? (
        <div role="alert" className="space-y-2 px-2 py-2 typography-meta text-[var(--status-error)]">
          <p>{t('settings.behavior.files.loadFailed')}</p>
          <Button type="button" size="xs" variant="outline" onClick={onRetryNative}>
            {t('settings.agents.page.permissionsEditor.actions.retry')}
          </Button>
        </div>
      ) : null}

      {globalGroup}
      {projectGroup}
      {noMatches ? <SettingsSidebarNoMatches query={query} /> : null}
    </SettingsSidebarLayout>
  );
};
