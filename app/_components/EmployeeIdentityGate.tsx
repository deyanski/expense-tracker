"use client";

import { FormEvent, useState } from "react";
import type { EmployeeIdentity } from "@/lib/schemas/identity";

type IdentityGateProps = {
  initialIdentity?: EmployeeIdentity;
  onVerified: (identity: EmployeeIdentity) => void;
};

type IdentityResponse = {
  valid: boolean;
  fullName: string;
  employeeId: string;
  error?: string;
};

export function EmployeeIdentityGate({
  initialIdentity,
  onVerified,
}: IdentityGateProps) {
  const [fullName, setFullName] = useState(initialIdentity?.fullName ?? "");
  const [employeeId, setEmployeeId] = useState(initialIdentity?.employeeId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const trimmedFullName = fullName.trim();
    const trimmedEmployeeId = employeeId.trim();

    if (!trimmedFullName || !trimmedEmployeeId) {
      setErrorMessage("Full name and employee ID are required.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/identity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: trimmedFullName,
          employeeId: trimmedEmployeeId,
        }),
      });

      const body = (await response.json()) as IdentityResponse;

      if (!response.ok) {
        throw new Error(body.error ?? "identity verification failed");
      }

      if (!body.valid) {
        setErrorMessage("Identity was not found in the employee directory.");
        return;
      }

      onVerified({ fullName: body.fullName, employeeId: body.employeeId });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unexpected verification error.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card">
      <h1>Employee Identity Check</h1>
      <p className="lede">
        Enter your full name and employee ID to continue to expense submission.
      </p>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Full Name
          <input
            className="input"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Jane Doe"
            required
          />
        </label>

        <label>
          Employee ID
          <input
            className="input"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            placeholder="EMP-102"
            required
          />
        </label>

        <div className="field-wide actions">
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? "Verifying..." : "Continue"}
          </button>
        </div>
      </form>

      {errorMessage ? <p className="status error">{errorMessage}</p> : null}
    </section>
  );
}
