"use client";

import { FormEvent, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import type { DirectorIdentity } from "@/lib/schemas/identity";

type DirectorAccessFormProps = {
  onVerified: (identity: DirectorIdentity) => void;
};

type DirectorIdentityResponse = {
  valid: boolean;
  fullName: string;
  directorId: string;
};

export function DirectorAccessForm({ onVerified }: DirectorAccessFormProps) {
  const [fullName, setFullName] = useState("");
  const [directorId, setDirectorId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/director/identity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName, directorId }),
      });

      const body = (await response.json()) as DirectorIdentityResponse | { error?: string };

      if (!response.ok) {
        if (response.status === 401) {
          setErrorMessage("unauthorized");
          return;
        }

        const message =
          "error" in body ? (body.error ?? "identity check failed") : "identity check failed";
        setErrorMessage(message);
        return;
      }

      const parsed = body as DirectorIdentityResponse;
      if (!parsed.valid) {
        setErrorMessage("unauthorized");
        return;
      }

      onVerified({ fullName: parsed.fullName, directorId: parsed.directorId });
    } catch {
      setErrorMessage("internal");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card director-shell">
      <h1 className="title-with-icon">
        <ShieldCheck className="icon-sm" aria-hidden="true" />
        Director Console
      </h1>
      <p className="lede">Enter full name and personal ID to access the finance assistant.</p>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Full Name
          <input
            className="input"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Maria Georgieva"
            required
          />
        </label>

        <label>
          Personal ID
          <input
            className="input"
            value={directorId}
            onChange={(event) => setDirectorId(event.target.value)}
            placeholder="CFO-9001"
            required
          />
        </label>

        <div className="field-wide actions">
          <button className="button with-icon" type="submit" disabled={submitting}>
            <KeyRound className="icon-xs" aria-hidden="true" />
            {submitting ? "Checking access..." : "Open Director Console"}
          </button>
        </div>
      </form>

      {errorMessage ? <p className="status error">{errorMessage}</p> : null}
    </section>
  );
}
