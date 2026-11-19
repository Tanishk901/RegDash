import { useState } from "react";
import { api, usePolling, type EmailTemplateListItem } from "../lib/api";

export function EmailComposeModal({
  ticketNumber,
  onClose,
}: {
  ticketNumber: string;
  onClose: () => void;
}) {
  const templates = usePolling(() => api.templates(), [], 0);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState(`Re: ${ticketNumber}`);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const applyTemplate = (t: EmailTemplateListItem) => {
    setSubject(t.subject.replace(/\{\{ticket\}\}/g, ticketNumber));
    setBody(t.body.replace(/\{\{ticket\}\}/g, ticketNumber));
  };

  const send = async () => {
    if (!to.trim() || !subject.trim()) return;
    setSending(true);
    try {
      await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim(), subject: subject.trim(), body: body.trim(), ticketNumber }),
      });
      setSent(true);
      setTimeout(onClose, 1500);
    } catch {
      /* */
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="shortcut-dialog" role="dialog" aria-label="Compose email" style={{ minWidth: 440 }}>
        <h3>Send email for {ticketNumber}</h3>

        {templates.data && templates.data.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label className="muted small" style={{ display: "block", marginBottom: 4 }}>Use template</label>
            <select
              className="inline-select"
              defaultValue=""
              onChange={(e) => {
                const t = templates.data!.find((t) => t.id === e.target.value);
                if (t) applyTemplate(t);
              }}
            >
              <option value="" disabled>Select a template…</option>
              {templates.data.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="vb-field">
          <label>To</label>
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com" style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-xs)", background: "var(--bg)", fontSize: 14 }} />
        </div>
        <div className="vb-field">
          <label>Subject</label>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="vb-field">
          <label>Body</label>
          <textarea className="comment-input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Email body…" />
        </div>

        {sent && <p className="confirm-fade small">Email sent.</p>}

        <div className="vb-actions">
          <button onClick={send} disabled={sending || !to.trim() || !subject.trim()}>
            {sending ? "Sending…" : "Send"}
          </button>
          <button className="link" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  );
}
