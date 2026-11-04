-- Smart Calendar: one row per account holding that person's calendar.
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- It's safe to run again.

create table if not exists public.calendar_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- The whole calendar, in the same shape the app keeps in the browser.
  data jsonb not null,
  -- Goes up by one on every save, so two devices can't silently overwrite each other.
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

-- Only the signed-in owner can see or change their row.
alter table public.calendar_data enable row level security;

drop policy if exists "Read own calendar" on public.calendar_data;
create policy "Read own calendar" on public.calendar_data
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Create own calendar" on public.calendar_data;
create policy "Create own calendar" on public.calendar_data
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Update own calendar" on public.calendar_data;
create policy "Update own calendar" on public.calendar_data
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own calendar" on public.calendar_data;
create policy "Delete own calendar" on public.calendar_data
  for delete to authenticated using ((select auth.uid()) = user_id);

-- New tables aren't exposed to the API automatically in this project, so grant access here.
-- Signed-out visitors (the anon role) get nothing.
revoke all on public.calendar_data from anon;
grant select, insert, update, delete on public.calendar_data to authenticated;

-- Keep updated_at current on every save.
create or replace function public.touch_calendar_data() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_calendar_data on public.calendar_data;
create trigger touch_calendar_data before update on public.calendar_data
  for each row execute function public.touch_calendar_data();

-- Tell open devices right away when another device saves.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calendar_data'
  ) then
    alter publication supabase_realtime add table public.calendar_data;
  end if;
end;
$$;
