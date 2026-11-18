import ExcelJS from "exceljs";
import { PRIORITIES, type DashboardSummary, type OwnerWorkload } from "@regdash/shared";

function cell(v: string | number | null): string {
  if (v == null) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function summaryCsv(s: DashboardSummary): string {
  const lines: string[] = [];
  const row = (label: string, value: string | number) => lines.push(`${cell(label)},${cell(value)}`);

  row("Metric", "Value");
  row("Total open", s.totalOpen);
  row("Incidents open", s.incidentsOpen);
  row("SRs open", s.srsOpen);
  for (const p of PRIORITIES) row(`Open ${p}`, s.byPriority[p]);
  row("SLA breached", s.slaBreached);
  row("SLA at risk", s.slaAtRisk);
  row("On hold", s.onHold);
  row("Stale (48h+)", s.stale);

  const apps = Object.entries(s.byApplication).filter(([, n]) => n > 0);
  if (apps.length) {
    lines.push("");
    row("Application", "Open");
    for (const [app, n] of apps) row(app, n);
  }

  const envs = Object.entries(s.byEnvironment).filter(([, n]) => n > 0);
  if (envs.length) {
    lines.push("");
    row("Environment", "Open");
    for (const [env, n] of envs) row(env, n);
  }

  if (s.byOwner.length) {
    lines.push("");
    lines.push(["Owner", "Open", ...PRIORITIES, "Breached", "At risk", "On hold", "Stale", "Actionable", "Est. effort (h)"].map(cell).join(","));
    for (const w of s.byOwner) {
      lines.push([
        w.owner, w.count, ...PRIORITIES.map((p) => w.byPriority[p]),
        w.breached, w.atRisk, w.onHold, w.stale, w.actionable, w.estimatedHours || "",
      ].map((v) => cell(v as string | number)).join(","));
    }
  }

  if (s.lastRefreshedAt) {
    lines.push("");
    row("Data as of", s.lastRefreshedAt);
    row("Source", s.source);
  }

  return "﻿" + lines.join("\r\n") + "\r\n";
}

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EFFC" } };

function styleHeader(ws: ExcelJS.Worksheet) {
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = HEADER_FILL;
}

export async function summaryXlsx(s: DashboardSummary): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RegDash";
  wb.created = new Date();

  const overview = wb.addWorksheet("Overview");
  overview.columns = [
    { header: "Metric", key: "metric", width: 22 },
    { header: "Value", key: "value", width: 14 },
  ];
  styleHeader(overview);
  overview.addRow({ metric: "Total open", value: s.totalOpen });
  overview.addRow({ metric: "Incidents open", value: s.incidentsOpen });
  overview.addRow({ metric: "SRs open", value: s.srsOpen });
  for (const p of PRIORITIES) overview.addRow({ metric: `Open ${p}`, value: s.byPriority[p] });
  overview.addRow({ metric: "SLA breached", value: s.slaBreached });
  overview.addRow({ metric: "SLA at risk", value: s.slaAtRisk });
  overview.addRow({ metric: "On hold", value: s.onHold });
  overview.addRow({ metric: "Stale (48h+)", value: s.stale });

  const apps = Object.entries(s.byApplication).filter(([, n]) => n > 0);
  if (apps.length) {
    const ws = wb.addWorksheet("By Application");
    ws.columns = [
      { header: "Application", key: "app", width: 18 },
      { header: "Open", key: "count", width: 10 },
    ];
    styleHeader(ws);
    for (const [app, n] of apps) ws.addRow({ app, count: n });
  }

  const envs = Object.entries(s.byEnvironment).filter(([, n]) => n > 0);
  if (envs.length) {
    const ws = wb.addWorksheet("By Environment");
    ws.columns = [
      { header: "Environment", key: "env", width: 14 },
      { header: "Open", key: "count", width: 10 },
    ];
    styleHeader(ws);
    for (const [env, n] of envs) ws.addRow({ env, count: n });
  }

  if (s.byOwner.length) {
    const ws = wb.addWorksheet("By Owner");
    ws.columns = [
      { header: "Owner", key: "owner", width: 20 },
      { header: "Open", key: "count", width: 8 },
      ...PRIORITIES.map((p) => ({ header: p, key: p.toLowerCase(), width: 6 })),
      { header: "Breached", key: "breached", width: 10 },
      { header: "At risk", key: "atRisk", width: 10 },
      { header: "On hold", key: "onHold", width: 10 },
      { header: "Stale", key: "stale", width: 8 },
      { header: "Actionable", key: "actionable", width: 12 },
      { header: "Est. effort (h)", key: "effort", width: 14 },
    ];
    styleHeader(ws);
    for (const w of s.byOwner) {
      ws.addRow({
        owner: w.owner, count: w.count,
        p1: w.byPriority.P1, p2: w.byPriority.P2, p3: w.byPriority.P3, p4: w.byPriority.P4,
        breached: w.breached, atRisk: w.atRisk, onHold: w.onHold, stale: w.stale,
        actionable: w.actionable, effort: w.estimatedHours || null,
      });
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
