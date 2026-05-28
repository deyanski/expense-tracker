"use client";

import type { DirectorIdentity } from "@/lib/schemas/identity";

type DirectorEmbeddedChatProps = {
  identity: DirectorIdentity;
  onSignOut: () => void;
};

function buildEmbedUrl(baseUrl: string, identity: DirectorIdentity): string {
  const url = new URL(baseUrl);
  url.searchParams.set("fullName", identity.fullName);
  url.searchParams.set("directorId", identity.directorId);
  return url.toString();
}

export function DirectorEmbeddedChat({ identity, onSignOut }: DirectorEmbeddedChatProps) {
  const embedBaseUrl = process.env.NEXT_PUBLIC_N8N_DIRECTOR_CHAT_EMBED_URL;

  if (!embedBaseUrl) {
    return (
      <section className="card director-shell">
        <header className="director-header">
          <div>
            <h1>Director Console</h1>
            <p className="lede">Embedded chat URL is not configured.</p>
          </div>
          <button className="link-button" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </header>
        <p className="status error">NEXT_PUBLIC_N8N_DIRECTOR_CHAT_EMBED_URL is missing.</p>
      </section>
    );
  }

  let src = "";

  try {
    src = buildEmbedUrl(embedBaseUrl, identity);
  } catch {
    return (
      <section className="card director-shell">
        <header className="director-header">
          <div>
            <h1>Director Console</h1>
            <p className="lede">Embedded chat URL is invalid.</p>
          </div>
          <button className="link-button" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </header>
        <p className="status error">NEXT_PUBLIC_N8N_DIRECTOR_CHAT_EMBED_URL must be a valid URL.</p>
      </section>
    );
  }

  return (
    <section className="card director-shell">
      <header className="director-header">
        <div>
          <h1>Director Console</h1>
          <p className="lede">Ask about totals, rejections, pending approvals, and employee-specific expenses.</p>
        </div>
        <div className="identity-chip">
          <span>{identity.fullName}</span>
          <span className="dot">•</span>
          <span>{identity.directorId}</span>
          <button className="link-button" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <div className="director-chat-wrap">
        <iframe
          className="director-chat-frame"
          src={src}
          title="Director Finance Assistant"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
    </section>
  );
}
