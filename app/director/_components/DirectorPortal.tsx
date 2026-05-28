"use client";

import { useEffect, useState } from "react";
import type { DirectorIdentity } from "@/lib/schemas/identity";
import { DirectorAccessForm } from "@/app/director/_components/DirectorAccessForm";
import { DirectorEmbeddedChat } from "@/app/director/_components/DirectorEmbeddedChat";

const STORAGE_KEY = "expense-tracker.director";

type DirectorIdentityResponse = {
  valid: boolean;
  fullName: string;
  directorId: string;
};

async function validateDirector(identity: DirectorIdentity): Promise<DirectorIdentity | null> {
  const response = await fetch("/api/director/identity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(identity),
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as DirectorIdentityResponse;
  if (!body.valid) {
    return null;
  }

  return { fullName: body.fullName, directorId: body.directorId };
}

export function DirectorPortal() {
  const [identity, setIdentity] = useState<DirectorIdentity | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      const serialized = window.localStorage.getItem(STORAGE_KEY);
      if (!serialized) {
        if (active) {
          setReady(true);
        }
        return;
      }

      try {
        const parsed = JSON.parse(serialized) as DirectorIdentity;
        const validated = await validateDirector(parsed);

        if (validated && active) {
          setIdentity(validated);
        } else if (!validated) {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      } finally {
        if (active) {
          setReady(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <section className="card director-shell">
        <h1>Director Console</h1>
        <p className="lede">Checking access...</p>
      </section>
    );
  }

  if (!identity) {
    return (
      <DirectorAccessForm
        onVerified={(nextIdentity) => {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextIdentity));
          setIdentity(nextIdentity);
        }}
      />
    );
  }

  return (
    <DirectorEmbeddedChat
      identity={identity}
      onSignOut={() => {
        window.localStorage.removeItem(STORAGE_KEY);
        setIdentity(null);
      }}
    />
  );
}
