import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  postWebhookJson,
  WebhookError,
  WebhookTimeoutError,
} from "@/lib/n8n/client";
import {
  commentGuardWebhookInputSchema,
  commentGuardWebhookOutputSchema,
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

function parseTimeoutMs(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function POST(request: Request) {
  let stage: "comment-guard" | "ocr" | "policy" | "none" = "none";

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
    const commentGuardTimeoutMs = parseTimeoutMs(
      process.env.N8N_COMMENT_GUARD_TIMEOUT_MS,
      20_000,
    );
    const ocrTimeoutMs = parseTimeoutMs(process.env.N8N_OCR_TIMEOUT_MS, 60_000);
    const policyTimeoutMs = parseTimeoutMs(process.env.N8N_POLICY_TIMEOUT_MS, 60_000);
    let effectiveComment = comment;

    const commentGuardWebhookUrl = process.env.N8N_COMMENT_GUARD_WEBHOOK_URL;
    const hasComment = Boolean(comment && comment.trim().length > 0);

    if (hasComment && !commentGuardWebhookUrl) {
      // Silent fallback by requirement: if guard is not configured, drop comment and continue.
      console.warn("comment-guard-not-configured", { correlationId });
      effectiveComment = undefined;
    }

    if (hasComment && commentGuardWebhookUrl) {
      stage = "comment-guard";

      const commentGuardPayload = commentGuardWebhookInputSchema.parse({
        schemaVersion: "1.0",
        correlationId,
        submittedAt,
        employee: {
          fullName: parsedInput.data.fullName,
          employeeId: parsedInput.data.employeeId,
        },
        comment,
      });

      try {
        const rawCommentGuardResponse = await postWebhookJson<unknown>({
          url: commentGuardWebhookUrl,
          token: process.env.N8N_WEBHOOK_BEARER_TOKEN,
          body: commentGuardPayload,
          retries: 0,
          timeoutMs: commentGuardTimeoutMs,
        });

        const commentGuardResult = commentGuardWebhookOutputSchema.parse(
          rawCommentGuardResponse,
        );

        if (!commentGuardResult.safe) {
          effectiveComment = undefined;
        }
      } catch (error) {
        // Silent fallback by requirement: if guard fails or times out, drop comment and continue.
        console.warn("comment-guard-fallback", {
          correlationId,
          reason: error instanceof Error ? error.message : "unknown",
        });
        effectiveComment = undefined;
      }
    }

    let ocrResult: z.infer<typeof ocrWebhookOutputSchema> | undefined;

    if (uploadedReceipt) {
      stage = "ocr";
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
        comment: effectiveComment,
      });

      const rawOcrResponse = await postWebhookJson<unknown>({
        url: ocrWebhookUrl,
        token: process.env.N8N_WEBHOOK_BEARER_TOKEN,
        body: ocrPayload,
        retries: 0,
        timeoutMs: ocrTimeoutMs,
      });

      ocrResult = ocrWebhookOutputSchema.parse(rawOcrResponse);
    }

    const policyWebhookUrl = process.env.N8N_POLICY_WEBHOOK_URL;
    if (!policyWebhookUrl) {
      throw new Error("N8N_POLICY_WEBHOOK_URL is not configured");
    }

    stage = "policy";

    const policyPayload = policyWebhookInputSchema.parse({
      schemaVersion: "1.0",
      correlationId,
      submittedAt,
      employee: {
        fullName: parsedInput.data.fullName,
        employeeId: parsedInput.data.employeeId,
      },
      comment: effectiveComment,
      receipt: uploadedReceipt,
      ocr: ocrResult,
      textOnly: !uploadedReceipt,
    });

    const rawPolicyResponse = await postWebhookJson<unknown>({
      url: policyWebhookUrl,
      token: process.env.N8N_WEBHOOK_BEARER_TOKEN,
      body: policyPayload,
      retries: 0,
      timeoutMs: policyTimeoutMs,
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
    if (error instanceof WebhookTimeoutError) {
      if (stage === "ocr") {
        return NextResponse.json(
          { error: "ocr processing timed out; please retry" },
          { status: 504 },
        );
      }

      if (stage === "comment-guard") {
        return NextResponse.json(
          { error: "comment safety validation timed out; please retry" },
          { status: 504 },
        );
      }

      if (stage === "policy") {
        return NextResponse.json(
          { error: "policy evaluation timed out; please retry" },
          { status: 504 },
        );
      }

      return NextResponse.json(
        { error: "downstream request timed out; please retry" },
        { status: 504 },
      );
    }

    if (error instanceof WebhookError && error.status >= 400 && error.status < 500) {
      return badRequest("downstream rejected request");
    }

    if (error instanceof z.ZodError) {
      return badRequest(error.issues[0]?.message ?? "invalid request or response shape");
    }

    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
