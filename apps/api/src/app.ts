import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import type { TicketStore } from "./lib/store";
import type { ViewStore } from "./lib/view-store";
import { MAX_UPLOAD_MB } from "./lib/upload";
import { ticketRoutes, type RouteOptions } from "./routes/tickets";
import { viewRoutes } from "./routes/views";
import { knowledgeRoutes, type KnowledgeRouteOptions } from "./routes/knowledge";
import { suggestionsRoutes, type SuggestionsRouteOptions } from "./routes/suggestions";
import { triageRoutes, type TriageRouteOptions } from "./routes/triage";
import { templateRoutes } from "./routes/templates";
import type { TemplateStore } from "./email/TemplateStore";
import type { EmailService } from "./email/EmailService";
import type { EmailLogStore } from "./email/EmailLogStore";
import { emailRoutes, type EmailRouteOptions } from "./routes/emails";
import { automationRoutes, type AutomationRouteOptions } from "./routes/automation";
import { ingestionRoutes, type IngestionRouteOptions } from "./routes/ingestion";

export function createApp(store: TicketStore, opts: RouteOptions & { viewStore?: ViewStore; copilot?: KnowledgeRouteOptions; suggestions?: SuggestionsRouteOptions; triage?: TriageRouteOptions; triageStore?: RouteOptions["triageStore"]; templateStore?: TemplateStore; emailService?: EmailService; emailLog?: EmailLogStore; automation?: AutomationRouteOptions["automation"]; ingestion?: IngestionRouteOptions } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
  app.use(express.json());
  app.use("/api", ticketRoutes(store, opts));
  if (opts.viewStore) app.use("/api/views", viewRoutes(opts.viewStore));
  if (opts.copilot) app.use("/api/knowledge", knowledgeRoutes(opts.copilot));
  if (opts.suggestions) app.use("/api/tickets", suggestionsRoutes(opts.suggestions));
  if (opts.triage) app.use("/api/triage", triageRoutes(opts.triage));
  if (opts.templateStore) app.use("/api/templates", templateRoutes(opts.templateStore));
  if (opts.emailService && opts.emailLog && opts.templateStore) {
    app.use("/api/emails", emailRoutes({
      emailService: opts.emailService,
      emailLog: opts.emailLog,
      templateStore: opts.templateStore,
      ticketStore: store,
    }));
  }
  if (opts.automation) {
    app.use("/api/automation", automationRoutes({ automation: opts.automation, ticketStore: store }));
  }
  if (opts.ingestion) {
    app.use("/api/ingestion", ingestionRoutes(opts.ingestion));
  }
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  // Express recognises an error handler by its four arguments, so _next has to stay.
  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === "entity.too.large") {
      return res.status(413).json({ error: `That file is too big. The limit is ${MAX_UPLOAD_MB} MB.` });
    }
    const status = err.status ?? 500;
    if (status >= 500) console.error("[api]", err);
    res.status(status).json({ error: status >= 500 ? "Internal server error" : err.message });
  });
  return app;
}
