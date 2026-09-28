import cors from "cors";
import express from "express";
import type { TicketStore } from "./lib/store";
import { ticketRoutes, type RouteOptions } from "./routes/tickets";

export function createApp(store: TicketStore, opts: RouteOptions = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
  app.use(express.json());
  app.use("/api", ticketRoutes(store, opts));
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  return app;
}
