import { Link } from "react-router-dom";
import type { ApplicationCode, DashboardSummary, Environment } from "@regdash/shared";

/** Totals by ticket type. Everything that needs attention has a gauge instead. */
export function SummaryCards({ summary }: { summary: DashboardSummary }) {
  const cards = [
    { label: "Open", value: summary.totalOpen, to: "/tickets" },
    { label: "Incidents", value: summary.incidentsOpen, to: "/tickets?type=INCIDENT" },
    { label: "Service requests", value: summary.srsOpen, to: "/tickets?type=SR" },
  ];

  const appEntries = Object.entries(summary.byApplication) as [ApplicationCode, number][];
  const envEntries = Object.entries(summary.byEnvironment) as [Environment, number][];

  return (
    <>
      <section className="cards" aria-label="Summary">
        {cards.map((c) => (
          <Link key={c.label} className="card" to={c.to}>
            <span className="card-value">{c.value}</span>
            <span className="card-label">{c.label}</span>
          </Link>
        ))}
      </section>

      {appEntries.some(([, n]) => n > 0) && (
        <section className="cards cards-breakdown" aria-label="By application">
          <span className="cards-heading">By application</span>
          {appEntries.filter(([, n]) => n > 0).map(([app, n]) => (
            <Link key={app} className="card card-sm" to={`/tickets?application=${app}`}>
              <span className="card-value">{n}</span>
              <span className="card-label">{app}</span>
            </Link>
          ))}
        </section>
      )}

      {envEntries.some(([, n]) => n > 0) && (
        <section className="cards cards-breakdown" aria-label="By environment">
          <span className="cards-heading">By environment</span>
          {envEntries.filter(([, n]) => n > 0).map(([env, n]) => (
            <Link key={env} className="card card-sm" to={`/tickets?environment=${env}`}>
              <span className="card-value">{n}</span>
              <span className="card-label">{env}</span>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}
