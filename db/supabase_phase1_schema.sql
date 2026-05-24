-- Phase 1 Supabase schema for Nakliye app
-- Supabase SQL Editor içine komple yapıştırıp çalıştırın.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  username text not null,
  full_name text,
  role text not null default 'staff',
  active boolean not null default true,
  permissions jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, username)
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  local_id text,
  serial text,
  tarih text,
  musteri text,
  phone text,
  driver text,
  plaka text,
  nereden text,
  nereye text,
  tutar numeric default 0,
  paid_amount numeric default 0,
  portif_ucr numeric default 0,
  fuel_cost numeric default 0,
  driver_cost numeric default 0,
  toll_cost numeric default 0,
  other_cost numeric default 0,
  note text,
  trip_status text default 'new',
  payload jsonb not null default '{}',
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  local_id text,
  name text not null,
  phone text,
  status text default 'available',
  payload jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  local_id text,
  plate text not null,
  brand text,
  model text,
  status text default 'active',
  payload jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  local_id text,
  payload jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.sync_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  entity text not null,
  action text not null,
  local_id text,
  payload jsonb not null default '{}',
  status text not null default 'pending',
  error text,
  created_at timestamptz not null default now(),
  synced_at timestamptz
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_trips_updated_at on public.trips;
create trigger set_trips_updated_at before update on public.trips for each row execute function public.set_updated_at();

drop trigger if exists set_drivers_updated_at on public.drivers;
create trigger set_drivers_updated_at before update on public.drivers for each row execute function public.set_updated_at();

drop trigger if exists set_vehicles_updated_at on public.vehicles;
create trigger set_vehicles_updated_at before update on public.vehicles for each row execute function public.set_updated_at();

drop trigger if exists set_receipts_updated_at on public.receipts;
create trigger set_receipts_updated_at before update on public.receipts for each row execute function public.set_updated_at();

-- مبدئيًا للتجربة فقط. في مرحلة الصلاحيات سنفعّل RLS بسياسات أدق.
alter table public.companies enable row level security;
alter table public.app_users enable row level security;
alter table public.trips enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicles enable row level security;
alter table public.receipts enable row level security;
alter table public.sync_queue enable row level security;

-- سياسة مؤقتة للتطوير باستخدام anon key. لا تستخدمها للإنتاج النهائي قبل مرحلة الصلاحيات.
do $$
begin
  create policy "dev all companies" on public.companies for all using (true) with check (true);
exception when duplicate_object then null;
end $$;
do $$
begin
  create policy "dev all app_users" on public.app_users for all using (true) with check (true);
exception when duplicate_object then null;
end $$;
do $$
begin
  create policy "dev all trips" on public.trips for all using (true) with check (true);
exception when duplicate_object then null;
end $$;
do $$
begin
  create policy "dev all drivers" on public.drivers for all using (true) with check (true);
exception when duplicate_object then null;
end $$;
do $$
begin
  create policy "dev all vehicles" on public.vehicles for all using (true) with check (true);
exception when duplicate_object then null;
end $$;
do $$
begin
  create policy "dev all receipts" on public.receipts for all using (true) with check (true);
exception when duplicate_object then null;
end $$;
do $$
begin
  create policy "dev all sync_queue" on public.sync_queue for all using (true) with check (true);
exception when duplicate_object then null;
end $$;
