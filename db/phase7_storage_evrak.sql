-- PHASE 7 - Supabase Storage + Evrak Upload
-- 1) شغّل هذا الملف في Supabase SQL Editor.
-- 2) بعدها أنشئ Bucket باسم evrak من Storage واجعله Public.

create extension if not exists pgcrypto;

create table if not exists evrak_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  owner_type text,
  owner_id text,
  owner_name text,
  category text,
  title text,
  file_name text,
  file_type text,
  file_size bigint default 0,
  storage_bucket text default 'evrak',
  storage_path text,
  public_url text,
  note text,
  expire_date date,
  uploaded_by text,
  payload jsonb,
  deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table evrak_files disable row level security;

grant all privileges on table evrak_files to anon;
grant all privileges on table evrak_files to authenticated;
grant all privileges on table evrak_files to service_role;

-- Storage policies for public bucket uploads/reads from the app.
insert into storage.buckets (id, name, public)
values ('evrak', 'evrak', true)
on conflict (id) do update set public = true;

drop policy if exists "evrak public read" on storage.objects;
drop policy if exists "evrak anon upload" on storage.objects;
drop policy if exists "evrak anon update" on storage.objects;
drop policy if exists "evrak anon delete" on storage.objects;

create policy "evrak public read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'evrak');

create policy "evrak anon upload"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'evrak');

create policy "evrak anon update"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'evrak')
with check (bucket_id = 'evrak');

create policy "evrak anon delete"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'evrak');

notify pgrst, 'reload schema';
