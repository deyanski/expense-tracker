import { NextResponse } from "next/server";
import { employeeIdentitySchema } from "@/lib/schemas/identity";
import {
  expenseHistoryResponseSchema,
  type ExpenseHistoryItem,
  type ExpenseHistorySummary,
} from "@/lib/schemas/expense";
import { getServerSupabaseClient } from "@/lib/supabase/server";

const USER_COLUMN_CANDIDATES = [
  { fullName: "full_name", employeeId: "employee_id" },
  { fullName: "fullName", employeeId: "employeeId" },
  { fullName: "name", employeeId: "employee_id" },
] as const;

type ExpenseRow = {
  id: string;
  merchant: string | null;
  amount: number | string;
  currency: string;
  category: string;
  status: "Approved" | "Rejected" | "Manual Review";
  status_reason: string;
  created_at: string;
  receipt_date: string | null;
  employee_comment: string | null;
  receipt_bucket: string | null;
  receipt_object_path: string | null;
};

function parseAmount(value: number | string): number {
  if (typeof value === "number") {
    return value;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRows(rows: ExpenseRow[]): ExpenseHistoryItem[] {
  return rows.map((row) => ({
    id: row.id,
    merchant: row.merchant,
    amount: parseAmount(row.amount),
    currency: row.currency,
    category: row.category,
    status: row.status,
    statusReason: row.status_reason,
    createdAt: row.created_at,
    receiptDate: row.receipt_date,
    employeeComment: row.employee_comment,
    hasReceipt: Boolean(row.receipt_bucket && row.receipt_object_path),
  }));
}

function summarize(items: ExpenseHistoryItem[]): ExpenseHistorySummary {
  return items.reduce<ExpenseHistorySummary>(
    (acc, item) => {
      acc.totalCount += 1;
      acc.totalAmount += item.amount;

      if (item.status === "Approved") {
        acc.approvedCount += 1;
      } else if (item.status === "Rejected") {
        acc.rejectedCount += 1;
      } else {
        acc.manualReviewCount += 1;
      }

      return acc;
    },
    {
      totalCount: 0,
      totalAmount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      manualReviewCount: 0,
    },
  );
}

async function resolveUserId(fullName: string, employeeId: string): Promise<string | null> {
  const supabase = getServerSupabaseClient();

  for (const columns of USER_COLUMN_CANDIDATES) {
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .eq(columns.fullName, fullName)
      .eq(columns.employeeId, employeeId)
      .limit(1);

    if (error) {
      const message = error.message.toLowerCase();
      const isColumnMismatch =
        message.includes("column") ||
        message.includes("schema cache") ||
        message.includes("does not exist");

      if (isColumnMismatch) {
        continue;
      }

      throw new Error(`history user lookup failed: ${error.message}`);
    }

    if (Array.isArray(data) && data.length > 0) {
      const maybeId = data[0]?.id;
      if (typeof maybeId === "string" && maybeId.length > 0) {
        return maybeId;
      }
    }
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsedIdentity = employeeIdentitySchema.safeParse({
      fullName: url.searchParams.get("fullName") ?? "",
      employeeId: url.searchParams.get("employeeId") ?? "",
    });

    if (!parsedIdentity.success) {
      return NextResponse.json(
        { error: parsedIdentity.error.issues[0]?.message ?? "invalid input" },
        { status: 400 },
      );
    }

    const userId = await resolveUserId(
      parsedIdentity.data.fullName,
      parsedIdentity.data.employeeId,
    );

    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from("expenses")
      .select(
        "id, merchant, amount, currency, category, status, status_reason, created_at, receipt_date, employee_comment, receipt_bucket, receipt_object_path",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(`history expenses lookup failed: ${error.message}`);
    }

    const rows = (data ?? []) as ExpenseRow[];
    const items = normalizeRows(rows);
    const summary = summarize(items);

    const body = expenseHistoryResponseSchema.parse({ items, summary });
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
