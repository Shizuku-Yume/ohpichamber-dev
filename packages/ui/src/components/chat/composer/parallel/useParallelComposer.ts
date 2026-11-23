import { useSessionGoalArmStore } from '@/stores/useSessionGoalArmStore';
import { prepareParallelAttachments } from './prepareParallelAttachments';
import { captureRuntimeInstance } from '@/lib/runtime-switch';
import React from 'react';
import { toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { isAutoModel } from '@/lib/routing/autoModel';
import { useConfigStore } from '@/stores/useConfigStore';
import { useInputStore } from '@/sync/input-store';
import { attachmentsCitedIn } from '@/lib/attachmentIdentity';
import { useMultiRunStore } from '@/stores/useMultiRunStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useUIStore } from '@/stores/useUIStore';
import type { CreateMultiRunParams } from '@/types/multirun';
import type { ComposerText } from '../state/composerText';

export type ParallelModel = {
  providerId: string;
  modelId: string;
  variant?: string;
  displayName?: string;
  count: number;
};

export type ParallelVariant = {
  id: string;
  text: string;
  models: ParallelModel[];
};

export type ParallelFuseJudge = { providerId: string; modelId: string; variant?: string; displayName?: string };

export type ParallelComposerState = {
  variants: ParallelVariant[];
  active: number;
  isolate: boolean;
  baseBranch: string;
  setupCommands: string[] | null;
  fuse: ParallelFuseJudge | null;
};

export type ParallelComposerModelInput = Omit<ParallelModel, 'count'>;

const variantId = (index: number): string => String.fromCharCode(65 + index);

const runTitleFrom = (text: string): string => {
  const line = text.split('\n').map((entry) => entry.trim()).find(Boolean) ?? '';
  return line.replace(/^[#>*\-\s]+/, '').slice(0, 80).trim();
};

const countParallelRuns = (state: ParallelComposerState): number => (
  state.variants.reduce((total, variant) => total + variant.models.reduce((sum, model) => sum + model.count, 0), 0)
);

export function useParallelComposer(input: {
  enabled: boolean;
  draftOpen: boolean;
  draftProjectId: string | null;
  text: ComposerText;
  setMessage: (text: string) => void;
}) {
  const { t } = useI18n();
  const { enabled, draftOpen, draftProjectId, text: composerText, setMessage } = input;
  const [state, setState] = React.useState<ParallelComposerState | null>(null);
  const [isLaunching, setIsLaunching] = React.useState(false);

  const enter = React.useCallback((text = '') => {
    const config = useConfigStore.getState();
    const providerId = config.currentProviderId;
    const modelId = config.currentModelId;
    const displayName = config.providers.find((provider) => provider.providerId === providerId)?.models.find((model) => model.modelId === modelId)?.name;
    const seed: ParallelModel[] = providerId && modelId && !isAutoModel(providerId, modelId)
      ? [{ providerId, modelId, displayName: displayName || undefined, variant: config.currentVariant || undefined, count: 1 }]
      : [];
    if (text) setMessage(text);
    setState({ variants: [{ id: 'A', text: '', models: seed }], active: 0, isolate: false, baseBranch: '', setupCommands: null, fuse: null });
  }, [setMessage]);

  const exit = React.useCallback(() => setState(null), []);

  React.useEffect(() => {
    if (!enabled || !draftOpen) setState(null);
  }, [draftOpen, enabled]);

  const request = useUIStore((store) => store.parallelComposerRequest);
  React.useEffect(() => {
    if (!request || !enabled || !draftOpen) return;
    useUIStore.getState().consumeParallelComposerRequest(request.id);
    enter(request.prompt);
  }, [draftOpen, enabled, enter, request]);

  const update = React.useCallback((recipe: (current: ParallelComposerState) => ParallelComposerState) => {
    setState((current) => (current ? recipe(current) : current));
  }, []);

  const updateActiveModels = React.useCallback((recipe: (models: ParallelModel[]) => ParallelModel[]) => {
    update((current) => ({
      ...current,
      variants: current.variants.map((variant, index) => (index === current.active ? { ...variant, models: recipe(variant.models) } : variant)),
    }));
  }, [update]);

  const addModel = React.useCallback((model: ParallelComposerModelInput) => {
    if (isAutoModel(model.providerId, model.modelId)) return;
    updateActiveModels((models) => {
      const existing = models.findIndex((entry) => entry.providerId === model.providerId && entry.modelId === model.modelId && entry.variant === model.variant);
      if (existing >= 0) return models.map((entry, index) => (index === existing ? { ...entry, count: entry.count + 1 } : entry));
      return [...models, { ...model, count: 1 }];
    });
  }, [updateActiveModels]);

  const setModelVariant = React.useCallback((index: number, variant: string | undefined) => {
    updateActiveModels((models) => {
      const target = models[index];
      if (!target) return models;
      const twin = models.findIndex((entry, i) => i !== index && entry.providerId === target.providerId && entry.modelId === target.modelId && entry.variant === variant);
      if (twin < 0) return models.map((entry, i) => (i === index ? { ...entry, variant } : entry));
      return models.flatMap((entry, i) => (i === index ? [] : i === twin ? [{ ...entry, count: entry.count + target.count }] : [entry]));
    });
  }, [updateActiveModels]);

  const incrementModel = React.useCallback((index: number) => {
    updateActiveModels((models) => models.map((entry, i) => (i === index ? { ...entry, count: entry.count + 1 } : entry)));
  }, [updateActiveModels]);

  const decrementModel = React.useCallback((index: number) => {
    updateActiveModels((models) => models.flatMap((entry, i) => {
      if (i !== index) return [entry];
      return entry.count > 1 ? [{ ...entry, count: entry.count - 1 }] : [];
    }));
  }, [updateActiveModels]);

  const addVariant = React.useCallback(() => {
    update((current) => {
      const variants = current.variants.map((variant, index) => (index === current.active ? { ...variant, text: composerText.get() } : variant));
      const source = variants[current.active];
      const next: ParallelVariant = { id: variantId(variants.length), text: source.text, models: source.models.map((model) => ({ ...model })) };
      return { ...current, variants: [...variants, next], active: variants.length };
    });
  }, [composerText, update]);

  const switchVariant = React.useCallback((target: number) => {
    const current = state;
    if (!current || target === current.active || !current.variants[target]) return;
    const variants = current.variants.map((variant, index) => (index === current.active ? { ...variant, text: composerText.get() } : variant));
    setState({ ...current, variants, active: target });
    setMessage(variants[target].text);
  }, [composerText, setMessage, state]);

  const removeVariant = React.useCallback((target: number) => {
    const current = state;
    if (!current || current.variants.length <= 1) return;
    const withText = current.variants.map((variant, index) => (index === current.active ? { ...variant, text: composerText.get() } : variant));
    const variants = withText.filter((_, index) => index !== target).map((variant, index) => ({ ...variant, id: variantId(index) }));
    const active = Math.min(target <= current.active && current.active > 0 ? current.active - 1 : current.active, variants.length - 1);
    setState({ ...current, variants, active });
    setMessage(variants[active].text);
  }, [composerText, setMessage, state]);

  const setIsolate = React.useCallback((isolate: boolean) => update((current) => ({ ...current, isolate })), [update]);
  const setBaseBranch = React.useCallback((baseBranch: string) => update((current) => ({ ...current, baseBranch })), [update]);
  const setSetupCommands = React.useCallback((setupCommands: string[]) => update((current) => ({ ...current, setupCommands })), [update]);
  const setFuse = React.useCallback((fuse: ParallelFuseJudge | null) => update((current) => ({ ...current, fuse })), [update]);

  const launch = React.useCallback(async () => {
    const current = state;
    if (!current || isLaunching) return;
    const variants = current.variants.map((variant, index) => (index === current.active ? { ...variant, text: composerText.get() } : variant));
    const ready = variants.filter((variant) => variant.text.trim() && variant.models.length > 0);
    if (ready.length !== variants.length) {
      toast.error(t('chat.parallel.toast.incomplete'));
      return;
    }
    const projects = useProjectsStore.getState();
    const projectId = draftProjectId ?? projects.activeProjectId;
    const project = projectId ? projects.projects.find((entry) => entry.id === projectId) : undefined;
    if (!projectId || !project) {
      toast.error(t('multirun.launcher.project.empty'));
      return;
    }
    if (projectId !== projects.activeProjectId) projects.setActiveProjectIdOnly(projectId);

    const title = runTitleFrom(variants[0].text) || t('chat.parallel.defaultTitle');
    const isLaunchRuntime = captureRuntimeInstance();
    const draftKey = useInputStore.getState().attachmentDraftKey;
    const prompts = variants.map((variant) => variant.text).join('\n');
    const cited = attachmentsCitedIn(prompts, useInputStore.getState().attachedFiles);
    const isCurrent = () => isLaunchRuntime() && useInputStore.getState().attachmentDraftKey === draftKey;
    const goal = useSessionGoalArmStore.getState().armed
      ? { tokenBudget: useUIStore.getState().sessionGoalDefaultBudgetEnabled ? useUIStore.getState().sessionGoalDefaultBudget : null }
      : undefined;
    setIsLaunching(true);
    try {
    const unsaved = await useInputStore.getState().saveAttachmentsHeldForSend(null, project.path, new Set(cited.map((file) => file.id)));
    if (!isCurrent()) return;
    if (unsaved.length > 0) {
      toast.error(t('chat.chatInput.toast.imageCopySaveFailed', { files: unsaved.join(', ') }));
      return;
    }
    const attachments = attachmentsCitedIn(prompts, useInputStore.getState().attachedFiles);
    const { files: uploadedAttachments, workspaceId: attachmentWorkspaceId } = await prepareParallelAttachments(attachments, project.path, isCurrent);
    if (!isCurrent()) return;
    const params: CreateMultiRunParams = {
      name: title,
      title,
      groups: variants.map((variant) => ({
        prompt: variant.text.trim(),
        models: variant.models.flatMap((model) => Array.from({ length: model.count }, () => ({
          providerId: model.providerId,
          modelId: model.modelId,
          variant: model.variant,
          displayName: model.displayName,
        }))),
      })),
      isolateRuns: current.isolate,
      worktreeBaseBranch: current.isolate ? current.baseBranch || undefined : undefined,
      files: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
      attachmentWorkspaceId,
      setupCommands: current.isolate ? current.setupCommands?.filter((command) => command.trim()) : undefined,
      autoFusion: current.fuse
        ? { providerId: current.fuse.providerId, modelId: current.fuse.modelId, variant: current.fuse.variant }
        : undefined,
      goal,
    };

      const result = await useMultiRunStore.getState().createMultiRun(params);
      if (!isCurrent()) return;
      if (!result) {
        toast.error(useMultiRunStore.getState().error ?? t('chat.parallel.toast.failed'));
        return;
      }
      if (result.failedCount > 0) toast.error(t('multirun.launcher.toast.partialFailure', { failed: result.failedCount }));
      setMessage('');
      useInputStore.getState().clearAttachedFiles();
      setState(null);
      if (params.goal) useSessionGoalArmStore.getState().setArmed(false);
      useUIStore.getState().setRunOverviewKey(result.groupKey);
    } catch (error) {
      if (isCurrent()) toast.error(error instanceof Error ? error.message : t('chat.parallel.toast.failed'));
    } finally {
      setIsLaunching(false);
    }
  }, [composerText, draftProjectId, isLaunching, setMessage, state, t]);

  return {
    state,
    isActive: state !== null,
    isLaunching,
    runCount: state ? countParallelRuns(state) : 0,
    enter,
    exit,
    addModel,
    setModelVariant,
    incrementModel,
    decrementModel,
    addVariant,
    switchVariant,
    removeVariant,
    setIsolate,
    setBaseBranch,
    setSetupCommands,
    setFuse,
    launch,
  };
}

export type ParallelComposer = ReturnType<typeof useParallelComposer>;
