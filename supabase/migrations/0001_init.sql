-- Battery Tracker — initial schema
-- Run in the Supabase SQL editor (or `supabase db push`).

create extension if not exists "pgcrypto";

-- Enums --------------------------------------------------------------------
create type battery_status as enum ('active', 'practice_only', 'retired');
create type battery_state as enum ('ready', 'in_robot', 'cooling', 'charging', 'needs_attention');
create type event_type as enum (
  'state_change', 'charge', 'usage', 'beak_test', 'cba_test', 'incident', 'note', 'status_change'
);

-- Tables -------------------------------------------------------------------
create table batteries (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  brand_model      text not null default '',
  capacity_ah      numeric not null default 18,
  purchase_date    date,
  status           battery_status not null default 'active',
  retired_reason   text,
  notes            text not null default '',
  state            battery_state not null default 'ready',
  state_changed_at timestamptz not null default now(),
  cycle_count      int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table battery_events (
  id          uuid primary key default gen_random_uuid(),
  battery_id  uuid not null references batteries(id) on delete cascade,
  type        event_type not null,
  occurred_at timestamptz not null default now(),
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index battery_events_battery_idx on battery_events (battery_id, occurred_at desc);
create index battery_events_occurred_idx on battery_events (occurred_at desc);
create index battery_events_type_idx on battery_events (type);

-- Single-row settings table (id is always 1)
create table settings (
  id                          int primary key default 1 check (id = 1),
  min_rest_after_charge_min   int not null default 30,
  max_charge_duration_min     int not null default 240,
  ir_warn_mohm                numeric not null default 15,
  ir_fail_mohm                numeric not null default 20,
  capacity_warn_pct           numeric not null default 80,
  capacity_fail_pct           numeric not null default 70,
  max_cycles_warn             int not null default 200,
  -- Optional override of the TEAM_CODE env var (sha256 hex). Null = use env.
  team_code_hash              text,
  updated_at                  timestamptz not null default now()
);
insert into settings (id) values (1);

-- updated_at trigger --------------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger batteries_updated_at before update on batteries
  for each row execute function set_updated_at();
create trigger settings_updated_at before update on settings
  for each row execute function set_updated_at();

-- RLS: locked down. The app talks to the DB with the service role only. ---
alter table batteries      enable row level security;
alter table battery_events enable row level security;
alter table settings       enable row level security;

-- Realtime: broadcast a lightweight "changed" ping on a public topic so every
-- phone in the pit refreshes. No row data is sent, so the anon key can listen
-- without any RLS policies on the tables.
create or replace function notify_board_changed() returns trigger
language plpgsql security definer as $$
begin
  perform realtime.send(
    jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'at', now()),
    'changed',
    'board',
    false
  );
  return null;
end $$;

create trigger batteries_changed after insert or update or delete on batteries
  for each statement execute function notify_board_changed();
create trigger battery_events_changed after insert or update or delete on battery_events
  for each statement execute function notify_board_changed();
create trigger settings_changed after update on settings
  for each statement execute function notify_board_changed();
