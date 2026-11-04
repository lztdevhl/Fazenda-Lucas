"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/finance/money";
import type { MonthlyValue } from "@/lib/dashboard/summary";

export function FinancialChart({ data }: { data: MonthlyValue[] }) {
  const hasValues = data.some((month) => month.incomePlot !== 0 || month.expensePlot !== 0);
  if (!hasValues) return <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed bg-[#fbfcfb] px-6 text-center"><p className="text-sm font-medium">Nenhuma liquidação neste período</p><p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">Lançamentos pendentes só entram no gráfico após o recebimento ou pagamento.</p></div>;

  return <div className="h-76 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 2 }}><CartesianGrid stroke="#e8eee9" strokeDasharray="3 4" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#718177", fontSize: 11 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: "#718177", fontSize: 11 }} tickFormatter={(value: number) => Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value)} /><Tooltip cursor={{ fill: "#f3f8f4" }} content={({ active, payload, label }) => { if (!active || !payload?.length) return null; const row = payload[0].payload as MonthlyValue; return <div className="rounded-xl border bg-white p-3 text-xs shadow-lg"><p className="mb-2 font-semibold">{label}</p><p className="text-[#1f7653]">Entradas: {formatBRL(row.incomeText)}</p><p className="mt-1 text-[#a5764a]">Saídas: {formatBRL(row.expenseText)}</p></div>; }} /><Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="incomePlot" name="Entradas recebidas" fill="#247857" radius={[5, 5, 0, 0]} maxBarSize={44} /><Bar dataKey="expensePlot" name="Saídas pagas" fill="#c59568" radius={[5, 5, 0, 0]} maxBarSize={44} /></BarChart></ResponsiveContainer></div>;
}
