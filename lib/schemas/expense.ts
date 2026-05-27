import { z } from "zod";

export const ALLOWED_RECEIPT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024;

export const receiptReferenceSchema = z.object({
  bucket: z.string().trim().min(1),
  objectPath: z.string().trim().min(1),
  mimeType: z.enum(ALLOWED_RECEIPT_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_RECEIPT_SIZE_BYTES),
});

export const expenseIntakeInputSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    employeeId: z.string().trim().min(1).max(64),
    comment: z.string().trim().max(4000).optional(),
    receipt: receiptReferenceSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const hasReceipt = Boolean(value.receipt);
    const hasComment = Boolean(value.comment && value.comment.length > 0);
    if (!hasComment && !hasReceipt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comment", "receipt"],
        message: "comment or receipt is required",
      });
    }
  });

export type ExpenseIntakeInput = z.infer<typeof expenseIntakeInputSchema>;

export const expenseStatusSchema = z.enum([
  "Approved",
  "Rejected",
  "Manual Review",
]);

export const publicExpenseResultSchema = z.object({
  correlationId: z.string().uuid(),
  status: expenseStatusSchema,
  statusReason: z.string().min(1),
  expenseId: z.string().optional(),
});

export type PublicExpenseResult = z.infer<typeof publicExpenseResultSchema>;
