"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { toast } from "sonner";
import { Banknote, Landmark, Pencil, Plus } from "lucide-react";
import { saveAccountAction } from "@/app/actions/finance";
import { CurrencyInput } from "@/components/currency-input";
import { FinanceDialog } from "@/components/finance-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL, parseBRLInput } from "@/lib/finance/money";
import type { FinancialAccount } from "@/lib/finance/types";

const formSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da conta.").max(100),
  accountType: z.enum(["bank", "cash"]),
  openingBalance: z.string().refine((value) => { try { parseBRLInput(value); return true; } catch { return false; } }, "Informe o saldo inicial."),
  openingDate: z.iso.date(),
  active: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

function AccountForm({ account, onDone }: { account: FinancialAccount | null; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { register, control, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: account?.name ?? "", accountType: account?.account_type ?? "bank",
      openingBalance: formatBRL(account?.opening_balance_text ?? "0.00"),
      openingDate: account?.opening_date ?? format(new Date(), "yyyy-MM-dd"),
      active: account?.active ?? true,
    },
  });

  const submit = handleSubmit((values) => startTransition(async () => {
    try {
      const result = await saveAccountAction({
        id: account?.id ?? null, name: values.name, accountType: values.accountType,
        openingBalance: parseBRLInput(values.openingBalance), openingDate: values.openingDate,
        active: values.active,
      });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success(account ? "Conta atualizada." : "Conta criada.");
      onDone(); router.refresh();
    } catch { toast.error("Não foi possível salvar a conta."); }
  }));

  return <form onSubmit={submit} className="space-y-5">
    <div className="space-y-2"><Label htmlFor="account-name">Nome da conta</Label><Input id="account-name" placeholder="Ex.: Conta principal" {...register("name")} />{errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}</div>
    <div className="space-y-2"><Label htmlFor="account-type">Tipo</Label><select id="account-type" className="h-11 w-full rounded-lg border bg-white px-3 text-sm" {...register("accountType")}><option value="bank">Conta bancária</option><option value="cash">Dinheiro / caixa</option></select></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="opening-balance">Saldo inicial</Label><Controller name="openingBalance" control={control} render={({ field }) => <CurrencyInput id="opening-balance" value={field.value} onChange={field.onChange} onBlur={field.onBlur} allowNegative readOnly={Boolean(account?.settled_count)} />} />{errors.openingBalance && <p className="text-xs text-red-600">{errors.openingBalance.message}</p>}</div><div className="space-y-2"><Label htmlFor="opening-date">Data de referência</Label><Input id="opening-date" type="date" readOnly={Boolean(account?.settled_count)} {...register("openingDate")} /></div></div>
    {Boolean(account?.settled_count) && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">O saldo inicial e a data estão bloqueados porque esta conta já possui movimentações liquidadas.</p>}
    <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="size-4 accent-[#174b3c]" {...register("active")} />Conta ativa</label>
    <div className="flex justify-end gap-2 border-t pt-5"><Button type="button" variant="outline" onClick={onDone}>Cancelar</Button><Button disabled={pending}>{pending ? "Salvando..." : "Salvar conta"}</Button></div>
  </form>;
}

export function AccountManager({ accounts }: { accounts: FinancialAccount[] }) {
  const [editing, setEditing] = useState<FinancialAccount | null>(null);
  const [open, setOpen] = useState(false);
  function openForm(account: FinancialAccount | null) { setEditing(account); setOpen(true); }

  return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Contas financeiras</h2><p className="mt-1 text-sm text-muted-foreground">Saldos calculados a partir de movimentos liquidados após a data de referência.</p></div><Button onClick={() => openForm(null)}><Plus size={17} />Nova conta</Button></div>
    {accounts.length === 0 ? <Card className="p-10 text-center"><p className="font-medium">Nenhuma conta cadastrada</p><p className="mt-2 text-sm text-muted-foreground">Crie uma conta bancária ou caixa para começar a registrar liquidações.</p></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{accounts.map((account) => <Card key={account.id} className="p-5"><div className="flex items-start justify-between gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-[#eff5f0] text-primary">{account.account_type === "bank" ? <Landmark size={20} /> : <Banknote size={20} />}</span><span className={account.active ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700" : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500"}>{account.active ? "Ativa" : "Inativa"}</span></div><h3 className="mt-4 font-semibold">{account.name}</h3><p className="mt-1 text-xs text-muted-foreground">{account.account_type === "bank" ? "Conta bancária" : "Dinheiro / caixa"}</p><p className="mt-5 text-2xl font-semibold tracking-tight">{formatBRL(account.balance_text)}</p><div className="mt-4 flex items-center justify-between border-t pt-4"><p className="text-xs text-muted-foreground">Inicial: {formatBRL(account.opening_balance_text)}</p><Button variant="ghost" size="sm" onClick={() => openForm(account)}><Pencil size={15} />Editar</Button></div></Card>)}</div>}
    <FinanceDialog open={open} onOpenChange={setOpen} title={editing ? "Editar conta" : "Nova conta"} description="O saldo inicial representa a posição na data de referência."><AccountForm key={editing?.id ?? "new"} account={editing} onDone={() => setOpen(false)} /></FinanceDialog>
  </section>;
}
