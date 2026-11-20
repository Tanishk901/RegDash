import { useState } from "react";
import { api, usePolling, type EmailTemplateListItem } from "../lib/api";

export function BulkEmailBar({
  selectedNumbers,
  onDone,
}: {
  selectedNumbers: Set<string>;
  onDone: () => void;
}) {
  const templates = usePolling(() => api.templates(), [], 0);
  const [templateId, setTemplateId] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);

  if (selectedNumbers.size === 0) return null;

  const send = async () => {
    if (!templateId) return;
    setSending(true);
    try {
      const r = await api.bulkSend(templateId, [...selectedNumbers]);
      setResult(r);
      setTimeout(() => { setResult(null); onDone(); }, 2000);
    } catch {
      /* */
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bulk-email-bar" style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", background: "var(--surface)", borderRadius: "var(--radius-xs)", border: "1px solid var(--border)", marginBottom: 8 }}>
      <span className="small">{selectedNumbers.size} ticket{selectedNumbers.size === 1 ? "" : "s"} selected</span>
      {templates.data && templates.data.length > 0 && (
        <select
          className="inline-select"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          style={{ minWidth: 180 }}
        >
          <option value="" disabled>Send email template…</option>
          {templates.data.map((t: EmailTemplateListItem) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}
      <button onClick={send} disabled={sending || !templateId}>
        {sending ? "Sending…" : "Send bulk email"}
      </button>
      <button className="link" onClick={onDone}>Clear selection</button>
      {result && (
        <span className="confirm-fade small">
          Sent {result.sent}, failed {result.failed}
        </span>
      )}
    </div>
  );
}
