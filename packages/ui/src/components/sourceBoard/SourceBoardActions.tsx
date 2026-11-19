import * as React from 'react';

import { useMobileAppActions } from '@/apps/mobileAppContext';
import { Icon } from '@/components/icon/Icon';
import { DiffViewIcon } from '@/components/icons/DiffIcon';
<<<<<<< HEAD
||||||| bc50ba56aa
import { ButtonTooltip } from '@/components/ui/action-toolbar';
=======
import { ButtonTooltip } from '@/components/ui/action-toolbar';
import { forgetLabelWrite } from '@/components/references/labelWrites';
>>>>>>> upstream/main
import { REFERENCE_META_TEXT, referenceNumberLabel } from '@/components/references/referencePickerItems';
import type { IconName } from '@/components/icon/icons';
import { toast } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { ButtonTooltip } from '@/components/ui/action-toolbar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { usePendingComposerReferences, type ComposerReferenceHandoff } from '@/components/chat/composer/pendingComposerReferences';
import type { ReferencePickerItem, ReferencePickerSelection } from '@/components/references/referencePickerItems';
import { readTrackerItemDetail } from '@/components/references/referenceSources';
import { readTrackerDescriptor } from '@/lib/trackers/registry';
import { resolveComposerReferences } from '@/components/references/resolveComposerReferences';
import { readMergeMethod, rememberMergeMethod, type RememberedMergeMethod } from '@/components/views/git/mergeMethodPreference';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import type { RepositoryChangeRequestReference, RepositoryDiscussionReference, PullRequestStack, SourceControlReadContext } from '@/lib/api/types';
import type { PullRequestSource } from '@/lib/diff/pullRequestDiff';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { ChangeRequestSubmitRequirement, DiscussionCloseReason, DraftChangeRequestInput, SetStateInput, SourceControlCapabilities } from '@/lib/source-control/types';
import { useChangeRequestDiffServing, useSourceControlProvider } from '@/lib/source-control/providers/registry';
import { formatChangeRequestReference } from '@/lib/source-control/providers/terminology';
import { usePullRequestSelectionStore } from '@/stores/usePullRequestSelectionStore';
import { useUIStore } from '@/stores/useUIStore';
import { useWalkthroughStore } from '@/stores/useWalkthroughStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import type { TrackedThread } from '@/lib/trackedItems/model';
import { useTrackedRecords } from '@/stores/useTrackedItemsStore';
import { useSession } from '@/sync/sync-context';
import { resolvePullLinkTarget } from './boardRepository';
import { landsWithIt, mergeChoiceOf } from './mergeChoice';
import { newMutationKey } from './mutationKey';

export type SourceBoardProject = { id: string; path: string };

const MERGE_METHOD_LABELS = {
    squash: 'gitView.pr.mergeMethod.squash',
    merge: 'gitView.pr.mergeMethod.merge',
    rebase: 'gitView.pr.mergeMethod.rebase',
    submit: 'gitView.pr.mergeMethod.submit',
} as const;

const MERGE_METHOD_KEYS = {
    merge: 'sourceBoard.merge.method.merge',
    squash: 'sourceBoard.merge.method.squash',
    rebase: 'sourceBoard.merge.method.rebase',
    submit: 'sourceBoard.merge.method.submit',
} as const;


const isStackable = (pull: RepositoryChangeRequestReference): boolean => (
    !pull.headRepo
    || (pull.headRepo.owner.toLowerCase() === pull.sourceRepo.owner.toLowerCase() && pull.headRepo.repo.toLowerCase() === pull.sourceRepo.repo.toLowerCase())
);

const selectionOf = (item: ReferencePickerItem): ReferencePickerSelection => (
    item.source === 'tracker' ? item : { source: 'repository', reference: item.reference, includeDiff: false }
);

function useCapabilities(context: SourceControlReadContext | null): SourceControlCapabilities | null {
    const { sourceControl } = useRuntimeAPIs();
    const [state, setState] = React.useState<{ context: SourceControlReadContext; capabilities: SourceControlCapabilities } | null>(null);
    React.useEffect(() => {
        if (!context) return;
        let cancelled = false;
        void sourceControl.capabilities(context)
            .then((capabilities) => { if (!cancelled) setState({ context, capabilities }); })
            .catch(() => undefined);
        return () => { cancelled = true; };
    }, [context, sourceControl]);
    return state && state.context === context ? state.capabilities : null;
}

const ActionButton: React.FC<{
    icon: IconName;
    label: string;
    tooltip: string;
    onClick: () => void;
    busy?: boolean;
}> = ({ icon, label, tooltip, onClick, busy = false }) => (
    <ButtonTooltip label={tooltip}>
        <Button size="sm" variant="outline" onClick={onClick} disabled={busy}>
            <Icon name={busy ? 'loader-4' : icon} className={busy ? 'size-3.5 animate-spin' : 'size-3.5'} />
            {label}
        </Button>
    </ButtonTooltip>
);

export const SourceBoardActions: React.FC<{
    item: ReferencePickerItem;
    project: SourceBoardProject | null;
    context: SourceControlReadContext | null;
    onStartWorktree: (project: SourceBoardProject, selection: ReferencePickerSelection) => void;
    onChanged: () => void;
    startIn?: React.ReactNode;
    onLeave?: () => void;
    worktreeAvailable: boolean;
    stack?: PullRequestStack | null;
    onStartOnTop?: (pull: RepositoryChangeRequestReference) => void;
    submitRequirements?: ChangeRequestSubmitRequirement[];
    submitRequirementsUnreadable?: boolean;
    mergeable?: boolean | null;
}> = ({ item, project, context: readContext, onStartWorktree, onChanged, startIn, onLeave, worktreeAvailable, stack = null, onStartOnTop, submitRequirements, submitRequirementsUnreadable = false, mergeable = null }) => {
    const context = readContext?.linked ? null : readContext;
    const { t } = useI18n();
    const { sourceControl, trackers } = useRuntimeAPIs();
    const confirmation = useConfirmDialog();
<<<<<<< HEAD
    const [busy, setBusy] = React.useState<'merge' | 'ready' | null>(null);
||||||| bc50ba56aa
    const { triggerFireworks } = useFireworksCelebration();
    const [busy, setBusy] = React.useState<'merge' | 'ready' | null>(null);
=======
    const { triggerFireworks } = useFireworksCelebration();
    const [busy, setBusy] = React.useState<'merge' | null>(null);
>>>>>>> upstream/main

    const pull: RepositoryChangeRequestReference | null = item.source === 'repository' && item.reference.kind === 'pull' ? item.reference : null;
    const descriptor = useSourceControlProvider(pull?.provider);
    const openPull = pull && pull.state === 'open' ? pull : null;
    const trackedPulls = React.useMemo<TrackedThread<'pull'>[]>(() => openPull && context ? [{
        provider: context.provider, instance: context.instance, accountId: context.accountId,
        kind: 'pull', owner: openPull.sourceRepo.owner, repo: openPull.sourceRepo.repo, number: openPull.number,
    }] : [], [context, openPull]);
    const [liveRecord] = useTrackedRecords(trackedPulls);
    const liveMerge = liveRecord?.type === 'pull' ? liveRecord.state : null;
    const waitingMerge = liveMerge?.state === 'open' && (liveMerge.isInMergeQueue || liveMerge.autoMergeRequest) === true;
    const waitingLabel = liveMerge?.isInMergeQueue
        ? liveMerge.mergeQueueEntry?.position != null
            ? t('sourceBoard.merge.queuePosition', { position: liveMerge.mergeQueueEntry.position })
            : t('sourceBoard.merge.inQueue')
        : t('sourceBoard.merge.autoMerge');
    const capabilities = useCapabilities(openPull ? context : null);

    const currentSessionId = useSessionUIStore((state) => (state.newSessionDraft?.open ? null : state.currentSessionId));
    const currentSession = useSession(currentSessionId, currentSessionId ? useSessionUIStore.getState().getDirectoryForSession(currentSessionId) ?? undefined : undefined);

<<<<<<< HEAD
    // The item lands on the composer as a chip, never as a sent message, and
    // in the composer it was addressed to: the draft this flow opened, or the
    // chat the board covered.
||||||| bc50ba56aa
    // The item lands on the composer as a chip, never as a sent message.
=======
>>>>>>> upstream/main
    const attachToComposer = (target: ComposerReferenceHandoff) => {
        void resolveComposerReferences([selectionOf(item)], {
            sourceControl,
            context,
            readTrackerDetail: (provider, itemId) => (trackers
                ? readTrackerItemDetail(trackers, provider, itemId)
                : Promise.reject(new Error('Trackers are not available here'))),
            trackerName: (provider) => readTrackerDescriptor(provider).name,
        }).then(({ references, failures }) => {
            if (references.length > 0) usePendingComposerReferences.getState().push(references, target);
            const failure = failures[0];
            if (failure) toast.error(t('sourceBoard.error.attachFailed', { item: failure.label }), { description: failure.error });
        });
    };

    const startSession = () => {
        if (!project) return;
        useSessionUIStore.getState().openNewSessionDraft({ selectedProjectId: project.id, directoryOverride: project.path });
        onLeave?.();
        const { workDraftId } = useSessionUIStore.getState().newSessionDraft;
        if (workDraftId) attachToComposer({ kind: 'draft', workDraftId, runtimeKey: getRuntimeKey() });
    };

    const attachToCurrentSession = () => {
        if (!currentSessionId) return;
        useUIStore.getState().closeMainSurfaces();
        onLeave?.();
        attachToComposer({ kind: 'session', sessionId: currentSessionId });
    };

    const [chosenMethod, setChosenMethod] = React.useState<RememberedMergeMethod>(readMergeMethod);
    const { methods: mergeMethods, method: mergeMethod, unmet, hold: submitHold, blocked: submitBlocked } = mergeChoiceOf({
        allowed: capabilities?.mergeChangeRequests ? capabilities.mergeMethods ?? [] : [],
        remembered: chosenMethod,
        checksRequirements: descriptor.features.submitRequirements,
        requirements: submitRequirements,
        requirementsUnreadable: submitRequirementsUnreadable,
        mergeable,
    });
    const chooseMergeMethod = (value: string) => {
        const method = mergeMethods.find((candidate) => candidate === value);
        if (!method || method === 'submit') return;
        setChosenMethod(method);
        rememberMergeMethod(method);
    };
    const submits = mergeMethod === 'submit';
    const reference = pull ? formatChangeRequestReference(descriptor, pull.number) : '';
    const referenceOf = (number: number) => formatChangeRequestReference(descriptor, number);
    const landsBelow = openPull ? landsWithIt({ stack, number: openPull.number, method: mergeMethod }) : [];
    const submitsBelow = submits && landsBelow.length > 0
        ? t(landsBelow.length === 1 ? 'sourceBoard.submit.alsoBelow.one' : 'sourceBoard.submit.alsoBelow.other', { count: landsBelow.length })
        : null;

    const stackOnTop = onStartOnTop && openPull && descriptor.features.branchHeads && isStackable(openPull) ? () => onStartOnTop(openPull) : null;
    const stackOnTopLabel = t('stacks.actions.newOnTop');

    const merge = async () => {
        if (!openPull || !context || !mergeMethod || submitBlocked) return;
        const methodNote = t(MERGE_METHOD_KEYS[mergeMethod], { base: openPull.base });
        const stackNote = submits
            ? submitsBelow
            : landsBelow.length === 0
                ? null
                : landsBelow.length === 1
                    ? t('stacks.merge.alsoBelow.one', { reference: referenceOf(landsBelow[0].number) })
                    : t('stacks.merge.alsoBelow.other', { count: landsBelow.length, references: landsBelow.map((layer) => referenceOf(layer.number)).join(', ') });
        const approved = await confirmation.confirm({
            title: submitsBelow
                ? t(landsBelow.length === 1 ? 'sourceBoard.submit.confirmTitleWithChain.one' : 'sourceBoard.submit.confirmTitleWithChain.other', { reference, count: landsBelow.length })
                : t(`sourceBoard.merge.confirmTitle.${descriptor.terminology.changeRequest}`, { reference }),
            message: stackNote ? `${stackNote}\n\n${methodNote}` : methodNote,
            action: t(submits ? 'gitView.pr.mergeMethod.submit' : 'sourceBoard.actions.merge'),
        });
        if (!approved) return;
        setBusy('merge');
        try {
            const receipt = await sourceControl.changeRequestMerge({
                ...context,
                idempotencyKey: newMutationKey(),
                target: { project: { owner: openPull.sourceRepo.owner, name: openPull.sourceRepo.repo }, number: openPull.number, head: openPull.head, base: openPull.base, headSha: openPull.headSha },
                method: mergeMethod,
            });
            const { merged, outcome, message } = receipt.result;
<<<<<<< HEAD
||||||| bc50ba56aa
            // One volley more than a push, plus one for each layer of a stack landing with it.
            if (merged) triggerFireworks({ kind: 'merge', volleys: 2 + landsBelow.length, origin });
=======
            if (merged) forgetLabelWrite(openPull);
            if (merged) triggerFireworks({ kind: 'merge', volleys: 2 + landsBelow.length, origin });
>>>>>>> upstream/main
            if (submits) {
                if (merged) toast.success(t('sourceBoard.toast.submitted', { reference }));
                else toast.message(t('sourceBoard.toast.notSubmitted', { reference }), { description: message });
            } else if (merged) {
                toast.success(landsBelow.length === 0
                    ? t('sourceBoard.toast.merged', { reference })
                    : landsBelow.length === 1
                        ? t('stacks.toast.mergedWithBelow.one', { reference })
                        : t('stacks.toast.mergedWithBelow.other', { reference, count: landsBelow.length }));
            } else if (outcome === 'queued') {
                toast.message(t('sourceBoard.toast.mergeQueued', { reference }));
            } else if (outcome === 'merging') {
                toast.message(t('sourceBoard.toast.mergeRunning', { reference }), { description: t('sourceBoard.toast.mergeRunningDescription') });
            } else {
                toast.message(t('sourceBoard.toast.notMerged', { reference }), { description: message });
            }
        } catch (error) {
            toast.error(t(submits ? 'sourceBoard.toast.submitFailed' : 'sourceBoard.toast.mergeFailed', { reference }), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setBusy(null);
            onChanged();
        }
    };

    const cancelMerge = async () => {
        if (!openPull || !context) return;
        setBusy('merge');
        try {
            const receipt = await sourceControl.changeRequestMerge({
                ...context, idempotencyKey: newMutationKey(), method: chosenMethod, cancel: true,
                target: { project: { owner: openPull.sourceRepo.owner, name: openPull.sourceRepo.repo }, number: openPull.number, head: openPull.head, base: openPull.base, headSha: openPull.headSha },
            });
            toast.success(t(receipt.result.merged ? 'sourceBoard.toast.merged' : 'sourceBoard.toast.mergeCancelled', { reference }));
        } catch (error) {
            toast.error(t('sourceBoard.toast.mergeCancelFailed', { reference }), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            setBusy(null);
            onChanged();
        }
    };

    const maintenance = (
        <>
            {waitingMerge ? (
                <>
                    <span className="text-muted-foreground">{waitingLabel}</span>
                    <ActionButton icon="close" label={t('sourceBoard.merge.cancel')} tooltip={t('contextTooltips.tracker.cancelMerge')} onClick={() => void cancelMerge()} busy={busy === 'merge'} />
                </>
            ) : openPull && !openPull.draft && mergeMethod ? (
                <div className="flex shrink-0 items-center">
<<<<<<< HEAD
                    <Button
                        size="sm"
                        variant="outline"
                        // Two halves of one control: the inner corners stay square.
                        className={cn(mergeMethods.length > 1 && 'rounded-e-none')}
                        disabled={busy === 'merge' || submitBlocked}
                        onClick={() => void merge()}
                    >
                        <Icon name={busy === 'merge' ? 'loader-4' : 'git-merge'} className={busy === 'merge' ? 'size-3.5 animate-spin' : 'size-3.5'} />
                        {t(MERGE_METHOD_LABELS[mergeMethod])}
                    </Button>
||||||| bc50ba56aa
                    <ButtonTooltip label={t(submits ? 'contextTooltips.tracker.submitTo' : 'contextTooltips.tracker.mergeInto', { branch: openPull.base })}>
                        <Button
                            size="sm"
                            variant="outline"
                            // Two halves of one control: the inner corners stay square.
                            className={cn(mergeMethods.length > 1 && 'rounded-e-none')}
                            disabled={busy === 'merge' || submitBlocked}
                            onClick={(event) => void merge(event.currentTarget)}
                        >
                            <Icon name={busy === 'merge' ? 'loader-4' : 'git-merge'} className={busy === 'merge' ? 'size-3.5 animate-spin' : 'size-3.5'} />
                            {t(MERGE_METHOD_LABELS[mergeMethod])}
                        </Button>
                    </ButtonTooltip>
=======
                    <ButtonTooltip label={t(submits ? 'contextTooltips.tracker.submitTo' : 'contextTooltips.tracker.mergeInto', { branch: openPull.base })}>
                        <Button
                            size="sm"
                            variant="outline"
                            className={cn(mergeMethods.length > 1 && 'rounded-e-none')}
                            disabled={busy === 'merge' || submitBlocked}
                            onClick={(event) => void merge(event.currentTarget)}
                        >
                            <Icon name={busy === 'merge' ? 'loader-4' : 'git-merge'} className={busy === 'merge' ? 'size-3.5 animate-spin' : 'size-3.5'} />
                            {t(MERGE_METHOD_LABELS[mergeMethod])}
                        </Button>
                    </ButtonTooltip>
>>>>>>> upstream/main
                    {mergeMethods.length > 1 ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-s-none border-s-0 px-1.5"
                                    disabled={busy === 'merge'}
                                    aria-label={t('sourceBoard.merge.methodAria')}
                                >
                                    <Icon name="arrow-down-s" className="size-3.5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-56">
                                <DropdownMenuRadioGroup value={mergeMethod} onValueChange={(value) => chooseMergeMethod(String(value))}>
                                    {mergeMethods.map((method) => (
                                        <DropdownMenuRadioItem key={method} value={method}>{t(MERGE_METHOD_LABELS[method])}</DropdownMenuRadioItem>
                                    ))}
                                </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null}
                </div>
            ) : null}
            {openPull && !openPull.draft && unmet.length > 0 ? (
<<<<<<< HEAD
                // A disabled button shows no tooltip, so what it waits for is said beside it.
||||||| bc50ba56aa
                // What the disabled button waits for is said beside it.
=======
>>>>>>> upstream/main
                <span
                    className="min-w-0 max-w-[16rem] truncate typography-meta text-muted-foreground"
                    title={unmet.map((requirement) => requirement.description ? `${requirement.name}: ${requirement.description}` : requirement.name).join('\n')}
                >
                    {t('sourceBoard.submit.needs', { requirements: unmet.map((requirement) => requirement.name).join(', ') })}
                </span>
            ) : openPull && !openPull.draft && submitHold ? (
                <span className="min-w-0 max-w-[16rem] truncate typography-meta text-muted-foreground">
                    {t(submitHold === 'unreadable' ? 'sourceBoard.submit.unreadable' : 'sourceBoard.submit.notSubmittable')}
                </span>
            ) : openPull && !openPull.draft && submitsBelow ? (
                <span className="min-w-0 max-w-[16rem] truncate typography-meta text-muted-foreground" title={submitsBelow}>
                    {submitsBelow}
                </span>
            ) : null}
            {stackOnTop && !project ? <ActionButton icon="stack" label={stackOnTopLabel} tooltip={t('contextTooltips.tracker.startOnTop')} onClick={stackOnTop} /> : null}
        </>
    );

    return (
        <div className="flex min-h-8 flex-wrap items-center gap-2">
            <div className="me-auto flex min-w-0 items-center gap-2">
                {startIn}
                {maintenance}
            </div>
            {project || currentSessionId ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="default" className="shrink-0">
                            <Icon name="attachment-2" className="size-3.5" />
                            {t('sourceBoard.actions.attach')}
                            <Icon name="arrow-down-s" className="size-3.5 opacity-70" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                        {currentSessionId ? (
                            <DropdownMenuItem onSelect={attachToCurrentSession}>
                                <Icon name="chat-4" className="size-4 shrink-0" />
                                <span className="flex min-w-0 flex-col">
                                    <span>{t('sourceBoard.actions.currentSession')}</span>
                                    {currentSession?.title ? (
                                        <span className="truncate typography-micro text-muted-foreground">{currentSession.title}</span>
                                    ) : null}
                                </span>
                            </DropdownMenuItem>
                        ) : null}
                        {project ? (
                            <>
                                <DropdownMenuItem onSelect={startSession}>
                                    <Icon name="chat-new" className="size-4 shrink-0" />
                                    {t('sourceBoard.actions.newSession')}
                                </DropdownMenuItem>
                                {worktreeAvailable ? (
                                    <DropdownMenuItem onSelect={() => onStartWorktree(project, selectionOf(item))}>
                                        <Icon name="git-branch" className="size-4 shrink-0" />
                                        {t(pull ? 'sourceBoard.actions.checkoutWorktree' : 'sourceBoard.actions.newWorktreeSession')}
                                    </DropdownMenuItem>
                                ) : null}
                                {worktreeAvailable && stackOnTop ? (
                                    <DropdownMenuItem onSelect={stackOnTop}>
                                        <Icon name="stack" className="size-4 shrink-0" />
                                        {stackOnTopLabel}
                                    </DropdownMenuItem>
                                ) : null}
                            </>
                        ) : null}
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null}
            {confirmation.dialog}
        </div>
    );
};

const LINK_CLASS = cn(
    'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 typography-meta hover:bg-interactive-hover hover:text-foreground',
    REFERENCE_META_TEXT,
);

<<<<<<< HEAD
/**
 * Where to look at a PR's changes: the diff view's PR comparison, or its
 * walkthrough. Both open in the panel beside the chat on screen and read the
 * PR through the project's own folder: the folder the app shows when it
 * belongs to the project, else the project's root, without the app moving
 * there; a PR of a repository under a root that is not one is read through
 * that repository, leaving the Git selection alone. With no chat on screen
 * the app opens a draft of the project first. The phone shell has no side
 * panel: there Changes opens the workspace drawer's Git tab on the PR, in the
 * project's draft when the app shows another, `onLeave` gives the chat back
 * underneath it, and the walkthrough is not offered. A host that does not
 * serve change-request diffs gets neither link: both would only say so.
 * With an earlier revision picked (`revision`), both read that revision, the
 * one whose counts sit beside them.
 */
export const SourceBoardPullLinks: React.FC<{
||||||| bc50ba56aa
/**
 * Where to look at a PR's changes: the diff view's PR comparison, or its
 * walkthrough. Both open in the panel beside the chat on screen and read the
 * PR through the project's own folder: the folder the app shows when it
 * belongs to the project, else the project's root, without the app moving
 * there; a PR of a repository under a root that is not one is read through
 * that repository, leaving the Git selection alone. With no chat on screen
 * the app opens a draft of the project first. The phone shell has no side
 * panel: there Changes opens the workspace drawer's Git tab on the PR, in the
 * project's draft when the app shows another, `onLeave` gives the chat back
 * underneath it, and the walkthrough is not offered. A host that does not
 * serve change-request diffs gets neither link: both would only say so.
 * With an earlier revision picked (`revision`), both read that revision, the
 * one whose counts sit beside them.
 */
type PullLinkProps = {
=======
type PullLinkProps = {
>>>>>>> upstream/main
    pull: RepositoryChangeRequestReference;
    project: SourceBoardProject;
    repository: string | null;
    context: SourceControlReadContext;
    projectOwnsDirectory: (directory: string | undefined) => boolean;
    currentDirectory: string | undefined;
    onLeave?: () => void;
    revision?: string | null;
}> = ({ pull, project, repository, context, projectOwnsDirectory, currentDirectory, onLeave, revision = null }) => {
    const { t } = useI18n();
    const mobile = useMobileAppActions();
    const diffServing = useChangeRequestDiffServing(context.provider);
    const open = (surface: 'diff' | 'walkthrough') => {
        const source: PullRequestSource = {
            kind: 'pr', number: pull.number, sourceRepo: { owner: pull.sourceRepo.owner, repo: pull.sourceRepo.repo },
            ...(revision ? { revision } : {}),
        };
        const ui = useUIStore.getState();
        const target = resolvePullLinkTarget({
            projectPath: project.path,
            repository,
            currentDirectory: currentDirectory ?? null,
            owned: Boolean(currentDirectory && projectOwnsDirectory(currentDirectory)),
        });
        if (mobile) {
            if (target.mobileDirectory === currentDirectory) ui.closeMainSurfaces();
            else useSessionUIStore.getState().openNewSessionDraft({ selectedProjectId: project.id, directoryOverride: project.path });
<<<<<<< HEAD
            // A repository under the folder is shown in place of the Git selection, which stays as it was.
            usePullRequestSelectionStore.getState().requestDiff(target.mobileRequestDirectory, source, context, target.mobileRepository);
||||||| bc50ba56aa
            // A repository under the folder is shown in place of the Git selection, which stays as it was.
            usePullRequestSelectionStore.getState().requestDiff(target.mobileRequestDirectory, source, target.mobileRepository);
=======
            usePullRequestSelectionStore.getState().requestDiff(target.mobileRequestDirectory, source, target.mobileRepository);
>>>>>>> upstream/main
            onLeave?.();
            mobile.openChanges();
            return;
        }
        if (currentDirectory) ui.closeMainSurfaces();
        else useSessionUIStore.getState().openNewSessionDraft({ selectedProjectId: project.id, directoryOverride: project.path });
        const { panelDirectory, targetDirectory, requestDirectory } = target;
        if (surface === 'diff') {
            usePullRequestSelectionStore.getState().requestDiff(requestDirectory, source, context);
            ui.openContextPanelTab(panelDirectory, { mode: 'diff', diffScope: 'pr', targetDirectory });
            return;
        }
        useWalkthroughStore.getState().requestTarget(requestDirectory, { source, context });
        ui.openContextPanelTab(panelDirectory, { mode: 'walkthrough', targetDirectory });
    };
    if (diffServing === 'not-served') return null;
    return (
        <span className="inline-flex items-center gap-1">
            <button type="button" className={LINK_CLASS} onClick={() => open('diff')}>
                <DiffViewIcon className="size-3.5" />
                {t('sourceBoard.actions.changes')}
                <Icon name="external-link" className="size-3.5" />
            </button>
            {mobile ? null : (
                <button type="button" className={LINK_CLASS} onClick={() => open('walkthrough')}>
                    <Icon name="route" className="size-3.5 text-[var(--status-info)]" />
                    {t('walkthrough.action.open')}
                    <Icon name="external-link" className="size-3.5" />
                </button>
            )}
        </span>
    );
};


<<<<<<< HEAD
||||||| bc50ba56aa
/**
 * The viewer's unsent review of the previewed PR, beside its reviewers: who it
 * is and how many comments wait. Opens the diff it was written on.
 */
export const SourceBoardReviewDraft: React.FC<PullLinkProps> = (props) => {
    const { pull, context, project } = props;
    const { t } = useI18n();
    const open = useOpenPull(props);
    const target = React.useMemo(() => (pull.state === 'open' ? {
        context,
        provider: context.provider,
        project: { owner: pull.sourceRepo.owner, name: pull.sourceRepo.repo },
        number: pull.number,
        headSha: pull.headSha,
        directory: context.directory ?? project.path,
    } : null), [context, project.path, pull.headSha, pull.number, pull.sourceRepo.owner, pull.sourceRepo.repo, pull.state]);
    const review = useChangeRequestReview(target);
    const count = reviewDraftCount(review);
    if (count === 0) return null;
    const login = review?.state?.draft?.comments[0]?.author?.login;
    const label = t(count === 1 ? 'review.board.draft.one' : 'review.board.draft.other', { count });
    return (
        <button type="button" className={LINK_CLASS} onClick={() => open('diff')}>
            {login ? `${login} · ${label}` : label}
        </button>
    );
};

=======
export const SourceBoardReviewDraft: React.FC<PullLinkProps> = (props) => {
    const { pull, context, project } = props;
    const { t } = useI18n();
    const open = useOpenPull(props);
    const target = React.useMemo(() => (pull.state === 'open' ? {
        context,
        provider: context.provider,
        project: { owner: pull.sourceRepo.owner, name: pull.sourceRepo.repo },
        number: pull.number,
        headSha: pull.headSha,
        directory: context.directory ?? project.path,
    } : null), [context, project.path, pull.headSha, pull.number, pull.sourceRepo.owner, pull.sourceRepo.repo, pull.state]);
    const review = useChangeRequestReview(target);
    const count = reviewDraftCount(review);
    if (count === 0) return null;
    const login = review?.state?.draft?.comments[0]?.author?.login;
    const label = t(count === 1 ? 'review.board.draft.one' : 'review.board.draft.other', { count });
    return (
        <button type="button" className={LINK_CLASS} onClick={() => open('diff')}>
            {login ? `${login} · ${label}` : label}
        </button>
    );
};

>>>>>>> upstream/main
const DISCUSSION_CLOSE_REASONS = ['resolved', 'outdated', 'duplicate'] as const satisfies readonly DiscussionCloseReason[];
const DISCUSSION_CLOSE_KEYS = {
    resolved: 'sourceBoard.discussion.closeResolved',
    outdated: 'sourceBoard.discussion.closeOutdated',
    duplicate: 'sourceBoard.discussion.closeDuplicate',
} as const satisfies Record<DiscussionCloseReason, I18nKey>;
const DISCUSSION_CLOSE_ICONS = {
    resolved: 'chat-check',
    outdated: 'chat-off',
    duplicate: 'file-copy',
} as const satisfies Record<DiscussionCloseReason, IconName>;

const DiscussionStateMenuItems: React.FC<{
    discussion: RepositoryDiscussionReference;
    context: SourceControlReadContext;
    onChanged: () => void;
}> = ({ discussion, context, onChanged }) => {
    const { t } = useI18n();
    const { sourceControl } = useRuntimeAPIs();
    const descriptor = useSourceControlProvider(discussion.provider);
    const label = referenceNumberLabel(discussion, descriptor);
    const change = async (input: { state: 'closed'; reason: DiscussionCloseReason } | { state: 'open' }) => {
        try {
            const base = {
                ...context,
                idempotencyKey: newMutationKey(),
                target: { project: { owner: discussion.sourceRepo.owner, name: discussion.sourceRepo.repo }, number: discussion.number },
            };
            await sourceControl.discussionSetState(input.state === 'closed' ? { ...base, state: 'closed', reason: input.reason } : { ...base, state: 'open' });
            forgetLabelWrite(discussion);
            toast.success(t(input.state === 'closed' ? 'sourceBoard.toast.closed' : 'sourceBoard.toast.reopened', { reference: label }));
        } catch (error) {
            toast.error(
                t(input.state === 'closed' ? 'sourceBoard.toast.closeFailed' : 'sourceBoard.toast.reopenFailed', { reference: label }),
                { description: error instanceof Error ? error.message : String(error) },
            );
        } finally {
            onChanged();
        }
    };
    if (discussion.state !== 'open') {
        return (
            <DropdownMenuItem onSelect={() => void change({ state: 'open' })}>
                <Icon name="arrow-go-back" className="size-4 shrink-0" />
                {t('sourceBoard.discussion.reopen')}
            </DropdownMenuItem>
        );
    }
    return (
        <>
            {DISCUSSION_CLOSE_REASONS.map((reason) => (
                <DropdownMenuItem key={reason} onSelect={() => void change({ state: 'closed', reason })}>
                    <Icon name={DISCUSSION_CLOSE_ICONS[reason]} className="size-4 shrink-0" />
                    {t(DISCUSSION_CLOSE_KEYS[reason])}
                </DropdownMenuItem>
            ))}
        </>
    );
};

export const SourceBoardStateMenuItems: React.FC<{
    item: ReferencePickerItem;
    context: SourceControlReadContext;
    onChanged: () => void;
}> = ({ item, context, onChanged }) => {
    if (item.source === 'repository' && item.reference.kind === 'discussion') {
        return <DiscussionStateMenuItems discussion={item.reference} context={context} onChanged={onChanged} />;
    }
    return <ItemStateMenuItems item={item} context={context} onChanged={onChanged} />;
};

const ItemStateMenuItems: React.FC<{
    item: ReferencePickerItem;
    context: SourceControlReadContext;
    onChanged: () => void;
}> = ({ item, context, onChanged }) => {
    const { t } = useI18n();
    const { sourceControl } = useRuntimeAPIs();
    const repositoryItem = item.source === 'repository' && item.reference.kind !== 'discussion' ? item.reference : null;
    const descriptor = useSourceControlProvider(repositoryItem?.provider);
    const nextState = !repositoryItem || repositoryItem.state === 'merged' ? null : repositoryItem.state === 'open' ? 'closed' : 'open';
    const openPull = repositoryItem?.kind === 'pull' && repositoryItem.state === 'open' ? repositoryItem : null;
    const capabilities = useCapabilities(openPull ? context : null);
    const stateLabel = (() => {
        if (!repositoryItem || !nextState) return '';
        if (repositoryItem.kind === 'issue') return t(nextState === 'closed' ? 'sourceBoard.actions.closeIssue' : 'sourceBoard.actions.reopenIssue');
        const term = descriptor.terminology.changeRequest;
        return t(nextState === 'closed' ? `sourceBoard.actions.closePull.${term}` : `sourceBoard.actions.reopenPull.${term}`);
    })();

    const changeState = async () => {
        if (!repositoryItem || !nextState) return;
        const label = referenceNumberLabel(repositoryItem, descriptor);
        try {
            const payload: SetStateInput = {
                ...context,
                idempotencyKey: newMutationKey(),
                target: { project: { owner: repositoryItem.sourceRepo.owner, name: repositoryItem.sourceRepo.repo }, number: repositoryItem.number },
                state: nextState,
            };
            if (repositoryItem.kind === 'pull') await sourceControl.changeRequestSetState(payload);
            else await sourceControl.issueSetState(payload);
            forgetLabelWrite(repositoryItem);
            toast.success(t(nextState === 'closed' ? 'sourceBoard.toast.closed' : 'sourceBoard.toast.reopened', { reference: label }));
        } catch (error) {
            toast.error(
                t(nextState === 'closed' ? 'sourceBoard.toast.closeFailed' : 'sourceBoard.toast.reopenFailed', { reference: label }),
                { description: error instanceof Error ? error.message : String(error) },
            );
        } finally {
            onChanged();
        }
    };

    const markDraft = async (draft: boolean) => {
        if (!openPull) return;
        const label = referenceNumberLabel(openPull, descriptor);
        try {
            const payload: DraftChangeRequestInput = {
                ...context,
                idempotencyKey: newMutationKey(),
                target: { project: { owner: openPull.sourceRepo.owner, name: openPull.sourceRepo.repo }, number: openPull.number },
            };
            if (draft) await sourceControl.changeRequestDraft(payload);
            else await sourceControl.changeRequestReady(payload);
            toast.success(t(draft ? 'sourceBoard.toast.markedDraft' : 'sourceBoard.toast.markedReady', { reference: label }));
        } catch (error) {
            toast.error(t(draft ? 'sourceBoard.toast.markDraftFailed' : 'sourceBoard.toast.markReadyFailed', { reference: label }), { description: error instanceof Error ? error.message : String(error) });
        } finally {
            onChanged();
        }
    };

    if (!repositoryItem) return null;
    return (
        <>
            {openPull?.draft && capabilities?.draftChangeRequests ? (
                <DropdownMenuItem onSelect={() => void markDraft(false)}>
                    <Icon name="git-pull-request" className="size-4 shrink-0" />
                    {t('sourceBoard.actions.markReady')}
                </DropdownMenuItem>
            ) : null}
            {openPull && !openPull.draft && capabilities?.draftConversion ? (
                <DropdownMenuItem onSelect={() => void markDraft(true)}>
                    <Icon name="git-pr-draft" className="size-4 shrink-0" />
                    {t('sourceBoard.actions.convertToDraft')}
                </DropdownMenuItem>
            ) : null}
            {nextState ? (
                <DropdownMenuItem onSelect={() => void changeState()}>
                    <Icon name={nextState === 'open' ? 'arrow-go-back' : repositoryItem.kind === 'pull' ? 'git-close-pull-request' : 'checkbox-circle'} className="size-4 shrink-0" />
                    {stateLabel}
                </DropdownMenuItem>
            ) : null}
        </>
    );
};
