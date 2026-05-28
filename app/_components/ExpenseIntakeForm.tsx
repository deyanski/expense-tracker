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
type SubmissionStage = "idle" | "uploading" | "ocr" | "policy" | "success" | "error";

function humanizeSubmissionError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("ocr processing timed out")) {
    return "Receipt processing is taking longer than expected. Please retry.";
  }

  if (normalized.includes("policy evaluation timed out")) {
    return "Policy evaluation is taking longer than expected. Please retry.";
  }

  if (normalized.includes("downstream rejected request")) {
    return "The workflow rejected this submission. Please verify your input and retry.";
  }

  return message;
}

function formatStartedAt(value: string | null): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ExpenseIntakeForm({
  identity,
  onChangeIdentity,
}: ExpenseIntakeFormProps) {
  const [comment, setComment] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<PublicExpenseResult | null>(null);
  const [submissionStage, setSubmissionStage] = useState<SubmissionStage>("idle");
  const [submissionHasReceipt, setSubmissionHasReceipt] = useState(false);
  const [activeCorrelationId, setActiveCorrelationId] = useState<string | null>(null);
  const [submissionStartedAt, setSubmissionStartedAt] = useState<string | null>(null);
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

  const submissionButtonLabel = useMemo(() => {
    if (submissionStage === "uploading") {
      return "Uploading receipt...";
    }

    if (submissionStage === "ocr") {
      return "Reading receipt...";
    }

    if (submissionStage === "policy") {
      return "Evaluating policy...";
    }

    return "Submit Expense";
  }, [submissionStage]);

  const statusSteps = useMemo(() => {
    const order: SubmissionStage[] = ["uploading", "ocr", "policy"];
    const currentIndex = order.indexOf(submissionStage);
    const isSubmissionRunning = submissionStage === "uploading" || submissionStage === "ocr" || submissionStage === "policy";

    return [
      {
        key: "uploading",
        title: "Uploading receipt",
        detail: submissionHasReceipt
          ? "Sending your file to secure storage"
          : isSubmissionRunning
            ? "Skipped for comment-only submission"
            : "Waiting to start",
        state: submissionHasReceipt
          ? currentIndex > 0
            ? "done"
            : submissionStage === "uploading"
              ? "active"
              : "pending"
          : "done",
      },
      {
        key: "ocr",
        title: "OCR processing",
        detail: submissionHasReceipt
          ? "Extracting text and totals from receipt"
          : isSubmissionRunning
            ? "Skipped for comment-only submission"
            : "Waiting to start",
        state: submissionHasReceipt
          ? currentIndex > 1
            ? "done"
            : submissionStage === "ocr"
              ? "active"
              : "pending"
          : "done",
      },
      {
        key: "policy",
        title: "Policy evaluation",
        detail: isSubmissionRunning
          ? "Validating rules and writing final decision"
          : "Waiting to start",
        state:
          submissionStage === "policy"
            ? "active"
            : submissionStage === "success" || submissionStage === "error"
              ? "done"
              : "pending",
      },
    ] as const;
  }, [submissionHasReceipt, submissionStage]);

  const showSubmissionPanel =
    submissionStage === "uploading" ||
    submissionStage === "ocr" ||
    submissionStage === "policy";

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
    setSubmissionStage("idle");

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
    setSubmissionStartedAt(new Date().toISOString());
    setSubmissionHasReceipt(Boolean(receiptFile));
    setSubmissionStage(receiptFile ? "uploading" : "policy");
    let promoteToPolicyTimer: number | undefined;

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
        setActiveCorrelationId(uploadInit.correlationId);

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

        setSubmissionStage("ocr");
        promoteToPolicyTimer = window.setTimeout(() => {
          setSubmissionStage("policy");
        }, 3500);
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

      if (!receiptFile) {
        setSubmissionStage("policy");
      }

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
      setActiveCorrelationId((intakeBody as PublicExpenseResult).correlationId);
      setSubmissionStage("success");
      setComment("");
      setReceiptFile(null);
      await fetchHistory();
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      setErrorMessage(humanizeSubmissionError(message));

      // Keep the error visible but reset draft/progress state for a clean retry.
      setComment("");
      setReceiptFile(null);
      setSubmissionStage("idle");
      setSubmissionHasReceipt(false);
      setActiveCorrelationId(null);
      setSubmissionStartedAt(null);
    } finally {
      if (promoteToPolicyTimer) {
        window.clearTimeout(promoteToPolicyTimer);
      }

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
          What was this expense for?
          <textarea
            className="input textarea"
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="What was this expense for?"
          />
          <small className="hint">Optional when a receipt is attached.</small>
        </label>

        <label className="field-wide upload-zone">
          <span className="upload-title">Receipt Upload</span>
          <span className="hint">JPG, JPEG, PNG, WEBP, GIF up to 10 MB</span>
          <input
            className="input upload-input"
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            onChange={(event) => {
              const nextFile = event.target.files?.[0] ?? null;
              setReceiptFile(nextFile);
            }}
          />
          <small className="hint">{selectedFileLabel}</small>
          {receiptFile ? (
            <div className="file-chip-row">
              <span>{receiptFile.name}</span>
              <button
                type="button"
                className="link-button"
                onClick={() => setReceiptFile(null)}
              >
                Remove
              </button>
            </div>
          ) : null}
        </label>

        {showSubmissionPanel ? (
          <section className="field-wide process-panel" aria-live="polite">
            <header>
              <h2>Submission Progress</h2>
              <p>
                {submissionStage === "uploading" && "Uploading receipt"}
                {submissionStage === "ocr" && "Extracting receipt details"}
                {submissionStage === "policy" && "Evaluating policy rules"}
                {submissionStage === "success" && "Completed"}
                {submissionStage === "error" && "Needs attention"}
              </p>
            </header>

            <ul className="process-steps">
              {statusSteps.map((step) => (
                <li key={step.key} className={`process-step ${step.state}`}>
                  <span className="step-dot" aria-hidden="true" />
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.detail}</p>
                  </div>
                </li>
              ))}
            </ul>

            {submissionStage !== "success" ? (
              <div className="ticket-grid">
                <p>
                  <span>Started</span>
                  <strong>{formatStartedAt(submissionStartedAt)}</strong>
                </p>
                <p>
                  <span>Correlation ID</span>
                  <strong>{activeCorrelationId ?? result?.correlationId ?? "pending"}</strong>
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="field-wide actions">
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? submissionButtonLabel : "Submit Expense"}
          </button>
          <span className="hint action-hint">
            {submitting
              ? "Please keep this tab open while processing completes."
              : "You can submit with either a comment or an attached receipt."}
          </span>
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
        </section>
      ) : null}

      <ExpenseHistoryTable
        history={history}
        loading={historyLoading}
        errorMessage={historyError}
        highlightedExpenseId={result?.expenseId ?? null}
        onRefresh={() => {
          void fetchHistory();
        }}
      />
    </section>
  );
}
