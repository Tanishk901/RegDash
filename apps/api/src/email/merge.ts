import type { TicketView } from "@regdash/shared";

export interface MergeField {
  key: string;
  label: string;
  sample: string;
}

export const MERGE_FIELDS: MergeField[] = [
  { key: "ticket", label: "Ticket number", sample: "INC0012345" },
  { key: "short_description", label: "Short description", sample: "Unable to access RegCreate" },
  { key: "priority", label: "Priority", sample: "P2" },
  { key: "status", label: "Status", sample: "IN_PROGRESS" },
  { key: "assignee", label: "Assignee", sample: "John Smith" },
  { key: "requester", label: "Requester", sample: "Jane Doe" },
  { key: "sla_state", label: "SLA state", sample: "AT_RISK" },
  { key: "sla_due", label: "SLA due", sample: "2026-11-21T09:00:00Z" },
  { key: "application", label: "Application", sample: "REGCREATE" },
  { key: "environment", label: "Environment", sample: "PROD" },
  { key: "age_hours", label: "Ticket age (hours)", sample: "48" },
  { key: "next_action", label: "Next action", sample: "Waiting for user confirmation" },
  { key: "blocker", label: "Blocker", sample: "Pending vendor patch" },
];

export function mergeTemplate(template: string, ticket: TicketView): string {
  const values: Record<string, string> = {
    ticket: ticket.number,
    short_description: ticket.shortDescription,
    priority: ticket.priority,
    status: ticket.status,
    assignee: ticket.assignedTo ?? "Unassigned",
    requester: ticket.requestedBy ?? "Unknown",
    sla_state: ticket.sla,
    sla_due: ticket.slaDueAt ?? "N/A",
    application: ticket.application ?? "N/A",
    environment: ticket.environment ?? "N/A",
    age_hours: String(Math.round(ticket.ageHours)),
    next_action: ticket.nextAction ?? "N/A",
    blocker: ticket.blocker ?? "None",
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}

export function mergeWithSample(template: string): string {
  const sampleMap: Record<string, string> = {};
  for (const f of MERGE_FIELDS) sampleMap[f.key] = f.sample;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => sampleMap[key] ?? match);
}
