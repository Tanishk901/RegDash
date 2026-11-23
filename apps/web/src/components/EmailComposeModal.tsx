import { useEffect, useState } from "react";
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
  const [sendError, setSendError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplateListItem | null>(null);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const applyTemplate = (t: EmailTemplateListItem) => {
    setSelectedTemplate(t);
    setSubject(t.subject);
    setBody(t.body);
    setPreview(null);
    setShowPreview(false);
  };

  useEffect(() => {
    if (!showPreview) return;
    let cancelled = false;
    api.emailPreview({
      subject,
      body,
      ticketNumber,
      templateId: selectedTemplate?.id,
    }).then((p) => {
      if (!cancelled) setPreview(p);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [showPreview, subject, body, ticketNumber, selectedTemplate?.id]);

  const send = async () => {
    if (!to.trim() || !subject.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      await api.sendEmail({
        to: to.trim(),
        subject: subject.trim(),
        body: body.trim(),
        ticketNumber,
        templateId: selectedTemplate?.id,
      });
      setSent(true);
      setTimeout(onClose, 1500);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Failed to send email");
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
            <span className="muted small" style={{ display: "block", marginTop: 4 }}>
              Use {"{{ticket}}"}, {"{{assignee}}"}, {"{{priority}}"} etc. as merge fields
            </span>
          </div>
        )}

        <div className="vb-field">
          <label>To</label>
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com" style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-xs)", background: "var(--bg)", fontSize: 14 }} />
        </div>
        <div className="vb-field">
          <label>Subject</label>
          <input type="text" value={subject} onChange={(e) => { setSubject(e.target.value); setPreview(null); }} />
        </div>
        <div className="vb-field">
          <label>Body</label>
          <textarea className="comment-input" rows={6} value={body} onChange={(e) => { setBody(e.target.value); setPreview(null); }} placeholder="Email body…" />
        </div>

        {showPreview && preview && (
          <div style={{ marginTop: 8, padding: 12, background: "var(--surface)", borderRadius: "var(--radius-xs)", border: "1px solid var(--border)" }}>
            <div className="muted small" style={{ marginBottom: 4 }}>Preview (merge fields resolved):</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{preview.subject}</div>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{preview.body}</div>
          </div>
        )}

        {sent && <p className="confirm-fade small">Email sent.</p>}
        {sendError && <p className="error small">{sendError}</p>}

        <div className="vb-actions">
          <button onClick={send} disabled={sending || !to.trim() || !subject.trim()}>
            {sending ? "Sending…" : "Send"}
          </button>
          <button className="link" onClick={() => { setShowPreview(!showPreview); setPreview(null); }}>
            {showPreview ? "Hide preview" : "Preview"}
          </button>
          <button className="link" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  );
}
