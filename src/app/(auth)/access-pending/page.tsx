import { redirect } from "next/navigation";
import { ShieldCheck, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function AccessPendingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  const { data: farm } = await supabase.from("farms").select("id").eq("owner_id", data.claims.sub).maybeSingle();
  if (farm) redirect("/dashboard");

  return <Card className="p-8"><span className="mb-5 flex size-12 items-center justify-center rounded-xl bg-[#eaf3ee] text-primary"><ShieldCheck size={24} /></span><h1 className="text-2xl font-semibold">Acesso ainda não configurado</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Sua conta está autenticada, mas ainda não foi vinculada à fazenda. Solicite ao administrador que conclua o procedimento de provisionamento.</p><form action={signOutAction} className="mt-7"><Button variant="outline"><LogOut size={16} />Sair</Button></form></Card>;
}
