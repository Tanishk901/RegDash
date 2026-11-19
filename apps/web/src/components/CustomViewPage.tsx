import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { SavedView, SavedViewInput } from "@regdash/shared";
import { api, usePolling } from "../lib/api";
import { TicketTable } from "./TicketTable";
import { TicketDetail } from "./TicketDetail";
import { ViewBuilder } from "./ViewBuilder";

export function CustomViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const view = usePolling(() => api.view(id!), [id], 30_000);

  const filtersToParams = (v: SavedView): URLSearchParams => {
    const p = new URLSearchParams();
    const f = v.filters;
    if (f.type) p.set("type", f.type);
    if (f.status?.length) p.set("status", f.status.join(","));
    if (f.priority?.length) p.set("priority", f.priority.join(","));
    if (f.sla) p.set("sla", f.sla);
    if (f.assignedTo) p.set("assignedTo", f.assignedTo);
    if (f.q) p.set("q", f.q);
    if (f.stale) p.set("stale", "true");
    if (f.includeClosed) p.set("includeClosed", "true");
    if (f.application) p.set("application", f.application);
    if (f.environment) p.set("environment", f.environment);
    p.set("sort", v.sort);
    p.set("dir", v.sortDir);
    return p;
  };

  const tickets = usePolling(
    () => (view.data ? api.tickets(filtersToParams(view.data)) : Promise.resolve(null)),
    [view.data],
    30_000,
  );

  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);

  const handleSave = useCallback(
    async (input: SavedViewInput) => {
      await api.updateView(id!, input);
      setEditing(false);
      await view.reload();
    },
    [id, view],
  );

  const handleTogglePin = useCallback(async () => {
    if (!view.data) return;
    await api.updateView(id!, { pinned: !view.data.pinned });
    await view.reload();
  }, [id, view]);

  if (!view.data) {
    if (view.error) {
      return <div className="banner banner-error" role="alert">Couldn't load view: {view.error}</div>;
    }
    return <p className="muted">Loading view…</p>;
  }

  if (editing) {
    return <ViewBuilder initial={view.data} onSave={handleSave} onCancel={() => setEditing(false)} />;
  }

  const v = view.data;

  return (
    <div className="custom-view-page">
      <div className="section-head">
        <div>
          <h2>{v.name}</h2>
          {v.description && <p className="muted">{v.description}</p>}
        </div>
        <div className="cv-actions">
          <button className={`link${v.pinned ? " is-set" : ""}`} onClick={handleTogglePin}>
            {v.pinned ? "Unpin" : "Pin"}
          </button>
          <button className="button" onClick={() => setEditing(true)}>Edit</button>
          <button className="link" onClick={() => navigate("/views")}>Back to views</button>
        </div>
      </div>

      {tickets.error && (
        <div className="banner banner-error" role="alert">Couldn't load tickets: {tickets.error}</div>
      )}

      <div className="count muted">
        <span>
          {tickets.data ? `${tickets.data.total} ticket${tickets.data.total === 1 ? "" : "s"}` : "Loading…"}
        </span>
      </div>

      {tickets.data && (
        <TicketTable
          items={tickets.data.items}
          columns={v.columns}
          groupBy={v.groupBy}
          selected={selectedTicket ?? undefined}
          onOpen={(n) => setSelectedTicket(n)}
        />
      )}

      {selectedTicket && (
        <TicketDetail
          number={selectedTicket}
          servicenowUrl={null}
          onClose={() => setSelectedTicket(null)}
          onMutate={() => { void tickets.reload(); }}
        />
      )}
    </div>
  );
}
