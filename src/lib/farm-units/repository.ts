import "server-only";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { farmUnitRowSchema } from "./validation";
import type { FarmUnit } from "./types";
export { selectedFarmUnit, selectedFarmUnitId } from "./context";

async function context() {
  const owner = await requireOwner();
  if (!owner.farm) redirect("/access-pending");
  return owner;
}

export async function listFarmUnits(): Promise<FarmUnit[]> {
  const { supabase } = await context();
  const { data, error } = await supabase.rpc("finance_farm_unit_list");
  if (error) throw new Error("Não foi possível carregar os núcleos de produção. Aplique a migration de núcleos.");
  return farmUnitRowSchema.array().parse(data ?? []);
}

