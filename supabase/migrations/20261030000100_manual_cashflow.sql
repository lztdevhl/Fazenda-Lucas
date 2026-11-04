begin;

-- O caixa manual não depende de uma conta bancária. As colunas e tabelas de
-- contas continuam no schema para a integração futura, mas um evento
-- liquidado pode, por enquanto, ter account_id nulo.
alter table public.financial_transactions drop constraint if exists settlement_fields;
alter table public.financial_transactions add constraint settlement_fields check (
  (status = 'settled' and settled_on is not null)
  or (status <> 'settled' and settled_on is null)
);

create or replace function public.finance_settle_transaction(p_id uuid, p_account_id uuid, p_settled_on date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_old public.financial_transactions%rowtype; v_account public.financial_accounts%rowtype;
begin
  v_farm := public.finance_owner_farm_id();
  select * into v_old from public.financial_transactions where id = p_id and farm_id = v_farm for update;
  if not found or v_old.kind not in ('income', 'expense') or v_old.status <> 'pending' then
    raise exception 'Lançamento não está pendente';
  end if;
  if p_settled_on is null then raise exception 'Informe a data efetiva'; end if;
  if p_account_id is not null then
    select * into v_account from public.financial_accounts where id = p_account_id and farm_id = v_farm for share;
    if not found or not v_account.active then raise exception 'Conta inválida ou inativa'; end if;
    if p_settled_on <= v_account.opening_date then
      raise exception 'A liquidação deve ocorrer após a data do saldo inicial';
    end if;
  end if;
  update public.financial_transactions set status = 'settled', account_id = p_account_id,
    settled_on = p_settled_on where id = p_id and farm_id = v_farm and status = 'pending';
  return p_id;
end;
$$;

create or replace function public.finance_reverse_transaction(p_id uuid, p_settled_on date, p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_old public.financial_transactions%rowtype; v_existing public.financial_transactions%rowtype; v_id uuid;
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
  if p_settled_on is null or p_settled_on < v_old.settled_on then
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

create or replace function public.finance_save_productive_investment(
  p_id uuid, p_name text, p_category_id uuid, p_description text, p_amount numeric,
  p_date date, p_account_id uuid, p_status text, p_notes text, p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_old public.investment_records%rowtype; v_payment uuid; v_id uuid;
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

create or replace function public.finance_create_application(
  p_name text,p_category_id uuid,p_institution text,p_date date,p_amount numeric,
  p_account_id uuid,p_current_value numeric,p_valuation_date date,p_notes text,p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_existing public.investment_records%rowtype; v_id uuid; v_transaction uuid;
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

create or replace function public.finance_add_investment_movement(
  p_investment_id uuid,p_movement_type text,p_amount numeric,p_date date,
  p_account_id uuid,p_notes text,p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_record public.investment_records%rowtype; v_existing public.financial_transactions%rowtype;
  v_movement uuid; v_transaction uuid;
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

create or replace function public.finance_reverse_productive_investment(p_id uuid,p_date date,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_record public.investment_records%rowtype; v_payment public.financial_transactions%rowtype;
  v_existing public.financial_transactions%rowtype; v_id uuid;
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
  if p_date is null or p_date < v_payment.settled_on then raise exception 'Data de estorno inválida'; end if;
  insert into public.financial_transactions(farm_id,kind,description,amount,account_id,
    competency_date,settled_on,status,reversal_of_id,idempotency_key)
  values (v_farm,'reversal_capital_expenditure','Estorno: ' || v_record.name,v_payment.amount,
    v_payment.account_id,p_date,p_date,'settled',v_payment.id,p_idempotency_key) returning id into v_id;
  update public.investment_records set status = 'cancelled' where id = p_id and farm_id = v_farm;
  return v_id;
end;
$$;

create or replace function public.finance_reverse_investment_movement(p_movement_id uuid,p_date date,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_original public.investment_movements%rowtype; v_transaction public.financial_transactions%rowtype;
  v_existing public.investment_movements%rowtype; v_existing_key uuid; v_reverse_transaction uuid; v_id uuid;
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
  if p_date is null or p_date < v_original.movement_date then raise exception 'Data de estorno inválida'; end if;
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

commit;
