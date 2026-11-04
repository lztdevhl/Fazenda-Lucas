"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/finance/money";
import type { InvestmentChartPoint, InvestmentMonthPoint } from "@/lib/investments/summary";

const axis = { fill: "#718177", fontSize: 11 };
const compact = (value: number) => Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
function Empty({ text }: { text: string }) {
  return <div className="flex h-72 items-center justify-center rounded-xl border border-dashed bg-[#fbfcfb] px-6 text-center text-sm text-muted-foreground">{text}</div>;
}
function Tip({ title, lines }: { title: string; lines: { label: string; amount: string }[] }) {
  return <div className="rounded-xl border bg-white p-3 text-xs shadow-lg"><p className="mb-2 font-semibold">{title}</p>{lines.map((line) => <p key={line.label} className="mt-1 text-[#247857]">{line.label}: {formatBRL(line.amount)}</p>)}</div>;
}

export function ProductiveCategoryChart({ data }: { data: InvestmentChartPoint[] }) {
  if (!data.length) return <Empty text="Nenhum pagamento produtivo neste período." />;
  return <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ top: 8, right: 14, left: 8, bottom: 2 }}>
    <CartesianGrid stroke="#e8eee9" strokeDasharray="3 4" horizontal={false} />
    <XAxis type="number" tick={axis} tickFormatter={compact} tickLine={false} axisLine={false} />
    <YAxis type="category" dataKey="label" tick={axis} tickLine={false} axisLine={false} width={110} />
    <Tooltip cursor={{ fill: "#f3f8f4" }} content={({ active, payload }) => { if (!active || !payload?.length) return null; const row = payload[0].payload as InvestmentChartPoint; return <Tip title={row.label} lines={[{ label: "Investido líquido", amount: row.amount }]} />; }} />
    <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 12 }} />
    <Bar dataKey="plot" name="Investimentos produtivos" fill="#247857" maxBarSize={24} radius={[0, 5, 5, 0]} />
  </BarChart></ResponsiveContainer></div>;
}

export function ContributionsChart({ data }: { data: InvestmentMonthPoint[] }) {
  if (!data.some((point) => point.contributionPlot !== 0)) return <Empty text="Nenhum aporte financeiro neste período." />;
  return <div className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 14, left: 0, bottom: 2 }}>
    <CartesianGrid stroke="#e8eee9" strokeDasharray="3 4" vertical={false} />
    <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={20} />
    <YAxis tick={axis} tickFormatter={compact} tickLine={false} axisLine={false} width={54} />
    <Tooltip content={({ active, payload }) => { if (!active || !payload?.length) return null; const row = payload[0].payload as InvestmentMonthPoint; return <Tip title={row.label} lines={[{ label: "Aportes líquidos", amount: row.contributions }]} />; }} />
    <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 12 }} />
    <Area type="monotone" dataKey="contributionPlot" name="Aportes financeiros" stroke="#247857" fill="#dcefe4" strokeWidth={2} />
  </AreaChart></ResponsiveContainer></div>;
}

export function InvestmentDistributionChart({ data }: { data: InvestmentChartPoint[] }) {
  const positive = data.filter((point) => point.plot > 0);
  if (!positive.length) return <Empty text="Nenhum investimento efetivo até o fim do período." />;
  return <div className="h-72"><ResponsiveContainer width="100%" height="100%"><PieChart>
    <Pie data={positive} dataKey="plot" nameKey="label" cx="50%" cy="47%" innerRadius={48} outerRadius={92} stroke="#ffffff" strokeWidth={3}>{positive.map((point, index) => <Cell key={point.label} fill={index === 0 ? "#247857" : "#c59568"} />)}</Pie>
    <Tooltip content={({ active, payload }) => { if (!active || !payload?.length) return null; const row = payload[0].payload as InvestmentChartPoint; return <Tip title={row.label} lines={[{ label: "Valor histórico", amount: row.amount }]} />; }} />
    <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 12 }} />
  </PieChart></ResponsiveContainer></div>;
}

export function InvestmentEvolutionChart({ data }: { data: InvestmentMonthPoint[] }) {
  if (!data.some((point) => point.productivePlot !== 0 || point.financialPlot !== 0)) return <Empty text="Nenhum investimento efetivo neste intervalo." />;
  return <div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 14, left: 0, bottom: 2 }}>
    <CartesianGrid stroke="#e8eee9" strokeDasharray="3 4" vertical={false} />
    <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={20} />
    <YAxis tick={axis} tickFormatter={compact} tickLine={false} axisLine={false} width={54} />
    <Tooltip content={({ active, payload }) => { if (!active || !payload?.length) return null; const row = payload[0].payload as InvestmentMonthPoint; return <Tip title={row.label} lines={[{ label: "Infraestrutura", amount: row.productive }, { label: "Aplicações, principal líquido", amount: row.financial }]} />; }} />
    <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 12 }} />
    <Line type="monotone" dataKey="productivePlot" name="Infraestrutura" stroke="#247857" strokeWidth={2.5} dot={false} />
    <Line type="monotone" dataKey="financialPlot" name="Aplicações, principal líquido" stroke="#c59568" strokeWidth={2.5} dot={false} />
  </LineChart></ResponsiveContainer></div>;
}
