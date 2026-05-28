import { NextResponse } from "next/server";
import { directorIdentitySchema } from "@/lib/schemas/identity";
import {
  directorOverviewResponseSchema,
  type DirectorOverviewItem,
  type DirectorOverviewSummary,
} from "@/lib/schemas/director";
import { getServerSupabaseClient } from "@/lib/supabase/server";

const USER_COLUMN_CANDIDATES = [
  { fullName: "full_name", employeeId: "employee_id" },
  { fullName: "fullName", employeeId: "employeeId" },
  { fullName: "name", employeeId: "employee_id" },
] as const;

type ExpenseRow = {
  id: string;
  user_id: string;
  merchant: string | null;
  amount: number | string;
  currency: string;
  category: string;
  status: "Approved" | "Rejected" | "Manual Review";
  status_reason: string;
  employee_comment: string | null;
  created_at: string;
};

type UserProfile = {
  fullName: string | null;
  employeeId: string | null;
};

function parseAmount(value: number | string): number {
  if (typeof value === "number") {
    return value;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(0).toISOString();
  }

  return parsed.toISOString();
}

function quarterStart(date: Date): Date {
  const quarter = Math.floor(date.getUTCMonth() / 3);
  return new Date(Date.UTC(date.getUTCFullYear(), quarter * 3, 1, 0, 0, 0, 0));
}

function summarize(items: DirectorOverviewItem[]): DirectorOverviewSummary {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const startOfQuarter = quarterStart(now);
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const thirtyDaysAgo = new Date(startOfToday);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  const sixtyDaysAgo = new Date(startOfToday);
  sixtyDaysAgo.setUTCDate(sixtyDaysAgo.getUTCDate() - 60);

  const summary = {
    totalCount: 0,
    totalAmount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    manualReviewCount: 0,
    approvalRate: 0,
    mtdAmount: 0,
    qtdAmount: 0,
    last30Amount: 0,
    previous30Amount: 0,
  };

  for (const item of items) {
    summary.totalCount += 1;
    summary.totalAmount += item.amount;

    if (item.status === "Approved") {
      summary.approvedCount += 1;
    } else if (item.status === "Rejected") {
      summary.rejectedCount += 1;
    } else {
      summary.manualReviewCount += 1;
    }

    const created = new Date(item.createdAt);

    if (created >= startOfMonth) {
      summary.mtdAmount += item.amount;
    }

    if (created >= startOfQuarter) {
      summary.qtdAmount += item.amount;
    }

    if (created >= thirtyDaysAgo) {
      summary.last30Amount += item.amount;
    } else if (created >= sixtyDaysAgo && created < thirtyDaysAgo) {
      summary.previous30Amount += item.amount;
    }
  }

  summary.approvalRate =
    summary.totalCount === 0 ? 0 : summary.approvedCount / summary.totalCount;

  return summary;
}

async function directorAccessValid(fullName: string, directorId: string): Promise<boolean> {
  const supabase = getServerSupabaseClient();

  for (const columns of USER_COLUMN_CANDIDATES) {
    const { data, error } = await supabase
      .from("users")
      .select("role")
      .eq(columns.fullName, fullName)
      .eq(columns.employeeId, directorId)
      .eq("role", "admin")
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

      throw new Error(`director lookup failed: ${error.message}`);
    }

    return Array.isArray(data) && data.length > 0;
  }

  throw new Error("director lookup failed: no compatible users table columns found");
}

async function resolveUserProfiles(userIds: string[]): Promise<Map<string, UserProfile>> {
  const supabase = getServerSupabaseClient();
  const uniqueIds = Array.from(new Set(userIds.filter((id) => id.length > 0)));

  if (uniqueIds.length === 0) {
    return new Map();
  }

  for (const columns of USER_COLUMN_CANDIDATES) {
    const { data, error } = await supabase
      .from("users")
      .select(`id, ${columns.fullName}, ${columns.employeeId}`)
      .in("id", uniqueIds);

    if (error) {
      const message = error.message.toLowerCase();
      const isColumnMismatch =
        message.includes("column") ||
        message.includes("schema cache") ||
        message.includes("does not exist");

      if (isColumnMismatch) {
        continue;
      }

      throw new Error(`director users lookup failed: ${error.message}`);
    }

    const map = new Map<string, UserProfile>();
    for (const row of data ?? []) {
      const typedRow = row as {
        id: string;
        [key: string]: string | null;
      };

      map.set(typedRow.id, {
        fullName: typedRow[columns.fullName],
        employeeId: typedRow[columns.employeeId],
      });
    }

    return map;
  }

  return new Map();
}

function normalizeRows(rows: ExpenseRow[], users: Map<string, UserProfile>): DirectorOverviewItem[] {
  return rows.map((row) => {
    const user = users.get(row.user_id);

    return {
      id: row.id,
      employeeName: user?.fullName ?? null,
      employeeId: user?.employeeId ?? null,
      merchant: row.merchant,
      amount: parseAmount(row.amount),
      currency: row.currency,
      category: row.category,
      status: row.status,
      statusReason: row.status_reason,
      hasComment: Boolean(row.employee_comment && row.employee_comment.trim().length > 0),
      createdAt: normalizeDateTime(row.created_at),
    };
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsedIdentity = directorIdentitySchema.safeParse({
      fullName: url.searchParams.get("fullName") ?? "",
      directorId: url.searchParams.get("directorId") ?? "",
    });

    if (!parsedIdentity.success) {
      return NextResponse.json(
        { error: parsedIdentity.error.issues[0]?.message ?? "invalid input" },
        { status: 400 },
      );
    }

    const authorized = await directorAccessValid(
      parsedIdentity.data.fullName,
      parsedIdentity.data.directorId,
    );

    if (!authorized) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from("expenses")
      .select(
        "id, user_id, merchant, amount, currency, category, status, status_reason, employee_comment, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      throw new Error(`director expenses lookup failed: ${error.message}`);
    }

    const rows = (data ?? []) as ExpenseRow[];
    const users = await resolveUserProfiles(rows.map((row) => row.user_id));
    const items = normalizeRows(rows, users);
    const summary = summarize(items);

    const body = directorOverviewResponseSchema.parse({
      asOf: new Date().toISOString(),
      items,
      summary,
    });

    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
