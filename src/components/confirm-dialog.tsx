"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string;
  confirmLabel: string; onConfirm: () => Promise<void>; children?: React.ReactNode;
}) {
  const [pending, setPending] = useState(false);
  async function confirm() {
    setPending(true);
    try { await onConfirm(); } finally { setPending(false); }
  }
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-[#10241a]/45" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><div><Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title><Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">{description}</Dialog.Description></div><Dialog.Close aria-label="Fechar" className="text-muted-foreground hover:text-foreground"><X size={19} /></Dialog.Close></div>{children}<div className="mt-7 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Voltar</Button><Button type="button" onClick={confirm} disabled={pending}>{pending && <LoaderCircle size={16} className="animate-spin" />}{confirmLabel}</Button></div></Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
