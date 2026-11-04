"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Eye, Pencil, Plus, RotateCcw } from "lucide-react";
import {
  cancelPlannedInvestmentAction, reverseInvestmentMovementAction, reverseProductiveAction,
} from "@/app/actions/investments";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FinanceDialog } from "@/components/finance-dialog";
import { ApplicationForm, InvestmentMovementForm, ProductiveForm } from "@/components/investment-forms";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatBRL } from "@/lib/finance/money";
import type { InvestmentCategory, InvestmentMovement, InvestmentRecord } from "@/lib/investments/types";
import type { FarmUnit } from "@/lib/farm-units/types";

const dateLabel = (date: string | null) => date ? format(parseISO(date), "dd/MM/yyyy") : "—";
const statusLabel = { planned: "Planejado", active: "Ativo", completed: "Concluído", cancelled: "Cancelado" };
const movementLabel = { contribution: "Aporte", withdrawal: "Resgate", reversal_contribution: "Estorno de aporte", reversal_withdrawal: "Estorno de resgate" };

export function InvestmentManager({ records, allRecords, movements, categories, farmUnits, selectedUnitId }: {
  records: InvestmentRecord[]; allRecords: InvestmentRecord[]; movements: InvestmentMovement[];
  categories: InvestmentCategory[]; farmUnits: FarmUnit[]; selectedUnitId: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<{ type: "productive" | "financial"; record: InvestmentRecord | null } | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickedId, setPickedId] = useState("");
  const [moving, setMoving] = useState<{ record: InvestmentRecord; type: "contribution" | "withdrawal" } | null>(null);
  const [details, setDetails] = useState<InvestmentRecord | null>(null);
  const [cancelling, setCancelling] = useState<InvestmentRecord | null>(null);
  const [reversing, setReversing] = useState<{ id: string; label: string; kind: "productive" | "movement" } | null>(null);
  const [reverseDate, setReverseDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reverseKey, setReverseKey] = useState("");
  function openReverse(id: string, label: string, kind: "productive" | "movement") {
    setReverseDate(format(new Date(), "yyyy-MM-dd")); setReverseKey(crypto.randomUUID());
    setReversing({ id, label, kind });
  }
  async function reverse() {
    if (!reversing) return;
    try {
      const result = reversing.kind === "productive"
        ? await reverseProductiveAction({ id: reversing.id, date: reverseDate, idempotencyKey: reverseKey })
        : await reverseInvestmentMovementAction({ id: reversing.id, date: reverseDate, idempotencyKey: reverseKey });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success("Estorno registrado."); setReversing(null); setDetails(null); router.refresh();
    } catch { toast.error("Não foi possível estornar."); }
  }
  async function cancel() {
    if (!cancelling) return;
    try {
      const result = await cancelPlannedInvestmentAction({ id: cancelling.id });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success("Planejamento cancelado."); setCancelling(null); setDetails(null); router.refresh();
    } catch { toast.error("Não foi possível cancelar."); }
  }

  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-tight">Investimentos registrados</h2><p className="text-sm text-muted-foreground">{records.length} {records.length === 1 ? "registro no filtro" : "registros no filtro"}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setPickOpen(true)} disabled={!allRecords.length}><Eye size={16} />Consultar registro</Button><Button variant="outline" onClick={() => setForm({ type: "productive", record: null })}><Plus size={16} />Investimento produtivo</Button><Button onClick={() => setForm({ type: "financial", record: null })}><Plus size={16} />Aplicação financeira</Button></div></div>
    <Card className="overflow-hidden">{records.length ? <div className="overflow-x-auto"><table className="w-full min-w-190 text-left text-sm"><thead className="border-b bg-[#f8faf8] text-xs text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Investimento</th><th className="px-5 py-3 font-medium">Categoria</th><th className="px-5 py-3 font-medium">Data</th><th className="px-5 py-3 font-medium">Valor inicial</th><th className="px-5 py-3 font-medium">Situação</th><th className="px-5 py-3 text-right font-medium">Ações</th></tr></thead><tbody className="divide-y">{records.map((record) => <tr key={record.id} className="hover:bg-[#fbfcfb]"><td className="px-5 py-4"><p className="font-medium">{record.name}</p><p className="mt-1 text-xs text-muted-foreground">{record.investment_type === "productive" ? "Produtivo" : `Financeiro · ${record.institution ?? "—"}`}</p></td><td className="px-5 py-4 text-muted-foreground">{record.category_name}</td><td className="px-5 py-4">{dateLabel(record.investment_date)}</td><td className="px-5 py-4 font-medium">{formatBRL(record.initial_value_text)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${record.status === "cancelled" ? "bg-slate-100 text-slate-600" : record.status === "planned" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{statusLabel[record.status]}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" title="Detalhes" aria-label="Detalhes" onClick={() => setDetails(record)}><Eye size={16} /></Button>{record.status !== "cancelled" && <Button size="sm" variant="ghost" title="Editar" aria-label="Editar" onClick={() => setForm({ type: record.investment_type, record })}><Pencil size={16} /></Button>}</div></td></tr>)}</tbody></table></div> : <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center"><p className="font-medium">Nenhum investimento neste filtro</p><p className="mt-1 text-sm text-muted-foreground">Ajuste o período ou cadastre um investimento.</p></div>}</Card>

    <FinanceDialog open={pickOpen} onOpenChange={setPickOpen} title="Consultar investimento" description="Abra qualquer registro, inclusive fora do período filtrado."><div className="space-y-4"><select className="h-11 w-full rounded-lg border bg-white px-3 text-sm" value={pickedId} onChange={(event) => setPickedId(event.target.value)}><option value="">Selecione um registro</option>{allRecords.map((record) => <option key={record.id} value={record.id}>{record.name} · {record.investment_type === "productive" ? "Produtivo" : "Financeiro"}</option>)}</select><div className="flex justify-end"><Button disabled={!pickedId} onClick={() => { const selected = allRecords.find((item) => item.id === pickedId); if (selected) { setPickOpen(false); setDetails(selected); } }}>Abrir detalhes</Button></div></div></FinanceDialog>
    <FinanceDialog open={Boolean(form)} onOpenChange={(open) => { if (!open) setForm(null); }} title={form?.record ? "Editar investimento" : form?.type === "productive" ? "Novo investimento produtivo" : "Nova aplicação financeira"}>{form && (form.type === "productive"
      ? <ProductiveForm key={form.record?.id ?? "productive-new"} record={form.record} categories={categories} farmUnits={farmUnits} selectedUnitId={selectedUnitId} onDone={() => setForm(null)} />
      : <ApplicationForm key={form.record?.id ?? "financial-new"} record={form.record} categories={categories} onDone={() => setForm(null)} />)}</FinanceDialog>
    <FinanceDialog open={Boolean(moving)} onOpenChange={(open) => { if (!open) setMoving(null); }} title={moving?.type === "contribution" ? "Registrar aporte" : "Registrar resgate"}>{moving && <InvestmentMovementForm key={`${moving.record.id}-${moving.type}`} record={moving.record} type={moving.type} onDone={() => setMoving(null)} />}</FinanceDialog>
    <FinanceDialog open={Boolean(details)} onOpenChange={(open) => { if (!open) setDetails(null); }} title="Detalhes do investimento">{details && <div className="space-y-5"><div><p className="text-xl font-semibold">{details.name}</p><p className="mt-1 text-sm text-muted-foreground">{details.category_name} · {statusLabel[details.status]}</p></div><dl className="grid grid-cols-2 gap-4 rounded-xl bg-[#f5f8f5] p-4 text-sm"><div><dt className="text-muted-foreground">Valor inicial</dt><dd className="mt-1 font-semibold">{formatBRL(details.initial_value_text)}</dd></div><div><dt className="text-muted-foreground">Data inicial</dt><dd className="mt-1 font-medium">{dateLabel(details.investment_date)}</dd></div>{details.investment_type === "financial" ? <><div><dt className="text-muted-foreground">Valor de mercado informado</dt><dd className="mt-1 font-semibold">{formatBRL(details.current_value_text ?? "0.00")}</dd></div><div><dt className="text-muted-foreground">Avaliado em</dt><dd className="mt-1 font-medium">{dateLabel(details.valuation_date)}</dd></div><div className="col-span-2"><dt className="text-muted-foreground">Instituição</dt><dd className="mt-1 font-medium">{details.institution}</dd></div></> : <div><dt className="text-muted-foreground">Pagamento</dt><dd className="mt-1 font-medium">{details.payment_transaction_id ? "Liquidado" : "Planejado"}</dd></div>}</dl>
      {details.investment_type === "financial" && <p className="rounded-xl border px-4 py-3 text-sm">Capital líquido transferido para esta aplicação: <strong>{formatBRL(details.principal_text ?? "0.00")}</strong></p>}
      {details.description && <p className="text-sm leading-6">{details.description}</p>}{details.notes && <p className="text-sm leading-6 text-muted-foreground">Observações: {details.notes}</p>}
      {details.investment_type === "financial" && movements.some((movement) => movement.investment_id === details.id && movement.movement_date > (details.valuation_date ?? "")) && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">A avaliação informada é anterior a uma movimentação. Atualize o valor de mercado quando tiver um novo extrato.</p>}
      <div><h3 className="mb-2 text-sm font-semibold">Histórico financeiro</h3>{details.investment_type === "productive" ? <div className="divide-y rounded-xl border px-4">{details.payment_transaction_id ? <><div className="flex justify-between gap-3 py-3 text-sm"><span>Pagamento manual de capital · {dateLabel(details.investment_date)}</span><strong>−{formatBRL(details.initial_value_text)}</strong></div>{details.payment_reversal_date && <div className="flex justify-between gap-3 py-3 text-sm"><span>Estorno · {dateLabel(details.payment_reversal_date)}</span><strong>+{formatBRL(details.initial_value_text)}</strong></div>}</> : <p className="py-4 text-sm text-muted-foreground">Sem pagamento até o momento.</p>}</div>
        : <div className="max-h-56 divide-y overflow-y-auto rounded-xl border px-4">{movements.filter((movement) => movement.investment_id === details.id).sort((a, b) => b.movement_date.localeCompare(a.movement_date)).map((movement) => <div key={movement.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{movementLabel[movement.movement_type]} · {dateLabel(movement.movement_date)}</p><p className="text-xs text-muted-foreground">Movimentação manual{movement.notes ? ` · ${movement.notes}` : ""}</p>{movement.reversed_by_id && <p className="text-xs text-amber-700">Estornado</p>}</div><div className="flex items-center gap-1"><strong>{movement.movement_type === "contribution" || movement.movement_type === "reversal_withdrawal" ? "−" : "+"}{formatBRL(movement.amount_text)}</strong>{!movement.reversal_of_id && !movement.reversed_by_id && details.status !== "cancelled" && <Button size="sm" variant="ghost" title="Estornar movimento" aria-label="Estornar movimento" onClick={() => openReverse(movement.id, movementLabel[movement.movement_type], "movement")}><RotateCcw size={15} /></Button>}</div></div>)}</div>}</div>
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">{details.investment_type === "productive" && details.status === "planned" && <Button variant="outline" onClick={() => setCancelling(details)}>Cancelar planejamento</Button>}{details.investment_type === "productive" && details.payment_transaction_id && !details.payment_reversal_id && <Button variant="outline" onClick={() => openReverse(details.id, details.name, "productive")}><RotateCcw size={15} />Estornar pagamento</Button>}{details.investment_type === "financial" && details.status === "active" && <><Button variant="outline" onClick={() => { setDetails(null); setMoving({ record: details, type: "withdrawal" }); }}><ArrowDownLeft size={15} />Resgate</Button><Button onClick={() => { setDetails(null); setMoving({ record: details, type: "contribution" }); }}><ArrowUpRight size={15} />Aporte</Button></>}</div>
    </div>}</FinanceDialog>
    <ConfirmDialog open={Boolean(cancelling)} onOpenChange={(open) => { if (!open) setCancelling(null); }} title="Cancelar planejamento" description="O investimento planejado será marcado como cancelado. Nenhum valor será lançado no caixa." confirmLabel="Cancelar planejamento" onConfirm={cancel} />
    <ConfirmDialog open={Boolean(reversing)} onOpenChange={(open) => { if (!open) setReversing(null); }} title="Estornar movimentação" description={`Será criado um evento financeiro oposto para ${reversing?.label ?? "esta movimentação"}. O histórico original será preservado.`} confirmLabel="Confirmar estorno" onConfirm={reverse}><label className="mt-5 block space-y-2 text-sm">Data do estorno<Input type="date" value={reverseDate} onChange={(event) => setReverseDate(event.target.value)} /></label></ConfirmDialog>
  </>;
}
