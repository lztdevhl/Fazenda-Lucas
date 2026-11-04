begin;

create table public.farm_units (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete restrict,
  name text not null check (length(btrim(name)) between 2 and 120),
  code text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farm_id, id),
  unique (farm_id, code)
);

create index farm_units_farm_active_idx on public.farm_units (farm_id, is_active, name);
create trigger touch_farm_units before update on public.farm_units for each row execute function public.touch_updated_at();
alter table public.farm_units enable row level security;
create policy farm_units_select on public.farm_units for select to authenticated using (public.is_farm_owner(farm_id));
revoke all on public.farm_units from authenticated, anon;
grant select on public.farm_units to authenticated;

alter table public.financial_transactions add column farm_unit_id uuid;
alter table public.financial_transactions add constraint financial_transactions_farm_unit_fk
  foreign key (farm_id, farm_unit_id) references public.farm_units(farm_id, id) on delete restrict;
create index financial_transactions_farm_unit_idx on public.financial_transactions (farm_id, farm_unit_id, competency_date);

alter table public.investment_records add column farm_unit_id uuid;
alter table public.investment_records add constraint investment_records_farm_unit_fk
  foreign key (farm_id, farm_unit_id) references public.farm_units(farm_id, id) on delete restrict;
alter table public.investment_records add constraint investment_records_financial_unit_check
  check (investment_type = 'productive' or farm_unit_id is null);
create index investment_records_farm_unit_idx on public.investment_records (farm_id, farm_unit_id, investment_date);

create function public.finance_farm_unit_list()
returns table (id uuid, name text, code text, description text, is_active boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.id, u.name, u.code, u.description, u.is_active, u.created_at
  from public.farm_units u
  where public.is_farm_owner(u.farm_id)
  order by u.is_active desc, u.name, u.id;
$$;

create function public.finance_save_farm_unit(
  p_id uuid, p_name text, p_code text, p_description text, p_is_active boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_id uuid;
begin
  v_farm := public.finance_owner_farm_id();
  if length(btrim(coalesce(p_name, ''))) not between 2 and 120
    or length(coalesce(p_code, '')) > 40 or length(coalesce(p_description, '')) > 500 then
    raise exception 'Dados do núcleo inválidos';
  end if;
  if p_id is null then
    insert into public.farm_units (farm_id, name, code, description, is_active)
    values (v_farm, btrim(p_name), nullif(btrim(p_code), ''), nullif(btrim(p_description), ''), coalesce(p_is_active, true))
    returning id into v_id;
  else
    update public.farm_units set name = btrim(p_name), code = nullif(btrim(p_code), ''),
      description = nullif(btrim(p_description), ''), is_active = coalesce(p_is_active, true)
    where id = p_id and farm_id = v_farm;
    if not found then raise exception 'Núcleo não encontrado'; end if;
    v_id := p_id;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'O código do núcleo já está em uso nesta fazenda';
end;
$$;

create or replace function public.finance_save_transaction_with_unit(
  p_id uuid, p_kind text, p_description text, p_amount numeric, p_category_id uuid,
  p_account_id uuid, p_competency_date date, p_due_date date, p_counterparty text,
  p_notes text, p_idempotency_key uuid, p_farm_unit_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_old public.financial_transactions%rowtype; v_id uuid; v_expected text;
begin
  v_farm := public.finance_owner_farm_id();
  if p_kind not in ('income','expense') or length(btrim(coalesce(p_description,''))) not between 2 and 200
    or p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2)
    or p_competency_date is null or p_due_date is null or length(coalesce(p_counterparty,'')) > 160
    or length(coalesce(p_notes,'')) > 2000 or p_idempotency_key is null then
    raise exception 'Dados do lançamento inválidos';
  end if;
  if not exists (select 1 from public.financial_categories c where c.id = p_category_id
    and c.farm_id = v_farm and c.category_type = p_kind and c.active) then
    raise exception 'Categoria inválida ou inativa';
  end if;
  if p_farm_unit_id is not null and not exists (
    select 1 from public.farm_units u where u.id = p_farm_unit_id and u.farm_id = v_farm and u.is_active
  ) then raise exception 'Núcleo inválido ou inativo'; end if;
  if p_id is null then
    select * into v_old from public.financial_transactions where farm_id = v_farm and idempotency_key = p_idempotency_key;
    if found then
      v_expected := p_kind || '|' || btrim(p_description) || '|' || p_amount::text || '|' || p_category_id::text || '|' || p_competency_date::text || '|' || p_due_date::text || '|' || coalesce(p_farm_unit_id::text, '');
      if v_old.kind || '|' || v_old.description || '|' || v_old.amount::text || '|' || v_old.category_id::text || '|' || v_old.competency_date::text || '|' || v_old.due_date::text || '|' || coalesce(v_old.farm_unit_id::text, '') = v_expected then return v_old.id; end if;
      raise exception 'Chave de repetição usada com dados diferentes';
    end if;
    insert into public.financial_transactions (farm_id, kind, description, amount, category_id, account_id,
      farm_unit_id, competency_date, due_date, counterparty, notes, idempotency_key)
    values (v_farm, p_kind, btrim(p_description), p_amount, p_category_id, p_account_id,
      p_farm_unit_id, p_competency_date, p_due_date, nullif(btrim(p_counterparty), ''), nullif(btrim(p_notes), ''), p_idempotency_key)
    returning id into v_id;
  else
    select * into v_old from public.financial_transactions where id = p_id and farm_id = v_farm for update;
    if not found or v_old.kind <> p_kind or v_old.status <> 'pending' then raise exception 'Somente lançamentos pendentes podem ser editados'; end if;
    update public.financial_transactions set description = btrim(p_description), amount = p_amount,
      category_id = p_category_id, farm_unit_id = p_farm_unit_id, competency_date = p_competency_date,
      due_date = p_due_date, counterparty = nullif(btrim(p_counterparty), ''), notes = nullif(btrim(p_notes), '')
    where id = p_id and farm_id = v_farm;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;

create function public.finance_list_transactions_by_unit(
  p_kind text, p_search text, p_status text, p_category_id uuid, p_from date, p_to date, p_farm_unit_id uuid
)
returns table (id uuid, kind text, description text, amount_text text, category_id uuid, category_name text,
  farm_unit_id uuid, farm_unit_name text, account_id uuid, account_name text, competency_date date,
  due_date date, settled_on date, status text, counterparty text, notes text, created_at timestamptz, reversal_id uuid)
language sql stable security definer set search_path = '' as $$
  select t.id, t.kind, t.description, t.amount::text, t.category_id, c.name,
    t.farm_unit_id, u.name, t.account_id, a.name, t.competency_date, t.due_date, t.settled_on, t.status,
    t.counterparty, t.notes, t.created_at, r.id
  from public.financial_transactions t
  left join public.financial_categories c on c.id = t.category_id and c.farm_id = t.farm_id
  left join public.farm_units u on u.id = t.farm_unit_id and u.farm_id = t.farm_id
  left join public.financial_accounts a on a.id = t.account_id and a.farm_id = t.farm_id
  left join public.financial_transactions r on r.reversal_of_id = t.id and r.farm_id = t.farm_id
  where public.is_farm_owner(t.farm_id) and t.kind = p_kind
    and (p_search is null or t.description ilike '%' || p_search || '%' or coalesce(t.counterparty, '') ilike '%' || p_search || '%')
    and (p_status is null or t.status = p_status) and (p_category_id is null or t.category_id = p_category_id)
    and (p_from is null or t.competency_date >= p_from) and (p_to is null or t.competency_date <= p_to)
    and (p_farm_unit_id is null or t.farm_unit_id = p_farm_unit_id)
  order by t.competency_date desc, t.created_at desc, t.id desc;
$$;

create function public.finance_dashboard_events_by_unit(p_from date, p_to date, p_farm_unit_id uuid)
returns table (id uuid, kind text, description text, amount_text text, status text, event_date date,
  due_date date, category_name text, account_name text, reversal_of_id uuid)
language sql stable security definer set search_path = '' as $$
  select t.id, t.kind, t.description, t.amount::text, t.status,
    case when t.status = 'settled' then t.settled_on else t.due_date end,
    t.due_date, c.name, a.name, t.reversal_of_id
  from public.financial_transactions t
  left join public.financial_transactions original on original.id = t.reversal_of_id and original.farm_id = t.farm_id
  left join public.financial_categories c on c.id = coalesce(t.category_id, original.category_id) and c.farm_id = t.farm_id
  left join public.financial_accounts a on a.id = t.account_id and a.farm_id = t.farm_id
  where public.is_farm_owner(t.farm_id) and t.status in ('pending','settled')
    and ((t.status = 'settled' and t.settled_on between p_from and p_to)
      or (t.status = 'pending' and t.due_date between p_from and p_to))
    and (p_farm_unit_id is null or t.farm_unit_id = p_farm_unit_id)
  order by case when t.status = 'settled' then t.settled_on else t.due_date end desc, t.created_at desc;
$$;

create function public.finance_dashboard_balance_series_by_unit(p_from date, p_to date, p_farm_unit_id uuid)
returns table (day date, balance_text text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_farm_unit_id is not null then return; end if;
  return query select * from public.finance_dashboard_balance_series(p_from, p_to);
end;
$$;

create function public.finance_dashboard_overdue_expenses_by_unit(p_today date, p_farm_unit_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(sum(t.amount), 0)::numeric(20,2)::text
  from public.financial_transactions t
  where public.is_farm_owner(t.farm_id) and t.status = 'pending' and t.kind = 'expense'
    and t.due_date < p_today and (p_farm_unit_id is null or t.farm_unit_id = p_farm_unit_id);
$$;

create function public.finance_dashboard_next_due_by_unit(p_today date, p_farm_unit_id uuid)
returns table (id uuid, kind text, description text, amount_text text, due_date date)
language sql stable security definer set search_path = '' as $$
  with ranked as (
    select t.id, t.kind, t.description, t.amount, t.due_date,
      row_number() over (partition by t.kind order by t.due_date, t.created_at) as position
    from public.financial_transactions t
    where public.is_farm_owner(t.farm_id) and t.status = 'pending' and t.kind in ('income','expense')
      and t.due_date >= p_today and (p_farm_unit_id is null or t.farm_unit_id = p_farm_unit_id)
  ) select id, kind, description, amount::text, due_date from ranked where position <= 5 order by due_date, kind;
$$;

create or replace function public.finance_reverse_transaction(p_id uuid, p_settled_on date, p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_old public.financial_transactions%rowtype; v_existing public.financial_transactions%rowtype; v_id uuid;
begin
  v_farm := public.finance_owner_farm_id();
  if p_idempotency_key is null then raise exception 'Chave de repetição obrigatória'; end if;
  select * into v_old from public.financial_transactions where id = p_id and farm_id = v_farm for update;
  if not found or v_old.kind not in ('income','expense') or v_old.status <> 'settled' then raise exception 'Somente lançamentos liquidados podem ser estornados'; end if;
  select * into v_existing from public.financial_transactions where reversal_of_id = p_id and farm_id = v_farm;
  if found then if v_existing.idempotency_key = p_idempotency_key then return v_existing.id; end if; raise exception 'Este lançamento já foi estornado'; end if;
  if p_settled_on is null or p_settled_on < v_old.settled_on then raise exception 'Data de estorno inválida'; end if;
  insert into public.financial_transactions (farm_id,kind,description,amount,account_id,farm_unit_id,competency_date,settled_on,status,notes,reversal_of_id,idempotency_key)
  values (v_farm,case v_old.kind when 'income' then 'reversal_income' else 'reversal_expense' end,'Estorno: ' || v_old.description,v_old.amount,v_old.account_id,v_old.farm_unit_id,p_settled_on,p_settled_on,'settled','Estorno auditável do lançamento ' || v_old.id::text,v_old.id,p_idempotency_key) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.finance_investment_list_by_unit(p_farm_unit_id uuid)
returns table (id uuid, investment_type text, category_id uuid, category_name text, name text, description text,
  initial_value_text text, current_value_text text, principal_text text, investment_date date, valuation_date date,
  institution text, status text, farm_unit_id uuid, farm_unit_name text, payment_transaction_id uuid,
  payment_account_id uuid, payment_reversal_id uuid, payment_reversal_date date, notes text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id,r.investment_type,r.category_id,c.name,r.name,r.description,r.initial_value::text,r.current_value::text,
    case when r.investment_type = 'financial' then coalesce((select sum(case when m.movement_type in ('contribution','reversal_withdrawal') then m.amount else -m.amount end) from public.investment_movements m where m.investment_id = r.id and m.farm_id = r.farm_id),0)::numeric(20,2)::text else null end,
    r.investment_date,r.valuation_date,r.institution,r.status,r.farm_unit_id,u.name,r.payment_transaction_id,t.account_id,rev.id,rev.settled_on,r.notes,r.created_at
  from public.investment_records r
  join public.financial_categories c on c.id = r.category_id and c.farm_id = r.farm_id
  left join public.farm_units u on u.id = r.farm_unit_id and u.farm_id = r.farm_id
  left join public.financial_transactions t on t.id = r.payment_transaction_id and t.farm_id = r.farm_id
  left join public.financial_transactions rev on rev.reversal_of_id = t.id and rev.farm_id = r.farm_id
  where public.is_farm_owner(r.farm_id) and (p_farm_unit_id is null or r.farm_unit_id = p_farm_unit_id)
  order by r.investment_date desc,r.created_at desc,r.id desc;
$$;

-- A unidade só é gravada em investimentos produtivos. Aplicações financeiras
-- continuam no caixa geral e não são atribuídas artificialmente a um núcleo.
create or replace function public.finance_save_productive_investment_with_unit(
  p_id uuid,p_name text,p_category_id uuid,p_description text,p_amount numeric,p_date date,
  p_account_id uuid,p_status text,p_notes text,p_idempotency_key uuid,p_farm_unit_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_old public.investment_records%rowtype; v_payment uuid; v_id uuid;
begin
  v_farm := public.finance_owner_farm_id();
  if length(btrim(coalesce(p_name,''))) not between 2 and 160 or p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2)
    or p_date is null or p_status not in ('planned','active','completed') or length(coalesce(p_description,'')) > 2000
    or length(coalesce(p_notes,'')) > 2000 or not exists (select 1 from public.financial_categories c where c.id = p_category_id and c.farm_id = v_farm and c.category_type = 'productive_investment' and c.active) then
    raise exception 'Dados do investimento produtivo inválidos'; end if;
  if p_farm_unit_id is not null and not exists (select 1 from public.farm_units u where u.id = p_farm_unit_id and u.farm_id = v_farm and u.is_active) then raise exception 'Núcleo inválido ou inativo'; end if;
  if p_id is null then
    if p_idempotency_key is null then raise exception 'Chave de repetição obrigatória'; end if;
    select * into v_old from public.investment_records where farm_id = v_farm and idempotency_key = p_idempotency_key;
    if found then if v_old.investment_type = 'productive' and v_old.name = btrim(p_name) and v_old.initial_value = p_amount and v_old.investment_date = p_date then return v_old.id; end if; raise exception 'Chave de repetição usada com dados diferentes'; end if;
  else
    select * into v_old from public.investment_records where id = p_id and farm_id = v_farm for update;
    if not found or v_old.investment_type <> 'productive' or v_old.status = 'cancelled' then raise exception 'Investimento produtivo não encontrado ou cancelado'; end if;
    if v_old.payment_transaction_id is not null and (v_old.category_id <> p_category_id or v_old.initial_value <> p_amount or v_old.investment_date <> p_date or v_old.farm_unit_id is distinct from p_farm_unit_id or p_status = 'planned') then raise exception 'Valor, categoria, data e núcleo de um pagamento liquidado são imutáveis'; end if;
  end if;
  if p_status <> 'planned' and (p_id is null or v_old.payment_transaction_id is null) then
    insert into public.financial_transactions(farm_id,kind,description,amount,category_id,account_id,farm_unit_id,competency_date,settled_on,status,notes,idempotency_key)
    values (v_farm,'capital_expenditure',btrim(p_name),p_amount,p_category_id,p_account_id,p_farm_unit_id,p_date,p_date,'settled',nullif(btrim(p_notes),''),p_idempotency_key) returning id into v_payment;
  end if;
  if p_id is null then
    insert into public.investment_records(farm_id,investment_type,category_id,name,initial_value,investment_date,description,status,farm_unit_id,payment_transaction_id,notes,idempotency_key)
    values (v_farm,'productive',p_category_id,btrim(p_name),p_amount,p_date,nullif(btrim(p_description),''),p_status,p_farm_unit_id,v_payment,nullif(btrim(p_notes),''),p_idempotency_key) returning id into v_id;
  else
    update public.investment_records set name=btrim(p_name),category_id=p_category_id,initial_value=p_amount,investment_date=p_date,description=nullif(btrim(p_description),''),status=p_status,farm_unit_id=p_farm_unit_id,notes=nullif(btrim(p_notes),''),payment_transaction_id=coalesce(v_old.payment_transaction_id,v_payment) where id=p_id and farm_id=v_farm;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.finance_reverse_productive_investment(p_id uuid,p_date date,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_record public.investment_records%rowtype; v_payment public.financial_transactions%rowtype;
  v_existing public.financial_transactions%rowtype; v_id uuid;
begin
  v_farm := public.finance_owner_farm_id();
  if p_idempotency_key is null then raise exception 'Chave de repetição obrigatória'; end if;
  select * into v_record from public.investment_records where id = p_id and farm_id = v_farm for update;
  if not found or v_record.investment_type <> 'productive' or v_record.payment_transaction_id is null then raise exception 'Investimento produtivo pago não encontrado'; end if;
  select * into v_payment from public.financial_transactions where id = v_record.payment_transaction_id and farm_id = v_farm;
  select * into v_existing from public.financial_transactions where reversal_of_id = v_payment.id and farm_id = v_farm;
  if found then
    if v_existing.idempotency_key = p_idempotency_key then return v_existing.id; end if;
    raise exception 'Pagamento já estornado';
  end if;
  if p_date is null or p_date < v_payment.settled_on then raise exception 'Data de estorno inválida'; end if;
  insert into public.financial_transactions(farm_id,kind,description,amount,account_id,farm_unit_id,
    competency_date,settled_on,status,reversal_of_id,idempotency_key)
  values (v_farm,'reversal_capital_expenditure','Estorno: ' || v_record.name,v_payment.amount,
    v_payment.account_id,v_record.farm_unit_id,p_date,p_date,'settled',v_payment.id,p_idempotency_key) returning id into v_id;
  update public.investment_records set status = 'cancelled' where id = p_id and farm_id = v_farm;
  return v_id;
end;
$$;

create or replace function public.finance_reverse_investment_movement(p_movement_id uuid,p_date date,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_original public.investment_movements%rowtype; v_transaction public.financial_transactions%rowtype;
  v_existing public.investment_movements%rowtype; v_existing_key uuid; v_reverse_transaction uuid; v_id uuid; v_unit uuid;
begin
  v_farm := public.finance_owner_farm_id();
  if p_idempotency_key is null then raise exception 'Chave de repetição obrigatória'; end if;
  select * into v_original from public.investment_movements where id = p_movement_id and farm_id = v_farm for update;
  if not found or v_original.movement_type not in ('contribution','withdrawal') then raise exception 'Movimentação não encontrada'; end if;
  select * into v_existing from public.investment_movements where reversal_of_id = p_movement_id and farm_id = v_farm;
  if found then
    select idempotency_key into v_existing_key from public.financial_transactions where id = v_existing.transaction_id;
    if v_existing_key = p_idempotency_key then return v_existing.id; end if;
    raise exception 'Movimentação já estornada';
  end if;
  select * into v_transaction from public.financial_transactions where id = v_original.transaction_id and farm_id = v_farm;
  select farm_unit_id into v_unit from public.investment_records where id = v_original.investment_id and farm_id = v_farm;
  if p_date is null or p_date < v_original.movement_date then raise exception 'Data de estorno inválida'; end if;
  insert into public.financial_transactions(farm_id,kind,description,amount,account_id,farm_unit_id,
    competency_date,settled_on,status,reversal_of_id,idempotency_key)
  values (v_farm,case v_original.movement_type when 'contribution' then 'reversal_investment_contribution'
      else 'reversal_investment_withdrawal' end,
    'Estorno: ' || v_transaction.description,v_original.amount,v_transaction.account_id,v_unit,
    p_date,p_date,'settled',v_transaction.id,p_idempotency_key) returning id into v_reverse_transaction;
  insert into public.investment_movements(farm_id,investment_id,transaction_id,movement_type,
    amount,movement_date,reversal_of_id)
  values (v_farm,v_original.investment_id,v_reverse_transaction,
    'reversal_' || v_original.movement_type,v_original.amount,p_date,v_original.id) returning id into v_id;
  return v_id;
end;
$$;

do $$ declare f text; begin foreach f in array array[
  'finance_farm_unit_list()','finance_save_farm_unit(uuid,text,text,text,boolean)',
  'finance_save_transaction_with_unit(uuid,text,text,numeric,uuid,uuid,date,date,text,text,uuid,uuid)',
  'finance_list_transactions_by_unit(text,text,text,uuid,date,date,uuid)',
  'finance_dashboard_events_by_unit(date,date,uuid)','finance_dashboard_balance_series_by_unit(date,date,uuid)',
  'finance_dashboard_overdue_expenses_by_unit(date,uuid)','finance_dashboard_next_due_by_unit(date,uuid)',
  'finance_investment_list_by_unit(uuid)','finance_save_productive_investment_with_unit(uuid,text,uuid,text,numeric,date,uuid,text,text,uuid,uuid)'
] loop execute 'revoke all on function public.' || f || ' from public, anon'; execute 'grant execute on function public.' || f || ' to authenticated'; end loop; end $$;

commit;
