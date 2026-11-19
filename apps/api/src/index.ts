import { createApp } from "./app";
import { loadConfig } from "./config";
import { TicketStore } from "./lib/store";
import { TrackerUpload } from "./lib/upload";
import { ViewStore } from "./lib/view-store";
import { createSource } from "./sources";
import { MockLlmProvider, MockEmbeddingProvider, InMemoryKnowledgeStore, KnowledgeIndexer } from "./copilot";
import { FeedbackStore } from "./copilot/FeedbackStore";
import { TriageEngine } from "./copilot/TriageEngine";
import { TriageStore } from "./copilot/TriageStore";

const cfg = loadConfig();
const configured = createSource(cfg);
const store = new TicketStore(configured);
const upload = new TrackerUpload(store, configured, {
  filePath: cfg.EXCEL_UPLOAD_PATH,
  sheetName: cfg.EXCEL_SHEET,
  timeUnit: cfg.EXCEL_TIME_UNIT,
});
const viewStore = new ViewStore(cfg.VIEWS_PATH);

const llm = new MockLlmProvider();
const embedding = new MockEmbeddingProvider();
const knowledgeStore = new InMemoryKnowledgeStore(cfg.KNOWLEDGE_PATH);
const indexer = new KnowledgeIndexer(embedding, knowledgeStore);
const feedbackStore = new FeedbackStore();
const triageStore = new TriageStore();

await upload.restore();
await viewStore.restore();
await knowledgeStore.restore();
await feedbackStore.restore();
await triageStore.restore();
await store.refresh();

const indexed = await indexer.indexAll(store.all());
console.log(`[copilot] Indexed ${indexed} knowledge chunks (llm=${llm.name}, embedding=${embedding.name})`);

store.startAutoRefresh(cfg.REFRESH_INTERVAL_SECONDS);

const triageEngine = new TriageEngine(embedding, knowledgeStore, store.teamMembers());
const copilot = { knowledgeStore, embedding, indexer, ticketStore: store };
const suggestions = { llm, embedding, knowledgeStore, feedbackStore, ticketStore: store };
const triage = { triageEngine, triageStore, ticketStore: store };
createApp(store, { servicenowUrl: cfg.SERVICENOW_BASE_URL, upload, viewStore, refreshIntervalSeconds: cfg.REFRESH_INTERVAL_SECONDS, copilot, suggestions, triage }).listen(cfg.PORT, () => {
  console.log(
    `RegDash API on http://localhost:${cfg.PORT}  source=${upload.current() ? "upload" : cfg.DATA_SOURCE}  tickets=${store.all().length}` +
      (store.lastError ? `  (last error: ${store.lastError})` : ""),
  );
});
