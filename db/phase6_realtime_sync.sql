-- PHASE 6 - Supabase Realtime Multi-Device Sync
-- شغل هذا الملف مرة واحدة داخل Supabase SQL Editor.
-- يفعّل استقبال التغييرات مباشرة من الجداول الأساسية على الأجهزة الأخرى.

alter table public.trips replica identity full;
alter table public.drivers replica identity full;
alter table public.vehicles replica identity full;
alter table public.receipts replica identity full;
alter table public.app_users replica identity full;
alter table public.backup_snapshots replica identity full;

-- تأكد من الصلاحيات المؤقتة أثناء مرحلة التطوير.
alter table public.trips disable row level security;
alter table public.drivers disable row level security;
alter table public.vehicles disable row level security;
alter table public.receipts disable row level security;
alter table public.app_users disable row level security;
alter table public.backup_snapshots disable row level security;

grant all privileges on table public.trips to anon, authenticated, service_role;
grant all privileges on table public.drivers to anon, authenticated, service_role;
grant all privileges on table public.vehicles to anon, authenticated, service_role;
grant all privileges on table public.receipts to anon, authenticated, service_role;
grant all privileges on table public.app_users to anon, authenticated, service_role;
grant all privileges on table public.backup_snapshots to anon, authenticated, service_role;

-- أضف الجداول إلى publication الخاصة بالـ Realtime.
do $$
begin
  begin alter publication supabase_realtime add table public.trips; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.drivers; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.vehicles; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.receipts; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.app_users; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.backup_snapshots; exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
