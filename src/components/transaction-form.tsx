"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { toast } from "sonner";
import { z } from "zod";
import { saveTransactionAction } from "@/app/actions/finance";
import { CurrencyInput } from "@/components/currency-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL, parseBRLInput } from "@/lib/finance/money";
import type { FinancialCategory, FinancialTransaction, TransactionKind } from "@/lib/finance/types";
import type { FarmUnit } from "@/lib/farm-units/types";

const formSchema = z.object({
  description: z.string().trim().min(2, "Informe uma descrição.").max(200),
  amount: z.string().refine((value) => { try { return parseBRLInput(value) !== "0.00"; } catch { return false; } }, "Informe um valor maior que zero."),
  categoryId: z.uuid("Selecione uma categoria."),
  farmUnitId: z.uuid().nullable(),
  competencyDate: z.iso.date(),
  dueDate: z.iso.date(),
  counterparty: z.string().max(160),
  notes: z.string().max(2000),
});
type FormValues = z.infer<typeof formSchema>;

export function TransactionForm({ kind, transaction, categories, farmUnits, selectedUnitId, onDone }: {
  kind: TransactionKind; transaction: FinancialTransaction | null;
  categories: FinancialCategory[]; farmUnits: FarmUnit[]; selectedUnitId: string | null; onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const { register, control, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: transaction?.description ?? "",
      amount: formatBRL(transaction?.amount_text ?? "0.00"),
      categoryId: transaction?.category_id ?? "",
      farmUnitId: transaction?.farm_unit_id ?? (selectedUnitId && farmUnits.find((unit) => unit.id === selectedUnitId)?.is_active ? selectedUnitId : null),
      competencyDate: transaction?.competency_date ?? format(new Date(), "yyyy-MM-dd"),
      dueDate: transaction?.due_date ?? format(new Date(), "yyyy-MM-dd"),
      counterparty: transaction?.counterparty ?? "", notes: transaction?.notes ?? "",
    },
  });

  const submit = handleSubmit((values) => startTransition(async () => {
    try {
      const result = await saveTransactionAction({
        id: transaction?.id ?? null, kind, description: values.description,
        amount: parseBRLInput(values.amount), categoryId: values.categoryId,
        farmUnitId: values.farmUnitId,
        accountId: null, competencyDate: values.competencyDate,
        dueDate: values.dueDate, counterparty: values.counterparty || null,
        notes: values.notes || null, idempotencyKey,
      });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success(transaction ? "Lançamento atualizado." : "Lançamento criado.");
      onDone(); router.refresh();
    } catch { toast.error("Não foi possível salvar o lançamento."); }
  }));

  return <form onSubmit={submit} className="space-y-5">
    <div className="space-y-2"><Label htmlFor="description">Descrição</Label><Input id="description" placeholder={kind === "income" ? "Ex.: Venda de suínos" : "Ex.: Compra de ração"} {...register("description")} />{errors.description && <p className="text-xs text-red-600">{errors.description.message}</p>}</div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="amount">Valor</Label><Controller name="amount" control={control} render={({ field }) => <CurrencyInput id="amount" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />} />{errors.amount && <p className="text-xs text-red-600">{errors.amount.message}</p>}</div><div className="space-y-2"><Label htmlFor="category">Categoria</Label><select id="category" className="h-11 w-full rounded-lg border bg-white px-3 text-sm" {...register("categoryId")}><option value="">Selecione</option>{categories.filter((category) => category.active || category.id === transaction?.category_id).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{errors.categoryId && <p className="text-xs text-red-600">{errors.categoryId.message}</p>}</div></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="competency-date">Data de competência</Label><Input id="competency-date" type="date" {...register("competencyDate")} /></div><div className="space-y-2"><Label htmlFor="due-date">{kind === "income" ? "Previsão de recebimento" : "Vencimento"}</Label><Input id="due-date" type="date" {...register("dueDate")} /></div></div>
    <div className="space-y-2"><Label htmlFor="farm-unit">Núcleo</Label><select id="farm-unit" className="h-11 w-full rounded-lg border bg-white px-3 text-sm" {...register("farmUnitId", { setValueAs: (value) => value || null })}><option value="">Geral da fazenda</option>{farmUnits.filter((unit) => unit.is_active || unit.id === transaction?.farm_unit_id).map((unit) => <option key={unit.id} value={unit.id} disabled={!unit.is_active}>{unit.name}{unit.is_active ? "" : " (inativo — escolha outro para salvar)"}</option>)}</select>{errors.farmUnitId && <p className="text-xs text-red-600">Selecione um núcleo válido.</p>}</div>
    <div className="space-y-2"><Label htmlFor="counterparty">{kind === "income" ? "Pagador" : "Fornecedor ou favorecido"} <span className="font-normal text-muted-foreground">(opcional)</span></Label><Input id="counterparty" {...register("counterparty")} /></div>
    <div className="space-y-2"><Label htmlFor="notes">Observações <span className="font-normal text-muted-foreground">(opcional)</span></Label><textarea id="notes" rows={3} className="w-full resize-y rounded-lg border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-3 focus:ring-primary/10" {...register("notes")} /></div>
    <div className="flex justify-end gap-2 border-t pt-5"><Button type="button" variant="outline" onClick={onDone}>Cancelar</Button><Button disabled={pending}>{pending ? "Salvando..." : "Salvar lançamento"}</Button></div>
  </form>;
}
