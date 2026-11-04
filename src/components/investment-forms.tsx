"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  addInvestmentMovementAction, createApplicationAction, saveApplicationAction,
  saveProductiveAction,
} from "@/app/actions/investments";
import { CurrencyInput } from "@/components/currency-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL, parseBRLInput } from "@/lib/finance/money";
import type { InvestmentCategory, InvestmentRecord } from "@/lib/investments/types";
import type { FarmUnit } from "@/lib/farm-units/types";
import { applicationEditSchema, applicationInputSchema, movementInputSchema, productiveInputSchema } from "@/lib/investments/validation";

const today = () => format(new Date(), "yyyy-MM-dd");
const selectClass = "h-11 w-full rounded-lg border bg-white px-3 text-sm";
const textareaClass = "w-full resize-y rounded-lg border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-3 focus:ring-primary/10";
type Shared = { categories: InvestmentCategory[]; farmUnits?: FarmUnit[]; selectedUnitId?: string | null; onDone: () => void };

function CategorySelect({ categories, type, value, onChange, disabled }: { categories: InvestmentCategory[]; type: InvestmentCategory["category_type"]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <select className={selectClass} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} required><option value="">Selecione</option>{categories.filter((item) => item.category_type === type && (item.active || item.id === value)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>;
}
export function ProductiveForm({ record, categories, farmUnits = [], selectedUnitId = null, onDone }: Shared & { record: InvestmentRecord | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [key] = useState(() => crypto.randomUUID());
  const paid = Boolean(record?.payment_transaction_id);
  const [name, setName] = useState(record?.name ?? "");
  const [categoryId, setCategoryId] = useState(record?.category_id ?? "");
  const [farmUnitId, setFarmUnitId] = useState(record?.farm_unit_id ?? (selectedUnitId && farmUnits.find((unit) => unit.id === selectedUnitId)?.is_active ? selectedUnitId : ""));
  const [description, setDescription] = useState(record?.description ?? "");
  const [amount, setAmount] = useState(formatBRL(record?.initial_value_text ?? "0.00"));
  const [date, setDate] = useState(record?.investment_date ?? today());
  const [status, setStatus] = useState<"planned" | "active" | "completed">(record?.status === "planned" ? "planned" : record?.status === "completed" ? "completed" : "active");
  const [notes, setNotes] = useState(record?.notes ?? "");
  function submit(event: React.FormEvent) {
    event.preventDefault();
    let parsedAmount: string;
    try { parsedAmount = parseBRLInput(amount); } catch { toast.error("Informe um valor válido."); return; }
    const parsed = productiveInputSchema.safeParse({ id: record?.id ?? null, name, categoryId, description: description || null,
      amount: parsedAmount, date, accountId: null, farmUnitId: farmUnitId || null, status, notes: notes || null, idempotencyKey: key });
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos."); return; }
    start(async () => {
      try {
        const result = await saveProductiveAction(parsed.data);
        if (!result.ok) { toast.error(result.error); return; }
        toast.success(record ? "Investimento atualizado." : "Investimento registrado."); onDone(); router.refresh();
      } catch { toast.error("Não foi possível salvar o investimento."); }
    });
  }
  return <form onSubmit={submit} className="space-y-4">
    <div className="space-y-2"><Label>Nome do investimento</Label><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required /></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Categoria</Label><CategorySelect categories={categories} type="productive_investment" value={categoryId} onChange={setCategoryId} disabled={paid} /></div><div className="space-y-2"><Label>Status</Label><select className={selectClass} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="planned" disabled={paid}>Planejado</option><option value="active">Ativo / pago</option><option value="completed">Concluído / pago</option></select></div></div>
    <div className="space-y-2"><Label>Descrição</Label><textarea className={textareaClass} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} /></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Valor</Label><CurrencyInput value={amount} onChange={setAmount} disabled={paid} /></div><div className="space-y-2"><Label>Data do investimento</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={paid} required /></div></div>
    <div className="space-y-2"><Label>Núcleo</Label><select className={selectClass} value={farmUnitId} onChange={(event) => setFarmUnitId(event.target.value)} disabled={paid}><option value="">Geral da fazenda</option>{farmUnits.filter((unit) => unit.is_active || unit.id === record?.farm_unit_id).map((unit) => <option key={unit.id} value={unit.id} disabled={!unit.is_active}>{unit.name}{unit.is_active ? "" : " (inativo — escolha outro para salvar)"}</option>)}</select></div>
    <div className="space-y-2"><Label>Observações</Label><textarea className={textareaClass} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} /></div>
    <p className="text-xs leading-5 text-muted-foreground">Ao marcar como pago, o sistema registra uma saída manual de capital. Esse pagamento não entra nas despesas operacionais.</p>
    <div className="flex justify-end gap-2 border-t pt-5"><Button type="button" variant="outline" onClick={onDone}>Voltar</Button><Button disabled={pending}>{pending ? "Salvando..." : "Salvar investimento"}</Button></div>
  </form>;
}

export function ApplicationForm({ record, categories, onDone }: Shared & { record: InvestmentRecord | null }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [key] = useState(() => crypto.randomUUID());
  const [name, setName] = useState(record?.name ?? "");
  const [categoryId, setCategoryId] = useState(record?.category_id ?? "");
  const [institution, setInstitution] = useState(record?.institution ?? "");
  const [description, setDescription] = useState(record?.description ?? "");
  const [amount, setAmount] = useState(formatBRL(record?.initial_value_text ?? "0.00"));
  const [currentValue, setCurrentValue] = useState(formatBRL(record?.current_value_text ?? "0.00"));
  const [date, setDate] = useState(record?.investment_date ?? today());
  const [valuationDate, setValuationDate] = useState(record?.valuation_date ?? today());
  const [status, setStatus] = useState<"active" | "completed" | "cancelled">(record?.status === "completed" ? "completed" : "active");
  const [notes, setNotes] = useState(record?.notes ?? "");
  function submit(event: React.FormEvent) {
    event.preventDefault();
    let initial: string; let current: string;
    try { initial = parseBRLInput(amount); current = parseBRLInput(currentValue); } catch { toast.error("Informe valores válidos."); return; }
    const input = record ? { id: record.id, name, categoryId, institution, description: description || null,
      currentValue: current, valuationDate, status, notes: notes || null }
      : { name, categoryId, institution, date, amount: initial, accountId: null,
        currentValue: current, valuationDate, notes: notes || null, idempotencyKey: key };
    const parsed = record ? applicationEditSchema.safeParse(input) : applicationInputSchema.safeParse(input);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos."); return; }
    start(async () => {
      try {
        const result = record ? await saveApplicationAction(input) : await createApplicationAction(input);
        if (!result.ok) { toast.error(result.error); return; }
        toast.success(record ? "Aplicação atualizada." : "Aplicação registrada."); onDone(); router.refresh();
      } catch { toast.error("Não foi possível salvar a aplicação."); }
    });
  }
  return <form onSubmit={submit} className="space-y-4">
    <div className="space-y-2"><Label>Nome da aplicação</Label><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required /></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Tipo de aplicação</Label><CategorySelect categories={categories} type="financial_investment" value={categoryId} onChange={setCategoryId} /></div><div className="space-y-2"><Label>Instituição financeira</Label><Input value={institution} onChange={(event) => setInstitution(event.target.value)} maxLength={160} required /></div></div>
    {record ? <div className="space-y-2"><Label>Situação</Label><select className={selectClass} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="active">Ativa</option><option value="completed">Encerrada</option><option value="cancelled">Cancelada (somente após estornar todos os movimentos)</option></select></div>
      : <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Data da aplicação inicial</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></div><div className="space-y-2"><Label>Valor aplicado inicialmente</Label><CurrencyInput value={amount} onChange={setAmount} /></div></div>}
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Valor de mercado informado</Label><CurrencyInput value={currentValue} onChange={setCurrentValue} /></div><div className="space-y-2"><Label>Data da avaliação</Label><Input type="date" value={valuationDate} onChange={(event) => setValuationDate(event.target.value)} required /></div></div>
    {record && <div className="space-y-2"><Label>Descrição</Label><textarea className={textareaClass} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} /></div>}
    <div className="space-y-2"><Label>Observações</Label><textarea className={textareaClass} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} /></div>
    <p className="text-xs leading-5 text-muted-foreground">A aplicação inicial é registrada como uma movimentação manual. O valor de mercado é informado manualmente.</p>
    <div className="flex justify-end gap-2 border-t pt-5"><Button type="button" variant="outline" onClick={onDone}>Voltar</Button><Button disabled={pending}>{pending ? "Salvando..." : "Salvar aplicação"}</Button></div>
  </form>;
}

export function InvestmentMovementForm({ record, onDone, type }: { record: InvestmentRecord; onDone: () => void; type: "contribution" | "withdrawal" }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [key] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(formatBRL("0.00")); const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  function submit(event: React.FormEvent) {
    event.preventDefault(); let value: string;
    try { value = parseBRLInput(amount); } catch { toast.error("Informe um valor válido."); return; }
    const parsed = movementInputSchema.safeParse({ investmentId: record.id, movementType: type,
      amount: value, date, accountId: null, notes: notes || null, idempotencyKey: key });
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos."); return; }
    start(async () => {
      try {
        const result = await addInvestmentMovementAction(parsed.data);
        if (!result.ok) { toast.error(result.error); return; }
        toast.success(type === "contribution" ? "Aporte registrado." : "Resgate registrado."); onDone(); router.refresh();
      } catch { toast.error("Não foi possível registrar a movimentação."); }
    });
  }
  return <form onSubmit={submit} className="space-y-4">
    <div className="space-y-2"><Label>Aplicação</Label><p className="rounded-lg bg-[#f5f8f5] px-3 py-3 text-sm font-medium">{record.name}</p></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Valor</Label><CurrencyInput value={amount} onChange={setAmount} /></div><div className="space-y-2"><Label>Data efetiva</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></div></div>
    <div className="space-y-2"><Label>Observações</Label><textarea className={textareaClass} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} /></div>
    <div className="flex justify-end gap-2 border-t pt-5"><Button type="button" variant="outline" onClick={onDone}>Voltar</Button><Button disabled={pending}>{pending ? "Registrando..." : type === "contribution" ? "Registrar aporte" : "Registrar resgate"}</Button></div>
  </form>;
}
