import { BarChart3, CalendarDays, Filter, SlidersHorizontal } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { ReportsWorkspace } from "@/components/reports-workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { parseReportFilters } from "@/lib/reports/filters";
import { getReportData } from "@/lib/reports/repository";
import { summarizeReport } from "@/lib/reports/summary";
import type { ReportFilters } from "@/lib/reports/types";
import { selectedFarmUnitId } from "@/lib/farm-units/context";

const reportOptions: Array<{ value: ReportFilters["kind"]; label: string; description: string }> = [
  { value: "cashflow", label: "Fluxo de caixa", description: "O que entrou e saiu" },
  { value: "income", label: "Entradas", description: "Recebimentos por período" },
  { value: "expense", label: "Saídas", description: "Gastos pagos e pendentes" },
  { value: "operational", label: "Resultado financeiro", description: "Receitas menos despesas" },
  { value: "payables", label: "Contas a pagar", description: "Obrigações pendentes" },
  { value: "receivables", label: "Contas a receber", description: "Recebimentos previstos" },
  { value: "investments", label: "Investimentos", description: "Patrimônio e aplicações" },
];

function dateLabel(value: string) { return value.split("-").reverse().join("/"); }

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const allData = await getReportData();
  const parsed = parseReportFilters(params);
  const farmUnits = allData.farmUnits ?? [];
  const farmUnitId = selectedFarmUnitId(params.unit, farmUnits);
  const data = farmUnitId ? await getReportData(farmUnitId) : allData;
  const filters: ReportFilters = { ...parsed,
    accountId: null,
    farmUnitId,
    categoryId: parsed.categoryId && data.categories.some((category) => category.id === parsed.categoryId) ? parsed.categoryId : null,
  };
  const model = summarizeReport(data, filters);
  return <>
    <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between print:hidden"><PageIntro eyebrow="Análises" title="Relatórios" description="Escolha uma visão para entender o caixa, a operação ou os investimentos." /><div className="mb-7 flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs text-muted-foreground"><BarChart3 size={16} className="text-primary" />Dados atualizados</div></div>
    <Card className="mb-5 print:hidden"><CardContent className="p-4 sm:p-5"><form method="get" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_auto] sm:items-end"><label><span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Filter size={14} />Quero ver</span><select name="report" defaultValue={filters.kind} className="h-10 w-full rounded-lg border bg-white px-3 text-sm">{reportOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label><span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><CalendarDays size={14} />Período</span><select name="period" defaultValue={filters.period.preset} className="h-10 w-full rounded-lg border bg-white px-3 text-sm"><option value="month">Mês atual</option><option value="3m">Últimos 3 meses</option><option value="6m">Últimos 6 meses</option><option value="year">Ano atual</option><option value="custom">Personalizado</option></select></label><label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Núcleo</span><select name="unit" defaultValue={filters.farmUnitId ?? ""} className="h-10 w-full rounded-lg border bg-white px-3 text-sm"><option value="">Toda a fazenda</option>{allData.farmUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}{unit.is_active ? "" : " (inativo)"}</option>)}</select></label><Button type="submit" className="h-10"><SlidersHorizontal size={15} />Atualizar</Button></div>
      <p className="text-xs text-muted-foreground">{reportOptions.find((option) => option.value === filters.kind)?.description} · {dateLabel(filters.period.from)} a {dateLabel(filters.period.to)}</p>
      <details className="border-t pt-3"><summary className="flex items-center justify-between text-xs font-semibold text-muted-foreground"><span>Mais filtros</span><span className="mr-3 font-normal">categoria, núcleo e critérios avançados</span></summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">De</span><input type="date" name="from" defaultValue={filters.period.from} className="h-10 w-full rounded-lg border bg-white px-3 text-sm" /></label><label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Até</span><input type="date" name="to" defaultValue={filters.period.to} className="h-10 w-full rounded-lg border bg-white px-3 text-sm" /></label><label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Categoria</span><select name="category" defaultValue={filters.categoryId ?? ""} className="h-10 w-full rounded-lg border bg-white px-3 text-sm"><option value="">Todas as categorias</option>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Agrupar fluxo por</span><select name="group" defaultValue={filters.grouping} className="h-10 w-full rounded-lg border bg-white px-3 text-sm"><option value="day">Dia</option><option value="month">Mês</option><option value="period">Período</option></select></label><label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Regime do resultado</span><select name="regime" defaultValue={filters.regime} className="h-10 w-full rounded-lg border bg-white px-3 text-sm"><option value="cash">Caixa</option><option value="competence">Competência</option></select></label></div></details>
    </form></CardContent></Card>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground print:hidden"><span>Período ativo: {dateLabel(filters.period.from)} a {dateLabel(filters.period.to)}</span><span>{filters.regime === "cash" ? "Regime de caixa" : "Regime de competência"} · cancelados excluídos</span></div>
    <ReportsWorkspace filters={filters} model={model} farmName={data.farmName} farmUnitName={filters.farmUnitId ? farmUnits.find((unit) => unit.id === filters.farmUnitId)?.name ?? "Núcleo" : "Toda a fazenda"} />
  </>;
}
