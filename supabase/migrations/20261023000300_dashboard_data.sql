begin;

-- Events for a dashboard window. Monetary values are returned as text so the
-- application can aggregate exact cents before presenting them in charts.
create function public.finance_dashboard_events(p_from date, p_to date)
returns table (
  id uuid, kind text, description text, amount_text text, status text,
  event_date date, due_date date, category_name text, account_name text,
  reversal_of_id uuid
) language plpgsql stable security definer set search_path = '' as $$
declare v_farm uuid;
begin
  v_farm := public.finance_owner_farm_id();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 3660 then
    raise exception 'Período inválido';
  end if;

  return query
  select t.id, t.kind, t.description, t.amount::text, t.status,
    case when t.status = 'settled' then t.settled_on else t.due_date end,
    t.due_date, c.name, a.name, t.reversal_of_id
  from public.financial_transactions t
  left join public.financial_transactions original on original.id = t.reversal_of_id and original.farm_id = v_farm
  left join public.financial_categories c on c.id = coalesce(t.category_id, original.category_id) and c.farm_id = v_farm
  left join public.financial_accounts a on a.id = t.account_id and a.farm_id = v_farm
  where t.farm_id = v_farm
    and t.status in ('pending', 'settled')
    and ((t.status = 'settled' and t.settled_on between p_from and p_to)
      or (t.status = 'pending' and t.due_date between p_from and p_to))
  order by case when t.status = 'settled' then t.settled_on else t.due_date end desc,
    t.created_at desc;
end;
$$;

revoke all on function public.finance_dashboard_events(date,date) from public, anon;
grant execute on function public.finance_dashboard_events(date,date) to authenticated;

commit;
