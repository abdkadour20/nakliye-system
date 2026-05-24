-- Nakliye Supabase Full Setup - انسخ هذا الملف كاملًا في SQL Editor ثم اضغط Run
-- آمن للتشغيل أكثر من مرة. يضيف الأعمدة الناقصة حتى لو أنشأت جداول بسيطة سابقًا.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  local_id text,
  name text not null default 'Nakliye System',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  local_id text,
  username text,
  full_name text,
  role text not null default 'staff',
  active boolean not null default true,
  permissions jsonb not null default '{}',
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trips (id uuid primary key default gen_random_uuid());
alter table public.trips add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.trips add column if not exists local_id text;
alter table public.trips add column if not exists serial text;
alter table public.trips add column if not exists tarih text;
alter table public.trips add column if not exists musteri text;
alter table public.trips add column if not exists phone text;
alter table public.trips add column if not exists driver text;
alter table public.trips add column if not exists plaka text;
alter table public.trips add column if not exists nereden text;
alter table public.trips add column if not exists nereye text;
alter table public.trips add column if not exists tutar numeric default 0;
alter table public.trips add column if not exists paid_amount numeric default 0;
alter table public.trips add column if not exists portif_ucr numeric default 0;
alter table public.trips add column if not exists fuel_cost numeric default 0;
alter table public.trips add column if not exists driver_cost numeric default 0;
alter table public.trips add column if not exists toll_cost numeric default 0;
alter table public.trips add column if not exists other_cost numeric default 0;
alter table public.trips add column if not exists note text;
alter table public.trips add column if not exists trip_status text default 'new';
alter table public.trips add column if not exists payload jsonb not null default '{}';
alter table public.trips add column if not exists deleted boolean not null default false;
alter table public.trips add column if not exists updated_at timestamptz not null default now();
alter table public.trips add column if not exists created_at timestamptz not null default now();

create table if not exists public.drivers (id uuid primary key default gen_random_uuid());
alter table public.drivers add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.drivers add column if not exists local_id text;
alter table public.drivers add column if not exists name text;
alter table public.drivers add column if not exists phone text;
alter table public.drivers add column if not exists status text default 'available';
alter table public.drivers add column if not exists payload jsonb not null default '{}';
alter table public.drivers add column if not exists updated_at timestamptz not null default now();
alter table public.drivers add column if not exists created_at timestamptz not null default now();

create table if not exists public.vehicles (id uuid primary key default gen_random_uuid());
alter table public.vehicles add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.vehicles add column if not exists local_id text;
alter table public.vehicles add column if not exists plate text;
alter table public.vehicles add column if not exists brand text;
alter table public.vehicles add column if not exists model text;
alter table public.vehicles add column if not exists status text default 'active';
alter table public.vehicles add column if not exists payload jsonb not null default '{}';
alter table public.vehicles add column if not exists updated_at timestamptz not null default now();
alter table public.vehicles add column if not exists created_at timestamptz not null default now();

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

create table if not exists public.backup_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_local_id text not null,
  reason text default 'auto',
  snapshot jsonb not null default '{}'::jsonb,
  sync_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists companies_local_id_uidx on public.companies(local_id) where local_id is not null;
create unique index if not exists trips_local_id_uidx on public.trips(local_id) where local_id is not null;
create unique index if not exists drivers_local_id_uidx on public.drivers(local_id) where local_id is not null;
create unique index if not exists vehicles_local_id_uidx on public.vehicles(local_id) where local_id is not null;
create unique index if not exists receipts_local_id_uidx on public.receipts(local_id) where local_id is not null;
create unique index if not exists app_users_local_id_uidx on public.app_users(local_id) where local_id is not null;
create index if not exists backup_snapshots_company_created_idx on public.backup_snapshots (company_local_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_companies_updated_at on public.companies;
create trigger set_companies_updated_at before update on public.companies for each row execute function public.set_updated_at();
drop trigger if exists set_trips_updated_at on public.trips;
create trigger set_trips_updated_at before update on public.trips for each row execute function public.set_updated_at();
drop trigger if exists set_drivers_updated_at on public.drivers;
create trigger set_drivers_updated_at before update on public.drivers for each row execute function public.set_updated_at();
drop trigger if exists set_vehicles_updated_at on public.vehicles;
create trigger set_vehicles_updated_at before update on public.vehicles for each row execute function public.set_updated_at();
drop trigger if exists set_receipts_updated_at on public.receipts;
create trigger set_receipts_updated_at before update on public.receipts for each row execute function public.set_updated_at();

alter table public.companies enable row level security;
alter table public.app_users enable row level security;
alter table public.trips enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicles enable row level security;
alter table public.receipts enable row level security;
alter table public.sync_queue enable row level security;
alter table public.backup_snapshots enable row level security;

-- سياسات مؤقتة للتجربة وربط البرنامج بالمفتاح العلوي Publishable key.
-- في مرحلة المستخدمين والصلاحيات سنستبدلها بسياسات أضيق لكل مستخدم.
do $$ begin create policy dev_all_companies on public.companies for all using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy dev_all_app_users on public.app_users for all using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy dev_all_trips on public.trips for all using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy dev_all_drivers on public.drivers for all using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy dev_all_vehicles on public.vehicles for all using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy dev_all_receipts on public.receipts for all using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy dev_all_sync_queue on public.sync_queue for all using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy dev_all_backup_snapshots on public.backup_snapshots for all using (true) with check (true); exception when duplicate_object then null; end $$;
