-- PHASE 5 - Login, roles, sessions and audit foundation
-- شغل هذا الملف مرة واحدة داخل Supabase SQL Editor قبل تجربة النسخة الجديدة.

create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  local_id text unique,
  company_id uuid,
  username text,
  full_name text,
  password_hash text,
  role text default 'staff',
  permissions jsonb default '{}'::jsonb,
  active boolean default true,
  last_login_at timestamptz,
  last_logout_at timestamptz,
  session_count integer default 0,
  payload jsonb,
  status text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table app_users
add column if not exists password_hash text,
add column if not exists active boolean default true,
add column if not exists last_login_at timestamptz,
add column if not exists last_logout_at timestamptz,
add column if not exists session_count integer default 0,
add column if not exists permissions jsonb default '{}'::jsonb,
add column if not exists payload jsonb,
add column if not exists updated_at timestamptz default now();

create table if not exists auth_activity_logs (
  id uuid primary key default gen_random_uuid(),
  company_local_id text,
  user_local_id text,
  username text,
  full_name text,
  role text,
  action text,
  payload jsonb,
  created_at timestamptz default now()
);

alter table app_users disable row level security;
alter table auth_activity_logs disable row level security;

grant all privileges on table app_users to anon;
grant all privileges on table app_users to authenticated;
grant all privileges on table app_users to service_role;

grant all privileges on table auth_activity_logs to anon;
grant all privileges on table auth_activity_logs to authenticated;
grant all privileges on table auth_activity_logs to service_role;

notify pgrst, 'reload schema';
