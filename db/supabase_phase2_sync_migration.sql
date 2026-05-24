-- Phase 2: Offline + Supabase sync migration
-- شغّل هذا الملف مرة واحدة بعد phase1 schema في Supabase SQL Editor.

alter table public.companies add column if not exists local_id text;
alter table public.app_users add column if not exists local_id text;
alter table public.app_users add column if not exists payload jsonb not null default '{}';

create unique index if not exists companies_local_id_uidx on public.companies(local_id) where local_id is not null;
create unique index if not exists trips_local_id_uidx on public.trips(local_id) where local_id is not null;
create unique index if not exists drivers_local_id_uidx on public.drivers(local_id) where local_id is not null;
create unique index if not exists vehicles_local_id_uidx on public.vehicles(local_id) where local_id is not null;
create unique index if not exists receipts_local_id_uidx on public.receipts(local_id) where local_id is not null;
create unique index if not exists app_users_local_id_uidx on public.app_users(local_id) where local_id is not null;
