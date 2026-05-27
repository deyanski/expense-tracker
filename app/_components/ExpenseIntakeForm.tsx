"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ALLOWED_RECEIPT_MIME_TYPES,
  MAX_RECEIPT_SIZE_BYTES,
  expenseHistoryResponseSchema,
  type ExpenseHistoryResponse,
  type PublicExpenseResult,
} from "@/lib/schemas/expense";
import type { EmployeeIdentity } from "@/lib/schemas/identity";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { ExpenseHistoryTable } from "@/app/_components/ExpenseHistoryTable";

type UploadInitResponse = {
  correlationId: string;
  bucket: string;
  objectPath: string;
  token: string;
  mimeType: string;
  sizeBytes: number;
};

type ExpenseIntakeFormProps = {
  identity: EmployeeIdentity;
  onChangeIdentity: () => void;
};

const ACCEPT_ATTRIBUTE = ".jpg,.jpeg,.png,.webp,.gif";

export function ExpenseIntakeForm({
  identity,
  onChangeIdentity,
}: ExpenseIntakeFormProps) {
  const [comment, setComment] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<PublicExpenseResult | null>(null);
  const [history, setHistory] = useState<ExpenseHistoryResponse>({
    items: [],
    summary: {
      totalCount: 0,
      totalAmount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      manualReviewCount: 0,
    },
  });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (): Promise<void> => {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const params = new URLSearchParams({
        fullName: identity.fullName,
        employeeId: identity.employeeId,
      });

      const response = await fetch(`/api/history?${params.toString()}`);
      const body = (await response.json()) as unknown;

      if (!response.ok) {
        const errorMessageFromApi =
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error?: unknown }).error ?? "history fetch failed")
            : "history fetch failed";
        throw new Error(errorMessageFromApi);
      }

      const parsed = expenseHistoryResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new Error("history response mismatch");
      }

      setHistory(parsed.data);
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : "Could not load expense history.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [identity.employeeId, identity.fullName]);

  const selectedFileLabel = useMemo(() => {
    if (!receiptFile) {
      return "No file selected";
    }

    return `${receiptFile.name} (${Math.ceil(receiptFile.size / 1024)} KB)`;
  }, [receiptFile]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchHistory();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [fetchHistory]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setResult(null);

    const trimmedComment = comment.trim();

    if (!receiptFile && !trimmedComment) {
      setErrorMessage("Add a comment or attach a receipt.");
      return;
    }

    if (receiptFile) {
      if (
        !ALLOWED_RECEIPT_MIME_TYPES.includes(
          receiptFile.type as (typeof ALLOWED_RECEIPT_MIME_TYPES)[number],
        )
      ) {
        setErrorMessage("Unsupported file type.");
        return;
      }

      if (receiptFile.size > MAX_RECEIPT_SIZE_BYTES) {
        setErrorMessage("Receipt file exceeds the 10 MB limit.");
        return;
      }
    }

    setSubmitting(true);

    try {
      let correlationId: string | undefined;
      let receiptReference:
        | {
            bucket: string;
            objectPath: string;
            mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
            sizeBytes: number;
          }
        | undefined;

      if (receiptFile) {
        const uploadInitResponse = await fetch("/api/uploads/receipt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fileName: receiptFile.name,
            mimeType: receiptFile.type,
            sizeBytes: receiptFile.size,
          }),
        });

        const uploadInitBody = (await uploadInitResponse.json()) as
          | UploadInitResponse
          | { error?: string };

        if (!uploadInitResponse.ok) {
          throw new Error(
            "error" in uploadInitBody
              ? (uploadInitBody.error ?? "failed to initialize upload")
              : "failed to initialize upload",
          );
        }

        const uploadInit = uploadInitBody as UploadInitResponse;
        correlationId = uploadInit.correlationId;

        const supabase = getBrowserSupabaseClient();
        const { error: uploadError } = await supabase.storage
          .from(uploadInit.bucket)
          .uploadToSignedUrl(uploadInit.objectPath, uploadInit.token, receiptFile, {
            contentType: receiptFile.type,
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`upload failed: ${uploadError.message}`);
        }

        receiptReference = {
          bucket: uploadInit.bucket,
          objectPath: uploadInit.objectPath,
          mimeType: uploadInit.mimeType as
            | "image/jpeg"
            | "image/png"
            | "image/webp"
            | "image/gif",
          sizeBytes: uploadInit.sizeBytes,
        };
      }

      const intakeResponse = await fetch("/api/expenses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(correlationId ? { "x-correlation-id": correlationId } : {}),
        },
        body: JSON.stringify({
          fullName: identity.fullName,
          employeeId: identity.employeeId,
          comment: trimmedComment || undefined,
          receipt: receiptReference,
        }),
      });

      const intakeBody = (await intakeResponse.json()) as
        | PublicExpenseResult
        | { error?: string };

      if (!intakeResponse.ok) {
        throw new Error(
          "error" in intakeBody
            ? (intakeBody.error ?? "expense submission failed")
            : "expense submission failed",
        );
      }

      setResult(intakeBody as PublicExpenseResult);
      setComment("");
      setReceiptFile(null);
      await fetchHistory();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "An unexpected error occurred.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card">
      <header className="identity-bar">
        <div>
          <h1>Expense Submission</h1>
          <p className="lede">Submit your expense after successful identity check.</p>
        </div>
        <div className="identity-chip">
          <span>{identity.fullName}</span>
          <span className="dot">•</span>
          <span>{identity.employeeId}</span>
          <button className="link-button" type="button" onClick={onChangeIdentity}>
            Change
          </button>
        </div>
      </header>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label className="field-wide">
          Comment (optional if receipt is attached)
          <textarea
            className="input textarea"
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="What was this expense for?"
          />
        </label>

        <label className="field-wide">
          Receipt Upload (JPG, JPEG, PNG, WEBP, GIF)
          <input
            className="input"
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            onChange={(event) => {
              const nextFile = event.target.files?.[0] ?? null;
              setReceiptFile(nextFile);
            }}
          />
          <small className="hint">{selectedFileLabel}</small>
        </label>

        <div className="field-wide actions">
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Expense"}
          </button>
        </div>
      </form>

      {errorMessage ? <p className="status error">{errorMessage}</p> : null}

      {result ? (
        <section className="result-box">
          <h2>Submission Result</h2>
          <p>
            <strong>Status:</strong> {result.status}
          </p>
          <p>
            <strong>Reason:</strong> {result.statusReason}
          </p>
          <p>
            <strong>Correlation ID:</strong> {result.correlationId}
          </p>
          {result.expenseId ? (
            <p>
              <strong>Expense ID:</strong> {result.expenseId}
            </p>
          ) : null}
        </section>
      ) : null}

      <ExpenseHistoryTable
        history={history}
        loading={historyLoading}
        errorMessage={historyError}
        onRefresh={() => {
          void fetchHistory();
        }}
      />
    </section>
  );
}
