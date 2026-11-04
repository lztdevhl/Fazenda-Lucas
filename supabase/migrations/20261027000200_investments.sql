begin;

alter table public.investment_records
  add column institution text,
  add column valuation_date date,
  add column idempotency_key uuid,
  add constraint investment_records_idempotency_unique unique (farm_id, idempotency_key),
  add constraint investment_institution_length check (institution is null or length(institution) <= 160);

alter table public.investment_movements
  add column reversal_of_id uuid,
  add constraint investment_movements_farm_id_unique unique (farm_id, id),
  add constraint investment_movements_reversal_unique unique (reversal_of_id),
  add constraint investment_movements_reversal_fk foreign key (farm_id, reversal_of_id)
    references public.investment_movements(farm_id, id) on delete restrict;
alter table public.investment_movements drop constraint investment_movements_movement_type_check;
alter table public.investment_movements add constraint investment_movements_movement_type_check
  check (movement_type in ('contribution', 'withdrawal', 'reversal_contribution', 'reversal_withdrawal'));

alter table public.financial_transactions drop constraint financial_transactions_kind_check;
alter table public.financial_transactions add constraint financial_transactions_kind_check check (kind in (
  'income', 'expense', 'transfer', 'capital_expenditure', 'investment_contribution', 'investment_withdrawal',
  'reversal_income', 'reversal_expense', 'reversal_capital_expenditure',
  'reversal_investment_contribution', 'reversal_investment_withdrawal'));
alter table public.financial_transactions drop constraint category_required;
alter table public.financial_transactions add constraint category_required check (
  (kind in ('income', 'expense', 'capital_expenditure') and category_id is not null)
  or (kind not in ('income', 'expense', 'capital_expenditure') and category_id is null)
);

create or replace function public.validate_financial_transaction()
returns trigger language plpgsql set search_path = '' as $$
declare expected_type text; original_record record; expected_original text;
begin
  if tg_op = 'INSERT' and new.status = 'cancelled' then raise exception 'A new transaction cannot start as cancelled'; end if;
  if tg_op = 'UPDATE' then
    if new.farm_id <> old.farm_id or new.id <> old.id or new.idempotency_key <> old.idempotency_key then
      raise exception 'Transaction identity cannot change';
    end if;
    if old.status <> 'pending' then raise exception 'Settled or cancelled transactions are immutable; create a reversal'; end if;
  end if;
  expected_type := case new.kind when 'income' then 'income' when 'expense' then 'expense'
    when 'capital_expenditure' then 'productive_investment' else null end;
  if expected_type is not null and not exists (
    select 1 from public.financial_categories c
    where c.id = new.category_id and c.farm_id = new.farm_id and c.category_type = expected_type
  ) then raise exception 'Category does not match transaction kind'; end if;

  expected_original := case new.kind
    when 'reversal_income' then 'income'
    when 'reversal_expense' then 'expense'
    when 'reversal_capital_expenditure' then 'capital_expenditure'
    when 'reversal_investment_contribution' then 'investment_contribution'
    when 'reversal_investment_withdrawal' then 'investment_withdrawal'
    else null end;
  if expected_original is not null then
    if new.reversal_of_id is null or new.status <> 'settled' then
      raise exception 'Reversals must be settled and reference the original';
    end if;
    select kind, amount, account_id, settled_on into original_record
    from public.financial_transactions where id = new.reversal_of_id and farm_id = new.farm_id and status = 'settled';
    if not found or original_record.kind is distinct from expected_original
      or original_record.amount is distinct from new.amount
      or original_record.account_id is distinct from new.account_id
      or new.settled_on < original_record.settled_on then
      raise exception 'Reversal must match the original settled transaction';
    end if;
  elsif new.reversal_of_id is not null then
    raise exception 'Only a reversal may reference another transaction';
  end if;
  return new;
end;
$$;

create or replace function public.validate_investment_link()
returns trigger language plpgsql set search_path = '' as $$
declare linked_kind text; linked_status text; linked_amount numeric(18,2); linked_date date;
  category_kind text; record_type text; original_movement record;
begin
  if tg_table_name = 'investment_records' then
    select c.category_type into category_kind from public.financial_categories c
    where c.id = new.category_id and c.farm_id = new.farm_id;
    if category_kind is distinct from (case new.investment_type when 'productive' then 'productive_investment' else 'financial_investment' end) then
      raise exception 'Investment category does not match type';
    end if;
    if new.payment_transaction_id is not null then
      select t.kind, t.status, t.amount into linked_kind, linked_status, linked_amount
      from public.financial_transactions t where t.id = new.payment_transaction_id and t.farm_id = new.farm_id;
      if linked_kind is distinct from 'capital_expenditure' or linked_status is distinct from 'settled'
        or linked_amount is distinct from new.initial_value then
        raise exception 'Productive investment payment must link to a settled capital expenditure';
      end if;
    end if;
  else
    select r.investment_type into record_type from public.investment_records r
    where r.id = new.investment_id and r.farm_id = new.farm_id;
    select t.kind, t.status, t.amount, t.settled_on into linked_kind, linked_status, linked_amount, linked_date
    from public.financial_transactions t where t.id = new.transaction_id and t.farm_id = new.farm_id;
    if record_type is distinct from 'financial' or linked_status is distinct from 'settled'
      or linked_kind is distinct from (case new.movement_type
        when 'contribution' then 'investment_contribution'
        when 'withdrawal' then 'investment_withdrawal'
        when 'reversal_contribution' then 'reversal_investment_contribution'
        when 'reversal_withdrawal' then 'reversal_investment_withdrawal' end)
      or linked_amount is distinct from new.amount or linked_date is distinct from new.movement_date then
      raise exception 'Investment movement must link to a matching settled financial transaction';
    end if;
    if new.movement_type like 'reversal_%' then
      select movement_type, amount, investment_id into original_movement
      from public.investment_movements where id = new.reversal_of_id and farm_id = new.farm_id;
      if not found or original_movement.movement_type is distinct from replace(new.movement_type, 'reversal_', '')
        or original_movement.amount is distinct from new.amount
        or original_movement.investment_id is distinct from new.investment_id then
        raise exception 'Investment reversal does not match original movement';
      end if;
    elsif new.reversal_of_id is not null then raise exception 'Only a reversal may reference a movement'; end if;
  end if;
  return new;
end;
$$;

create function public.seed_phase4_categories()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.financial_categories(farm_id, category_type, name, is_system)
  select new.id, seed.category_type, seed.name, true from (values
    ('productive_investment','Reforma de instalações'),
    ('productive_investment','Equipamentos para alimentação'),
    ('productive_investment','Equipamentos de climatização'),
    ('productive_investment','Máquinas e equipamentos'),
    ('productive_investment','Sistemas de abastecimento de água'),
    ('productive_investment','Melhorias em instalações'),
    ('productive_investment','Outros investimentos produtivos'),
    ('financial_investment','CDB'), ('financial_investment','Tesouro Direto'),
    ('financial_investment','Fundos de investimento'), ('financial_investment','Poupança'),
    ('financial_investment','Outras aplicações')
  ) as seed(category_type,name) on conflict do nothing;
  return new;
end;
$$;
create trigger seed_phase4_categories_after_farm after insert on public.farms
  for each row execute function public.seed_phase4_categories();
insert into public.financial_categories(farm_id, category_type, name, is_system)
select f.id, seed.category_type, seed.name, true from public.farms f cross join (values
  ('productive_investment','Reforma de instalações'),
  ('productive_investment','Equipamentos para alimentação'),
  ('productive_investment','Equipamentos de climatização'),
  ('productive_investment','Máquinas e equipamentos'),
  ('productive_investment','Sistemas de abastecimento de água'),
  ('productive_investment','Melhorias em instalações'),
  ('productive_investment','Outros investimentos produtivos'),
  ('financial_investment','CDB'), ('financial_investment','Tesouro Direto'),
  ('financial_investment','Fundos de investimento'), ('financial_investment','Poupança'),
  ('financial_investment','Outras aplicações')
) as seed(category_type,name) on conflict do nothing;

create or replace function public.finance_account_overview()
returns table (id uuid, name text, account_type text, opening_balance_text text, opening_date date,
  active boolean, balance_text text, settled_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_farm uuid;
begin
  v_farm := public.finance_owner_farm_id();
  return query
  select a.id, a.name, a.account_type, a.opening_balance::text, a.opening_date, a.active,
    (a.opening_balance + coalesce((select sum(case
      when t.kind = 'transfer' and t.account_id = a.id then -t.amount
      when t.kind = 'transfer' and t.destination_account_id = a.id then t.amount
      when t.account_id = a.id and t.kind in ('income','investment_withdrawal','reversal_expense','reversal_capital_expenditure','reversal_investment_contribution') then t.amount
      when t.account_id = a.id and t.kind in ('expense','capital_expenditure','investment_contribution','reversal_income','reversal_investment_withdrawal') then -t.amount
      else 0 end) from public.financial_transactions t
      where t.farm_id = v_farm and t.status = 'settled' and t.settled_on > a.opening_date
        and (t.account_id = a.id or t.destination_account_id = a.id)), 0))::text,
    (select count(*) from public.financial_transactions t where t.farm_id = v_farm and t.status = 'settled'
      and (t.account_id = a.id or t.destination_account_id = a.id))
  from public.financial_accounts a where a.farm_id = v_farm order by a.active desc, a.name;
end;
$$;

create or replace function public.finance_dashboard_balance_series(p_from date, p_to date)
returns table (day date, balance_text text)
language plpgsql stable security definer set search_path = '' as $$
declare v_farm uuid;
begin
  v_farm := public.finance_owner_farm_id();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1095 then raise exception 'Período inválido'; end if;
  return query
  with cash_events as (
    select a.opening_date as event_day, a.opening_balance as delta from public.financial_accounts a
    where a.farm_id = v_farm and a.opening_date <= p_to
    union all
    select t.settled_on, case
      when t.kind in ('income','investment_withdrawal','reversal_expense','reversal_capital_expenditure','reversal_investment_contribution') then t.amount
      when t.kind in ('expense','capital_expenditure','investment_contribution','reversal_income','reversal_investment_withdrawal') then -t.amount
      else 0::numeric end
    from public.financial_transactions t where t.farm_id = v_farm and t.status = 'settled'
      and t.settled_on <= p_to and t.kind <> 'transfer'
  ), before_period as (
    select coalesce(sum(e.delta),0::numeric) as opening_total from cash_events e where e.event_day < p_from
  ), daily as (
    select e.event_day, sum(e.delta) as delta from cash_events e
    where e.event_day between p_from and p_to group by e.event_day
  ), balances as (
    select days.value::date as balance_day,
      before_period.opening_total + sum(coalesce(daily.delta,0::numeric)) over (order by days.value rows unbounded preceding) as balance
    from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') as days(value)
    cross join before_period left join daily on daily.event_day = days.value::date
  )
  select balances.balance_day, balances.balance::numeric(20,2)::text from balances
  where (balances.balance_day - p_from) % greatest(1,ceil((p_to - p_from + 1)::numeric/90)::int) = 0
    or balances.balance_day = p_to order by balances.balance_day;
end;
$$;

create function public.finance_save_productive_investment(
  p_id uuid, p_name text, p_category_id uuid, p_description text, p_amount numeric,
  p_date date, p_account_id uuid, p_status text, p_notes text, p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_old public.investment_records%rowtype; v_account public.financial_accounts%rowtype;
  v_payment uuid; v_id uuid;
begin
  v_farm := public.finance_owner_farm_id();
  if length(btrim(coalesce(p_name,''))) not between 2 and 160 or p_amount is null or p_amount <= 0
    or p_amount <> round(p_amount,2) or p_amount >= 10000000000000000
    or p_date is null or p_status not in ('planned','active','completed')
    or length(coalesce(p_description,'')) > 2000 or length(coalesce(p_notes,'')) > 2000
    or not exists (select 1 from public.financial_categories c where c.id = p_category_id
      and c.farm_id = v_farm and c.category_type = 'productive_investment' and c.active) then
    raise exception 'Dados do investimento produtivo inválidos';
  end if;
  if p_id is null then
    if p_idempotency_key is null then raise exception 'Chave de repetição obrigatória'; end if;
    select * into v_old from public.investment_records where farm_id = v_farm and idempotency_key = p_idempotency_key;
    if found then
      if v_old.investment_type = 'productive' and v_old.name = btrim(p_name)
        and v_old.category_id = p_category_id and v_old.initial_value = p_amount
        and v_old.investment_date = p_date then return v_old.id; end if;
      raise exception 'Chave de repetição usada com dados diferentes';
    end if;
  else
    select * into v_old from public.investment_records where id = p_id and farm_id = v_farm for update;
    if not found or v_old.investment_type <> 'productive' or v_old.status = 'cancelled' then
      raise exception 'Investimento produtivo não encontrado ou cancelado'; end if;
    if v_old.payment_transaction_id is not null and
      (v_old.category_id <> p_category_id or v_old.initial_value <> p_amount or v_old.investment_date <> p_date
        or p_status = 'planned') then
      raise exception 'Valor, categoria e data de um pagamento liquidado são imutáveis'; end if;
  end if;
  if p_status <> 'planned' and (p_id is null or v_old.payment_transaction_id is null) then
    select * into v_account from public.financial_accounts where id = p_account_id and farm_id = v_farm for share;
    if not found or not v_account.active or p_date <= v_account.opening_date or p_idempotency_key is null then
      raise exception 'Selecione conta ativa e data posterior ao saldo inicial'; end if;
    insert into public.financial_transactions(farm_id,kind,description,amount,category_id,account_id,
      competency_date,settled_on,status,notes,idempotency_key)
    values (v_farm,'capital_expenditure',btrim(p_name),p_amount,p_category_id,p_account_id,
      p_date,p_date,'settled',nullif(btrim(p_notes),''),p_idempotency_key)
    returning id into v_payment;
  end if;
  if p_id is null then
    insert into public.investment_records(farm_id,investment_type,category_id,name,initial_value,
      investment_date,description,status,payment_transaction_id,notes,idempotency_key)
    values (v_farm,'productive',p_category_id,btrim(p_name),p_amount,p_date,nullif(btrim(p_description),''),
      p_status,v_payment,nullif(btrim(p_notes),''),p_idempotency_key) returning id into v_id;
  else
    update public.investment_records set name = btrim(p_name), category_id = p_category_id,
      initial_value = p_amount, investment_date = p_date, description = nullif(btrim(p_description),''),
      status = p_status, notes = nullif(btrim(p_notes),''),
      payment_transaction_id = coalesce(v_old.payment_transaction_id,v_payment)
    where id = p_id and farm_id = v_farm;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;

create function public.finance_cancel_planned_investment(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid;
begin
  v_farm := public.finance_owner_farm_id();
  update public.investment_records set status = 'cancelled'
  where id = p_id and farm_id = v_farm and investment_type = 'productive'
    and status = 'planned' and payment_transaction_id is null;
  if not found then raise exception 'Somente investimento planejado pode ser cancelado sem estorno'; end if;
  return p_id;
end;
$$;

create function public.finance_reverse_productive_investment(p_id uuid,p_date date,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_record public.investment_records%rowtype; v_payment public.financial_transactions%rowtype;
  v_existing public.financial_transactions%rowtype; v_id uuid; v_opening date;
begin
  v_farm := public.finance_owner_farm_id();
  if p_idempotency_key is null then raise exception 'Chave de repetição obrigatória'; end if;
  select * into v_record from public.investment_records where id = p_id and farm_id = v_farm for update;
  if not found or v_record.investment_type <> 'productive' or v_record.payment_transaction_id is null then
    raise exception 'Investimento produtivo pago não encontrado'; end if;
  select * into v_payment from public.financial_transactions where id = v_record.payment_transaction_id and farm_id = v_farm;
  select * into v_existing from public.financial_transactions where reversal_of_id = v_payment.id and farm_id = v_farm;
  if found then
    if v_existing.idempotency_key = p_idempotency_key then return v_existing.id; end if;
    raise exception 'Pagamento já estornado';
  end if;
  select opening_date into v_opening from public.financial_accounts where id = v_payment.account_id and farm_id = v_farm;
  if p_date is null or p_date < v_payment.settled_on or p_date <= v_opening then raise exception 'Data de estorno inválida'; end if;
  insert into public.financial_transactions(farm_id,kind,description,amount,account_id,
    competency_date,settled_on,status,reversal_of_id,idempotency_key)
  values (v_farm,'reversal_capital_expenditure','Estorno: ' || v_record.name,v_payment.amount,
    v_payment.account_id,p_date,p_date,'settled',v_payment.id,p_idempotency_key) returning id into v_id;
  update public.investment_records set status = 'cancelled' where id = p_id and farm_id = v_farm;
  return v_id;
end;
$$;

create function public.finance_create_application(
  p_name text,p_category_id uuid,p_institution text,p_date date,p_amount numeric,
  p_account_id uuid,p_current_value numeric,p_valuation_date date,p_notes text,p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_account public.financial_accounts%rowtype; v_existing public.investment_records%rowtype;
  v_id uuid; v_transaction uuid;
begin
  v_farm := public.finance_owner_farm_id();
  if length(btrim(coalesce(p_name,''))) not between 2 and 160
    or length(btrim(coalesce(p_institution,''))) not between 2 and 160
    or p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2) or p_amount >= 10000000000000000
    or p_current_value is null or p_current_value < 0 or p_current_value <> round(p_current_value,2)
    or p_current_value >= 10000000000000000 or p_date is null or p_valuation_date is null
    or p_valuation_date < p_date or p_idempotency_key is null or length(coalesce(p_notes,'')) > 2000
    or not exists (select 1 from public.financial_categories c where c.id = p_category_id
      and c.farm_id = v_farm and c.category_type = 'financial_investment' and c.active) then
    raise exception 'Dados da aplicação inválidos'; end if;
  select * into v_existing from public.investment_records where farm_id = v_farm and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.investment_type = 'financial' and v_existing.name = btrim(p_name)
      and v_existing.initial_value = p_amount and v_existing.category_id = p_category_id then return v_existing.id; end if;
    raise exception 'Chave de repetição usada com dados diferentes';
  end if;
  select * into v_account from public.financial_accounts where id = p_account_id and farm_id = v_farm for share;
  if not found or not v_account.active or p_date <= v_account.opening_date then
    raise exception 'Selecione conta ativa e data posterior ao saldo inicial'; end if;
  insert into public.investment_records(farm_id,investment_type,category_id,name,initial_value,current_value,
    investment_date,status,institution,valuation_date,notes,idempotency_key)
  values (v_farm,'financial',p_category_id,btrim(p_name),p_amount,p_current_value,p_date,'active',
    btrim(p_institution),p_valuation_date,nullif(btrim(p_notes),''),p_idempotency_key) returning id into v_id;
  insert into public.financial_transactions(farm_id,kind,description,amount,account_id,
    competency_date,settled_on,status,notes,idempotency_key)
  values (v_farm,'investment_contribution','Aplicação inicial: ' || btrim(p_name),p_amount,p_account_id,
    p_date,p_date,'settled',nullif(btrim(p_notes),''),p_idempotency_key) returning id into v_transaction;
  insert into public.investment_movements(farm_id,investment_id,transaction_id,movement_type,amount,movement_date,notes)
  values (v_farm,v_id,v_transaction,'contribution',p_amount,p_date,nullif(btrim(p_notes),''));
  return v_id;
end;
$$;

create function public.finance_save_application(
  p_id uuid,p_name text,p_category_id uuid,p_institution text,p_description text,
  p_current_value numeric,p_valuation_date date,p_status text,p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_old public.investment_records%rowtype;
begin
  v_farm := public.finance_owner_farm_id();
  select * into v_old from public.investment_records where id = p_id and farm_id = v_farm for update;
  if not found or v_old.investment_type <> 'financial' or v_old.status = 'cancelled'
    or length(btrim(coalesce(p_name,''))) not between 2 and 160
    or length(btrim(coalesce(p_institution,''))) not between 2 and 160
    or p_current_value is null or p_current_value < 0 or p_current_value <> round(p_current_value,2)
    or p_current_value >= 10000000000000000 or p_valuation_date is null
    or p_valuation_date < v_old.investment_date or p_status not in ('active','completed','cancelled')
    or length(coalesce(p_description,'')) > 2000 or length(coalesce(p_notes,'')) > 2000
    or not exists (select 1 from public.financial_categories c where c.id = p_category_id
      and c.farm_id = v_farm and c.category_type = 'financial_investment' and c.active) then
    raise exception 'Dados da aplicação inválidos'; end if;
  if p_status = 'cancelled' and p_current_value <> 0 then
    raise exception 'Zere o valor de mercado informado antes de cancelar a aplicação'; end if;
  if p_status = 'cancelled' and exists (
    select 1 from public.investment_movements m where m.investment_id = p_id and m.farm_id = v_farm
      and m.movement_type in ('contribution','withdrawal')
      and not exists (select 1 from public.investment_movements r where r.reversal_of_id = m.id and r.farm_id = v_farm)
  ) then raise exception 'Estorne as movimentações antes de cancelar a aplicação'; end if;
  update public.investment_records set name = btrim(p_name), category_id = p_category_id,
    institution = btrim(p_institution), description = nullif(btrim(p_description),''),
    current_value = p_current_value, valuation_date = p_valuation_date,
    status = p_status, notes = nullif(btrim(p_notes),'') where id = p_id and farm_id = v_farm;
  return p_id;
end;
$$;

create function public.finance_add_investment_movement(
  p_investment_id uuid,p_movement_type text,p_amount numeric,p_date date,
  p_account_id uuid,p_notes text,p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_record public.investment_records%rowtype; v_account public.financial_accounts%rowtype;
  v_existing public.financial_transactions%rowtype; v_movement uuid; v_transaction uuid;
begin
  v_farm := public.finance_owner_farm_id();
  if p_movement_type not in ('contribution','withdrawal') or p_amount is null or p_amount <= 0
    or p_amount <> round(p_amount,2) or p_amount >= 10000000000000000 or p_date is null
    or p_idempotency_key is null or length(coalesce(p_notes,'')) > 2000 then
    raise exception 'Movimentação inválida'; end if;
  select * into v_existing from public.financial_transactions where farm_id = v_farm and idempotency_key = p_idempotency_key;
  if found then
    select id into v_movement from public.investment_movements where transaction_id = v_existing.id
      and investment_id = p_investment_id and movement_type = p_movement_type and amount = p_amount and movement_date = p_date;
    if v_movement is not null then return v_movement; end if;
    raise exception 'Chave de repetição usada com dados diferentes';
  end if;
  select * into v_record from public.investment_records where id = p_investment_id and farm_id = v_farm for update;
  if not found or v_record.investment_type <> 'financial' or v_record.status <> 'active'
    or p_date < v_record.investment_date then raise exception 'Aplicação não está ativa'; end if;
  select * into v_account from public.financial_accounts where id = p_account_id and farm_id = v_farm for share;
  if not found or not v_account.active or p_date <= v_account.opening_date then
    raise exception 'Selecione conta ativa e data posterior ao saldo inicial'; end if;
  insert into public.financial_transactions(farm_id,kind,description,amount,account_id,
    competency_date,settled_on,status,notes,idempotency_key)
  values (v_farm,case p_movement_type when 'contribution' then 'investment_contribution' else 'investment_withdrawal' end,
    (case p_movement_type when 'contribution' then 'Aporte: ' else 'Resgate: ' end) || v_record.name,
    p_amount,p_account_id,p_date,p_date,'settled',nullif(btrim(p_notes),''),p_idempotency_key)
  returning id into v_transaction;
  insert into public.investment_movements(farm_id,investment_id,transaction_id,movement_type,amount,movement_date,notes)
  values (v_farm,p_investment_id,v_transaction,p_movement_type,p_amount,p_date,nullif(btrim(p_notes),'')) returning id into v_movement;
  return v_movement;
end;
$$;

create function public.finance_reverse_investment_movement(p_movement_id uuid,p_date date,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_original public.investment_movements%rowtype; v_transaction public.financial_transactions%rowtype;
  v_existing public.investment_movements%rowtype; v_existing_key uuid;
  v_account_date date; v_reverse_transaction uuid; v_id uuid;
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
  select opening_date into v_account_date from public.financial_accounts where id = v_transaction.account_id and farm_id = v_farm;
  if p_date is null or p_date < v_original.movement_date or p_date <= v_account_date then raise exception 'Data de estorno inválida'; end if;
  insert into public.financial_transactions(farm_id,kind,description,amount,account_id,
    competency_date,settled_on,status,reversal_of_id,idempotency_key)
  values (v_farm,case v_original.movement_type when 'contribution' then 'reversal_investment_contribution'
      else 'reversal_investment_withdrawal' end,
    'Estorno: ' || v_transaction.description,v_original.amount,v_transaction.account_id,
    p_date,p_date,'settled',v_transaction.id,p_idempotency_key) returning id into v_reverse_transaction;
  insert into public.investment_movements(farm_id,investment_id,transaction_id,movement_type,
    amount,movement_date,reversal_of_id)
  values (v_farm,v_original.investment_id,v_reverse_transaction,
    'reversal_' || v_original.movement_type,v_original.amount,p_date,v_original.id) returning id into v_id;
  return v_id;
end;
$$;

create function public.finance_investment_list()
returns table (id uuid, investment_type text, category_id uuid, category_name text,
  name text, description text, initial_value_text text, current_value_text text, principal_text text,
  investment_date date, valuation_date date, institution text, status text,
  payment_transaction_id uuid, payment_account_id uuid, payment_reversal_id uuid,
  payment_reversal_date date,
  notes text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_farm uuid;
begin
  v_farm := public.finance_owner_farm_id();
  return query
  select r.id,r.investment_type,r.category_id,c.name,r.name,r.description,r.initial_value::text,
    r.current_value::text,
    case when r.investment_type = 'financial' then coalesce((select sum(case
      when m.movement_type in ('contribution','reversal_withdrawal') then m.amount
      else -m.amount end) from public.investment_movements m
      where m.investment_id = r.id and m.farm_id = v_farm),0::numeric)::numeric(20,2)::text else null end,
    r.investment_date,r.valuation_date,r.institution,r.status,
    r.payment_transaction_id,t.account_id,rev.id,rev.settled_on,r.notes,r.created_at
  from public.investment_records r
  join public.financial_categories c on c.id = r.category_id and c.farm_id = v_farm
  left join public.financial_transactions t on t.id = r.payment_transaction_id and t.farm_id = v_farm
  left join public.financial_transactions rev on rev.reversal_of_id = t.id and rev.farm_id = v_farm
  where r.farm_id = v_farm order by r.investment_date desc,r.created_at desc,r.id desc;
end;
$$;

create function public.finance_investment_movement_list()
returns table (id uuid, investment_id uuid, movement_type text, amount_text text,
  movement_date date, account_id uuid, account_name text, notes text,
  reversal_of_id uuid, reversed_by_id uuid, transaction_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare v_farm uuid;
begin
  v_farm := public.finance_owner_farm_id();
  return query
  select m.id,m.investment_id,m.movement_type,m.amount::text,m.movement_date,
    t.account_id,a.name,m.notes,m.reversal_of_id,rev.id,m.transaction_id
  from public.investment_movements m
  join public.financial_transactions t on t.id = m.transaction_id and t.farm_id = v_farm
  left join public.financial_accounts a on a.id = t.account_id and a.farm_id = v_farm
  left join public.investment_movements rev on rev.reversal_of_id = m.id and rev.farm_id = v_farm
  where m.farm_id = v_farm order by m.movement_date desc,m.created_at desc,m.id desc;
end;
$$;

do $$
declare function_name text;
begin
  foreach function_name in array array[
    'finance_save_productive_investment(uuid,text,uuid,text,numeric,date,uuid,text,text,uuid)',
    'finance_cancel_planned_investment(uuid)',
    'finance_reverse_productive_investment(uuid,date,uuid)',
    'finance_create_application(text,uuid,text,date,numeric,uuid,numeric,date,text,uuid)',
    'finance_save_application(uuid,text,uuid,text,text,numeric,date,text,text)',
    'finance_add_investment_movement(uuid,text,numeric,date,uuid,text,uuid)',
    'finance_reverse_investment_movement(uuid,date,uuid)',
    'finance_investment_list()', 'finance_investment_movement_list()'
  ] loop
    execute 'revoke all on function public.' || function_name || ' from public, anon';
    execute 'grant execute on function public.' || function_name || ' to authenticated';
  end loop;
end;
$$;

commit;
