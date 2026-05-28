import { NextResponse } from "next/server";
import {
  directorDecisionInputSchema,
  directorDecisionResponseSchema,
} from "@/lib/schemas/director";
import { getServerSupabaseClient } from "@/lib/supabase/server";

const USER_COLUMN_CANDIDATES = [
  { fullName: "full_name", employeeId: "employee_id" },
  { fullName: "fullName", employeeId: "employeeId" },
  { fullName: "name", employeeId: "employee_id" },
] as const;

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

function buildStatusReason(status: "Approved" | "Rejected" | "Manual Review"): string {
  const timestamp = new Date().toISOString();
  if (status === "Approved") {
    return `Director override: Approved (${timestamp})`;
  }

  if (status === "Rejected") {
    return `Director override: Rejected (${timestamp})`;
  }

  return `Director override: Manual Review (${timestamp})`;
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const parsed = directorDecisionInputSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "invalid input" },
        { status: 400 },
      );
    }

    const authorized = await directorAccessValid(parsed.data.fullName, parsed.data.directorId);
    if (!authorized) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = getServerSupabaseClient();
    const statusReason = buildStatusReason(parsed.data.status);

    const { data, error } = await supabase
      .from("expenses")
      .update({
        status: parsed.data.status,
        status_reason: statusReason,
      })
      .eq("id", parsed.data.expenseId)
      .select("id, status, status_reason")
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`director decision update failed: ${error.message}`);
    }

    if (!data) {
      return NextResponse.json({ error: "not found" }, { status: 400 });
    }

    const responseBody = directorDecisionResponseSchema.parse({
      expenseId: data.id,
      status: data.status,
      statusReason: data.status_reason,
    });

    return NextResponse.json(responseBody);
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
