begin;

alter table public.financial_transactions
  add column reversal_of_id uuid,
  add constraint financial_transactions_reversal_fk foreign key (farm_id, reversal_of_id)
    references public.financial_transactions(farm_id, id) on delete restrict,
  add constraint financial_transactions_reversal_unique unique (reversal_of_id);

alter table public.financial_transactions drop constraint financial_transactions_kind_check;
alter table public.financial_transactions add constraint financial_transactions_kind_check
  check (kind in ('income', 'expense', 'transfer', 'capital_expenditure',
    'investment_contribution', 'investment_withdrawal', 'reversal_income', 'reversal_expense'));
alter table public.financial_transactions drop constraint category_required;
alter table public.financial_transactions add constraint category_required check (
  (kind in ('income', 'expense', 'capital_expenditure') and category_id is not null)
  or (kind in ('transfer', 'investment_contribution', 'investment_withdrawal', 'reversal_income', 'reversal_expense') and category_id is null)
);

create or replace function public.validate_financial_transaction()
returns trigger language plpgsql set search_path = '' as $$
declare expected_type text; original_record record;
begin
  if tg_op = 'INSERT' and new.status = 'cancelled' then
    raise exception 'A new transaction cannot start as cancelled';
  end if;
  if tg_op = 'UPDATE' then
    if new.farm_id <> old.farm_id or new.id <> old.id or new.idempotency_key <> old.idempotency_key then
      raise exception 'Transaction identity cannot change';
    end if;
    if old.status <> 'pending' then
      raise exception 'Settled or cancelled transactions are immutable; create a reversal';
    end if;
    if new.status not in ('pending', 'settled', 'cancelled') then
      raise exception 'Invalid status transition';
    end if;
  end if;

  expected_type := case new.kind
    when 'income' then 'income'
    when 'expense' then 'expense'
    when 'capital_expenditure' then 'productive_investment'
    else null end;
  if expected_type is not null and not exists (
    select 1 from public.financial_categories c
    where c.id = new.category_id and c.farm_id = new.farm_id and c.category_type = expected_type
  ) then raise exception 'Category does not match transaction kind'; end if;

  if new.kind in ('reversal_income', 'reversal_expense') then
    if new.reversal_of_id is null or new.status <> 'settled' then
      raise exception 'Reversals must be settled and reference the original';
    end if;
    select kind, amount, account_id into original_record
    from public.financial_transactions
    where id = new.reversal_of_id and farm_id = new.farm_id and status = 'settled';
    if not found or original_record.kind is distinct from
      (case new.kind when 'reversal_income' then 'income' else 'expense' end)
      or original_record.amount is distinct from new.amount
      or original_record.account_id is distinct from new.account_id then
      raise exception 'Reversal must match the original settled transaction';
    end if;
  elsif new.reversal_of_id is not null then
    raise exception 'Only a reversal may reference another transaction';
  end if;
  return new;
end;
$$;

-- Functions execute with the migration owner's rights. Every public entry point
-- resolves the farm from auth.uid() and never accepts a farm_id from the caller.
create function public.finance_owner_farm_id()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare result uuid;
begin
  select id into result from public.farms where owner_id = auth.uid();
  if result is null then raise exception 'Proprietário não autorizado' using errcode = '42501'; end if;
  return result;
end;
$$;

create function public.finance_save_account(
  p_id uuid, p_name text, p_account_type text, p_opening_balance numeric,
  p_opening_date date, p_active boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_old public.financial_accounts%rowtype; v_id uuid;
begin
  v_farm := public.finance_owner_farm_id();
  if length(btrim(coalesce(p_name, ''))) not between 2 and 100
    or p_account_type not in ('bank', 'cash') or p_opening_balance is null
    or p_opening_balance <> round(p_opening_balance, 2) or abs(p_opening_balance) >= 10000000000000000
    or p_opening_date is null or p_active is null then
    raise exception 'Dados da conta inválidos';
  end if;
  if p_id is null then
    insert into public.financial_accounts (farm_id, name, account_type, opening_balance, opening_date, active)
    values (v_farm, btrim(p_name), p_account_type, p_opening_balance, p_opening_date, p_active)
    returning id into v_id;
  else
    select * into v_old from public.financial_accounts where id = p_id and farm_id = v_farm for update;
    if not found then raise exception 'Conta não encontrada'; end if;
    if (v_old.opening_balance is distinct from p_opening_balance or v_old.opening_date is distinct from p_opening_date)
      and exists (select 1 from public.financial_transactions t
        where t.farm_id = v_farm and t.status = 'settled'
          and (t.account_id = p_id or t.destination_account_id = p_id)) then
      raise exception 'Saldo inicial e data de referência não podem mudar após uma liquidação';
    end if;
    update public.financial_accounts set name = btrim(p_name), account_type = p_account_type,
      opening_balance = p_opening_balance, opening_date = p_opening_date, active = p_active
    where id = p_id and farm_id = v_farm;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;

create function public.finance_save_category(p_id uuid, p_category_type text, p_name text, p_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_old public.financial_categories%rowtype; v_id uuid;
begin
  v_farm := public.finance_owner_farm_id();
  if p_category_type not in ('income', 'expense') or length(btrim(coalesce(p_name, ''))) not between 2 and 100 or p_active is null then
    raise exception 'Dados da categoria inválidos';
  end if;
  if p_id is null then
    insert into public.financial_categories (farm_id, category_type, name, active)
    values (v_farm, p_category_type, btrim(p_name), p_active) returning id into v_id;
  else
    select * into v_old from public.financial_categories where id = p_id and farm_id = v_farm for update;
    if not found or v_old.category_type <> p_category_type then raise exception 'Categoria não encontrada'; end if;
    update public.financial_categories set name = btrim(p_name), active = p_active
    where id = p_id and farm_id = v_farm;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;

create function public.finance_save_transaction(
  p_id uuid, p_kind text, p_description text, p_amount numeric,
  p_category_id uuid, p_account_id uuid, p_competency_date date, p_due_date date,
  p_counterparty text, p_notes text, p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_old public.financial_transactions%rowtype; v_id uuid; v_expected text;
begin
  v_farm := public.finance_owner_farm_id();
  v_expected := case p_kind when 'income' then 'income' when 'expense' then 'expense' else null end;
  if v_expected is null or length(btrim(coalesce(p_description, ''))) not between 2 and 200
    or p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2)
    or p_amount >= 10000000000000000 or p_competency_date is null or p_due_date is null
    or p_idempotency_key is null then raise exception 'Dados do lançamento inválidos'; end if;
  if not exists (select 1 from public.financial_categories c where c.id = p_category_id
    and c.farm_id = v_farm and c.category_type = v_expected and c.active) then
    raise exception 'Categoria inválida ou inativa';
  end if;
  if p_account_id is not null and not exists (
    select 1 from public.financial_accounts a where a.id = p_account_id and a.farm_id = v_farm and a.active
  ) then raise exception 'Conta inválida ou inativa'; end if;

  if p_id is null then
    insert into public.financial_transactions (farm_id, kind, description, amount, category_id,
      account_id, competency_date, due_date, counterparty, notes, idempotency_key)
    values (v_farm, p_kind, btrim(p_description), p_amount, p_category_id,
      p_account_id, p_competency_date, p_due_date, nullif(btrim(p_counterparty), ''),
      nullif(btrim(p_notes), ''), p_idempotency_key)
    on conflict (farm_id, idempotency_key) do nothing returning id into v_id;
    if v_id is null then
      select * into v_old from public.financial_transactions
      where farm_id = v_farm and idempotency_key = p_idempotency_key;
      if not found or row(v_old.kind, v_old.description, v_old.amount, v_old.category_id,
        v_old.account_id, v_old.competency_date, v_old.due_date, v_old.counterparty, v_old.notes)
        is distinct from row(p_kind, btrim(p_description), p_amount, p_category_id,
        p_account_id, p_competency_date, p_due_date, nullif(btrim(p_counterparty), ''), nullif(btrim(p_notes), '')) then
        raise exception 'Chave de repetição usada com dados diferentes';
      end if;
      v_id := v_old.id;
    end if;
  else
    select * into v_old from public.financial_transactions where id = p_id and farm_id = v_farm for update;
    if not found or v_old.kind <> p_kind or v_old.status <> 'pending' then
      raise exception 'Somente lançamentos pendentes podem ser editados';
    end if;
    update public.financial_transactions set description = btrim(p_description), amount = p_amount,
      category_id = p_category_id, account_id = p_account_id, competency_date = p_competency_date,
      due_date = p_due_date, counterparty = nullif(btrim(p_counterparty), ''),
      notes = nullif(btrim(p_notes), '') where id = p_id and farm_id = v_farm;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;

create function public.finance_settle_transaction(p_id uuid, p_account_id uuid, p_settled_on date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_old public.financial_transactions%rowtype; v_account public.financial_accounts%rowtype;
begin
  v_farm := public.finance_owner_farm_id();
  select * into v_old from public.financial_transactions where id = p_id and farm_id = v_farm for update;
  if not found or v_old.kind not in ('income', 'expense') or v_old.status <> 'pending' then
    raise exception 'Lançamento não está pendente';
  end if;
  select * into v_account from public.financial_accounts where id = p_account_id and farm_id = v_farm for share;
  if not found or not v_account.active then raise exception 'Selecione uma conta ativa'; end if;
  if p_settled_on is null or p_settled_on <= v_account.opening_date then
    raise exception 'A liquidação deve ocorrer após a data do saldo inicial';
  end if;
  update public.financial_transactions set status = 'settled', account_id = p_account_id,
    settled_on = p_settled_on where id = p_id and farm_id = v_farm and status = 'pending';
  return p_id;
end;
$$;

create function public.finance_cancel_transaction(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid;
begin
  v_farm := public.finance_owner_farm_id();
  update public.financial_transactions set status = 'cancelled', account_id = null
  where id = p_id and farm_id = v_farm and kind in ('income', 'expense') and status = 'pending';
  if not found then raise exception 'Somente lançamentos pendentes podem ser cancelados'; end if;
  return p_id;
end;
$$;

create function public.finance_reverse_transaction(p_id uuid, p_settled_on date, p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_old public.financial_transactions%rowtype; v_account public.financial_accounts%rowtype; v_existing public.financial_transactions%rowtype; v_id uuid;
begin
  v_farm := public.finance_owner_farm_id();
  if p_idempotency_key is null then raise exception 'Chave de repetição obrigatória'; end if;
  select * into v_old from public.financial_transactions where id = p_id and farm_id = v_farm for update;
  if not found or v_old.kind not in ('income', 'expense') or v_old.status <> 'settled' then
    raise exception 'Somente lançamentos liquidados podem ser estornados';
  end if;
  select * into v_existing from public.financial_transactions where reversal_of_id = p_id and farm_id = v_farm;
  if found then
    if v_existing.idempotency_key = p_idempotency_key then return v_existing.id; end if;
    raise exception 'Este lançamento já foi estornado';
  end if;
  select * into v_account from public.financial_accounts where id = v_old.account_id and farm_id = v_farm;
  if p_settled_on is null or p_settled_on <= v_account.opening_date or p_settled_on < v_old.settled_on then
    raise exception 'Data de estorno inválida';
  end if;
  insert into public.financial_transactions (farm_id, kind, description, amount, account_id,
    competency_date, settled_on, status, notes, reversal_of_id, idempotency_key)
  values (v_farm, case v_old.kind when 'income' then 'reversal_income' else 'reversal_expense' end,
    'Estorno: ' || v_old.description, v_old.amount, v_old.account_id,
    p_settled_on, p_settled_on, 'settled', 'Estorno auditável do lançamento ' || v_old.id::text,
    v_old.id, p_idempotency_key)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.finance_account_overview()
returns table (
  id uuid, name text, account_type text, opening_balance_text text, opening_date date,
  active boolean, balance_text text, settled_count bigint
) language plpgsql stable security definer set search_path = '' as $$
declare v_farm uuid;
begin
  v_farm := public.finance_owner_farm_id();
  return query
  select a.id, a.name, a.account_type, a.opening_balance::text, a.opening_date, a.active,
    (a.opening_balance + coalesce((
      select sum(case
        when t.kind = 'transfer' and t.account_id = a.id then -t.amount
        when t.kind = 'transfer' and t.destination_account_id = a.id then t.amount
        when t.account_id = a.id and t.kind in ('income', 'investment_withdrawal', 'reversal_expense') then t.amount
        when t.account_id = a.id and t.kind in ('expense', 'capital_expenditure', 'investment_contribution', 'reversal_income') then -t.amount
        else 0 end)
      from public.financial_transactions t
      where t.farm_id = v_farm and t.status = 'settled' and t.settled_on > a.opening_date
        and (t.account_id = a.id or t.destination_account_id = a.id)
    ), 0))::text,
    (select count(*) from public.financial_transactions t where t.farm_id = v_farm
      and t.status = 'settled' and (t.account_id = a.id or t.destination_account_id = a.id))
  from public.financial_accounts a where a.farm_id = v_farm order by a.active desc, a.name;
end;
$$;

create function public.finance_list_transactions(
  p_kind text, p_search text default null, p_status text default null,
  p_category_id uuid default null, p_from date default null, p_to date default null
) returns table (
  id uuid, kind text, description text, amount_text text, category_id uuid,
  category_name text, account_id uuid, account_name text, competency_date date,
  due_date date, settled_on date, status text, counterparty text, notes text,
  created_at timestamptz, reversal_id uuid
) language plpgsql stable security definer set search_path = '' as $$
declare v_farm uuid;
begin
  v_farm := public.finance_owner_farm_id();
  if p_kind not in ('income', 'expense') then raise exception 'Tipo de lançamento inválido'; end if;
  return query
  select t.id, t.kind, t.description, t.amount::text, t.category_id,
    c.name, t.account_id, a.name, t.competency_date, t.due_date, t.settled_on,
    t.status, t.counterparty, t.notes, t.created_at, r.id
  from public.financial_transactions t
  left join public.financial_categories c on c.id = t.category_id and c.farm_id = v_farm
  left join public.financial_accounts a on a.id = t.account_id and a.farm_id = v_farm
  left join public.financial_transactions r on r.reversal_of_id = t.id and r.farm_id = v_farm
  where t.farm_id = v_farm and t.kind = p_kind
    and (p_search is null or p_search = '' or t.description ilike '%' || p_search || '%'
      or t.counterparty ilike '%' || p_search || '%')
    and (p_status is null or t.status = p_status)
    and (p_category_id is null or t.category_id = p_category_id)
    and (p_from is null or t.competency_date >= p_from)
    and (p_to is null or t.competency_date <= p_to)
  order by t.competency_date desc, t.created_at desc;
end;
$$;

revoke all on function public.finance_owner_farm_id() from public, anon, authenticated;
do $$
declare function_name text;
begin
  foreach function_name in array array[
    'finance_save_account(uuid,text,text,numeric,date,boolean)',
    'finance_save_category(uuid,text,text,boolean)',
    'finance_save_transaction(uuid,text,text,numeric,uuid,uuid,date,date,text,text,uuid)',
    'finance_settle_transaction(uuid,uuid,date)',
    'finance_cancel_transaction(uuid)',
    'finance_reverse_transaction(uuid,date,uuid)',
    'finance_account_overview()',
    'finance_list_transactions(text,text,text,uuid,date,date)'
  ] loop
    execute 'revoke all on function public.' || function_name || ' from public, anon';
    execute 'grant execute on function public.' || function_name || ' to authenticated';
  end loop;
end;
$$;

commit;
