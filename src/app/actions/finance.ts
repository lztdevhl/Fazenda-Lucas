"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import {
  accountInputSchema, cancelInputSchema, categoryInputSchema, reverseInputSchema,
  settleInputSchema, transactionInputSchema,
} from "@/lib/finance/validation";

export type FinanceActionResult = { ok: true; id: string } | { ok: false; error: string };

async function authorizedClient() {
  const owner = await requireOwner();
  if (!owner.farm) throw new Error("Esta conta ainda não está vinculada a uma fazenda.");
  return owner.supabase;
}

function failure(message: string): FinanceActionResult {
  return { ok: false, error: message };
}

function rpcResult(data: unknown, error: { message: string } | null): FinanceActionResult {
  if (error) return failure(error.message);
  if (typeof data !== "string") return failure("Resposta inesperada do banco de dados.");
  return { ok: true, id: data };
}

function refreshFinance() {
  revalidatePath("/configuracoes");
  revalidatePath("/entradas");
  revalidatePath("/saidas");
}

export async function saveAccountAction(input: unknown): Promise<FinanceActionResult> {
  const parsed = accountInputSchema.safeParse(input);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const supabase = await authorizedClient();
  const { data, error } = await supabase.rpc("finance_save_account", {
    p_id: parsed.data.id,
    p_name: parsed.data.name,
    p_account_type: parsed.data.accountType,
    p_opening_balance: parsed.data.openingBalance,
    p_opening_date: parsed.data.openingDate,
    p_active: parsed.data.active,
  });
  const result = rpcResult(data, error);
  if (result.ok) refreshFinance();
  return result;
}

export async function saveCategoryAction(input: unknown): Promise<FinanceActionResult> {
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const supabase = await authorizedClient();
  const { data, error } = await supabase.rpc("finance_save_category", {
    p_id: parsed.data.id, p_category_type: parsed.data.categoryType,
    p_name: parsed.data.name, p_active: parsed.data.active,
  });
  const result = rpcResult(data, error);
  if (result.ok) refreshFinance();
  return result;
}

export async function saveTransactionAction(input: unknown): Promise<FinanceActionResult> {
  const parsed = transactionInputSchema.safeParse(input);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const supabase = await authorizedClient();
  const { data, error } = await supabase.rpc("finance_save_transaction_with_unit", {
    p_id: parsed.data.id, p_kind: parsed.data.kind,
    p_description: parsed.data.description, p_amount: parsed.data.amount,
    p_category_id: parsed.data.categoryId, p_account_id: parsed.data.accountId,
    p_farm_unit_id: parsed.data.farmUnitId,
    p_competency_date: parsed.data.competencyDate, p_due_date: parsed.data.dueDate,
    p_counterparty: parsed.data.counterparty, p_notes: parsed.data.notes,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  const result = rpcResult(data, error);
  if (result.ok) refreshFinance();
  return result;
}

export async function settleTransactionAction(input: unknown): Promise<FinanceActionResult> {
  const parsed = settleInputSchema.safeParse(input);
  if (!parsed.success) return failure("Dados de liquidação inválidos.");
  const supabase = await authorizedClient();
  const { data, error } = await supabase.rpc("finance_settle_transaction", {
    p_id: parsed.data.id, p_account_id: parsed.data.accountId ?? null, p_settled_on: parsed.data.settledOn,
  });
  const result = rpcResult(data, error);
  if (result.ok) refreshFinance();
  return result;
}

export async function cancelTransactionAction(input: unknown): Promise<FinanceActionResult> {
  const parsed = cancelInputSchema.safeParse(input);
  if (!parsed.success) return failure("Lançamento inválido.");
  const supabase = await authorizedClient();
  const { data, error } = await supabase.rpc("finance_cancel_transaction", { p_id: parsed.data.id });
  const result = rpcResult(data, error);
  if (result.ok) refreshFinance();
  return result;
}

export async function reverseTransactionAction(input: unknown): Promise<FinanceActionResult> {
  const parsed = reverseInputSchema.safeParse(input);
  if (!parsed.success) return failure("Dados do estorno inválidos.");
  const supabase = await authorizedClient();
  const { data, error } = await supabase.rpc("finance_reverse_transaction", {
    p_id: parsed.data.id, p_settled_on: parsed.data.settledOn,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  const result = rpcResult(data, error);
  if (result.ok) refreshFinance();
  return result;
}
