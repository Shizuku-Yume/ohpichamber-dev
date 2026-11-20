import { z } from 'zod';

export const AskQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().optional(),
  header: z.string().optional(),
  context: z.string().optional(),
  options: z.array(z.object({
    label: z.string(), displayLabel: z.string().optional(), description: z.string().optional(),
    preview: z.string().optional(), disabled: z.boolean().optional(),
  })),
  multi: z.boolean().optional(),
  recommended: z.number().int().nonnegative().optional(),
  required: z.boolean().optional(),
  allowCustom: z.boolean().optional(),
  initialSelected: z.array(z.string()).optional(),
  initialInput: z.string().optional(),
  inputType: z.string().optional(),
  placeholder: z.string().optional(),
  selectionMarker: z.enum(['radio', 'checkbox']).optional(),
  checkedIndices: z.array(z.number().int().nonnegative()).optional(),
  markableCount: z.number().int().nonnegative().optional(),
});
export type AskQuestion = z.infer<typeof AskQuestionSchema>;

export const AskRequestSchema = z.object({
  type: z.literal('omp.ask'), questions: z.array(AskQuestionSchema),
  form: z.boolean().optional(), timeout: z.number().int().positive().optional(),
});

export const AskAnswerSchema = z.strictObject({
  results: z.array(z.strictObject({
    id: z.string().min(1), selectedOptions: z.array(z.string()),
    customInput: z.string().optional(), note: z.string().optional(),
  })),
});
export type AskAnswer = z.infer<typeof AskAnswerSchema>;
