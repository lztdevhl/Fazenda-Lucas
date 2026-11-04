import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageIntro } from "@/components/page-intro";

export function ModulePlaceholder({ eyebrow, title, description, icon, emptyTitle, emptyDescription }: { eyebrow: string; title: string; description: string; icon: LucideIcon; emptyTitle: string; emptyDescription: string }) {
  return <><PageIntro eyebrow={eyebrow} title={title} description={description} /><EmptyState icon={icon} title={emptyTitle} description={emptyDescription} /></>;
}
