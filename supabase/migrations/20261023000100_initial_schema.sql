  create extension if not exists pgcrypto;

  create function public.touch_updated_at()
  returns trigger language plpgsql set search_path = '' as $$
  begin
    new.updated_at = now();
    return new;
  end;
  $$;

  create table public.farms (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null unique references auth.users(id) on delete restrict,
    name text not null check (length(btrim(name)) between 2 and 120),
    owner_name text,
    municipality text,
    state_code varchar(2) check (state_code is null or state_code ~ '^[A-Z]{2}$'),
    details text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table public.profiles (
    id uuid primary key references auth.users(id) on delete restrict,
    farm_id uuid not null unique references public.farms(id) on delete restrict,
    display_name text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table public.financial_accounts (
    id uuid primary key default gen_random_uuid(),
    farm_id uuid not null references public.farms(id) on delete restrict,
    name text not null check (length(btrim(name)) between 2 and 100),
    account_type text not null check (account_type in ('bank', 'cash')),
    opening_balance numeric(18,2) not null default 0,
    opening_date date not null,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (farm_id, id)
  );

  create table public.financial_categories (
    id uuid primary key default gen_random_uuid(),
    farm_id uuid not null references public.farms(id) on delete restrict,
    category_type text not null check (category_type in ('income', 'expense', 'productive_investment', 'financial_investment')),
    name text not null check (length(btrim(name)) between 2 and 100),
    is_system boolean not null default false,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (farm_id, id)
  );
  create unique index financial_categories_unique_name on public.financial_categories (farm_id, category_type, lower(name));

  -- One row is one financial event. Transfers have source and destination accounts.
  -- Productive payments and financial application movements live in this same ledger.
  create table public.financial_transactions (
    id uuid primary key default gen_random_uuid(),
    farm_id uuid not null references public.farms(id) on delete restrict,
    kind text not null check (kind in ('income', 'expense', 'transfer', 'capital_expenditure', 'investment_contribution', 'investment_withdrawal')),
    description text not null check (length(btrim(description)) between 2 and 200),
    amount numeric(18,2) not null check (amount > 0),
    category_id uuid,
    account_id uuid,
    destination_account_id uuid,
    counterparty text,
    competency_date date not null,
    due_date date,
    settled_on date,
    status text not null default 'pending' check (status in ('pending', 'settled', 'cancelled')),
    notes text,
    idempotency_key uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (farm_id, id),
    unique (farm_id, idempotency_key),
    foreign key (farm_id, category_id) references public.financial_categories(farm_id, id) on delete restrict,
    foreign key (farm_id, account_id) references public.financial_accounts(farm_id, id) on delete restrict,
    foreign key (farm_id, destination_account_id) references public.financial_accounts(farm_id, id) on delete restrict,
    constraint settlement_fields check (
      (status = 'settled' and settled_on is not null and account_id is not null)
      or (status <> 'settled' and settled_on is null)
    ),
    constraint transfer_accounts check (
      (kind = 'transfer' and destination_account_id is not null and account_id is not null and destination_account_id <> account_id)
      or (kind <> 'transfer' and destination_account_id is null)
    ),
    constraint category_required check (
      (kind in ('income', 'expense', 'capital_expenditure') and category_id is not null)
      or (kind in ('transfer', 'investment_contribution', 'investment_withdrawal'))
    )
  );

  create table public.investment_records (
    id uuid primary key default gen_random_uuid(),
    farm_id uuid not null references public.farms(id) on delete restrict,
    investment_type text not null check (investment_type in ('productive', 'financial')),
    category_id uuid not null,
    name text not null check (length(btrim(name)) between 2 and 160),
    initial_value numeric(18,2) not null check (initial_value >= 0),
    current_value numeric(18,2) check (current_value >= 0),
    investment_date date not null,
    description text,
    status text not null default 'active' check (status in ('planned', 'active', 'completed', 'cancelled')),
    payment_transaction_id uuid,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (farm_id, id),
    unique (payment_transaction_id),
    foreign key (farm_id, category_id) references public.financial_categories(farm_id, id) on delete restrict,
    foreign key (farm_id, payment_transaction_id) references public.financial_transactions(farm_id, id) on delete restrict,
    constraint productive_payment_only check (investment_type = 'productive' or payment_transaction_id is null),
    constraint financial_current_value_only check (investment_type = 'financial' or current_value is null)
  );

  create table public.investment_movements (
    id uuid primary key default gen_random_uuid(),
    farm_id uuid not null references public.farms(id) on delete restrict,
    investment_id uuid not null,
    transaction_id uuid not null unique,
    movement_type text not null check (movement_type in ('contribution', 'withdrawal')),
    amount numeric(18,2) not null check (amount > 0),
    movement_date date not null,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (farm_id, investment_id) references public.investment_records(farm_id, id) on delete restrict,
    foreign key (farm_id, transaction_id) references public.financial_transactions(farm_id, id) on delete restrict
  );

  create table public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    farm_id uuid not null references public.farms(id) on delete restrict,
    actor_id uuid references auth.users(id) on delete set null,
    table_name text not null,
    record_id uuid not null,
    action text not null check (action in ('INSERT', 'UPDATE')),
    old_data jsonb,
    new_data jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create index financial_accounts_farm_idx on public.financial_accounts (farm_id, active);
  create index financial_categories_farm_idx on public.financial_categories (farm_id, category_type, active);
  create index financial_transactions_farm_status_due_idx on public.financial_transactions (farm_id, status, due_date);
  create index financial_transactions_farm_settled_idx on public.financial_transactions (farm_id, settled_on) where status = 'settled';
  create index financial_transactions_farm_competency_idx on public.financial_transactions (farm_id, competency_date);
  create index investment_records_farm_type_idx on public.investment_records (farm_id, investment_type);
  create index investment_movements_farm_date_idx on public.investment_movements (farm_id, movement_date);
  create index audit_logs_farm_created_idx on public.audit_logs (farm_id, created_at desc);

  create function public.seed_financial_categories()
  returns trigger language plpgsql security definer set search_path = '' as $$
  begin
    insert into public.financial_categories (farm_id, category_type, name, is_system)
    select new.id, seed.category_type, seed.name, true
    from (values
      ('income', 'Venda de suínos'), ('income', 'Venda de leitões'), ('income', 'Venda de matrizes'),
      ('income', 'Venda de reprodutores'), ('income', 'Bonificações de integração'),
      ('income', 'Venda de subprodutos'), ('income', 'Outras receitas'),
      ('expense', 'Ração'), ('expense', 'Milho'), ('expense', 'Farelo de soja'),
      ('expense', 'Premix e suplementos'), ('expense', 'Medicamentos e vacinas'),
      ('expense', 'Serviços veterinários'), ('expense', 'Energia elétrica'),
      ('expense', 'Água'), ('expense', 'Funcionários e mão de obra'),
      ('expense', 'Manutenção das instalações'), ('expense', 'Equipamentos'),
      ('expense', 'Combustível'), ('expense', 'Transporte de animais'),
      ('expense', 'Limpeza e desinfecção'), ('expense', 'Manejo de dejetos'),
      ('expense', 'Impostos e taxas'), ('expense', 'Outras despesas'),
      ('productive_investment', 'Construção de galpões'), ('productive_investment', 'Reformas'),
      ('productive_investment', 'Equipamentos de alimentação'), ('productive_investment', 'Sistemas de ventilação'),
      ('productive_investment', 'Sistemas de climatização'), ('productive_investment', 'Máquinas'),
      ('productive_investment', 'Geradores'), ('productive_investment', 'Ampliação de instalações'),
      ('productive_investment', 'Outras melhorias'),
      ('financial_investment', 'Renda fixa'), ('financial_investment', 'Outros investimentos financeiros')
    ) as seed(category_type, name);
    return new;
  end;
  $$;
  create trigger seed_farm_categories after insert on public.farms
  for each row execute function public.seed_financial_categories();

  create function public.validate_financial_transaction()
  returns trigger language plpgsql set search_path = '' as $$
  declare expected_type text;
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
      if new.status = 'pending' and old.status = 'pending' then
        null;
      elsif new.status not in ('settled', 'cancelled') then
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
    if new.kind in ('transfer', 'investment_contribution', 'investment_withdrawal') and new.category_id is not null then
      raise exception 'This movement cannot have an operational category';
    end if;
    return new;
  end;
  $$;
  create trigger validate_financial_transaction_before_write before insert or update on public.financial_transactions
  for each row execute function public.validate_financial_transaction();

  create function public.validate_investment_link()
  returns trigger language plpgsql set search_path = '' as $$
  declare linked_kind text; linked_status text; linked_amount numeric(18,2); linked_date date; category_kind text; record_type text;
  begin
    if tg_table_name = 'investment_records' then
      select c.category_type into category_kind from public.financial_categories c where c.id = new.category_id and c.farm_id = new.farm_id;
      if category_kind is distinct from (case new.investment_type when 'productive' then 'productive_investment' else 'financial_investment' end) then
        raise exception 'Investment category does not match type';
      end if;
      if new.payment_transaction_id is not null then
        select t.kind, t.status, t.amount into linked_kind, linked_status, linked_amount from public.financial_transactions t where t.id = new.payment_transaction_id and t.farm_id = new.farm_id;
        if linked_kind is distinct from 'capital_expenditure' or linked_status is distinct from 'settled' or linked_amount is distinct from new.initial_value then
          raise exception 'Productive investment payment must link to a settled capital expenditure';
        end if;
      end if;
    else
      select r.investment_type into record_type from public.investment_records r where r.id = new.investment_id and r.farm_id = new.farm_id;
      select t.kind, t.status, t.amount, t.settled_on into linked_kind, linked_status, linked_amount, linked_date from public.financial_transactions t where t.id = new.transaction_id and t.farm_id = new.farm_id;
      if record_type is distinct from 'financial' or linked_status is distinct from 'settled'
        or linked_kind is distinct from (case new.movement_type when 'contribution' then 'investment_contribution' else 'investment_withdrawal' end)
        or linked_amount is distinct from new.amount or linked_date is distinct from new.movement_date then
        raise exception 'Investment movement must link to a matching settled financial transaction';
      end if;
    end if;
    return new;
  end;
  $$;
  create trigger validate_investment_record_before_write before insert or update on public.investment_records
  for each row execute function public.validate_investment_link();
  create trigger validate_investment_movement_before_write before insert or update on public.investment_movements
  for each row execute function public.validate_investment_link();

  create function public.write_audit_log()
  returns trigger language plpgsql security definer set search_path = '' as $$
  begin
    insert into public.audit_logs (farm_id, actor_id, table_name, record_id, action, old_data, new_data)
    values (coalesce((to_jsonb(new)->>'farm_id')::uuid, new.id), auth.uid(), tg_table_name, new.id, tg_op,
      case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new));
    return new;
  end;
  $$;

  do $$
  declare table_name text;
  begin
    foreach table_name in array array['profiles', 'financial_accounts', 'financial_categories', 'financial_transactions', 'investment_records', 'investment_movements'] loop
      execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', 'touch_' || table_name, table_name);
      execute format('create trigger %I after insert or update on public.%I for each row execute function public.write_audit_log()', 'audit_' || table_name, table_name);
    end loop;
  end;
  $$;
  create trigger touch_farms before update on public.farms for each row execute function public.touch_updated_at();
  create trigger audit_farms after insert or update on public.farms for each row execute function public.write_audit_log();

  create function public.is_farm_owner(target_farm_id uuid)
  returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.farms f where f.id = target_farm_id and f.owner_id = auth.uid());
  $$;
  revoke all on function public.is_farm_owner(uuid) from public, anon;
  grant execute on function public.is_farm_owner(uuid) to authenticated;

  alter table public.farms enable row level security;
  alter table public.profiles enable row level security;
  alter table public.financial_accounts enable row level security;
  alter table public.financial_categories enable row level security;
  alter table public.financial_transactions enable row level security;
  alter table public.investment_records enable row level security;
  alter table public.investment_movements enable row level security;
  alter table public.audit_logs enable row level security;

  create policy farms_select on public.farms for select to authenticated using (owner_id = (select auth.uid()));
  create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()) and public.is_farm_owner(farm_id));

  do $$
  declare table_name text;
  begin
    foreach table_name in array array['financial_accounts', 'financial_categories', 'financial_transactions', 'investment_records', 'investment_movements'] loop
      execute format('create policy %I on public.%I for select to authenticated using (public.is_farm_owner(farm_id))', table_name || '_select', table_name);
    end loop;
  end;
  $$;
  create policy audit_logs_select on public.audit_logs for select to authenticated using (public.is_farm_owner(farm_id));

  -- Phase 1 is read-only for application data. Later migrations must add validated
  -- server-side operations before granting any mutation path to authenticated users.
  revoke all on public.farms, public.profiles, public.financial_accounts, public.financial_categories, public.financial_transactions, public.investment_records, public.investment_movements, public.audit_logs from authenticated;
  grant select on public.farms, public.profiles, public.financial_accounts, public.financial_categories, public.financial_transactions, public.investment_records, public.investment_movements, public.audit_logs to authenticated;
  revoke all on public.farms, public.profiles, public.financial_accounts, public.financial_categories, public.financial_transactions, public.investment_records, public.investment_movements, public.audit_logs from anon;
