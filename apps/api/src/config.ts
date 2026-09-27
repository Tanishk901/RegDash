import { z } from "zod";

const Env = z.object({
  DATA_SOURCE: z.enum(["mock", "excel", "servicenow"]).default("mock"),
  PORT: z.coerce.number().int().positive().default(4000),
  REFRESH_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(300),

  EXCEL_PATH: z.string().default("../../data/sample-tickets.xlsx"),
  EXCEL_SHEET: z.string().default("Tickets"),

  SERVICENOW_BASE_URL: z.string().optional(),
  SERVICENOW_USERNAME: z.string().optional(),
  SERVICENOW_PASSWORD: z.string().optional(),
  SERVICENOW_ASSIGNMENT_GROUP: z.string().optional(),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Treat empty strings in .env as "not set".
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ""),
  );
  const parsed = Env.safeParse(cleaned);
  if (!parsed.success) {
    console.error("Invalid configuration:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
