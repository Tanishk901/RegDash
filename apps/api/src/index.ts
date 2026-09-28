import { createApp } from "./app";
import { loadConfig } from "./config";
import { TicketStore } from "./lib/store";
import { createSource } from "./sources";

const cfg = loadConfig();
const store = new TicketStore(createSource(cfg));

await store.refresh();
store.startAutoRefresh(cfg.REFRESH_INTERVAL_SECONDS);

createApp(store, { servicenowUrl: cfg.SERVICENOW_BASE_URL }).listen(cfg.PORT, () => {
  console.log(
    `RegDash API on http://localhost:${cfg.PORT}  source=${cfg.DATA_SOURCE}  tickets=${store.all().length}` +
      (store.lastError ? `  (last error: ${store.lastError})` : ""),
  );
});
