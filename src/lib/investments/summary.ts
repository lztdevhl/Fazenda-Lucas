import { eachMonthOfInterval, format, parseISO } from "date-fns";
import { centsFromDecimal, decimalFromCents } from "../finance/money";
import type { DashboardPeriod } from "../dashboard/period";
import type { InvestmentMovement, InvestmentRecord } from "./types";

export type InvestmentFilters = { period: DashboardPeriod; type: "all" | "productive" | "financial"; category: string | null };
export type InvestmentChartPoint = { label: string; amount: string; plot: number };
export type InvestmentMonthPoint = { month: string; label: string; contributions: string; contributionPlot: number;
  productive: string; productivePlot: number; financial: string; financialPlot: number };

export function summarizeInvestments(records: InvestmentRecord[], movements: InvestmentMovement[], filters: InvestmentFilters) {
  const { from, to } = filters.period;
  const chosen = records.filter((record) =>
    (filters.type === "all" || record.investment_type === filters.type)
    && (!filters.category || record.category_id === filters.category));
  const chosenIds = new Set(chosen.map((record) => record.id));
  const chosenMovements = movements.filter((movement) => chosenIds.has(movement.investment_id));
  const productive = chosen.filter((record) => record.investment_type === "productive" && record.payment_transaction_id);
  const financial = chosen.filter((record) => record.investment_type === "financial");

  function productiveDelta(record: InvestmentRecord, date: string): bigint {
    const amount = centsFromDecimal(record.initial_value_text);
    return (record.investment_date === date ? amount : 0n)
      - (record.payment_reversal_date === date ? amount : 0n);
  }
  function movementDelta(movement: InvestmentMovement): bigint {
    const amount = centsFromDecimal(movement.amount_text);
    return movement.movement_type === "contribution" || movement.movement_type === "reversal_withdrawal" ? amount : -amount;
  }
  const productiveTotal = productive.reduce((sum, record) => sum
    + (record.investment_date <= to ? centsFromDecimal(record.initial_value_text) : 0n)
    - (record.payment_reversal_date && record.payment_reversal_date <= to ? centsFromDecimal(record.initial_value_text) : 0n), 0n);
  const appliedPrincipal = chosenMovements.reduce((sum, movement) => sum
    + (movement.movement_date <= to ? movementDelta(movement) : 0n), 0n);
  const currentValue = financial.filter((record) => record.status !== "cancelled")
    .reduce((sum, record) => sum + centsFromDecimal(record.current_value_text ?? "0.00"), 0n);
  const periodMovements = chosenMovements.filter((movement) => movement.movement_date >= from && movement.movement_date <= to);
  const contributions = periodMovements.reduce((sum, movement) => sum +
    (movement.movement_type === "contribution" ? centsFromDecimal(movement.amount_text) :
      movement.movement_type === "reversal_contribution" ? -centsFromDecimal(movement.amount_text) : 0n), 0n);
  const withdrawals = periodMovements.reduce((sum, movement) => sum +
    (movement.movement_type === "withdrawal" ? centsFromDecimal(movement.amount_text) :
      movement.movement_type === "reversal_withdrawal" ? -centsFromDecimal(movement.amount_text) : 0n), 0n);

  const categoryTotals = new Map<string, bigint>();
  for (const record of productive) {
    const amount = centsFromDecimal(record.initial_value_text);
    const delta = (record.investment_date >= from && record.investment_date <= to ? amount : 0n)
      - (record.payment_reversal_date && record.payment_reversal_date >= from && record.payment_reversal_date <= to ? amount : 0n);
    categoryTotals.set(record.category_name, (categoryTotals.get(record.category_name) ?? 0n) + delta);
  }
  const productiveCategories: InvestmentChartPoint[] = [...categoryTotals].filter(([, value]) => value !== 0n)
    .sort((a, b) => a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : 0)
    .slice(0, 6).map(([label, amount]) => ({ label, amount: decimalFromCents(amount), plot: Number(decimalFromCents(amount)) }));

  let productiveRunning = productive.reduce((sum, record) => sum
    + (record.investment_date < from ? centsFromDecimal(record.initial_value_text) : 0n)
    - (record.payment_reversal_date && record.payment_reversal_date < from ? centsFromDecimal(record.initial_value_text) : 0n), 0n);
  let financialRunning = chosenMovements.reduce((sum, movement) => sum
    + (movement.movement_date < from ? movementDelta(movement) : 0n), 0n);
  const monthly: InvestmentMonthPoint[] = eachMonthOfInterval({ start: parseISO(from), end: parseISO(to) }).map((date) => {
    const month = format(date, "yyyy-MM");
    const monthProductive = productive.reduce((sum, record) => {
      const payment = record.investment_date.startsWith(month) && record.investment_date >= from && record.investment_date <= to
        ? productiveDelta(record, record.investment_date) : 0n;
      const reversal = record.payment_reversal_date?.startsWith(month) && record.payment_reversal_date >= from && record.payment_reversal_date <= to
        ? productiveDelta(record, record.payment_reversal_date) : 0n;
      return sum + payment + reversal;
    }, 0n);
    const monthMovements = periodMovements.filter((movement) => movement.movement_date.startsWith(month));
    const monthFinancial = monthMovements.reduce((sum, movement) => sum + movementDelta(movement), 0n);
    const monthContributions = monthMovements.reduce((sum, movement) => sum +
      (movement.movement_type === "contribution" ? centsFromDecimal(movement.amount_text) :
        movement.movement_type === "reversal_contribution" ? -centsFromDecimal(movement.amount_text) : 0n), 0n);
    productiveRunning += monthProductive;
    financialRunning += monthFinancial;
    const contributionText = decimalFromCents(monthContributions);
    const productiveText = decimalFromCents(productiveRunning);
    const financialText = decimalFromCents(financialRunning);
    return { month, label: format(date, "MM/yyyy"), contributions: contributionText, contributionPlot: Number(contributionText),
      productive: productiveText, productivePlot: Number(productiveText), financial: financialText, financialPlot: Number(financialText) };
  });
  const distribution: InvestmentChartPoint[] = [
    { label: "Infraestrutura", amount: decimalFromCents(productiveTotal), plot: Number(decimalFromCents(productiveTotal)) },
    { label: "Aplicações (principal)", amount: decimalFromCents(appliedPrincipal), plot: Number(decimalFromCents(appliedPrincipal)) },
  ];
  const activeIds = new Set(periodMovements.map((movement) => movement.investment_id));
  const visibleRecords = chosen.filter((record) =>
    (record.investment_date >= from && record.investment_date <= to)
    || (record.payment_reversal_date !== null && record.payment_reversal_date >= from && record.payment_reversal_date <= to)
    || activeIds.has(record.id))
    .sort((a, b) => b.investment_date.localeCompare(a.investment_date));

  return {
    productiveTotal: decimalFromCents(productiveTotal), appliedPrincipal: decimalFromCents(appliedPrincipal),
    currentValue: decimalFromCents(currentValue), contributions: decimalFromCents(contributions),
    withdrawals: decimalFromCents(withdrawals), productiveCategories, monthly, distribution, visibleRecords,
  };
}
