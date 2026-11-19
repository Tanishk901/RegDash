import { describe, expect, it } from "vitest";
import { ServiceNowSource } from "./servicenow";

const f = (value: string, display_value = value) => ({ value, display_value });

const incident = {
  sys_id: f("inc-sys-001"),
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

const ritm = {
  sys_id: f("ritm-sys-002"),
  number: f("RITM0004567"),
  short_description: f("New access request"),
  state: f("2", "In Progress"),
  priority: f("3", "3 - Moderate"),
  assigned_to: f("xyz", "Amit Sharma"),
  assignment_group: f("ghi", "RegCreate Support"),
  requested_for: f("jkl", "M. Chen"),
  opened_at: f("2026-10-01 10:00:00", "01-10-2026 15:30:00"),
  sys_updated_on: f("2026-10-02 08:00:00", "02-10-2026 13:30:00"),
  comments_and_work_notes: f("", ""),
};

interface FetchCall { method: string; url: string; body?: unknown }

function createTestSource(opts?: { patchStatus?: number; teamMembers?: string[] }) {
  const calls: FetchCall[] = [];
  const fakeFetch = (async (url: URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: url.toString(), body });
    if (method !== "GET") {
      const status = opts?.patchStatus ?? 200;
      if (status >= 400) return new Response("error", { status, statusText: "Error" });
      return new Response(JSON.stringify({ result: {} }), { status: 200 });
    }
    if (url.pathname.endsWith("/incident")) return new Response(JSON.stringify({ result: [incident] }), { status: 200 });
    if (url.pathname.endsWith("/sc_req_item")) return new Response(JSON.stringify({ result: [ritm] }), { status: 200 });
    return new Response(JSON.stringify({ result: [] }), { status: 200 });
  }) as unknown as typeof fetch;

  const src = new ServiceNowSource({
    baseUrl: "https://example.service-now.com",
    username: "u",
    password: "p",
    teamMembers: opts?.teamMembers,
    fetchImpl: fakeFetch,
  });
  return { src, calls };
}

async function sourceWithIndex(opts?: Parameters<typeof createTestSource>[0]) {
  const ctx = createTestSource(opts);
  await ctx.src.fetchTickets();
  ctx.calls.length = 0; // clear fetch calls so write tests only see PATCH calls
  return ctx;
}

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

  it("populates recordIndex from fetchTickets", async () => {
    const { src, calls } = createTestSource();
    await src.fetchTickets();
    // Both records fetched — index should allow write lookups
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(3); // incident + sc_req_item + task_sla
    // Verify by attempting a write that requires the index
    await src.addComment("INC0012345", "test", "admin");
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toContain("/incident/inc-sys-001");
  });

  describe("addComment", () => {
    it("PATCHes work_notes by default", async () => {
      const { src, calls } = await sourceWithIndex();
      await src.addComment("INC0012345", "Looking into this", "admin");
      expect(calls).toHaveLength(1);
      expect(calls[0]!.method).toBe("PATCH");
      expect(calls[0]!.url).toContain("/api/now/table/incident/inc-sys-001");
      expect(calls[0]!.body).toEqual({ work_notes: "Looking into this" });
    });

    it("PATCHes work_notes for work_note kind", async () => {
      const { src, calls } = await sourceWithIndex();
      await src.addComment("RITM0004567", "Internal note", "admin", "work_note");
      expect(calls[0]!.url).toContain("/api/now/table/sc_req_item/ritm-sys-002");
      expect(calls[0]!.body).toEqual({ work_notes: "Internal note" });
    });

    it("PATCHes comments for customer_comment kind", async () => {
      const { src, calls } = await sourceWithIndex();
      await src.addComment("INC0012345", "Update for the customer", "admin", "customer_comment");
      expect(calls[0]!.body).toEqual({ comments: "Update for the customer" });
    });
  });

  describe("updateAssignment", () => {
    it("PATCHes assigned_to with display value input", async () => {
      const { src, calls } = await sourceWithIndex();
      await src.updateAssignment("INC0012345", "Amit Sharma");
      expect(calls[0]!.method).toBe("PATCH");
      expect(calls[0]!.url).toContain("/incident/inc-sys-001");
      expect(calls[0]!.url).toContain("sysparm_input_display_value=true");
      expect(calls[0]!.body).toEqual({ assigned_to: "Amit Sharma" });
    });

    it("clears assignment with empty string when null", async () => {
      const { src, calls } = await sourceWithIndex();
      await src.updateAssignment("RITM0004567", null);
      expect(calls[0]!.body).toEqual({ assigned_to: "" });
    });
  });

  describe("updateStatus", () => {
    it("maps TicketStatus to incident state number", async () => {
      const { src, calls } = await sourceWithIndex();
      await src.updateStatus("INC0012345", "IN_PROGRESS", "admin");
      expect(calls[0]!.body).toEqual({ state: "2" });
    });

    it("maps TicketStatus to sc_req_item state number", async () => {
      const { src, calls } = await sourceWithIndex();
      await src.updateStatus("RITM0004567", "RESOLVED", "admin");
      expect(calls[0]!.url).toContain("/sc_req_item/ritm-sys-002");
      expect(calls[0]!.body).toEqual({ state: "4" });
    });
  });

  describe("write error handling", () => {
    it("throws when ticket not in index", async () => {
      const { src } = await sourceWithIndex();
      await expect(src.addComment("INC9999999", "test", "admin")).rejects.toThrow(/not found in ServiceNow record index/);
    });

    it("throws on PATCH 403", async () => {
      const { src } = await sourceWithIndex({ patchStatus: 403 });
      await expect(src.addComment("INC0012345", "test", "admin")).rejects.toThrow(/HTTP 403/);
    });

    it("throws on PATCH 404", async () => {
      const { src } = await sourceWithIndex({ patchStatus: 404 });
      await expect(src.updateAssignment("INC0012345", "someone")).rejects.toThrow(/HTTP 404/);
    });

    it("throws on PATCH 500", async () => {
      const { src } = await sourceWithIndex({ patchStatus: 500 });
      await expect(src.updateStatus("INC0012345", "RESOLVED", "admin")).rejects.toThrow(/HTTP 500/);
    });
  });

  describe("teamMembers", () => {
    it("returns empty array when not configured", () => {
      const { src } = createTestSource();
      expect(src.teamMembers()).toEqual([]);
    });

    it("returns configured team members", () => {
      const { src } = createTestSource({ teamMembers: ["Priya Nair", "Amit Sharma"] });
      expect(src.teamMembers()).toEqual(["Priya Nair", "Amit Sharma"]);
    });
  });
});
