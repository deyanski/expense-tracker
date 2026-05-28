import { NextResponse } from "next/server";
import { directorIdentitySchema } from "@/lib/schemas/identity";
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

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const parsed = directorIdentitySchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "invalid identity input" },
        { status: 400 },
      );
    }

    const valid = await directorAccessValid(parsed.data.fullName, parsed.data.directorId);

    if (!valid) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      valid,
      fullName: parsed.data.fullName,
      directorId: parsed.data.directorId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "director verification failed";

    console.error("director-identity-api-error", message);

    if (message.includes("not configured")) {
      return NextResponse.json({ error: "identity service not configured" }, { status: 500 });
    }

    if (message.includes("director lookup failed")) {
      return NextResponse.json({ error: "identity lookup failed" }, { status: 500 });
    }

    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
