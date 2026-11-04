"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InvestmentFilters } from "@/lib/investments/summary";
import type { InvestmentCategory } from "@/lib/investments/types";

export function InvestmentFilter({ filters, categories }: { filters: InvestmentFilters; categories: InvestmentCategory[] }) {
  const [preset, setPreset] = useState(filters.period.preset);
  return <form method="get" className="mb-6 rounded-2xl border bg-white p-4"><input type="hidden" name="type" value={filters.type} />
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex min-w-52 flex-1 flex-col gap-1.5 text-xs font-medium text-muted-foreground">Período<select name="period" value={preset} onChange={(event) => setPreset(event.target.value as typeof preset)} className="h-10 rounded-lg border bg-white px-3 text-sm text-foreground"><option value="month">Mês atual</option><option value="3m">Últimos 3 meses</option><option value="6m">Últimos 6 meses</option><option value="year">Ano atual</option><option value="custom">Personalizado</option></select></label><Button type="submit" variant="outline" className="h-10">Aplicar filtros</Button></div>
    {preset === "custom" && <div className="mt-3 flex flex-wrap gap-3 border-t pt-3"><label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">De<Input name="from" type="date" required defaultValue={filters.period.preset === "custom" ? filters.period.from : ""} className="h-10" /></label><label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Até<Input name="to" type="date" required defaultValue={filters.period.preset === "custom" ? filters.period.to : ""} className="h-10" /></label></div>}
    <details className="mt-3 border-t pt-3"><summary className="flex items-center justify-between text-xs font-semibold text-muted-foreground"><span>Mais filtros</span><span className="mr-3 font-normal">categoria</span></summary><div className="mt-3 max-w-sm"><label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Categoria<select name="category" defaultValue={filters.category ?? ""} className="h-10 rounded-lg border bg-white px-3 text-sm text-foreground"><option value="">Todas as categorias</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div></details>
  </form>;
}
