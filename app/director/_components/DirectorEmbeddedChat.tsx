"use client";

import { useEffect, useId } from "react";
import { LogOut } from "lucide-react";
import type { DirectorIdentity } from "@/lib/schemas/identity";

type DirectorEmbeddedChatProps = {
  identity: DirectorIdentity;
  onSignOut: () => void;
};

export function DirectorEmbeddedChat({ identity, onSignOut }: DirectorEmbeddedChatProps) {
  const chatWebhookUrl =
    process.env.NEXT_PUBLIC_N8N_DIRECTOR_CHAT_WEBHOOK_URL ??
    process.env.NEXT_PUBLIC_N8N_DIRECTOR_CHAT_EMBED_URL;
  const widgetTargetId = useId().replace(/:/g, "-");

  useEffect(() => {
    if (!chatWebhookUrl) {
      return;
    }

    const styleId = "n8n-chat-style";
    if (!document.getElementById(styleId)) {
      const stylesheet = document.createElement("link");
      stylesheet.id = styleId;
      stylesheet.rel = "stylesheet";
      stylesheet.href = "https://cdn.jsdelivr.net/npm/@n8n/chat/dist/style.css";
      document.head.appendChild(stylesheet);
    }

    const scriptId = `n8n-chat-script-${widgetTargetId}`;
    const script = document.createElement("script");
    script.id = scriptId;
    script.type = "module";
    script.textContent = `
      import { createChat } from "https://cdn.jsdelivr.net/npm/@n8n/chat/dist/chat.bundle.es.js";
      createChat({
        webhookUrl: ${JSON.stringify(chatWebhookUrl)},
        target: ${JSON.stringify(`#${widgetTargetId}`)},
        mode: "fullscreen",
        chatInputKey: "chatInput",
        metadata: {
          fullName: ${JSON.stringify(identity.fullName)},
          directorId: ${JSON.stringify(identity.directorId)}
        },
        showWelcomeScreen: false,
        initialMessages: ["Director assistant is online."],
        i18n: {
          en: {
            title: "Director Assistant",
            subtitle: "Ask about finance metrics and expense patterns.",
            inputPlaceholder: "Ask a finance question..."
          }
        }
      });
    `;
    script.onerror = () => {
      const container = document.getElementById(widgetTargetId);
      if (container) {
        container.innerHTML =
          "<p class=\"status error\">Unable to load n8n chat widget. Check network policy and webhook URL.</p>";
      }
    };
    document.body.appendChild(script);

    return () => {
      const container = document.getElementById(widgetTargetId);
      if (container) {
        container.innerHTML = "";
      }

      const existingScript = document.getElementById(scriptId);
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, [chatWebhookUrl, identity.directorId, identity.fullName, widgetTargetId]);

  if (!chatWebhookUrl) {
    return (
      <section className="card director-shell">
        <header className="director-header">
          <div>
            <h1>Director Console</h1>
            <p className="lede">Director chat webhook is not configured.</p>
          </div>
          <button className="link-button" type="button" onClick={onSignOut}>
            <LogOut className="icon-xs" aria-hidden="true" />
            Sign out
          </button>
        </header>
        <p className="status error">
          Set NEXT_PUBLIC_N8N_DIRECTOR_CHAT_WEBHOOK_URL (or NEXT_PUBLIC_N8N_DIRECTOR_CHAT_EMBED_URL as fallback).
        </p>
      </section>
    );
  }

  try {
    new URL(chatWebhookUrl);
  } catch {
    return (
      <section className="card director-shell">
        <header className="director-header">
          <div>
            <h1>Director Console</h1>
            <p className="lede">Director chat webhook URL is invalid.</p>
          </div>
          <button className="link-button" type="button" onClick={onSignOut}>
            <LogOut className="icon-xs" aria-hidden="true" />
            Sign out
          </button>
        </header>
        <p className="status error">The configured director webhook URL must be a valid URL.</p>
      </section>
    );
  }

  return (
    <section className="card director-shell">
      <header className="director-header">
        <div>
          <h1>Director Console</h1>
          <p className="lede">Ask focused questions about spend, trends, approvals, and policy risk.</p>
        </div>
        <div className="identity-chip">
          <span>{identity.fullName}</span>
          <span className="dot">•</span>
          <span>{identity.directorId}</span>
          <button className="link-button" type="button" onClick={onSignOut}>
            <LogOut className="icon-xs" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </header>

      <div className="director-chat-wrap">
        <div id={widgetTargetId} className="director-chat-frame" />
      </div>
    </section>
  );
}
