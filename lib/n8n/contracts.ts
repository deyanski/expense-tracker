import { z } from "zod";
import { expenseStatusSchema } from "@/lib/schemas/expense";

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

export const ocrWebhookOutputSchema = z.object({
  merchant: z.string().optional(),
  receiptDate: z.string().optional(),
  amount: z.number().positive().optional(),
  currency: z.string().min(3).max(3).optional(),
  extractedText: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  categoryHint: z.string().optional(),
});

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

export const policyWebhookOutputSchema = z.object({
  status: expenseStatusSchema,
  statusReason: z.string().min(1),
  expenseId: z.string().optional(),
});

export type PolicyWebhookOutput = z.infer<typeof policyWebhookOutputSchema>;
