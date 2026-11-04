"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, BarChart3, ChartNoAxesCombined, LayoutDashboard, LogOut, Menu, Settings2, Sprout, X } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { FarmUnit } from "@/lib/farm-units/types";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/entradas", label: "Entradas", icon: ArrowDownLeft },
  { href: "/saidas", label: "Saídas", icon: ArrowUpRight },
  { href: "/investimentos", label: "Investimentos", icon: ChartNoAxesCombined },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/configuracoes", label: "Configurações", icon: Settings2 },
];

export function AppSidebar({ farmName, ownerName, email, farmUnits }: { farmName: string; ownerName: string; email: string; farmUnits: FarmUnit[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedUnitId = searchParams.get("unit");
  const withUnit = (href: string) => {
    const [path, query] = href.split("?");
    const params = new URLSearchParams(query ?? "");
    if (selectedUnitId) params.set("unit", selectedUnitId);
    return `${path}${params.size ? `?${params.toString()}` : ""}`;
  };
  function changeUnit(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("unit"); else params.set("unit", value);
    router.push(`${pathname}${params.size ? `?${params.toString()}` : ""}`);
    setOpen(false);
  }

  return (
    <>
      <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-white px-5 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2.5 font-semibold"><span className="flex size-8 items-center justify-center rounded-lg bg-primary text-white"><Sprout size={17} /></span><span className="max-w-48 truncate">{farmName}</span></Link>
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu size={21} /></Button>
      </div>
      {open && <button className="fixed inset-0 z-40 bg-[#0e2119]/45 lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu" />}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-68 flex-col border-r border-border bg-white transition-transform duration-200 lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-22 items-center gap-3 border-b px-6">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white"><Sprout size={21} strokeWidth={1.8} /></span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold leading-5">{farmName}</p><p className="text-xs text-muted-foreground">Gestão financeira</p></div>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu"><X size={19} /></Button>
        </div>
        <div className="border-b px-6 py-4"><label htmlFor="farm-unit-selector" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Visão da fazenda</label><select id="farm-unit-selector" value={selectedUnitId ?? "all"} onChange={(event) => changeUnit(event.target.value)} className="h-10 w-full rounded-lg border bg-white px-3 text-sm"><option value="all">Toda a fazenda</option>{farmUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}{unit.is_active ? "" : " (inativo)"}</option>)}</select></div>
        <div className="px-4 pt-7"><p className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Menu principal</p></div>
        <nav className="mt-3 flex flex-1 flex-col gap-1 px-3" aria-label="Navegação principal">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return <Link key={href} href={withUnit(href)} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors", active ? "bg-[#eaf3ee] text-primary" : "text-[#627168] hover:bg-muted hover:text-foreground")}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></Link>;
          })}
        </nav>
        <div className="border-t p-4">
          <div className="flex items-center gap-3 rounded-xl bg-[#f6f8f6] p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#dce9df] text-sm font-semibold text-primary">{(ownerName || email).charAt(0).toUpperCase()}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{ownerName || "Proprietário"}</p><p className="truncate text-xs text-muted-foreground">{email}</p></div>
          </div>
          <form action={signOutAction}><button className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut size={17} />Sair da conta</button></form>
        </div>
      </aside>
    </>
  );
}
