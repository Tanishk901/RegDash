import type { DashboardSummary } from "@regdash/shared";

interface Card {
  label: string;
  value: number;
  tone?: "danger" | "warn" | "muted";
  /** Filter params applied when the card is clicked. */
  filter: Record<string, string>;
  hint?: string;
}

/** URL params a card can set. `sort` is excluded so a card stays selected if the user re-sorts. */
const CARD_FILTER_KEYS = ["type", "status", "priority", "sla", "assignedTo", "stale"] as const;

/** A card is selected when the URL's card-filter params are exactly its filter. */
function isSelected(filter: Record<string, string>, params: URLSearchParams): boolean {
  return CARD_FILTER_KEYS.every((k) => (params.get(k) ?? "") === (filter[k] ?? ""));
}

export function SummaryCards({
  summary,
  params,
  onPick,
}: {
  summary: DashboardSummary;
  params: URLSearchParams;
  onPick: (filter: Record<string, string>) => void;
}) {
  const cards: Card[] = [
    { label: "Open", value: summary.totalOpen, filter: {} },
    { label: "Incidents", value: summary.incidentsOpen, filter: { type: "INCIDENT" } },
    { label: "Service requests", value: summary.srsOpen, filter: { type: "SR" } },
    { label: "SLA breached", value: summary.slaBreached, tone: "danger", filter: { sla: "BREACHED" } },
    { label: "SLA at risk", value: summary.slaAtRisk, tone: "warn", filter: { sla: "AT_RISK" } },
    { label: "On hold", value: summary.onHold, tone: "muted", filter: { status: "ON_HOLD" }, hint: "Waiting on someone outside the team" },
    { label: "P1 + P2", value: summary.byPriority.P1 + summary.byPriority.P2, filter: { priority: "P1,P2" } },
    { label: "Stale (48h+)", value: summary.stale, tone: summary.stale ? "warn" : undefined, filter: { stale: "true", sort: "updated" }, hint: "No update in 48 hours" },
  ];

  return (
    <section className="cards" aria-label="Summary">
      {cards.map((c) => {
        const selected = isSelected(c.filter, params);
        return (
          <button
            key={c.label}
            className={`card ${c.tone && c.value > 0 ? `card-${c.tone}` : ""} ${selected ? "card-selected" : ""}`}
            onClick={() => onPick(c.filter)}
            title={c.hint}
            aria-pressed={selected}
          >
            <span className="card-value">{c.value}</span>
            <span className="card-label">{c.label}</span>
          </button>
        );
      })}
    </section>
  );
}
