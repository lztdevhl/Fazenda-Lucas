"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export function FinanceDialog({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: React.ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-[#10241a]/45" /><Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl border bg-white p-6 shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-7"><div className="mb-6 flex items-start justify-between gap-4"><div><Dialog.Title className="text-xl font-semibold tracking-tight">{title}</Dialog.Title>{description && <Dialog.Description className="mt-1 text-sm text-muted-foreground">{description}</Dialog.Description>}</div><Dialog.Close aria-label="Fechar" className="text-muted-foreground hover:text-foreground"><X size={20} /></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
