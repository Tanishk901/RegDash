import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { TicketStore } from "./lib/store";
import { MockSource } from "./sources/mock";

const store = new TicketStore(new MockSource());
const app = createApp(store);

beforeAll(async () => {
  await store.refresh();
});

describe("API", () => {
  it("health reports the source", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, source: "mock" });
    expect(res.body.tickets).toBeGreaterThan(0);
  });

  it("lists only open tickets by default, most urgent first", async () => {
    const res = await request(app).get("/api/tickets");
    expect(res.status).toBe(200);
    const statuses = new Set(res.body.items.map((t: { status: string }) => t.status));
    expect([...statuses].every((s) => ["NEW", "IN_PROGRESS", "ON_HOLD"].includes(s as string))).toBe(true);
    const slas = res.body.items.map((t: { sla: string }) => t.sla);
    const rank = { BREACHED: 0, AT_RISK: 1, OK: 2, PAUSED: 3 } as const;
    for (let i = 1; i < slas.length; i++) expect(rank[slas[i] as keyof typeof rank]).toBeGreaterThanOrEqual(rank[slas[i - 1] as keyof typeof rank]);
  });

  it("never counts on-hold tickets as breached or at risk", async () => {
    const res = await request(app).get("/api/tickets?status=ON_HOLD");
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const t of res.body.items) expect(t.sla).toBe("PAUSED");
  });

  it("filters by type and priority", async () => {
    const res = await request(app).get("/api/tickets?type=INCIDENT&priority=P1,P2");
    for (const t of res.body.items) {
      expect(t.type).toBe("INCIDENT");
      expect(["P1", "P2"]).toContain(t.priority);
    }
  });

  it("rejects bad filters with 400", async () => {
    const res = await request(app).get("/api/tickets?priority=P9");
    expect(res.status).toBe(400);
  });

  it("returns ticket detail and 404s unknown", async () => {
    const first = store.all()[0]!;
    const ok = await request(app).get(`/api/tickets/${first.number.toLowerCase()}`);
    expect(ok.status).toBe(200);
    expect(ok.body.number).toBe(first.number);
    const missing = await request(app).get("/api/tickets/INC999");
    expect(missing.status).toBe(404);
  });

  it("summary counts add up", async () => {
    const res = await request(app).get("/api/summary");
    const s = res.body;
    expect(s.incidentsOpen + s.srsOpen).toBe(s.totalOpen);
    const byP = Object.values(s.byPriority as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(byP).toBe(s.totalOpen);
  });

  it("workload per owner adds up to the open total", async () => {
    const s = (await request(app).get("/api/summary")).body;
    const sum = s.byOwner.reduce((a: number, w: { count: number }) => a + w.count, 0);
    expect(sum).toBe(s.totalOpen);
    for (const w of s.byOwner) {
      const byP = Object.values(w.byPriority as Record<string, number>).reduce((a, b) => a + b, 0);
      expect(byP).toBe(w.count);
    }
  });

  it("exports the filtered list as CSV", async () => {
    const json = await request(app).get("/api/tickets?type=SR");
    const res = await request(app).get("/api/tickets.csv?type=SR");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="regdash-tickets-.*\.csv"/);
    const lines = res.text.trim().split("\r\n");
    expect(lines[0]).toContain("Number,Type,Summary");
    expect(lines).toHaveLength(json.body.total + 1);
  });

  it("guards CSV cells against formula injection", async () => {
    const { ticketsToCsv } = await import("./lib/csv");
    const t = { ...(await request(app).get("/api/tickets")).body.items[0], shortDescription: "=HYPERLINK(\"x\")" };
    expect(ticketsToCsv([t])).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it("exposes the ServiceNow URL for links only when configured", async () => {
    expect((await request(app).get("/api/health")).body.servicenowUrl).toBeNull();
    const withSn = createApp(store, { servicenowUrl: "https://example.service-now.com" });
    expect((await request(withSn).get("/api/health")).body.servicenowUrl).toBe("https://example.service-now.com");
  });

  it("keeps serving last good data when a refresh fails", async () => {
    let calls = 0;
    const flaky = new TicketStore({
      name: "excel",
      async fetchTickets() {
        if (calls++ === 0) return new MockSource().fetchTickets();
        throw new Error("file locked");
      },
    });
    await flaky.refresh();
    const count = flaky.all().length;
    await flaky.refresh();
    expect(flaky.all().length).toBe(count);
    expect(flaky.lastError).toBe("file locked");
  });
});
