import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Landmark, Warehouse } from "lucide-react";
import { DashboardCard } from "@/components/dashboard-card";
import { InvestmentDistributionChart, InvestmentEvolutionChart, ContributionsChart, ProductiveCategoryChart } from "@/components/investment-charts";
import { InvestmentFilter } from "@/components/investment-filter";
import { InvestmentManager } from "@/components/investment-manager";
import { PageIntro } from "@/components/page-intro";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseDashboardPeriod } from "@/lib/dashboard/period";
import { formatBRL } from "@/lib/finance/money";
import { getInvestmentData } from "@/lib/investments/repository";
import { listFarmUnits, selectedFarmUnit, selectedFarmUnitId } from "@/lib/farm-units/repository";
import { summarizeInvestments, type InvestmentFilters } from "@/lib/investments/summary";

function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle><p className="text-sm text-muted-foreground">{description}</p></CardHeader><CardContent>{children}</CardContent></Card>;
}

export default async function InvestimentosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const units = await listFarmUnits();
  const selectedUnitId = selectedFarmUnitId(params.unit, units);
  const selectedUnit = selectedFarmUnit(units, selectedUnitId);
  const data = await getInvestmentData(selectedUnitId);
  const type: InvestmentFilters["type"] = params.type === "productive" || params.type === "financial" ? params.type : "all";
  const category = typeof params.category === "string" && data.categories.some((item) => item.id === params.category) ? params.category : null;
  const filters: InvestmentFilters = { period: parseDashboardPeriod(params), type, category };
  const summary = summarizeInvestments(data.records, data.movements, filters);
  const { from, to } = filters.period;
  const tabClass = "rounded-lg px-3 py-2 text-sm font-medium transition-colors";
  return <>
    <PageIntro eyebrow="Patrimônio" title={selectedUnit ? `${selectedUnit.name} · Investimentos` : "Investimentos"} description={selectedUnit ? "Acompanhe os investimentos produtivos atribuídos a este núcleo." : "Acompanhe melhorias, equipamentos e aplicações financeiras sem misturar seus objetivos."} />
    <nav aria-label="Tipo de investimento" className="mb-5 flex w-fit flex-wrap gap-1 rounded-xl border bg-white p-1">
      <Link href="/investimentos" className={`${tabClass} ${type === "all" ? "bg-[#eaf3ee] text-primary" : "text-muted-foreground hover:bg-muted"}`}>Visão geral</Link>
      <Link href="/investimentos?type=productive" className={`${tabClass} ${type === "productive" ? "bg-[#eaf3ee] text-primary" : "text-muted-foreground hover:bg-muted"}`}>Na fazenda</Link>
      <Link href="/investimentos?type=financial" className={`${tabClass} ${type === "financial" ? "bg-[#eaf3ee] text-primary" : "text-muted-foreground hover:bg-muted"}`}>Aplicações financeiras</Link>
    </nav>
    <InvestmentFilter filters={filters} categories={data.categories} />
    <p className="mb-4 text-xs text-muted-foreground">Período: {format(parseISO(from), "dd/MM/yyyy")} a {format(parseISO(to), "dd/MM/yyyy")} · valores de mercado são avaliações manuais.</p>
    <div className="mb-6 grid gap-4 sm:grid-cols-2"><DashboardCard title="Melhorias e equipamentos" icon={Warehouse} value={formatBRL(summary.productiveTotal)} note="Total investido em melhorias, máquinas e equipamentos." /><DashboardCard title="Valor atual das aplicações" icon={Landmark} value={formatBRL(summary.currentValue)} note="Última avaliação informada das aplicações financeiras ativas." /></div>
    <InvestmentManager records={summary.visibleRecords} allRecords={data.records} movements={data.movements} categories={data.categories} farmUnits={units} selectedUnitId={selectedUnitId} />
    <details className="mt-6">
      <summary className="flex items-center justify-between rounded-xl border bg-white px-4 py-3 text-sm font-semibold"><span>Mais detalhes dos investimentos</span><span className="mr-3 text-xs font-normal text-muted-foreground">Evolução, distribuição e aportes</span></summary>
      <div className="mt-4 grid gap-4 lg:grid-cols-2"><ChartCard title="Investimentos produtivos por categoria" description="Pagamentos de capital no período, líquidos de estornos"><ProductiveCategoryChart data={summary.productiveCategories} /></ChartCard><ChartCard title="Evolução dos aportes" description="Aplicações iniciais e aportes por mês"><ContributionsChart data={summary.monthly} /></ChartCard><ChartCard title="Distribuição do capital investido" description="Infraestrutura e principal líquido em aplicações"><InvestmentDistributionChart data={summary.distribution} /></ChartCard><ChartCard title="Evolução dos investimentos" description="Valores históricos acumulados por mês"><InvestmentEvolutionChart data={summary.monthly} /></ChartCard></div>
    </details>
  </>;
}
