import { useState } from "react";
import { api, usePolling, type Suggestion } from "../lib/api";

function SuggestionCard({
  s,
  ticketNumber,
  onFeedback,
}: {
  s: Suggestion;
  ticketNumber: string;
  onFeedback: () => void;
}) {
  const [sending, setSending] = useState(false);

  const send = async (action: "accept" | "dismiss" | "flag") => {
    setSending(true);
    try {
      await api.suggestionFeedback(ticketNumber, s.id, action);
      onFeedback();
    } catch {
      /* reload will show the right state */
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`suggestion-card ${s.feedback ? `suggestion-${s.feedback}` : ""}`}>
      <p className="suggestion-answer">{s.answer}</p>
      {s.citations.length > 0 && (
        <details className="suggestion-sources">
          <summary className="muted small">
            {s.citations.length} source{s.citations.length !== 1 ? "s" : ""}
          </summary>
          <ul>
            {s.citations.map((c) => (
              <li key={c.chunkId}>
                <strong>{c.title}</strong>
                <span className="muted small"> — {c.snippet.slice(0, 120)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {!s.feedback && (
        <div className="suggestion-actions">
          <button className="btn-accept" onClick={() => send("accept")} disabled={sending} title="Accept suggestion">
            Accept
          </button>
          <button className="btn-dismiss" onClick={() => send("dismiss")} disabled={sending} title="Dismiss suggestion">
            Dismiss
          </button>
          <button className="btn-flag" onClick={() => send("flag")} disabled={sending} title="Flag as incorrect">
            Flag
          </button>
        </div>
      )}
      {s.feedback && (
        <span className={`suggestion-feedback-badge feedback-${s.feedback}`}>
          {s.feedback === "accept" ? "Accepted" : s.feedback === "dismiss" ? "Dismissed" : "Flagged"}
        </span>
      )}
      <span className="muted small suggestion-model">via {s.model}</span>
    </div>
  );
}

export function SuggestionsPanel({ ticketNumber }: { ticketNumber: string }) {
  const { data, error, reload } = usePolling(() => api.suggestions(ticketNumber), [ticketNumber], 0);
  const [collapsed, setCollapsed] = useState(false);

  if (error) return null;
  if (!data) return <p className="muted small">Loading suggestions…</p>;
  if (data.suggestions.length === 0) {
    return (
      <section className="suggestions-panel suggestions-empty">
        <p className="muted small" style={{ padding: "12px 14px", margin: 0, textAlign: "center" }}>
          <span className="copilot-icon" aria-hidden="true">&#9670;</span>{" "}
          No suggestions yet — the copilot has nothing to recommend for this ticket.
        </p>
      </section>
    );
  }

  return (
    <section className="suggestions-panel">
      <h4
        className="suggestions-heading"
        onClick={() => setCollapsed((c) => !c)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setCollapsed((c) => !c); }}
      >
        <span className="copilot-icon" aria-hidden="true">&#9670;</span>
        {" "}Suggested resolution
        <span className="muted small"> ({data.suggestions.length})</span>
        <span className="collapse-arrow">{collapsed ? "▸" : "▾"}</span>
      </h4>
      {!collapsed && (
        <div className="suggestions-list">
          {data.suggestions.map((s) => (
            <SuggestionCard key={s.id} s={s} ticketNumber={ticketNumber} onFeedback={reload} />
          ))}
        </div>
      )}
    </section>
  );
}
