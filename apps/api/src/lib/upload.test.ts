import ExcelJS from "exceljs";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { MockSource } from "../sources/mock";
import type { SourceResult } from "../sources/TicketSource";
import { TicketStore } from "./store";
import { MAX_UPLOAD_MB, TrackerUpload, XLSX_MIME } from "./upload";

async function workbook(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Tickets");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const GOOD_ROWS = [
  ["Number", "Short Description", "Status", "Created"],
  ["INC0000101", "Login fails", "In Progress", "25/09/2026"],
  ["RITM0000202", "New access", "New", "25/09/2026"],
  ["INC0000103", "bad status", "Banana", "25/09/2026"],
];

describe("uploading a tracker", () => {
  let filePath: string;
  let store: TicketStore;
  let configured: MockSource;
  let upload: TrackerUpload;
  let app: ReturnType<typeof createApp>;
  let mockCount: number;

  const post = (body: Buffer, fileName = "Tracker.xlsx", type = XLSX_MIME) =>
    request(app)
      .post(`/api/upload?fileName=${encodeURIComponent(fileName)}`)
      .set("Content-Type", type)
      .send(body);
  const newUpload = (s: TicketStore) =>
    new TrackerUpload(s, configured, { filePath, sheetName: "Tickets", timeUnit: "hours" });

  beforeEach(async () => {
    filePath = path.join(mkdtempSync(path.join(tmpdir(), "regdash-upload-")), "nested", "uploaded.xlsx");
    configured = new MockSource();
    store = new TicketStore(configured);
    await store.refresh();
    mockCount = store.all().length;
    upload = newUpload(store);
    app = createApp(store, { upload });
  });

  it("makes a good file the live source and reports rejected rows", async () => {
    const res = await post(await workbook(GOOD_ROWS));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fileName: "Tracker.xlsx", tickets: 2, rejected: 1, lastError: null });

    const health = (await request(app).get("/api/health")).body;
    expect(health).toMatchObject({ source: "excel", tickets: 2, upload: { fileName: "Tracker.xlsx" } });
    expect(health.rejectedRows).toEqual([{ row: "row 4", reason: 'unknown status "Banana"' }]);
    expect(health.reading.typedBy).toEqual({ column: 0, number: 2, sheet: 0 });
    expect((await request(app).get("/api/tickets/INC0000101")).status).toBe(200);
  });

  it("keeps showing the upload when a later refresh runs", async () => {
    await post(await workbook(GOOD_ROWS));
    await request(app).post("/api/refresh");
    expect(store.all().map((t) => t.number)).toEqual(["INC0000101", "RITM0000202"]);
  });

  it("replaces an earlier upload and leaves no temp files", async () => {
    await post(await workbook(GOOD_ROWS));
    const res = await post(await workbook(GOOD_ROWS.slice(0, 2)), "Newer.xlsx");
    expect(res.body).toMatchObject({ fileName: "Newer.xlsx", tickets: 1, rejected: 0 });
    expect(upload.current()?.fileName).toBe("Newer.xlsx");
    expect(readdirSync(path.dirname(filePath)).sort()).toEqual(["uploaded.xlsx", "uploaded.xlsx.json"]);
  });

  it("restores the upload after an API restart", async () => {
    const { body } = await post(await workbook(GOOD_ROWS));

    const restarted = new TicketStore(configured);
    const again = newUpload(restarted);
    await again.restore();
    await restarted.refresh();

    expect(restarted.source.name).toBe("excel");
    expect(restarted.all()).toHaveLength(2);
    expect(again.current()).toEqual({ fileName: "Tracker.xlsx", uploadedAt: body.uploadedAt });
  });

  it("starts on the configured source when nothing was uploaded", async () => {
    const fresh = new TicketStore(configured);
    const u = newUpload(fresh);
    await u.restore();
    expect(fresh.source).toBe(configured);
    expect(u.current()).toBeNull();
  });

  it("goes back to the configured source and deletes the copy on remove", async () => {
    await post(await workbook(GOOD_ROWS));
    expect(existsSync(filePath)).toBe(true);

    const res = await request(app).delete("/api/upload");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: "mock", tickets: mockCount });
    expect((await request(app).get("/api/health")).body.reading).toBeNull();
    expect(upload.current()).toBeNull();
    expect(existsSync(filePath)).toBe(false);
    expect(existsSync(`${filePath}.json`)).toBe(false);
  });

  describe("refuses and keeps the current data for", () => {
    const refused = async (res: request.Response, status: number, message: RegExp) => {
      expect(res.status).toBe(status);
      expect(res.body.error).toMatch(message);
      expect(store.source).toBe(configured);
      expect(store.all()).toHaveLength(mockCount);
      expect(upload.current()).toBeNull();
      expect(existsSync(filePath)).toBe(false);
      const dir = path.dirname(filePath);
      expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
    };

    it("a file that isn't .xlsx by name", async () => {
      await refused(await post(await workbook(GOOD_ROWS), "Tracker.xls"), 422, /not an \.xlsx file/);
    });

    it("an old or encrypted workbook", async () => {
      const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      await refused(await post(ole), 422, /password-protected/);
    });

    it("a corrupt zip", async () => {
      await refused(await post(Buffer.from("PK this is not really a zip")), 422, /Couldn't read "Tracker\.xlsx"/);
    });

    it("a sheet missing a required column", async () => {
      await refused(await post(await workbook([["Summary"], ["x"]])), 422, /no column for "number"/);
    });

    it("a sheet with headers but no rows", async () => {
      await refused(await post(await workbook(GOOD_ROWS.slice(0, 1))), 422, /No usable tickets/);
    });

    it("a sheet where every row is rejected, saying why", async () => {
      const rows = [GOOD_ROWS[0]!, GOOD_ROWS[3]!];
      await refused(await post(await workbook(rows)), 422, /1 row\(s\) rejected, first: row 2: unknown status "Banana"/);
    });

    it("a simple content type, which other websites could send without a CORS preflight", async () => {
      await refused(await post(await workbook(GOOD_ROWS), "Tracker.xlsx", "text/plain"), 415, /Send the workbook/);
    });

    it("a missing file name", async () => {
      const res = await request(app).post("/api/upload").set("Content-Type", XLSX_MIME).send(await workbook(GOOD_ROWS));
      await refused(res, 400, /fileName/);
    });

    it("a file over the size limit", async () => {
      await refused(await post(Buffer.alloc(MAX_UPLOAD_MB * 1024 * 1024 + 1)), 413, /too big/);
    });
  });

  it("doesn't echo a server path when the workbook has no sheets", async () => {
    const empty = await new ExcelJS.Workbook().xlsx.writeBuffer();
    const res = await post(Buffer.from(empty));
    expect(res.status).toBe(422);
    expect(res.body.error).not.toContain(path.dirname(filePath));
  });

  it("has no upload routes unless enabled, and health says so", async () => {
    const plain = createApp(store);
    expect((await request(plain).delete("/api/upload")).status).toBe(404);
    expect((await request(plain).get("/api/health")).body.upload).toBeNull();
  });
});

describe("TicketStore.useSource", () => {
  it("doesn't let a refresh from the old source overwrite the new one", async () => {
    let finishOld!: (r: SourceResult) => void;
    const slow = {
      name: "servicenow" as const,
      fetchTickets: () => new Promise<SourceResult>((resolve) => (finishOld = resolve)),
    };
    const store = new TicketStore(slow);
    const running = store.refresh();

    const next = new MockSource();
    const fetchNext = vi.spyOn(next, "fetchTickets");
    const swapped = store.useSource(next);
    finishOld({ tickets: [], rejected: [] });
    await Promise.all([running, swapped]);

    expect(fetchNext).toHaveBeenCalledOnce();
    expect(store.source).toBe(next);
    expect(store.all().length).toBeGreaterThan(0);
  });
});
