-- PHASE 15 - Driver Portal foundation
-- Run once in Supabase SQL Editor.

create table if not exists driver_portal_events (
  id uuid primary key default gen_random_uuid(),
  trip_local_id text,
  trip_serial text,
  driver_name text,
  event_type text,
  status text,
  note text,
  payload jsonb,
  created_at timestamptz default now()
);

alter table driver_portal_events disable row level security;
grant all privileges on table driver_portal_events to anon;
grant all privileges on table driver_portal_events to authenticated;
grant all privileges on table driver_portal_events to service_role;

alter table trips add column if not exists driver_portal_enabled boolean default true;
alter table trips add column if not exists driver_portal_token text;

grant all privileges on table trips to anon;
grant all privileges on table trips to authenticated;

notify pgrst, 'reload schema';
