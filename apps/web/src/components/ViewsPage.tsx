import { useCallback, useState } from "react";
import type { SavedView, SavedViewInput } from "@regdash/shared";
import { useNavigate } from "react-router-dom";
import { api, usePolling } from "../lib/api";
import { ViewBuilder } from "./ViewBuilder";

export function ViewsPage() {
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const views = usePolling(() => api.views(), [], 30_000);

  const handleCreate = useCallback(
    async (input: SavedViewInput) => {
      const view = await api.createView(input);
      setCreating(false);
      await views.reload();
      navigate(`/views/${view.id}`);
    },
    [views, navigate],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await api.deleteView(id);
      await views.reload();
    },
    [views],
  );

  const handleTogglePin = useCallback(
    async (view: SavedView) => {
      await api.updateView(view.id, { pinned: !view.pinned });
      await views.reload();
    },
    [views],
  );

  if (creating) {
    return <ViewBuilder onSave={handleCreate} onCancel={() => setCreating(false)} />;
  }

  return (
    <div className="views-page">
      <div className="section-head">
        <h2>Saved views</h2>
        <button className="button" onClick={() => setCreating(true)}>
          + New view
        </button>
      </div>

      {views.error && (
        <div className="banner banner-error" role="alert">Couldn't load views: {views.error}</div>
      )}

      {views.data && views.data.length === 0 && (
        <p className="empty">
          No saved views yet. Create one to save your column, filter, and grouping preferences.
        </p>
      )}

      {views.data && views.data.length > 0 && (
        <div className="views-grid">
          {views.data.map((v) => (
            <div
              key={v.id}
              className="view-card"
              onClick={() => navigate(`/views/${v.id}`)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && navigate(`/views/${v.id}`)}
              tabIndex={0}
              role="button"
              aria-label={`Open ${v.name}`}
            >
              <div className="view-card-head">
                <h3>{v.name}</h3>
                <div className="view-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className={`link small${v.pinned ? " is-set" : ""}`}
                    onClick={() => handleTogglePin(v)}
                    title={v.pinned ? "Unpin from nav" : "Pin to nav"}
                  >
                    {v.pinned ? "📌" : "Pin"}
                  </button>
                  <button
                    className="link small danger"
                    onClick={() => handleDelete(v.id)}
                    title="Delete view"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {v.description && <p className="muted small">{v.description}</p>}
              <div className="view-card-meta muted small">
                <span>{v.columns.length} columns</span>
                {v.groupBy && <span>Grouped by {v.groupBy}</span>}
                <span>Sort: {v.sort}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
