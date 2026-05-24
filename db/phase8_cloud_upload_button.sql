-- PHASE 8 - Cloud'a Yükle button + evrak_files final schema
-- Supabase SQL Editor içinde bir kez çalıştırın.

create extension if not exists pgcrypto;

create table if not exists evrak_files (
  id uuid primary key default gen_random_uuid(),
  local_id text unique,
  trip_id uuid,
  trip_local_id text,
  trip_serial text,
  company_local_id text,
  doc_type text,
  note text,
  file_name text,
  file_type text,
  file_size bigint default 0,
  bucket text default 'evrak',
  storage_path text,
  public_url text,
  uploaded_by text,
  payload jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted boolean default false
);

alter table evrak_files
add column if not exists local_id text unique,
add column if not exists trip_id uuid,
add column if not exists trip_local_id text,
add column if not exists trip_serial text,
add column if not exists company_local_id text,
add column if not exists doc_type text,
add column if not exists note text,
add column if not exists file_name text,
add column if not exists file_type text,
add column if not exists file_size bigint default 0,
add column if not exists bucket text default 'evrak',
add column if not exists storage_path text,
add column if not exists public_url text,
add column if not exists uploaded_by text,
add column if not exists payload jsonb,
add column if not exists updated_at timestamptz default now(),
add column if not exists deleted boolean default false;

alter table evrak_files disable row level security;

grant all privileges on table evrak_files to anon;
grant all privileges on table evrak_files to authenticated;
grant all privileges on table evrak_files to service_role;

-- Storage bucket evrak zaten panelden oluşturulduysa bu satır zarar vermez.
insert into storage.buckets (id, name, public)
values ('evrak', 'evrak', true)
on conflict (id) do update set public = true;

-- Upload/read için geçici açık storage politikaları. Auth aşamasında sıkılaştıracağız.
drop policy if exists "evrak public read" on storage.objects;
drop policy if exists "evrak public insert" on storage.objects;
drop policy if exists "evrak public update" on storage.objects;
drop policy if exists "evrak public delete" on storage.objects;

create policy "evrak public read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'evrak');

create policy "evrak public insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'evrak');

create policy "evrak public update"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'evrak')
with check (bucket_id = 'evrak');

create policy "evrak public delete"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'evrak');

notify pgrst, 'reload schema';
