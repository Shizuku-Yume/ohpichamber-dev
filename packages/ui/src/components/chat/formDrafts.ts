
import type { QuestionRequest } from '@openchamber/agent-contract';
import type { AskAnswerState } from './questionRequest';
import { getRuntimeKey } from '@/lib/runtime-switch';

export type FormDraftScope = {
  runtimeKey: string;
  directory: string;
  sessionID: string;
  formID: string;
};

export type FormDraft = {
  fieldsSignature: string;
  kind: 'question';
  answers: AskAnswerState[];
  step: number;
} | {
  fieldsSignature: string;
  kind: 'plan-review';
  feedback: string;
  executionModel: { providerId: string; modelId: string } | null;
};

const formDrafts = new Map<string, FormDraft>();
const MAX_FORM_DRAFTS = 50;

const scopeKey = (scope: FormDraftScope): string =>
  [scope.runtimeKey, scope.directory, scope.sessionID, scope.formID].join('\u0000');

export function formDraftScope(form: Pick<QuestionRequest, 'questionId' | 'sessionId'>, directory?: string, runtimeKey: string = getRuntimeKey()): FormDraftScope {
  return {
    runtimeKey,
    directory: directory ?? '',
    sessionID: form.sessionId,
    formID: form.questionId,
  };
}

export function loadFormDraft(scope: FormDraftScope): FormDraft | null {
  const draft = formDrafts.get(scopeKey(scope));
  return draft ?? null;
}

export function saveFormDraft(scope: FormDraftScope, draft: FormDraft): void {
  const key = scopeKey(scope);
  formDrafts.delete(key);
  formDrafts.set(key, draft);
  if (formDrafts.size > MAX_FORM_DRAFTS) {
    const oldest = formDrafts.keys().next().value;
    if (oldest !== undefined) formDrafts.delete(oldest);
  }
}

export function dropFormDraft(scope: FormDraftScope): void {
  formDrafts.delete(scopeKey(scope));
}

export function dropFormDraftsForRequest(runtimeKey: string, sessionID: string, formID: string): void {
  for (const key of [...formDrafts.keys()]) {
    const [draftRuntimeKey, , draftSessionID, draftFormID] = key.split('\u0000');
    if (draftRuntimeKey === runtimeKey && draftSessionID === sessionID && draftFormID === formID) formDrafts.delete(key);
  }
}

export function resetFormDrafts(): void {
  formDrafts.clear();
}
