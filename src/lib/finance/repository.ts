import "server-only";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { accountRowSchema, categoryRowSchema, transactionRowSchema } from "@/lib/finance/validation";
import type { FinancialAccount, FinancialCategory, FinancialTransaction, TransactionFilters, TransactionKind } from "@/lib/finance/types";

async function context() {
  const owner = await requireOwner();
  if (!owner.farm) redirect("/access-pending");
  return owner;
}

function assertResult(error: { message: string } | null) {
  if (error) throw new Error("Não foi possível consultar os dados financeiros. Verifique se a migration da Fase 2 foi aplicada.");
}

export async function listAccounts(): Promise<FinancialAccount[]> {
  const { supabase } = await context();
  const { data, error } = await supabase.rpc("finance_account_overview");
  assertResult(error);
  return accountRowSchema.array().parse(data ?? []);
}

export async function listCategories(kind?: TransactionKind): Promise<FinancialCategory[]> {
  const { supabase, farm } = await context();
  let query = supabase.from("financial_categories")
    .select("id, name, category_type, active, is_system")
    .eq("farm_id", farm!.id).in("category_type", ["income", "expense"])
    .order("name");
  if (kind) query = query.eq("category_type", kind);
  const { data, error } = await query;
  assertResult(error);
  return categoryRowSchema.array().parse(data ?? []);
}

export async function listTransactions(kind: TransactionKind, filters: TransactionFilters, farmUnitId: string | null = null): Promise<FinancialTransaction[]> {
  const { supabase } = await context();
  const { data, error } = await supabase.rpc("finance_list_transactions_by_unit", {
    p_kind: kind,
    p_search: filters.search || null,
    p_status: filters.status || null,
    p_category_id: filters.category || null,
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_farm_unit_id: farmUnitId,
  });
  assertResult(error);
  return transactionRowSchema.array().parse(data ?? []);
}
