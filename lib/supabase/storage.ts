import { randomUUID } from "node:crypto";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import {
  ALLOWED_RECEIPT_MIME_TYPES,
  MAX_RECEIPT_SIZE_BYTES,
} from "@/lib/schemas/expense";

export type UploadedReceipt = {
  bucket: string;
  objectPath: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  sizeBytes: number;
};

export async function createSignedReceiptUpload(params: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  correlationId: string;
  bucket?: string;
}): Promise<
  UploadedReceipt & {
    token: string;
  }
> {
  const bucket = params.bucket ?? "receipts";
  const extension = params.fileName.split(".").pop()?.toLowerCase() ?? "bin";
  const objectPath = `${params.correlationId}/${randomUUID()}.${extension}`;

  if (
    !ALLOWED_RECEIPT_MIME_TYPES.includes(
      params.mimeType as (typeof ALLOWED_RECEIPT_MIME_TYPES)[number],
    )
  ) {
    throw new Error("unsupported file type");
  }

  if (params.sizeBytes > MAX_RECEIPT_SIZE_BYTES) {
    throw new Error("file exceeds max size");
  }

  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(objectPath, {
      upsert: false,
    });

  if (error) {
    throw new Error(`signed upload creation failed: ${error.message}`);
  }

  return {
    bucket,
    objectPath,
    mimeType: params.mimeType as UploadedReceipt["mimeType"],
    sizeBytes: params.sizeBytes,
    token: data.token,
  };
}

export async function assertReceiptObjectExists(params: {
  bucket: string;
  objectPath: string;
}): Promise<void> {
  const supabase = getServerSupabaseClient();
  const { error } = await supabase.storage
    .from(params.bucket)
    .createSignedUrl(params.objectPath, 60);

  if (error) {
    throw new Error(`receipt object not found: ${error.message}`);
  }
}
