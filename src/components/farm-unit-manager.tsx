"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { saveFarmUnitAction } from "@/app/actions/farm-units";
import { FinanceDialog } from "@/components/finance-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FarmUnit } from "@/lib/farm-units/types";

function UnitForm({ unit, onDone }: { unit: FarmUnit | null; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(unit?.name ?? "");
  const [code, setCode] = useState(unit?.code ?? "");
  const [description, setDescription] = useState(unit?.description ?? "");
  const [isActive, setIsActive] = useState(unit?.is_active ?? true);
  const [pending, startTransition] = useTransition();
  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveFarmUnitAction({ id: unit?.id ?? null, name, code: code || null, description: description || null, isActive });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success(unit ? "Núcleo atualizado." : "Núcleo criado.");
      onDone();
      router.refresh();
    });
  }
  return <form onSubmit={submit} className="space-y-5"><div className="space-y-2"><Label htmlFor="unit-name">Nome do núcleo</Label><Input id="unit-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Núcleo 01" required maxLength={120} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="unit-code">Código <span className="font-normal text-muted-foreground">(opcional)</span></Label><Input id="unit-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Ex.: N01" maxLength={40} /></div><label className="flex items-center gap-3 self-end pb-2 text-sm"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="size-4 accent-[#174b3c]" />Núcleo ativo</label></div><div className="space-y-2"><Label htmlFor="unit-description">Descrição <span className="font-normal text-muted-foreground">(opcional)</span></Label><textarea id="unit-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={500} className="w-full resize-y rounded-lg border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-3 focus:ring-primary/10" /></div><div className="flex justify-end gap-2 border-t pt-5"><Button type="button" variant="outline" onClick={onDone}>Cancelar</Button><Button disabled={pending}>{pending ? "Salvando..." : "Salvar núcleo"}</Button></div></form>;
}

export function FarmUnitManager({ units }: { units: FarmUnit[] }) {
  const [editing, setEditing] = useState<FarmUnit | null>(null);
  const [open, setOpen] = useState(false);
  function openForm(unit: FarmUnit | null) { setEditing(unit); setOpen(true); }
  return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Núcleos de produção</h2><p className="mt-1 text-sm text-muted-foreground">Organize resultados por núcleo sem alterar lançamentos antigos.</p></div><Button onClick={() => openForm(null)}><Plus size={17} />Novo núcleo</Button></div>{units.length ? <Card className="divide-y">{units.map((unit) => <div key={unit.id} className="flex items-center justify-between gap-3 px-5 py-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{unit.name}</p>{unit.code && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{unit.code}</span>}<span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${unit.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{unit.is_active ? "Ativo" : "Inativo"}</span></div>{unit.description && <p className="mt-1 truncate text-xs text-muted-foreground">{unit.description}</p>}</div><Button variant="ghost" size="sm" onClick={() => openForm(unit)} aria-label={`Editar ${unit.name}`}><Pencil size={15} />Editar</Button></div>)}</Card> : <Card className="p-8 text-center"><p className="font-medium">Nenhum núcleo cadastrado</p><p className="mt-2 text-sm text-muted-foreground">Os lançamentos sem núcleo continuam classificados como Geral da fazenda.</p></Card>}<FinanceDialog open={open} onOpenChange={setOpen} title={editing ? "Editar núcleo" : "Novo núcleo"} description="Núcleos inativos continuam disponíveis para consultas históricas."><UnitForm key={editing?.id ?? "new"} unit={editing} onDone={() => setOpen(false)} /></FinanceDialog></section>;
}
