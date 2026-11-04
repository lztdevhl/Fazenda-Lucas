"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <Card className="mx-auto max-w-xl p-8"><span className="mb-5 flex size-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><AlertCircle size={24} /></span><h1 className="text-xl font-semibold">Não foi possível carregar esta página</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Verifique a conexão com o Supabase e se as migrations descritas no README foram aplicadas. Depois, tente novamente.</p><Button className="mt-6" onClick={reset}>Tentar novamente</Button></Card>;
}
