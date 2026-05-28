import { z } from "zod";
import { expenseStatusSchema } from "@/lib/schemas/expense";

export const directorOverviewItemSchema = z.object({
  id: z.string().uuid(),
  employeeName: z.string().nullable(),
  employeeId: z.string().nullable(),
  merchant: z.string().nullable(),
  amount: z.number().nonnegative(),
  currency: z.string().min(3).max(3),
  category: z.string().min(1),
  status: expenseStatusSchema,
  statusReason: z.string().min(1),
  hasComment: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
});

export const directorOverviewSummarySchema = z.object({
  totalCount: z.number().int().nonnegative(),
  totalAmount: z.number().nonnegative(),
  approvedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  manualReviewCount: z.number().int().nonnegative(),
  approvalRate: z.number().min(0).max(1),
  mtdAmount: z.number().nonnegative(),
  qtdAmount: z.number().nonnegative(),
  last30Amount: z.number().nonnegative(),
  previous30Amount: z.number().nonnegative(),
});

export const directorOverviewResponseSchema = z.object({
  asOf: z.string().datetime({ offset: true }),
  items: z.array(directorOverviewItemSchema),
  summary: directorOverviewSummarySchema,
});

export type DirectorOverviewItem = z.infer<typeof directorOverviewItemSchema>;
export type DirectorOverviewSummary = z.infer<typeof directorOverviewSummarySchema>;
export type DirectorOverviewResponse = z.infer<typeof directorOverviewResponseSchema>;
