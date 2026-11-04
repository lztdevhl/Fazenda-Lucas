"use client";

import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import writeExcelFile from "write-excel-file/browser";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/finance/money";
import type { ReportFilters, ReportModel } from "@/lib/reports/types";

const labels: Record<ReportFilters["kind"], string> = {
  cashflow: "Fluxo de caixa", income: "Receitas", expense: "Despesas", operational: "Resultado operacional",
  payables: "Contas a pagar", receivables: "Contas a receber", investments: "Investimentos",
};

function periodLabel(filters: ReportFilters) {
  return `${format(parseISO(filters.period.from), "dd/MM/yyyy")} a ${format(parseISO(filters.period.to), "dd/MM/yyyy")}`;
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function csvValue(value: unknown) {
  const text = typeof value === "number" ? value.toFixed(2).replace(".", ",") : String(value ?? "");
  return /[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportCsv(model: ReportModel, filters: ReportFilters, farmUnitName: string) {
  const [sheetName, rows] = Object.entries(model.exportSheets)[0] ?? [labels[filters.kind], []];
  const headers = rows.length ? ["Núcleo", ...Object.keys(rows[0])] : ["Núcleo", "Relatório"];
  const content = [headers, ...rows.map((row) => [farmUnitName, ...Object.keys(row).map((header) => row[header] ?? "")])].map((row) => row.map(csvValue).join(";")).join("\r\n");
  download(`${sheetName.toLowerCase().replaceAll(" ", "-")}.csv`, new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8" }));
}

async function exportExcel(model: ReportModel, filters: ReportFilters, farmName: string, farmUnitName: string) {
  const parameters = [{ Parâmetro: "Fazenda", Valor: farmName }, { Parâmetro: "Núcleo", Valor: farmUnitName }, { Parâmetro: "Relatório", Valor: labels[filters.kind] }, { Parâmetro: "Período", Valor: periodLabel(filters) }, { Parâmetro: "Regime", Valor: filters.regime === "cash" ? "Caixa" : "Competência" }];
  const sheets = [{ sheet: "Parâmetros", data: toSheetData(parameters), columns: [{ width: 18 }, { width: 40 }] }, ...Object.entries(model.exportSheets).map(([sheet, rows]) => ({ sheet: sheet.slice(0, 31), data: toSheetData(rows), columns: Object.keys(rows[0] ?? {}).map((key) => ({ width: Math.min(36, Math.max(14, key.length + 4)) })) }))];
  const blob = await writeExcelFile(sheets).toBlob();
  download(`${labels[filters.kind].toLowerCase().replaceAll(" ", "-")}.xlsx`, blob);
}

function toSheetData(rows: Array<Record<string, string | number>>) {
  const headers = Object.keys(rows[0] ?? {});
  const header = headers.map((value) => ({ value, fontWeight: "bold" as const, backgroundColor: "#174b3c", textColor: "#FFFFFF" }));
  return [header, ...rows.map((row) => headers.map((key) => {
    const value = row[key] ?? "";
    if (typeof value === "number") return { value, type: Number, format: "#,##0.00" };
    if ((key === "Data" || key === "Vencimento") && /^\d{4}-\d{2}-\d{2}$/.test(value)) return { value: new Date(`${value}T00:00:00`), type: Date, format: "dd/mm/yyyy" };
    return { value };
  }))];
}

export function ReportsWorkspace({ filters, model, farmName, farmUnitName }: { filters: ReportFilters; model: ReportModel; farmName: string; farmUnitName: string }) {
  const generatedAt = format(new Date(), "dd/MM/yyyy HH:mm");
  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3 print:hidden">
      <div><p className="text-sm font-semibold">Exportar relatório filtrado</p><p className="text-xs text-muted-foreground">Os arquivos usam exatamente o período e os filtros ativos.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => exportCsv(model, filters, farmUnitName)}><Download size={15} />CSV</Button>
        <Button variant="outline" size="sm" onClick={() => void exportExcel(model, filters, farmName, farmUnitName)}><FileSpreadsheet size={15} />Excel</Button>
        <Button size="sm" onClick={() => window.print()}><Printer size={15} />Exportar PDF</Button>
      </div>
    </div>
    <section className="print-report">
      <div className="mb-5 hidden print:block"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{farmName} · {farmUnitName}</p><h1 className="mt-2 text-2xl font-semibold">{model.title}</h1><p className="mt-1 text-sm text-muted-foreground">Período: {periodLabel(filters)} · Gerado em {generatedAt}</p></div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {model.metrics.map((item) => <Card key={item.label} className="rounded-xl"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{item.label}</p><p className={`mt-2 text-xl font-semibold ${item.tone === "negative" ? "text-[#b04c42]" : item.tone === "positive" ? "text-primary" : item.tone === "warning" ? "text-[#a36d1d]" : ""}`}>{item.label.includes("Margem") ? item.value : formatBRL(item.value)}</p></CardContent></Card>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card><CardHeader><CardTitle>{model.title}</CardTitle><p className="text-sm text-muted-foreground">{model.subtitle}</p></CardHeader><CardContent>
          {model.lines.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="pb-3 pr-3">Data</th><th className="pb-3 pr-3">Descrição</th><th className="pb-3 pr-3">Categoria</th><th className="pb-3 pr-3">Status</th><th className="pb-3 text-right">Valor</th></tr></thead><tbody className="divide-y">{model.lines.map((line) => <tr key={line.id}><td className="py-3 pr-3 whitespace-nowrap">{format(parseISO(line.date), "dd/MM/yyyy")}</td><td className="max-w-64 py-3 pr-3"><p className="truncate font-medium">{line.description}</p>{line.counterparty && <p className="truncate text-xs text-muted-foreground">{line.counterparty}</p>}</td><td className="py-3 pr-3 text-muted-foreground">{line.category}</td><td className="py-3 pr-3"><span className="rounded-full bg-muted px-2 py-1 text-xs">{line.status}{line.daysOverdue ? ` · ${line.daysOverdue}d` : ""}</span></td><td className={`py-3 text-right font-semibold ${line.amount.startsWith("-") ? "text-[#b04c42]" : ""}`}>{formatBRL(line.amount)}</td></tr>)}</tbody></table></div> : <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground"><FileText size={18} className="mr-2" />Nenhum dado para os filtros selecionados.</div>}
        </CardContent></Card>
        <div className="space-y-4">
          {model.chart && <Card><CardHeader><CardTitle>{model.chart.title}</CardTitle></CardHeader><CardContent><div className="space-y-3">{model.chart.points.map((point) => { const max = Math.max(...model.chart!.points.map((item) => Math.abs(item.plot)), 1); return <div key={point.label}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="text-muted-foreground">{point.label}</span><span className="font-medium">{formatBRL(point.value)}</span></div><div className="h-2 rounded-full bg-muted"><div className={`h-2 rounded-full ${point.plot < 0 ? "bg-[#c8796e]" : "bg-primary"}`} style={{ width: `${Math.max(3, Math.min(100, Math.abs(point.plot) / max * 100))}%` }} /></div></div>; })}</div></CardContent></Card>}
          <Card><CardHeader><CardTitle>Critérios e limitações</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm text-muted-foreground">{model.notes.map((note) => <li key={note} className="flex gap-2"><span className="text-primary">•</span><span>{note}</span></li>)}</ul></CardContent></Card>
        </div>
      </div>
      <div className="mt-6 hidden border-t pt-3 text-xs text-muted-foreground print:flex print:justify-between"><span>{farmName} · {farmUnitName} · {model.title} · {periodLabel(filters)}</span><span>Fazenda Financeiro · página <span className="page-number" /></span></div>
    </section>
  </>;
}
