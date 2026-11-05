import { Link } from "react-router-dom";
import type { DashboardSummary } from "@regdash/shared";

/** Totals by ticket type. Everything that needs attention has a gauge instead. */
export function SummaryCards({ summary }: { summary: DashboardSummary }) {
  const cards = [
    { label: "Open", value: summary.totalOpen, to: "/tickets" },
    { label: "Incidents", value: summary.incidentsOpen, to: "/tickets?type=INCIDENT" },
    { label: "Service requests", value: summary.srsOpen, to: "/tickets?type=SR" },
  ];

  return (
    <section className="cards" aria-label="Summary">
      {cards.map((c) => (
        <Link key={c.label} className="card" to={c.to}>
          <span className="card-value">{c.value}</span>
          <span className="card-label">{c.label}</span>
        </Link>
      ))}
    </section>
  );
}
