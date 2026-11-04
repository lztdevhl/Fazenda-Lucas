"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import {
  applicationEditSchema, applicationInputSchema, investmentIdSchema, investmentReverseSchema,
  movementInputSchema, productiveInputSchema,
} from "@/lib/investments/validation";

type Result = { ok: true; id: string } | { ok: false; error: string };

async function client() {
  const owner = await requireOwner();
  if (!owner.farm) throw new Error("Esta conta não está vinculada a uma fazenda.");
  return owner.supabase;
}
function result(data: unknown, error: { message: string } | null): Result {
  if (error) return { ok: false, error: error.message };
  return typeof data === "string" ? { ok: true, id: data } : { ok: false, error: "Resposta inesperada do banco." };
}
function refresh() {
  revalidatePath("/investimentos");
  revalidatePath("/dashboard");
  revalidatePath("/configuracoes");
}

export async function saveProductiveAction(input: unknown): Promise<Result> {
  const parsed = productiveInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;
  const db = await client();
  const { data, error } = await db.rpc("finance_save_productive_investment_with_unit", {
    p_id: d.id, p_name: d.name, p_category_id: d.categoryId, p_description: d.description,
    p_amount: d.amount, p_date: d.date, p_account_id: d.accountId,
    p_farm_unit_id: d.farmUnitId,
    p_status: d.status, p_notes: d.notes, p_idempotency_key: d.idempotencyKey,
  });
  const answer = result(data, error); if (answer.ok) refresh(); return answer;
}
export async function cancelPlannedInvestmentAction(input: unknown): Promise<Result> {
  const parsed = investmentIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Investimento inválido." };
  const db = await client();
  const { data, error } = await db.rpc("finance_cancel_planned_investment", { p_id: parsed.data.id });
  const answer = result(data, error); if (answer.ok) refresh(); return answer;
}
export async function reverseProductiveAction(input: unknown): Promise<Result> {
  const parsed = investmentReverseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados do estorno inválidos." };
  const db = await client();
  const { data, error } = await db.rpc("finance_reverse_productive_investment", {
    p_id: parsed.data.id, p_date: parsed.data.date, p_idempotency_key: parsed.data.idempotencyKey,
  });
  const answer = result(data, error); if (answer.ok) refresh(); return answer;
}
export async function createApplicationAction(input: unknown): Promise<Result> {
  const parsed = applicationInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data; const db = await client();
  const { data, error } = await db.rpc("finance_create_application", {
    p_name: d.name, p_category_id: d.categoryId, p_institution: d.institution,
    p_date: d.date, p_amount: d.amount, p_account_id: d.accountId,
    p_current_value: d.currentValue, p_valuation_date: d.valuationDate,
    p_notes: d.notes, p_idempotency_key: d.idempotencyKey,
  });
  const answer = result(data, error); if (answer.ok) refresh(); return answer;
}
export async function saveApplicationAction(input: unknown): Promise<Result> {
  const parsed = applicationEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data; const db = await client();
  const { data, error } = await db.rpc("finance_save_application", {
    p_id: d.id, p_name: d.name, p_category_id: d.categoryId, p_institution: d.institution,
    p_description: d.description, p_current_value: d.currentValue, p_valuation_date: d.valuationDate,
    p_status: d.status, p_notes: d.notes,
  });
  const answer = result(data, error); if (answer.ok) refresh(); return answer;
}
export async function addInvestmentMovementAction(input: unknown): Promise<Result> {
  const parsed = movementInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data; const db = await client();
  const { data, error } = await db.rpc("finance_add_investment_movement", {
    p_investment_id: d.investmentId, p_movement_type: d.movementType,
    p_amount: d.amount, p_date: d.date, p_account_id: d.accountId,
    p_notes: d.notes, p_idempotency_key: d.idempotencyKey,
  });
  const answer = result(data, error); if (answer.ok) refresh(); return answer;
}
export async function reverseInvestmentMovementAction(input: unknown): Promise<Result> {
  const parsed = investmentReverseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados do estorno inválidos." };
  const d = parsed.data; const db = await client();
  const { data, error } = await db.rpc("finance_reverse_investment_movement", {
    p_movement_id: d.id, p_date: d.date, p_idempotency_key: d.idempotencyKey,
  });
  const answer = result(data, error); if (answer.ok) refresh(); return answer;
}
