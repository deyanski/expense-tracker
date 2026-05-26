"use client";

import { useEffect, useState } from "react";
import type { EmployeeIdentity } from "@/lib/schemas/identity";
import { EmployeeIdentityGate } from "@/app/_components/EmployeeIdentityGate";
import { ExpenseIntakeForm } from "@/app/_components/ExpenseIntakeForm";

const STORAGE_KEY = "expense-tracker.identity";

type IdentityResponse = {
  valid: boolean;
  fullName: string;
  employeeId: string;
};

async function validateIdentity(
  identity: EmployeeIdentity,
): Promise<EmployeeIdentity | null> {
  const response = await fetch("/api/identity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(identity),
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as IdentityResponse;
  if (!body.valid) {
    return null;
  }

  return { fullName: body.fullName, employeeId: body.employeeId };
}

export function EmployeePortal() {
  const [identity, setIdentity] = useState<EmployeeIdentity | null>(null);
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      const serialized = window.localStorage.getItem(STORAGE_KEY);
      if (!serialized) {
        if (active) {
          setInitialCheckDone(true);
        }
        return;
      }

      try {
        const parsed = JSON.parse(serialized) as EmployeeIdentity;
        const validated = await validateIdentity(parsed);

        if (validated && active) {
          setIdentity(validated);
        } else if (!validated) {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      } finally {
        if (active) {
          setInitialCheckDone(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (!initialCheckDone) {
    return (
      <section className="card">
        <h1>Checking Identity</h1>
        <p className="lede">Validating saved employee session...</p>
      </section>
    );
  }

  if (!identity) {
    return (
      <EmployeeIdentityGate
        onVerified={(nextIdentity) => {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextIdentity));
          setIdentity(nextIdentity);
        }}
      />
    );
  }

  return (
    <ExpenseIntakeForm
      identity={identity}
      onChangeIdentity={() => {
        window.localStorage.removeItem(STORAGE_KEY);
        setIdentity(null);
      }}
    />
  );
}
