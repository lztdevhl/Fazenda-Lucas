import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireOwner() {
  const supabase = await createClient();
  const { data: claims, error } = await supabase.auth.getClaims();
  if (error || !claims?.claims?.sub) redirect("/login");

  const { data: farm, error: farmError } = await supabase
    .from("farms")
    .select("id, name, owner_name")
    .eq("owner_id", claims.claims.sub)
    .maybeSingle();

  if (farmError) throw new Error("Não foi possível carregar a fazenda.");

  return { supabase, userId: claims.claims.sub, farm };
}
