"use client";

import { useState } from "react";
import type { DashboardPeriod } from "@/lib/dashboard/period";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DateRangeFilter({ period }: { period: DashboardPeriod }) {
  const [selected, setSelected] = useState(period.preset);
  return <form method="get" className="flex flex-wrap items-end gap-2"><label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Período<select name="period" value={selected} onChange={(event) => setSelected(event.target.value as DashboardPeriod["preset"])} className="h-10 min-w-42 rounded-lg border bg-white px-3 text-sm text-foreground"><option value="month">Mês atual</option><option value="3m">Últimos 3 meses</option><option value="6m">Últimos 6 meses</option><option value="year">Ano atual</option><option value="custom">Personalizado</option></select></label>{selected === "custom" && <><label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">De<Input name="from" type="date" defaultValue={period.preset === "custom" ? period.from : ""} required className="h-10" /></label><label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Até<Input name="to" type="date" defaultValue={period.preset === "custom" ? period.to : ""} required className="h-10" /></label></>}<Button type="submit" variant="outline" className="h-10">Aplicar</Button></form>;
}
