import { describe, expect, it } from "vitest";
import { mergeTemplate, mergeWithSample } from "./merge";
import type { TicketView } from "@regdash/shared";

const MOCK_TICKET: TicketView = {
  number: "INC0012345",
  type: "INCIDENT",
  shortDescription: "Cannot access RegCreate",
  status: "IN_PROGRESS",
  priority: "P2",
  assignedTo: "John Smith",
  assignmentGroup: "Support",
  pendingOwner: null,
  blocker: null,
  nextAction: "Waiting for user confirmation",
  requestedBy: "Jane Doe",
  createdAt: "2026-11-18T09:00:00Z",
  updatedAt: "2026-11-19T15:00:00Z",
  pendingSince: null,
  slaDueAt: "2026-11-21T09:00:00Z",
  taskHours: null,
  itemCount: null,
  updates: [],
  source: "mock",
  application: "REGCREATE",
  environment: "PROD",
  configurationItem: null,
  serviceOffering: null,
  ageHours: 48,
  hoursSinceUpdate: 12,
  sla: "AT_RISK",
  responseSla: null,
  resolutionSla: null,
  stale: false,
  pendingHours: null,
  estimatedHours: null,
};

describe("merge", () => {
  it("replaces ticket merge fields", () => {
    const result = mergeTemplate("Ticket {{ticket}} is {{priority}}", MOCK_TICKET);
    expect(result).toBe("Ticket INC0012345 is P2");
  });

  it("replaces assignee and requester", () => {
    const result = mergeTemplate("Assigned to {{assignee}}, requested by {{requester}}", MOCK_TICKET);
    expect(result).toBe("Assigned to John Smith, requested by Jane Doe");
  });

  it("leaves unknown fields untouched", () => {
    const result = mergeTemplate("Hello {{unknown_field}}", MOCK_TICKET);
    expect(result).toBe("Hello {{unknown_field}}");
  });

  it("handles null fields with fallback", () => {
    const ticket = { ...MOCK_TICKET, assignedTo: null };
    const result = mergeTemplate("{{assignee}}", ticket);
    expect(result).toBe("Unassigned");
  });

  it("mergeWithSample replaces all known fields with samples", () => {
    const result = mergeWithSample("{{ticket}} - {{priority}} - {{assignee}}");
    expect(result).toContain("INC0012345");
    expect(result).toContain("P2");
    expect(result).toContain("John Smith");
  });
});
