import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const owner1 = "11111111-1111-4111-8111-111111111111";
const owner2 = "22222222-2222-4222-8222-222222222222";
const farm1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const farm2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let pg: PGlite;

async function asOwner(id: string) {
  await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}

async function scalar<T = string>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await pg.query<{ value: T }>(sql, params);
  return result.rows[0].value;
}

describe("núcleo financeiro no PostgreSQL", () => {
  beforeAll(async () => {
    pg = await PGlite.create({ extensions: { pgcrypto } });
    await pg.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
    `);
    await pg.exec(readFileSync(join(process.cwd(), "supabase/migrations/20261023000100_initial_schema.sql"), "utf8"));
    await pg.exec(readFileSync(join(process.cwd(), "supabase/migrations/20261023000200_financial_core.sql"), "utf8"));
    await pg.exec(readFileSync(join(process.cwd(), "supabase/migrations/20261023000300_dashboard_data.sql"), "utf8"));
    await pg.exec(readFileSync(join(process.cwd(), "supabase/migrations/20261027000100_dashboard_phase3.sql"), "utf8"));
    await pg.exec(readFileSync(join(process.cwd(), "supabase/migrations/20261027000200_investments.sql"), "utf8"));
    await pg.query("insert into auth.users(id) values ($1), ($2)", [owner1, owner2]);
    await pg.query("insert into public.farms(id,owner_id,name) values ($1,$2,'Fazenda Um'),($3,$4,'Fazenda Dois')", [farm1, owner1, farm2, owner2]);
    await pg.exec("set role authenticated");
    await asOwner(owner1);
  }, 120_000);

  afterAll(async () => { await pg?.close(); });

  it("isola fazendas e bloqueia escrita direta", async () => {
    const rows = await pg.query<{ id: string }>("select id from public.farms");
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].id).toBe(farm1);
    await expect(pg.query("insert into public.financial_accounts(farm_id,name,account_type,opening_date) values ($1,'Invasão','cash','2026-01-01')", [farm1])).rejects.toThrow();
    await asOwner(owner2);
    expect(await scalar<number>("select count(*)::int as value from public.farms")).toBe(1);
    await asOwner(owner1);
  });

  it("calcula saldo, liquida uma vez e cancela sem mexer no caixa", async () => {
    const accountId = await scalar("select public.finance_save_account(null,'Banco','bank',1000.00,'2026-01-01',true) as value");
    const categoryIncome = await scalar("select id as value from public.financial_categories where farm_id=$1 and category_type='income' limit 1", [farm1]);
    const categoryExpense = await scalar("select id as value from public.financial_categories where farm_id=$1 and category_type='expense' limit 1", [farm1]);
    const incomeKey = "33333333-3333-4333-8333-333333333333";
    const incomeId = await scalar("select public.finance_save_transaction(null,'income','Venda de suínos',200.10,$1,$2,'2026-02-01','2026-02-15',null,null,$3) as value", [categoryIncome, accountId, incomeKey]);
    expect(await scalar("select balance_text as value from public.finance_account_overview() where id=$1", [accountId])).toBe("1000.00");
    await expect(pg.query("select public.finance_settle_transaction($1,$2,'2026-01-01')", [incomeId, accountId])).rejects.toThrow(/após a data/);
    const sameId = await scalar("select public.finance_save_transaction(null,'income','Venda de suínos',200.10,$1,$2,'2026-02-01','2026-02-15',null,null,$3) as value", [categoryIncome, accountId, incomeKey]);
    expect(sameId).toBe(incomeId);
    await pg.query("select public.finance_settle_transaction($1,$2,'2026-02-16')", [incomeId, accountId]);
    expect(await scalar("select balance_text as value from public.finance_account_overview() where id=$1", [accountId])).toBe("1200.10");
    await expect(pg.query("select public.finance_settle_transaction($1,$2,'2026-02-16')", [incomeId, accountId])).rejects.toThrow(/pendente/);

    const expenseId = await scalar("select public.finance_save_transaction(null,'expense','Compra de ração',50.05,$1,$2,'2026-02-02','2026-02-20',null,null,$3) as value", [categoryExpense, accountId, "44444444-4444-4444-8444-444444444444"]);
    expect(await scalar("select balance_text as value from public.finance_account_overview() where id=$1", [accountId])).toBe("1200.10");
    await pg.query("select public.finance_cancel_transaction($1)", [expenseId]);
    expect(await scalar("select balance_text as value from public.finance_account_overview() where id=$1", [accountId])).toBe("1200.10");
    await expect(pg.query("select public.finance_settle_transaction($1,$2,'2026-02-21')", [expenseId, accountId])).rejects.toThrow(/pendente/);

    const paidId = await scalar("select public.finance_save_transaction(null,'expense','Energia elétrica',75.25,$1,$2,'2026-02-03','2026-02-20',null,null,$3) as value", [categoryExpense, accountId, "55555555-5555-4555-8555-555555555555"]);
    await pg.query("select public.finance_settle_transaction($1,$2,'2026-02-21')", [paidId, accountId]);
    expect(await scalar("select balance_text as value from public.finance_account_overview() where id=$1", [accountId])).toBe("1124.85");
    await expect(pg.query("select public.finance_save_account($1,'Banco','bank',999.00,'2026-01-01',true)", [accountId])).rejects.toThrow(/Saldo inicial/);

    const reversalKey = "66666666-6666-4666-8666-666666666666";
    const reversalId = await scalar("select public.finance_reverse_transaction($1,'2026-02-22',$2) as value", [paidId, reversalKey]);
    expect(await scalar("select balance_text as value from public.finance_account_overview() where id=$1", [accountId])).toBe("1200.10");
    expect(await scalar("select public.finance_reverse_transaction($1,'2026-02-22',$2) as value", [paidId, reversalKey])).toBe(reversalId);
    await expect(pg.query("select public.finance_reverse_transaction($1,'2026-02-22',$2)", [paidId, "77777777-7777-4777-8777-777777777777"])).rejects.toThrow(/estornado/);
    expect(await scalar<number>("select count(*)::int as value from public.audit_logs where farm_id=$1 and table_name='financial_transactions'", [farm1])).toBeGreaterThan(0);

    const incomeReversal = await scalar("select public.finance_reverse_transaction($1,'2026-02-23',$2) as value", [incomeId, "88888888-8888-4888-8888-888888888888"]);
    expect(incomeReversal).toBeTruthy();
    expect(await scalar("select balance_text as value from public.finance_account_overview() where id=$1", [accountId])).toBe("1000.00");
    const listed = await pg.query<{ amount_text: string; reversal_id: string }>("select amount_text, reversal_id from public.finance_list_transactions('income')");
    expect(listed.rows).toEqual([{ amount_text: "200.10", reversal_id: incomeReversal }]);
    const customCategory = await scalar("select public.finance_save_category(null,'expense','Categoria teste',true) as value");
    expect(await scalar("select name as value from public.financial_categories where id=$1", [customCategory])).toBe("Categoria teste");
    const events = await pg.query<{ kind: string; amount_text: string; category_name: string }>("select kind, amount_text, category_name from public.finance_dashboard_events('2026-02-01','2026-02-28')");
    expect(events.rows.map((event) => event.kind).sort()).toEqual(["expense", "income", "reversal_expense", "reversal_income"]);
    expect(events.rows.find((event) => event.kind === "reversal_expense")?.category_name).toBeTruthy();
  }, 120_000);

  it("nega operações na fazenda de outro proprietário", async () => {
    await asOwner(owner2);
    const otherAccount = await scalar("select public.finance_save_account(null,'Caixa','cash',10.00,'2026-01-01',true) as value");
    await asOwner(owner1);
    await expect(pg.query("select public.finance_save_account($1,'Alterada','cash',10.00,'2026-01-01',true)", [otherAccount])).rejects.toThrow(/não encontrada/);
    expect(await scalar<number>("select count(*)::int as value from public.finance_account_overview()")).toBe(1);
  });

  it("calcula saldo histórico com saldo inicial, estornos e transferência neutra", async () => {
    const first = await pg.query<{ day: string; balance_text: string }>("select * from public.finance_dashboard_balance_series('2026-02-01','2026-02-28')");
    expect(first.rows[0].balance_text).toBe("1000.00");
    expect(first.rows.find((row) => new Date(row.day).toISOString().slice(0, 10) === "2026-02-16")?.balance_text).toBe("1200.10");
    expect(first.rows.find((row) => new Date(row.day).toISOString().slice(0, 10) === "2026-02-21")?.balance_text).toBe("1124.85");
    expect(first.rows.at(-1)?.balance_text).toBe("1000.00");

    const secondAccount = await scalar("select public.finance_save_account(null,'Caixa auxiliar','cash',50.00,'2026-03-01',true) as value");
    expect((await pg.query<{ balance_text: string }>("select balance_text from public.finance_dashboard_balance_series('2026-02-28','2026-02-28')")).rows[0].balance_text).toBe("1000.00");
    const source = await scalar("select id as value from public.finance_account_overview() where name='Banco'");
    await pg.exec("reset role");
    await pg.query(`insert into public.financial_transactions
      (farm_id, kind, description, amount, account_id, destination_account_id, competency_date, settled_on, status, idempotency_key)
      values ($1,'transfer','Transferência interna',25.00,$2,$3,'2026-03-02','2026-03-02','settled',$4)`,
    [farm1, source, secondAccount, "99999999-9999-4999-8999-999999999999"]);
    await pg.exec("set role authenticated");
    await asOwner(owner1);
    const march = await pg.query<{ balance_text: string }>("select balance_text from public.finance_dashboard_balance_series('2026-03-01','2026-03-03') order by day");
    expect(march.rows.map((row) => row.balance_text)).toEqual(["1050.00", "1050.00", "1050.00"]);
    const overview = await pg.query<{ balance_text: string }>("select balance_text from public.finance_account_overview()");
    expect(overview.rows.reduce((total, row) => total + Number(row.balance_text), 0)).toBe(1050);
  });

  it("exclui cancelados e pagos dos vencidos e lista próximas contas por tipo", async () => {
    const categoryExpense = await scalar("select id as value from public.financial_categories where farm_id=$1 and category_type='expense' limit 1", [farm1]);
    const categoryIncome = await scalar("select id as value from public.financial_categories where farm_id=$1 and category_type='income' limit 1", [farm1]);
    await pg.query("select public.finance_save_transaction(null,'expense','Conta vencida',12.30,$1,null,'2026-02-20','2026-02-25',null,null,$2)", [categoryExpense, "aaaa1111-1111-4111-8111-111111111111"]);
    await pg.query("select public.finance_save_transaction(null,'income','Venda futura',30.00,$1,null,'2026-03-01','2026-03-10',null,null,$2)", [categoryIncome, "bbbb1111-1111-4111-8111-111111111111"]);
    expect(await scalar("select public.finance_dashboard_overdue_expenses('2026-03-01') as value")).toBe("12.30");
    const due = await pg.query<{ kind: string; amount_text: string }>("select kind, amount_text from public.finance_dashboard_next_due('2026-03-01')");
    expect(due.rows).toEqual([{ kind: "income", amount_text: "30.00" }]);
    await asOwner(owner2);
    expect(await scalar("select public.finance_dashboard_overdue_expenses('2026-03-01') as value")).toBe("0.00");
    expect((await pg.query("select * from public.finance_dashboard_next_due('2026-03-01')")).rows).toHaveLength(0);
    await asOwner(owner1);
  });
});
