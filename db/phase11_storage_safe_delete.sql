-- PHASE 11 - Storage safe delete / evrak cleanup permissions
-- Bu dosya, evrak_files tablosu ve evrak bucket için silme/yazma izinlerini güçlendirir.

alter table if exists public.evrak_files disable row level security;

grant all privileges on table public.evrak_files to anon;
grant all privileges on table public.evrak_files to authenticated;
grant all privileges on table public.evrak_files to service_role;

-- Storage object izinleri: public bucket üzerinde upload/delete/select izinlerini genişletir.
-- Supabase policy adları varsa yenilenir.
drop policy if exists "evrak public select" on storage.objects;
drop policy if exists "evrak public insert" on storage.objects;
drop policy if exists "evrak public update" on storage.objects;
drop policy if exists "evrak public delete" on storage.objects;

create policy "evrak public select"
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
