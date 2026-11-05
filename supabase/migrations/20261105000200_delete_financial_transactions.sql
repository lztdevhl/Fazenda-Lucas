begin;

create function public.finance_delete_transaction(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_farm uuid;
  v_old public.financial_transactions%rowtype;
begin
  v_farm := public.finance_owner_farm_id();

  select * into v_old
  from public.financial_transactions
  where id = p_id and farm_id = v_farm
  for update;

  if not found or v_old.kind not in ('income', 'expense') then
    raise exception 'Somente entradas e saídas podem ser excluídas';
  end if;

  delete from public.financial_transactions
  where farm_id = v_farm and reversal_of_id = p_id;

  delete from public.financial_transactions
  where id = p_id and farm_id = v_farm;

  return p_id;
end;
$$;

revoke all on function public.finance_delete_transaction(uuid) from public, anon;
grant execute on function public.finance_delete_transaction(uuid) to authenticated;

commit;
