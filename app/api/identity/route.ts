import { NextResponse } from "next/server";
import { employeeIdentitySchema } from "@/lib/schemas/identity";
import { getServerSupabaseClient } from "@/lib/supabase/server";

const USER_COLUMN_CANDIDATES = [
  { fullName: "full_name", employeeId: "employee_id" },
  { fullName: "fullName", employeeId: "employeeId" },
  { fullName: "name", employeeId: "employee_id" },
] as const;

async function identityExists(fullName: string, employeeId: string): Promise<boolean> {
  const supabase = getServerSupabaseClient();

  for (const columns of USER_COLUMN_CANDIDATES) {
    const query = supabase
      .from("users")
      .select(columns.employeeId)
      .eq(columns.fullName, fullName)
      .eq(columns.employeeId, employeeId)
      .limit(1);

    const { data, error } = await query;

    if (error) {
      const message = error.message.toLowerCase();
      const isColumnMismatch =
        message.includes("column") ||
        message.includes("schema cache") ||
        message.includes("does not exist");

      if (isColumnMismatch) {
        continue;
      }

      throw new Error(`identity lookup failed: ${error.message}`);
    }

    return Array.isArray(data) && data.length > 0;
  }

  throw new Error("identity lookup failed: no compatible users table columns found");
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const parsed = employeeIdentitySchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "invalid identity input" },
        { status: 400 },
      );
    }

    const valid = await identityExists(
      parsed.data.fullName,
      parsed.data.employeeId,
    );

    return NextResponse.json({
      valid,
      fullName: parsed.data.fullName,
      employeeId: parsed.data.employeeId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "identity verification failed";

    // Keep operational details in logs while returning safe client-facing messages.
    console.error("identity-api-error", message);

    if (message.includes("not configured")) {
      return NextResponse.json(
        { error: "identity service not configured" },
        { status: 500 },
      );
    }

    if (message.includes("identity lookup failed")) {
      return NextResponse.json(
        { error: "identity lookup failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
