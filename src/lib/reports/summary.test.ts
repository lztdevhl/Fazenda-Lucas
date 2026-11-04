import { describe, expect, it } from "vitest";
import { summarizeReport } from "./summary";
import type { ReportData, ReportFilters } from "./types";

const account = "00000000-0000-0000-0000-000000000001";
const secondAccount = "00000000-0000-0000-0000-000000000002";
const incomeCategory = "00000000-0000-0000-0000-000000000011";
const expenseCategory = "00000000-0000-0000-0000-000000000012";
const investmentCategory = "00000000-0000-0000-0000-000000000013";

const baseFilters: ReportFilters = {
  kind: "cashflow", accountId: null, categoryId: null, regime: "cash", grouping: "period",
  period: { preset: "custom", from: "2026-01-01", to: "2026-01-31", previousFrom: "2025-12-02", previousTo: "2025-12-31" },
};

function transaction(overrides: Partial<ReportData["transactions"][number]>): ReportData["transactions"][number] {
  return { id: crypto.randomUUID(), kind: "income", description: "Lançamento", amount_text: "100.00", category_id: incomeCategory, category_name: "Venda de suínos", account_id: account, account_name: "Banco", destination_account_id: null, destination_account_name: null, competency_date: "2026-01-05", due_date: "2026-01-05", settled_on: "2026-01-05", status: "settled", counterparty: null, notes: null, created_at: "2026-01-05T12:00:00Z", reversal_of_id: null, ...overrides };
}

function data(transactions: ReportData["transactions"]): ReportData {
  return { farmName: "Fazenda Teste", accounts: [
    { id: account, name: "Banco", active: true, opening_balance_text: "1000.00", opening_date: "2025-12-01" },
    { id: secondAccount, name: "Caixa", active: true, opening_balance_text: "500.00", opening_date: "2025-12-01" },
  ], categories: [
    { id: incomeCategory, name: "Venda de suínos", category_type: "income", active: true },
    { id: expenseCategory, name: "Ração", category_type: "expense", active: true },
    { id: investmentCategory, name: "Equipamentos", category_type: "productive_investment", active: true },
  ], transactions, investments: [], investmentMovements: [], farmUnits: [] };
}

describe("relatórios financeiros", () => {
  it("reconcilia saldo inicial, entradas, despesas e transferências internas", () => {
    const transactions = [
      transaction({ id: "00000000-0000-0000-0000-000000000101", amount_text: "100.00" }),
      transaction({ id: "00000000-0000-0000-0000-000000000102", kind: "expense", category_id: expenseCategory, category_name: "Ração", amount_text: "30.00" }),
      transaction({ id: "00000000-0000-0000-0000-000000000103", kind: "transfer", category_id: null, category_name: null, amount_text: "200.00", account_id: account, account_name: "Banco", destination_account_id: secondAccount, destination_account_name: "Caixa" }),
    ];
    const model = summarizeReport(data(transactions), baseFilters);
    expect(model.metrics.find((item) => item.label === "Saldo inicial")?.value).toBe("1500.00");
    expect(model.metrics.find((item) => item.label === "Saldo final")?.value).toBe("1570.00");
    expect(model.metrics.find((item) => item.label === "Outras movimentações")?.value).toBe("0.00");
  });

  it("mantém receitas recebidas, pendentes e despesas vencidas separadas", () => {
    const transactions = [
      transaction({ id: "00000000-0000-0000-0000-000000000111", amount_text: "80.00" }),
      transaction({ id: "00000000-0000-0000-0000-000000000112", amount_text: "45.00", status: "pending", settled_on: null, due_date: "2025-12-15" }),
      transaction({ id: "00000000-0000-0000-0000-000000000113", kind: "expense", category_id: expenseCategory, category_name: "Ração", amount_text: "20.00", status: "pending", settled_on: null, due_date: "2025-12-10" }),
    ];
    const income = summarizeReport(data(transactions), { ...baseFilters, kind: "income", period: { ...baseFilters.period, from: "2025-12-01", to: "2026-01-31" } });
    expect(income.metrics.find((item) => item.label === "Pendente")?.value).toBe("45.00");
    const payables = summarizeReport(data(transactions), { ...baseFilters, kind: "payables", period: { ...baseFilters.period, from: "2025-12-01", to: "2026-01-31" } });
    expect(payables.metrics.find((item) => item.label === "Total vencido")?.value).toBe("20.00");
  });

  it("exclui cancelamentos e neutraliza estornos no resultado operacional", () => {
    const original = transaction({ id: "00000000-0000-0000-0000-000000000121", amount_text: "100.00" });
    const transactions = [original,
      transaction({ id: "00000000-0000-0000-0000-000000000122", kind: "reversal_income", amount_text: "100.00", category_id: null, category_name: null, reversal_of_id: original.id }),
      transaction({ id: "00000000-0000-0000-0000-000000000123", amount_text: "999.00", status: "cancelled", settled_on: null }),
      transaction({ id: "00000000-0000-0000-0000-000000000124", kind: "expense", category_id: expenseCategory, category_name: "Ração", amount_text: "40.00" }),
    ];
    const model = summarizeReport(data(transactions), { ...baseFilters, kind: "operational" });
    expect(model.metrics.find((item) => item.label === "Receitas operacionais")?.value).toBe("0.00");
    expect(model.metrics.find((item) => item.label === "Despesas operacionais")?.value).toBe("40.00");
    expect(model.metrics.find((item) => item.label === "Resultado operacional")?.value).toBe("-40.00");
  });

  it("separa investimento produtivo, aportes e resgates", () => {
    const investment = { id: "00000000-0000-0000-0000-000000000131", investment_type: "productive" as const, category_id: investmentCategory, category_name: "Equipamentos", name: "Ordenhadeira", description: null, initial_value_text: "300.00", current_value_text: null, principal_text: null, investment_date: "2026-01-10", valuation_date: null, institution: null, status: "active" as const, payment_transaction_id: "00000000-0000-0000-0000-000000000132", payment_account_id: account, payment_reversal_id: null, payment_reversal_date: null, notes: null, created_at: "2026-01-10T12:00:00Z", farm_unit_id: null, farm_unit_name: null };
    const financial = { ...investment, id: "00000000-0000-0000-0000-000000000133", investment_type: "financial" as const, name: "CDB", current_value_text: "500.00", principal_text: "400.00", payment_transaction_id: null, payment_account_id: null, institution: "Banco", status: "active" as const };
    const movements = [
      { id: "00000000-0000-0000-0000-000000000134", investment_id: financial.id, movement_type: "contribution" as const, amount_text: "400.00", movement_date: "2026-01-11", account_id: account, account_name: "Banco", notes: null, reversal_of_id: null, reversed_by_id: null, transaction_id: "00000000-0000-0000-0000-000000000135" },
      { id: "00000000-0000-0000-0000-000000000136", investment_id: financial.id, movement_type: "withdrawal" as const, amount_text: "100.00", movement_date: "2026-01-12", account_id: account, account_name: "Banco", notes: null, reversal_of_id: null, reversed_by_id: null, transaction_id: "00000000-0000-0000-0000-000000000137" },
    ];
    const model = summarizeReport({ ...data([]), investments: [investment, financial], investmentMovements: movements }, { ...baseFilters, kind: "investments" });
    expect(model.metrics.find((item) => item.label === "Total investido em produção")?.value).toBe("300.00");
    expect(model.metrics.find((item) => item.label === "Aportes no período")?.value).toBe("400.00");
    expect(model.metrics.find((item) => item.label === "Resgates no período")?.value).toBe("100.00");
    expect(model.metrics.find((item) => item.label === "Valor de mercado informado")?.value).toBe("500.00");
  });
});
