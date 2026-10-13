import { z } from 'zod';

export const PublicWorkspaceSchema = z.object({
  workspaceId: z.string().min(1), projectId: z.string().min(1), name: z.string().min(1), displayPath: z.string().min(1).nullable(),
}).strict();
export const PublicWorkspaceListSchema = z.object({ items: z.array(PublicWorkspaceSchema), errors: z.array(z.object({ code: z.string().min(1), message: z.string().min(1) }).strict()) }).strict();
export const PublicAttachmentSchema = z.object({ attachmentId: z.string().min(1), workspaceId: z.string().min(1), name: z.string().min(1), mediaType: z.string().min(1), size: z.number().int().nonnegative() }).strict();
