/**
 * Read-only ServiceNow connection check. Run on the work machine before
 * switching DATA_SOURCE=servicenow:
 *
 *   pnpm sn:check
 *
 * Makes one small GET per table (max 5 records) and reports: can we log in,
 * can we read the table, how many tickets match the assignment group, which
 * of the fields RegDash expects are missing, and any state/priority values
 * RegDash doesn't understand yet. Prints no credentials and no ticket content.
 */
import { loadConfig } from "../src/config";
import { normalizePriority, normalizeStatus } from "../src/lib/normalize";
import { FIELDS, mapRecord, type SnRecord } from "../src/sources/servicenow";

const cfg = loadConfig();
const { SERVICENOW_BASE_URL: base, SERVICENOW_USERNAME: user, SERVICENOW_PASSWORD: pass } = cfg;
if (!base || !user || !pass) {
  console.error("Set SERVICENOW_BASE_URL, SERVICENOW_USERNAME and SERVICENOW_PASSWORD in apps/api/.env first.");
  process.exit(1);
}

const auth = Buffer.from(`${user}:${pass}`).toString("base64");
const group = cfg.SERVICENOW_ASSIGNMENT_GROUP;
let problems = 0;
const fail = (msg: string) => {
  problems++;
  console.log(`  ✗ ${msg}`);
};

console.log(`ServiceNow: ${new URL(base).host}`);
console.log(`Assignment group filter: ${group ?? "(none — all groups)"}\n`);

for (const [table, type] of [["incident", "INCIDENT"], ["sc_req_item", "SR"]] as const) {
  console.log(`[${table}]`);
  const query = ["active=true", ...(group ? [`assignment_group.name=${group}`] : [])].join("^");
  const url = new URL(`/api/now/table/${table}`, base);
  url.searchParams.set("sysparm_query", query);
  url.searchParams.set("sysparm_fields", FIELDS);
  url.searchParams.set("sysparm_display_value", "all");
  url.searchParams.set("sysparm_exclude_reference_link", "true");
  url.searchParams.set("sysparm_limit", "5");

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    fail(`Could not reach the instance: ${err instanceof Error ? err.message : err}. On the company network / VPN?`);
    continue;
  }

  if (res.status === 401) {
    fail("401 Unauthorized. Wrong username/password, or this account signs in through SSO and can't use Basic auth (ask for an integration/API account).");
    continue;
  }
  if (res.status === 403) {
    fail(`403 Forbidden. Logged in, but this account can't read ${table}. It needs read access to the table.`);
    continue;
  }
  if (!res.ok) {
    fail(`HTTP ${res.status} ${res.statusText}`);
    continue;
  }
  if (!res.headers.get("content-type")?.includes("json")) {
    fail("Got a web page instead of JSON. Usually an SSO/login redirect: this account can't use the REST API with a password.");
    continue;
  }

  const body = (await res.json()) as { result: SnRecord[] };
  const total = res.headers.get("x-total-count");
  console.log(`  ✓ Logged in and can read the table`);
  console.log(`  ✓ Open tickets matching the filter: ${total ?? body.result.length}`);
  if (!body.result.length) {
    fail(group ? `No open tickets. Is "${group}" the exact assignment group name?` : "No open tickets returned.");
    continue;
  }

  const seen = new Set(body.result.flatMap((r) => Object.keys(r)));
  const missing = FIELDS.split(",").filter((f) => !seen.has(f));
  if (missing.length) fail(`Fields not returned (not on this table, or no read access): ${missing.join(", ")}`);
  else console.log(`  ✓ All ${FIELDS.split(",").length} expected fields present`);

  const states = new Set(body.result.map((r) => r.state?.display_value ?? ""));
  const prios = new Set(body.result.map((r) => r.priority?.display_value ?? ""));
  const badStates = [...states].filter((s) => !normalizeStatus(s));
  const badPrios = [...prios].filter((p) => !normalizePriority(p));
  console.log(`  · States seen: ${[...states].join(" | ")}`);
  console.log(`  · Priorities seen: ${[...prios].join(" | ")}`);
  if (badStates.length) fail(`RegDash doesn't recognise state(s): ${badStates.join(", ")}`);
  if (badPrios.length) fail(`RegDash doesn't recognise priority value(s): ${badPrios.join(", ")} (would default to P3)`);

  const rejected = body.result.map((r) => mapRecord(r, type).reason).filter(Boolean);
  if (rejected.length) fail(`Sample records RegDash can't read: ${rejected.join("; ")}`);
  console.log();
}

console.log(problems ? `\n${problems} problem(s) found. Fix these before DATA_SOURCE=servicenow.` : "\nAll good. Set DATA_SOURCE=servicenow and restart the API.");
process.exit(problems ? 1 : 0);
