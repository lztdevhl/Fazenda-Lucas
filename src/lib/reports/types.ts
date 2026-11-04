import type { DashboardPeriod } from "@/lib/dashboard/period";
import type { InvestmentMovement, InvestmentRecord } from "@/lib/investments/types";
import type { FarmUnit } from "@/lib/farm-units/types";

export type ReportKind = "cashflow" | "income" | "expense" | "operational" | "payables" | "receivables" | "investments";
export type ReportRegime = "cash" | "competence";
export type CashflowGrouping = "day" | "month" | "period";

export type ReportFilters = {
  kind: ReportKind;
  period: DashboardPeriod;
  accountId: string | null;
  farmUnitId?: string | null;
  categoryId: string | null;
  regime: ReportRegime;
  grouping: CashflowGrouping;
};

export type ReportAccount = { id: string; name: string; active: boolean; opening_balance_text: string; opening_date: string };
export type ReportCategory = { id: string; name: string; category_type: string; active: boolean };

export type ReportTransaction = {
  id: string;
  kind: string;
  description: string;
  amount_text: string;
  category_id: string | null;
  category_name: string | null;
  account_id: string | null;
  account_name: string | null;
  farm_unit_id?: string | null;
  farm_unit_name?: string | null;
  destination_account_id: string | null;
  destination_account_name: string | null;
  competency_date: string;
  due_date: string | null;
  settled_on: string | null;
  status: "pending" | "settled" | "cancelled";
  counterparty: string | null;
  notes: string | null;
  created_at: string;
  reversal_of_id: string | null;
};

export type ReportData = {
  farmName: string;
  accounts: ReportAccount[];
  categories: ReportCategory[];
  transactions: ReportTransaction[];
  investments: InvestmentRecord[];
  investmentMovements: InvestmentMovement[];
  farmUnits: FarmUnit[];
};

export type ReportLine = {
  id: string;
  date: string;
  description: string;
  category: string;
  account: string;
  farmUnit?: string;
  amount: string;
  status: string;
  counterparty?: string;
  dueDate?: string;
  daysOverdue?: number;
  kind?: string;
};

export type ReportMetric = { label: string; value: string; tone?: "default" | "positive" | "negative" | "warning" };
export type ReportChartPoint = { label: string; value: string; plot: number };

export type ReportModel = {
  title: string;
  subtitle: string;
  metrics: ReportMetric[];
  lines: ReportLine[];
  chart: { title: string; points: ReportChartPoint[] } | null;
  notes: string[];
  exportSheets: Record<string, Array<Record<string, string | number>>>;
};
