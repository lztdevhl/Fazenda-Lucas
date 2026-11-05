import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, BanknoteArrowDown, BanknoteArrowUp, Clock3, CircleDollarSign, Landmark, Plus, Wallet, Warehouse } from "lucide-react";
import { BalanceChart, CategoryChart, ResultChart } from "@/components/dashboard-charts";
import { DashboardCard } from "@/components/dashboard-card";
import { DateRangeFilter } from "@/components/date-range-filter";
import { FinancialChart } from "@/components/financial-chart";
import { PageIntro } from "@/components/page-intro";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseDashboardPeriod } from "@/lib/dashboard/period";
import { getDashboardSummary } from "@/lib/dashboard/repository";
import { listFarmUnits, selectedFarmUnit, selectedFarmUnitId } from "@/lib/farm-units/repository";
import type { DashboardEvent, DueItem } from "@/lib/dashboard/summary";
import { formatBRL } from "@/lib/finance/money";

const dateLabel = (value: string) => format(parseISO(value), "dd/MM/yyyy");

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23",
  }).format(new Date()));
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle><p className="text-sm text-muted-foreground">{description}</p></CardHeader><CardContent>{children}</CardContent></Card>;
}

function DueList({ title, items, kind, unitId }: { title: string; items: DueItem[]; kind: "income" | "expense"; unitId: string | null }) {
  const unitQuery = unitId ? `?unit=${encodeURIComponent(unitId)}` : "";
  return <Card><CardHeader><CardTitle>{title}</CardTitle><p className="text-sm text-muted-foreground">Compromissos futuros, por vencimento</p></CardHeader><CardContent>
    {items.length ? <div className="divide-y">{items.map((item) => <Link key={item.id} href={`${kind === "income" ? "/entradas" : "/saidas"}${unitQuery}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 hover:text-primary"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.description}</p><p className="mt-1 text-xs text-muted-foreground">Vence em {dateLabel(item.due_date)}</p></div><span className="shrink-0 text-sm font-semibold">{formatBRL(item.amount_text)}</span></Link>)}</div>
      : <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed bg-[#fbfcfb] px-5 text-center"><Clock3 size={22} className="mb-2 text-[#9eb4a5]" /><p className="text-sm text-muted-foreground">Nenhuma conta futura a {kind === "income" ? "receber" : "pagar"}.</p></div>}
  </CardContent></Card>;
}

function isOutflow(item: DashboardEvent) {
  return ["expense", "capital_expenditure", "investment_contribution", "reversal_income", "reversal_investment_withdrawal"].includes(item.kind);
}

function RecentMovements({ items, unitId }: { items: DashboardEvent[]; unitId: string | null }) {
  const reportQuery = unitId ? `&unit=${encodeURIComponent(unitId)}` : "";
  return <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Movimentações recentes</CardTitle><p className="mt-1 text-sm text-muted-foreground">As cinco últimas movimentações liquidadas.</p></div><Link href={`/relatorios?report=cashflow${reportQuery}`} className="text-sm font-medium text-primary hover:underline">Ver todas</Link></CardHeader><CardContent>
    {items.length ? <div className="divide-y">{items.slice(0, 5).map((item) => { const outflow = isOutflow(item); const Icon = item.kind === "transfer" ? ArrowLeftRight : outflow ? ArrowUpRight : ArrowDownLeft; return <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0"><span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${item.kind === "transfer" ? "bg-slate-100 text-slate-600" : outflow ? "bg-[#fff1ef] text-[#b45b50]" : "bg-[#eaf5ee] text-primary"}`}><Icon size={16} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.description}</p><p className="mt-1 truncate text-xs text-muted-foreground">{dateLabel(item.event_date)} · {item.category_name ?? "Movimentação"}</p></div><span className={`shrink-0 text-sm font-semibold tabular-nums ${outflow ? "text-[#a74d43]" : "text-primary"}`}>{outflow ? "−" : item.kind === "transfer" ? "↔" : "+"}{formatBRL(item.amount_text)}</span></div>; })}</div>
      : <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed bg-[#fbfcfb] px-5 text-center text-sm text-muted-foreground">Nenhuma movimentação liquidada neste período.</div>}
  </CardContent></Card>;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const period = parseDashboardPeriod(params);
  const units = await listFarmUnits();
  const selectedUnitId = selectedFarmUnitId(params.unit, units);
  const selectedUnit = selectedFarmUnit(units, selectedUnitId);
  const summary = await getDashboardSummary(period, selectedUnitId);
  const unitQuery = selectedUnitId ? `&unit=${encodeURIComponent(selectedUnitId)}` : "";
  return <>
    <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><PageIntro eyebrow="Visão geral" title={selectedUnit ? `${selectedUnit.name} · Dashboard` : `${greeting()}, proprietário`} description={selectedUnit ? "Acompanhe os resultados atribuídos a este núcleo." : "Acompanhe o que entrou, o que saiu e o que precisa de atenção."} /><div className="mb-7"><DateRangeFilter period={period} /></div></div>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Período: {dateLabel(period.from)} a {dateLabel(period.to)} · {selectedUnit ? `núcleo ${selectedUnit.name}` : "toda a fazenda"} · valores realizados pela data de liquidação.</p><div className="flex flex-wrap gap-2"><Link href={`/entradas?novo=1${unitQuery}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-medium hover:bg-[#eef5f0]"><Plus size={14} />Nova entrada</Link><Link href={`/saidas?novo=1${unitQuery}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-white hover:bg-[#103d30]"><Plus size={14} />Nova saída</Link></div></div>
    <section aria-label="Resumo financeiro" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <DashboardCard title="Saldo disponível" icon={Wallet} value={selectedUnit ? "—" : formatBRL(summary.balance)} note={selectedUnit ? "Saldo bancário compartilhado não é separado por núcleo." : `Saldo consolidado até ${dateLabel(period.to)}.`} />
      <DashboardCard title="Entrou no mês" icon={ArrowDownLeft} value={formatBRL(summary.income)} note="Dinheiro recebido no período, líquido de estornos." />
      <DashboardCard title="Saiu no mês" icon={ArrowUpRight} value={formatBRL(summary.cashOutflow)} note="Despesas pagas, investimentos e aportes; transferências internas ficam fora." />
      <DashboardCard title="Contas a pagar" icon={BanknoteArrowUp} value={formatBRL(summary.payable)} note="Obrigações pendentes com vencimento no período selecionado." />
      <DashboardCard title="Contas a receber" icon={BanknoteArrowDown} value={formatBRL(summary.receivable)} note="Recebimentos pendentes com vencimento no período selecionado." />
    </section>
    <section className="mb-6" aria-label="Movimentações recentes"><RecentMovements items={summary.recent} unitId={selectedUnitId} /></section>
    <details className="group">
      <summary className="mb-4 flex items-center justify-between rounded-xl border bg-white px-4 py-3 text-sm font-semibold shadow-[0_1px_2px_rgba(20,48,34,0.035)]"><span>Mais detalhes</span><span className="ml-auto mr-3 text-xs font-normal text-muted-foreground">Resultados, gráficos e compromissos</span></summary>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Entradas e saídas operacionais" description="Receitas e despesas pagas; investimentos ficam separados"><FinancialChart data={summary.monthly} /></ChartCard>
        <ChartCard title="Evolução do saldo" description="Saldo consolidado ao longo do período"><BalanceChart data={summary.balanceSeries} /></ChartCard>
        <ChartCard title="Despesas por categoria" description="Gastos operacionais líquidos de estornos"><CategoryChart data={summary.expenseCategories} kind="expense" /></ChartCard>
        <ChartCard title="Receitas por categoria" description="Principais fontes de receita líquidas de estornos"><CategoryChart data={summary.incomeCategories} kind="income" /></ChartCard>
        <ChartCard title="Resultado operacional" description="Dinheiro recebido menos despesas operacionais pagas"><ResultChart data={summary.monthly} /></ChartCard>
        <div className="grid gap-4"><DueList title="Próximas contas a pagar" items={summary.nextPayables} kind="expense" unitId={selectedUnitId} /><DueList title="Próximas contas a receber" items={summary.nextReceivables} kind="income" unitId={selectedUnitId} /></div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3"><Card className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Warehouse size={15} className="text-primary" />Investimentos na fazenda</div><p className="mt-3 text-lg font-semibold">{formatBRL(summary.productiveInvestments)}</p><p className="mt-1 text-xs text-muted-foreground">Pagamentos de capital no período.</p></Card><Card className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Landmark size={15} className="text-primary" />Aportes</div><p className="mt-3 text-lg font-semibold">{formatBRL(summary.financialContributions)}</p><p className="mt-1 text-xs text-muted-foreground">Transferências para aplicações.</p></Card><Card className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><CircleDollarSign size={15} className="text-primary" />Resgates</div><p className="mt-3 text-lg font-semibold">{formatBRL(summary.financialWithdrawals)}</p><p className="mt-1 text-xs text-muted-foreground">Recursos que voltaram ao caixa.</p></Card></div>
    </details>
  </>;
}
