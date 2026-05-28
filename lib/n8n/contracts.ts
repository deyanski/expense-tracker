import { z } from "zod";
import { expenseStatusSchema } from "@/lib/schemas/expense";

export const commentGuardWebhookInputSchema = z.object({
  schemaVersion: z.literal("1.0"),
  correlationId: z.string().uuid(),
  submittedAt: z.string().datetime(),
  employee: z.object({
    fullName: z.string().min(2).max(120),
    employeeId: z.string().min(1).max(64),
  }),
  comment: z.string().trim().min(1).max(4000),
});

export type CommentGuardWebhookInput = z.infer<typeof commentGuardWebhookInputSchema>;

const commentGuardNormalizedOutputSchema = z.object({
  safe: z.boolean(),
});

export const commentGuardWebhookOutputSchema = z.union([
  commentGuardNormalizedOutputSchema,
  z.array(commentGuardNormalizedOutputSchema).min(1).transform((items) => items[0]!),
  z.object({ output: commentGuardNormalizedOutputSchema }).transform((value) => value.output),
  z
    .array(z.object({ output: commentGuardNormalizedOutputSchema }))
    .min(1)
    .transform((items) => items[0]!.output),
  z.boolean().transform((safe) => ({ safe })),
]);

export type CommentGuardWebhookOutput = z.infer<typeof commentGuardWebhookOutputSchema>;

export const ocrWebhookInputSchema = z.object({
  schemaVersion: z.literal("1.0"),
  correlationId: z.string().uuid(),
  submittedAt: z.string().datetime(),
  employee: z.object({
    fullName: z.string().min(2).max(120),
    employeeId: z.string().min(1).max(64),
  }),
  receipt: z.object({
    bucket: z.string().min(1),
    objectPath: z.string().min(1),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
    sizeBytes: z.number().int().positive(),
  }),
  comment: z.string().max(4000).optional(),
});

export type OcrWebhookInput = z.infer<typeof ocrWebhookInputSchema>;

const ocrNormalizedOutputSchema = z.object({
  merchant: z.string().optional(),
  receiptDate: z.string().optional(),
  amount: z.number().positive().optional(),
  currency: z.string().min(3).max(3).optional(),
  extractedText: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  categoryHint: z.string().optional(),
});

export const ocrWebhookOutputSchema = z.union([
  ocrNormalizedOutputSchema,
  z.object({ output: ocrNormalizedOutputSchema }).transform((value) => value.output),
  z
    .array(z.object({ output: ocrNormalizedOutputSchema }))
    .min(1)
    .transform((items) => items[0]!.output),
]);

export type OcrWebhookOutput = z.infer<typeof ocrWebhookOutputSchema>;

export const policyWebhookInputSchema = z.object({
  schemaVersion: z.literal("1.0"),
  correlationId: z.string().uuid(),
  submittedAt: z.string().datetime(),
  employee: z.object({
    fullName: z.string().min(2).max(120),
    employeeId: z.string().min(1).max(64),
  }),
  comment: z.string().max(4000).optional(),
  receipt: z
    .object({
      bucket: z.string().min(1),
      objectPath: z.string().min(1),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
      sizeBytes: z.number().int().positive(),
    })
    .optional(),
  ocr: ocrWebhookOutputSchema.optional(),
  textOnly: z.boolean(),
});

export type PolicyWebhookInput = z.infer<typeof policyWebhookInputSchema>;

const policyNormalizedOutputSchema = z.object({
  status: expenseStatusSchema,
  statusReason: z.string().min(1),
  expenseId: z.string().optional(),
});

export const policyWebhookOutputSchema = z.union([
  policyNormalizedOutputSchema,
  z.object({ output: policyNormalizedOutputSchema }).transform((value) => value.output),
  z
    .array(z.object({ output: policyNormalizedOutputSchema }))
    .min(1)
    .transform((items) => items[0]!.output),
]);

export type PolicyWebhookOutput = z.infer<typeof policyWebhookOutputSchema>;
