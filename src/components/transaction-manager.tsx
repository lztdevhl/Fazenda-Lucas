"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type SortingState } from "@tanstack/react-table";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { cancelTransactionAction, deleteTransactionAction, reverseTransactionAction, settleTransactionAction } from "@/app/actions/finance";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FinanceDialog } from "@/components/finance-dialog";
import { StatusBadge } from "@/components/status-badge";
import { TransactionForm } from "@/components/transaction-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsFromDecimal, formatBRL, sumMoney } from "@/lib/finance/money";
import type { FinancialCategory, FinancialTransaction, TransactionFilters, TransactionKind } from "@/lib/finance/types";
import type { FarmUnit } from "@/lib/farm-units/types";

const columnHelper = createColumnHelper<FinancialTransaction>();
const dateLabel = (value: string | null) => value ? format(parseISO(value), "dd/MM/yyyy", { locale: ptBR }) : "—";

function TransactionFiltersForm({ filters, categories, selectedUnitId }: { filters: TransactionFilters; categories: FinancialCategory[]; selectedUnitId: string | null }) {
  void selectedUnitId;
  return <form method="get" className="rounded-2xl border bg-white p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center"><div className="relative min-w-0 flex-1"><Search size={17} className="absolute left-3 top-3 text-muted-foreground" /><Input name="search" aria-label="Pesquisar lançamentos" defaultValue={filters.search ?? ""} placeholder="Buscar por descrição ou pessoa" className="h-10 pl-9" /></div><div className="flex flex-wrap items-center gap-2"><Input name="from" aria-label="Data inicial" type="date" defaultValue={filters.from ?? ""} className="h-10 w-auto" /><span className="text-xs text-muted-foreground">até</span><Input name="to" aria-label="Data final" type="date" defaultValue={filters.to ?? ""} className="h-10 w-auto" /><Button type="submit" variant="outline" className="h-10">Filtrar</Button></div></div><details className="mt-3 border-t pt-3"><summary className="flex items-center justify-between text-xs font-semibold text-muted-foreground"><span>Mais filtros</span><span className="mr-3 font-normal">situação e categoria</span></summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><select name="status" aria-label="Filtrar por situação" defaultValue={filters.status ?? ""} className="h-10 rounded-lg border bg-white px-3 text-sm"><option value="">Todas as situações</option><option value="pending">Pendentes</option><option value="settled">Liquidados</option><option value="cancelled">Cancelados</option></select><select name="category" aria-label="Filtrar por categoria" defaultValue={filters.category ?? ""} className="h-10 rounded-lg border bg-white px-3 text-sm"><option value="">Todas as categorias</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div></details></form>;
}

function SettlementForm({ transaction, onDone }: { transaction: FinancialTransaction; onDone: () => void }) {
  const router = useRouter();
  const [settledOn, setSettledOn] = useState(format(new Date(), "yyyy-MM-dd"));
  const [pending, startTransition] = useTransition();
  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const result = await settleTransactionAction({ id: transaction.id, accountId: null, settledOn });
        if (!result.ok) { toast.error(result.error); return; }
        toast.success(transaction.kind === "income" ? "Recebimento registrado." : "Pagamento registrado.");
        onDone(); router.refresh();
      } catch { toast.error("Não foi possível liquidar o lançamento."); }
    });
  }
  return <form onSubmit={submit} className="space-y-5"><div className="rounded-xl bg-[#f5f8f5] p-4"><p className="text-sm font-medium">{transaction.description}</p><p className="mt-1 text-lg font-semibold">{formatBRL(transaction.amount_text)}</p></div><div className="space-y-2"><Label htmlFor="settled-on">Data efetiva</Label><Input id="settled-on" type="date" value={settledOn} onChange={(event) => setSettledOn(event.target.value)} required /></div><p className="text-xs leading-5 text-muted-foreground">O lançamento será marcado como recebido/pago e continuará disponível no histórico. A integração com contas bancárias será adicionada depois.</p><div className="flex justify-end gap-2 border-t pt-5"><Button type="button" variant="outline" onClick={onDone}>Voltar</Button><Button disabled={pending}>{pending ? "Registrando..." : transaction.kind === "income" ? "Confirmar recebimento" : "Confirmar pagamento"}</Button></div></form>;
}

export function TransactionManager({ kind, transactions, categories, farmUnits, selectedUnitId, filters, initialNew = false }: {
  kind: TransactionKind; transactions: FinancialTransaction[];
  categories: FinancialCategory[]; farmUnits: FarmUnit[]; selectedUnitId: string | null; filters: TransactionFilters; initialNew?: boolean;
}) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([{ id: "competency_date", desc: true }]);
  const [formOpen, setFormOpen] = useState(initialNew);
  const [editing, setEditing] = useState<FinancialTransaction | null>(null);
  const [details, setDetails] = useState<FinancialTransaction | null>(null);
  const [settling, setSettling] = useState<FinancialTransaction | null>(null);
  const [cancelling, setCancelling] = useState<FinancialTransaction | null>(null);
  const [deleting, setDeleting] = useState<FinancialTransaction | null>(null);
  const [reversing, setReversing] = useState<FinancialTransaction | null>(null);
  const [reverseDate, setReverseDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const reversalKey = useRef(crypto.randomUUID());

  function openForm(transaction: FinancialTransaction | null) { setEditing(transaction); setFormOpen(true); }
  function openReverse(transaction: FinancialTransaction) { reversalKey.current = crypto.randomUUID(); setReverseDate(format(new Date(), "yyyy-MM-dd")); setReversing(transaction); }
  async function cancel() {
    if (!cancelling) return;
    try {
      const result = await cancelTransactionAction({ id: cancelling.id });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success("Lançamento cancelado."); setCancelling(null); router.refresh();
    } catch { toast.error("Não foi possível cancelar."); }
  }
  async function reverse() {
    if (!reversing) return;
    try {
      const result = await reverseTransactionAction({ id: reversing.id, settledOn: reverseDate, idempotencyKey: reversalKey.current });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success("Estorno registrado."); setReversing(null); router.refresh();
    } catch { toast.error("Não foi possível estornar."); }
  }
  async function remove() {
    if (!deleting) return;
    try {
      const result = await deleteTransactionAction({ id: deleting.id });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success("Lançamento excluído definitivamente."); setDeleting(null); router.refresh();
    } catch { toast.error("Não foi possível excluir o lançamento."); }
  }

  const columns = useMemo(() => [
    columnHelper.accessor("description", { header: "Descrição", cell: (info) => <div><p className="font-medium text-foreground">{info.getValue()}</p><p className="mt-0.5 text-xs text-muted-foreground">{info.row.original.category_name ?? "Sem categoria"} · {info.row.original.farm_unit_name ?? "Geral da fazenda"}</p></div> }),
    columnHelper.accessor("competency_date", { header: "Data", cell: (info) => dateLabel(info.getValue()) }),
    columnHelper.accessor("amount_text", { header: "Valor", sortingFn: (a, b) => {
      const left = centsFromDecimal(a.original.amount_text);
      const right = centsFromDecimal(b.original.amount_text);
      return left < right ? -1 : left > right ? 1 : 0;
    }, cell: (info) => <span className="font-semibold tabular-nums">{formatBRL(info.getValue())}</span> }),
    columnHelper.accessor("status", { header: "Status", cell: (info) => <StatusBadge transaction={info.row.original} /> }),
    columnHelper.display({ id: "actions", header: "", cell: (info) => <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" title="Ver detalhes" aria-label="Ver detalhes" onClick={() => setDetails(info.row.original)}><Eye size={16} /></Button>{info.row.original.status === "pending" && <Button size="sm" variant="ghost" title="Editar" aria-label="Editar" onClick={() => openForm(info.row.original)}><Pencil size={16} /></Button>}</div> }),
  ], []);
  // TanStack Table manages its own callbacks; React Compiler does not memoize this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data: transactions, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  const total = sumMoney(transactions.filter((transaction) => transaction.status !== "cancelled" && !transaction.reversal_id).map((transaction) => transaction.amount_text));
  const label = kind === "income" ? "entrada" : "saída";

  return <div className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-muted-foreground">{transactions.length} {transactions.length === 1 ? "lançamento encontrado" : "lançamentos encontrados"}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{formatBRL(total)}</p><p className="mt-1 text-xs text-muted-foreground">{kind === "income" ? "Total recebido" : "Total gasto"} no período filtrado.</p></div><Button onClick={() => openForm(null)}><Plus size={17} />Nova {label}</Button></div>
    <TransactionFiltersForm filters={filters} categories={categories} selectedUnitId={selectedUnitId} />
    <Card className="overflow-hidden">{transactions.length === 0 ? <div className="px-6 py-16 text-center"><p className="font-medium">Nenhum lançamento encontrado</p><p className="mt-2 text-sm text-muted-foreground">Ajuste os filtros ou crie uma nova {label}.</p></div> : <><div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-180 text-left text-sm"><thead className="border-b bg-[#f9fbf9] text-xs text-muted-foreground">{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id} className="px-5 py-3.5 font-medium"><button type="button" className="inline-flex items-center gap-1 text-left" onClick={header.column.getToggleSortingHandler()} disabled={!header.column.getCanSort()}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getIsSorted() === "asc" && <ArrowUp size={13} />}{header.column.getIsSorted() === "desc" && <ArrowDown size={13} />}</button></th>)}</tr>)}</thead><tbody className="divide-y">{table.getRowModel().rows.map((row) => <tr key={row.id} className="hover:bg-[#fafcfa]">{row.getVisibleCells().map((cell) => <td key={cell.id} className="px-5 py-4 align-middle">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table></div><div className="divide-y sm:hidden">{table.getRowModel().rows.map((row) => { const transaction = row.original; return <button type="button" key={row.id} onClick={() => setDetails(transaction)} className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"><div><p className="text-sm font-medium">{transaction.description}</p><p className="mt-1 text-xs text-muted-foreground">{dateLabel(transaction.competency_date)} · {transaction.category_name}</p><div className="mt-2"><StatusBadge transaction={transaction} /></div></div><span className="shrink-0 text-sm font-semibold">{formatBRL(transaction.amount_text)}</span></button>; })}</div></>}</Card>
    <FinanceDialog open={formOpen} onOpenChange={setFormOpen} title={editing ? `Editar ${label}` : `Nova ${label}`} description="Registre o lançamento manualmente. Ele começa como pendente até você confirmar o recebimento ou pagamento."><TransactionForm key={editing?.id ?? "new"} kind={kind} transaction={editing} categories={categories} farmUnits={farmUnits} selectedUnitId={selectedUnitId} onDone={() => setFormOpen(false)} /></FinanceDialog>
    <FinanceDialog open={Boolean(details)} onOpenChange={(open) => { if (!open) setDetails(null); }} title="Detalhes do lançamento">{details && <div className="space-y-5"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{details.description}</p><p className="mt-1 text-sm text-muted-foreground">{details.category_name}</p></div><StatusBadge transaction={details} /></div><p className="text-3xl font-semibold">{formatBRL(details.amount_text)}</p><dl className="grid grid-cols-2 gap-4 border-y py-5 text-sm"><div><dt className="text-muted-foreground">Competência</dt><dd className="mt-1 font-medium">{dateLabel(details.competency_date)}</dd></div><div><dt className="text-muted-foreground">{kind === "income" ? "Previsão" : "Vencimento"}</dt><dd className="mt-1 font-medium">{dateLabel(details.due_date)}</dd></div><div><dt className="text-muted-foreground">Liquidação</dt><dd className="mt-1 font-medium">{dateLabel(details.settled_on)}</dd></div>{details.counterparty && <div><dt className="text-muted-foreground">{kind === "income" ? "Pagador" : "Favorecido"}</dt><dd className="mt-1 font-medium">{details.counterparty}</dd></div>}</dl>{details.notes && <p className="text-sm leading-6 text-muted-foreground">{details.notes}</p>}<div className="flex flex-wrap justify-end gap-2">{details.status === "pending" && <><Button variant="outline" onClick={() => { setDetails(null); openForm(details); }}><Pencil size={15} />Editar</Button><Button variant="outline" onClick={() => { setDetails(null); setCancelling(details); }}>Cancelar</Button><Button onClick={() => { setDetails(null); setSettling(details); }}>{kind === "income" ? "Registrar recebimento" : "Registrar pagamento"}</Button></>}{details.status === "settled" && !details.reversal_id && <Button variant="outline" onClick={() => { setDetails(null); openReverse(details); }}><RotateCcw size={15} />Estornar</Button>}<Button variant="outline" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => { setDetails(null); setDeleting(details); }}><Trash2 size={15} />Excluir</Button></div></div>}</FinanceDialog>
    <FinanceDialog open={Boolean(settling)} onOpenChange={(open) => { if (!open) setSettling(null); }} title={kind === "income" ? "Registrar recebimento" : "Registrar pagamento"}>{settling && <SettlementForm key={settling.id} transaction={settling} onDone={() => setSettling(null)} />}</FinanceDialog>
    <ConfirmDialog open={Boolean(cancelling)} onOpenChange={(open) => { if (!open) setCancelling(null); }} title="Cancelar lançamento?" description="O lançamento pendente ficará no histórico como cancelado e não afetará o saldo." confirmLabel="Confirmar cancelamento" onConfirm={cancel} />
    <ConfirmDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null); }} title="Excluir lançamento definitivamente?" description={deleting?.reversal_id ? "O lançamento e o estorno vinculado serão apagados permanentemente e deixarão de aparecer nas entradas, saídas, dashboard e relatórios." : "Este lançamento será apagado permanentemente e deixará de aparecer nas entradas, saídas, dashboard e relatórios. Essa ação não pode ser desfeita."} confirmLabel="Excluir definitivamente" onConfirm={remove} />
    <ConfirmDialog open={Boolean(reversing)} onOpenChange={(open) => { if (!open) setReversing(null); }} title="Estornar lançamento?" description="Será criada uma movimentação oposta, vinculada ao lançamento original. O histórico ficará preservado." confirmLabel="Registrar estorno" onConfirm={reverse}><div className="mt-5 space-y-2"><Label htmlFor="reverse-date">Data do estorno</Label><Input id="reverse-date" type="date" value={reverseDate} onChange={(event) => setReverseDate(event.target.value)} /></div></ConfirmDialog>
  </div>;
}
