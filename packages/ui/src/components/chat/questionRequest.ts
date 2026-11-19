import { AskRequestSchema, PlanReviewSchema, PlanReviewResponseSchema, type AskQuestion as CanonicalAskQuestion, type PlanReview, type PlanReviewResponse, type QuestionRequest } from '@openchamber/agent-contract';

/**
 * Native `omp.ask` questions, shaped exactly like the request boundary:
 * `schema = { type: 'omp.ask', questions: [{ id, question, header, options,
 * multi, recommended }] }`. The answer is `{ results: [{ id,
 * selectedOptions, customInput? }] }`, in question order, which
 * `InteractionManager.validateAnswer` accepts and the worker forwards to the
 * SDK dialog. This module owns the pure state and keyboard rules; the card and
 * dock only render them.
 */

export type AskQuestion = CanonicalAskQuestion & {
  multi: boolean;
};

export type AskAnswerState = {
  /** Option labels the user selected. */
  selected: string[];
  /** The user chose the free-text answer instead of an option. */
  custom: boolean;
  text: string;
};

type AskAnswerResult = {
  id: string;
  selectedOptions: string[];
  customInput?: string;
};

export type AskAnswerPayload = { results: AskAnswerResult[] };

/** The OMP dialog timeout in milliseconds, when the native host supplied one. */
export function parseAskTimeout(schema: QuestionRequest['schema']): number | undefined {
  const parsed = AskRequestSchema.safeParse(schema);
  return parsed.success ? parsed.data.timeout : undefined;
}

export type QuestionAnswerPayload = AskAnswerPayload | PlanReviewResponse;

/** Plan reviews use the same pending question and CAS reply boundary as omp.ask. */
export function parsePlanReview(schema: QuestionRequest['schema']): PlanReview | null {
  const parsed = PlanReviewSchema.safeParse(schema);
  return parsed.success ? parsed.data : null;
}

/** Blank feedback is never sent; the contract trims accepted feedback. */
export function buildPlanReviewAnswer(
  action: PlanReviewResponse['action'],
  feedback = '',
  executionModel?: { providerId: string; modelId: string } | null,
): PlanReviewResponse | null {
  const model = executionModel ? { providerId: executionModel.providerId, modelId: executionModel.modelId } : undefined;
  const raw = action === 'feedback'
    ? { action, feedback }
    : (action === 'approve' || action === 'approve-compact') && model
      ? { action, executionModel: model }
      : { action };
  const parsed = PlanReviewResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Questions from the native schema, in request order. */
export function parseAskQuestions(schema: QuestionRequest['schema']): AskQuestion[] {
  const parsed = AskRequestSchema.safeParse(schema);
  if (!parsed.success) return [];
  return parsed.data.questions.map((item) => {
    return { ...item, multi: item.multi === true };
  });
}

/** Resets saved answers when the rendered question list itself changes. */
export const askSchemaSignature = (schema: QuestionRequest['schema']): string => {
  return JSON.stringify(parseAskQuestions(schema)) ?? '';
};

const emptyState = (): AskAnswerState => ({ selected: [], custom: false, text: '' });

export const initialAskAnswers = (questions: readonly AskQuestion[]): AskAnswerState[] =>
  questions.map((question) => {
    if (question.initialSelected !== undefined || question.initialInput !== undefined) return {
      selected: question.initialSelected ?? [], custom: false, text: question.initialInput ?? '',
    };
    const recommended = question.recommended;
    const option = recommended === undefined ? undefined : question.options[recommended];
    return option ? { selected: [option.label], custom: false, text: '' } : emptyState();
  });

export const answerAt = (answers: readonly AskAnswerState[], index: number): AskAnswerState =>
  answers[index] ?? emptyState();

/** A single choice replaces the selection; multi toggles one label. */
export function toggleAskOption(
  question: AskQuestion,
  state: AskAnswerState,
  label: string,
): AskAnswerState {
  if (question.options.find(option => option.label === label)?.disabled) return state;
  if (question.multi) {
    const selected = state.selected.includes(label)
      ? state.selected.filter((entry) => entry !== label)
      : [...state.selected, label];
    return { ...state, selected };
  }
  return { ...state, selected: [label], custom: false };
}

/** Choosing "Other" clears a single choice; multi answers may keep both. */
export function setAskCustom(question: AskQuestion, state: AskAnswerState, custom: boolean): AskAnswerState {
  return { ...state, custom, selected: question.multi ? state.selected : [] };
}

export const setAskText = (state: AskAnswerState, value: string): AskAnswerState => ({ ...state, text: value });

/** A free-text-only question (no options) reads the text box directly. */
const customTextFor = (question: AskQuestion, state: AskAnswerState): string | undefined => {
  if (question.options.length === 0 || state.custom) {
    if (question.inputType !== undefined) return state.text;
    const value = state.text.trim();
    return value.length === 0 ? undefined : value;
  }
  return undefined;
};

export const isAskQuestionAnswered = (question: AskQuestion, state: AskAnswerState): boolean => {
  if (question.required === false) return true;
  const custom = customTextFor(question, state);
  if (question.options.length === 0) return custom !== undefined && custom.trim().length > 0;
  if (question.multi) return state.selected.length > 0 || custom !== undefined;
  return custom !== undefined || state.selected.length === 1;
};

export const missingAskQuestionIndexes = (
  questions: readonly AskQuestion[],
  answers: readonly AskAnswerState[],
): number[] => questions.flatMap((question, index) => (
  isAskQuestionAnswered(question, answerAt(answers, index)) ? [] : [index]
));

/**
 * The exact reply payload. Results stay in question order with the request
 * ids; selected labels follow their declared option order so a retried answer
 * is identical. A blank custom answer is omitted, as the boundary rejects it.
 */
export function buildAskAnswer(
  questions: readonly AskQuestion[],
  answers: readonly AskAnswerState[],
): AskAnswerPayload {
  return {
    results: questions.map((question, index) => {
      const state = answerAt(answers, index);
      const declaredLabels = [...new Set(question.options.map((option) => option.label))];
      const selectedOptions = declaredLabels.filter((label) => state.selected.includes(label));
      const customInput = customTextFor(question, state);
      const result: AskAnswerResult = { id: question.id, selectedOptions };
      if (customInput !== undefined) result.customInput = customInput;
      return result;
    }),
  };
}

type QuestionKey = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey'>;
type QuestionKeyOptions = { isComposing: boolean; isMobile: boolean };

type QuestionKeyIntent = 'submit' | 'next' | null;

/**
 * Enter advances a stepped dock and submits the last step; Ctrl/Meta+Enter
 * submits from any step. Mobile keeps Enter for a newline. The owner passes
 * `isIMECompositionEvent(event)` so composition never submits.
 */
export function dockQuestionTextIntent(
  event: QuestionKey,
  options: QuestionKeyOptions & { isLastStep: boolean },
): QuestionKeyIntent {
  if (options.isComposing) return null;
  if (event.key !== 'Enter' || event.shiftKey) return null;
  if (event.ctrlKey || event.metaKey) return 'submit';
  if (options.isMobile) return null;
  return options.isLastStep ? 'submit' : 'next';
}

/** Inline cards submit on Enter (outside mobile) or Ctrl/Meta+Enter. */
export function cardQuestionTextIntent(
  event: QuestionKey,
  options: QuestionKeyOptions,
): QuestionKeyIntent {
  if (options.isComposing) return null;
  if (event.key !== 'Enter' || event.shiftKey) return null;
  if (event.ctrlKey || event.metaKey) return 'submit';
  return options.isMobile ? null : 'submit';
}

/** Markdown for the copy action: readable outside the app. */
export function serializeAskQuestionsMarkdown(prompt: string, questions: readonly AskQuestion[]): string {
  const lines: string[] = [];
  if (prompt.trim().length > 0) lines.push(prompt.trim(), '');
  for (const question of questions) {
    const title = question.header?.trim() || question.question?.trim() || question.id;
    lines.push(`## ${title}`);
    for (const option of question.options) {
      lines.push(`- ${option.label}${option.description ? `: ${option.description}` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

type QuestionAnswerDelivery = {
  reply: (payload: QuestionAnswerPayload) => Promise<void>;
  recover: () => void;
  failed: (error: unknown) => void;
};

/**
 * True only when the boundary accepted the reply. A failed or stale-CAS reply
 * notifies the user and refreshes the pending record; the caller must not mark
 * the request answered, so the card stays visible with its inputs.
 */
export async function deliverQuestionAnswer(
  delivery: QuestionAnswerDelivery,
  payload: QuestionAnswerPayload,
): Promise<boolean> {
  try {
    await delivery.reply(payload);
    return true;
  } catch (error) {
    delivery.failed(error);
    delivery.recover();
    return false;
  }
}
