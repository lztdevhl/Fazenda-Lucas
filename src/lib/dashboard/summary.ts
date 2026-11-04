import { eachMonthOfInterval, format, parseISO } from "date-fns";
import { centsFromDecimal, decimalFromCents } from "../finance/money";
import type { DashboardPeriod } from "./period";

export type DashboardEvent = {
  id: string;
  kind: string;
  description: string;
  amount_text: string;
  status: "pending" | "settled";
  event_date: string;
  due_date: string | null;
  category_name: string | null;
  account_name: string | null;
  reversal_of_id: string | null;
};

export type BalancePoint = { day: string; balance_text: string };
export type DueItem = { id: string; kind: "income" | "expense"; description: string; amount_text: string; due_date: string };
export type MonthlyValue = {
  month: string;
  label: string;
  incomeText: string;
  expenseText: string;
  resultText: string;
  incomePlot: number;
  expensePlot: number;
  resultPlot: number;
};
export type CategoryValue = { name: string; amount: string; plot: number };

export type DashboardSummary = {
  balance: string;
  balanceSeries: (BalancePoint & { plot: number })[];
  income: string;
  expense: string;
  cashOutflow: string;
  result: string;
  receivable: string;
  payable: string;
  productiveInvestments: string;
  financialContributions: string;
  financialWithdrawals: string;
  overdueExpenses: string;
  previousIncome: string;
  previousExpense: string;
  previousResult: string;
  monthly: MonthlyValue[];
  expenseCategories: CategoryValue[];
  incomeCategories: CategoryValue[];
  recent: DashboardEvent[];
  nextPayables: DueItem[];
  nextReceivables: DueItem[];
};

type Totals = { income: bigint; expense: bigint; receivable: bigint; payable: bigint;
  productiveInvestments: bigint; financialContributions: bigint; financialWithdrawals: bigint; cashOutflow: bigint };

function totalsFor(events: DashboardEvent[]): Totals {
  const totals: Totals = { income: 0n, expense: 0n, receivable: 0n, payable: 0n,
    productiveInvestments: 0n, financialContributions: 0n, financialWithdrawals: 0n, cashOutflow: 0n };
  for (const event of events) {
    const amount = centsFromDecimal(event.amount_text);
    if (event.status === "pending") {
      if (event.kind === "income") totals.receivable += amount;
      if (event.kind === "expense") totals.payable += amount;
      continue;
    }
    if (event.kind === "income") totals.income += amount;
    if (event.kind === "reversal_income") totals.income -= amount;
    if (event.kind === "expense") totals.expense += amount;
    if (event.kind === "reversal_expense") totals.expense -= amount;
    if (event.kind === "capital_expenditure") totals.productiveInvestments += amount;
    if (event.kind === "reversal_capital_expenditure") totals.productiveInvestments -= amount;
    if (event.kind === "investment_contribution") totals.financialContributions += amount;
    if (event.kind === "reversal_investment_contribution") totals.financialContributions -= amount;
    if (event.kind === "investment_withdrawal") totals.financialWithdrawals += amount;
    if (event.kind === "reversal_investment_withdrawal") totals.financialWithdrawals -= amount;

    // This is the consolidated cash-out view used by the simplified dashboard.
    // Internal transfers remain neutral and are intentionally not included.
    if (["expense", "capital_expenditure", "investment_contribution", "reversal_income", "reversal_investment_withdrawal"].includes(event.kind)) {
      totals.cashOutflow += amount;
    }
  }
  return totals;
}

function categoryTotals(events: DashboardEvent[], kind: "income" | "expense"): CategoryValue[] {
  const values = new Map<string, bigint>();
  for (const event of events) {
    if (event.status !== "settled") continue;
    if (event.kind !== kind && event.kind !== `reversal_${kind}`) continue;
    const name = event.category_name ?? "Sem categoria";
    const signed = centsFromDecimal(event.amount_text) * (event.kind === kind ? 1n : -1n);
    values.set(name, (values.get(name) ?? 0n) + signed);
  }
  return [...values].filter(([, amount]) => amount !== 0n)
    .sort((a, b) => a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : 0)
    .map(([name, amount]) => ({ name, amount: decimalFromCents(amount), plot: Number(decimalFromCents(amount)) }));
}

export function summarizeDashboard(
  events: DashboardEvent[], balancePoints: BalancePoint[], dueItems: DueItem[],
  overdueExpenses: string, period: DashboardPeriod,
): DashboardSummary {
  const current = events.filter((event) => event.event_date >= period.from && event.event_date <= period.to);
  const previous = events.filter((event) => event.event_date >= period.previousFrom && event.event_date <= period.previousTo);
  const nowTotals = totalsFor(current);
  const pastTotals = totalsFor(previous);
  const settled = current.filter((event) => event.status === "settled");
  const monthly = eachMonthOfInterval({ start: parseISO(period.from), end: parseISO(period.to) }).map((date) => {
    const month = format(date, "yyyy-MM");
    const totals = totalsFor(settled.filter((event) => event.event_date.startsWith(month)));
    const incomeText = decimalFromCents(totals.income);
    const expenseText = decimalFromCents(totals.expense);
    const resultText = decimalFromCents(totals.income - totals.expense);
    return { month, label: format(date, "MM/yyyy"), incomeText, expenseText, resultText,
      incomePlot: Number(incomeText), expensePlot: Number(expenseText), resultPlot: Number(resultText) };
  });
  const interval = Math.max(1, Math.ceil(balancePoints.length / 90));
  const balanceSeries = balancePoints
    .filter((_, index) => index % interval === 0 || index === balancePoints.length - 1)
    .map((point) => ({ ...point, plot: Number(point.balance_text) }));

  return {
    balance: balancePoints.at(-1)?.balance_text ?? "0.00",
    balanceSeries,
    income: decimalFromCents(nowTotals.income), expense: decimalFromCents(nowTotals.expense),
    cashOutflow: decimalFromCents(nowTotals.cashOutflow),
    result: decimalFromCents(nowTotals.income - nowTotals.expense),
    receivable: decimalFromCents(nowTotals.receivable), payable: decimalFromCents(nowTotals.payable),
    productiveInvestments: decimalFromCents(nowTotals.productiveInvestments),
    financialContributions: decimalFromCents(nowTotals.financialContributions),
    financialWithdrawals: decimalFromCents(nowTotals.financialWithdrawals),
    overdueExpenses,
    previousIncome: decimalFromCents(pastTotals.income), previousExpense: decimalFromCents(pastTotals.expense),
    previousResult: decimalFromCents(pastTotals.income - pastTotals.expense),
    monthly,
    expenseCategories: categoryTotals(settled, "expense"),
    incomeCategories: categoryTotals(settled, "income"),
    recent: settled.slice().sort((a, b) => b.event_date.localeCompare(a.event_date)).slice(0, 10),
    nextPayables: dueItems.filter((item) => item.kind === "expense").slice(0, 5),
    nextReceivables: dueItems.filter((item) => item.kind === "income").slice(0, 5),
  };
}
