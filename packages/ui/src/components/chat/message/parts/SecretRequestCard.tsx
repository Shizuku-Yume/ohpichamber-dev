import React from 'react';

import { dispatchPageWaiting } from '@/components/chat/lib/scroll/timelineScrollIntent';
import { Icon } from '@/components/icon/Icon';
import { toast } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { problemMessage } from '@/lib/problemMessage';
import type { CanonicalToolView, RequestedSecret, RequestedSecretRun } from './toolView';
import { answerSecretRequest, readSecretRunFields, type SecretRunFields } from '@/lib/secretRequestAnswer';
import { subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionDirectory } from '@/sync/sync-context';

import ToolPartRow from './ToolPart';

function SecretInput({ value, onChange, placeholder, ariaLabel, disabled }: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    ariaLabel: string;
    disabled: boolean;
}) {
    const { t } = useI18n();
    const [revealed, setRevealed] = React.useState(false);
    return (
        <div className="relative min-w-0 flex-1">
            <Input
                type={revealed ? 'text' : 'password'}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                aria-label={ariaLabel}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                disabled={disabled}
                className="w-full pe-9"
            />
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute inset-e-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={t(revealed ? 'chat.secretRequest.hideSecret' : 'chat.secretRequest.showSecret')}
                aria-pressed={revealed}
                title={t(revealed ? 'chat.secretRequest.hideSecret' : 'chat.secretRequest.showSecret')}
                disabled={disabled}
                onClick={() => setRevealed((current) => !current)}
            >
                <Icon name={revealed ? 'eye-off' : 'eye'} className="size-4" />
            </Button>
        </div>
    );
}

function useWaitingIntoView(waiting: boolean) {
    const blockRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (waiting) dispatchPageWaiting(blockRef.current);
    }, [waiting]);
    return blockRef;
}

function SecretCallRow({ part }: { part: CanonicalToolView }) {
    const isMobile = useUIStore((state) => state.isMobile);
    const [expanded, setExpanded] = React.useState(false);
    const toggle = React.useCallback(() => setExpanded((current) => !current), []);
    return <ToolPartRow part={part.call} pairedCall={part.call} isExpanded={expanded} onToggle={toggle} isMobile={isMobile} />;
}

export function SecretRequestCard({ request }: { part: CanonicalToolView; request: RequestedSecret }) {
    const { t } = useI18n();
    return (
        <div className="oc-tile my-2 rounded-xl p-4" data-secret-request-status="refused" role="status">
            <div className="typography-ui-label font-semibold text-foreground">{request.label}</div>
            <p className="mt-1 whitespace-pre-wrap break-words typography-markdown text-muted-foreground">{t('chat.secretRequest.refused')}</p>
        </div>
    );
}

type RunAnswer = { values: Record<string, string>; remember: string[] } | { declined: true };

function SecretRunPrompt({ run, card, onAnswer }: { run: RequestedSecretRun; card: SecretRunFields; onAnswer: (answer: RunAnswer) => Promise<void> }) {
    const { t } = useI18n();
    const [values, setValues] = React.useState<Record<string, string>>({});
    const [remember, setRemember] = React.useState<Record<string, boolean>>({});
    const [busy, setBusy] = React.useState(false);
    const asked = run.fields.filter(field => card.fields.includes(field.env));
    const complete = asked.length > 0 && asked.every(field => values[field.env]?.trim());
    const sending = React.useRef(false);
    const send = async (answer: RunAnswer) => {
        if (sending.current) return;
        sending.current = true;
        setBusy(true);
        try {
            await onAnswer(answer);
            setValues({});
            setRemember({});
        } catch (error) {
            toast.error(problemMessage(error, t('chat.secretRun.sendFailed')));
        } finally {
            sending.current = false;
            setBusy(false);
        }
    };
    const reusedLabels = run.fields.filter(field => card.reused.includes(field.env)).map(field => field.label);
    return (
        <>
            <div className="typography-ui-label font-semibold text-foreground">{t('chat.secretRun.title', { program: run.program })}</div>
            <p className="mt-1 whitespace-pre-wrap break-words typography-markdown text-muted-foreground">{run.reason}</p>
            <pre className="typography-code oc-tile-inset mt-3 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-lg px-2 py-1.5 font-mono text-foreground" aria-label={t('chat.secretRun.commandLabel')}>{run.command}</pre>
            <form
                className="mt-3 flex flex-col gap-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (!complete || busy) return;
                    void send({ values: Object.fromEntries(asked.map(field => [field.env, values[field.env] ?? ''])), remember: asked.filter(field => remember[field.env]).map(field => field.env) });
                }}
            >
                {asked.map(field => (
                    <div key={field.env} className="flex flex-col gap-1.5">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="min-w-0 typography-ui-label text-foreground">{field.label}</span>
                            <span className="shrink-0 font-mono typography-meta text-muted-foreground">{field.env}</span>
                        </div>
                        <SecretInput value={values[field.env] ?? ''} onChange={value => setValues(current => ({ ...current, [field.env]: value }))} placeholder={field.placeholder ?? t('chat.secretRequest.placeholder')} ariaLabel={field.label} disabled={busy} />
                        <label className="flex w-fit cursor-pointer items-center gap-1.5 typography-meta text-muted-foreground">
                            <Checkbox ariaLabel={t('chat.secretRun.remember')} checked={remember[field.env] === true} onChange={checked => setRemember(current => ({ ...current, [field.env]: checked }))} disabled={busy} />
                            <span>{t('chat.secretRun.remember')}</span>
                        </label>
                    </div>
                ))}
                {reusedLabels.length > 0 ? <div className="typography-meta text-muted-foreground">{t('chat.secretRun.reused', { labels: reusedLabels.join(', ') })}</div> : null}
                <div className="flex items-center gap-1.5 typography-meta text-muted-foreground">
                    <Icon name="shield-check" className="size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">{t('chat.secretRun.privacy')}</span>
                    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void send({ declined: true })}>{t('chat.secretRequest.decline')}</Button>
                    <Button type="submit" size="sm" disabled={busy || !complete}>{t('chat.secretRun.submit')}</Button>
                </div>
            </form>
        </>
    );
}

export function SecretRunCard({ part, run }: { part: CanonicalToolView; run: RequestedSecretRun }) {
    const { t } = useI18n();
    const directory = useSessionDirectory(part.sessionID);
    const [card, setCard] = React.useState<SecretRunFields | null>(null);
    const [failed, setFailed] = React.useState(false);
    const [sent, setSent] = React.useState(false);
    const ended = React.useRef(false);
    const waiting = part.state.status === 'running' && !sent;
    React.useEffect(() => subscribeRuntimeEndpointWillChange(() => {
        ended.current = true;
        setCard(null);
        setSent(true);
    }), []);
    React.useEffect(() => {
        if (!waiting) return;
        let current = true;
        let retry: ReturnType<typeof setTimeout> | undefined;
        const controller = new AbortController();
        const read = async () => {
            try {
                const fields = await readSecretRunFields({ sessionId: part.sessionID, callId: part.callID }, directory, controller.signal);
                if (!current || ended.current) return;
                setCard(fields);
                setFailed(false);
            } catch {
                if (!current || ended.current) return;
                setCard(null);
                setFailed(true);
            }
            if (current && !ended.current) retry = setTimeout(() => void read(), 2_000);
        };
        void read();
        return () => { current = false; controller.abort(); clearTimeout(retry); };
    }, [directory, part.callID, part.sessionID, waiting]);
    const asking = waiting && card !== null && card.fields.length > 0;
    const blockRef = useWaitingIntoView(asking);
    const send = async (answer: RunAnswer) => {
        if (ended.current) return;
        await answerSecretRequest({ sessionId: part.sessionID, callId: part.callID, ...answer }, directory);
        setCard(null);
        setSent(true);
    };
    if (failed && waiting) return <div role="alert" className="my-2 typography-meta text-muted-foreground">{t('chat.secretRun.loadFailed')}</div>;
    if (!asking || !card) return <SecretCallRow part={part} />;
    return <div ref={blockRef} className="oc-tile my-2 rounded-xl p-4" data-secret-request-status="waiting" data-waiting-page={part.id}>
        <SecretRunPrompt key={card.fields.join(',')} run={run} card={card} onAnswer={send} />
    </div>;
}
