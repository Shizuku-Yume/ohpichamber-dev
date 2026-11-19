import { formatModelRef, modelRefInstanceKey } from '@openchamber/agent-contract';
import { getReasoningEffortLevels, resolveThinkingLevel } from '@/lib/modelThinkingLevels';
import React from 'react';
import { useChatColumnActions } from './chatColumnSession';
import { MobileModelButton } from './MobileModelButton';
<<<<<<< HEAD
||||||| bc50ba56aa
import { useAgentMissingFromCatalog } from './agentAvailability';
import type { EditPermissionMode } from '@/stores/types/sessionTypes';
=======
import { useAgentMissingFromCatalog, useModelMissingFromCatalog } from './agentAvailability';
import type { EditPermissionMode } from '@/stores/types/sessionTypes';
>>>>>>> upstream/main
import type { ModelMetadata } from '@/types';
<<<<<<< HEAD
import type { Message, Model } from '@openchamber/agent-contract';
||||||| bc50ba56aa
import type { Agent, Message, PermissionRuleset, Session } from '@/lib/opencode/model';
import type { PermissionEffect } from '@opencode/client';
=======
import type { Agent, Message, PermissionRuleset, Session } from '@/lib/opencode/model';
import type { PermissionEffect } from '@/lib/opencode/model';
>>>>>>> upstream/main
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
<<<<<<< HEAD
import type { ComposerModelSelection } from './pinnedComposerSelection';
import { ROOT_SELECTION_AGENT } from '@/sync/selection-store';
||||||| bc50ba56aa
import type { BtwSelection } from '@/stores/useBtwStore';
import { listModelVariantIds, type ModelVariantSource } from '@/lib/modelVariants';
import { effortMemoryKey, rememberEffort, resolveEffortChoice, resolveEffortForModelSelection } from '@/lib/modelEfforts';
=======
import type { BtwSelection } from '@/stores/useBtwStore';
import { listModelVariantIds, type ModelVariantSource } from '@/lib/modelVariants';
import { effortMemoryKey, rememberEffort, resolveEffortChoice, resolveEffortForModelSelection } from '@/lib/modelEfforts';
import { restingAgentColor } from '@/lib/agentColors';
>>>>>>> upstream/main

type IconComponent = IconName;

type ProviderModel = Model;

type MobileVariantTarget = { providerId: string; modelId: string };

const buildModelRefKey = (providerId: string, modelId: string) => modelRefInstanceKey(providerId, modelId);

const selectLatestReplyModelChoice = (messages: Message[]) => findLatestUserModelChoice(messages);
const MAX_INLINE_MOBILE_VARIANT_OPTIONS = 6;


<<<<<<< HEAD
||||||| bc50ba56aa
const buildModelRefKey = (providerID: string, modelID: string) => `${providerID}:${modelID}`;

const selectSessionRecordAgent = (session: Session | undefined): string | undefined => session?.agent?.trim() || undefined;
const selectLatestReplyModelChoice = (messages: Message[], state: State) => findLatestUserModelChoice(
    messages,
    (messageId) => state.part[messageId],
);

/** A section caption in the composer's pickers, the same as the model picker's. */

const AgentDescriptionTooltip: React.FC<{
    description?: string;
    children: React.ReactElement;
}> = ({ description, children }) => {
    if (!description) {
        return children;
    }

    return (
        <Tooltip delayDuration={450}>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent
                side="right"
                sideOffset={8}
                className="max-w-xs text-start transition-none data-[starting-style]:opacity-100 data-[starting-style]:scale-100 data-[ending-style]:opacity-100 data-[ending-style]:scale-100"
            >
                <span className="typography-meta text-muted-foreground">{description}</span>
            </TooltipContent>
        </Tooltip>
    );
};

/**
 * Star on an agent row. Starred agents are what Tab cycles through; the press
 * is kept from the row so starring never picks the agent.
 */
const AgentFavoriteToggle: React.FC<{
    favorite: boolean;
    onToggle: () => void;
    className?: string;
}> = ({ favorite, onToggle, className }) => {
    const { t } = useI18n();
    const label = favorite ? t('chat.modelControls.removeFromFavorites') : t('chat.modelControls.agentFavoriteAdd');
    const keepFromRow = (event: React.SyntheticEvent) => {
        event.preventDefault();
        event.stopPropagation();
    };
    return (
        <button
            type="button"
            aria-pressed={favorite}
            aria-label={label}
            title={label}
            onPointerDown={keepFromRow}
            onPointerUp={keepFromRow}
            onMouseUp={keepFromRow}
            onClick={(event) => {
                keepFromRow(event);
                onToggle();
            }}
            className={cn(
                'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded hover:text-primary/80',
                favorite ? 'text-primary' : 'text-muted-foreground',
                className,
            )}
        >
            <Icon name={favorite ? 'star-fill' : 'star'} className="h-3.5 w-3.5" />
        </button>
    );
};

/**
 * Sampling knobs an agent sets.
 *
 * v2 folded them into the provider request body, which is free-form JSON, so
 * each one is read back with an explicit check rather than trusted.
 */
const agentSampling = (agent: Agent, key: 'temperature' | 'topP'): number | undefined => {
    const value = agent.request?.body?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const agentTemperature = (agent: Agent): number | undefined => agentSampling(agent, 'temperature');
const agentTopP = (agent: Agent): number | undefined => agentSampling(agent, 'topP');

/**
 * The effect a ruleset gives an action, most specific rule last.
 *
 * v2 rules are `{ action, resource, effect }`: `action` is the capability
 * ("edit", "shell"), `resource` the pattern it applies to. A wildcard rule for
 * the action wins over the catch-all `*` rule.
 */
const resolveWildcardPermissionEffect = (rules: PermissionRuleset, action: string): PermissionEffect | undefined => {
    for (let i = rules.length - 1; i >= 0; i -= 1) {
        const rule = rules[i];
        if (rule.action === action && rule.resource === '*') {
            return rule.effect;
        }
    }

    for (let i = rules.length - 1; i >= 0; i -= 1) {
        const rule = rules[i];
        if (rule.action === '*' && rule.resource === '*') {
            return rule.effect;
        }
    }

    return undefined;
};
=======
const buildModelRefKey = (providerID: string, modelID: string) => `${providerID}:${modelID}`;

const selectSessionRecordAgent = (session: Session | undefined): string | undefined => session?.agent?.trim() || undefined;
const selectLatestReplyModelChoice = (messages: Message[], state: State) => findLatestUserModelChoice(
    messages,
    (messageId) => state.part[messageId],
);


const AgentDescriptionTooltip: React.FC<{
    description?: string;
    children: React.ReactElement;
}> = ({ description, children }) => {
    if (!description) {
        return children;
    }

    return (
        <Tooltip delayDuration={450}>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent
                side="right"
                sideOffset={8}
                className="max-w-xs text-start transition-none data-[starting-style]:opacity-100 data-[starting-style]:scale-100 data-[ending-style]:opacity-100 data-[ending-style]:scale-100"
            >
                <span className="typography-meta text-muted-foreground">{description}</span>
            </TooltipContent>
        </Tooltip>
    );
};

const AgentFavoriteToggle: React.FC<{
    favorite: boolean;
    onToggle: () => void;
    className?: string;
}> = ({ favorite, onToggle, className }) => {
    const { t } = useI18n();
    const label = favorite ? t('chat.modelControls.removeFromFavorites') : t('chat.modelControls.agentFavoriteAdd');
    const keepFromRow = (event: React.SyntheticEvent) => {
        event.preventDefault();
        event.stopPropagation();
    };
    return (
        <button
            type="button"
            aria-pressed={favorite}
            aria-label={label}
            title={label}
            onPointerDown={keepFromRow}
            onPointerUp={keepFromRow}
            onMouseUp={keepFromRow}
            onClick={(event) => {
                keepFromRow(event);
                onToggle();
            }}
            className={cn(
                'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded hover:text-primary/80',
                favorite ? 'text-primary' : 'text-muted-foreground',
                className,
            )}
        >
            <Icon name={favorite ? 'star-fill' : 'star'} className="h-3.5 w-3.5" />
        </button>
    );
};

const agentSampling = (agent: Agent, key: 'temperature' | 'topP'): number | undefined => {
    const value = agent.request?.body?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const agentTemperature = (agent: Agent): number | undefined => agentSampling(agent, 'temperature');
const agentTopP = (agent: Agent): number | undefined => agentSampling(agent, 'topP');

const resolveWildcardPermissionEffect = (rules: PermissionRuleset, action: string): PermissionEffect | undefined => {
    for (let i = rules.length - 1; i >= 0; i -= 1) {
        const rule = rules[i];
        if (rule.action === action && rule.resource === '*') {
            return rule.effect;
        }
    }

    for (let i = rules.length - 1; i >= 0; i -= 1) {
        const rule = rules[i];
        if (rule.action === '*' && rule.resource === '*') {
            return rule.effect;
        }
    }

    return undefined;
};
>>>>>>> upstream/main

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
<<<<<<< HEAD
||||||| bc50ba56aa
    /** Shows the agent picker alone, for a composer whose models are chosen elsewhere. Desktop only. */
    agentOnly?: boolean;
    /**
     * Picker effort changes become the model's remembered level. Off for a
     * BTW fork, whose own effort must not change the main chat's default.
     */
    rememberVariantPicks?: boolean;
=======
    agentOnly?: boolean;
    rememberVariantPicks?: boolean;
>>>>>>> upstream/main
} & (
<<<<<<< HEAD
        | { selection?: never; sessionId?: never; agentSelectable?: never }
        | {
            selection: ComposerModelSelection;
            sessionId: string | null;
            /** Offers the agent picker and saves the pick for `sessionId` (a chat pinned in the side panel). */
            agentSelectable?: boolean;
        }
    );
||||||| bc50ba56aa
    | { selection?: never; sessionId?: never; modelSelectorOpen?: never; onModelSelectorOpenChange?: never }
    | {
        selection: BtwSelection;
        /** The session an agent pick is saved for: a chat pinned in the side panel, or a BTW fork. */
        sessionId: string | null;
        /**
         * The model picker's open state, owned by a composer that answers the
         * model and effort shortcuts for this selection (BTW). The tooltips
         * then name those shortcuts.
         */
        modelSelectorOpen?: boolean;
        onModelSelectorOpenChange?: (open: boolean) => void;
    }
);

/** Beside "Loading" the shared spinner; beside "Unavailable", an error, a still warning. */
const ReadinessMark: React.FC<{ unavailable: boolean; className: string }> = ({ unavailable, className }) => (
    unavailable ? <Icon name="error-warning" className={className} /> : <Spinner className={className} />
);
=======
    | { selection?: never; sessionId?: never; modelSelectorOpen?: never; onModelSelectorOpenChange?: never }
    | {
        selection: BtwSelection;
        sessionId: string | null;
        modelSelectorOpen?: boolean;
        onModelSelectorOpenChange?: (open: boolean) => void;
    }
);

const ReadinessMark: React.FC<{ unavailable: boolean; className: string }> = ({ unavailable, className }) => (
    unavailable ? <Icon name="error-warning" className={className} /> : <Spinner className={className} />
);
>>>>>>> upstream/main

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
<<<<<<< HEAD
    const currentSessionId = useSessionUIStore((s) => selection ? null : s.currentSessionId);
    const getDirectoryForSession = useSessionUIStore((s) => s.getDirectoryForSession);
    const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
    const currentSessionDirectory = (controlledSessionId ? getDirectoryForSession(controlledSessionId) : undefined)
        ?? (currentSessionId ? getDirectoryForSession(currentSessionId) : undefined)
        ?? currentDirectory;
    const { isReady, isUnavailable } = useCatalogReadiness('models', currentSessionDirectory);
    const { isReady: canSelectAgent } = useCatalogReadiness('agents', currentSessionDirectory);
||||||| bc50ba56aa
    // A controlled picker (a chat pinned in the side panel, a BTW fork) lists
    // the catalog of its own session's folder, which can be another one than
    // the main chat's active folder. The main chat keeps the active catalog.
    const columnDirectory = useChatSessionSelection().directory;
    const catalogDirectory = selection ? columnDirectory ?? undefined : undefined;
    const { isReady, isUnavailable } = useOpenCodeReadiness('models', catalogDirectory);
    const { isReady: canSelectAgent } = useOpenCodeReadiness('agents', catalogDirectory);
=======
    const columnDirectory = useChatSessionSelection().directory;
    const catalogDirectory = selection ? columnDirectory ?? undefined : undefined;
    const { isReady, isUnavailable } = useOpenCodeReadiness('models', catalogDirectory);
    const { isReady: canSelectAgent } = useOpenCodeReadiness('agents', catalogDirectory);
>>>>>>> upstream/main
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
<<<<<<< HEAD
||||||| bc50ba56aa
    const getCurrentAgent = useConfigStore((state) => state.getCurrentAgent);
    // Use visible agents (excludes hidden internal agents)
    const agents = React.useMemo(() => filterVisibleAgents(catalogAgents), [catalogAgents]);
    const primaryAgents = React.useMemo(() => agents.filter((agent) => agent.mode === 'primary'), [agents]);
=======
    const getCurrentAgent = useConfigStore((state) => state.getCurrentAgent);
    const agents = React.useMemo(() => filterVisibleAgents(catalogAgents), [catalogAgents]);
    const primaryAgents = React.useMemo(() => agents.filter((agent) => agent.mode === 'primary'), [agents]);
>>>>>>> upstream/main
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

<<<<<<< HEAD
    // Controlled selections never restore from the main session or its history.
||||||| bc50ba56aa
    // Controlled selections never restore from the main session or its history.
    const currentSessionId = useSessionUIStore((s) => selection ? null : s.currentSessionId);
    const getDirectoryForSession = useSessionUIStore((s) => s.getDirectoryForSession);
=======
    const currentSessionId = useSessionUIStore((s) => selection ? null : s.currentSessionId);
    const getDirectoryForSession = useSessionUIStore((s) => s.getDirectoryForSession);
>>>>>>> upstream/main
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

<<<<<<< HEAD
    // The session's saved profile takes precedence over the main draft selection.
||||||| bc50ba56aa
    // Prefer per-session selection over global config to avoid flicker during server-driven mode switches.
=======
>>>>>>> upstream/main
    const uiAgentName = currentSessionId
        ? (sessionSavedAgentName || stickySessionAgentName || currentAgentName)
        : currentAgentName;
<<<<<<< HEAD
    const effortAgentKey = uiAgentName ?? ROOT_SELECTION_AGENT;
    const savedReasoningEffort = currentSessionId
        ? getAgentModelReasoningEffortForSession(currentSessionId, effortAgentKey, currentProviderId, currentModelId)
||||||| bc50ba56aa
    // Display only, like `knownCurrentModel`: while this directory's agents
    // are still arriving, show the chosen (or default) agent as another
    // catalog knows it instead of "Select agent".
    // The send would stop with an error, so the picker says so beforehand.
    const agentUnavailable = useAgentMissingFromCatalog(uiAgentName);
    const agentUnavailableText = agentUnavailable && uiAgentName
        ? t('chat.modelControls.agentUnavailable', { agent: uiAgentName })
=======
    const agentUnavailable = useAgentMissingFromCatalog(uiAgentName);
    const agentUnavailableText = agentUnavailable && uiAgentName
        ? t('chat.modelControls.agentUnavailable', { agent: uiAgentName })
>>>>>>> upstream/main
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

<<<<<<< HEAD
    // Separate state for agent selector to avoid conflict with model selector
    const { favoriteModelsList, recentModelsList } = useModelLists();
    // Auto routing: the server resolves `openchamber/auto` into a real model per
    // send. Offered only while the server says it can honour it, in the main
    // composer and in controlled selections (BTW) alike.
||||||| bc50ba56aa
    // Separate state for agent selector to avoid conflict with model selector
    const [isAgentSelectorOpen, setIsAgentSelectorOpen] = React.useState(false);
    const { favoriteModelsList, recentModelsList } = useModelLists(catalogDirectory);
    // Auto routing: the server resolves `openchamber/auto` into a real model per
    // send. Offered only while the server says it can honour it, in the main
    // composer and in controlled selections (BTW) alike.
=======
    const [isAgentSelectorOpen, setIsAgentSelectorOpen] = React.useState(false);
    const { favoriteModelsList, recentModelsList } = useModelLists(catalogDirectory);
>>>>>>> upstream/main
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
<<<<<<< HEAD
||||||| bc50ba56aa
    const isVSCodeRuntime = useIsVSCodeRuntime();
    // Only use mobile panels on actual mobile devices, VSCode uses desktop dropdowns
=======
    const isVSCodeRuntime = useIsVSCodeRuntime();
>>>>>>> upstream/main
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
<<<<<<< HEAD
    const [expandedMobileProviders, setExpandedMobileProviders] = React.useState<Set<string>>(() => {
        const initial = new Set<string>();
        if (currentProviderId) {
            initial.add(currentProviderId);
        }
        return initial;
    });
    // Use global state for model selector (allows Ctrl+M shortcut)
||||||| bc50ba56aa
    // Use global state for model selector (allows Ctrl+M shortcut)
=======
>>>>>>> upstream/main
    const agentMenuOpen = isModelSelectorOpen;
<<<<<<< HEAD
    const setAgentMenuOpen = selection ? setLocalModelSelectorOpen : setModelSelectorOpen;
||||||| bc50ba56aa
    // The model and agent menus open upward from the composer, and downward
    // only when the composer sits too close to the top to fit them.
    const modelTriggerRef = React.useRef<HTMLDivElement>(null);
    const agentTriggerRef = React.useRef<HTMLDivElement>(null);
    const agentListRef = React.useRef<HTMLDivElement>(null);
    const modelMenuSide = usePopupSideOnOpen(agentMenuOpen, modelTriggerRef, 'top');
    const agentMenuSide = usePopupSideOnOpen(isAgentSelectorOpen, agentTriggerRef, 'top');
    // A picker that now names a longer or shorter choice eases into its new width.
    const variantTriggerRef = React.useRef<HTMLDivElement>(null);
    useWidthMorph(modelTriggerRef);
    useWidthMorph(agentTriggerRef);
    useWidthMorph(variantTriggerRef);
    const setAgentMenuOpen = selection ? onModelSelectorOpenChange ?? setLocalModelSelectorOpen : setModelSelectorOpen;
=======
    const modelTriggerRef = React.useRef<HTMLDivElement>(null);
    const agentTriggerRef = React.useRef<HTMLDivElement>(null);
    const agentListRef = React.useRef<HTMLDivElement>(null);
    const modelMenuSide = usePopupSideOnOpen(agentMenuOpen, modelTriggerRef, 'top');
    const agentMenuSide = usePopupSideOnOpen(isAgentSelectorOpen, agentTriggerRef, 'top');
    const variantTriggerRef = React.useRef<HTMLDivElement>(null);
    useWidthMorph(modelTriggerRef);
    useWidthMorph(agentTriggerRef);
    useWidthMorph(variantTriggerRef);
    const setAgentMenuOpen = selection ? onModelSelectorOpenChange ?? setLocalModelSelectorOpen : setModelSelectorOpen;
>>>>>>> upstream/main
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

<<<<<<< HEAD
    // Handle agent selector close behavior
||||||| bc50ba56aa
    // Handle agent selector close behavior
    const [agentSearchQuery, setAgentSearchQuery] = React.useState('');
    React.useEffect(() => {
        if (isAgentSelectorOpen) return;
        // Every picker drops its query, so the next open lists every agent.
        setAgentSearchQuery('');
        // The focus return is the main composer's: a controlled picker's own
        // column owns where the caret goes.
        if (!selection && !isCompact) requestAnimationFrame(focusColumnInput);
    }, [focusColumnInput, isAgentSelectorOpen, isCompact, selection]);
=======
    const [agentSearchQuery, setAgentSearchQuery] = React.useState('');
    React.useEffect(() => {
        if (isAgentSelectorOpen) return;
        setAgentSearchQuery('');
        if (!selection && !isCompact) requestAnimationFrame(focusColumnInput);
    }, [focusColumnInput, isAgentSelectorOpen, isCompact, selection]);
>>>>>>> upstream/main



    const buttonHeight = isMobile ? 'h-9' : 'h-8';
    const controlIconSize = isMobile ? 'size-5' : 'size-4';
    const providerLogoSize = isMobile ? 'size-[21px]' : 'size-[17px]';
    const controlTextSize = isCompact ? 'typography-micro' : 'typography-meta';
<<<<<<< HEAD
    const inlineGapClass = isMobile ? 'gap-x-1' : 'gap-x-3';
||||||| bc50ba56aa
    const inlineGapClass = sizeVariant === 'mobile' ? 'gap-x-1' : sizeVariant === 'vscode' ? 'gap-x-2' : 'gap-x-3';
=======
    const inlineGapClass = sizeVariant === 'mobile' ? 'gap-x-1' : sizeVariant === 'vscode' ? 'gap-x-2' : 'gap-x-4';
>>>>>>> upstream/main

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
<<<<<<< HEAD
    // Display only: a directory still starting can expose part of its catalog
    // for a second or two, so a known model name stays on screen. Selection
    // and validation keep reading the active catalog.
||||||| bc50ba56aa
    // Display only: a directory OpenCode is still starting lists part of its
    // catalog for a second or two, so the name and efforts another catalog
    // knows for this model stay on screen. Everything that decides or
    // validates the selection keeps reading the active catalog.
=======
>>>>>>> upstream/main
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

<<<<<<< HEAD
    const hasEfforts = effortOptions.length > 0;
    const routeOptions = currentCatalogModel?.variants ?? [];
    const hasVariants = routeOptions.length > 0;
||||||| bc50ba56aa
    // Compute from current model each render to avoid stale variants
    // in draft/session transitions.
    // `getCurrentModelVariants()` builds a new array each call. The effort
    // effect below depends on this list, and a fresh identity on every store
    // tick (a form event, a status ping) re-ran it and briefly re-applied the
    // inherited effort over the user's pick — the picker flickered. Keyed on
    // the content so identity only changes when the variants do.
    const rawAvailableVariants = selection
        ? listModelVariantIds(currentProvider?.models.find((model) => model.id === currentModelId)?.variants)
        : getCurrentModelVariants();
    const availableVariantsKey = rawAvailableVariants.join('\u0000');
    const availableVariants = React.useMemo(
        () => (availableVariantsKey ? availableVariantsKey.split('\u0000') : []),
        [availableVariantsKey],
    );
    const displayVariants = React.useMemo(
        () => (availableVariants.length > 0 || !knownCurrentModel
            ? availableVariants
            : listModelVariantIds(knownCurrentModel.variants)),
        [availableVariants, knownCurrentModel],
    );
    const hasVariants = displayVariants.length > 0;
=======
    const rawAvailableVariants = selection
        ? listModelVariantIds(currentProvider?.models.find((model) => model.id === currentModelId)?.variants)
        : getCurrentModelVariants();
    const availableVariantsKey = rawAvailableVariants.join('\u0000');
    const availableVariants = React.useMemo(
        () => (availableVariantsKey ? availableVariantsKey.split('\u0000') : []),
        [availableVariantsKey],
    );
    const displayVariants = React.useMemo(
        () => (availableVariants.length > 0 || !knownCurrentModel
            ? availableVariants
            : listModelVariantIds(knownCurrentModel.variants)),
        [availableVariants, knownCurrentModel],
    );
    const hasVariants = displayVariants.length > 0;
>>>>>>> upstream/main

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
<<<<<<< HEAD
    // A sent choice may restore the composer after its transcript is loaded.
    // Canonical sessions do not carry a separate legacy agent-selection record.
||||||| bc50ba56aa
    // OpenCode 2 keeps the selection on the session record itself (`model`
    // with its variant, and `agent`), and that is what the next prompt runs
    // on, so it is the authority when a session opens. The last assistant
    // reply is the fallback for a record that has no model yet. The record's
    // agent is followed by its own effect below, so a choice carries an agent
    // only when the record has none.
    // Both are read as derived choices: the record and the message list are
    // replaced on every streamed step while the choice stays the same.
    const sessionRecordAgent = useSessionSelector(
        currentSessionId ?? undefined,
        currentSessionDirectory ?? undefined,
        selectSessionRecordAgent,
    );
=======
    const sessionRecordAgent = useSessionSelector(
        currentSessionId ?? undefined,
        currentSessionDirectory ?? undefined,
        selectSessionRecordAgent,
    );
>>>>>>> upstream/main
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
<<<<<<< HEAD
||||||| bc50ba56aa
        // The choice is read from the reply's parts, which can load after it.
        true,
=======
        true,
>>>>>>> upstream/main
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

<<<<<<< HEAD
        let currentInherited: string | undefined;
||||||| bc50ba56aa
        // Keep a `null` inherited choice: it is an explicit Default the model
        // remembers, not "nothing chosen".
        let currentInherited: string | null | undefined;
=======
        let currentInherited: string | null | undefined;
>>>>>>> upstream/main
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

<<<<<<< HEAD
    /**
     * The session's recorded choice for this model, in the selection store's
     * three states: a route name, `null` for an explicit "Default", and
     * `undefined` for no choice at all. Collapsing `null` into `undefined` here
     * would hand a real "Default" back to the callers as "nothing chosen", and
     * they would re-record it as a choice on the next write.
     */
    const resolveModelVariantSelection = React.useCallback((providerId: string, modelId: string): string | null | undefined => {
||||||| bc50ba56aa
    /**
     * The session's recorded choice for this model, in the selection store's
     * three states: an effort name, `null` for an explicit "Default", and
     * `undefined` for no choice at all. Collapsing `null` into `undefined` here
     * would hand a real "Default" back to the callers as "nothing chosen", and
     * they would re-record it as a choice on the next write.
     */
    const resolveModelVariantSelection = React.useCallback((
        providerId: string,
        modelId: string,
        options?: { includeInherited?: boolean },
    ): string | null | undefined => {
=======
    const resolveModelVariantSelection = React.useCallback((
        providerId: string,
        modelId: string,
        options?: { includeInherited?: boolean },
    ): string | null | undefined => {
>>>>>>> upstream/main
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

<<<<<<< HEAD
        if (currentProviderId === providerId && currentModelId === modelId && currentVariant && variantOptions.includes(currentVariant)) {
            return currentVariant;
||||||| bc50ba56aa
        // Restoring a session must not record an inherited level as the
        // session's own pick; the effort effect resolves it afterwards.
        if (options?.includeInherited === false) {
            return undefined;
=======
        if (options?.includeInherited === false) {
            return undefined;
>>>>>>> upstream/main
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

<<<<<<< HEAD
    /**
     * Records the route selection independently of reasoning effort. `null`
     * explicitly chooses Default; `undefined` leaves the inherited route in place.
     */
||||||| bc50ba56aa
    const rememberVariantForModel = React.useCallback((providerId: string, modelId: string, variant: string | null | undefined) => {
        if (!rememberVariantPicks) return;
        rememberEffort(providerId, modelId, variant ?? null);
    }, [rememberVariantPicks]);

    /**
     * Records `variant` as this session's effort for the model, in the same
     * three states the selection store defines: an effort name, `null` for an
     * explicit "Default", `undefined` for no choice so the inherited effort
     * applies. Callers decide which one they mean — the picker turns its own
     * "Default" into `null`, while restore paths pass `undefined` through when
     * they found nothing, because "the history carries no effort" is not the
     * user having chosen "Default".
     */
=======
    const rememberVariantForModel = React.useCallback((providerId: string, modelId: string, variant: string | null | undefined) => {
        if (!rememberVariantPicks) return;
        rememberEffort(providerId, modelId, variant ?? null);
    }, [rememberVariantPicks]);

>>>>>>> upstream/main
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

<<<<<<< HEAD
||||||| bc50ba56aa
    // Every agent switch lands on the session record (`session.agent.selected`),
    // whoever made it: this composer's send, another client, a plugin. A switch
    // the composer has not followed yet is newer than what the composer shows,
    // so the picker takes it, unless a pick made here is still unsent: the
    // next send switches the session to that pick. An unchanged record leaves
    // a pick in place, across reopen and reload too. The model is not part of a switch:
    // the session keeps running on its own, so the model shown (Auto included)
    // stays as it is; a model switch is followed by the restore below.
    React.useEffect(() => {
        if (!currentSessionId || !contextHydrated || !sessionRecordAgent) return;
        if (!useSelectionStore.getState().followSessionAgent(currentSessionId, sessionRecordAgent)) return;
        if (useConfigStore.getState().currentAgentName === sessionRecordAgent) return;
        // The model this session last used with that agent is not what it
        // runs on now, so the agent-change effect must not bring it back.
        prevAgentNameRef.current = sessionRecordAgent;
        setAgent(sessionRecordAgent, { keepModel: true });
    }, [contextHydrated, currentSessionId, sessionRecordAgent, setAgent]);
=======
    React.useEffect(() => {
        if (!currentSessionId || !contextHydrated || !sessionRecordAgent) return;
        if (!useSelectionStore.getState().followSessionAgent(currentSessionId, sessionRecordAgent)) return;
        if (useConfigStore.getState().currentAgentName === sessionRecordAgent) return;
        prevAgentNameRef.current = sessionRecordAgent;
        setAgent(sessionRecordAgent, { keepModel: true });
    }, [contextHydrated, currentSessionId, sessionRecordAgent, setAgent]);
>>>>>>> upstream/main

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

<<<<<<< HEAD
        // A message without an agent retains the composer's saved profile.
||||||| bc50ba56aa
        // Without an agent in the choice, the session's agent is whatever the
        // composer holds for it now: the record's, once followed, or a pick
        // made after it.
=======
>>>>>>> upstream/main
        const restoreAgentName = latestLoadedUserChoice.agent || resolveLiveAgentName() || undefined;

<<<<<<< HEAD
        // The record's model follows the agent's rule: one the composer has
        // not reconciled with yet is a newer switch (another client, a plugin)
        // and outranks a model or route picked here. Auto is the exception:
        // with Auto the router itself switches the session's model each turn,
        // and the picker keeps showing Auto.
||||||| bc50ba56aa
        // The record's model follows the agent's rule: one the composer has
        // not reconciled with yet is a newer switch (another client, a plugin)
        // and outranks a model or effort picked here. Auto is the exception:
        // with Auto the router itself switches the session's model each turn,
        // and the picker keeps showing Auto.
=======
>>>>>>> upstream/main
        const recordModelKey = sessionRecordChoice && latestLoadedUserChoice === sessionRecordChoice
            ? `${formatModelRef(sessionRecordChoice)}#${sessionRecordChoice.variant ?? ''}`
            : null;
        const recordModelSwitched = recordModelKey !== null
            && useSelectionStore.getState().isSessionModelSwitched(currentSessionId, recordModelKey);
        const markRecordModelFollowed = () => {
            if (recordModelKey) useSelectionStore.getState().markSessionModelFollowed(currentSessionId, recordModelKey);
        };

<<<<<<< HEAD
        // History can never say "Auto": the server replaces the sentinel with
        // a real model before the runtime stores the message. A saved Auto is the
        // newer truth, so it wins over the model the last turn actually ran on.
        // Until the routing state has loaded, Auto cannot be applied yet, so
        // the restore stays pending instead of letting history overwrite it.
||||||| bc50ba56aa
        // History can never say "Auto": the server replaces the sentinel with
        // a real model before OpenCode stores the message. A saved Auto is the
        // newer truth, so it wins over the model the last turn actually ran on.
        // Until the routing state has loaded, Auto cannot be applied yet, so
        // the restore stays pending instead of letting history overwrite it.
=======
>>>>>>> upstream/main
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
<<<<<<< HEAD
        // A newer switch brings its own route; a record without one says
        // nothing about routing, so the saved choice stays.
||||||| bc50ba56aa
        // A newer switch brings its own effort; a record without one says
        // nothing about effort, so the saved choice stays.
=======
>>>>>>> upstream/main
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

<<<<<<< HEAD
        // The route is not written again here: `applyModelSelectionWithVariant`
        // above already recorded `historicalVariant` for this same agent and
        // model, and a second write can only disagree with the first.
||||||| bc50ba56aa
        // The effort is not written again here: `applyModelSelectionWithVariant`
        // above already recorded `historicalVariant` for this same agent and
        // model, and a second write can only disagree with the first.
=======
>>>>>>> upstream/main
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

<<<<<<< HEAD
            // Keep a valid saved profile instead of replacing it with a fallback.
||||||| bc50ba56aa
            // If we already have a valid agent selected (often from server-injected mode switch),
            // don't override it with a fallback.
=======
>>>>>>> upstream/main
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

<<<<<<< HEAD
||||||| bc50ba56aa
    // The picker shows the session's agent, while a send carries the app-wide
    // one. That one drifts on its own: another session or folder sets it, an
    // agent list reload resolves it again. Whatever moved it, it goes back to
    // the session's agent, so the agent shown is the agent sent; the switch
    // brings back the model this session last used with it, and keeps Auto.
    // Both are read live: the restores above may have moved either one in
    // this same commit.
    React.useEffect(() => {
        if (selection || !currentSessionId || !contextHydrated || !agentsResolved) return;
        const sessionAgentName = useSelectionStore.getState().getSessionAgentSelection(currentSessionId);
        if (!sessionAgentName || sessionAgentName === useConfigStore.getState().currentAgentName) return;
        if (!agents.some((agent) => agent.name === sessionAgentName)) return;
        setAgent(sessionAgentName, { keepModel: isAutoSelected });
    }, [agents, agentsResolved, contextHydrated, currentAgentName, currentSessionId, isAutoSelected, selection, sessionSavedAgentName, setAgent]);

=======
    React.useEffect(() => {
        if (selection || !currentSessionId || !contextHydrated || !agentsResolved) return;
        const sessionAgentName = useSelectionStore.getState().getSessionAgentSelection(currentSessionId);
        if (!sessionAgentName || sessionAgentName === useConfigStore.getState().currentAgentName) return;
        if (!agents.some((agent) => agent.name === sessionAgentName)) return;
        setAgent(sessionAgentName, { keepModel: isAutoSelected });
    }, [agents, agentsResolved, contextHydrated, currentAgentName, currentSessionId, isAutoSelected, selection, sessionSavedAgentName, setAgent]);

>>>>>>> upstream/main
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

<<<<<<< HEAD
||||||| bc50ba56aa
    React.useEffect(() => {
        if (selection) return;
        // Missing discovery/context data cannot invalidate a configured effort.
        // Clearing it here also marks the automatic draft selection as manual.
        if (!contextHydrated || !currentAgentName || (currentModelId && !currentModelForMetadata)) return;
=======
    React.useEffect(() => {
        if (selection) return;
        if (!contextHydrated || !currentAgentName || (currentModelId && !currentModelForMetadata)) return;
>>>>>>> upstream/main

<<<<<<< HEAD
    const handleVariantSelect = React.useCallback((variant: string | undefined, providerId = currentProviderId, modelId = currentModelId) => {
        if (!providerId || !modelId) return;
        const route = providers.find((provider) => provider.providerId === providerId)?.models.find((model) => model.modelId === modelId)?.variants.find((option) => option.variant === variant);
        const effort = route?.reasoningEffort;
        if (selection) {
            if (!controlledSessionId || !selection.agent) return;
            commitVariantSelectionForModel(providerId, modelId, variant ?? null);
            saveAgentModelReasoningEffortForSession(controlledSessionId, selection.agent ?? ROOT_SELECTION_AGENT, providerId, modelId, effort ?? 'off');
||||||| bc50ba56aa
        if (!currentProviderId || !currentModelId) {
            // Switching the draft to another directory empties the automatic
            // model until that directory's catalog resolves it; that gap is not
            // a model without efforts and must not erase the one picked.
            if (!providersResolved) return;
            manualVariantSelectionRef.current = false;
            setCurrentVariant(undefined);
=======
        if (!currentProviderId || !currentModelId) {
            if (!providersResolved) return;
            manualVariantSelectionRef.current = false;
            setCurrentVariant(undefined);
>>>>>>> upstream/main
            return;
        }
<<<<<<< HEAD
        commitVariantSelectionForModel(providerId, modelId, variant ?? null);
        setCurrentReasoningEffort(effort ?? 'off');
        const agentName = resolveLiveAgentName();
        if (currentSessionId) saveAgentModelReasoningEffortForSession(currentSessionId, agentName ?? ROOT_SELECTION_AGENT, providerId, modelId, effort ?? 'off');
    }, [commitVariantSelectionForModel, currentModelId, currentProviderId, currentSessionId, providers, resolveLiveAgentName, saveAgentModelReasoningEffortForSession, selection, setCurrentReasoningEffort, controlledSessionId]);
||||||| bc50ba56aa

        if (availableVariants.length === 0) {
            manualVariantSelectionRef.current = false;
            setCurrentVariant(undefined);
            return;
        }

        // The chosen effort does not exist on this model: drop the choice and
        // inherit, rather than pin an explicit "Default" the user never picked.
        if (currentVariant && !availableVariants.includes(currentVariant)) {
            setCurrentVariantOverride(undefined, resolveInheritedVariantForModel(currentProviderId, currentModelId));
            return;
        }

        // Draft state (no session yet): seed from the model's configured default, but don't override
        // user selection while drafting.
        if (!currentSessionId) {
            if (currentVariantSelection.override === undefined && !manualVariantSelectionRef.current) {
                const desired = resolveInheritedVariantForModel(currentProviderId, currentModelId);
                setCurrentVariantOverride(undefined, desired);
            }
            return;
        }

        const savedVariant = getAgentModelVariantForSession(
            currentSessionId,
            currentAgentName,
            currentProviderId,
            currentModelId,
        );

        const inheritedVariant = resolveInheritedVariantForModel(currentProviderId, currentModelId);
        if (savedVariant && availableVariants.includes(savedVariant)) {
            setCurrentVariantOverride(savedVariant, inheritedVariant);
        } else if (savedVariant === null || currentVariantSelection.override === null) {
            // "Default" was picked for this session, or is picked right now.
            setCurrentVariantOverride(null, inheritedVariant);
        } else {
            setCurrentVariantOverride(undefined, inheritedVariant);
        }
        manualVariantSelectionRef.current = false;
    }, [
        availableVariants,
        currentModelForMetadata,
        contextHydrated,
        currentSessionId,
        currentAgentName,
        currentProviderId,
        currentModelId,
        currentVariant,
        currentVariantSelection.override,
        effectiveCurrentVariant,
        getAgentModelVariantForSession,
        providersResolved,
        resolveInheritedVariantForModel,
        setCurrentVariant,
        setCurrentVariantOverride,
        // `getDefaultVariantForModel` reads these from the store; listing them
        // re-resolves the inherited effort when the Settings defaults change.
        settingsDefaultModel,
        settingsDefaultVariant,
        selection,
    ]);

    const handleVariantSelect = React.useCallback((variant: string | undefined) => {
        if (currentProviderId && currentModelId) {
            // Picked in the effort menu, so no effort means the user picked
            // "Default" — a choice, recorded as `null`.
            commitVariantSelectionForModel(currentProviderId, currentModelId, variant ?? null);
            rememberVariantForModel(currentProviderId, currentModelId, variant ?? null);
        }
    }, [commitVariantSelectionForModel, currentModelId, currentProviderId, rememberVariantForModel]);
=======

        if (availableVariants.length === 0) {
            manualVariantSelectionRef.current = false;
            setCurrentVariant(undefined);
            return;
        }

        if (currentVariant && !availableVariants.includes(currentVariant)) {
            setCurrentVariantOverride(undefined, resolveInheritedVariantForModel(currentProviderId, currentModelId));
            return;
        }

        if (!currentSessionId) {
            if (currentVariantSelection.override === undefined && !manualVariantSelectionRef.current) {
                const desired = resolveInheritedVariantForModel(currentProviderId, currentModelId);
                setCurrentVariantOverride(undefined, desired);
            }
            return;
        }

        const savedVariant = getAgentModelVariantForSession(
            currentSessionId,
            currentAgentName,
            currentProviderId,
            currentModelId,
        );

        const inheritedVariant = resolveInheritedVariantForModel(currentProviderId, currentModelId);
        if (savedVariant && availableVariants.includes(savedVariant)) {
            setCurrentVariantOverride(savedVariant, inheritedVariant);
        } else if (savedVariant === null || currentVariantSelection.override === null) {
            setCurrentVariantOverride(null, inheritedVariant);
        } else {
            setCurrentVariantOverride(undefined, inheritedVariant);
        }
        manualVariantSelectionRef.current = false;
    }, [
        availableVariants,
        currentModelForMetadata,
        contextHydrated,
        currentSessionId,
        currentAgentName,
        currentProviderId,
        currentModelId,
        currentVariant,
        currentVariantSelection.override,
        effectiveCurrentVariant,
        getAgentModelVariantForSession,
        providersResolved,
        resolveInheritedVariantForModel,
        setCurrentVariant,
        setCurrentVariantOverride,
        settingsDefaultModel,
        settingsDefaultVariant,
        selection,
    ]);

    const handleVariantSelect = React.useCallback((variant: string | undefined) => {
        if (currentProviderId && currentModelId) {
            commitVariantSelectionForModel(currentProviderId, currentModelId, variant ?? null);
            rememberVariantForModel(currentProviderId, currentModelId, variant ?? null);
        }
    }, [commitVariantSelectionForModel, currentModelId, currentProviderId, rememberVariantForModel]);
>>>>>>> upstream/main

    const handleAgentChange = React.useCallback((agentName: string, options?: { closeModelSelector?: boolean }) => {
        if (selection) {
<<<<<<< HEAD
            if (!agentSelectable || !controlledSessionId) return;
            // The pick belongs to the controlled session only; the app-wide
            // agent stays the main chat's.
            saveSessionAgentSelection(controlledSessionId, agentName);
            const profile = agents.find((agent) => agent.agentId === agentName);
            const model = getAgentModelForSession(controlledSessionId, agentName) ?? profile?.model;
            if (model) {
                saveSessionModelSelection(controlledSessionId, model.providerId, model.modelId);
||||||| bc50ba56aa
            if (!controlledSessionId) return;
            // The pick belongs to the controlled session only; the app-wide
            // agent stays the main chat's.
            pickSessionAgent(controlledSessionId, agentName);
            // An effort is remembered per agent and model, so an agent this
            // session has not run yet has none for the current model. Carry
            // the level the composer is on, including an explicit Default;
            // without it a BTW fork loses the effort it copied from the main
            // chat the moment its agent changes.
            if (
                currentProviderId && currentModelId && selection.variant !== undefined
                && getAgentModelVariantForSession(controlledSessionId, agentName, currentProviderId, currentModelId) === undefined
            ) {
                saveAgentModelVariantForSession(controlledSessionId, agentName, currentProviderId, currentModelId, selection.variant);
=======
            if (!controlledSessionId) return;
            pickSessionAgent(controlledSessionId, agentName);
            if (
                currentProviderId && currentModelId && selection.variant !== undefined
                && getAgentModelVariantForSession(controlledSessionId, agentName, currentProviderId, currentModelId) === undefined
            ) {
                saveAgentModelVariantForSession(controlledSessionId, agentName, currentProviderId, currentModelId, selection.variant);
>>>>>>> upstream/main
            }
            if (options?.closeModelSelector ?? true) {
                setAgentMenuOpen(false);
            }
            return;
        }
        try {
<<<<<<< HEAD
||||||| bc50ba56aa
            // The pick reaches the session with the next send; held as
            // unsent until then, so the session record cannot replace it.
            if (currentSessionId) {
                pickSessionAgent(currentSessionId, agentName);
            }
=======
            if (currentSessionId) {
                pickSessionAgent(currentSessionId, agentName);
            }
>>>>>>> upstream/main
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
<<<<<<< HEAD
            // `applyVariant` means an explicit route selection; no route means Default.
||||||| bc50ba56aa
            // `applyVariant` is only set when the user adjusted the effort in
            // the model picker, so no effort means an explicit "Default".
=======
>>>>>>> upstream/main
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


<<<<<<< HEAD
||||||| bc50ba56aa
        const hasCustomPrompt = Boolean(currentAgent.system && currentAgent.system.trim().length > 0);
        const hasModelConfig = currentAgent.model?.providerID && currentAgent.model?.id;
        const hasTemperatureOrTopP = agentTemperature(currentAgent) !== undefined || agentTopP(currentAgent) !== undefined;

        const summarizePermission = (permissionName: string): { mode: EditPermissionMode; label: string } => {
            const rules = currentAgent.permissions ?? [];
            const hasCustom = rules.some((rule) => rule.action === permissionName && rule.resource !== '*');
            const action = resolveWildcardPermissionEffect(rules, permissionName) ?? 'ask';

            if (hasCustom) {
                return { mode: 'ask', label: t('chat.modelControls.permissionLabel.custom') };
            }

            if (action === 'allow') return { mode: 'allow', label: t('chat.modelControls.permissionLabel.allow') };
            if (action === 'deny') return { mode: 'deny', label: t('chat.modelControls.permissionLabel.deny') };
            return { mode: 'ask', label: t('chat.modelControls.permissionLabel.ask') };
        };

        const editPermissionSummary = summarizePermission('edit');
        const bashPermissionSummary = summarizePermission(OPENCODE_TOOLS.shell);
        const webfetchPermissionSummary = summarizePermission(OPENCODE_TOOLS.webfetch);

        return (
            <MobileOverlayPanel
                open={true}
                onClose={closeMobileTooltip}
                title={agentLabel(currentAgent)}
            >
                <div className="flex flex-col gap-1.5">
                    {}
                    {currentAgent.description && (
                        <div className="oc-tile rounded-lg px-3 py-2">
                            <div className="typography-meta text-foreground">{currentAgent.description}</div>
                        </div>
                    )}

                    {}
                    <div className="oc-tile rounded-lg px-3 py-2">
                        <div className="typography-micro text-muted-foreground mb-0.5">{t('chat.modelControls.mode')}</div>
                        <div className="typography-meta text-foreground font-medium">
                            {currentAgent.mode === 'primary'
                                ? t('chat.modelControls.modeValue.primary')
                                : currentAgent.mode === 'subagent'
                                    ? t('chat.modelControls.modeValue.subagent')
                                    : currentAgent.mode === 'all'
                                        ? t('chat.modelControls.modeValue.all')
                                        : t('chat.modelControls.modeValue.none')}
                        </div>
                    </div>

                    {}
                    {(hasModelConfig || hasTemperatureOrTopP) && (
                        <div className="oc-tile rounded-lg px-3 py-2">
                            <div className="typography-micro text-muted-foreground mb-1">{t('chat.modelControls.model')}</div>
                            {hasModelConfig && (
                                <div className="typography-meta text-foreground font-medium mb-1">
                                    {currentAgent.model!.providerID} / {currentAgent.model!.id}
                                </div>
                            )}
                            {hasTemperatureOrTopP && (
                                <div className="flex flex-col gap-0.5">
                                    {agentTemperature(currentAgent) !== undefined && (
                                        <div className="flex items-center justify-between">
                                            <span className="typography-meta text-muted-foreground">{t('chat.modelControls.temperature')}</span>
                                            <span className="typography-meta font-medium text-foreground">{agentTemperature(currentAgent)}</span>
                                        </div>
                                    )}
                                    {agentTopP(currentAgent) !== undefined && (
                                        <div className="flex items-center justify-between">
                                            <span className="typography-meta text-muted-foreground">{t('chat.modelControls.topP')}</span>
                                            <span className="typography-meta font-medium text-foreground">{agentTopP(currentAgent)}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {}
                    <div className="oc-tile rounded-lg px-3 py-2">
                        <div className="typography-micro text-muted-foreground mb-1">{t('chat.modelControls.permissions')}</div>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground">{t('chat.modelControls.edit')}</span>
                                <div className="flex items-center gap-1.5">
                                    <EditModeIcon mode={editPermissionSummary.mode} className="size-3.5" />
                                    <span className="typography-meta font-medium text-foreground">
                                        {editPermissionSummary.label}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground">{t('chat.modelControls.bash')}</span>
                                <div className="flex items-center gap-1.5">
                                    <EditModeIcon mode={bashPermissionSummary.mode} className="size-3.5" />
                                    <span className="typography-meta font-medium text-foreground">
                                        {bashPermissionSummary.label}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground">{t('chat.modelControls.webFetch')}</span>
                                <div className="flex items-center gap-1.5">
                                    <EditModeIcon mode={webfetchPermissionSummary.mode} className="size-3.5" />
                                    <span className="typography-meta font-medium text-foreground">
                                        {webfetchPermissionSummary.label}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {}
                    {hasCustomPrompt && (
                        <div className="oc-tile rounded-lg px-3 py-2">
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground">{t('chat.modelControls.customPrompt')}</span>
                                <Icon name="checkbox-circle" className="size-4 text-foreground" />
                            </div>
                        </div>
                    )}
                </div>
            </MobileOverlayPanel>
        );
    };

    // Chosen in the phone's model sheet: the row runs with the effort it would
    // show, and no effort there means "Default".
    const handleMobileModelApply = (providerId: string, modelId: string) => {
        const result = selection
            ? applyModelSelectionWithVariant(providerId, modelId, resolveModelVariantSelection(providerId, modelId) ?? null)
            : tryApplyModelSelection(providerId, modelId);
        if (result !== 'applied') {
            if (result === 'provider-missing') {
                console.error('[ModelControls] Provider not available for selection:', providerId);
            } else if (result === 'model-missing') {
                console.error('[ModelControls] Model not available for selection:', { providerId, modelId });
            }
            return;
        }
        const pickedSessionId = selection ? controlledSessionId : currentSessionId;
        if (pickedSessionId) useSelectionStore.getState().pickSessionModel(pickedSessionId, providerId, modelId);
        if (!selection) setLastSelectedModel(providerId, modelId);
        setMobileDetailsEntry(null);
        closeMobilePanel();
        requestAnimationFrame(focusColumnInput);
    };

    // The phone's sheet draws the desktop model list: one line per model and
    // details on a long press. The effort lives in the composer, after the model.
=======
        const hasCustomPrompt = Boolean(currentAgent.system && currentAgent.system.trim().length > 0);
        const hasModelConfig = currentAgent.model?.providerID && currentAgent.model?.id;
        const hasTemperatureOrTopP = agentTemperature(currentAgent) !== undefined || agentTopP(currentAgent) !== undefined;

        const summarizePermission = (permissionName: string): { mode: EditPermissionMode; label: string } => {
            const rules = currentAgent.permissions ?? [];
            const hasCustom = rules.some((rule) => rule.action === permissionName && rule.resource !== '*');
            const action = resolveWildcardPermissionEffect(rules, permissionName) ?? 'ask';

            if (hasCustom) {
                return { mode: 'ask', label: t('chat.modelControls.permissionLabel.custom') };
            }

            if (action === 'allow') return { mode: 'allow', label: t('chat.modelControls.permissionLabel.allow') };
            if (action === 'deny') return { mode: 'deny', label: t('chat.modelControls.permissionLabel.deny') };
            return { mode: 'ask', label: t('chat.modelControls.permissionLabel.ask') };
        };

        const editPermissionSummary = summarizePermission('edit');
        const bashPermissionSummary = summarizePermission(OPENCODE_TOOLS.shell);
        const webfetchPermissionSummary = summarizePermission(OPENCODE_TOOLS.webfetch);

        return (
            <MobileOverlayPanel
                open={true}
                onClose={closeMobileTooltip}
                title={agentLabel(currentAgent)}
            >
                <div className="flex flex-col gap-1.5">
                    {}
                    {currentAgent.description && (
                        <div className="oc-tile rounded-lg px-3 py-2">
                            <div className="typography-meta text-foreground">{currentAgent.description}</div>
                        </div>
                    )}

                    {}
                    <div className="oc-tile rounded-lg px-3 py-2">
                        <div className="typography-micro text-muted-foreground mb-0.5">{t('chat.modelControls.mode')}</div>
                        <div className="typography-meta text-foreground font-medium">
                            {currentAgent.mode === 'primary'
                                ? t('chat.modelControls.modeValue.primary')
                                : currentAgent.mode === 'subagent'
                                    ? t('chat.modelControls.modeValue.subagent')
                                    : currentAgent.mode === 'all'
                                        ? t('chat.modelControls.modeValue.all')
                                        : t('chat.modelControls.modeValue.none')}
                        </div>
                    </div>

                    {}
                    {(hasModelConfig || hasTemperatureOrTopP) && (
                        <div className="oc-tile rounded-lg px-3 py-2">
                            <div className="typography-micro text-muted-foreground mb-1">{t('chat.modelControls.model')}</div>
                            {hasModelConfig && (
                                <div className="typography-meta text-foreground font-medium mb-1">
                                    {currentAgent.model!.providerID} / {currentAgent.model!.id}
                                </div>
                            )}
                            {hasTemperatureOrTopP && (
                                <div className="flex flex-col gap-0.5">
                                    {agentTemperature(currentAgent) !== undefined && (
                                        <div className="flex items-center justify-between">
                                            <span className="typography-meta text-muted-foreground">{t('chat.modelControls.temperature')}</span>
                                            <span className="typography-meta font-medium text-foreground">{agentTemperature(currentAgent)}</span>
                                        </div>
                                    )}
                                    {agentTopP(currentAgent) !== undefined && (
                                        <div className="flex items-center justify-between">
                                            <span className="typography-meta text-muted-foreground">{t('chat.modelControls.topP')}</span>
                                            <span className="typography-meta font-medium text-foreground">{agentTopP(currentAgent)}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {}
                    <div className="oc-tile rounded-lg px-3 py-2">
                        <div className="typography-micro text-muted-foreground mb-1">{t('chat.modelControls.permissions')}</div>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground">{t('chat.modelControls.edit')}</span>
                                <div className="flex items-center gap-1.5">
                                    <EditModeIcon mode={editPermissionSummary.mode} className="size-3.5" />
                                    <span className="typography-meta font-medium text-foreground">
                                        {editPermissionSummary.label}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground">{t('chat.modelControls.bash')}</span>
                                <div className="flex items-center gap-1.5">
                                    <EditModeIcon mode={bashPermissionSummary.mode} className="size-3.5" />
                                    <span className="typography-meta font-medium text-foreground">
                                        {bashPermissionSummary.label}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground">{t('chat.modelControls.webFetch')}</span>
                                <div className="flex items-center gap-1.5">
                                    <EditModeIcon mode={webfetchPermissionSummary.mode} className="size-3.5" />
                                    <span className="typography-meta font-medium text-foreground">
                                        {webfetchPermissionSummary.label}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {}
                    {hasCustomPrompt && (
                        <div className="oc-tile rounded-lg px-3 py-2">
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground">{t('chat.modelControls.customPrompt')}</span>
                                <Icon name="checkbox-circle" className="size-4 text-foreground" />
                            </div>
                        </div>
                    )}
                </div>
            </MobileOverlayPanel>
        );
    };

    const handleMobileModelApply = (providerId: string, modelId: string) => {
        const result = selection
            ? applyModelSelectionWithVariant(providerId, modelId, resolveModelVariantSelection(providerId, modelId) ?? null)
            : tryApplyModelSelection(providerId, modelId);
        if (result !== 'applied') {
            if (result === 'provider-missing') {
                console.error('[ModelControls] Provider not available for selection:', providerId);
            } else if (result === 'model-missing') {
                console.error('[ModelControls] Model not available for selection:', { providerId, modelId });
            }
            return;
        }
        const pickedSessionId = selection ? controlledSessionId : currentSessionId;
        if (pickedSessionId) useSelectionStore.getState().pickSessionModel(pickedSessionId, providerId, modelId);
        if (!selection) setLastSelectedModel(providerId, modelId);
        setMobileDetailsEntry(null);
        closeMobilePanel();
        requestAnimationFrame(focusColumnInput);
    };

>>>>>>> upstream/main
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
<<<<<<< HEAD
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
||||||| bc50ba56aa
                <ModelPickerList
                    providers={providers}
                    providerOrder={providerOrder}
                    favoriteModels={favoriteModelsList}
                    recentModels={recentModelsList}
                    hiddenModels={hiddenModels}
                    searchQuery={mobileModelQuery}
                    onSearchQueryChange={setMobileModelQuery}
                    onSelect={(entry) => handleMobileModelApply(entry.providerID, entry.modelID)}
                    labels={modelPickerLabels}
                    selectedModel={currentProviderId && currentModelId ? { providerID: currentProviderId, modelID: currentModelId } : null}
                    leadingEntry={autoEntry}
                    isFavorite={(entry) => isFavoriteModel(entry.providerID, entry.modelID)}
                    onToggleFavorite={(entry) => toggleFavoriteModel(entry.providerID, entry.modelID)}
                    onEntryDetails={(entry) => {
                        // The details take the keys: a search field left focused
                        // under them would close the list on Escape instead.
                        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
                        setMobileDetailsEntry(entry);
                    }}
                    providersStartCollapsed
                    autoFocus={false}
                    tooltipsEnabled={false}
                    maxHeightClassName="min-h-0 flex-1"
                    showKeyboardHints={false}
                    onEscape={() => {
                        if (mobileDetailsEntry) setMobileDetailsEntry(null);
                        else closeMobilePanel();
                    }}
                />
            </MobileOverlayPanel>
        );
    };

    // A long press on a model in the sheet: what the desktop card says, and
    // the star, which rows on a touch screen leave off.
    const renderMobileModelDetails = () => {
        if (!isCompact || !mobileDetailsEntry) return null;
        const { providerID, modelID, model } = mobileDetailsEntry;
        const auto = isAutoModel(providerID, modelID);
        const favorite = isFavoriteModel(providerID, modelID);
        const metadata = mergeModelMetadataWithLiveModel(providerID, model, getModelMetadata(providerID, modelID));
        const providerName = auto ? null : providers.find((provider) => provider.id === providerID)?.name || providerID;
        return (
            <MobileOverlayPanel
                open
                onClose={() => setMobileDetailsEntry(null)}
                title={getModelDisplayName(model)}
                footer={(
                    // Stacked: side by side, "Remove from favorites" outgrew its half.
                    <div className="flex flex-col gap-2">
                        <Button size="lg" className="w-full" onClick={() => handleMobileModelApply(providerID, modelID)}>
                            {t('chat.modelControls.useModel')}
                        </Button>
                        {!auto ? (
                            <Button variant="outline" size="lg" className="w-full gap-1.5" onClick={() => toggleFavoriteModel(providerID, modelID)}>
                                <Icon name={favorite ? 'star-fill' : 'star'} className={cn('size-4', favorite && 'text-primary')} />
                                {favorite ? t('chat.modelControls.removeFromFavorites') : t('chat.modelControls.addToFavorites')}
                            </Button>
                        ) : null}
=======
                <ModelPickerList
                    providers={providers}
                    providerOrder={providerOrder}
                    favoriteModels={favoriteModelsList}
                    recentModels={recentModelsList}
                    hiddenModels={hiddenModels}
                    searchQuery={mobileModelQuery}
                    onSearchQueryChange={setMobileModelQuery}
                    onSelect={(entry) => handleMobileModelApply(entry.providerID, entry.modelID)}
                    labels={modelPickerLabels}
                    selectedModel={currentProviderId && currentModelId ? { providerID: currentProviderId, modelID: currentModelId } : null}
                    leadingEntry={autoEntry}
                    searchAction={selection ? null : { label: t('chat.modelControls.addNewProvider'), icon: 'add', onSelect: openAddProviderSettings }}
                    isFavorite={(entry) => isFavoriteModel(entry.providerID, entry.modelID)}
                    onToggleFavorite={(entry) => toggleFavoriteModel(entry.providerID, entry.modelID)}
                    onEntryDetails={(entry) => {
                        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
                        setMobileDetailsEntry(entry);
                    }}
                    providersStartCollapsed
                    sheetCaptions
                    autoFocus={false}
                    tooltipsEnabled={false}
                    maxHeightClassName="min-h-0 flex-1"
                    showKeyboardHints={false}
                    onEscape={() => {
                        if (mobileDetailsEntry) setMobileDetailsEntry(null);
                        else closeMobilePanel();
                    }}
                />
            </MobileOverlayPanel>
        );
    };

    const renderMobileModelDetails = () => {
        if (!isCompact || !mobileDetailsEntry) return null;
        const { providerID, modelID, model } = mobileDetailsEntry;
        const auto = isAutoModel(providerID, modelID);
        const favorite = isFavoriteModel(providerID, modelID);
        const metadata = mergeModelMetadataWithLiveModel(providerID, model, getModelMetadata(providerID, modelID));
        const providerName = auto ? null : providers.find((provider) => provider.id === providerID)?.name || providerID;
        return (
            <MobileOverlayPanel
                open
                onClose={() => setMobileDetailsEntry(null)}
                title={getModelDisplayName(model)}
                footer={(
                    <div className="flex flex-col gap-2">
                        <Button size="lg" className="w-full" onClick={() => handleMobileModelApply(providerID, modelID)}>
                            {t('chat.modelControls.useModel')}
                        </Button>
                        {!auto ? (
                            <Button variant="outline" size="lg" className="w-full gap-1.5" onClick={() => toggleFavoriteModel(providerID, modelID)}>
                                <Icon name={favorite ? 'star-fill' : 'star'} className={cn('size-4', favorite && 'text-primary')} />
                                {favorite ? t('chat.modelControls.removeFromFavorites') : t('chat.modelControls.addToFavorites')}
                            </Button>
                        ) : null}
>>>>>>> upstream/main
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

<<<<<<< HEAD
        const handleBack = () => {
            setActiveMobilePanel('model');
        };
||||||| bc50ba56aa
        const handleSelect = (variant: string | undefined) => {
            // Chosen in the mobile effort panel: no effort means "Default".
            const result = applyModelSelectionWithVariant(targetProviderId, targetModelId, variant ?? null);
            if (result !== 'applied') {
                return;
            }
=======
        const handleSelect = (variant: string | undefined) => {
            const result = applyModelSelectionWithVariant(targetProviderId, targetModelId, variant ?? null);
            if (result !== 'applied') {
                return;
            }
>>>>>>> upstream/main

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
<<<<<<< HEAD
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
||||||| bc50ba56aa
                <MobileSheetRow selected={isDefault} onClick={() => handleSelect(undefined)}>
                    {t('chat.modelControls.default')}
                </MobileSheetRow>
                {targetVariants.map((variant) => (
                    <MobileSheetRow key={variant} selected={selectedVariant === variant} onClick={() => handleSelect(variant)}>
                        {formatEffortLabel(variant)}
                    </MobileSheetRow>
                ))}
            </MobileOverlayPanel>
        );
    };

    // The phone's agent sheet reads like the desktop agent menu: flat rows,
    // the agent's colour on its dot only, starred agents first.
    const renderMobileAgentPanel = () => {
        if (!isCompact) return null;

        const isFavoriteAgent = (agent: Agent) => favoriteAgents.includes(agent.name);
        // Starred agents in the order the cycle runs through them.
        const favoriteAgentRows = selectableDesktopAgents.filter(isFavoriteAgent);
        const otherAgentRows = [...selectableDesktopAgents]
            .filter((agent) => !isFavoriteAgent(agent))
            .sort((a, b) => a.name.localeCompare(b.name));

        const renderAgentRow = (agent: Agent) => (
            <MobileSheetRow
                key={agent.name}
                selected={agent.name === uiAgentName}
                leading={<span className="size-1.5 flex-shrink-0 rounded-full" style={{ background: getAgentColor(agent.name).color }} />}
                action={(
                    <AgentFavoriteToggle
                        className="h-7 w-7 [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9"
                        favorite={isFavoriteAgent(agent)}
                        onToggle={() => toggleFavoriteAgent(agent.name)}
                    />
                )}
                onClick={() => handleAgentChange(agent.name)}
            >
                {agentLabel(agent)}
            </MobileSheetRow>
        );

        return (
            <MobileOverlayPanel
                open={activeMobilePanel === 'agent'}
                onClose={closeMobilePanel}
                title={t('chat.modelControls.selectAgent')}
                contentMaxHeightClassName="max-h-[min(60dvh,420px)]"
            >
                {favoriteAgentRows.length > 0 ? (
                    <>
                        {/* The composer's agent button cycles through these on a tap. */}
                        <MobileSheetSection title={t('chat.modelControls.favorites')} hint={t('chat.modelControls.favoriteAgentsTapHint')}>
                            {favoriteAgentRows.map(renderAgentRow)}
                        </MobileSheetSection>
                        {otherAgentRows.length > 0 ? (
                            <MobileSheetSection title={t('chat.modelControls.agentsSection')}>
                                {otherAgentRows.map(renderAgentRow)}
                            </MobileSheetSection>
                        ) : null}
                    </>
                ) : otherAgentRows.map(renderAgentRow)}
=======
                <MobileSheetRow selected={isDefault} onClick={() => handleSelect(undefined)}>
                    {t('chat.modelControls.default')}
                </MobileSheetRow>
                {targetVariants.map((variant) => (
                    <MobileSheetRow key={variant} selected={selectedVariant === variant} onClick={() => handleSelect(variant)}>
                        {formatEffortLabel(variant)}
                    </MobileSheetRow>
                ))}
            </MobileOverlayPanel>
        );
    };

    const renderMobileAgentPanel = () => {
        if (!isCompact) return null;

        const isFavoriteAgent = (agent: Agent) => favoriteAgents.includes(agent.name);
        const favoriteAgentRows = selectableDesktopAgents.filter(isFavoriteAgent);
        const otherAgentRows = [...selectableDesktopAgents]
            .filter((agent) => !isFavoriteAgent(agent))
            .sort((a, b) => a.name.localeCompare(b.name));

        const renderAgentRow = (agent: Agent) => (
            <MobileSheetRow
                key={agent.name}
                selected={agent.name === uiAgentName}
                leading={<span className="size-1.5 flex-shrink-0 rounded-full" style={{ background: getAgentColor(agent.name).color }} />}
                action={(
                    <AgentFavoriteToggle
                        className="h-7 w-7 [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9"
                        favorite={isFavoriteAgent(agent)}
                        onToggle={() => toggleFavoriteAgent(agent.name)}
                    />
                )}
                onClick={() => handleAgentChange(agent.name)}
            >
                {agentLabel(agent)}
            </MobileSheetRow>
        );

        return (
            <MobileOverlayPanel
                open={activeMobilePanel === 'agent'}
                onClose={closeMobilePanel}
                title={t('chat.modelControls.selectAgent')}
                contentMaxHeightClassName="max-h-[min(60dvh,420px)]"
            >
                {favoriteAgentRows.length > 0 ? (
                    <>
                        <MobileSheetSection title={t('chat.modelControls.favorites')} hint={t('chat.modelControls.favoriteAgentsTapHint')}>
                            {favoriteAgentRows.map(renderAgentRow)}
                        </MobileSheetSection>
                        {otherAgentRows.length > 0 ? (
                            <MobileSheetSection title={t('chat.modelControls.agentsSection')}>
                                {otherAgentRows.map(renderAgentRow)}
                            </MobileSheetSection>
                        ) : null}
                    </>
                ) : otherAgentRows.map(renderAgentRow)}
>>>>>>> upstream/main
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
<<<<<<< HEAD
            const current = selectedItem.providerId === currentProviderId && selectedItem.modelId === currentModelId ? selectedReasoningEffort : 'off';
            const index = Math.max(0, efforts.indexOf(current));
            const direction = e.key === 'ArrowRight' ? 1 : -1;
            handleEffortSelect(efforts[(index + direction + efforts.length) % efforts.length], selectedItem.providerId, selectedItem.modelId);
||||||| bc50ba56aa

            const mapKey = buildModelRefKey(providerID, modelID);
            const hasPendingVariant = pendingThinkingVariants.has(mapKey);
            const currentPending = pendingThinkingVariants.get(mapKey);
            const activeModelVariant = hasPendingVariant
                ? currentPending
                : resolveModelVariantSelection(providerID, modelID) ?? undefined;

            const variantsWithDefault: Array<string | undefined> = [undefined, ...variantKeys];
            const currentVariantIndex = variantsWithDefault.indexOf(activeModelVariant);
            const safeCurrentIndex = currentVariantIndex >= 0 ? currentVariantIndex : 0;
            // The next level lies toward the end of the line: right in LTR, left in RTL.
            const forwardKey = isRightToLeft(e.currentTarget) ? 'ArrowLeft' : 'ArrowRight';
            const direction = e.key === forwardKey ? 1 : -1;
            const nextVariantIndex = (safeCurrentIndex + direction + variantsWithDefault.length) % variantsWithDefault.length;
            const nextVariant = variantsWithDefault[nextVariantIndex];

            setPendingThinkingVariants((prev) => {
                const next = new Map(prev);
                next.set(mapKey, nextVariant);
                return next;
            });
            setAdjustedThinkingModels((prev) => {
                const next = new Set(prev);
                next.add(mapKey);
                return next;
            });
            // Arrow keys change the level on the row itself, before a model is
            // chosen: remember it for that model now.
            rememberVariantForModel(providerID, modelID, nextVariant ?? null);
            setModelPickerRenderVersion((version) => version + 1);
=======

            const mapKey = buildModelRefKey(providerID, modelID);
            const hasPendingVariant = pendingThinkingVariants.has(mapKey);
            const currentPending = pendingThinkingVariants.get(mapKey);
            const activeModelVariant = hasPendingVariant
                ? currentPending
                : resolveModelVariantSelection(providerID, modelID) ?? undefined;

            const variantsWithDefault: Array<string | undefined> = [undefined, ...variantKeys];
            const currentVariantIndex = variantsWithDefault.indexOf(activeModelVariant);
            const safeCurrentIndex = currentVariantIndex >= 0 ? currentVariantIndex : 0;
            const forwardKey = isRightToLeft(e.currentTarget) ? 'ArrowLeft' : 'ArrowRight';
            const direction = e.key === forwardKey ? 1 : -1;
            const nextVariantIndex = (safeCurrentIndex + direction + variantsWithDefault.length) % variantsWithDefault.length;
            const nextVariant = variantsWithDefault[nextVariantIndex];

            setPendingThinkingVariants((prev) => {
                const next = new Map(prev);
                next.set(mapKey, nextVariant);
                return next;
            });
            setAdjustedThinkingModels((prev) => {
                const next = new Set(prev);
                next.add(mapKey);
                return next;
            });
            rememberVariantForModel(providerID, modelID, nextVariant ?? null);
            setModelPickerRenderVersion((version) => version + 1);
>>>>>>> upstream/main
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

<<<<<<< HEAD
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
||||||| bc50ba56aa

        const renderThinkingSlot = (entry: ModelPickerEntry, { isHighlighted, isSelected }: { isHighlighted: boolean; isSelected: boolean }) => {
            const hasThinkingVariants = getModelVariantOptions(entry.providerID, entry.modelID).length > 0;
            const mapKey = buildModelRefKey(entry.providerID, entry.modelID);
            const wasAdjusted = adjustedThinkingModels.has(mapKey);
            if (!hasThinkingVariants || (!isHighlighted && !isSelected)) return null;

            const hasPendingVariant = pendingThinkingVariants.has(mapKey);
            const pendingVariant = pendingThinkingVariants.get(mapKey);
            const effectiveVariant = hasPendingVariant
                ? pendingVariant
                : resolveModelVariantSelection(entry.providerID, entry.modelID) ?? undefined;
            const displayLabel = effectiveVariant ? formatEffortLabel(effectiveVariant) : t('chat.modelControls.default');

            // The effort as the composer shows it after the model: "/ medium".
            return (
                <span className={cn(
                    'typography-micro whitespace-nowrap lowercase',
                    isHighlighted
                        ? (wasAdjusted ? 'text-interactive-selection-foreground' : 'text-interactive-selection-foreground/70')
                        : (wasAdjusted ? 'text-foreground' : 'text-muted-foreground'),
                )}>
                    <span aria-hidden="true" className="opacity-60">/ </span>{displayLabel}
                </span>
            );
=======

        const renderThinkingSlot = (entry: ModelPickerEntry, { isHighlighted, isSelected }: { isHighlighted: boolean; isSelected: boolean }) => {
            const hasThinkingVariants = getModelVariantOptions(entry.providerID, entry.modelID).length > 0;
            const mapKey = buildModelRefKey(entry.providerID, entry.modelID);
            const wasAdjusted = adjustedThinkingModels.has(mapKey);
            if (!hasThinkingVariants || (!isHighlighted && !isSelected)) return null;

            const hasPendingVariant = pendingThinkingVariants.has(mapKey);
            const pendingVariant = pendingThinkingVariants.get(mapKey);
            const effectiveVariant = hasPendingVariant
                ? pendingVariant
                : resolveModelVariantSelection(entry.providerID, entry.modelID) ?? undefined;
            const displayLabel = effectiveVariant ? formatEffortLabel(effectiveVariant) : t('chat.modelControls.default');

            return (
                <span className={cn(
                    'typography-micro whitespace-nowrap lowercase',
                    isHighlighted
                        ? (wasAdjusted ? 'text-interactive-selection-foreground' : 'text-interactive-selection-foreground/70')
                        : (wasAdjusted ? 'text-foreground' : 'text-muted-foreground'),
                )}>
                    <span aria-hidden="true" className="opacity-60">/ </span>{displayLabel}
                </span>
            );
>>>>>>> upstream/main
        };


        return (
            <Tooltip delayDuration={600}>
                {!isCompact ? (
                    <DropdownMenu open={isReady && agentMenuOpen} onOpenChange={isReady ? handleModelMenuOpenChange : undefined}>
                        <TooltipTrigger asChild>
<<<<<<< HEAD
                            <DropdownMenuTrigger asChild nativeButton>
                                <button
                                    type="button"
||||||| bc50ba56aa
                            <DropdownMenuTrigger asChild nativeButton={false}>
                                <div
                                    ref={modelTriggerRef}
=======
                            <DropdownMenuTrigger asChild nativeButton={false}>
                                <div
                                    ref={modelTriggerRef}
                                    aria-label={modelUnavailableText}
>>>>>>> upstream/main
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
<<<<<<< HEAD
        const colorClass = isDefault ? 'text-muted-foreground' : 'text-[color:var(--status-info)]';
||||||| bc50ba56aa
        const isGreyEffort = getEffortTone(currentVariant) === 'default';
        // The effort reads as a quiet suffix of the model name: "Opus 5.5 / medium",
        // tinted by level. It brightens on its own hover, so the pointer shows it
        // is a control of its own; where the row is too narrow for it, its icon
        // stands in.
        const triggerLabel = (
            <>
                <Icon name="brain-ai-3" className={cn('model-controls__variant-icon flex-shrink-0 text-muted-foreground group-hover:text-foreground', controlIconSize)} />
                <span aria-hidden="true" className="model-controls__variant-slash text-muted-foreground/60">/</span>
                <span
                    className={cn(
                        'model-controls__variant-label',
                        controlTextSize,
                        'font-medium min-w-0 truncate lowercase',
                        getEffortToneClass(currentVariant),
                        isGreyEffort ? 'group-hover:text-foreground' : 'group-hover:opacity-100',
                        isMobile && 'max-w-[60px]',
                        isDesktop && 'max-w-[180px]',
                    )}
                >
                    {displayVariant}
                </span>
            </>
        );
        // An effort nobody picked in this composer is this model's configured
        // default; the tooltip says so.
        const isInherited = !selection && !isDefault && currentVariantSelection.override === undefined;
        const agentVariant = currentAgent?.model?.providerID === currentProviderId
            && currentAgent.model.id === currentModelId
            ? currentAgent.model.variant
            : undefined;
        const hasConfiguredInherited = [agentVariant, getDefaultVariantForModel(currentProviderId, currentModelId)]
            .some((candidate) => candidate !== undefined && displayVariants.includes(candidate));
        const rememberedVariant = lastUsedEfforts?.[effortMemoryKey(currentProviderId, currentModelId)];
        const isRemembered = isInherited
            && currentVariant === rememberedVariant
            && !hasConfiguredInherited;
        const tooltipText = isRemembered
            ? t('chat.modelControls.rememberedVariantTooltip', { variant: displayVariant })
            : isInherited
                ? t('chat.modelControls.inheritedVariantTooltip', { variant: displayVariant })
                : `${t('chat.modelControls.thinking')}: ${displayVariant}`;
=======
        const isGreyEffort = getEffortTone(currentVariant) === 'default';
        const triggerLabel = (
            <>
                <Icon name="brain-ai-3" className={cn('model-controls__variant-icon flex-shrink-0 text-muted-foreground group-hover:text-foreground', controlIconSize)} />
                <span aria-hidden="true" className={cn('model-controls__variant-slash text-muted-foreground/60', controlTextSize)}>/</span>
                <span
                    className={cn(
                        'model-controls__variant-label',
                        controlTextSize,
                        'font-medium min-w-0 truncate lowercase',
                        getEffortToneClass(currentVariant),
                        isGreyEffort ? 'group-hover:text-foreground' : 'group-hover:opacity-100',
                        isMobile && 'max-w-[60px]',
                        isDesktop && 'max-w-[180px]',
                    )}
                >
                    {displayVariant}
                </span>
            </>
        );
        const isInherited = !selection && !isDefault && currentVariantSelection.override === undefined;
        const agentVariant = currentAgent?.model?.providerID === currentProviderId
            && currentAgent.model.id === currentModelId
            ? currentAgent.model.variant
            : undefined;
        const hasConfiguredInherited = [agentVariant, getDefaultVariantForModel(currentProviderId, currentModelId)]
            .some((candidate) => candidate !== undefined && displayVariants.includes(candidate));
        const rememberedVariant = lastUsedEfforts?.[effortMemoryKey(currentProviderId, currentModelId)];
        const isRemembered = isInherited
            && currentVariant === rememberedVariant
            && !hasConfiguredInherited;
        const tooltipText = isRemembered
            ? t('chat.modelControls.rememberedVariantTooltip', { variant: displayVariant })
            : isInherited
                ? t('chat.modelControls.inheritedVariantTooltip', { variant: displayVariant })
                : `${t('chat.modelControls.thinking')}: ${displayVariant}`;
>>>>>>> upstream/main

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
<<<<<<< HEAD
                        'model-controls__variant-trigger flex items-center gap-1.5 transition-opacity min-w-0 focus:outline-none',
||||||| bc50ba56aa
                        // Drawn as the main composer's phone row: 36px to tap in a 26px row.
                        'model-controls__variant-trigger group -my-[5px] flex flex-shrink-0 items-center gap-1 px-1.5 focus:outline-none',
=======
                        'model-controls__variant-trigger group -my-[5px] flex flex-shrink-0 items-center gap-1 px-1.5 focus:outline-none',
>>>>>>> upstream/main
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
<<<<<<< HEAD
                                    'model-controls__variant-trigger flex items-center gap-1.5 transition-colors cursor-pointer select-none hover:bg-transparent hover:opacity-70 min-w-0',
||||||| bc50ba56aa
                                    'model-controls__variant-trigger group flex items-center gap-1 cursor-pointer select-none hover:bg-transparent min-w-0 overflow-hidden',
=======
                                    'model-controls__variant-trigger group flex flex-shrink-0 items-center gap-1 cursor-pointer select-none hover:bg-transparent overflow-hidden',
>>>>>>> upstream/main
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
<<<<<<< HEAD
||||||| bc50ba56aa
                        {/* The model picker's footer, flush with the menu's edges. */}
                        <div className="-mx-1 -mb-1 mt-1 flex items-center gap-x-2 overflow-hidden whitespace-nowrap border-t border-edge-muted px-3 pt-1 pb-1.5 typography-micro text-muted-foreground">
                            <span>{t('chat.modelControls.keyboardHintNavigate')}</span>
                            {thinkingShortcut ? <span>{t('chat.modelControls.keyboardHintSwitchThinking', { shortcut: thinkingShortcut })}</span> : null}
                        </div>
=======
                        <div className="-mx-1 -mb-1 mt-1 flex items-center gap-x-4 overflow-hidden whitespace-nowrap border-t border-edge-muted px-3 pt-1 pb-1.5 typography-micro text-muted-foreground">
                            <span>{t('chat.modelControls.keyboardHintNavigate')}</span>
                            {thinkingShortcut ? <span>{t('chat.modelControls.keyboardHintSwitchThinking', { shortcut: thinkingShortcut })}</span> : null}
                        </div>
>>>>>>> upstream/main
                    </DropdownMenuContent>
                </DropdownMenu>
                <TooltipContent side="top">
                    <p className="typography-meta">{t('chat.modelControls.routes')}: {displayVariant}</p>
                </TooltipContent>
            </Tooltip>
        );
    };

<<<<<<< HEAD
||||||| bc50ba56aa
    // A missing agent swaps its own mark for the warning one, the same size.
    const renderAgentMark = () => agentUnavailable ? (
        <Icon name="error-warning" className={cn(controlIconSize, 'flex-shrink-0 text-[var(--status-warning)]')} />
    ) : (
        <Icon name="ai-agent"
            className={cn(
                controlIconSize,
                'flex-shrink-0',
                uiAgentName ? '' : 'text-muted-foreground'
            )}
            style={uiAgentName ? { color: getAgentColor(uiAgentName).color } : undefined}
        />
    );

    const renderAgentSelector = () => {
        if (!isCompact) {
            const isFavoriteAgent = (agent: Agent) => favoriteAgents.includes(agent.name);
            // Starred agents in the order Tab cycles through them. A search lists
            // every match by rank instead, so Enter picks the row on top.
            const favoriteAgentRows = agentSearchQuery.trim() ? [] : selectableDesktopAgents.filter(isFavoriteAgent);
            const otherAgentRows = favoriteAgentRows.length > 0
                ? sortedAndFilteredAgents.filter((agent) => !isFavoriteAgent(agent))
                : sortedAndFilteredAgents;
            const focusFirstAgentItem = () => {
                agentListRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
            };
            // The field keeps typing to itself; ArrowDown or Ctrl+N steps into the
            // list, and Enter picks the top result.
            const handleAgentSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
                if (handleDropdownNavigationKey(event, (key) => { if (key === 'ArrowDown') focusFirstAgentItem(); })) return;
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    focusFirstAgentItem();
                } else if (event.key === 'Enter' && !isIMECompositionEvent(event)) {
                    const topAgent = favoriteAgentRows[0] ?? otherAgentRows[0];
                    if (topAgent) {
                        event.preventDefault();
                        handleAgentChange(topAgent.name);
                        setIsAgentSelectorOpen(false);
                    }
                }
                event.stopPropagation();
            };
            const renderAgentMenuItem = (agent: Agent) => (
                <AgentDescriptionTooltip key={agent.name} description={agent.description}>
                    <DropdownMenuItem
                        className="typography-meta"
                        onSelect={() => handleAgentChange(agent.name)}
                    >
                        <div className="flex w-full items-center gap-1.5">
                            <div className="h-1 w-1 rounded-full" style={{ background: getAgentColor(agent.name).color }} />
                            <span className="min-w-0 truncate font-medium">{agentLabel(agent)}</span>
                            <span className="ms-auto flex flex-shrink-0 items-center gap-1.5">
                                {agent.name === uiAgentName ? <Icon name="check" className="size-4 text-inherit" /> : null}
                                <AgentFavoriteToggle
                                    favorite={isFavoriteAgent(agent)}
                                    onToggle={() => toggleFavoriteAgent(agent.name)}
                                />
                            </span>
                        </div>
                    </DropdownMenuItem>
                </AgentDescriptionTooltip>
            );
            return (
                <div className="flex items-center gap-2 min-w-0">
                    <Tooltip delayDuration={600}>
                        <DropdownMenu open={canSelectAgent && isAgentSelectorOpen} onOpenChange={canSelectAgent ? setIsAgentSelectorOpen : undefined}>
                            <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild nativeButton={false}>
                                    <div ref={agentTriggerRef} aria-label={agentUnavailableText} className={cn(
                                        'flex items-center gap-1.5 transition-colors cursor-pointer select-none hover:bg-transparent hover:opacity-70 min-w-0 overflow-hidden',
                                        buttonHeight
                                    )}>
                                        {!agentSelectionReady ? (
                                            <>
                                                <ReadinessMark unavailable={isUnavailable}
                                                    className={cn(
                                                        controlIconSize,
                                                        'flex-shrink-0 text-muted-foreground'
                                                    )}
                                                />
                                                <span
                                                    className={cn(
                                                        'model-controls__agent-label',
                                                        controlTextSize,
                                                        'font-medium min-w-0 truncate text-muted-foreground'
                                                    )}
                                                >
                                                    {readinessLabel}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                {renderAgentMark()}
                                                <span
                                                    className={cn(
                                                        'model-controls__agent-label',
                                                        controlTextSize,
                                                        'font-medium min-w-0 truncate text-foreground',
                                                        isDesktop ? 'max-w-[220px]' : undefined
                                                    )}
                                                >
                                                    {getAgentDisplayName()}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <DropdownMenuContent side={agentMenuSide} align="end" alignOffset={-40} constrainToMain collisionAvoidance={{ side: 'none', align: 'shift' }} className="w-[min(280px,calc(100vw-2rem))] p-0 flex flex-col overflow-hidden">
                                <div className="px-2 py-1 border-b border-edge-muted">
                                    <div className="relative">
                                        <Icon name="search" className="absolute inset-s-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                                        <Input
                                            type="text"
                                            placeholder={t('chat.modelControls.searchAgents')}
                                            value={agentSearchQuery}
                                            onChange={(e) => setAgentSearchQuery(e.target.value)}
                                            onKeyDown={handleAgentSearchKeyDown}
                                            className="h-7 rounded-none bg-transparent ps-8 pe-0 typography-meta ring-0 hover:[&:not(:focus)]:bg-transparent hover:[&:not(:focus)]:[background-image:none] focus:ring-0 focus-visible:ring-0"
                                        />
                                    </div>
                                </div>
                                <ScrollableOverlay outerClassName="max-h-[min(400px,calc(var(--available-height)-4rem))] flex-1">
                                    <div ref={agentListRef} className="p-1">
                                        {sortedAndFilteredAgents.length === 0 ? (
                                            <div className="px-2 py-4 text-center typography-meta text-muted-foreground">
                                                {t('chat.modelControls.noAgentsFound')}
                                            </div>
                                        ) : favoriteAgentRows.length > 0 ? (
                                            <>
                                                <div role="group" aria-label={t('chat.modelControls.favorites')}>
                                                    <div className={PICKER_SECTION_HEADER_CLASS}>
                                                        <span className="min-w-0 truncate">{t('chat.modelControls.favorites')}</span>
                                                        {agentShortcut ? (
                                                            <span className="ms-auto flex-shrink-0 normal-case tracking-normal font-normal">
                                                                {t('chat.modelControls.favoriteAgentsCycleHint', { shortcut: agentShortcut })}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    {favoriteAgentRows.map(renderAgentMenuItem)}
                                                </div>
                                                {otherAgentRows.length > 0 ? (
                                                    <>
                                                        <div className="h-px bg-edge-muted my-1" />
                                                        <div role="group" aria-label={t('chat.modelControls.agentsSection')}>
                                                            <div className={PICKER_SECTION_HEADER_CLASS}>{t('chat.modelControls.agentsSection')}</div>
                                                            {otherAgentRows.map(renderAgentMenuItem)}
                                                        </div>
                                                    </>
                                                ) : null}
                                            </>
                                        ) : (
                                            sortedAndFilteredAgents.map(renderAgentMenuItem)
                                        )}
                                    </div>
                                </ScrollableOverlay>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {renderAgentTooltipContent()}
                    </Tooltip>
                </div>
            );
        }

        return (
            <button
                type="button"
                onClick={canSelectAgent ? () => setActiveMobilePanel('agent') : undefined}
                onTouchStart={canSelectAgent ? () => handleLongPressStart('agent') : undefined}
                onTouchEnd={canSelectAgent ? handleLongPressEnd : undefined}
                onTouchCancel={canSelectAgent ? handleLongPressEnd : undefined}
                disabled={!canSelectAgent}
                aria-label={agentUnavailableText}
                className={cn(
                    'model-controls__agent-trigger -my-[5px] flex flex-shrink-0 items-center gap-1.5 transition-colors min-w-0 focus:outline-none',
                    buttonHeight,
                    canSelectAgent ? 'cursor-pointer hover:bg-transparent hover:opacity-70' : 'opacity-60 cursor-not-allowed',
                )}
            >
                {!agentSelectionReady ? (
                    <>
                        <ReadinessMark unavailable={isUnavailable}
                            className={cn(
                                controlIconSize,
                                'flex-shrink-0 text-muted-foreground'
                            )}
                        />
                        <span
                            className={cn(
                                'model-controls__agent-label',
                                controlTextSize,
                                'font-medium truncate min-w-0 text-muted-foreground'
                            )}
                        >
                            {readinessLabel}
                        </span>
                    </>
                ) : (
                    <>
                        {/* As the main composer's agent button: the name in the
                            agent's colour, a mark only when it is missing. */}
                        {agentUnavailable ? renderAgentMark() : null}
                        <span
                            className={cn(
                                'model-controls__agent-label',
                                controlTextSize,
                                'font-medium truncate min-w-0',
                                (agentUnavailable || !uiAgentName) && 'text-foreground',
                            )}
                            style={!agentUnavailable && uiAgentName ? { color: getAgentColor(uiAgentName).color } : undefined}
                        >
                            {getAgentDisplayName()}
                        </span>
                    </>
                )}
            </button>
        );
    };
=======
    const renderAgentMark = () => agentUnavailable ? (
        <Icon name="error-warning" className={cn(controlIconSize, 'flex-shrink-0 text-[var(--status-warning)]')} />
    ) : (
        <Icon name="ai-agent"
            className={cn(
                controlIconSize,
                'flex-shrink-0',
                uiAgentName ? '' : 'text-muted-foreground'
            )}
            style={uiAgentName ? { color: restingAgentColor(getAgentColor(uiAgentName).color) } : undefined}
        />
    );

    const renderAgentSelector = () => {
        if (!isCompact) {
            const isFavoriteAgent = (agent: Agent) => favoriteAgents.includes(agent.name);
            const favoriteAgentRows = agentSearchQuery.trim() ? [] : selectableDesktopAgents.filter(isFavoriteAgent);
            const otherAgentRows = favoriteAgentRows.length > 0
                ? sortedAndFilteredAgents.filter((agent) => !isFavoriteAgent(agent))
                : sortedAndFilteredAgents;
            const focusFirstAgentItem = () => {
                agentListRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
            };
            const handleAgentSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
                if (handleDropdownNavigationKey(event, (key) => { if (key === 'ArrowDown') focusFirstAgentItem(); })) return;
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    focusFirstAgentItem();
                } else if (event.key === 'Enter' && !isIMECompositionEvent(event)) {
                    const topAgent = favoriteAgentRows[0] ?? otherAgentRows[0];
                    if (topAgent) {
                        event.preventDefault();
                        handleAgentChange(topAgent.name);
                        setIsAgentSelectorOpen(false);
                    }
                }
                event.stopPropagation();
            };
            const renderAgentMenuItem = (agent: Agent) => (
                <AgentDescriptionTooltip key={agent.name} description={agent.description}>
                    <DropdownMenuItem
                        className="typography-meta"
                        onSelect={() => handleAgentChange(agent.name)}
                    >
                        <div className="flex w-full items-center gap-1.5">
                            <div className="h-1 w-1 rounded-full" style={{ background: getAgentColor(agent.name).color }} />
                            <span className="min-w-0 truncate font-medium">{agentLabel(agent)}</span>
                            <span className="ms-auto flex flex-shrink-0 items-center gap-1.5">
                                {agent.name === uiAgentName ? <Icon name="check" className="size-4 text-inherit" /> : null}
                                <AgentFavoriteToggle
                                    favorite={isFavoriteAgent(agent)}
                                    onToggle={() => toggleFavoriteAgent(agent.name)}
                                />
                            </span>
                        </div>
                    </DropdownMenuItem>
                </AgentDescriptionTooltip>
            );
            return (
                <div className="flex flex-shrink-0 items-center gap-2">
                    <Tooltip delayDuration={600}>
                        <DropdownMenu open={canSelectAgent && isAgentSelectorOpen} onOpenChange={canSelectAgent ? setIsAgentSelectorOpen : undefined}>
                            <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild nativeButton={false}>
                                    <div ref={agentTriggerRef} aria-label={agentUnavailableText} className={cn(
                                        'flex items-center gap-1.5 transition-colors cursor-pointer select-none hover:bg-transparent hover:opacity-70 min-w-0 overflow-hidden',
                                        buttonHeight
                                    )}>
                                        {!agentSelectionReady ? (
                                            <>
                                                <ReadinessMark unavailable={isUnavailable}
                                                    className={cn(
                                                        controlIconSize,
                                                        'flex-shrink-0 text-muted-foreground'
                                                    )}
                                                />
                                                <span
                                                    className={cn(
                                                        'model-controls__agent-label',
                                                        controlTextSize,
                                                        'font-medium min-w-0 truncate text-muted-foreground'
                                                    )}
                                                >
                                                    {readinessLabel}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                {renderAgentMark()}
                                                <span
                                                    className={cn(
                                                        'model-controls__agent-label',
                                                        controlTextSize,
                                                        'font-medium min-w-0 truncate text-foreground',
                                                        isDesktop ? 'max-w-[220px]' : undefined
                                                    )}
                                                >
                                                    {getAgentDisplayName()}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <DropdownMenuContent side={agentMenuSide} align="end" alignOffset={-40} constrainToMain collisionAvoidance={{ side: 'none', align: 'shift' }} className="w-[min(280px,calc(100vw-2rem))] p-0 flex flex-col overflow-hidden">
                                <div className="px-2 py-1 border-b border-edge-muted">
                                    <div className="relative">
                                        <Icon name="search" className="absolute inset-s-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                                        <Input
                                            type="text"
                                            placeholder={t('chat.modelControls.searchAgents')}
                                            value={agentSearchQuery}
                                            onChange={(e) => setAgentSearchQuery(e.target.value)}
                                            onKeyDown={handleAgentSearchKeyDown}
                                            className="h-7 rounded-none bg-transparent ps-8 pe-0 typography-meta ring-0 hover:[&:not(:focus)]:bg-transparent hover:[&:not(:focus)]:[background-image:none] focus:ring-0 focus-visible:ring-0"
                                        />
                                    </div>
                                </div>
                                <ScrollableOverlay outerClassName="max-h-[min(400px,calc(var(--available-height)-4rem))] flex-1">
                                    <div ref={agentListRef} className="p-1">
                                        {sortedAndFilteredAgents.length === 0 ? (
                                            <div className="px-2 py-4 text-center typography-meta text-muted-foreground">
                                                {t('chat.modelControls.noAgentsFound')}
                                            </div>
                                        ) : favoriteAgentRows.length > 0 ? (
                                            <>
                                                <div role="group" aria-label={t('chat.modelControls.favorites')}>
                                                    <div className={PICKER_SECTION_HEADER_CLASS}>
                                                        <span className="min-w-0 truncate">{t('chat.modelControls.favorites')}</span>
                                                        {agentShortcut ? (
                                                            <span className="ms-auto flex-shrink-0 normal-case tracking-normal font-normal">
                                                                {t('chat.modelControls.favoriteAgentsCycleHint', { shortcut: agentShortcut })}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    {favoriteAgentRows.map(renderAgentMenuItem)}
                                                </div>
                                                {otherAgentRows.length > 0 ? (
                                                    <>
                                                        <div className="h-px bg-edge-muted my-1" />
                                                        <div role="group" aria-label={t('chat.modelControls.agentsSection')}>
                                                            <div className={PICKER_SECTION_HEADER_CLASS}>{t('chat.modelControls.agentsSection')}</div>
                                                            {otherAgentRows.map(renderAgentMenuItem)}
                                                        </div>
                                                    </>
                                                ) : null}
                                            </>
                                        ) : (
                                            sortedAndFilteredAgents.map(renderAgentMenuItem)
                                        )}
                                    </div>
                                </ScrollableOverlay>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {renderAgentTooltipContent()}
                    </Tooltip>
                </div>
            );
        }

        return (
            <button
                type="button"
                onClick={canSelectAgent ? () => setActiveMobilePanel('agent') : undefined}
                onTouchStart={canSelectAgent ? () => handleLongPressStart('agent') : undefined}
                onTouchEnd={canSelectAgent ? handleLongPressEnd : undefined}
                onTouchCancel={canSelectAgent ? handleLongPressEnd : undefined}
                disabled={!canSelectAgent}
                aria-label={agentUnavailableText}
                className={cn(
                    'model-controls__agent-trigger -my-[5px] flex flex-shrink-0 items-center gap-1.5 transition-colors min-w-0 focus:outline-none',
                    buttonHeight,
                    canSelectAgent ? 'cursor-pointer hover:bg-transparent hover:opacity-70' : 'opacity-60 cursor-not-allowed',
                )}
            >
                {!agentSelectionReady ? (
                    <>
                        <ReadinessMark unavailable={isUnavailable}
                            className={cn(
                                controlIconSize,
                                'flex-shrink-0 text-muted-foreground'
                            )}
                        />
                        <span
                            className={cn(
                                'model-controls__agent-label',
                                controlTextSize,
                                'font-medium truncate min-w-0 text-muted-foreground'
                            )}
                        >
                            {readinessLabel}
                        </span>
                    </>
                ) : (
                    <>
                        {agentUnavailable ? renderAgentMark() : null}
                        <span
                            className={cn(
                                'model-controls__agent-label',
                                controlTextSize,
                                'font-medium truncate min-w-0',
                                (agentUnavailable || !uiAgentName) && 'text-foreground',
                            )}
                            style={!agentUnavailable && uiAgentName ? { color: restingAgentColor(getAgentColor(uiAgentName).color) } : undefined}
                        >
                            {getAgentDisplayName()}
                        </span>
                    </>
                )}
            </button>
        );
    };
>>>>>>> upstream/main

    const inlineMobileSelection = isMobile && Boolean(selection);
    const inlineClassName = cn(
<<<<<<< HEAD
        '@container/model-controls flex items-center min-w-0',
        // Only force full-width + truncation behaviors on true mobile layouts.
||||||| bc50ba56aa
        'flex items-center min-w-0',
        // The labels collapse to icons as a desktop row narrows (index.css). A
        // phone keeps them, as the main composer's row does, and truncates.
        !isMobile && '@container/model-controls',
        // Only force full-width + truncation behaviors on true mobile layouts.
        // VS Code also uses "compact" mode, but should keep its right-aligned inline sizing.
=======
        'flex items-center min-w-0',
        !isMobile && '@container/model-controls',
>>>>>>> upstream/main
        isMobile && 'w-full',
        className,
    );

    return (
        <>
            <div className={inlineClassName}>
                <div
                    className={cn(
                        'flex items-center min-w-0 flex-1',
<<<<<<< HEAD
                        inlineMobileSelection ? 'justify-start' : 'justify-end',
||||||| bc50ba56aa
                        // A phone lays the row out as the main composer's: model left, agent right.
                        inlineMobileSelection ? 'justify-between' : 'justify-end',
                        // No overflow-hidden: mobile.css makes it a vertical scroller,
                        // and the 36px triggers in this 26px row would draw its thumb.
=======
                        inlineMobileSelection ? 'justify-between' : 'justify-end',
>>>>>>> upstream/main
                        inlineGapClass,
<<<<<<< HEAD
                        isMobile && 'overflow-hidden'
||||||| bc50ba56aa
=======
                        sizeVariant === 'default' && 'model-controls__row pe-3',
>>>>>>> upstream/main
                    )}
                >
<<<<<<< HEAD
                    {!inlineMobileSelection && renderEffortSelector()}
                    {!inlineMobileSelection && renderVariantSelector()}
                    {renderModelSelector()}
                    {inlineMobileSelection && renderEffortSelector()}
                    {inlineMobileSelection && renderVariantSelector()}
||||||| bc50ba56aa
                    {/* The effort follows the model as its suffix, so the two sit closer than the other controls. */}
                    <div className={cn('flex items-center min-w-0', isMobile ? 'gap-x-0.5' : 'gap-x-1')}>
                        {renderModelSelector()}
                        {renderVariantSelector()}
                    </div>
                    {!isAutoSelected && renderAgentSelector()}
=======
                    <div className={cn('flex items-center min-w-0', isMobile ? 'gap-x-0.5' : sizeVariant === 'vscode' ? 'gap-x-2' : 'gap-x-1.5')}>
                        {renderModelSelector()}
                        {renderVariantSelector()}
                    </div>
                    {!isAutoSelected && renderAgentSelector()}
>>>>>>> upstream/main
                </div>
            </div>

            {renderMobileModelPanel()}
            {renderMobileVariantPanel()}
            {renderMobileEffortPanel()}
            {renderMobileModelTooltip()}
        </>
    );

};
