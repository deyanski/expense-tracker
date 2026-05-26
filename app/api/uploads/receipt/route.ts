import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ALLOWED_RECEIPT_MIME_TYPES,
  MAX_RECEIPT_SIZE_BYTES,
} from "@/lib/schemas/expense";
import { createSignedReceiptUpload } from "@/lib/supabase/storage";

const requestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_RECEIPT_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_RECEIPT_SIZE_BYTES),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "invalid upload request" },
        { status: 400 },
      );
    }

    const correlationId = request.headers.get("x-correlation-id") ?? randomUUID();
    const upload = await createSignedReceiptUpload({
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
      correlationId,
      bucket: process.env.SUPABASE_RECEIPTS_BUCKET,
    });

    return NextResponse.json(
      {
        correlationId,
        bucket: upload.bucket,
        objectPath: upload.objectPath,
        token: upload.token,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
