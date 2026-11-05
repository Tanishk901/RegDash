import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ExcelSource } from "../sources/excel";
import type { TicketSource } from "../sources/TicketSource";
import type { DurationUnit } from "./normalize";
import type { TicketStore } from "./store";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const MAX_UPLOAD_MB = 25;

/** A problem with the uploaded file itself; the message is written for the person who picked it. */
export class UploadError extends Error {}

export interface UploadInfo {
  fileName: string;
  uploadedAt: string; // ISO
}

/**
 * A tracker workbook uploaded from the dashboard. While one is active it replaces
 * the configured source; removing it goes back. The copy lives at `filePath`
 * (git-ignored, under data/) so it survives an API restart, and the configured
 * EXCEL_PATH file is never touched.
 */
export class TrackerUpload {
  private info: UploadInfo | null = null;

  constructor(
    private store: TicketStore,
    private configured: TicketSource,
    private opts: { filePath: string; sheetName: string; timeUnit: DurationUnit },
  ) {}

  current(): UploadInfo | null {
    return this.info;
  }

  private get filePath() {
    return path.resolve(this.opts.filePath);
  }

  private get infoPath() {
    return `${this.filePath}.json`;
  }

  private sourceFor(file: string): ExcelSource {
    return new ExcelSource(file, this.opts.sheetName, this.opts.timeUnit);
  }

  /** On startup, picks up the upload left by the previous run, if any. */
  async restore(): Promise<void> {
    const saved = await stat(this.filePath).catch(() => null);
    if (!saved) return;
    const info = await readFile(this.infoPath, "utf8").then(JSON.parse).catch(() => null);
    this.info = info ?? { fileName: path.basename(this.filePath), uploadedAt: saved.mtime.toISOString() };
    this.store.source = this.sourceFor(this.filePath);
  }

  /** Validates the file, then makes it the live source. A bad file changes nothing. */
  async save(content: Buffer, fileName: string): Promise<UploadInfo> {
    if (!/\.xlsx$/i.test(fileName)) {
      throw new UploadError(`"${fileName}" is not an .xlsx file. Save it as Excel Workbook (.xlsx) and try again.`);
    }
    // Every .xlsx is a zip. Old .xls files and encrypted or sensitivity-labelled workbooks are not.
    if (content.subarray(0, 2).toString("latin1") !== "PK") {
      throw new UploadError(
        `"${fileName}" can't be read as an .xlsx file. If it's password-protected or has an encrypting sensitivity label, save an unprotected copy on this machine and upload that.`,
      );
    }

    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, content);
      await this.validate(tmp, fileName);
      // A refresh mid-read would hold the file open, which blocks the rename on Windows.
      await this.store.idle();
      await rename(tmp, this.filePath);
    } finally {
      await rm(tmp, { force: true });
    }

    const info = { fileName, uploadedAt: new Date().toISOString() };
    await writeFile(this.infoPath, JSON.stringify(info));
    this.info = info;
    await this.store.useSource(this.sourceFor(this.filePath));
    return info;
  }

  /** Deletes the upload and goes back to the configured source. */
  async remove(): Promise<void> {
    this.info = null;
    await this.store.useSource(this.configured);
    await rm(this.filePath, { force: true });
    await rm(this.infoPath, { force: true });
  }

  private async validate(file: string, fileName: string): Promise<void> {
    let result;
    try {
      result = await this.sourceFor(file).fetchTickets();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new UploadError(`Couldn't read "${fileName}": ${message.replaceAll(file, fileName)}`);
    }
    // Loading this would blank the dashboard, and it's almost certainly the wrong file or sheet.
    if (result.tickets.length === 0) {
      const first = result.rejected[0];
      throw new UploadError(
        `No usable tickets in "${fileName}"` +
          (first ? ` (${result.rejected.length} row(s) rejected, first: ${first.row}: ${first.reason}).` : "."),
      );
    }
  }
}
