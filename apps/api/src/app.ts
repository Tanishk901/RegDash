import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import type { TicketStore } from "./lib/store";
import { MAX_UPLOAD_MB } from "./lib/upload";
import { ticketRoutes, type RouteOptions } from "./routes/tickets";

export function createApp(store: TicketStore, opts: RouteOptions = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
  app.use(express.json());
  app.use("/api", ticketRoutes(store, opts));
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
