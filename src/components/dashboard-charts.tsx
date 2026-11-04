"use client";

import { format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/finance/money";
import type { BalancePoint, CategoryValue, MonthlyValue } from "@/lib/dashboard/summary";

const tickMoney = (value: number) => Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const axisTick = { fill: "#718177", fontSize: 11 };

function ChartEmpty({ message }: { message: string }) {
  return <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed bg-[#fbfcfb] px-6 text-center text-sm text-muted-foreground">{message}</div>;
}

function Tip({ title, lines }: { title: string; lines: { label: string; value: string; color: string }[] }) {
  return <div className="rounded-xl border bg-white p-3 text-xs shadow-lg"><p className="mb-2 font-semibold">{title}</p>{lines.map((line) => <p key={line.label} className="mt-1" style={{ color: line.color }}>{line.label}: {formatBRL(line.value)}</p>)}</div>;
}

export function BalanceChart({ data }: { data: (BalancePoint & { plot: number })[] }) {
  if (!data.length || data.every((point) => point.plot === 0)) return <ChartEmpty message="Sem saldo ou movimentações até o fim deste período." />;
  return <div className="h-76 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 2 }}>
    <CartesianGrid stroke="#e8eee9" strokeDasharray="3 4" vertical={false} />
    <XAxis dataKey="day" tickLine={false} axisLine={false} tick={axisTick} minTickGap={28} tickFormatter={(day: string) => format(parseISO(day), "dd/MM")} />
    <YAxis tickLine={false} axisLine={false} tick={axisTick} tickFormatter={tickMoney} width={54} domain={["auto", "auto"]} />
    <Tooltip content={({ active, payload }) => { if (!active || !payload?.length) return null; const row = payload[0].payload as BalancePoint; return <Tip title={format(parseISO(row.day), "dd/MM/yyyy")} lines={[{ label: "Saldo consolidado", value: row.balance_text, color: "#247857" }]} />; }} />
    <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 12 }} />
    <Line type="monotone" dataKey="plot" name="Saldo disponível" stroke="#247857" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
  </LineChart></ResponsiveContainer></div>;
}

export function ResultChart({ data }: { data: MonthlyValue[] }) {
  if (!data.some((month) => month.incomePlot !== 0 || month.expensePlot !== 0)) return <ChartEmpty message="Nenhuma receita ou despesa liquidada neste período." />;
  return <div className="h-76 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 2 }}>
    <CartesianGrid stroke="#e8eee9" strokeDasharray="3 4" vertical={false} />
    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} minTickGap={20} />
    <YAxis tickLine={false} axisLine={false} tick={axisTick} tickFormatter={tickMoney} width={54} />
    <Tooltip content={({ active, payload }) => { if (!active || !payload?.length) return null; const row = payload[0].payload as MonthlyValue; return <Tip title={row.label} lines={[{ label: "Resultado operacional", value: row.resultText, color: "#247857" }]} />; }} />
    <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 12 }} />
    <Line type="monotone" dataKey="resultPlot" name="Resultado por regime de caixa" stroke="#247857" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
  </LineChart></ResponsiveContainer></div>;
}

export function CategoryChart({ data, kind }: { data: CategoryValue[]; kind: "income" | "expense" }) {
  const shown = data.slice(0, 6);
  if (!shown.length) return <ChartEmpty message={`Nenhuma ${kind === "income" ? "receita recebida" : "despesa paga"} neste período.`} />;
  const color = kind === "income" ? "#247857" : "#c59568";
  return <div className="h-76 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={shown} layout="vertical" margin={{ top: 10, right: 16, left: 8, bottom: 2 }}>
    <CartesianGrid stroke="#e8eee9" strokeDasharray="3 4" horizontal={false} />
    <XAxis type="number" tickLine={false} axisLine={false} tick={axisTick} tickFormatter={tickMoney} />
    <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={axisTick} width={100} />
    <Tooltip cursor={{ fill: "#f3f8f4" }} content={({ active, payload }) => { if (!active || !payload?.length) return null; const row = payload[0].payload as CategoryValue; return <Tip title={row.name} lines={[{ label: kind === "income" ? "Recebido líquido" : "Pago líquido", value: row.amount, color }]} />; }} />
    <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 12 }} />
    <Bar dataKey="plot" name={kind === "income" ? "Receitas por categoria" : "Despesas por categoria"} fill={color} radius={[0, 5, 5, 0]} maxBarSize={24} />
  </BarChart></ResponsiveContainer></div>;
}
