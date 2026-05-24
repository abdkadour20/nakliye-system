-- Phase 3: Automatic cloud backup snapshots
-- شغّل هذا الملف في Supabase SQL Editor بعد ملفات المرحلة 1 و 2.

create table if not exists public.backup_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_local_id text not null,
  reason text default 'auto',
  snapshot jsonb not null default '{}'::jsonb,
  sync_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists backup_snapshots_company_created_idx
  on public.backup_snapshots (company_local_id, created_at desc);

alter table public.backup_snapshots enable row level security;

-- ملاحظة: هذه سياسة تطوير سريعة باستعمال anon key.
-- بعد تفعيل Supabase Auth في المرحلة القادمة سنضيق السياسة حسب المستخدم والشركة.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'backup_snapshots' and policyname = 'dev_backup_snapshots_all'
  ) then
    create policy dev_backup_snapshots_all on public.backup_snapshots
      for all using (true) with check (true);
  end if;
end $$;
