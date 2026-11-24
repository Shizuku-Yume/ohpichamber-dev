import React from 'react';
import type { ImageModel } from '@openchamber/agent-contract';
import { Icon } from '@/components/icon/Icon';
import {
  ModelPickerList,
  type ModelPickerEntry,
  type ModelPickerProvider,
} from '@/components/model-picker/ModelPickerList';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { dropdownTriggerVariants } from '@/components/ui/dropdown-trigger';
import { Spinner } from '@/components/ui/spinner';
import { useDeviceInfo } from '@/lib/device';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { selectProvidersForDirectory, useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';

interface ImageModelSelectorProps {
  providerId: string;
  modelId: string;
  imageModels: readonly ImageModel[] | undefined;
  onChange: (providerId: string, modelId: string) => void;
  directory?: string;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
}

const EMPTY_MODEL_LISTS: never[] = [];

export const ImageModelSelector: React.FC<ImageModelSelectorProps> = ({
  providerId,
  modelId,
  imageModels,
  onChange,
  directory,
  placeholder,
  ariaLabel,
  className,
  disabled = false,
  loading = false,
}) => {
  const { t } = useI18n();
  const catalogProviders = useConfigStore((state) => (directory === undefined
    ? state.providers
    : selectProvidersForDirectory(state, directory)));
  const isMobile = useUIStore((state) => state.isMobile);
  const providerOrder = useUIStore((state) => state.providerOrder);
  const { isMobile: deviceIsMobile } = useDeviceInfo();
  const isActuallyMobile = isMobile || deviceIsMobile;

  const [isMobilePanelOpen, setIsMobilePanelOpen] = React.useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const closePicker = React.useCallback(() => {
    setIsMobilePanelOpen(false);
    setIsDropdownOpen(false);
    setSearchQuery('');
  }, []);

  const isReady = !loading && imageModels !== undefined;
  const canOpen = isReady && !disabled;
  const selectedModel = providerId && modelId ? { providerID: providerId, modelID: modelId } : null;
  const displayReady = isReady || (!loading && Boolean(selectedModel));

  const providers = React.useMemo<ModelPickerProvider<ImageModel>[]>(() => {
    if (!imageModels) return [];
    const providerNames = new Map(catalogProviders.map((provider) => [provider.providerId, provider.name] as const));
    const grouped = new Map<string, ImageModel[]>();
    for (const model of imageModels) {
      if (model.enabled === false) continue;
      const bucket = grouped.get(model.provider);
      if (bucket) bucket.push(model);
      else grouped.set(model.provider, [model]);
    }
    return Array.from(grouped.entries()).map(([id, models]) => ({
      providerId: id,
      name: providerNames.get(id) ?? id,
      models,
    }));
  }, [catalogProviders, imageModels]);

  const triggerLabel = React.useMemo(() => {
    if (!providerId || !modelId) {
      return placeholder || t('settings.agents.modelSelector.notSelected');
    }
    const matched = imageModels?.find((entry) => entry.provider === providerId && entry.modelId === modelId);
    return (typeof matched?.name === 'string' && matched.name.trim()) || modelId;
  }, [imageModels, modelId, placeholder, providerId, t]);

  const handleSelect = React.useCallback((entry: ModelPickerEntry<ImageModel>) => {
    onChange(entry.providerId, entry.modelId);
    closePicker();
  }, [closePicker, onChange]);

  const handleSelectNone = React.useCallback(() => {
    onChange('', '');
    closePicker();
  }, [closePicker, onChange]);

  const labels = React.useMemo(() => ({
    searchPlaceholder: t('settings.agents.modelSelector.searchPlaceholder'),
    list: t('chat.modelControls.modelListAria'),
    noResults: t('settings.agents.modelSelector.state.noModelsFound'),
    favorites: t('settings.agents.modelSelector.section.favorites'),
    recent: t('settings.agents.modelSelector.section.recent'),
    keyboardHint: t('settings.agents.modelSelector.keyboardHints'),
    notSelected: placeholder || t('settings.agents.modelSelector.notSelected'),
    favorite: t('settings.agents.modelSelector.actions.favorite'),
    unfavorite: t('settings.agents.modelSelector.actions.unfavorite'),
    provider: t('chat.modelControls.provider'),
    capabilities: t('chat.modelControls.capabilities'),
    capabilityToolCalling: t('chat.modelControls.capability.toolCalling'),
    capabilityReasoning: t('chat.modelControls.capability.reasoning'),
    input: t('chat.modelControls.input'),
    output: t('chat.modelControls.output'),
    costPerMillion: t('chat.modelControls.costPerMillion'),
  }), [placeholder, t]);

  const picker = (
    <ModelPickerList<ImageModel>
      providers={providers}
      providerOrder={providerOrder}
      favoriteModels={EMPTY_MODEL_LISTS}
      recentModels={EMPTY_MODEL_LISTS}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      onSelect={handleSelect}
      labels={labels}
      selectedModel={selectedModel}
      includeNotSelected
      onSelectNone={handleSelectNone}
      onEscape={closePicker}
      tooltipsEnabled={isActuallyMobile ? isMobilePanelOpen : isDropdownOpen}
      {...(isActuallyMobile ? {
        autoFocus: false,
        maxHeightClassName: 'min-h-0 flex-1',
        providersStartCollapsed: true,
        showKeyboardHints: false,
      } : null)}
    />
  );

  if (isActuallyMobile) {
    return (
      <>
        <button
          type="button"
          onClick={canOpen ? () => setIsMobilePanelOpen(true) : undefined}
          disabled={!canOpen}
          aria-label={ariaLabel}
          className={cn(
            dropdownTriggerVariants({ size: 'mobile' }),
            'w-fit max-w-full',
            className,
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            {!displayReady ? (
              <>
                <Spinner className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="typography-meta text-muted-foreground">{t('common.loading')}</span>
              </>
            ) : providerId ? (
              <ProviderLogo providerId={providerId} className="h-3.5 w-3.5 flex-shrink-0" />
            ) : (
              <Icon name="pencil-ai" className="h-3 w-3 text-muted-foreground" />
            )}
            {displayReady ? <span className="typography-meta font-medium text-foreground truncate">{triggerLabel}</span> : null}
          </div>
          <Icon name="arrow-down-s" className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        </button>
        <MobileOverlayPanel
          open={isMobilePanelOpen}
          onClose={closePicker}
          title={t('settings.agents.modelSelector.title')}
          scrollContent={false}
        >
          {picker}
        </MobileOverlayPanel>
      </>
    );
  }

  return (
    <DropdownMenu open={canOpen && isDropdownOpen} onOpenChange={canOpen ? setIsDropdownOpen : undefined}>
      <DropdownMenuTrigger asChild nativeButton={false}>
        <div
          aria-label={ariaLabel}
          aria-disabled={!canOpen || undefined}
          className={cn(
            dropdownTriggerVariants(),
            'min-w-0 w-fit',
            !canOpen && 'opacity-60 cursor-not-allowed',
            className,
          )}
        >
          {!displayReady ? (
            <>
              <Spinner className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="typography-ui-label font-normal whitespace-nowrap text-muted-foreground">
                {t('common.loading')}
              </span>
            </>
          ) : (
            <>
              {providerId ? (
                <ProviderLogo providerId={providerId} className="h-3.5 w-3.5 flex-shrink-0" />
              ) : (
                <Icon name="pencil-ai" className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              )}
              <span className="typography-ui-label min-w-0 flex-1 truncate text-start font-normal text-foreground">
                {triggerLabel}
              </span>
            </>
          )}
          <Icon name="arrow-down-s" className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[min(380px,calc(100vw-2rem))] p-0 flex flex-col" align="start">
        {picker}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
