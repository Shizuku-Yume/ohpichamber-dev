import React from 'react';
import type { QuestionRequest } from '@openchamber/agent-contract';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { QuestionFormPanel } from './FormDock';
import { PlanReviewCard } from './PlanReviewCard';
import { parsePlanReview } from './questionRequest';

export function FormCard({ form, directory }: { form: QuestionRequest; directory?: string; inChat?: boolean; keepDraft?: boolean }) {
    const runtimeKey = React.useSyncExternalStore(subscribeRuntimeEndpointChanged, getRuntimeKey, getRuntimeKey);
    if (form.status !== 'pending') return null;
    const key = JSON.stringify([runtimeKey, directory, form.sessionId, form.questionId]);
    return parsePlanReview(form.schema)
        ? <PlanReviewCard key={key} form={form} directory={directory} />
        : <QuestionFormPanel key={key} form={form} forms={[form]} directory={directory} inline />;
}
