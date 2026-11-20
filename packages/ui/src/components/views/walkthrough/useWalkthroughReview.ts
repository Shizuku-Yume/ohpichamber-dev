import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatModelRef, modelRefKey, parseModelString } from '@openchamber/agent-contract';
import { type Locale, useI18n } from '@/lib/i18n';
import { buildWalkthroughView } from '@/lib/walkthrough/model';
import type { WalkthroughTarget } from '@/lib/walkthrough/types';
import { useCallableModelProviders } from '@/hooks/useCallableModelProviders';
import { useConfigStore } from '@/stores/useConfigStore';
import { useGitStore } from '@/stores/useGitStore';
import { type WalkthroughEntry, useWalkthroughStore } from '@/stores/useWalkthroughStore';
import { useWalkthroughStageProgress } from './useWalkthroughStageProgress';

interface WalkthroughReviewOptions {
  directory: string;
  target: WalkthroughTarget;
  visible: boolean;
  needsSourceSelection: boolean;
  revision: string;
  enabled?: boolean;
}

/**
 * One walkthrough of one target: reading and generating it, the model and the
 * language it is asked in, what blocks it, and where the reader is in it. The
 * desktop panel and the phone's Changes screen show the same walkthrough
 * through this hook and differ only in how they lay it out.
 */
export const useWalkthroughReview = ({ directory, target, visible, needsSourceSelection, revision, enabled = true }: WalkthroughReviewOptions) => {
  const { locale, locales } = useI18n();
  const runtimeKey = useGitStore((state) => state.runtimeKey);
  const entry: WalkthroughEntry = useWalkthroughStore((state) => state.getEntry(directory, target));
  const load = useWalkthroughStore((state) => state.load);
  const generate = useWalkthroughStore((state) => state.generate);
  const cancelGeneration = useWalkthroughStore((state) => state.cancel);
  const selectModelInStore = useWalkthroughStore((state) => state.selectModel);
  const selectedModel = useWalkthroughStore((state) => state.getSelectedModel(directory, target));
  const selectLanguageInStore = useWalkthroughStore((state) => state.selectLanguage);
  const selectedLanguage = useWalkthroughStore((state) => state.getSelectedLanguage(directory, target));
  const composerProviderId = useConfigStore((state) => state.currentProviderId) || undefined;
  const composerModelId = useConfigStore((state) => state.currentModelId) || undefined;

  const generatedLanguage = entry.result?.language;
  const activeLanguage: Locale = (
    selectedLanguage && locales.includes(selectedLanguage as Locale)
      ? (selectedLanguage as Locale)
      : generatedLanguage && locales.includes(generatedLanguage as Locale)
        ? (generatedLanguage as Locale)
        : locale
  );

  const lastPrRead = useRef<string | null>(null);
  useEffect(() => {
    if (!visible || needsSourceSelection || !enabled) return;
    if (target.source.kind === 'pr') {
      const key = JSON.stringify([runtimeKey, directory, target, activeLanguage, selectedModel, composerProviderId, composerModelId, revision]);
      if (lastPrRead.current === key) return;
      lastPrRead.current = key;
    }
    void load(directory, target, { language: activeLanguage, providerID: composerProviderId, modelID: composerModelId });
  }, [activeLanguage, composerProviderId, composerModelId, enabled, needsSourceSelection, directory, load, target, selectedModel, revision, visible, runtimeKey]);

  const view = useMemo(() => needsSourceSelection ? null : buildWalkthroughView(entry.result), [needsSourceSelection, entry.result]);

  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [scrollToStopId, setScrollToStopId] = useState<string | null>(null);
  const [visitedStopIds, setVisitedStopIds] = useState<ReadonlySet<string>>(() => new Set());

  const generatedAt = entry.result?.generatedAt;
  const lastGeneratedAt = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (lastGeneratedAt.current === generatedAt) return;
    lastGeneratedAt.current = generatedAt;
    setVisitedStopIds(new Set());
    setActiveStopId(view?.stops[0]?.stop.id ?? null);
  }, [generatedAt, view]);

  const handleActiveStopChange = useCallback((stopId: string) => {
    setActiveStopId(stopId);
    setVisitedStopIds((visited) => {
      if (visited.has(stopId)) return visited;
      const next = new Set(visited);
      next.add(stopId);
      return next;
    });
  }, []);

  const handleSelectStop = useCallback(
    (stopId: string) => {
      handleActiveStopChange(stopId);
      setScrollToStopId(stopId);
    },
    [handleActiveStopChange]
  );

  const step = useCallback(
    (delta: number) => {
      if (!view || view.stops.length === 0) return;
      const currentIndex = view.stops.findIndex((stop) => stop.stop.id === activeStopId);
      const nextIndex = Math.min(view.stops.length - 1, Math.max(0, (currentIndex < 0 ? 0 : currentIndex) + delta));
      handleSelectStop(view.stops[nextIndex].stop.id);
    },
    [activeStopId, handleSelectStop, view]
  );

  const clearScrollRequest = useCallback(() => setScrollToStopId(null), []);
  const activeStopPosition = view?.stops.find((stopView) => stopView.stop.id === activeStopId)?.position ?? 1;

  const modelsMetadata = useConfigStore((state) => state.modelsMetadata);
  const modelProviders = useCallableModelProviders();

  const providerIsAuthenticated = (providerId: string | undefined) => {
    if (!providerId) return false;
    if (modelProviders === undefined) return false;
    return modelProviders.includes(providerId);
  };
  const readinessModelRef = entry.readiness?.model
    && entry.readiness.model.hasLogin !== false
    && providerIsAuthenticated(entry.readiness.model.providerID)
    ? formatModelRef(entry.readiness.model)
    : undefined;
  const resultModelRef = entry.result?.model
    && providerIsAuthenticated(entry.result.model.providerID)
    ? formatModelRef(entry.result.model)
    : undefined;
  const activeModel = selectedModel && providerIsAuthenticated(parseModelString(selectedModel)?.providerId)
    ? selectedModel
    : resultModelRef ?? readinessModelRef;
  // The picker and its messages read these as plain strings; a selector that
  // does not parse names no model, which is how the panel already showed it.
  const activeSelection = parseModelString(activeModel ?? '');
  const activeProviderId = activeSelection?.providerId ?? '';
  const activeModelId = activeSelection?.modelId ?? '';

  const isStructuredOutputCapable = useCallback(
    (providerId: string, modelId: string) =>
      modelsMetadata.get(modelRefKey(providerId, modelId))?.structured_output !== false,
    [modelsMetadata]
  );

  const isGenerating = entry.status === 'generating';

  const shownModel = entry.result?.model
    ? modelRefKey(entry.result.model.providerID, entry.result.model.modelID)
    : undefined;
  const shownLanguage = entry.result?.language;
  const shownLocale = shownLanguage && locales.includes(shownLanguage as Locale)
    ? (shownLanguage as Locale)
    : undefined;
  const settled = entry.status === 'ready' && Boolean(view);
  const languageMissing = settled && Boolean(shownLocale) && shownLocale !== activeLanguage;
  const modelMissing = settled && Boolean(shownModel) && Boolean(activeModel) && shownModel !== activeModel;

  const stageProgress = useWalkthroughStageProgress(entry.stage, isGenerating);

  const startedFromEmptyRef = useRef(false);
  const previousStatusRef = useRef(entry.status);
  useEffect(() => {
    if (previousStatusRef.current !== 'generating' && entry.status === 'generating') {
      startedFromEmptyRef.current = !view;
    }
    previousStatusRef.current = entry.status;
  }, [entry.status, view]);

  const showStages = startedFromEmptyRef.current
    && (isGenerating || stageProgress.holding);
  const blockedReason = entry.error?.code === 'context-too-small'
    || entry.error?.code === 'structured-output-unsupported'
    || entry.error?.code === 'no-model'
    || entry.error?.code === 'empty-diff'
    || entry.error?.code === 'only-generated'
    || entry.error?.code === 'output-exhausted'
    || entry.error?.code === 'server-unsupported'
    ? entry.error.code
    : entry.readiness && !entry.readiness.ready && !view
      && entry.readiness.reason !== 'no-provider-login'
      ? entry.readiness.reason
      : undefined;

  const blocked = blockedReason
    ? {
      reason: blockedReason,
      model: entry.error?.model ?? entry.readiness?.model,
      requiredChars: entry.error?.requiredChars ?? entry.readiness?.requiredChars,
      availableChars: entry.error?.availableChars ?? entry.readiness?.availableChars,
    }
    : undefined;

  const errorMessage = entry.error && !blockedReason && entry.error.code !== 'no-provider-login'
    ? entry.error.message
    : undefined;

  const generateDisabled = needsSourceSelection || !activeModel || Boolean(entry.readiness && !entry.readiness.ready);

  const handleGenerate = useCallback(
    (force: boolean) => {
      if (generateDisabled) return;
      void generate(directory, target, { force, language: activeLanguage, providerID: composerProviderId, modelID: composerModelId });
    },
    [activeLanguage, composerProviderId, composerModelId, directory, generate, generateDisabled, target]
  );

  const cancel = useCallback(() => cancelGeneration(directory, target), [cancelGeneration, directory, target]);
  const retry = useCallback(() => {
    void load(directory, target, { providerID: composerProviderId, modelID: composerModelId });
  }, [composerModelId, composerProviderId, directory, load, target]);
  const selectLanguage = useCallback(
    (language: string) => selectLanguageInStore(directory, target, language),
    [directory, selectLanguageInStore, target]
  );
  const selectModel = useCallback(
    (providerId: string, modelId: string) => {
      selectModelInStore(directory, target, modelRefKey(providerId, modelId) || null);
    },
    [directory, selectModelInStore, target]
  );

  return {
    entry,
    view,
    isGenerating,
    showStages,
    stageProgress,
    blocked,
    errorMessage,
    languageMissing,
    modelMissing,
    shownLocale,
    activeLanguage,
    selectLanguage,
    activeModelId,
    activeProviderId,
    hasActiveModel: Boolean(activeModel),
    modelProviders,
    isStructuredOutputCapable,
    selectModel,
    generateDisabled,
    handleGenerate,
    cancel,
    retry,
    activeStopId,
    activeStopPosition,
    visitedStopIds,
    scrollToStopId,
    clearScrollRequest,
    handleActiveStopChange,
    handleSelectStop,
    step,
  };
};

export type WalkthroughReview = ReturnType<typeof useWalkthroughReview>;
