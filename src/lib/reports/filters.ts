import { z } from "zod";
import { parseDashboardPeriod } from "@/lib/dashboard/period";
import type { CashflowGrouping, ReportFilters, ReportKind, ReportRegime } from "./types";

const uuid = z.uuid();
const reportKinds: ReportKind[] = ["cashflow", "income", "expense", "operational", "payables", "receivables", "investments"];

export function parseReportFilters(params: Record<string, string | string[] | undefined>): ReportFilters {
  const scalar = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const kind = reportKinds.includes(scalar("report") as ReportKind) ? scalar("report") as ReportKind : "cashflow";
  const account = scalar("account");
  const farmUnit = scalar("unit");
  const category = scalar("category");
  const regime = scalar("regime") === "competence" ? "competence" : "cash";
  const grouping: CashflowGrouping = scalar("group") === "day" || scalar("group") === "period" ? scalar("group") as CashflowGrouping : "month";
  return {
    kind,
    period: parseDashboardPeriod(params),
    accountId: uuid.safeParse(account).success ? account : null,
    farmUnitId: uuid.safeParse(farmUnit).success ? farmUnit : null,
    categoryId: uuid.safeParse(category).success ? category : null,
    regime: regime as ReportRegime,
    grouping,
  };
}
