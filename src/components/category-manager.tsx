"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { saveCategoryAction } from "@/app/actions/finance";
import { FinanceDialog } from "@/components/finance-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FinancialCategory, TransactionKind } from "@/lib/finance/types";

function CategoryForm({ category, onDone }: { category: FinancialCategory | null; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(category?.name ?? "");
  const [kind, setKind] = useState<TransactionKind>(category?.category_type ?? "expense");
  const [active, setActive] = useState(category?.active ?? true);
  const [pending, startTransition] = useTransition();
  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const result = await saveCategoryAction({ id: category?.id ?? null, categoryType: kind, name, active });
        if (!result.ok) { toast.error(result.error); return; }
        toast.success(category ? "Categoria atualizada." : "Categoria criada.");
        onDone(); router.refresh();
      } catch { toast.error("Não foi possível salvar a categoria."); }
    });
  }
  return <form onSubmit={submit} className="space-y-5"><div className="space-y-2"><Label htmlFor="category-name">Nome</Label><Input id="category-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} required /></div><div className="space-y-2"><Label htmlFor="category-kind">Tipo</Label><select id="category-kind" value={kind} onChange={(event) => setKind(event.target.value as TransactionKind)} disabled={Boolean(category)} className="h-11 w-full rounded-lg border bg-white px-3 text-sm"><option value="expense">Despesa</option><option value="income">Receita</option></select></div><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="size-4 accent-[#174b3c]" />Categoria ativa</label><div className="flex justify-end gap-2 border-t pt-5"><Button type="button" variant="outline" onClick={onDone}>Cancelar</Button><Button disabled={pending}>{pending ? "Salvando..." : "Salvar categoria"}</Button></div></form>;
}

export function CategoryManager({ categories }: { categories: FinancialCategory[] }) {
  const [editing, setEditing] = useState<FinancialCategory | null>(null);
  const [open, setOpen] = useState(false);
  function openForm(category: FinancialCategory | null) { setEditing(category); setOpen(true); }
  return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Categorias</h2><p className="mt-1 text-sm text-muted-foreground">Personalize a classificação dos lançamentos.</p></div><Button variant="outline" onClick={() => openForm(null)}><Plus size={17} />Nova categoria</Button></div><Card className="divide-y">{categories.map((category) => <div key={category.id} className="flex items-center justify-between gap-3 px-5 py-3.5"><div><p className="text-sm font-medium">{category.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{category.category_type === "income" ? "Receita" : "Despesa"} · {category.active ? "Ativa" : "Inativa"}</p></div><Button variant="ghost" size="sm" onClick={() => openForm(category)} aria-label={`Editar ${category.name}`}><Pencil size={15} /></Button></div>)}</Card><FinanceDialog open={open} onOpenChange={setOpen} title={editing ? "Editar categoria" : "Nova categoria"}><CategoryForm key={editing?.id ?? "new"} category={editing} onDone={() => setOpen(false)} /></FinanceDialog></section>;
}
