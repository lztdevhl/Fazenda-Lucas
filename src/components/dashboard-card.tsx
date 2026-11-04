import { Info, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function DashboardCard({ title, icon: Icon, note, value, comparison, emphasis }: { title: string; icon: LucideIcon; note: string; value: string; comparison?: string; emphasis?: "overdue" }) {
  return <Card className={`p-5 ${emphasis ? "border-[#ebd8bd] bg-[#fffdfa]" : ""}`}><div className="flex items-start justify-between gap-4"><p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">{title}<span title={note} aria-label={note} className="cursor-help"><Info size={13} /></span></p><span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${emphasis ? "bg-[#faf0e1] text-[#956b38]" : "bg-[#eff5f0] text-primary"}`}><Icon size={18} strokeWidth={1.8} /></span></div><p className="mt-7 text-[26px] font-semibold tracking-[-0.04em] text-[#193428] sm:text-3xl">{value}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{note}</p>{comparison && <p className="mt-2 text-xs text-[#536e5c]">{comparison}</p>}</Card>;
}
