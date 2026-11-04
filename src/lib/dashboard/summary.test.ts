import { describe, expect, it } from "vitest";
import { parseDashboardPeriod } from "./period";
import { summarizeDashboard, type BalancePoint, type DashboardEvent, type DueItem } from "./summary";

const period = parseDashboardPeriod({ period: "custom", from: "2026-02-01", to: "2026-02-28" }, "2026-03-01");
const balance: BalancePoint[] = [
  { day: "2026-02-01", balance_text: "1000.00" },
  { day: "2026-02-28", balance_text: "1110.05" },
];

function event(kind: string, amount_text: string, event_date: string, status: "pending" | "settled" = "settled", category_name?: string): DashboardEvent {
  return { id: crypto.randomUUID(), kind, description: kind, amount_text, status,
    event_date, due_date: event_date, category_name: category_name ?? (kind.includes("income") ? "Venda" : "Ração"),
    account_name: "Banco", reversal_of_id: null };
}

describe("filtros do dashboard", () => {
  it("gera os quatro períodos prontos e compara com intervalo anterior de mesma duração", () => {
    const today = "2026-10-27";
    expect(parseDashboardPeriod({}, today).from).toBe("2026-10-01");
    expect(parseDashboardPeriod({ period: "3m" }, today).from).toBe("2026-08-01");
    expect(parseDashboardPeriod({ period: "6m" }, today).from).toBe("2026-05-01");
    expect(parseDashboardPeriod({ period: "year" }, today).from).toBe("2026-01-01");
    expect(period.previousTo).toBe("2026-01-31");
    expect(period.previousFrom).toBe("2026-01-04");
  });

  it("rejeita intervalos personalizados inválidos ou extensos", () => {
    expect(parseDashboardPeriod({ period: "custom", from: "2026-02-30", to: "2026-03-01" }, "2026-03-01").preset).toBe("month");
    expect(parseDashboardPeriod({ period: "custom", from: "2020-01-01", to: "2026-03-01" }, "2026-03-01").preset).toBe("month");
  });
});

describe("indicadores do dashboard", () => {
  it("separa pendências do caixa, aplica estornos no mês correto e ignora transferências", () => {
    const due: DueItem[] = [
      { id: crypto.randomUUID(), kind: "expense", description: "Ração", amount_text: "75.00", due_date: "2026-03-10" },
      { id: crypto.randomUUID(), kind: "income", description: "Venda", amount_text: "300.00", due_date: "2026-03-11" },
    ];
    const summary = summarizeDashboard([
      event("income", "10.05", "2026-01-30"),
      event("income", "200.10", "2026-02-10"),
      event("expense", "50.05", "2026-02-11"),
      event("reversal_income", "10.05", "2026-02-12"),
      event("reversal_expense", "5.00", "2026-02-13"),
      event("transfer", "9999.99", "2026-02-14"),
      event("income", "300.00", "2026-02-20", "pending"),
      event("expense", "75.00", "2026-02-21", "pending"),
    ], balance, due, "35.00", period);

    expect(summary.balance).toBe("1110.05");
    expect(summary.income).toBe("190.05");
    expect(summary.expense).toBe("45.05");
    expect(summary.result).toBe("145.00");
    expect(summary.receivable).toBe("300.00");
    expect(summary.payable).toBe("75.00");
    expect(summary.overdueExpenses).toBe("35.00");
    expect(summary.previousIncome).toBe("10.05");
    expect(summary.monthly[0].resultText).toBe("145.00");
    expect(summary.expenseCategories[0].amount).toBe("45.05");
    expect(summary.nextPayables).toHaveLength(1);
    expect(summary.nextReceivables).toHaveLength(1);
  });

  it("mantém valores exatos acima do limite de precisão de Number", () => {
    const summary = summarizeDashboard([
      event("income", "90071992547409.91", "2026-02-10"),
      event("income", "0.09", "2026-02-11"),
    ], balance, [], "0.00", period);
    expect(summary.income).toBe("90071992547410.00");
    expect(summary.result).toBe("90071992547410.00");
  });

  it("separa investimentos produtivos e transferências de aplicações do resultado operacional", () => {
    const summary = summarizeDashboard([
      event("capital_expenditure", "500.00", "2026-02-10"),
      event("investment_contribution", "200.00", "2026-02-11"),
      event("investment_withdrawal", "50.00", "2026-02-12"),
      event("reversal_capital_expenditure", "100.00", "2026-02-13"),
      event("reversal_investment_contribution", "20.00", "2026-02-14"),
      event("reversal_investment_withdrawal", "5.00", "2026-02-15"),
    ], balance, [], "0.00", period);
    expect(summary.productiveInvestments).toBe("400.00");
    expect(summary.financialContributions).toBe("180.00");
    expect(summary.financialWithdrawals).toBe("45.00");
    expect(summary.income).toBe("0.00");
    expect(summary.expense).toBe("0.00");
    expect(summary.result).toBe("0.00");
  });

  it("mostra zero e estado vazio quando não há movimentações", () => {
    const summary = summarizeDashboard([], [{ day: "2026-02-28", balance_text: "0.00" }], [], "0.00", period);
    expect(summary.result).toBe("0.00");
    expect(summary.monthly).toHaveLength(1);
    expect(summary.monthly[0].resultText).toBe("0.00");
    expect(summary.recent).toEqual([]);
    expect(summary.expenseCategories).toEqual([]);
  });

  it("limita as movimentações recentes a dez eventos liquidados", () => {
    const events = Array.from({ length: 12 }, (_, index) => event("income", "1.00", `2026-02-${String(index + 1).padStart(2, "0")}`));
    const summary = summarizeDashboard(events, balance, [], "0.00", period);
    expect(summary.recent).toHaveLength(10);
    expect(summary.recent[0].event_date).toBe("2026-02-12");
  });
});
