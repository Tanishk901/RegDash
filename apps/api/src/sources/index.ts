import type { Config } from "../config";
import { ExcelSource } from "./excel";
import { MockSource } from "./mock";
import { ServiceNowSource } from "./servicenow";
import type { TicketSource } from "./TicketSource";

export function createSource(cfg: Config): TicketSource {
  switch (cfg.DATA_SOURCE) {
    case "mock":
      return new MockSource();
    case "excel":
      return new ExcelSource(cfg.EXCEL_PATH, cfg.EXCEL_SHEET, cfg.EXCEL_TIME_UNIT);
    case "servicenow": {
      const { SERVICENOW_BASE_URL, SERVICENOW_USERNAME, SERVICENOW_PASSWORD } = cfg;
      if (!SERVICENOW_BASE_URL || !SERVICENOW_USERNAME || !SERVICENOW_PASSWORD) {
        throw new Error("DATA_SOURCE=servicenow needs SERVICENOW_BASE_URL, _USERNAME and _PASSWORD");
      }
      return new ServiceNowSource({
        baseUrl: SERVICENOW_BASE_URL,
        username: SERVICENOW_USERNAME,
        password: SERVICENOW_PASSWORD,
        assignmentGroup: cfg.SERVICENOW_ASSIGNMENT_GROUP,
      });
    }
  }
}

export type { TicketSource } from "./TicketSource";
