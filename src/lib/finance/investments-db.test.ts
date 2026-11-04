import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const owner = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";
const farm = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherFarm = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let pg: PGlite;
let account: string;
let productiveCategory: string;
let financialCategory: string;

async function scalar<T = string>(sql: string, params: unknown[] = []): Promise<T> {
  const rows = await pg.query<{ value: T }>(sql, params);
  return rows.rows[0].value;
}
async function asOwner(id: string) { await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); }

describe("investimentos integrados ao caixa", () => {
  beforeAll(async () => {
    pg = await PGlite.create({ extensions: { pgcrypto } });
    await pg.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;`);
    for (const file of [
      "20261023000100_initial_schema.sql", "20261023000200_financial_core.sql",
      "20261023000300_dashboard_data.sql", "20261027000100_dashboard_phase3.sql",
      "20261027000200_investments.sql",
    ]) await pg.exec(readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8"));
    await pg.query("insert into auth.users(id) values ($1),($2)", [owner, stranger]);
    await pg.query("insert into public.farms(id,owner_id,name) values ($1,$2,'Fazenda'),($3,$4,'Outra fazenda')", [farm, owner, otherFarm, stranger]);
    await pg.exec("set role authenticated");
    await asOwner(owner);
    account = await scalar("select public.finance_save_account(null,'Banco','bank',200000.00,'2026-01-01',true) as value");
    productiveCategory = await scalar("select id as value from public.financial_categories where category_type='productive_investment' and name='Geradores'");
    financialCategory = await scalar("select id as value from public.financial_categories where category_type='financial_investment' and name='CDB'");
  }, 120_000);
  afterAll(async () => { await pg?.close(); });

  it("cria investimento produtivo com uma única saída e estorna sem virar despesa operacional", async () => {
    const key = "33333333-3333-4333-8333-333333333333";
    const id = await scalar("select public.finance_save_productive_investment(null,'Gerador', $1,'Backup de energia',50000.00,'2026-02-10',$2,'active',null,$3) as value", [productiveCategory, account, key]);
    expect(await scalar("select public.finance_save_productive_investment(null,'Gerador', $1,'Backup de energia',50000.00,'2026-02-10',$2,'active',null,$3) as value", [productiveCategory, account, key])).toBe(id);
    expect(await scalar("select balance_text as value from public.finance_account_overview() where id=$1", [account])).toBe("150000.00");
    expect(await scalar<number>("select count(*)::int as value from public.financial_transactions where kind='capital_expenditure'")).toBe(1);
    expect(await scalar<number>("select count(*)::int as value from public.investment_records where id=$1 and payment_transaction_id is not null", [id])).toBe(1);
    expect((await pg.query("select kind from public.finance_dashboard_events('2026-02-01','2026-02-28')")).rows).toEqual([{ kind: "capital_expenditure" }]);
    await expect(pg.query("select public.finance_save_productive_investment($1,'Gerador',$2,null,60000.00,'2026-02-10',$3,'active',null,$4)", [id, productiveCategory, account, crypto.randomUUID()])).rejects.toThrow(/imutáveis/);
    await pg.query("select public.finance_reverse_productive_investment($1,'2026-02-12',$2)", [id, "44444444-4444-4444-8444-444444444444"]);
    expect(await scalar("select balance_text as value from public.finance_account_overview() where id=$1", [account])).toBe("200000.00");
    expect(await scalar("select status as value from public.investment_records where id=$1", [id])).toBe("cancelled");
    await expect(pg.query("select public.finance_reverse_productive_investment($1,'2026-02-13',$2)", [id, crypto.randomUUID()])).rejects.toThrow(/já estornado/);
  });

  it("cancela planejamento sem movimentar o caixa", async () => {
    const id = await scalar("select public.finance_save_productive_investment(null,'Reforma futura',$1,null,15000.00,'2026-03-10',null,'planned',null,$2) as value", [productiveCategory, crypto.randomUUID()]);
    await pg.query("select public.finance_cancel_planned_investment($1)", [id]);
    expect(await scalar("select status as value from public.investment_records where id=$1", [id])).toBe("cancelled");
    expect(await scalar("select balance_text as value from public.finance_account_overview() where id=$1", [account])).toBe("200000.00");
  });

  it("ativa planejamento em operação atômica e mantém o valor imutável", async () => {
    const id = await scalar("select public.finance_save_productive_investment(null,'Ventilação nova',$1,null,250.00,'2026-03-12',null,'planned',null,$2) as value", [productiveCategory, crypto.randomUUID()]);
    expect(await scalar("select balance_text as value from public.finance_account_overview() where id=$1", [account])).toBe("200000.00");
    await pg.query("select public.finance_save_productive_investment($1,'Ventilação nova',$2,null,250.00,'2026-03-12',$3,'active',null,$4)", [id, productiveCategory, account, crypto.randomUUID()]);
    expect(await scalar("select balance_text as value from public.finance_account_overview() where id=$1", [account])).toBe("199750.00");
    expect(await scalar<number>("select count(*)::int as value from public.financial_transactions where kind='capital_expenditure' and amount=250.00")).toBe(1);
    await pg.query("select public.finance_reverse_productive_investment($1,'2026-03-13',$2)", [id, crypto.randomUUID()]);
    expect(await scalar("select balance_text as value from public.finance_account_overview() where id=$1", [account])).toBe("200000.00");
  });

  it("registra aplicação, aporte, resgate, avaliação e estornos com saldo exato", async () => {
    const initialKey = "55555555-5555-4555-8555-555555555555";
    const id = await scalar("select public.finance_create_application('Reserva CDB',$1,'Banco teste','2026-03-01',10000.00,$2,10000.00,'2026-03-01',null,$3) as value", [financialCategory, account, initialKey]);
    expect(await scalar("select balance_text as value from public.finance_account_overview() where id=$1", [account])).toBe("190000.00");
    const contribution = await scalar("select public.finance_add_investment_movement($1,'contribution',2000.00,'2026-03-05',$2,null,$3) as value", [id, account, "66666666-6666-4666-8666-666666666666"]);
    const withdrawal = await scalar("select public.finance_add_investment_movement($1,'withdrawal',1500.00,'2026-03-06',$2,null,$3) as value", [id, account, "77777777-7777-4777-8777-777777777777"]);
    expect(await scalar("select balance_text as value from public.finance_account_overview() where id=$1", [account])).toBe("189500.00");
    expect(await scalar("select principal_text as value from public.finance_investment_list() where id=$1", [id])).toBe("10500.00");
    await pg.query("select public.finance_save_application($1,'Reserva CDB',$2,'Banco teste',null,12000.00,'2026-03-07','active',null)", [id, financialCategory]);
    expect(await scalar("select balance_text as value from public.finance_account_overview() where id=$1", [account])).toBe("189500.00");
    expect(await scalar("select current_value::text as value from public.investment_records where id=$1", [id])).toBe("12000.00");
    await pg.query("select public.finance_reverse_investment_movement($1,'2026-03-08',$2)", [contribution, "88888888-8888-4888-8888-888888888888"]);
    await pg.query("select public.finance_reverse_investment_movement($1,'2026-03-08',$2)", [withdrawal, "99999999-9999-4999-8999-999999999999"]);
    expect(await scalar("select balance_text as value from public.finance_account_overview() where id=$1", [account])).toBe("190000.00");
    const initialMovement = await scalar("select id as value from public.investment_movements where investment_id=$1 and movement_date='2026-03-01'", [id]);
    await pg.query("select public.finance_reverse_investment_movement($1,'2026-03-09',$2)", [initialMovement, "aaaaaaaa-1111-4111-8111-111111111111"]);
    expect(await scalar("select balance_text as value from public.finance_account_overview() where id=$1", [account])).toBe("200000.00");
    expect(await scalar("select principal_text as value from public.finance_investment_list() where id=$1", [id])).toBe("0.00");
    await pg.query("select public.finance_save_application($1,'Reserva CDB',$2,'Banco teste',null,0.00,'2026-03-09','cancelled',null)", [id, financialCategory]);
    expect(await scalar("select status as value from public.investment_records where id=$1", [id])).toBe("cancelled");
    const series = await pg.query<{ balance_text: string }>("select balance_text from public.finance_dashboard_balance_series('2026-03-01','2026-03-09') order by day");
    expect(series.rows[0].balance_text).toBe("190000.00");
    expect(series.rows.at(-1)?.balance_text).toBe("200000.00");
  });

  it("aplica RLS e impede movimentações em outra fazenda", async () => {
    const id = await scalar("select id as value from public.investment_records where investment_type='financial' limit 1");
    await asOwner(stranger);
    expect((await pg.query("select * from public.investment_records")).rows).toHaveLength(0);
    expect((await pg.query("select * from public.finance_investment_list()")).rows).toHaveLength(0);
    await expect(pg.query("select public.finance_add_investment_movement($1,'contribution',100.00,'2026-03-10',$2,null,$3)", [id, account, crypto.randomUUID()])).rejects.toThrow();
    await asOwner(owner);
    await expect(pg.query("update public.investment_records set current_value=999 where id=$1", [id])).rejects.toThrow();
    expect(await scalar<number>("select count(*)::int as value from public.audit_logs where table_name in ('investment_records','investment_movements')")).toBeGreaterThan(0);
  });
});
