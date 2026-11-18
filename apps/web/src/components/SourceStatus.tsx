import type { Health } from "../lib/api";

type SourceState = "current" | "stale" | "degraded" | "unavailable" | "mock" | "uploaded";

const STALE_THRESHOLD_MS = 5 * 60_000;

function deriveState(h: Health): SourceState {
  if (h.upload) return "uploaded";
  if (h.source === "mock") return "mock";
  if (!h.lastRefreshedAt && h.lastError) return "unavailable";
  if (h.lastError) return "degraded";
  if (h.lastRefreshedAt) {
    const age = Date.now() - new Date(h.lastRefreshedAt).getTime();
    if (age > STALE_THRESHOLD_MS) return "stale";
  }
  return "current";
}

const LABEL: Record<SourceState, string> = {
  current: "Current",
  stale: "Stale",
  degraded: "Degraded",
  unavailable: "Unavailable",
  mock: "Mock",
  uploaded: "Uploaded",
};

const TOOLTIP: Record<SourceState, string> = {
  current: "Data is live and up to date",
  stale: "Data has not been refreshed in over 5 minutes",
  degraded: "Last refresh failed — showing last good data",
  unavailable: "Cannot reach the data source",
  mock: "Using generated mock data",
  uploaded: "Using a manually uploaded workbook",
};

export function SourceStatus({ health }: { health: Health }) {
  const state = deriveState(health);
  return (
    <span className={`source-status source-status-${state}`} title={TOOLTIP[state]}>
      <span className="source-status-dot" />
      {LABEL[state]}
    </span>
  );
}
