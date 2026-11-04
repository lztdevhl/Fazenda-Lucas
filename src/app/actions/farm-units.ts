"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { farmUnitInputSchema } from "@/lib/farm-units/validation";

type Result = { ok: true; id: string } | { ok: false; error: string };

export async function saveFarmUnitAction(input: unknown): Promise<Result> {
  const parsed = farmUnitInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const owner = await requireOwner();
  if (!owner.farm) return { ok: false, error: "Fazenda não configurada." };
  const { data, error } = await owner.supabase.rpc("finance_save_farm_unit", {
    p_id: parsed.data.id,
    p_name: parsed.data.name,
    p_code: parsed.data.code || null,
    p_description: parsed.data.description || null,
    p_is_active: parsed.data.isActive,
  });
  if (error || typeof data !== "string") return { ok: false, error: error?.message ?? "Não foi possível salvar o núcleo." };
  revalidatePath("/configuracoes");
  revalidatePath("/dashboard");
  revalidatePath("/entradas");
  revalidatePath("/saidas");
  revalidatePath("/investimentos");
  revalidatePath("/relatorios");
  return { ok: true, id: data };
}
