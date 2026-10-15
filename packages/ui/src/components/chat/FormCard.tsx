import React from 'react';
import { JsonValueSchema, type QuestionRequest } from '@openchamber/agent-contract';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/components/ui';
import { Button } from '@/components/ui/button';
import * as sessionActions from '@/sync/session-actions';
import { canonicalClient } from '@/api/canonicalClient';
import { useSync } from '@/sync/use-sync';
import { FormMarkdown } from './FormMarkdown';
import { useChatSessionSelection } from './chatColumnSession';

export const FormCard: React.FC<{ form: QuestionRequest }> = ({ form }) => {
    const { t } = useI18n();
    const sync = useSync();
    const { directory } = useChatSessionSelection();
    const [value, setValue] = React.useState('');
    const [pending, setPending] = React.useState(false);
    const [answered, setAnswered] = React.useState(false);
    const submit = async (cancel: boolean) => {
        setPending(true);
        try {
            if (cancel) await sessionActions.cancelForm(form.sessionId, form.questionId);
            else {
                // Schema-backed questions accept JSON, not guessed OpenCode
                // fields. The Host owns validation against the supplied schema.
                const response = form.schema ? JsonValueSchema.parse(JSON.parse(value)) : value;
                await canonicalClient.respondQuestion(form.sessionId, form.questionId, { version: form.version, epoch: form.epoch, workerGeneration: form.workerGeneration, action: 'answer', response });
                await sync.recoverPendingQuestions(form.sessionId, directory ?? undefined);
            }
            setAnswered(true);
        } catch {
            toast.error(t(cancel ? 'chat.formCard.cancelFailed' : 'chat.formCard.submitFailed'), { description: t('chat.formCard.tryAgain') });
        } finally { setPending(false); }
    };
    if (answered || form.status !== 'pending') return null;
    return <div className="space-y-3 rounded-xl border border-border p-3">
        <FormMarkdown content={form.prompt} size="meta" />
        {form.schema ? <pre className="overflow-x-auto whitespace-pre-wrap typography-meta">{JSON.stringify(form.schema, null, 2)}</pre> : null}
        <textarea aria-label={t('chat.formCard.inputNeeded')} className="w-full rounded border border-border bg-transparent p-2" value={value} onChange={(event) => setValue(event.target.value)} disabled={pending} />
        <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => void submit(false)}>{t('chat.formCard.submit')}</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => void submit(true)}>{t('chat.formCard.cancel')}</Button>
        </div>
    </div>;
};
