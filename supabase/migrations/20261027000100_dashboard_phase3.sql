begin;

-- Opening balances enter the consolidated cash position on their reference date.
-- Transfers have a zero consolidated effect and are intentionally excluded.
create or replace function public.finance_dashboard_balance_series(p_from date, p_to date)
returns table (day date, balance_text text)
language plpgsql stable security definer set search_path = '' as $$
declare v_farm uuid;
begin
  v_farm := public.finance_owner_farm_id();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1095 then
    raise exception 'Período inválido';
  end if;

  return query
  with cash_events as (
    select a.opening_date as event_day, a.opening_balance as delta
    from public.financial_accounts a
    where a.farm_id = v_farm and a.opening_date <= p_to
    union all
    select t.settled_on,
      case
        when t.kind in ('income', 'investment_withdrawal', 'reversal_expense') then t.amount
        when t.kind in ('expense', 'capital_expenditure', 'investment_contribution', 'reversal_income') then -t.amount
        else 0::numeric
      end
    from public.financial_transactions t
    where t.farm_id = v_farm and t.status = 'settled' and t.settled_on <= p_to
      and t.kind <> 'transfer'
  ), before_period as (
    select coalesce(sum(e.delta), 0::numeric) as opening_total
    from cash_events e where e.event_day < p_from
  ), daily as (
    select e.event_day, sum(e.delta) as delta
    from cash_events e where e.event_day between p_from and p_to
    group by e.event_day
  ), balances as (
    select days.value::date as balance_day,
      before_period.opening_total + sum(coalesce(daily.delta, 0::numeric))
        over (order by days.value rows unbounded preceding) as balance
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as days(value)
    cross join before_period
    left join daily on daily.event_day = days.value::date
  )
  select balances.balance_day, balances.balance::numeric(20,2)::text
  from balances
  where (balances.balance_day - p_from) % greatest(1, ceil((p_to - p_from + 1)::numeric / 90)::int) = 0
    or balances.balance_day = p_to
  order by balances.balance_day;
end;
$$;

create or replace function public.finance_dashboard_overdue_expenses(p_today date)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_farm uuid; v_total text;
begin
  v_farm := public.finance_owner_farm_id();
  if p_today is null then raise exception 'Data inválida'; end if;
  select coalesce(sum(t.amount), 0::numeric)::numeric(20,2)::text into v_total
  from public.financial_transactions t
  where t.farm_id = v_farm and t.status = 'pending' and t.kind = 'expense'
    and t.due_date < p_today;
  return v_total;
end;
$$;

create or replace function public.finance_dashboard_next_due(p_today date)
returns table (id uuid, kind text, description text, amount_text text, due_date date)
language plpgsql stable security definer set search_path = '' as $$
declare v_farm uuid;
begin
  v_farm := public.finance_owner_farm_id();
  if p_today is null then raise exception 'Data inválida'; end if;
  return query
  with ranked as (
    select t.id, t.kind, t.description, t.amount, t.due_date,
      row_number() over (partition by t.kind order by t.due_date, t.created_at) as position
    from public.financial_transactions t
    where t.farm_id = v_farm and t.status = 'pending' and t.kind in ('income', 'expense')
      and t.due_date >= p_today
  )
  select ranked.id, ranked.kind, ranked.description, ranked.amount::text, ranked.due_date
  from ranked where ranked.position <= 5
  order by ranked.due_date, ranked.kind;
end;
$$;

revoke all on function public.finance_dashboard_balance_series(date,date) from public, anon;
revoke all on function public.finance_dashboard_overdue_expenses(date) from public, anon;
revoke all on function public.finance_dashboard_next_due(date) from public, anon;
grant execute on function public.finance_dashboard_balance_series(date,date) to authenticated;
grant execute on function public.finance_dashboard_overdue_expenses(date) to authenticated;
grant execute on function public.finance_dashboard_next_due(date) to authenticated;

commit;
