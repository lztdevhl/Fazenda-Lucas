import { describe, expect, it } from "vitest";
import { parseDashboardPeriod } from "../dashboard/period";
import { summarizeInvestments } from "./summary";
import type { InvestmentMovement, InvestmentRecord } from "./types";

const productiveId = "11111111-1111-4111-8111-111111111111";
const financialId = "22222222-2222-4222-8222-222222222222";
const records: InvestmentRecord[] = [
  { id: productiveId, investment_type: "productive", category_id: "33333333-3333-4333-8333-333333333333", category_name: "Geradores",
    name: "Gerador", description: null, initial_value_text: "50000.00", current_value_text: null, principal_text: null,
    investment_date: "2026-02-10", valuation_date: null, institution: null, status: "cancelled",
    payment_transaction_id: "44444444-4444-4444-8444-444444444444", payment_account_id: null,
    payment_reversal_id: "55555555-5555-4555-8555-555555555555", payment_reversal_date: "2026-04-01",
    notes: null, created_at: "2026-02-10T00:00:00Z", farm_unit_id: null, farm_unit_name: null },
  { id: financialId, investment_type: "financial", category_id: "66666666-6666-4666-8666-666666666666", category_name: "CDB",
    name: "Reserva", description: null, initial_value_text: "10000.00", current_value_text: "12000.00", principal_text: "8000.00",
    investment_date: "2026-02-11", valuation_date: "2026-03-01", institution: "Banco", status: "active",
    payment_transaction_id: null, payment_account_id: null, payment_reversal_id: null,
    payment_reversal_date: null, notes: null, created_at: "2026-02-11T00:00:00Z", farm_unit_id: null, farm_unit_name: null },
];
const movements: InvestmentMovement[] = [
  { id: "77777777-7777-4777-8777-777777777777", investment_id: financialId, movement_type: "contribution",
    amount_text: "10000.00", movement_date: "2026-02-11", account_id: "88888888-8888-4888-8888-888888888888",
    account_name: "Banco", notes: null, reversal_of_id: null, reversed_by_id: null,
    transaction_id: "99999999-9999-4999-8999-999999999999" },
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", investment_id: financialId, movement_type: "withdrawal",
    amount_text: "2000.00", movement_date: "2026-03-02", account_id: "88888888-8888-4888-8888-888888888888",
    account_name: "Banco", notes: null, reversal_of_id: null, reversed_by_id: null,
    transaction_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
];

describe("resumo de investimentos", () => {
  it("separa principal, patrimônio informado e pagamentos produtivos sem duplicar o caixa", () => {
    const period = parseDashboardPeriod({ period: "custom", from: "2026-02-01", to: "2026-02-28" }, "2026-04-02");
    const result = summarizeInvestments(records, movements, { period, type: "all", category: null });
    expect(result.productiveTotal).toBe("50000.00");
    expect(result.appliedPrincipal).toBe("10000.00");
    expect(result.currentValue).toBe("12000.00");
    expect(result.contributions).toBe("10000.00");
    expect(result.withdrawals).toBe("0.00");
    expect(result.monthly[0].productive).toBe("50000.00");
    expect(result.distribution.map((item) => item.amount)).toEqual(["50000.00", "10000.00"]);
  });

  it("considera estorno na sua data e respeita filtros", () => {
    const period = parseDashboardPeriod({ period: "custom", from: "2026-04-01", to: "2026-04-30" }, "2026-05-01");
    const result = summarizeInvestments(records, movements, { period, type: "productive", category: records[0].category_id });
    expect(result.productiveTotal).toBe("0.00");
    expect(result.productiveCategories[0].amount).toBe("-50000.00");
    expect(result.visibleRecords.map((record) => record.id)).toEqual([productiveId]);
    expect(result.appliedPrincipal).toBe("0.00");
  });
});
