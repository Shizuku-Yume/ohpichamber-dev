import { describe, expect, test } from 'bun:test';
import { JsonObjectSchema, type JsonObject } from '@openchamber/agent-contract';
import {
  askSchemaSignature,
  buildAskAnswer,
  buildPlanReviewAnswer,
  cardQuestionTextIntent,
  deliverQuestionAnswer,
  dockQuestionTextIntent,
  initialAskAnswers,
  isAskQuestionAnswered,
  missingAskQuestionIndexes,
  parseAskQuestions,
  parseAskTimeout,
  parsePlanReview,
  setAskCustom,
  setAskText,
  toggleAskOption,
} from './questionRequest';

const schema = JsonObjectSchema.parse({
  type: 'omp.ask',
  timeout: 45_000,
  questions: [
    {
      id: 'colors',
      header: 'Colors',
      question: 'Which colors should I use?',
      multi: true,
      recommended: 1,
      options: [
        { label: 'red', description: 'Warm', preview: '**Rose** red' },
        { label: 'blue', preview: '- ocean\n- sky' },
      ],
    },
    {
      id: 'note',
      question: 'Anything else?',
      options: [{ label: 'Other' }],
    },
  ],
});

describe('parseAskQuestions', () => {
  test('preserves form defaults, optional controls, exact text and disabled choices', () => {
    const questions = parseAskQuestions({ type: 'omp.ask', form: true, questions: [
      { id: 'choice', options: [{ label: '0', displayLabel: 'A' }, { label: '1', disabled: true }], initialSelected: ['0'], allowCustom: false },
      { id: 'text', options: [], inputType: 'textarea', initialInput: ' exact ', required: false },
    ] });
    const answers = initialAskAnswers(questions);
    expect(answers).toEqual([{ selected: ['0'], custom: false, text: '' }, { selected: [], custom: false, text: ' exact ' }]);
    expect(toggleAskOption(questions[0]!, answers[0]!, '1')).toBe(answers[0]!);
    expect(isAskQuestionAnswered(questions[1]!, { selected: [], custom: false, text: '' })).toBe(true);
    expect(buildAskAnswer(questions, answers)).toEqual({ results: [{ id: 'choice', selectedOptions: ['0'] }, { id: 'text', selectedOptions: [], customInput: ' exact ' }] });
  });

  test('reads the optional native timeout', () => {
    expect(parseAskTimeout(schema)).toBe(45_000);
  });

  test('reads options previews and recommended choice from the native question shape', () => {
    expect(parseAskQuestions(schema)).toEqual([
      {
        id: 'colors',
        header: 'Colors',
        question: 'Which colors should I use?',
        multi: true,
        recommended: 1,
        options: [{ label: 'red', description: 'Warm', preview: '**Rose** red' }, { label: 'blue', preview: '- ocean\n- sky' }],
      },
      { id: 'note', question: 'Anything else?', multi: false, options: [{ label: 'Other' }] },
    ]);
  });

  test('rejects other schemas and malformed question items', () => {
    const foreignSchema: JsonObject = { type: 'json-schema', questions: [] };
    const malformed: JsonObject = { type: 'omp.ask', questions: [{ id: 'q', options: [{ label: 42 }] }] };
    expect(parseAskQuestions(foreignSchema)).toEqual([]);
    expect(parseAskQuestions(malformed)).toEqual([]);
  });
});

test('preselects the recommended option in single and multi questions', () => {
  const questions = parseAskQuestions({
    type: 'omp.ask',
    questions: [
      { id: 'single', options: [{ label: 'no' }, { label: 'yes' }], recommended: 1 },
      { id: 'multi', options: [{ label: 'first' }, { label: 'second' }], multi: true, recommended: 0 },
      { id: 'unrecommended', options: [{ label: 'left' }, { label: 'right' }] },
      { id: 'invalid', options: [{ label: 'only' }], recommended: 3 },
    ],
  });
  expect(initialAskAnswers(questions).map((answer) => answer.selected)).toEqual([['yes'], ['first'], [], []]);
});


describe('native question answers', () => {
  const questions = parseAskQuestions(schema);

  test('keeps result order and request ids, with selections in option order', () => {
    const answers = initialAskAnswers(questions);
    const withRed = toggleAskOption(questions[0], answers[0], 'red');
    const note = setAskCustom(questions[1], answers[1], true);

    expect(buildAskAnswer(questions, [withRed, setAskText(note, '  a free answer  ')])).toEqual({
      results: [
        { id: 'colors', selectedOptions: ['red', 'blue'] },
        { id: 'note', selectedOptions: [], customInput: 'a free answer' },
      ],
    });
  });

  test('multi-choice keeps selected options and a custom answer together', () => {
    const selected = toggleAskOption(questions[0], initialAskAnswers(questions)[0], 'red');
    const custom = setAskText(setAskCustom(questions[0], selected, true), 'also lime');

    expect(buildAskAnswer([questions[0]], [custom])).toEqual({
      results: [{ id: 'colors', selectedOptions: ['red', 'blue'], customInput: 'also lime' }],
    });
  });

  test('single choice replaces the selection and clears a custom answer', () => {
    const single = questions[1];
    const custom = setAskText(setAskCustom(single, initialAskAnswers([single])[0], true), 'typed');
    const chosen = toggleAskOption(single, custom, 'Other');

    expect(chosen).toEqual({ selected: ['Other'], custom: false, text: 'typed' });
    expect(buildAskAnswer([single], [chosen])).toEqual({
      results: [{ id: 'note', selectedOptions: ['Other'] }],
    });
  });

  test('omits a blank free-text answer and reports the question missing', () => {
    const freeform = parseAskQuestions({ type: 'omp.ask', questions: [{ id: 'input', options: [] }] });
    const blank = [setAskText(initialAskAnswers(freeform)[0], '   ')];

    expect(isAskQuestionAnswered(freeform[0], blank[0])).toBe(false);
    expect(missingAskQuestionIndexes(freeform, blank)).toEqual([0]);
    expect(buildAskAnswer(freeform, blank)).toEqual({ results: [{ id: 'input', selectedOptions: [] }] });
  });
});

describe('question text keyboard rules', () => {
  const enter = { key: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false };
  const typing = { isComposing: false, isMobile: false };

  test('never acts while an IME composition is active', () => {
    expect(dockQuestionTextIntent(enter, { ...typing, isComposing: true, isLastStep: true })).toBeNull();
    expect(cardQuestionTextIntent(enter, { ...typing, isComposing: true })).toBeNull();
  });

  test('moves through dock steps and submits the last one', () => {
    expect(dockQuestionTextIntent(enter, { ...typing, isLastStep: false })).toBe('next');
    expect(dockQuestionTextIntent(enter, { ...typing, isLastStep: true })).toBe('submit');
    expect(dockQuestionTextIntent({ ...enter, ctrlKey: true }, { ...typing, isMobile: true, isLastStep: false })).toBe('submit');
  });

  test('keeps Enter for newlines on touch keyboards and Shift+Enter everywhere', () => {
    expect(dockQuestionTextIntent(enter, { ...typing, isMobile: true, isLastStep: true })).toBeNull();
    expect(cardQuestionTextIntent(enter, { ...typing, isMobile: true })).toBeNull();
    expect(cardQuestionTextIntent({ ...enter, shiftKey: true }, typing)).toBeNull();
    expect(cardQuestionTextIntent(enter, typing)).toBe('submit');
  });
});

describe('askSchemaSignature', () => {
  test('changes only when the native question content changes', () => {
    const withoutQuestions: JsonObject = { ...schema, questions: [] };
    expect(askSchemaSignature(schema)).toBe(askSchemaSignature(structuredClone(schema)));
    expect(askSchemaSignature(withoutQuestions)).not.toBe(askSchemaSignature(schema));
  });
});

describe('question answer delivery', () => {
  const payload = { results: [{ id: 'q', selectedOptions: ['yes'] }] };

  test('a CAS conflict or transport failure keeps the request pending and recovers it', async () => {
    const calls: string[] = [];
    const accepted = await deliverQuestionAnswer({
      reply: async () => {
        throw new Error('QUESTION_CONFLICT');
      },
      failed: () => calls.push('failed'),
      recover: () => calls.push('recover'),
    }, payload);

    expect(accepted).toBe(false);
    expect(calls).toEqual(['failed', 'recover']);
  });

  test('acceptance marks the reply complete without recovering a stale card', async () => {
    const calls: string[] = [];
    const accepted = await deliverQuestionAnswer({
      reply: async (delivered) => {
        expect(delivered).toEqual(payload);
        calls.push('reply');
      },
      failed: () => calls.push('failed'),
      recover: () => calls.push('recover'),
    }, payload);

    expect(accepted).toBe(true);
    expect(calls).toEqual(['reply']);
  });
});

describe('plan review questions', () => {
  const review = {
    type: 'plan-review', title: 'Improve the composer',
    planReference: 'local://plans/composer.md', planText: '## Plan\n\nKeep the existing ask flow.',
  };

  test('parses a plan review without treating it as omp.ask', () => {
    expect(parsePlanReview(review)).toEqual(review);
    expect(parseAskQuestions(review)).toEqual([]);
    expect(parsePlanReview(schema)).toBeNull();
  });

  test('rejects malformed reviews and nonlocal references', () => {
    expect(parsePlanReview({ ...review, planText: 42 })).toBeNull();
    expect(parsePlanReview({ ...review, planReference: '/home/private/plan.md' })).toBeNull();
    expect(parsePlanReview({ ...review, planReference: 'https://example.com/plan.md' })).toBeNull();
    expect(parsePlanReview({ ...review, planReference: 'local://../plan.md' })).toBeNull();
  });

  test('builds each decision and trims feedback without sending blanks', () => {
    for (const action of ['approve', 'approve-compact', 'reject'] as const) {
      expect(buildPlanReviewAnswer(action)).toEqual({ action });
    }
    expect(buildPlanReviewAnswer('feedback', '  Keep keyboard navigation.\n')).toEqual({
      action: 'feedback', feedback: 'Keep keyboard navigation.',
    });
    expect(buildPlanReviewAnswer('feedback', ' \n\t ')).toBeNull();
  });

  test('delivers Reject as an answer and preserves failed feedback for retry', async () => {
    const rejected = { action: 'reject' } as const;
    expect(await deliverQuestionAnswer({
      reply: async (payload) => { expect(payload).toEqual(rejected); },
      recover: () => { throw new Error('Unexpected recovery'); },
      failed: () => { throw new Error('Unexpected failure'); },
    }, rejected)).toBe(true);

    const payload = { action: 'feedback', feedback: 'Revise the plan' } as const;
    const calls: string[] = [];
    expect(await deliverQuestionAnswer({
      reply: async (delivered) => { expect(delivered).toEqual(payload); throw new Error('QUESTION_CONFLICT'); },
      failed: () => { calls.push('failed'); },
      recover: () => { calls.push('recover'); },
    }, payload)).toBe(false);
    expect(payload.feedback).toBe('Revise the plan');
    expect(calls).toEqual(['failed', 'recover']);
  });
});
