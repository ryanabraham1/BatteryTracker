-- Shared team workspace. App sessions are checked server-side; direct public access is denied.
create table public.work_items (
 id uuid primary key default gen_random_uuid(),
 number bigint generated always as identity unique,
 kind text not null check (kind in ('issue','project','initiative','cycle','label','team','member','document','template','view','milestone','customer','release')),
 title text not null check (length(title) between 1 and 300),
 data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
 revision integer not null default 1,
 archived boolean not null default false,
 deleted_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index work_items_kind_idx on public.work_items(kind, updated_at desc);
create index work_items_data_idx on public.work_items using gin(data);
create table public.work_events (
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.work_items(id) on delete cascade,
 actor text not null default 'Team',
 type text not null,
 body text not null default '',
 data jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create index work_events_item_idx on public.work_events(item_id, created_at);
create table public.work_receipts (
 event_id uuid not null references public.work_events(id) on delete cascade,
 member_id uuid not null references public.work_items(id) on delete cascade,
 snoozed_until timestamptz,
 primary key(event_id, member_id)
);
alter table public.work_items enable row level security;
alter table public.work_events enable row level security;
alter table public.work_receipts enable row level security;
revoke all on public.work_items, public.work_events, public.work_receipts from anon, authenticated;
grant all on public.work_items, public.work_events, public.work_receipts to service_role;
grant usage, select on sequence public.work_items_number_seq to service_role;

-- Revision checks and event logging happen in the same transaction, including bulk edits.
create function public.mutate_work(changes jsonb, actor_name text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare c jsonb; before_row public.work_items; after_row public.work_items; results jsonb := '[]';
begin
 if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) > 200 then raise exception 'Invalid batch'; end if;
 for c in select value from jsonb_array_elements(changes) loop
  if c->>'id' is null then
   insert into public.work_items(kind,title,data) values(c->>'kind',c->>'title',coalesce(c->'data','{}')) returning * into after_row;
  else
   select * into before_row from public.work_items where id=(c->>'id')::uuid for update;
   if not found then raise exception 'Item no longer exists'; end if;
   if before_row.revision <> (c->>'revision')::int then raise exception 'Someone else changed this item. Reload and try again.'; end if;
   update public.work_items set title=coalesce(c->>'title',title), data=data || coalesce(c->'data','{}'),
    archived=coalesce((c->>'archived')::boolean,archived),
    deleted_at=case when c ? 'deleted' then case when (c->>'deleted')::boolean then now() else null end else deleted_at end,
    revision=revision+1, updated_at=now() where id=before_row.id returning * into after_row;
  end if;
  insert into public.work_events(item_id,actor,type,body,data) values(after_row.id,actor_name,
   case when c->>'id' is null then 'created' when c ? 'deleted' then case when (c->>'deleted')::boolean then 'deleted' else 'restored' end when c ? 'archived' then case when (c->>'archived')::boolean then 'archived' else 'unarchived' end else 'updated' end,
   after_row.title,jsonb_build_object('before',case when c->>'id' is null then null else to_jsonb(before_row) end,'after',to_jsonb(after_row)));
  results := results || to_jsonb(after_row);
 end loop;
 return results;
end $$;
revoke all on function public.mutate_work(jsonb,text) from public, anon, authenticated;
grant execute on function public.mutate_work(jsonb,text) to service_role;
create trigger work_items_changed after insert or update or delete on public.work_items
 for each statement execute function public.notify_board_changed();
create trigger work_events_changed after insert on public.work_events
 for each statement execute function public.notify_board_changed();
