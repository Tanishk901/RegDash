import { useState } from "react";
import { EMAIL_TEMPLATE_KINDS } from "@regdash/shared";
import { api, usePolling, type EmailTemplateCreateInput, type EmailTemplateListItem } from "../lib/api";

function TemplateForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: EmailTemplateListItem;
  onSave: (input: EmailTemplateCreateInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState(initial?.kind ?? "acknowledgement");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || !subject.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), kind, subject: subject.trim(), body: body.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="view-builder" style={{ marginBottom: 20 }}>
      <h3>{initial ? "Edit template" : "New template"}</h3>
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
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject line" />
      </div>
      <div className="vb-field">
        <label>Body</label>
        <textarea
          className="comment-input"
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Email body (plain text or HTML)"
        />
      </div>
      <div className="vb-actions">
        <button onClick={submit} disabled={saving || !name.trim() || !subject.trim() || !body.trim()}>
          {saving ? "Saving…" : initial ? "Update" : "Create"}
        </button>
        <button className="link" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function TemplatesPage() {
  const { data, error, reload } = usePolling(() => api.templates(), [], 0);
  const [editing, setEditing] = useState<EmailTemplateListItem | null>(null);
  const [creating, setCreating] = useState(false);

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

  return (
    <div className="views-page">
      <div className="section-head">
        <h2>Email Templates</h2>
        {!creating && !editing && (
          <button onClick={() => setCreating(true)}>New template</button>
        )}
      </div>

      {creating && <TemplateForm onSave={handleCreate} onCancel={() => setCreating(false)} />}
      {editing && <TemplateForm initial={editing} onSave={handleUpdate} onCancel={() => setEditing(null)} />}

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
    </div>
  );
}
