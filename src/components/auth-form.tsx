"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, LoaderCircle, Sprout } from "lucide-react";
import { loginAction, requestResetAction, updatePasswordAction, type AuthActionState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AuthActionState = {};

export function AuthForm({ mode }: { mode: "login" | "reset" | "update" }) {
  const action = mode === "login" ? loginAction : mode === "reset" ? requestResetAction : updatePasswordAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const searchParams = useSearchParams();
  const linkExpired = searchParams.get("error") === "link-expired";

  const content = {
    login: { eyebrow: "BEM-VINDO DE VOLTA", title: "Acesse sua conta", description: "Entre para acompanhar a saúde financeira da sua fazenda.", button: "Entrar na plataforma" },
    reset: { eyebrow: "RECUPERAÇÃO DE ACESSO", title: "Esqueceu a senha?", description: "Informe seu e-mail e enviaremos um link para criar uma nova senha.", button: "Enviar link de recuperação" },
    update: { eyebrow: "SEGURANÇA DA CONTA", title: "Criar nova senha", description: "Escolha uma senha forte para continuar usando a plataforma.", button: "Salvar nova senha" },
  }[mode];

  return <>
    <div className="mb-12 flex items-center gap-2.5 text-base font-semibold text-primary lg:hidden"><span className="flex size-9 items-center justify-center rounded-lg bg-primary text-white"><Sprout size={18} /></span>Fazenda Financeiro</div>
    <div className="mb-8"><p className="mb-3 text-xs font-semibold tracking-[0.18em] text-primary">{content.eyebrow}</p><h2 className="text-[32px] font-semibold tracking-[-0.035em]">{content.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{content.description}</p></div>
    <form action={formAction} className="space-y-5">
      {mode !== "update" && <div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input id="email" name="email" type="email" autoComplete="email" placeholder="voce@fazenda.com.br" required /></div>}
      {mode !== "reset" && <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="password">{mode === "update" ? "Nova senha" : "Senha"}</Label>{mode === "login" && <Link className="text-xs font-medium text-primary hover:underline" href="/forgot-password">Esqueceu a senha?</Link>}</div><Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "update" ? 12 : undefined} placeholder="••••••••••••" required /></div>}
      {mode === "update" && <div className="space-y-2"><Label htmlFor="confirmPassword">Confirmar nova senha</Label><Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} placeholder="••••••••••••" required /></div>}
      {(state.error || linkExpired) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error || "Link inválido ou expirado. Solicite uma nova recuperação."}</p>}
      {state.success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{state.success}</p>}
      <Button className="w-full" size="lg" disabled={pending}>{pending ? <LoaderCircle size={17} className="animate-spin" /> : <>{content.button}<ArrowRight size={17} /></>}</Button>
    </form>
    {mode !== "login" && <Link href="/login" className="mt-7 block text-center text-sm font-medium text-primary hover:underline">Voltar para o login</Link>}
    {mode === "login" && <p className="mt-10 border-t pt-6 text-center text-xs leading-5 text-muted-foreground">Acesso exclusivo do proprietário. A conta é criada pelo administrador.</p>}
  </>;
}
