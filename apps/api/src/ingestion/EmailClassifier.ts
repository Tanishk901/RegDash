import type { IngestClassification } from "@regdash/shared";

export interface ClassificationResult {
  classification: IngestClassification;
  reason: string;
  draftType: "INCIDENT" | "SR";
  priority: "P1" | "P2" | "P3" | "P4";
}

const INCIDENT_KEYWORDS = [
  "down", "outage", "error", "crash", "broken", "not working", "unavailable",
  "failure", "failed", "critical", "urgent", "emergency", "incident",
  "production issue", "prod issue", "system down", "cannot access",
];

const ACCESS_KEYWORDS = [
  "access", "permission", "provision", "onboard", "new user", "add user",
  "role", "grant", "enable", "account creation", "request access",
];

const SR_KEYWORDS = [
  "request", "change", "update", "modify", "add", "remove", "configure",
  "setup", "install", "enhancement", "feature", "new requirement",
];

export function classifyEmail(subject: string, body: string): ClassificationResult {
  const text = `${subject} ${body}`.toLowerCase();

  const incidentScore = INCIDENT_KEYWORDS.filter((kw) => text.includes(kw)).length;
  const accessScore = ACCESS_KEYWORDS.filter((kw) => text.includes(kw)).length;
  const srScore = SR_KEYWORDS.filter((kw) => text.includes(kw)).length;

  if (incidentScore >= 2 || (incidentScore >= 1 && incidentScore > srScore && incidentScore > accessScore)) {
    const priority = text.includes("critical") || text.includes("urgent") || text.includes("production") || text.includes("outage")
      ? "P1" : text.includes("error") || text.includes("cannot access") ? "P2" : "P3";
    return {
      classification: "incident",
      reason: `Matched incident keywords: ${INCIDENT_KEYWORDS.filter((kw) => text.includes(kw)).join(", ")}`,
      draftType: "INCIDENT",
      priority,
    };
  }

  if (accessScore >= 2 || (accessScore >= 1 && accessScore > srScore)) {
    return {
      classification: "access_request",
      reason: `Matched access keywords: ${ACCESS_KEYWORDS.filter((kw) => text.includes(kw)).join(", ")}`,
      draftType: "SR",
      priority: "P3",
    };
  }

  if (srScore >= 1) {
    return {
      classification: "service_request",
      reason: `Matched SR keywords: ${SR_KEYWORDS.filter((kw) => text.includes(kw)).join(", ")}`,
      draftType: "SR",
      priority: "P3",
    };
  }

  return {
    classification: "general_inquiry",
    reason: "No strong keyword match; classified as general inquiry",
    draftType: "SR",
    priority: "P4",
  };
}
