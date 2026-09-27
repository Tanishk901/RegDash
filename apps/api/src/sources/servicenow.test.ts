import { describe, expect, it } from "vitest";
import { ServiceNowSource } from "./servicenow";

const f = (value: string, display_value = value) => ({ value, display_value });

const incident = {
  number: f("INC0012345"),
  short_description: f("Upload fails"),
  state: f("3", "On Hold"),
  priority: f("2", "2 - High"),
  assigned_to: f("abc", "Priya Nair"),
  assignment_group: f("def", "RegCreate Support"),
  caller_id: f("ghi", "J. Thomas"),
  opened_at: f("2026-09-24 08:00:00", "24-09-2026 13:30:00"),
  sys_updated_on: f("2026-09-26 06:00:00", "26-09-2026 11:30:00"),
  hold_reason: f("4", "Awaiting Vendor"),
  comments_and_work_notes: f(
    "",
    "2026-09-26 06:00:00 - Priya Nair (Work notes)\nNext: chase vendor for ETA\nPending: Vendor\n\n" +
      "2026-09-24 09:00:00 - Priya Nair (Work notes)\nPicked up.",
  ),
};

describe("ServiceNowSource", () => {
  it("pages the Table API and maps records", async () => {
    const urls: string[] = [];
    const fakeFetch = (async (url: URL) => {
      urls.push(url.toString());
      const result = url.pathname.endsWith("/incident") ? [incident] : [];
      return new Response(JSON.stringify({ result }), { status: 200 });
    }) as unknown as typeof fetch;

    const src = new ServiceNowSource({
      baseUrl: "https://example.service-now.com",
      username: "u",
      password: "p",
      assignmentGroup: "RegCreate Support",
      fetchImpl: fakeFetch,
    });
    const { tickets, rejected } = await src.fetchTickets();

    expect(rejected).toEqual([]);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({
      number: "INC0012345",
      type: "INCIDENT",
      status: "ON_HOLD",
      priority: "P2",
      assignedTo: "Priya Nair",
      requestedBy: "J. Thomas",
      nextAction: "chase vendor for ETA",
      pendingOwner: "Vendor",
      blocker: "Awaiting Vendor",
      createdAt: "2026-09-24T08:00:00.000Z",
    });
    expect(tickets[0]!.updates.map((u) => u.note)).toEqual(["Picked up.", "Next: chase vendor for ETA\nPending: Vendor"]);
    expect(new URL(urls[0]!).searchParams.get("sysparm_query")).toBe("active=true^assignment_group.name=RegCreate Support");
  });

  it("surfaces HTTP errors", async () => {
    const fakeFetch = (async () => new Response("no", { status: 401, statusText: "Unauthorized" })) as unknown as typeof fetch;
    const src = new ServiceNowSource({ baseUrl: "https://x.service-now.com", username: "u", password: "p", fetchImpl: fakeFetch });
    await expect(src.fetchTickets()).rejects.toThrow(/HTTP 401/);
  });
});
