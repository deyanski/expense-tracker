import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { postWebhookJson, WebhookError } from "@/lib/n8n/client";
import {
  ocrWebhookInputSchema,
  ocrWebhookOutputSchema,
  policyWebhookInputSchema,
  policyWebhookOutputSchema,
} from "@/lib/n8n/contracts";
import {
  expenseIntakeInputSchema,
} from "@/lib/schemas/expense";
import { assertReceiptObjectExists } from "@/lib/supabase/storage";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();

    const parsedInput = expenseIntakeInputSchema.safeParse(rawBody);

    if (!parsedInput.success) {
      return badRequest(parsedInput.error.issues[0]?.message ?? "invalid input");
    }

    const uploadedReceipt = parsedInput.data.receipt;
    const comment = parsedInput.data.comment;

    if (uploadedReceipt) {
      await assertReceiptObjectExists({
        bucket: uploadedReceipt.bucket,
        objectPath: uploadedReceipt.objectPath,
      });
    }

    const correlationId = request.headers.get("x-correlation-id") ?? randomUUID();
    const submittedAt = new Date().toISOString();

    let ocrResult: z.infer<typeof ocrWebhookOutputSchema> | undefined;

    if (uploadedReceipt) {
      const ocrWebhookUrl = process.env.N8N_OCR_WEBHOOK_URL;
      if (!ocrWebhookUrl) {
        throw new Error("N8N_OCR_WEBHOOK_URL is not configured");
      }

      const ocrPayload = ocrWebhookInputSchema.parse({
        schemaVersion: "1.0",
        correlationId,
        submittedAt,
        employee: {
          fullName: parsedInput.data.fullName,
          employeeId: parsedInput.data.employeeId,
        },
        receipt: uploadedReceipt,
        comment,
      });

      const rawOcrResponse = await postWebhookJson<unknown>({
        url: ocrWebhookUrl,
        token: process.env.N8N_WEBHOOK_BEARER_TOKEN,
        body: ocrPayload,
        retries: 0,
      });

      ocrResult = ocrWebhookOutputSchema.parse(rawOcrResponse);
    }

    const policyWebhookUrl = process.env.N8N_POLICY_WEBHOOK_URL;
    if (!policyWebhookUrl) {
      throw new Error("N8N_POLICY_WEBHOOK_URL is not configured");
    }

    const policyPayload = policyWebhookInputSchema.parse({
      schemaVersion: "1.0",
      correlationId,
      submittedAt,
      employee: {
        fullName: parsedInput.data.fullName,
        employeeId: parsedInput.data.employeeId,
      },
      comment,
      receipt: uploadedReceipt,
      ocr: ocrResult,
      textOnly: !uploadedReceipt,
    });

    const rawPolicyResponse = await postWebhookJson<unknown>({
      url: policyWebhookUrl,
      token: process.env.N8N_WEBHOOK_BEARER_TOKEN,
      body: policyPayload,
      retries: 0,
    });

    const policyResult = policyWebhookOutputSchema.parse(rawPolicyResponse);

    return NextResponse.json(
      {
        correlationId,
        status: policyResult.status,
        statusReason: policyResult.statusReason,
        expenseId: policyResult.expenseId,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof WebhookError && error.status >= 400 && error.status < 500) {
      return badRequest("downstream rejected request");
    }

    if (error instanceof z.ZodError) {
      return badRequest(error.issues[0]?.message ?? "invalid request or response shape");
    }

    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
