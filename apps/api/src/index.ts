import { createApp } from "./app";
import { loadConfig } from "./config";
import { TicketStore } from "./lib/store";
import { TrackerUpload } from "./lib/upload";
import { createSource } from "./sources";

const cfg = loadConfig();
const configured = createSource(cfg);
const store = new TicketStore(configured);
const upload = new TrackerUpload(store, configured, {
  filePath: cfg.EXCEL_UPLOAD_PATH,
  sheetName: cfg.EXCEL_SHEET,
  timeUnit: cfg.EXCEL_TIME_UNIT,
});

await upload.restore();
await store.refresh();
store.startAutoRefresh(cfg.REFRESH_INTERVAL_SECONDS);

createApp(store, { servicenowUrl: cfg.SERVICENOW_BASE_URL, upload }).listen(cfg.PORT, () => {
  console.log(
    `RegDash API on http://localhost:${cfg.PORT}  source=${upload.current() ? "upload" : cfg.DATA_SOURCE}  tickets=${store.all().length}` +
      (store.lastError ? `  (last error: ${store.lastError})` : ""),
  );
});
