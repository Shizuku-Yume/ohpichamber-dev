import { formatModelRef, modelRefInstanceKey } from '@openchamber/agent-contract';
import { getReasoningEffortLevels, resolveThinkingLevel } from '@/lib/modelThinkingLevels';
import React from 'react';
import { useChatColumnActions } from './chatColumnSession';
import { MobileModelButton } from './MobileModelButton';
import type { ModelMetadata } from '@/types';
import type { Message, Model } from '@openchamber/agent-contract';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Icon } from "@/components/icon/Icon";
import { ArrowsMerge } from '@/components/icons/ArrowsMerge';
import type { IconName } from "@/components/icon/icons";
import { ModelPickerList, type ModelPickerEntry } from '@/components/model-picker/ModelPickerList';
import { isDesktopShell } from '@/lib/desktop';
import { useDeviceInfo } from '@/lib/device';
import { mergeModelMetadataWithLiveModel } from '@/lib/modelMetadata';
import { getModelDisplayName as getSharedModelDisplayName } from '@/lib/modelDisplay';
import { formatCompactNumber } from '@/lib/numberFormat';
import { cn } from '@/lib/utils';
import { matchesRankQuery } from '@/lib/search/fuzzySearch';
import { useContextStore } from '@/stores/contextStore';
import { useConfigStore, isStaleAutoSelection, selectKnownCatalogModel } from '@/stores/useConfigStore';
import { selectAgentsForDirectory, useAgentsStore } from '@/stores/useAgentsStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSelectionStore } from '@/sync/selection-store';
import { useDirectorySync, useSessionMessagesSelector, useSessionRenderable, useSessionSelector } from '@/sync/sync-context';
import { useSync } from '@/sync/use-sync';
import { useUIStore } from '@/stores/useUIStore';
import { useModelLists } from '@/hooks/useModelLists';
import { useIsTextTruncated } from '@/hooks/useIsTextTruncated';
import { formatEffortLabel, getCycledAgentId, type MobileControlsPanel } from './mobileControlsUtils';
import { getCurrentIntlLocale, useI18n } from '@/lib/i18n';
import { useCatalogReadiness } from '@/hooks/useCatalogReadiness';
import { eventMatchesShortcut, getEffectiveShortcutCombo, normalizeCombo } from '@/lib/shortcuts';
import { markStartupTrace } from '@/lib/startupTrace';
import { AUTO_MODEL_ID, AUTO_PROVIDER_ID, isAutoModel } from '@/lib/routing/autoModel';
import { selectAutoReady, useRoutingStore } from '@/stores/useRoutingStore';
import {
    areModelChoicesEqual,
    extractSessionRecordModelChoice,
    findLatestUserModelChoice,
    shouldPreserveManualModelOverride,
} from '@/lib/messages/userModelChoice';
import type { ComposerModelSelection } from './pinnedComposerSelection';
import { ROOT_SELECTION_AGENT } from '@/sync/selection-store';

type IconComponent = IconName;

type ProviderModel = Model;

type MobileVariantTarget = { providerId: string; modelId: string };

const buildModelRefKey = (providerId: string, modelId: string) => modelRefInstanceKey(providerId, modelId);

const selectLatestReplyModelChoice = (messages: Message[]) => findLatestUserModelChoice(messages);
const MAX_INLINE_MOBILE_VARIANT_OPTIONS = 6;



interface CapabilityDefinition {
    key: 'tool_call' | 'reasoning';
    icon: IconComponent;
    label: string;
    isActive: (metadata?: ModelMetadata) => boolean;
}

const CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
    {
        key: 'tool_call',
        icon: "tools",
        label: 'Tool calling',
        isActive: (metadata) => metadata?.tool_call === true,
    },
    {
        key: 'reasoning',
        icon: "brain-ai-3",
        label: 'Reasoning',
        isActive: (metadata) => metadata?.reasoning === true,
    },
];

interface ModalityIconDefinition {
    icon: IconComponent;
    label: string;
}

type ModalityIcon = {
    key: string;
    icon: IconComponent;
    label: string;
};

type ModelApplyResult = 'applied' | 'provider-missing' | 'model-missing';

const MODALITY_ICON_MAP: Record<string, ModalityIconDefinition> = {
    text: { icon: "text", label: 'Text' },
    image: { icon: "file-image", label: 'Image' },
    video: { icon: "file-video", label: 'Video' },
    audio: { icon: "file-music", label: 'Audio' },
    pdf: { icon: "file-pdf", label: 'PDF' },
};

const normalizeModality = (value: string) => value.trim().toLowerCase();

const getModalityIcons = (metadata: ModelMetadata | undefined, direction: 'input' | 'output'): ModalityIcon[] => {
    const modalityList = direction === 'input' ? metadata?.modalities?.input : metadata?.modalities?.output;
    if (!Array.isArray(modalityList) || modalityList.length === 0) {
        return [];
    }

    const uniqueValues = Array.from(new Set(modalityList.map((item) => normalizeModality(item))));

    const result: ModalityIcon[] = [];
    for (const modality of uniqueValues) {
        const definition = MODALITY_ICON_MAP[modality];
        if (!definition) {
            continue;
        }
        result.push({
            key: modality,
            icon: definition.icon,
            label: definition.label,
        });
    }
    return result;
};

const formatUsdCurrency = (value: number) => new Intl.NumberFormat(getCurrentIntlLocale(), {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
}).format(value);

const formatKnowledgeDate = (value: Date) => new Intl.DateTimeFormat(getCurrentIntlLocale(), { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(value);

const formatReleaseDate = (value: Date, timeZone?: string) => new Intl.DateTimeFormat(getCurrentIntlLocale(), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone,
}).format(value);


const IconBadge: React.FC<{ iconName: IconComponent; label: string }> = ({ iconName, label }) => (
    <span
        className="flex size-5 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground"
        title={label}
        aria-label={label}
        role="img"
    >
        <Icon name={iconName} className="size-3.5" />
    </span>
);


const formatTokens = (value?: number | null) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return '—';
    }

    if (value === 0) {
        return '0';
    }

    const formatted = formatCompactNumber(value);
    return formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted;
};

const formatCost = (value?: number | null) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '—';
    }

    return formatUsdCurrency(value);
};

const getCapabilityIcons = (metadata?: ModelMetadata) => {
    const result: { key: string; icon: IconComponent; label: string }[] = [];
    for (const definition of CAPABILITY_DEFINITIONS) {
        if (definition.isActive(metadata)) {
            result.push({ key: definition.key, icon: definition.icon, label: definition.label });
        }
    }
    return result;
};

const formatKnowledge = (knowledge?: string) => {
    if (!knowledge) {
        return '—';
    }

    const match = knowledge.match(/^(\d{4})-(\d{2})$/);
    if (match) {
        const year = Number.parseInt(match[1], 10);
        const monthIndex = Number.parseInt(match[2], 10) - 1;
        const knowledgeDate = new Date(Date.UTC(year, monthIndex, 1));
        if (!Number.isNaN(knowledgeDate.getTime())) {
            return formatKnowledgeDate(knowledgeDate);
        }
    }

    return knowledge;
};

const formatDate = (value?: string) => {
    if (!value) {
        return '—';
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
        return value;
    }

    return formatReleaseDate(parsedDate);
};

type ModelControlsProps = {
    className?: string;
    mobilePanel?: MobileControlsPanel;
    onMobilePanelChange?: (panel: MobileControlsPanel) => void;
    onRunInParallel?: () => void;
} & (
        | { selection?: never; sessionId?: never; agentSelectable?: never }
        | {
            selection: ComposerModelSelection;
            sessionId: string | null;
            /** Offers the agent picker and saves the pick for `sessionId` (a chat pinned in the side panel). */
            agentSelectable?: boolean;
        }
    );

export const ModelControls: React.FC<ModelControlsProps> = ({
    className,
    mobilePanel,
    onMobilePanelChange,
    onRunInParallel,
    selection,
    sessionId: controlledSessionId,
    agentSelectable = false,
}) => {
    const { t } = useI18n();
    const { focusInput: focusColumnInput } = useChatColumnActions();
    const currentSessionId = useSessionUIStore((s) => selection ? null : s.currentSessionId);
    const getDirectoryForSession = useSessionUIStore((s) => s.getDirectoryForSession);
    const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
    const currentSessionDirectory = (controlledSessionId ? getDirectoryForSession(controlledSessionId) : undefined)
        ?? (currentSessionId ? getDirectoryForSession(currentSessionId) : undefined)
        ?? currentDirectory;
    const { isReady, isUnavailable } = useCatalogReadiness('models', currentSessionDirectory);
    const { isReady: canSelectAgent } = useCatalogReadiness('agents', currentSessionDirectory);
    const readinessLabel = isUnavailable ? t('common.unavailable') : t('common.loading');
    const providers = useConfigStore((state) => state.providers);
    const agents = useAgentsStore((state) => selectAgentsForDirectory(state, currentSessionDirectory));
    const loadAgents = useAgentsStore((state) => state.loadAgents);
    React.useEffect(() => {
        void loadAgents(currentSessionDirectory);
    }, [currentSessionDirectory, loadAgents]);
    const currentProviderId = useConfigStore((state) => selection ? selection.model?.providerId ?? '' : state.currentProviderId);
    const currentModelId = useConfigStore((state) => selection ? selection.model?.modelId ?? '' : state.currentModelId);
    const effectiveCurrentVariant = useConfigStore((state) => state.currentVariant);
    const currentVariantSelection = useConfigStore((state) => state.currentVariantSelection);
    let currentVariant = currentVariantSelection.override === null
        ? undefined
        : currentVariantSelection.override ?? effectiveCurrentVariant;
    if (selection) currentVariant = selection.variant ?? undefined;
    const configuredCurrentReasoningEffort = useConfigStore((state) => state.currentReasoningEffort);
    const currentAgentName = useConfigStore((state) => selection ? selection.agent : state.currentAgentName);
    const settingsDefaultReasoningEffort = useConfigStore((state) => state.settingsDefaultReasoningEffort);
    const defaultsLoaded = useConfigStore((state) => state.settingsDefaultsLoaded);
    const agentsResolved = canSelectAgent;
    const providersResolved = useConfigStore((state) => state.providersLoaded);
    const modelSelectionReady = Boolean(currentModelId) || (selection ? isReady : defaultsLoaded && providersResolved);
    const setProvider = useConfigStore((state) => state.setProvider);
    const requestProviderConnect = useUIStore((state) => state.setSettingsProvidersConnectRequested);
    const setModel = useConfigStore((state) => state.setModel);
    const setCurrentVariant = useConfigStore((state) => state.setCurrentVariant);
    const setCurrentVariantOverride = useConfigStore((state) => state.setCurrentVariantOverride);
    const setCurrentReasoningEffort = useConfigStore((state) => state.setCurrentReasoningEffort);
    const setAgent = useConfigStore((state) => state.setAgent);
    const getCurrentProvider = useConfigStore((state) => state.getCurrentProvider);
    const getModelMetadata = useConfigStore((state) => state.getModelMetadata);
    const tracedReadyRef = React.useRef(false);

    React.useEffect(() => {
        if (selection || tracedReadyRef.current || !isReady) return;
        tracedReadyRef.current = true;
        markStartupTrace('ModelControls:ready', {
            providers: providers.length,
            agents: agents.length,
            currentProviderId,
            currentModelId,
            currentAgentName,
        });
    }, [agents.length, currentAgentName, currentModelId, currentProviderId, isReady, providers.length, selection]);

    // Controlled selections never restore from the main session or its history.
    const sync = useSync();

    const getSessionModelSelection = useSelectionStore((state) => state.getSessionModelSelection);
    const saveSessionModelSelection = useSelectionStore((state) => state.saveSessionModelSelection);
    const saveSessionAgentSelection = useSelectionStore((state) => state.saveSessionAgentSelection);
    const saveAgentModelForSession = useSelectionStore((state) => state.saveAgentModelForSession);
    const getAgentModelForSession = useSelectionStore((state) => state.getAgentModelForSession);
    const saveAgentModelVariantForSession = useSelectionStore((state) => state.saveAgentModelVariantForSession);
    const getAgentModelVariantForSession = useSelectionStore((state) => state.getAgentModelVariantForSession);
    const saveAgentModelReasoningEffortForSession = useSelectionStore((state) => state.saveAgentModelReasoningEffortForSession);
    const getAgentModelReasoningEffortForSession = useSelectionStore((state) => state.getAgentModelReasoningEffortForSession);

    const contextHydrated = useContextStore((state) => state.hasHydrated);

    const sessionSavedAgentName = useSelectionStore((state) =>
        currentSessionId ? state.sessionAgentSelections.get(currentSessionId) ?? null : null
    );

    const stickySessionAgentRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        if (!currentSessionId) {
            stickySessionAgentRef.current = null;
            return;
        }
        if (sessionSavedAgentName) {
            stickySessionAgentRef.current = sessionSavedAgentName;
        }
    }, [currentSessionId, sessionSavedAgentName]);

    const stickySessionAgentName = currentSessionId ? stickySessionAgentRef.current : null;

    const uiAgentName = currentSessionId
        ? (sessionSavedAgentName || stickySessionAgentName || currentAgentName)
        : currentAgentName;
    const effortAgentKey = uiAgentName ?? ROOT_SELECTION_AGENT;
    const savedReasoningEffort = currentSessionId
        ? getAgentModelReasoningEffortForSession(currentSessionId, effortAgentKey, currentProviderId, currentModelId)
        : undefined;
    const currentCatalogModel = providers
        .find((provider) => provider.providerId === currentProviderId)?.models
        .find((model) => model.modelId === currentModelId);
    // One derivation for the desktop panel, the phone's button and the picker's
    // arrow keys: real effort options first, the same `off` entry they all show.
    const effortOptions = React.useMemo(() => getReasoningEffortLevels(currentCatalogModel), [currentCatalogModel]);
    // OMP's configured default is what an untouched draft runs at. `auto` stays
    // off the wire: the worker resolves it, so the send carries no effort. A
    // model's own default wins, because that is the level OMP resolves for it.
    const ompDefaultReasoningEffort = currentCatalogModel?.defaultReasoningEffort
        ?? (settingsDefaultReasoningEffort
            && (settingsDefaultReasoningEffort === 'auto' || effortOptions.includes(settingsDefaultReasoningEffort))
            ? settingsDefaultReasoningEffort
            : undefined);
    // The native transcript's last thinking-level entry is the session's stored level.
    const persistedThinkingLevel = useDirectorySync(
        React.useCallback((state) => (
            currentSessionId ? state.snapshot[currentSessionId]?.selection?.thinkingLevel : undefined
        ), [currentSessionId]),
        currentSessionDirectory ?? undefined,
    );
    const nativeReasoningEffort = persistedThinkingLevel
        && (persistedThinkingLevel === 'auto' || effortOptions.includes(persistedThinkingLevel))
        ? persistedThinkingLevel
        : undefined;
    const selectedReasoningEffort = selection
        ? selection.reasoningEffort ?? ompDefaultReasoningEffort ?? 'off'
        : currentSessionId
            ? savedReasoningEffort ?? nativeReasoningEffort ?? ompDefaultReasoningEffort ?? 'off'
            : configuredCurrentReasoningEffort ?? ompDefaultReasoningEffort ?? 'off';

    const toggleFavoriteModel = useUIStore((state) => state.toggleFavoriteModel);
    const reorderFavoriteModel = useUIStore((state) => state.reorderFavoriteModel);
    const providerOrder = useUIStore((state) => state.providerOrder);
    const setProviderOrder = useUIStore((state) => state.setProviderOrder);
    const isFavoriteModel = useUIStore((state) => state.isFavoriteModel);
    const addRecentModel = useUIStore((state) => state.addRecentModel);
    const setLastSelectedModel = useUIStore((state) => state.setLastSelectedModel);
    const globalModelSelectorOpen = useUIStore((state) => !selection && state.isModelSelectorOpen);
    const [localModelSelectorOpen, setLocalModelSelectorOpen] = React.useState(false);
    const isModelSelectorOpen = selection ? localModelSelectorOpen : globalModelSelectorOpen;
    const setModelSelectorOpen = useUIStore((state) => state.setModelSelectorOpen);
    const setSettingsDialogOpen = useUIStore((state) => state.setSettingsDialogOpen);
    const setSettingsPage = useUIStore((state) => state.setSettingsPage);
    const hiddenModels = useUIStore((state) => state.hiddenModels);
    const cycleAgentShortcutOverride = useUIStore((state) => state.shortcutOverrides.cycle_agent);
    const cycleAgentShortcut = React.useMemo(() => (
        getEffectiveShortcutCombo('cycle_agent', cycleAgentShortcutOverride ? { cycle_agent: cycleAgentShortcutOverride } : undefined)
    ), [cycleAgentShortcutOverride]);

    // Separate state for agent selector to avoid conflict with model selector
    const { favoriteModelsList, recentModelsList } = useModelLists();
    // Auto routing: the server resolves `openchamber/auto` into a real model per
    // send. Offered only while the server says it can honour it, in the main
    // composer and in controlled selections (BTW) alike.
    const autoReady = useRoutingStore(selectAutoReady);
    const autoEntry = React.useMemo<ModelPickerEntry | null>(() => (autoReady
        ? { providerId: AUTO_PROVIDER_ID, modelId: AUTO_MODEL_ID, model: { modelId: AUTO_MODEL_ID, provider: AUTO_PROVIDER_ID, name: t('chat.modelControls.autoModel'), modalities: ['text'], contextWindow: 1, maxOutputTokens: 1, reasoningEffortSupported: false, reasoningOptions: [], variants: [], pricing: null } }
        : null), [autoReady, t]);
    const isAutoSelected = isAutoModel(currentProviderId, currentModelId);
    const modelUnavailable = useModelMissingFromCatalog(catalogDirectory, currentProviderId, currentModelId);

    const { isMobile: deviceIsMobile } = useDeviceInfo();
    const uiIsMobile = useUIStore((state) => state.isMobile);
    const isMobile = deviceIsMobile || uiIsMobile;
    const isDesktop = React.useMemo(() => isDesktopShell(), []);
    const isCompact = isMobile;
    const [localMobilePanel, setLocalMobilePanel] = React.useState<MobileControlsPanel>(null);
    const usingExternalMobilePanel = mobilePanel !== undefined && typeof onMobilePanelChange === 'function';
    const activeMobilePanel = usingExternalMobilePanel ? mobilePanel : localMobilePanel;
    const setActiveMobilePanel = usingExternalMobilePanel ? onMobilePanelChange : setLocalMobilePanel;
    const [mobileTooltipOpen, setMobileTooltipOpen] = React.useState<'model' | 'agent' | null>(null);
    const [mobileModelQuery, setMobileModelQuery] = React.useState('');
    const [expandedMobileModelKey, setExpandedMobileModelKey] = React.useState<string | null>(null);
    const [mobileVariantTarget, setMobileVariantTarget] = React.useState<MobileVariantTarget | null>(null);
    const closeMobilePanel = React.useCallback(() => setActiveMobilePanel(null), [setActiveMobilePanel]);
    const closeMobileTooltip = React.useCallback(() => setMobileTooltipOpen(null), []);
    const longPressTimerRef = React.useRef<NodeJS.Timeout | undefined>(undefined);
    const [expandedMobileProviders, setExpandedMobileProviders] = React.useState<Set<string>>(() => {
        const initial = new Set<string>();
        if (currentProviderId) {
            initial.add(currentProviderId);
        }
        return initial;
    });
    // Use global state for model selector (allows Ctrl+M shortcut)
    const agentMenuOpen = isModelSelectorOpen;
    const setAgentMenuOpen = selection ? setLocalModelSelectorOpen : setModelSelectorOpen;
    const openAddProviderSettings = React.useCallback(() => {
        requestProviderConnect(true);
        setSettingsPage('providers');
        setSettingsDialogOpen(true);
        setAgentMenuOpen(false);
        closeMobilePanel();
    }, [requestProviderConnect, setSettingsPage, setSettingsDialogOpen, setAgentMenuOpen, closeMobilePanel]);
    const [desktopModelQuery, setDesktopModelQuery] = React.useState('');
    const keyboardOwnsModelSelectionRef = React.useRef(false);
    const lastModelPointerPositionRef = React.useRef<{ x: number; y: number } | null>(null);
    const activeModelPickerEntryRef = React.useRef<ModelPickerEntry | undefined>(undefined);

    React.useEffect(() => {
        if (activeMobilePanel === 'model') {
            setExpandedMobileProviders(() => {
                const initial = new Set<string>();
                if (currentProviderId) {
                    initial.add(currentProviderId);
                }
                return initial;
            });
        }
    }, [activeMobilePanel, currentProviderId]);

    React.useEffect(() => {
        if (activeMobilePanel === null) {
            setExpandedMobileModelKey(null);
        }
        if (activeMobilePanel !== 'variant') {
            setMobileVariantTarget(null);
        }
    }, [activeMobilePanel]);

    React.useEffect(() => {
        if (activeMobilePanel !== 'model') {
            setMobileModelQuery('');
            setExpandedMobileModelKey(null);
        }
    }, [activeMobilePanel]);

    const prevModelSelectorOpenRef = React.useRef(isModelSelectorOpen);
    React.useEffect(() => {
        const wasOpen = prevModelSelectorOpenRef.current;
        prevModelSelectorOpenRef.current = isModelSelectorOpen;

        if (!isModelSelectorOpen) {
            setDesktopModelQuery('');
            keyboardOwnsModelSelectionRef.current = false;
            lastModelPointerPositionRef.current = null;

            if (wasOpen && !isCompact) {
                requestAnimationFrame(focusColumnInput);
            }
        }
    }, [focusColumnInput, isModelSelectorOpen, isCompact]);

    // Handle agent selector close behavior



    const buttonHeight = isMobile ? 'h-9' : 'h-8';
    const controlIconSize = isMobile ? 'size-5' : 'size-4';
    const providerLogoSize = isMobile ? 'size-[21px]' : 'size-[17px]';
    const controlTextSize = isCompact ? 'typography-micro' : 'typography-meta';
    const inlineGapClass = isMobile ? 'gap-x-1' : 'gap-x-3';

    const currentProvider = selection ? providers.find((provider) => provider.providerId === currentProviderId) : getCurrentProvider();
    const models = Array.isArray(currentProvider?.models) ? currentProvider.models : [];

    const visibleProviders = React.useMemo(() => {
        const result: typeof providers = [];
        for (const provider of providers) {
            const providerModels = Array.isArray(provider.models) ? provider.models : [];
            const visibleModels = providerModels.filter((model: ProviderModel) => {
                const modelId = model.modelId;
                return !hiddenModels.some(
                    (item) => item.providerID === provider.providerId && item.modelID === modelId
                );
            });
            if (visibleModels.length > 0) {
                result.push({ ...provider, models: visibleModels });
            }
        }
        return result;
    }, [providers, hiddenModels]);

    const matchesModelSearch = React.useCallback(
        (candidate: string, query: string) => matchesRankQuery([candidate], query),
        [],
    );

    const currentModelForMetadata = currentModelId
        ? models.find((model: ProviderModel) => model.modelId === currentModelId)
        : undefined;
    const knownCurrentModel = useConfigStore((state) => (
        currentModelForMetadata ? undefined : selectKnownCatalogModel(state, currentProviderId, currentModelId)
    ));
    const displayCurrentModel = currentModelForMetadata ?? knownCurrentModel;
    const currentMetadata = currentProviderId && currentModelId && currentModelForMetadata
        ? mergeModelMetadataWithLiveModel(currentProviderId, currentModelForMetadata, getModelMetadata(currentProviderId, currentModelId))
        : currentProviderId && currentModelId
            ? getModelMetadata(currentProviderId, currentModelId)
            : undefined;
    const capabilityMetadata = React.useMemo(() => (currentMetadata && currentModelForMetadata
        ? { ...currentMetadata, reasoning: currentModelForMetadata.reasoningEffortSupported || currentModelForMetadata.reasoningOptions.length > 0 }
        : currentMetadata), [currentMetadata, currentModelForMetadata]);
    const localizeMetaLabel = React.useCallback((label: string) => {
        if (label === 'Tool calling') return t('chat.modelControls.capability.toolCalling');
        if (label === 'Reasoning') return t('chat.modelControls.capability.reasoning');
        if (label === 'Text') return t('chat.modelControls.modality.text');
        if (label === 'Image') return t('chat.modelControls.modality.image');
        if (label === 'Video') return t('chat.modelControls.modality.video');
        if (label === 'Audio') return t('chat.modelControls.modality.audio');
        if (label === 'PDF') return t('chat.modelControls.modality.pdf');
        return label;
    }, [t]);

    const currentCapabilityIcons = React.useMemo(
        () => getCapabilityIcons(capabilityMetadata).map((icon) => ({ ...icon, label: localizeMetaLabel(icon.label) })),
        [capabilityMetadata, localizeMetaLabel],
    );
    const inputModalityIcons = React.useMemo(
        () => getModalityIcons(currentMetadata, 'input').map((icon) => ({ ...icon, label: localizeMetaLabel(icon.label) })),
        [currentMetadata, localizeMetaLabel],
    );
    const outputModalityIcons = React.useMemo(
        () => getModalityIcons(currentMetadata, 'output').map((icon) => ({ ...icon, label: localizeMetaLabel(icon.label) })),
        [currentMetadata, localizeMetaLabel],
    );

    const hasEfforts = effortOptions.length > 0;
    const routeOptions = currentCatalogModel?.variants ?? [];
    const hasVariants = routeOptions.length > 0;

    const costRows = [
        { label: 'Input', value: formatCost(currentMetadata?.cost?.input) },
        { label: 'Output', value: formatCost(currentMetadata?.cost?.output) },
        { label: 'Cache read', value: formatCost(currentMetadata?.cost?.cache_read) },
        { label: 'Cache write', value: formatCost(currentMetadata?.cost?.cache_write) },
    ];

    const limitRows = [
        { label: 'Context', value: formatTokens(currentModelForMetadata?.contextWindow) },
        { label: 'Output', value: formatTokens(currentModelForMetadata?.maxOutputTokens) },
    ];

    const prevAgentNameRef = React.useRef<string | undefined>(undefined);
    const latestLoadedUserChoiceRestoreRef = React.useRef<string | null>(null);
    const restoredSessionSelectionRef = React.useRef<string | null>(null);

    const hasRenderableCurrentSessionSnapshot = useSessionRenderable(
        currentSessionId ?? '',
        currentSessionDirectory ?? undefined,
    );
    // A sent choice may restore the composer after its transcript is loaded.
    // Canonical sessions do not carry a separate legacy agent-selection record.
    const sessionRecordChoice = useSessionSelector(
        currentSessionId ?? undefined,
        currentSessionDirectory ?? undefined,
        extractSessionRecordModelChoice,
        areModelChoicesEqual,
    );
    const latestReplyChoice = useSessionMessagesSelector(
        currentSessionId ?? '',
        currentSessionDirectory ?? undefined,
        selectLatestReplyModelChoice,
        areModelChoicesEqual,
    );
    const latestLoadedUserChoice = React.useMemo(() => {
        if (selection) return null;
        return sessionRecordChoice ?? latestReplyChoice;
    }, [latestReplyChoice, selection, sessionRecordChoice]);

    const tryApplyModelSelection = React.useCallback(
        (providerId: string, modelId: string, agentName?: string): ModelApplyResult => {
            if (selection) {
                if (controlledSessionId) {
                    saveSessionModelSelection(controlledSessionId, providerId, modelId);
                    if (selection.agent) saveAgentModelForSession(controlledSessionId, selection.agent, providerId, modelId);
                }
                return 'applied';
            }
            if (!providerId || !modelId) {
                return 'model-missing';
            }

            const isAuto = isAutoModel(providerId, modelId);
            if (isAuto && !selectAutoReady(useRoutingStore.getState())) {
                return 'provider-missing';
            }
            const provider = providers.find(p => p.providerId === providerId);
            if (!provider && !isAuto) {
                return 'provider-missing';
            }

            const providerModels = Array.isArray(provider?.models) ? provider.models : [];
            const modelExists = isAuto || providerModels.find((m: ProviderModel) => m.modelId === modelId);
            if (!modelExists) {
                return 'model-missing';
            }

            const providerMatches = currentProviderId === providerId;
            const modelMatches = currentModelId === modelId;
            if (providerMatches && modelMatches) {
                return 'applied';
            }

            setProvider(providerId);
            setModel(modelId);

            if (currentSessionId) {
                saveSessionModelSelection(currentSessionId, providerId, modelId);
                if (agentName) {
                    saveAgentModelForSession(currentSessionId, agentName, providerId, modelId);
                }
            }

            return 'applied';
        },
        [providers, currentProviderId, currentModelId, setProvider, setModel, currentSessionId, saveAgentModelForSession, saveSessionModelSelection, controlledSessionId, selection],
    );

    const getModelReasoningOptions = React.useCallback((providerId: string, modelId: string) => {
        const model = providers.find((entry) => entry.providerId === providerId)?.models.find((entry) => entry.modelId === modelId);
        return getReasoningEffortLevels(model);
    }, [providers]);
    const getModelVariantOptions = React.useCallback((providerId: string, modelId: string) => {
        const provider = providers.find((entry) => entry.providerId === providerId);
        const model = provider?.models.find((entry) => entry.modelId === modelId);
        return model?.variants.map((entry) => entry.variant) ?? [];
    }, [providers]);

    const resolveInheritedVariantForModel = React.useCallback((providerId: string, modelId: string) => {
        const variantOptions = getModelVariantOptions(providerId, modelId);
        if (variantOptions.length === 0) return undefined;

        let currentInherited: string | undefined;
        if (currentProviderId === providerId && currentModelId === modelId) {
            currentInherited = currentVariantSelection.inherited
                ?? (currentVariantSelection.override === null || currentVariantSelection.override === undefined
                    ? effectiveCurrentVariant
                    : undefined);
        }

        return currentInherited !== undefined && variantOptions.includes(currentInherited)
            ? currentInherited
            : undefined;
    }, [currentModelId, currentProviderId, currentVariantSelection, effectiveCurrentVariant, getModelVariantOptions]);

    /**
     * The session's recorded choice for this model, in the selection store's
     * three states: a route name, `null` for an explicit "Default", and
     * `undefined` for no choice at all. Collapsing `null` into `undefined` here
     * would hand a real "Default" back to the callers as "nothing chosen", and
     * they would re-record it as a choice on the next write.
     */
    const resolveModelVariantSelection = React.useCallback((providerId: string, modelId: string): string | null | undefined => {
        const variantOptions = getModelVariantOptions(providerId, modelId);
        if (variantOptions.length === 0) {
            return undefined;
        }

        const effectiveAgentName = uiAgentName || currentAgentName;
        const selectionSessionId = selection ? controlledSessionId : currentSessionId;
        if (selectionSessionId && effectiveAgentName) {
            const savedVariant = getAgentModelVariantForSession(selectionSessionId, effectiveAgentName, providerId, modelId);
            if (savedVariant === null) {
                return null;
            }
            if (savedVariant && variantOptions.includes(savedVariant)) {
                return savedVariant;
            }
        }

        if (currentProviderId === providerId && currentModelId === modelId && currentVariant && variantOptions.includes(currentVariant)) {
            return currentVariant;
        }

        return undefined;
    }, [
        currentAgentName,
        currentModelId,
        currentProviderId,
        currentSessionId,
        currentVariant,
        getAgentModelVariantForSession,
        getModelVariantOptions,
        uiAgentName,
        controlledSessionId,
        selection,
    ]);

    const resolveLiveAgentName = React.useCallback(() => {
        if (selection) return selection.agent;
        const liveConfigAgentName = useConfigStore.getState().currentAgentName;
        if (currentSessionId) {
            return useSelectionStore.getState().getSessionAgentSelection(currentSessionId)
                || stickySessionAgentRef.current
                || liveConfigAgentName
                || currentAgentName;
        }
        return liveConfigAgentName || currentAgentName;
    }, [currentAgentName, currentSessionId, selection]);

    /**
     * Records the route selection independently of reasoning effort. `null`
     * explicitly chooses Default; `undefined` leaves the inherited route in place.
     */
    const commitVariantSelectionForModel = React.useCallback((providerId: string, modelId: string, variant: string | null | undefined, agentNameOverride?: string | null) => {
        if (selection) {
            if (controlledSessionId && selection.agent) {
                saveAgentModelVariantForSession(controlledSessionId, selection.agent, providerId, modelId, variant);
            }
            return;
        }
        const variantOptions = getModelVariantOptions(providerId, modelId);
        if (variantOptions.length === 0) {
            setCurrentVariant(undefined);
            return;
        }

        setCurrentVariantOverride(
            variant,
            resolveInheritedVariantForModel(providerId, modelId),
        );

        const effectiveAgentName = agentNameOverride ?? resolveLiveAgentName();
        if (currentSessionId && effectiveAgentName) {
            saveAgentModelVariantForSession(currentSessionId, effectiveAgentName, providerId, modelId, variant);
        }
    }, [
        currentSessionId,
        getModelVariantOptions,
        resolveInheritedVariantForModel,
        resolveLiveAgentName,
        saveAgentModelVariantForSession,
        setCurrentVariant,
        setCurrentVariantOverride,
        controlledSessionId,
        selection,
    ]);

    const applyModelSelectionWithVariant = React.useCallback((providerId: string, modelId: string, variant: string | null | undefined, agentNameOverride?: string | null) => {
        const effectiveAgentName = agentNameOverride ?? resolveLiveAgentName() ?? undefined;
        const result = tryApplyModelSelection(providerId, modelId, effectiveAgentName);
        if (result !== 'applied') {
            return result;
        }

        if (!selection) addRecentModel(providerId, modelId);
        commitVariantSelectionForModel(providerId, modelId, variant, effectiveAgentName);
        return 'applied';
    }, [addRecentModel, commitVariantSelectionForModel, resolveLiveAgentName, tryApplyModelSelection, selection]);


    React.useEffect(() => {
        if (!currentSessionId) {
            latestLoadedUserChoiceRestoreRef.current = null;
            return;
        }

        const snapshotReady = hasRenderableCurrentSessionSnapshot || Boolean(sessionRecordChoice);
        if (!contextHydrated || providers.length === 0 || !snapshotReady || !latestLoadedUserChoice?.providerId || !latestLoadedUserChoice.modelId) {
            return;
        }

        const restoreKey = [
            currentSessionId,
            latestLoadedUserChoice.id,
            latestLoadedUserChoice.agent ?? '',
            latestLoadedUserChoice.providerId,
            latestLoadedUserChoice.modelId,
            latestLoadedUserChoice.variant ?? '',
        ].join('|');

        if (latestLoadedUserChoiceRestoreRef.current === restoreKey) {
            return;
        }

        const restoreAgentName = latestLoadedUserChoice.agent || resolveLiveAgentName() || undefined;

        const recordModelKey = sessionRecordChoice && latestLoadedUserChoice === sessionRecordChoice
            ? `${formatModelRef(sessionRecordChoice)}#${sessionRecordChoice.variant ?? ''}`
            : null;
        const recordModelSwitched = recordModelKey !== null
            && useSelectionStore.getState().isSessionModelSwitched(currentSessionId, recordModelKey);
        const markRecordModelFollowed = () => {
            if (recordModelKey) useSelectionStore.getState().markSessionModelFollowed(currentSessionId, recordModelKey);
        };

        const savedSessionModel = getSessionModelSelection(currentSessionId);
        const savedAuto = Boolean(savedSessionModel) && isAutoModel(savedSessionModel!.providerId, savedSessionModel!.modelId);
        if (savedAuto && isStaleAutoSelection(savedSessionModel!.providerId, savedSessionModel!.modelId)) {
            useConfigStore.getState().dropStaleAutoSelection();
        } else if (savedAuto) {
            if (!autoReady) return;
            tryApplyModelSelection(AUTO_PROVIDER_ID, AUTO_MODEL_ID, restoreAgentName);
            markRecordModelFollowed();
            latestLoadedUserChoiceRestoreRef.current = restoreKey;
            return;
        } else if (!recordModelSwitched && shouldPreserveManualModelOverride({
            selectionSource: useConfigStore.getState().selectionSource,
            savedSessionModel,
            candidate: latestLoadedUserChoice,
        })) {
            if (savedSessionModel) {
                applyModelSelectionWithVariant(
                    savedSessionModel.providerId,
                    savedSessionModel.modelId,
                    resolveModelVariantSelection(savedSessionModel.providerId, savedSessionModel.modelId),
                    restoreAgentName,
                );
            }
            markRecordModelFollowed();
            latestLoadedUserChoiceRestoreRef.current = restoreKey;
            return;
        }

        if (restoreAgentName && useConfigStore.getState().currentAgentName !== restoreAgentName) {
            setAgent(restoreAgentName);
        }

        const historicalVariant = latestLoadedUserChoice.variant
            && getModelVariantOptions(latestLoadedUserChoice.providerId, latestLoadedUserChoice.modelId).includes(latestLoadedUserChoice.variant)
            ? latestLoadedUserChoice.variant
            : undefined;
        const savedVariant = currentSessionId && restoreAgentName
            ? getAgentModelVariantForSession(
                currentSessionId,
                restoreAgentName,
                latestLoadedUserChoice.providerId,
                latestLoadedUserChoice.modelId,
            )
            : undefined;
        let restoredVariant: string | null | undefined = savedVariant !== undefined ? savedVariant : historicalVariant;
        if (recordModelSwitched && historicalVariant) restoredVariant = historicalVariant;
        const applyResult = applyModelSelectionWithVariant(
            latestLoadedUserChoice.providerId,
            latestLoadedUserChoice.modelId,
            restoredVariant,
            restoreAgentName,
        );
        if (applyResult !== 'applied') {
            return;
        }

        if (latestLoadedUserChoice.agent) {
            saveSessionAgentSelection(currentSessionId, latestLoadedUserChoice.agent);
        }
        saveSessionModelSelection(currentSessionId, latestLoadedUserChoice.providerId, latestLoadedUserChoice.modelId);
        markRecordModelFollowed();
        latestLoadedUserChoiceRestoreRef.current = restoreKey;
        restoredSessionSelectionRef.current = currentSessionId;

    }, [
        currentSessionId,
        currentAgentName,
        contextHydrated,
        providers,
        hasRenderableCurrentSessionSnapshot,
        latestLoadedUserChoice,
        sessionRecordChoice,
        autoReady,
        resolveLiveAgentName,
        setAgent,
        applyModelSelectionWithVariant,
        tryApplyModelSelection,
        getAgentModelVariantForSession,
        getModelVariantOptions,
        getSessionModelSelection,
        resolveModelVariantSelection,
        saveSessionAgentSelection,
        saveSessionModelSelection,
    ]);

    React.useEffect(() => {
        if (!currentSessionId) {
            latestLoadedUserChoiceRestoreRef.current = null;
            restoredSessionSelectionRef.current = null;
            return;
        }

        if (restoredSessionSelectionRef.current === currentSessionId) {
            return;
        }

        if (!contextHydrated || !providersResolved || !agentsResolved) {
            return;
        }

        const applySavedSelections = (): 'resolved' | 'waiting' | 'continue' => {
            const savedSessionModel = getSessionModelSelection(currentSessionId);
            const savedAgentName = currentSessionId
                ? useSelectionStore.getState().getSessionAgentSelection(currentSessionId)
                : null;
            if (savedAgentName) {
                const savedModel = getAgentModelForSession(currentSessionId, savedAgentName);
                if (savedModel) {
                    const result = tryApplyModelSelection(savedModel.providerId, savedModel.modelId, savedAgentName);
                    if (result === 'applied') {
                        if (currentAgentName !== savedAgentName) {
                            setAgent(savedAgentName, { keepModel: true });
                        }
                        return 'resolved';
                    }
                    if (result === 'provider-missing') {
                        return 'waiting';
                    }
                } else {
                    const savedAgent = agents.find((agent) => agent.agentId === savedAgentName);
                    if (currentAgentName !== savedAgentName) {
                        setAgent(savedAgentName);
                    }
                    if (savedAgent?.model) {
                        return 'resolved';
                    }
                }
            }

            if (savedSessionModel && !isStaleAutoSelection(savedSessionModel.providerId, savedSessionModel.modelId)) {
                const result = tryApplyModelSelection(savedSessionModel.providerId, savedSessionModel.modelId, savedAgentName ?? undefined);
                if (result === 'applied') {
                    if (savedAgentName && currentAgentName !== savedAgentName) {
                        setAgent(savedAgentName, { keepModel: true });
                    }
                    return 'resolved';
                }
                return 'waiting';
            }

            for (const agent of agents) {
                const selection = getAgentModelForSession(currentSessionId, agent.agentId);
                if (!selection) {
                    continue;
                }

                const result = tryApplyModelSelection(selection.providerId, selection.modelId, agent.agentId);
                if (result === 'applied') {
                    if (currentAgentName !== agent.agentId) {
                        setAgent(agent.agentId, { keepModel: true });
                    }
                    const existingSelection = useSelectionStore.getState().getSessionAgentSelection(currentSessionId) || stickySessionAgentRef.current;
                    if (!existingSelection) {
                        saveSessionAgentSelection(currentSessionId, agent.agentId);
                    }
                    return 'resolved';
                }
                return 'waiting';
            }

            return 'continue';
        };

        const applyFallbackAgent = () => {
            if (agents.length === 0) {
                return;
            }

            const existingSelection = currentSessionId
                ? (useSelectionStore.getState().getSessionAgentSelection(currentSessionId) || stickySessionAgentRef.current)
                : null;

            const preferred =
                (currentSessionId
                    ? (useSelectionStore.getState().getSessionAgentSelection(currentSessionId) || stickySessionAgentRef.current)
                    : null) ||
                currentAgentName;
            if (preferred && agents.some((agent) => agent.agentId === preferred)) {
                if (currentAgentName !== preferred) {
                    setAgent(preferred);
                }
                return;
            }

            const fallbackAgent = agents[0];
            if (!fallbackAgent) {
                return;
            }

            if (!existingSelection) {
                saveSessionAgentSelection(currentSessionId, fallbackAgent.agentId);
            }

            if (currentAgentName !== fallbackAgent.agentId) {
                setAgent(fallbackAgent.agentId);
            }

            if (fallbackAgent.model) {
                tryApplyModelSelection(fallbackAgent.model.providerId, fallbackAgent.model.modelId, fallbackAgent.agentId);
            }
        };

        const savedOutcome = applySavedSelections();
        if (savedOutcome === 'resolved') {
            restoredSessionSelectionRef.current = currentSessionId;
            return;
        }
        if (savedOutcome === 'waiting') {
            return;
        }

        if (!hasRenderableCurrentSessionSnapshot) {
            const sessionDirectory = currentSessionDirectory ?? undefined;
            if (!sync.isLoading(currentSessionId, sessionDirectory)) {
                void sync.ensureSessionRenderable(currentSessionId, false, sessionDirectory);
            }
            return;
        }

        if (latestLoadedUserChoice) {
            return;
        }

        applyFallbackAgent();
        restoredSessionSelectionRef.current = currentSessionId;
    }, [
        currentSessionId,
        currentSessionDirectory,
        hasRenderableCurrentSessionSnapshot,
        latestLoadedUserChoice,
        agents,
        agentsResolved,
        providersResolved,
        currentAgentName,
        getSessionModelSelection,
        getAgentModelForSession,
        setAgent,
        tryApplyModelSelection,
        saveSessionAgentSelection,
        contextHydrated,
        providers,
        sync,
    ]);

    React.useEffect(() => {
        if (selection || !contextHydrated) {
            return;
        }
        const abortController = new AbortController();

        const handleAgentSwitch = async () => {
            try {
                if (currentAgentName !== prevAgentNameRef.current) {
                    prevAgentNameRef.current = currentAgentName;

                    if (currentAgentName && currentSessionId) {
                        await new Promise<void>((resolve) => {
                            const timer = setTimeout(resolve, 50);
                            abortController.signal.addEventListener('abort', () => {
                                clearTimeout(timer);
                                resolve();
                            });
                        });

                        if (abortController.signal.aborted) {
                            return;
                        }

                        const persistedChoice = getAgentModelForSession(currentSessionId, currentAgentName);

                        if (persistedChoice) {
                            const result = tryApplyModelSelection(
                                persistedChoice.providerId,
                                persistedChoice.modelId,
                                currentAgentName,
                            );
                            if (result === 'applied' || result === 'provider-missing') {
                                return;
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('[ModelControls] Agent change error:', error);
            }
        };

        handleAgentSwitch();

        return () => {
            abortController.abort();
        };
    }, [
        currentAgentName,
        currentSessionId,
        getAgentModelForSession,
        tryApplyModelSelection,
        contextHydrated,
        selection,
    ]);

    React.useEffect(() => {
        if (selection || !isReady || !currentCatalogModel || !currentProviderId || !currentModelId || !contextHydrated) return;
        // A selection the new model cannot run is cleared, not rewritten to
        // `off`: clearing returns the composer to OMP's default, while `off`
        // would be an explicit choice the user never made.
        if (configuredCurrentReasoningEffort !== undefined
            && (effortOptions.length === 0 || !effortOptions.includes(configuredCurrentReasoningEffort))) {
            setCurrentReasoningEffort(undefined);
        }
    }, [configuredCurrentReasoningEffort, contextHydrated, currentCatalogModel, currentModelId, currentProviderId, effortOptions, isReady, selection, setCurrentReasoningEffort]);


    const handleVariantSelect = React.useCallback((variant: string | undefined, providerId = currentProviderId, modelId = currentModelId) => {
        if (!providerId || !modelId) return;
        const route = providers.find((provider) => provider.providerId === providerId)?.models.find((model) => model.modelId === modelId)?.variants.find((option) => option.variant === variant);
        const effort = route?.reasoningEffort;
        if (selection) {
            if (!controlledSessionId || !selection.agent) return;
            commitVariantSelectionForModel(providerId, modelId, variant ?? null);
            saveAgentModelReasoningEffortForSession(controlledSessionId, selection.agent ?? ROOT_SELECTION_AGENT, providerId, modelId, effort ?? 'off');
            return;
        }
        commitVariantSelectionForModel(providerId, modelId, variant ?? null);
        setCurrentReasoningEffort(effort ?? 'off');
        const agentName = resolveLiveAgentName();
        if (currentSessionId) saveAgentModelReasoningEffortForSession(currentSessionId, agentName ?? ROOT_SELECTION_AGENT, providerId, modelId, effort ?? 'off');
    }, [commitVariantSelectionForModel, currentModelId, currentProviderId, currentSessionId, providers, resolveLiveAgentName, saveAgentModelReasoningEffortForSession, selection, setCurrentReasoningEffort, controlledSessionId]);

    const handleAgentChange = React.useCallback((agentName: string, options?: { closeModelSelector?: boolean }) => {
        if (selection) {
            if (!agentSelectable || !controlledSessionId) return;
            // The pick belongs to the controlled session only; the app-wide
            // agent stays the main chat's.
            saveSessionAgentSelection(controlledSessionId, agentName);
            const profile = agents.find((agent) => agent.agentId === agentName);
            const model = getAgentModelForSession(controlledSessionId, agentName) ?? profile?.model;
            if (model) {
                saveSessionModelSelection(controlledSessionId, model.providerId, model.modelId);
            }
            if (options?.closeModelSelector ?? true) {
                setAgentMenuOpen(false);
            }
            return;
        }
        try {
            setAgent(agentName);
            if (options?.closeModelSelector ?? true) {
                setAgentMenuOpen(false);
            }

            if (currentSessionId) {
                saveSessionAgentSelection(currentSessionId, agentName);
            }
            if (isCompact) {
                closeMobilePanel();
            }
        } catch (error) {
            console.error('[ModelControls] Handle agent change error:', error);
        }
    }, [
        agentSelectable,
        agents,
        getAgentModelForSession,
        saveSessionModelSelection,
        closeMobilePanel,
        controlledSessionId,
        currentSessionId,
        isCompact,
        saveSessionAgentSelection,
        setAgent,
        setAgentMenuOpen,
        selection,
    ]);

    const handleCycleAgentFromModelPicker = React.useCallback((direction: 1 | -1) => {
        if (isAutoSelected) return;
        const nextAgentName = getCycledAgentId(agents, currentAgentName, direction, useUIStore.getState().favoriteAgents);
        if (!nextAgentName) {
            return;
        }
        handleAgentChange(nextAgentName, { closeModelSelector: false });
    }, [agents, currentAgentName, handleAgentChange, isAutoSelected]);

    const getCycleAgentDirectionFromEvent = React.useCallback((event: KeyboardEvent | React.KeyboardEvent): 1 | -1 | null => {
        if (selection) return null;
        const cycleAgentBackwardShortcut = cycleAgentShortcut && !cycleAgentShortcut.includes('shift')
            ? normalizeCombo(`shift+${cycleAgentShortcut}`)
            : '';

        if (cycleAgentBackwardShortcut && eventMatchesShortcut(event, cycleAgentBackwardShortcut)) {
            return -1;
        }

        if (eventMatchesShortcut(event, cycleAgentShortcut)) {
            return 1;
        }

        return null;
    }, [cycleAgentShortcut, selection]);

    const handleEffortSelect = React.useCallback((effort: string, providerId = currentProviderId, modelId = currentModelId) => {
        const targetModel = providers.find((provider) => provider.providerId === providerId)?.models.find((model) => model.modelId === modelId);
        if (!getReasoningEffortLevels(targetModel).includes(effort)) return;
        if (providerId !== currentProviderId || modelId !== currentModelId) {
            if (tryApplyModelSelection(providerId, modelId) !== 'applied') return;
        }
        if (!selection) {
            setCurrentReasoningEffort(effort);
            setCurrentVariantOverride(null, resolveInheritedVariantForModel(providerId, modelId));
        }
        const sessionId = selection ? controlledSessionId : currentSessionId;
        const agentId = selection?.agent ?? resolveLiveAgentName() ?? ROOT_SELECTION_AGENT;
        if (sessionId) {
            saveAgentModelVariantForSession(sessionId, agentId, providerId, modelId, null);
            saveAgentModelReasoningEffortForSession(sessionId, agentId, providerId, modelId, effort);
        }
    }, [controlledSessionId, currentModelId, currentProviderId, currentSessionId, providers, resolveInheritedVariantForModel, resolveLiveAgentName, saveAgentModelReasoningEffortForSession, saveAgentModelVariantForSession, selection, setCurrentReasoningEffort, setCurrentVariantOverride, tryApplyModelSelection]);

    const renderEffortSelector = () => {
        if (!isReady || !hasEfforts || isAutoSelected) return null;
        const selected = selectedReasoningEffort || 'off';
        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild nativeButton>
                    <button type="button" aria-label={t('chat.modelControls.effort')} className={cn('model-controls__effort-trigger flex items-center gap-1.5 min-w-0 hover:opacity-70', buttonHeight)}>
                        <Icon name="brain-ai-3" className={cn(controlIconSize, 'flex-shrink-0')} />
                        <span className={cn('model-controls__effort-label', controlTextSize, 'font-medium truncate')}>{selected === 'off' ? t('chat.modelControls.off') : formatEffortLabel(selected, t)}</span>
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="end" className="w-[min(180px,calc(100vw-2rem))]">
                    <DropdownMenuLabel>{t('chat.modelControls.effort')}</DropdownMenuLabel>
                    {effortOptions.map((effort) => (
                        <DropdownMenuItem key={effort} onSelect={() => handleEffortSelect(effort)}>
                            <span>{effort === 'off' ? t('chat.modelControls.off') : formatEffortLabel(effort, t)}</span>
                            {selected === effort && <Icon name="check" className="ms-auto size-4" />}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    };

    const handleProviderAndModelChange = (
        providerId: string,
        modelId: string,
        options?: { applyVariant?: boolean; variant?: string | undefined; agentName?: string | null },
    ) => {
        try {
            const effectiveAgentName = options?.agentName ?? resolveLiveAgentName() ?? undefined;
            const result = options?.applyVariant
                ? applyModelSelectionWithVariant(providerId, modelId, options.variant ?? null, effectiveAgentName)
                : tryApplyModelSelection(providerId, modelId, effectiveAgentName);
            if (result !== 'applied') {
                if (result === 'provider-missing') {
                    console.error('[ModelControls] Provider not available for selection:', providerId);
                } else if (result === 'model-missing') {
                    console.error('[ModelControls] Model not available for selection:', { providerId, modelId });
                }
                return;
            }
            if (!selection && !options?.applyVariant && !isAutoModel(providerId, modelId)) {
                addRecentModel(providerId, modelId);
            }
            if (!selection) {
                setLastSelectedModel(providerId, modelId);
            }
            setAgentMenuOpen(false);
            if (isCompact) {
                closeMobilePanel();
            }
            requestAnimationFrame(focusColumnInput);
        } catch (error) {
            console.error('[ModelControls] Handle model change error:', error);
        }
    };

    const getModelDisplayName = (model: ProviderModel | undefined, fallbackModelId?: string) => {
        return getSharedModelDisplayName(model, fallbackModelId, { maxLength: 40 });
    };

    const getProviderDisplayName = () => {
        const provider = providers.find((p) => p.providerId === currentProviderId);
        return provider?.name || currentProviderId;
    };

    const getCurrentModelDisplayName = () => {
        if (!currentModelId) return t('chat.modelControls.selectModel');
        if (isAutoSelected) return t('chat.modelControls.autoModel');
        return getModelDisplayName(displayCurrentModel, currentModelId) || t('chat.modelControls.selectModel');
    };

    const currentModelDisplayName = getCurrentModelDisplayName();
    const modelUnavailableText = modelUnavailable
        ? t('chat.modelControls.modelUnavailable', { model: currentModelDisplayName })
        : undefined;
    const modelLabelRef = React.useRef<HTMLSpanElement>(null);
    const isModelLabelTruncated = useIsTextTruncated(modelLabelRef, [currentModelDisplayName, isCompact]);



    const toggleMobileProviderExpansion = React.useCallback((providerId: string) => {
        setExpandedMobileProviders((prev) => {
            const next = new Set(prev);
            if (next.has(providerId)) {
                next.delete(providerId);
            } else {
                next.add(providerId);
            }
            return next;
        });
    }, []);

    const handleLongPressStart = React.useCallback((type: 'model' | 'agent') => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
        }
        longPressTimerRef.current = setTimeout(() => {
            setMobileTooltipOpen(type);
        }, 500);
    }, []);

    const handleLongPressEnd = React.useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
        }
    }, []);

    React.useEffect(() => {
        return () => {
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
            }
        };
    }, []);

    const renderMobileModelTooltip = () => {
        if (!isCompact || mobileTooltipOpen !== 'model') return null;

        return (
            <MobileOverlayPanel
                open={true}
                onClose={closeMobileTooltip}
                title={currentMetadata?.name || getCurrentModelDisplayName()}
            >
                <div className="flex flex-col gap-1.5">
                    {}
                    <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                        <div className="typography-micro text-muted-foreground mb-0.5">{t('chat.modelControls.provider')}</div>
                        <div className="typography-meta text-foreground font-medium">{getProviderDisplayName()}</div>
                    </div>

                    {}
                    {currentCapabilityIcons.length > 0 && (
                        <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                            <div className="typography-micro text-muted-foreground mb-1">{t('chat.modelControls.capabilities')}</div>
                            <div className="flex flex-wrap gap-1.5">
                                {currentCapabilityIcons.map(({ key, icon, label }) => (
                                    <div key={key} className="flex items-center gap-1.5">
                                        <IconBadge key={`cap-${key}`} iconName={icon} label={label} />
                                        <span className="typography-meta text-foreground">{label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {}
                    {(inputModalityIcons.length > 0 || outputModalityIcons.length > 0) && (
                        <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                            <div className="typography-micro text-muted-foreground mb-1">{t('chat.modelControls.modalities')}</div>
                            <div className="flex flex-col gap-1">
                                {inputModalityIcons.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <span className="typography-meta text-muted-foreground/80 w-12">{t('chat.modelControls.input')}</span>
                                        <div className="flex gap-1">
                                            {inputModalityIcons.map(({ key, icon, label }) => <IconBadge key={`input-${key}`} iconName={icon} label={`${label} input`} />)}
                                        </div>
                                    </div>
                                )}
                                {outputModalityIcons.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <span className="typography-meta text-muted-foreground/80 w-12">{t('chat.modelControls.output')}</span>
                                        <div className="flex gap-1">
                                            {outputModalityIcons.map(({ key, icon, label }) => <IconBadge key={`output-${key}`} iconName={icon} label={`${label} output`} />)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {}
                    <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                        <div className="typography-micro text-muted-foreground mb-1">{t('chat.modelControls.limits')}</div>
                        <div className="flex flex-col gap-0.5">
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground/80">{t('chat.modelControls.context')}</span>
                                <span className="typography-meta font-medium text-foreground">{formatTokens(currentModelForMetadata?.contextWindow)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground/80">{t('chat.modelControls.output')}</span>
                                <span className="typography-meta font-medium text-foreground">{formatTokens(currentModelForMetadata?.maxOutputTokens)}</span>
                            </div>
                        </div>
                    </div>

                    {}
                    <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                        <div className="typography-micro text-muted-foreground mb-1">{t('chat.modelControls.metadata')}</div>
                        <div className="flex flex-col gap-0.5">
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground/80">{t('chat.modelControls.knowledge')}</span>
                                <span className="typography-meta font-medium text-foreground">{formatKnowledge(currentMetadata?.knowledge)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground/80">{t('chat.modelControls.release')}</span>
                                <span className="typography-meta font-medium text-foreground">{formatDate(currentMetadata?.release_date)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </MobileOverlayPanel>
        );
    };


    const renderMobileModelPanel = () => {
        if (!isCompact) return null;

        const normalizedQuery = mobileModelQuery.trim();
        const filteredFavorites = favoriteModelsList.filter(({ model, providerID }) => {
            const provider = providers.find((entry) => entry.providerId === providerID);
            const providerName = provider?.name || providerID;
            const modelName = getModelDisplayName(model);
            return normalizedQuery.length === 0
                || matchesModelSearch(modelName, normalizedQuery)
                || matchesModelSearch(providerName, normalizedQuery);
        });

        const filteredRecents = recentModelsList.filter(({ model, providerID }) => {
            const provider = providers.find((entry) => entry.providerId === providerID);
            const providerName = provider?.name || providerID;
            const modelName = getModelDisplayName(model);
            return normalizedQuery.length === 0
                || matchesModelSearch(modelName, normalizedQuery)
                || matchesModelSearch(providerName, normalizedQuery);
        });

        const filteredProviders: {
            provider: (typeof visibleProviders)[number];
            providerModels: ProviderModel[];
            matchesProvider: boolean;
        }[] = [];
        for (const provider of visibleProviders) {
            const providerModels = Array.isArray(provider.models) ? provider.models : [];
            const matchesProvider = normalizedQuery.length === 0
                ? true
                : matchesModelSearch(provider.name, normalizedQuery) || matchesModelSearch(provider.providerId, normalizedQuery);
            const matchingModels = normalizedQuery.length === 0
                ? providerModels
                : providerModels.filter((model: ProviderModel) => {
                    const name = getModelDisplayName(model);
                    const id = model.modelId;
                    return matchesModelSearch(name, normalizedQuery) || matchesModelSearch(id, normalizedQuery);
                });
            const resolvedModels = matchesProvider && normalizedQuery.length > 0 ? providerModels : matchingModels;
            if (matchesProvider || resolvedModels.length > 0) {
                filteredProviders.push({ provider, providerModels: resolvedModels, matchesProvider });
            }
        }

        const handleMobileModelApply = (providerId: string, modelId: string, variant: string | null | undefined) => {
            // The mobile row applies its displayed route, including Default.
            const result = applyModelSelectionWithVariant(providerId, modelId, variant ?? null);
            if (result !== 'applied') {
                if (result === 'provider-missing') {
                    console.error('[ModelControls] Provider not available for selection:', providerId);
                } else if (result === 'model-missing') {
                    console.error('[ModelControls] Model not available for selection:', { providerId, modelId });
                }
                return;
            }
            if (!selection) setLastSelectedModel(providerId, modelId);

            setExpandedMobileModelKey(null);
            closeMobilePanel();
            requestAnimationFrame(focusColumnInput);
        };

        const openMobileVariantOverflow = (providerId: string, modelId: string) => {
            setMobileVariantTarget({ providerId, modelId });
            setActiveMobilePanel('variant');
        };

        const renderMobileModelRow = ({
            model,
            providerId,
            modelId,
            showProviderLogo,
        }: {
            model: ProviderModel;
            providerId: string;
            modelId: string;
            showProviderLogo: boolean;
        }) => {
            const rowKey = buildModelRefKey(providerId, modelId);
            const isSelected = providerId === currentProviderId && modelId === currentModelId;
            const metadata = mergeModelMetadataWithLiveModel(providerId, model, getModelMetadata(providerId, modelId));
            const variantOptions = getModelVariantOptions(providerId, modelId);
            const hasVariants = variantOptions.length > 0;
            const resolvedVariant = resolveModelVariantSelection(providerId, modelId);
            // Both an explicit "Default" and no choice at all read as "Default".
            const variantLabel = hasVariants ? model.variants.find((route) => route.variant === resolvedVariant)?.label ?? resolvedVariant ?? t('chat.modelControls.default') : null;
            const isExpanded = expandedMobileModelKey === rowKey;
            const inlineVariantOptions = [undefined, ...variantOptions].slice(0, MAX_INLINE_MOBILE_VARIANT_OPTIONS);
            const hasVariantOverflow = inlineVariantOptions.length < variantOptions.length + 1;
            const capabilityIcons = getCapabilityIcons(metadata).map((icon) => ({
                ...icon,
                label: localizeMetaLabel(icon.label),
            }));
            const modalityIcons = [
                ...getModalityIcons(metadata, 'input').map((icon) => ({ ...icon, label: localizeMetaLabel(icon.label) })),
                ...getModalityIcons(metadata, 'output').map((icon) => ({ ...icon, label: localizeMetaLabel(icon.label) })),
            ];
            const indicatorIcons = Array.from(
                new Map([...capabilityIcons, ...modalityIcons].map((icon) => [icon.key, icon])).values()
            );
            const contextText = model.contextWindow ? `${formatTokens(model.contextWindow)} ctx` : null;

            return (
                <div
                    key={`mobile-model-${providerId}-${modelId}`}
                    className={cn(
                        'border-b border-border/30 last:border-b-0',
                        isSelected && 'bg-interactive-selection/15 text-interactive-selection-foreground'
                    )}
                >
                    <div className="flex items-center gap-2 px-2 py-1.5">
                        <button
                            type="button"
                            onClick={() => handleMobileModelApply(providerId, modelId, resolvedVariant)}
                            className={cn(
                                'flex flex-1 min-w-0 items-start gap-2 text-start',
                                'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-lg'
                            )}
                        >
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <div className="flex min-w-0 items-center gap-1.5">
                                    {isAutoModel(providerId, modelId) ? (
                                        <Icon name="openchamber" className="size-3.5 flex-shrink-0" />
                                    ) : showProviderLogo ? (
                                        <ProviderLogo providerId={providerId} className="size-3.5 flex-shrink-0" />
                                    ) : null}
                                    <span className="typography-meta font-medium text-foreground truncate">
                                        {getModelDisplayName(model)}
                                    </span>
                                    {isSelected ? <Icon name="check" className="size-4 flex-shrink-0 text-inherit" /> : null}
                                </div>
                                {contextText || indicatorIcons.length > 0 ? (
                                    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden typography-micro text-muted-foreground">
                                        {contextText ? (
                                            <span className="whitespace-nowrap flex-shrink-0">
                                                {contextText}
                                            </span>
                                        ) : null}
                                        {contextText && indicatorIcons.length > 0 ? (
                                            <span aria-hidden="true" className="h-3 w-px flex-shrink-0 bg-border/50" />
                                        ) : null}
                                        {indicatorIcons.length > 0 ? (
                                            <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap ps-0.5">
                                                {indicatorIcons.map(({ key, icon: iconName, label }) => (
                                                    <span
                                                        key={`meta-${providerId}-${modelId}-${key}`}
                                                        className="flex size-4 flex-shrink-0 items-center justify-center text-muted-foreground"
                                                        title={label}
                                                        aria-label={label}
                                                    >
                                                        <Icon name={iconName} className="size-3" />
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        </button>
                        {hasVariants ? (
                            <button
                                type="button"
                                onClick={() => setExpandedMobileModelKey((prev) => prev === rowKey ? null : rowKey)}
                                className="flex items-center gap-0.5 typography-micro font-medium text-muted-foreground hover:text-foreground flex-shrink-0"
                                aria-expanded={isExpanded}
                                aria-label={t('chat.modelControls.routes')}
                            >
                                <span className="whitespace-nowrap">{t('chat.modelControls.routes')}: {variantLabel}</span>
                                {isExpanded ? <Icon name="arrow-down-s" className="size-3.5" /> : <Icon name="arrow-right-s" className="size-3.5" />}
                            </button>
                        ) : null}
                        <div className="flex flex-shrink-0 items-center gap-1.5">
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    toggleFavoriteModel(providerId, modelId);
                                }}
                                className={cn(
                                    'model-favorite-button flex size-5 items-center justify-center hover:text-primary/80 flex-shrink-0',
                                    isFavoriteModel(providerId, modelId) ? 'text-primary' : 'text-muted-foreground'
                                )}
                                aria-label={isFavoriteModel(providerId, modelId)
                                    ? t('chat.modelControls.unfavoriteAria')
                                    : t('chat.modelControls.favoriteAria')}
                                title={isFavoriteModel(providerId, modelId)
                                    ? t('chat.modelControls.removeFromFavorites')
                                    : t('chat.modelControls.addToFavorites')}
                            >
                                {isFavoriteModel(providerId, modelId) ? (
                                    <Icon name="star-fill" className="size-4" />
                                ) : (
                                    <Icon name="star" className="size-4" />
                                )}
                            </button>
                        </div>
                    </div>
                    {isExpanded && hasVariants ? (
                        <div className="border-t border-border/30 p-2">
                            <div className="flex flex-wrap gap-2">
                                {inlineVariantOptions.map((variantOption) => {
                                    const isVariantSelected = variantOption === resolvedVariant || (!variantOption && !resolvedVariant);
                                    return (
                                        <button
                                            key={`${rowKey}-variant-${variantOption ?? 'default'}`}
                                            type="button"
                                            onClick={() => handleMobileModelApply(providerId, modelId, variantOption)}
                                            className={cn(
                                                'inline-flex items-center rounded-full border px-2.5 py-1 typography-meta font-medium',
                                                isVariantSelected
                                                    ? 'border-border bg-interactive-selection text-interactive-selection-foreground'
                                                    : 'border-border/40 text-muted-foreground hover:bg-interactive-hover/50'
                                            )}
                                            aria-pressed={isVariantSelected}
                                        >
                                            {model.variants.find((route) => route.variant === variantOption)?.label ?? variantOption ?? t('chat.modelControls.default')}
                                        </button>
                                    );
                                })}
                                {hasVariantOverflow ? (
                                    <button
                                        type="button"
                                        onClick={() => openMobileVariantOverflow(providerId, modelId)}
                                        className="inline-flex items-center rounded-full border border-border/40 px-2.5 py-1 typography-meta font-medium text-muted-foreground hover:bg-interactive-hover/50"
                                        aria-label={t('chat.modelControls.routes')}
                                    >
                                        {t('inlineComment.actions.showMore')}
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                </div>
            );
        };

        const mobileAutoEntry = autoEntry && (normalizedQuery.length === 0 || getModelDisplayName(autoEntry.model).toLowerCase().includes(normalizedQuery.toLowerCase()))
            ? autoEntry
            : null;
        const hasResults = Boolean(mobileAutoEntry) || filteredFavorites.length > 0 || filteredRecents.length > 0 || filteredProviders.length > 0;

        return (
            <MobileOverlayPanel
                open={activeMobilePanel === 'model'}
                onClose={closeMobilePanel}
                title={t('chat.modelControls.selectModel')}
            >
                <div className="flex flex-col gap-2">
                    <div>
                        <div className="relative">
                            <Icon name="search" className="absolute start-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                            <Input
                                value={mobileModelQuery}
                                onChange={(event) => {
                                    setMobileModelQuery(event.target.value);
                                    setExpandedMobileModelKey(null);
                                }}
                                placeholder={t('chat.modelControls.searchProvidersOrModels')}
                                className="ps-7 h-9 rounded-xl border-border/40 bg-[var(--surface-elevated)] typography-meta"
                            />
                            {mobileModelQuery && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMobileModelQuery('');
                                        setExpandedMobileModelKey(null);
                                    }}
                                    className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    aria-label={t('chat.modelControls.clearSearch')}
                                >
                                    <Icon name="close-circle" className="size-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {!hasResults && (
                        <div className="px-3 py-8 text-center typography-meta text-muted-foreground">
                            {t('chat.modelControls.noProvidersOrModelsFound')}
                        </div>
                    )}

                    {mobileAutoEntry ? (
                        <div className="rounded-xl border border-border/40 bg-[var(--surface-elevated)] overflow-hidden">
                            <div className="flex flex-col">
                                {renderMobileModelRow({
                                    model: mobileAutoEntry.model,
                                    providerId: mobileAutoEntry.providerId,
                                    modelId: mobileAutoEntry.modelId,
                                    showProviderLogo: false,
                                })}
                            </div>
                        </div>
                    ) : null}

                    {/* Favorites Section for Mobile */}
                    {filteredFavorites.length > 0 && (
                        <div className="rounded-xl border border-border/40 bg-[var(--surface-elevated)] overflow-hidden">
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                <Icon name="star-fill" className="size-3 inline-block me-1.5 text-primary" />
                                {t('chat.modelControls.favorites')}
                            </div>
                            <div className="flex flex-col border-t border-border/30">
                                {filteredFavorites.map(({ model, providerID, modelID }) => renderMobileModelRow({
                                    model,
                                    providerId: providerID,
                                    modelId: modelID,
                                    showProviderLogo: true,
                                }))}
                            </div>
                        </div>
                    )}

                    {/* Recent Section for Mobile */}
                    {filteredRecents.length > 0 && (
                        <div className="rounded-xl border border-border/40 bg-[var(--surface-elevated)] overflow-hidden">
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                <Icon name="time" className="size-3 inline-block me-1.5" />
                                {t('chat.modelControls.recent')}
                            </div>
                            <div className="flex flex-col border-t border-border/30">
                                {filteredRecents.map(({ model, providerID, modelID }) => renderMobileModelRow({
                                    model,
                                    providerId: providerID,
                                    modelId: modelID,
                                    showProviderLogo: true,
                                }))}
                            </div>
                        </div>
                    )}

                    {filteredProviders.map(({ provider, providerModels }) => {
                        if (providerModels.length === 0) {
                            return null;
                        }

                        const isActiveProvider = provider.providerId === currentProviderId;
                        const isExpanded = expandedMobileProviders.has(provider.providerId) || normalizedQuery.length > 0;

                        return (
                            <div key={provider.providerId} className="rounded-xl border border-border/40 bg-[var(--surface-elevated)] overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (normalizedQuery.length > 0) {
                                            return;
                                        }
                                        toggleMobileProviderExpansion(provider.providerId);
                                    }}
                                    className="flex w-full items-center justify-between gap-1.5 px-2 py-1.5 text-start"
                                    aria-expanded={isExpanded}
                                >
                                    <div className="flex items-center gap-2">
                                        <ProviderLogo
                                            providerId={provider.providerId}
                                            className="size-3.5"
                                        />
                                        <span className="typography-meta font-medium text-foreground">
                                            {provider.name}
                                        </span>
                                        {isActiveProvider && (
                                            <span className="typography-micro text-primary/80">{t('chat.modelControls.current')}</span>
                                        )}
                                    </div>
                                    {isExpanded ? (
                                        <Icon name="arrow-down-s" className="size-3 text-muted-foreground" />
                                    ) : (
                                        <Icon name="arrow-right-s" className="size-3 text-muted-foreground" />
                                    )}
                                </button>

                                {isExpanded && providerModels.length > 0 && (
                                    <div className="flex flex-col border-t border-border/30">
                                        {providerModels.map((model: ProviderModel) => renderMobileModelRow({
                                            model,
                                            providerId: provider.providerId,
                                            modelId: model.modelId,
                                            showProviderLogo: false,
                                        }))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </MobileOverlayPanel>
        );
    };

    const renderMobileVariantPanel = () => {
        if (!isCompact) return null;

        const targetProviderId = mobileVariantTarget?.providerId ?? currentProviderId;
        const targetModelId = mobileVariantTarget?.modelId ?? currentModelId;
        if (!targetProviderId || !targetModelId) return null;

        const targetVariants = getModelVariantOptions(targetProviderId, targetModelId);
        if (targetVariants.length === 0) return null;

        const selectedVariant = resolveModelVariantSelection(targetProviderId, targetModelId);
        const isDefault = !selectedVariant;

        const handleBack = () => {
            setActiveMobilePanel('model');
        };

        const handleSelect = (variant: string | undefined) => {
            handleVariantSelect(variant, targetProviderId, targetModelId);
            closeMobilePanel();
            requestAnimationFrame(focusColumnInput);
        };


        return (
            <MobileOverlayPanel
                open={activeMobilePanel === 'variant'}
                onClose={closeMobilePanel}
                title={t('chat.modelControls.routes')}
                renderHeader={mobileVariantTarget ? ((closeButton) => (
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
                        <button
                            type="button"
                            onClick={handleBack}
                            className="flex items-center gap-1 rounded-lg px-1.5 py-1 typography-meta text-muted-foreground hover:bg-interactive-hover"
                        >
                            <Icon name="arrow-go-back" className="size-4" />
                            <span>{t('onboarding.common.actions.back')}</span>
                        </button>
                        <h2 className="typography-ui-label font-semibold text-foreground">{t('chat.modelControls.routes')}</h2>
                        {closeButton}
                    </div>
                )) : undefined}
            >
                <div className="flex flex-col gap-1.5">
                    <button
                        type="button"
                        className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-xl border px-2 py-1.5 text-start',
                            'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                            isDefault ? 'border-border bg-interactive-selection text-interactive-selection-foreground' : 'border-border/40'
                        )}
                        onClick={() => handleSelect(undefined)}
                    >
                        <span className="typography-meta font-medium text-foreground">{t('chat.modelControls.default')}</span>
                        {isDefault && <Icon name="check" className="size-4 text-inherit flex-shrink-0" />}
                    </button>

                    {targetVariants.map((variant) => {
                        const selected = selectedVariant === variant;
                        const label = providers.find((provider) => provider.providerId === targetProviderId)?.models.find((model) => model.modelId === targetModelId)?.variants.find((route) => route.variant === variant)?.label ?? variant;

                        return (
                            <button
                                key={variant}
                                type="button"
                                className={cn(
                                    'flex w-full items-center justify-between gap-2 rounded-xl border px-2 py-1.5 text-start',
                                    'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                                    selected ? 'border-border bg-interactive-selection text-interactive-selection-foreground' : 'border-border/40'
                                )}
                                onClick={() => handleSelect(variant)}
                            >
                                <span className="typography-meta font-medium text-inherit">{label}</span>
                                {selected && <Icon name="check" className="size-4 text-inherit flex-shrink-0" />}
                            </button>
                        );
                    })}
                </div>
            </MobileOverlayPanel>
        );
    };


    const renderMobileEffortPanel = () => {
        if (!isCompact) return null;
        if (!currentProviderId || !currentModelId) return null;

        const levels = getReasoningEffortLevels(currentCatalogModel);
        if (levels.length === 0) return null;

        const agentId = resolveLiveAgentName() ?? ROOT_SELECTION_AGENT;
        const savedEffort = currentSessionId
            ? getAgentModelReasoningEffortForSession(currentSessionId, agentId, currentProviderId, currentModelId)
            : undefined;
        const selected = resolveThinkingLevel(levels, [savedEffort, configuredCurrentReasoningEffort, currentCatalogModel?.defaultReasoningEffort]);

        const handleSelect = (effort: string) => {
            handleEffortSelect(effort);
            closeMobilePanel();
            requestAnimationFrame(focusColumnInput);
        };

        return (
            <MobileOverlayPanel
                open={activeMobilePanel === 'effort'}
                onClose={closeMobilePanel}
                title={t('chat.modelControls.effort')}
            >
                <div className="flex flex-col gap-1.5">
                    {levels.map((effort) => {
                        const isSelected = selected === effort;
                        return (
                            <button
                                key={effort}
                                type="button"
                                className={cn(
                                    'flex w-full items-center justify-between gap-2 rounded-xl border px-2 py-1.5 text-start',
                                    'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                                    isSelected ? 'border-border bg-interactive-selection text-interactive-selection-foreground' : 'border-border/40'
                                )}
                                onClick={() => handleSelect(effort)}
                            >
                                <span className="typography-meta font-medium text-inherit">
                                    {effort === 'off' ? t('chat.modelControls.off') : formatEffortLabel(effort, t)}
                                </span>
                                {isSelected && <Icon name="check" className="size-4 text-inherit flex-shrink-0" />}
                            </button>
                        );
                    })}
                </div>
            </MobileOverlayPanel>
        );
    };

    const renderModelTooltipContent = () => modelUnavailableText ? (
        <TooltipContent align="start" sideOffset={8} className="max-w-[280px]">
            <div className="min-w-[200px] typography-meta text-foreground">
                <TooltipLabelWithShortcut label={modelUnavailableText} shortcut={modelShortcut} />
            </div>
        </TooltipContent>
    ) : (
        <TooltipContent align="start" sideOffset={8} className="max-w-[320px]">
            {currentMetadata ? (
                <div className="flex min-w-[240px] flex-col gap-3">
                    <div className="flex flex-col gap-0.5">
                        <span className="typography-micro font-semibold text-foreground">
                            {currentMetadata.name || getCurrentModelDisplayName()}
                        </span>
                        <span className="typography-meta text-muted-foreground">{getProviderDisplayName()}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">{t('chat.modelControls.capabilities')}</span>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {currentCapabilityIcons.length > 0 ? (
                                currentCapabilityIcons.map(({ key, icon, label }) =>
                                    <IconBadge key={`cap-${key}`} iconName={icon} label={label} />
                                )
                            ) : (
                                <span className="typography-meta text-muted-foreground">{t('chat.modelControls.modeValue.none')}</span>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">{t('chat.modelControls.modalities')}</span>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-3">
                                <span className="typography-meta font-medium text-muted-foreground/80">{t('chat.modelControls.input')}</span>
                                <div className="flex items-center gap-1.5">
                                    {inputModalityIcons.length > 0
                                        ? inputModalityIcons.map(({ key, icon, label }) =>
                                            <IconBadge key={`input-${key}`} iconName={icon} label={`${label} input`} />
                                        )
                                        : <span className="typography-meta text-muted-foreground">-</span>}
                                </div>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="typography-meta font-medium text-muted-foreground/80">{t('chat.modelControls.output')}</span>
                                <div className="flex items-center gap-1.5">
                                    {outputModalityIcons.length > 0
                                        ? outputModalityIcons.map(({ key, icon, label }) =>
                                            <IconBadge key={`output-${key}`} iconName={icon} label={`${label} output`} />
                                        )
                                        : <span className="typography-meta text-muted-foreground">-</span>}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">{t('chat.modelControls.costPerMillion')}</span>
                        {costRows.map((row) => (
                            <div key={row.label} className="flex items-center justify-between gap-3">
                                <span className="typography-meta font-medium text-muted-foreground/80">{row.label}</span>
                                <span className="typography-meta font-medium text-foreground">{row.value}</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">{t('chat.modelControls.limits')}</span>
                        {limitRows.map((row) => (
                            <div key={row.label} className="flex items-center justify-between gap-3">
                                <span className="typography-meta font-medium text-muted-foreground/80">{row.label}</span>
                                <span className="typography-meta font-medium text-foreground">{row.value}</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">{t('chat.modelControls.metadata')}</span>
                        <div className="flex items-center justify-between gap-3">
                            <span className="typography-meta font-medium text-muted-foreground/80">{t('chat.modelControls.knowledge')}</span>
                            <span className="typography-meta font-medium text-foreground">{formatKnowledge(currentMetadata.knowledge)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="typography-meta font-medium text-muted-foreground/80">{t('chat.modelControls.release')}</span>
                            <span className="typography-meta font-medium text-foreground">{formatDate(currentMetadata.release_date)}</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="min-w-[200px] typography-meta text-muted-foreground">{t('chat.modelControls.metadataUnavailable')}</div>
            )}
        </TooltipContent>
    );

    const renderModelSelector = () => {
        if (isCompact && selection) {
            return <MobileModelButton
                model={selection.model}
                onOpenModel={() => setActiveMobilePanel('model')}
                className="model-controls__model-trigger flex-shrink-0"
            />;
        }
        const handleEffortKey = (e: React.KeyboardEvent, selectedItem: ModelPickerEntry) => {
            keyboardOwnsModelSelectionRef.current = true;
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return false;
            const efforts = getModelReasoningOptions(selectedItem.providerId, selectedItem.modelId);
            if (efforts.length <= 1) return false;
            e.preventDefault();
            e.stopPropagation();
            const current = selectedItem.providerId === currentProviderId && selectedItem.modelId === currentModelId ? selectedReasoningEffort : 'off';
            const index = Math.max(0, efforts.indexOf(current));
            const direction = e.key === 'ArrowRight' ? 1 : -1;
            handleEffortSelect(efforts[(index + direction + efforts.length) % efforts.length], selectedItem.providerId, selectedItem.modelId);
            return true;
        };

        const handleModelPickerKeyDown = (e: React.KeyboardEvent, selectedItem: ModelPickerEntry | undefined) => {
            const cycleAgentDirection = getCycleAgentDirectionFromEvent(e);
            if (cycleAgentDirection) {
                e.preventDefault();
                handleCycleAgentFromModelPicker(cycleAgentDirection);
                return;
            }

            if (selectedItem) handleEffortKey(e, selectedItem);
        };

        const handleSharedModelSelect = (entry: ModelPickerEntry) => {
            const effectiveAgentName = resolveLiveAgentName();
            handleProviderAndModelChange(entry.providerId, entry.modelId, { agentName: effectiveAgentName });
        };

        const handleModelShortcutKeyDownCapture = (e: React.KeyboardEvent) => {
            const cycleAgentDirection = getCycleAgentDirectionFromEvent(e);
            if (!cycleAgentDirection) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();
            keyboardOwnsModelSelectionRef.current = true;
            handleCycleAgentFromModelPicker(cycleAgentDirection);
        };

        const handleModelMenuOpenChange = (nextOpen: boolean) => {
            setAgentMenuOpen(nextOpen);
        };

        const modelPickerLabels = {
            searchPlaceholder: t('chat.modelControls.searchModels'),
            list: t('chat.modelControls.modelListAria'),
            noResults: t('chat.modelControls.noModelsFound'),
            favorites: t('chat.modelControls.favorites'),
            recent: t('chat.modelControls.recent'),
            keyboardHint: t('chat.modelControls.keyboardHintNavigate'),
            favorite: t('chat.modelControls.favoriteAria'),
            unfavorite: t('chat.modelControls.unfavoriteAria'),
            capabilities: t('chat.modelControls.capabilities'),
            capabilityToolCalling: t('chat.modelControls.capability.toolCalling'),
            capabilityReasoning: t('chat.modelControls.capability.reasoning'),
            input: t('chat.modelControls.input'),
            output: t('chat.modelControls.output'),
            costPerMillion: t('chat.modelControls.costPerMillion'),
        };


        return (
            <Tooltip delayDuration={600}>
                {!isCompact ? (
                    <DropdownMenu open={isReady && agentMenuOpen} onOpenChange={isReady ? handleModelMenuOpenChange : undefined}>
                        <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild nativeButton>
                                <button
                                    type="button"
                                    className={cn(
                                        'model-controls__model-trigger flex items-center gap-1.5 cursor-pointer select-none hover:bg-transparent hover:opacity-70 min-w-0',
                                        buttonHeight
                                    )}
                                >
                                    {!modelSelectionReady ? (
                                        <>
                                            <Icon name="loader-4" className={cn(controlIconSize, 'animate-spin text-muted-foreground flex-shrink-0')} />
                                            <span className={cn(
                                                'model-controls__model-label',
                                                controlTextSize,
                                                'font-medium whitespace-nowrap text-muted-foreground min-w-0'
                                            )}>
                                                {readinessLabel}
                                            </span>
                                        </>
                                    ) : isAutoSelected ? (
                                        <Icon name="openchamber" className={cn(controlIconSize, 'flex-shrink-0')} />
                                    ) : modelUnavailable ? (
                                        <Icon name="error-warning" className={cn(controlIconSize, 'flex-shrink-0 text-[var(--status-warning)]')} />
                                    ) : currentProviderId ? (
                                        <>
                                            <ProviderLogo
                                                providerId={currentProviderId}
                                                className={cn(providerLogoSize, 'flex-shrink-0')}
                                            />
                                            <Icon name="pencil-ai" className={cn(controlIconSize, 'text-primary/60 hidden')} />
                                        </>
                                    ) : (
                                        <Icon name="pencil-ai" className={cn(controlIconSize, 'text-muted-foreground')} />
                                    )}
                                    {modelSelectionReady && (
                                        <span
                                            ref={modelLabelRef}
                                            key={`${currentProviderId}-${currentModelId}`}
                                            className={cn(
                                                'model-controls__model-label overflow-hidden text-ellipsis',
                                                controlTextSize,
                                                'font-medium whitespace-nowrap text-foreground min-w-0',
                                                'max-w-[260px]'
                                            )}
                                        >
                                            <span className={cn('marquee-text', isModelLabelTruncated && 'marquee-text--active')}>
                                                {currentModelDisplayName}
                                            </span>
                                        </span>
                                    )}
                                </button>
                            </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <DropdownMenuContent
                            side="top"
                            className="w-[min(380px,calc(100vw-2rem))] p-0 flex flex-col overflow-hidden"
                            align="end"
                            alignOffset={-40}
                            constrainToMain
                            collisionAvoidance={{ side: 'none', align: 'shift' }}
                            onKeyDownCapture={handleModelShortcutKeyDownCapture}
                        >
                            {!selection && <div className="p-1 border-b border-border/40">
                                <button
                                    type="button"
                                    onClick={openAddProviderSettings}
                                    className="typography-meta group flex w-full items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer hover:bg-interactive-hover/50"
                                >
                                    <span className="flex size-4 items-center justify-center text-muted-foreground">
                                        <Icon name="add" className="size-4 -me-0.5" />
                                    </span>
                                    <span className="font-medium text-foreground">{t('chat.modelControls.addNewProvider')}</span>
                                </button>
                            </div>}
                            <ModelPickerList
                                providers={providers}
                                favoriteModels={favoriteModelsList}
                                recentModels={recentModelsList}
                                searchQuery={desktopModelQuery}
                                onSearchQueryChange={setDesktopModelQuery}
                                onSelect={handleSharedModelSelect}
                                labels={modelPickerLabels}
                                selectedModel={currentProviderId && currentModelId ? { providerID: currentProviderId, modelID: currentModelId } : null}
                                leadingEntry={autoEntry}
                                leadingAction={onRunInParallel ? {
                                    label: t('chat.modelControls.runInParallel'),
                                    icon: <ArrowsMerge className="h-3.5 w-3.5 flex-shrink-0" />,
                                    onSelect: () => {
                                        setModelSelectorOpen(false);
                                        onRunInParallel();
                                    },
                                } : null}
                                hiddenModels={hiddenModels}
                                onActiveKeyDown={handleModelPickerKeyDown}
                                onActiveEntryChange={(entry) => { activeModelPickerEntryRef.current = entry; }}
                                onVariantKey={handleEffortKey}
                                isFavorite={(entry) => isFavoriteModel(entry.providerId, entry.modelId)}
                                onToggleFavorite={(entry) => toggleFavoriteModel(entry.providerId, entry.modelId)}
                                onReorderFavorite={(active, over) => reorderFavoriteModel(
                                    active.providerId,
                                    active.modelId,
                                    over.providerId,
                                    over.modelId,
                                )}
                                reorderFavoriteAriaLabel={t('chat.modelControls.reorderFavoriteAria')}
                                reorderFavoriteTitle={t('chat.modelControls.reorderFavoriteTitle')}
                                providerOrder={providerOrder}
                                onReorderProvider={setProviderOrder}
                                reorderProviderTitle={t('chat.modelControls.reorderProviderTitle')}
                                footerContent={(activeEntry) => {
                                    const activeHasEfforts = activeEntry
                                        ? getModelReasoningOptions(activeEntry.providerId, activeEntry.modelId).length > 0
                                        : false;

                                    return (
                                        <div className="flex items-center gap-x-4 whitespace-nowrap overflow-hidden">
                                            <span>{t('chat.modelControls.keyboardHintNavigate')}</span>
                                            {!selection && <span>{t('chat.modelControls.keyboardHintSwitchAgent', { shortcut: 'Tab' })}</span>}
                                            {activeHasEfforts ? <span>{t('chat.modelControls.keyboardHintThinking')}</span> : null}
                                        </div>
                                    );
                                }}
                                maxHeightClassName="max-h-[min(400px,calc(var(--available-height)-4rem))] flex-1"
                                tooltipsEnabled={agentMenuOpen}
                                onEscape={() => setAgentMenuOpen(false)}
                            />
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <button
                        type="button"
                        onClick={isReady ? () => setActiveMobilePanel('model') : undefined}
                        onTouchStart={isReady ? () => handleLongPressStart('model') : undefined}
                        onTouchEnd={isReady ? handleLongPressEnd : undefined}
                        onTouchCancel={isReady ? handleLongPressEnd : undefined}
                        disabled={!isReady}
                        aria-label={modelUnavailableText}
                        className={cn(
                            'model-controls__model-trigger flex items-center gap-1.5 min-w-0 focus:outline-none',
                            isReady ? 'cursor-pointer hover:bg-transparent hover:opacity-70' : 'opacity-60 cursor-not-allowed',
                            buttonHeight
                        )}
                    >
                        {!modelSelectionReady ? (
                            <>
                                <Icon name="loader-4" className={cn(controlIconSize, 'animate-spin text-muted-foreground flex-shrink-0')} />
                                <span className="typography-micro font-medium text-muted-foreground min-w-0">
                                    {readinessLabel}
                                </span>
                            </>
                        ) : (
                            <>
                                {isAutoSelected ? (
                                    <Icon name="openchamber" className={cn(controlIconSize, 'flex-shrink-0')} />
                                ) : modelUnavailable ? (
                                    <Icon name="error-warning" className={cn(controlIconSize, 'flex-shrink-0 text-[var(--status-warning)]')} />
                                ) : currentProviderId ? (
                                    <ProviderLogo
                                        providerId={currentProviderId}
                                        className={cn(controlIconSize, 'flex-shrink-0')}
                                    />
                                ) : (
                                    <Icon name="pencil-ai" className={cn(controlIconSize, 'text-muted-foreground')} />
                                )}
                                <span
                                    ref={modelLabelRef}
                                    className={cn(
                                        'model-controls__model-label typography-micro font-medium overflow-hidden text-ellipsis whitespace-nowrap min-w-0',
                                        isMobile ? 'max-w-[120px]' : 'max-w-[220px]',
                                    )}
                                >
                                    <span className={cn('marquee-text', isModelLabelTruncated && 'marquee-text--active')}>
                                        {currentModelDisplayName}
                                    </span>
                                </span>
                            </>
                        )}
                    </button>
                )}
                {renderModelTooltipContent()}
            </Tooltip>
        );
    };


    const renderVariantSelector = () => {
        if (!isReady || !hasVariants || isAutoSelected) {
            return null;
        }

        const displayVariant = routeOptions.find((route) => route.variant === currentVariant)?.label ?? currentVariant ?? t('chat.modelControls.default');
        const isDefault = !currentVariant;
        const colorClass = isDefault ? 'text-muted-foreground' : 'text-[color:var(--status-info)]';

        if (isCompact) {
            return (
                <button
                    type="button"
                    aria-label={t('chat.modelControls.routes')}
                    onClick={() => setActiveMobilePanel('variant')}
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerDownCapture={(event) => {
                        if (event.pointerType === 'touch') event.preventDefault();
                    }}
                    className={cn(
                        'model-controls__variant-trigger flex items-center gap-1.5 transition-opacity min-w-0 focus:outline-none',
                        buttonHeight,
                        'cursor-pointer hover:bg-transparent hover:opacity-70',
                    )}
                >
                    <Icon name="brain-ai-3" className={cn(controlIconSize, 'flex-shrink-0', colorClass)} />
                    <span className={cn(
                        'model-controls__variant-label',
                        controlTextSize,
                        'font-medium truncate min-w-0',
                        isMobile && 'max-w-[60px]',
                        colorClass
                    )}>
                        {displayVariant}
                    </span>
                </button>
            );
        }

        return (
            <Tooltip delayDuration={600}>
                <DropdownMenu>
                    <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild nativeButton>
                            <button
                                type="button"
                                aria-label={t('chat.modelControls.routes')}
                                className={cn(
                                    'model-controls__variant-trigger flex items-center gap-1.5 transition-colors cursor-pointer select-none hover:bg-transparent hover:opacity-70 min-w-0',
                                    buttonHeight,
                                )}
                            >
                                <Icon name="brain-ai-3" className={cn(controlIconSize, 'flex-shrink-0', colorClass)} />
                                <span
                                    className={cn(
                                        'model-controls__variant-label',
                                        controlTextSize,
                                        'font-medium min-w-0 truncate',
                                        isDesktop ? 'max-w-[180px]' : undefined,
                                        colorClass,
                                    )}
                                >
                                    {displayVariant}
                                </span>
                            </button>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <DropdownMenuContent side="top" align="end" alignOffset={-40} className="w-[min(180px,calc(100vw-2rem))]">
                        <DropdownMenuLabel className="typography-ui-header font-semibold text-foreground">{t('chat.modelControls.routes')}</DropdownMenuLabel>
                        <DropdownMenuItem className="typography-meta" onSelect={() => handleVariantSelect(undefined)}>
                            <div className="flex items-center justify-between gap-2 w-full min-w-0">
                                <span className="typography-meta font-medium text-foreground truncate min-w-0">{t('chat.modelControls.default')}</span>
                                {isDefault && <Icon name="check" className="size-4 text-primary flex-shrink-0" />}
                            </div>
                        </DropdownMenuItem>
                        {routeOptions.length > 0 && <DropdownMenuSeparator />}
                        {routeOptions.map((route) => {
                            const selected = currentVariant === route.variant;
                            return (
                                <DropdownMenuItem key={route.variant} className="typography-meta" onSelect={() => handleVariantSelect(route.variant)}>
                                    <div className="flex items-center justify-between gap-2 w-full min-w-0">
                                        <span className="typography-meta font-medium text-foreground truncate min-w-0">{route.label || route.variant}</span>
                                        {selected && <Icon name="check" className="size-4 text-inherit flex-shrink-0" />}
                                    </div>
                                </DropdownMenuItem>
                            );
                        })}
                    </DropdownMenuContent>
                </DropdownMenu>
                <TooltipContent side="top">
                    <p className="typography-meta">{t('chat.modelControls.routes')}: {displayVariant}</p>
                </TooltipContent>
            </Tooltip>
        );
    };


    const inlineMobileSelection = isMobile && Boolean(selection);
    const inlineClassName = cn(
        '@container/model-controls flex items-center min-w-0',
        // Only force full-width + truncation behaviors on true mobile layouts.
        isMobile && 'w-full',
        className,
    );

    return (
        <>
            <div className={inlineClassName}>
                <div
                    className={cn(
                        'flex items-center min-w-0 flex-1',
                        inlineMobileSelection ? 'justify-start' : 'justify-end',
                        inlineGapClass,
                        isMobile && 'overflow-hidden'
                    )}
                >
                    {!inlineMobileSelection && renderEffortSelector()}
                    {!inlineMobileSelection && renderVariantSelector()}
                    {renderModelSelector()}
                    {inlineMobileSelection && renderEffortSelector()}
                    {inlineMobileSelection && renderVariantSelector()}
                </div>
            </div>

            {renderMobileModelPanel()}
            {renderMobileVariantPanel()}
            {renderMobileEffortPanel()}
            {renderMobileModelTooltip()}
        </>
    );

};
