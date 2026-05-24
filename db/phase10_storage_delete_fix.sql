-- PHASE 10 - Fix real deletion from Supabase Storage + evrak_files
-- شغّل هذا الملف مرة واحدة داخل Supabase SQL Editor.

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public)
values ('evrak', 'evrak', true)
on conflict (id) do update set public = true;

alter table public.evrak_files disable row level security;

grant all privileges on table public.evrak_files to anon;
grant all privileges on table public.evrak_files to authenticated;
grant all privileges on table public.evrak_files to service_role;

-- Storage permissions for evrak bucket
-- These policies allow the browser app to upload/read/delete files in the public evrak bucket.
drop policy if exists "evrak public read" on storage.objects;
drop policy if exists "evrak public insert" on storage.objects;
drop policy if exists "evrak public update" on storage.objects;
drop policy if exists "evrak public delete" on storage.objects;
drop policy if exists "evrak allow select" on storage.objects;
drop policy if exists "evrak allow insert" on storage.objects;
drop policy if exists "evrak allow update" on storage.objects;
drop policy if exists "evrak allow delete" on storage.objects;

create policy "evrak allow select"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'evrak');

create policy "evrak allow insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'evrak');

create policy "evrak allow update"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'evrak')
with check (bucket_id = 'evrak');

create policy "evrak allow delete"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'evrak');

notify pgrst, 'reload schema';
