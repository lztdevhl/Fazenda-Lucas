import "server-only";
import { requireOwner } from "@/lib/auth";
import { getInvestmentData } from "@/lib/investments/repository";
import { listFarmUnits } from "@/lib/farm-units/repository";
import type { ReportAccount, ReportCategory, ReportData, ReportTransaction } from "./types";

type RawTransaction = Omit<ReportTransaction, "category_name" | "account_name" | "destination_account_name" | "farm_unit_name">;

function normalizeMoney(value: unknown): string {
  const text = String(value ?? "").trim().replace(",", ".");
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error("Valor monetário inválido recebido pelo relatório.");
  return `${match[1]}${match[2]}.${(match[3] ?? "").padEnd(2, "0").slice(0, 2)}`;
}

export async function getReportData(farmUnitId: string | null = null): Promise<ReportData> {
  const { supabase, farm } = await requireOwner();
  if (!farm) throw new Error("Fazenda não configurada.");

  const [transactionRows, categoriesResult, investmentData, farmUnits] = await Promise.all([
    loadTransactions(supabase, farm.id, farmUnitId),
    supabase.from("financial_categories").select("id,name,category_type,active").eq("farm_id", farm.id).order("category_type").order("name"),
    getInvestmentData(farmUnitId),
    listFarmUnits(),
  ]);
  if (categoriesResult.error) throw new Error("Não foi possível carregar as categorias dos relatórios.");

  const reportAccounts: ReportAccount[] = [];
  const reportCategories = (categoriesResult.data ?? []) as ReportCategory[];
  const accountById = new Map(reportAccounts.map((account) => [account.id, account.name]));
  const categoryById = new Map(reportCategories.map((category) => [category.id, category.name]));
  const unitById = new Map(farmUnits.map((unit) => [unit.id, unit]));
  const transactions: ReportTransaction[] = transactionRows.map((transaction) => ({
    ...transaction,
    category_name: transaction.category_id ? categoryById.get(transaction.category_id) ?? null : null,
    account_name: transaction.account_id ? accountById.get(transaction.account_id) ?? null : null,
    destination_account_name: transaction.destination_account_id ? accountById.get(transaction.destination_account_id) ?? null : null,
    farm_unit_name: transaction.farm_unit_id ? unitById.get(transaction.farm_unit_id)?.name ?? null : null,
  }));
  return { farmName: farm.name, accounts: reportAccounts, categories: reportCategories, transactions,
    investments: investmentData.records, investmentMovements: investmentData.movements, farmUnits };
}

async function loadTransactions(supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>, farmId: string, farmUnitId: string | null): Promise<RawTransaction[]> {
  const rows: RawTransaction[] = [];
  let offset = 0;
  while (true) {
    let query = supabase.from("financial_transactions")
      .select("id,kind,description,amount,category_id,account_id,destination_account_id,farm_unit_id,competency_date,due_date,settled_on,status,counterparty,notes,created_at,reversal_of_id")
      .eq("farm_id", farmId);
    if (farmUnitId) query = query.eq("farm_unit_id", farmUnitId);
    const result = await query.order("created_at", { ascending: true }).range(offset, offset + 999);
    if (result.error) throw new Error("Não foi possível consultar os lançamentos para os relatórios.");
    const page = (result.data ?? []).map((row) => ({
      id: row.id as string,
      kind: row.kind as string,
      description: row.description as string,
      amount_text: normalizeMoney(row.amount),
      category_id: row.category_id as string | null,
      account_id: row.account_id as string | null,
      destination_account_id: row.destination_account_id as string | null,
      farm_unit_id: row.farm_unit_id as string | null,
      competency_date: row.competency_date as string,
      due_date: row.due_date as string | null,
      settled_on: row.settled_on as string | null,
      status: row.status as RawTransaction["status"],
      counterparty: row.counterparty as string | null,
      notes: row.notes as string | null,
      created_at: row.created_at as string,
      reversal_of_id: row.reversal_of_id as string | null,
    }));
    rows.push(...page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  return rows;
}
