import "server-only";
import { requireOwner } from "@/lib/auth";
import { investmentCategorySchema, investmentMovementSchema, investmentRecordSchema } from "./validation";
import type { InvestmentMovement, InvestmentRecord } from "./types";

export async function getInvestmentData(farmUnitId: string | null = null) {
  const { supabase, farm } = await requireOwner();
  if (!farm) throw new Error("Fazenda não configurada.");
  const [recordsResult, movementsResult, categoriesResult] = await Promise.all([
    supabase.rpc("finance_investment_list_by_unit", { p_farm_unit_id: farmUnitId }).order("id").range(0, 999),
    supabase.rpc("finance_investment_movement_list").order("id").range(0, 999),
    supabase.from("financial_categories").select("id,name,category_type,active")
      .eq("farm_id", farm.id).in("category_type", ["productive_investment", "financial_investment"]).order("name"),
  ]);
  if (recordsResult.error || movementsResult.error || categoriesResult.error) {
    console.error("Falha ao consultar investimentos", {
      records: recordsResult.error && { code: recordsResult.error.code, message: recordsResult.error.message },
      movements: movementsResult.error && { code: movementsResult.error.code, message: movementsResult.error.message },
      categories: categoriesResult.error && { code: categoriesResult.error.code, message: categoriesResult.error.message },
    });
    throw new Error("Não foi possível consultar investimentos no Supabase. Consulte o erro detalhado no terminal.");
  }
  const records: InvestmentRecord[] = investmentRecordSchema.array().parse(recordsResult.data ?? []);
  const movements: InvestmentMovement[] = investmentMovementSchema.array().parse(movementsResult.data ?? []);
  while (records.length && records.length % 1000 === 0) {
    const result = await supabase.rpc("finance_investment_list_by_unit", { p_farm_unit_id: farmUnitId }).order("id").range(records.length, records.length + 999);
    if (result.error) throw new Error("Não foi possível carregar todos os investimentos.");
    const page = investmentRecordSchema.array().parse(result.data ?? []);
    records.push(...page);
    if (page.length < 1000) break;
  }
  while (movements.length && movements.length % 1000 === 0) {
    const result = await supabase.rpc("finance_investment_movement_list").order("id").range(movements.length, movements.length + 999);
    if (result.error) throw new Error("Não foi possível carregar todas as movimentações.");
    const page = investmentMovementSchema.array().parse(result.data ?? []);
    movements.push(...page);
    if (page.length < 1000) break;
  }
  return { records, movements, categories: investmentCategorySchema.array().parse(categoriesResult.data ?? []) };
}
