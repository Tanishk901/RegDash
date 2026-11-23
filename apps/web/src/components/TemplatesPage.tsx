import { Fragment, useState } from "react";
import { EMAIL_TEMPLATE_KINDS } from "@regdash/shared";
import { api, usePolling, type EmailTemplateCreateInput, type EmailTemplateListItem, type MergeField, type AutomationConfig } from "../lib/api";

function MergeFieldHelp({ fields }: { fields: MergeField[] }) {
  return (
    <details className="merge-field-help" style={{ marginBottom: 12 }}>
      <summary className="muted small" style={{ cursor: "pointer" }}>Available merge fields</summary>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 12px", fontSize: 13, marginTop: 4, padding: 8, background: "var(--surface)", borderRadius: "var(--radius-xs)" }}>
        {fields.map((f) => (
          <Fragment key={f.key}>
            <span>
              <code style={{ background: "var(--bg)", padding: "1px 4px", borderRadius: 3 }}>{`{{${f.key}}}`}</code>
            </span>
            <span className="muted">{f.label}</span>
          </Fragment>
        ))}
      </div>
    </details>
  );
}

function TemplateForm({
  initial,
  mergeFields,
  onSave,
  onCancel,
}: {
  initial?: EmailTemplateListItem;
  mergeFields: MergeField[];
  onSave: (input: EmailTemplateCreateInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState(initial?.kind ?? "acknowledgement");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [previewData, setPreviewData] = useState<{ subject: string; body: string } | null>(null);

  const submit = async () => {
    if (!name.trim() || !subject.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), kind, subject: subject.trim(), body: body.trim() });
    } finally {
      setSaving(false);
    }
  };

  const loadPreview = async () => {
    try {
      const p = await api.emailPreview({ subject, body });
      setPreviewData(p);
    } catch { /* */ }
  };

  return (
    <div className="view-builder" style={{ marginBottom: 20 }}>
      <h3>{initial ? "Edit template" : "New template"}</h3>
      <MergeFieldHelp fields={mergeFields} />
      <div className="vb-field">
        <label>Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" />
      </div>
      <div className="vb-field">
        <label>Kind</label>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {EMAIL_TEMPLATE_KINDS.map((k) => (
            <option key={k} value={k}>{k.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>
      <div className="vb-field">
        <label>Subject</label>
        <input type="text" value={subject} onChange={(e) => { setSubject(e.target.value); setPreviewData(null); }} placeholder="Email subject line — use {{ticket}}, {{assignee}} etc." />
      </div>
      <div className="vb-field">
        <label>Body</label>
        <textarea
          className="comment-input"
          rows={6}
          value={body}
          onChange={(e) => { setBody(e.target.value); setPreviewData(null); }}
          placeholder="Email body (plain text or HTML) — merge fields are replaced when sending"
        />
      </div>
      {previewData && (
        <div style={{ marginBottom: 12, padding: 12, background: "var(--surface)", borderRadius: "var(--radius-xs)", border: "1px solid var(--border)" }}>
          <div className="muted small" style={{ marginBottom: 4 }}>Preview (with sample data):</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{previewData.subject}</div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{previewData.body}</div>
        </div>
      )}
      <div className="vb-actions">
        <button onClick={submit} disabled={saving || !name.trim() || !subject.trim() || !body.trim()}>
          {saving ? "Saving…" : initial ? "Update" : "Create"}
        </button>
        <button className="link" onClick={loadPreview} disabled={!subject.trim() && !body.trim()}>
          Preview
        </button>
        <button className="link" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function DeliveryLog() {
  const { data, error } = usePolling(() => api.emailLog(), [], 0);

  if (error) return <div className="banner banner-error" role="alert">{error}</div>;
  if (!data || data.length === 0) return <p className="muted">No emails sent yet.</p>;

  return (
    <div className="triage-table-wrap">
      <table className="triage-table" aria-label="Email delivery log">
        <thead>
          <tr>
            <th>Time</th>
            <th>To</th>
            <th>Subject</th>
            <th>Ticket</th>
            <th>Trigger</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.map((e) => (
            <tr key={e.id}>
              <td className="muted small">{new Date(e.sentAt).toLocaleString()}</td>
              <td>{e.to}</td>
              <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.subject}</td>
              <td>{e.ticketNumber ?? "—"}</td>
              <td><span className="badge">{e.trigger.replace(/_/g, " ")}</span></td>
              <td>
                <span className={`badge ${e.status === "sent" ? "badge-ok" : "badge-breach"}`}>
                  {e.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AutomationPanel() {
  const { data: config, reload } = usePolling(() => api.automationConfig(), [], 0);
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [welcomeTo, setWelcomeTo] = useState("");

  const toggleEnabled = async () => {
    if (!config) return;
    await api.updateAutomationConfig({ enabled: !config.enabled });
    await reload();
  };

  const updateDays = async (days: number) => {
    await api.updateAutomationConfig({ staleReminderDays: days });
    await reload();
  };

  const runTrigger = async (name: string, fn: () => Promise<{ sent: number; skipped: number; errors: string[] }>) => {
    setRunning(name);
    setResult(null);
    try {
      const r = await fn();
      setResult(`${name}: ${r.sent} sent, ${r.skipped} skipped${r.errors.length ? `, ${r.errors.length} error(s)` : ""}`);
    } catch {
      setResult(`${name}: failed`);
    } finally {
      setRunning(null);
    }
  };

  if (!config) return null;

  return (
    <div>
      <div className="view-builder" style={{ marginBottom: 16 }}>
        <h3>Automation settings</h3>
        <div className="vb-field" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label>
            <input type="checkbox" checked={config.enabled} onChange={toggleEnabled} />
            {" "}Email automation enabled
          </label>
        </div>
        <div className="vb-field">
          <label>Stale reminder threshold (days)</label>
          <input
            type="number"
            min={1}
            max={30}
            value={config.staleReminderDays}
            onChange={(e) => updateDays(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </div>
      </div>

      <div className="view-builder" style={{ marginBottom: 16 }}>
        <h3>Manual triggers</h3>
        <p className="muted small" style={{ marginBottom: 12 }}>Run automation triggers manually. Requires matching template kinds (reminder, welcome, acknowledgement).</p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <button
            onClick={() => runTrigger("Stale reminders", () => api.triggerStaleReminders())}
            disabled={running !== null}
          >
            {running === "Stale reminders" ? "Running…" : "Send stale reminders"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <input
            type="email"
            value={welcomeTo}
            onChange={(e) => setWelcomeTo(e.target.value)}
            placeholder="user@example.com"
            style={{ width: 220, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-xs)", background: "var(--bg)", fontSize: 13 }}
          />
          <button
            onClick={() => runTrigger("Welcome email", () => api.triggerWelcome(welcomeTo))}
            disabled={running !== null || !welcomeTo.trim()}
          >
            {running === "Welcome email" ? "Sending…" : "Send welcome email"}
          </button>
        </div>

        {result && <p className="confirm-fade small">{result}</p>}
      </div>
    </div>
  );
}

export function TemplatesPage() {
  const { data, error, reload } = usePolling(() => api.templates(), [], 0);
  const mergeFieldsRes = usePolling(() => api.mergeFields(), [], 0);
  const [editing, setEditing] = useState<EmailTemplateListItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"templates" | "log" | "automation">("templates");

  const handleCreate = async (input: EmailTemplateCreateInput) => {
    await api.createTemplate(input);
    setCreating(false);
    await reload();
  };

  const handleUpdate = async (input: EmailTemplateCreateInput) => {
    if (!editing) return;
    await api.updateTemplate(editing.id, input);
    setEditing(null);
    await reload();
  };

  const handleDelete = async (id: string) => {
    await api.deleteTemplate(id);
    await reload();
  };

  const mergeFields = mergeFieldsRes.data ?? [];

  return (
    <div className="views-page">
      <div className="section-head">
        <h2>Email</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={tab === "templates" ? "" : "link"} onClick={() => setTab("templates")}>Templates</button>
          <button className={tab === "log" ? "" : "link"} onClick={() => setTab("log")}>Delivery log</button>
          <button className={tab === "automation" ? "" : "link"} onClick={() => setTab("automation")}>Automation</button>
          {tab === "templates" && !creating && !editing && (
            <button onClick={() => setCreating(true)}>New template</button>
          )}
        </div>
      </div>

      {tab === "log" && <DeliveryLog />}
      {tab === "automation" && <AutomationPanel />}

      {tab === "templates" && (
        <>
          {creating && <TemplateForm mergeFields={mergeFields} onSave={handleCreate} onCancel={() => setCreating(false)} />}
          {editing && <TemplateForm initial={editing} mergeFields={mergeFields} onSave={handleUpdate} onCancel={() => setEditing(null)} />}

          {error && <div className="banner banner-error" role="alert">{error}</div>}

          {data && data.length === 0 && !creating && (
            <p className="muted">No templates yet. Create one to get started.</p>
          )}

          {data && data.length > 0 && (
            <div className="views-grid">
              {data.map((t) => (
                <div key={t.id} className="view-card" onClick={() => setEditing(t)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setEditing(t)}>
                  <div className="view-card-head">
                    <h3>{t.name}</h3>
                    <div className="view-card-actions">
                      <button className="link" onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="view-card-meta">
                    <span className="badge">{t.kind.replace(/_/g, " ")}</span>
                    <span className="muted small">{t.subject}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
