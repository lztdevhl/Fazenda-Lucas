import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { FinancialTransaction } from "@/lib/finance/types";

export function StatusBadge({ transaction }: { transaction: FinancialTransaction }) {
  if (transaction.reversal_id) return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Estornado</span>;
  if (transaction.status === "settled") return <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">{transaction.kind === "income" ? "Recebido" : "Pago"}</span>;
  if (transaction.status === "cancelled") return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">Cancelado</span>;
  const overdue = transaction.due_date && transaction.due_date < format(new Date(), "yyyy-MM-dd");
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", overdue ? "bg-amber-50 text-amber-700" : "bg-[#edf3ee] text-[#4f6b59]")}>{overdue ? "Vencido" : "Pendente"}</span>;
}
