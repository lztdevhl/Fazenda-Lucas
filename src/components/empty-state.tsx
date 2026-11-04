import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <Card className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center"><span className="mb-5 flex size-13 items-center justify-center rounded-2xl bg-[#ecf4ee] text-primary"><Icon size={24} strokeWidth={1.65} /></span><h2 className="text-base font-semibold">{title}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p></Card>;
}
