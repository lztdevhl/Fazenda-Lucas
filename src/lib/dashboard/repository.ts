import "server-only";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { todayInBrazil, type DashboardPeriod } from "./period";
import { summarizeDashboard, type DashboardEvent } from "./summary";

const moneySchema = z.string().regex(/^-?\d{1,18}\.\d{2}$/);

const eventSchema = z.object({
  id: z.uuid(), kind: z.string(), description: z.string(),
  amount_text: moneySchema,
  status: z.enum(["pending", "settled"]), event_date: z.iso.date(),
  due_date: z.iso.date().nullable(), category_name: z.string().nullable(),
  account_name: z.string().nullable(), reversal_of_id: z.uuid().nullable(),
});
const balanceSchema = z.object({ day: z.iso.date(), balance_text: moneySchema });
const dueSchema = z.object({ id: z.uuid(), kind: z.enum(["income", "expense"]),
  description: z.string(), amount_text: moneySchema, due_date: z.iso.date() });

export async function getDashboardSummary(period: DashboardPeriod, farmUnitId: string | null = null) {
  const { supabase, farm } = await requireOwner();
  if (!farm) throw new Error("Fazenda não configurada.");
  const today = todayInBrazil();
  const [eventsResult, balanceResult, overdueResult, dueResult] = await Promise.all([
    supabase.rpc("finance_dashboard_events_by_unit", { p_from: period.previousFrom, p_to: period.to, p_farm_unit_id: farmUnitId })
      .order("event_date", { ascending: false }).order("id", { ascending: false }).range(0, 999),
    supabase.rpc("finance_dashboard_balance_series_by_unit", { p_from: period.from, p_to: period.to, p_farm_unit_id: farmUnitId }),
    supabase.rpc("finance_dashboard_overdue_expenses_by_unit", { p_today: today, p_farm_unit_id: farmUnitId }),
    supabase.rpc("finance_dashboard_next_due_by_unit", { p_today: today, p_farm_unit_id: farmUnitId }),
  ]);
  if (eventsResult.error) {
    throw new Error("Não foi possível carregar o dashboard. Aplique a migration 20261023000300_dashboard_data.sql no Supabase.");
  }
  if (balanceResult.error || overdueResult.error || dueResult.error) {
    throw new Error("Não foi possível carregar o dashboard. Aplique a migration 20261027000100_dashboard_phase3.sql no Supabase.");
  }
  const events: DashboardEvent[] = eventSchema.array().parse(eventsResult.data ?? []);
  let pageSize = events.length;
  while (pageSize === 1000) {
    const next = await supabase.rpc("finance_dashboard_events_by_unit", { p_from: period.previousFrom, p_to: period.to, p_farm_unit_id: farmUnitId })
      .order("event_date", { ascending: false }).order("id", { ascending: false })
      .range(events.length, events.length + 999);
    if (next.error) throw new Error("Não foi possível carregar todos os lançamentos do período.");
    const page = eventSchema.array().parse(next.data ?? []);
    pageSize = page.length;
    events.push(...page);
  }
  return summarizeDashboard(events, balanceSchema.array().parse(balanceResult.data ?? []),
    dueSchema.array().parse(dueResult.data ?? []), moneySchema.parse(overdueResult.data), period);
}
