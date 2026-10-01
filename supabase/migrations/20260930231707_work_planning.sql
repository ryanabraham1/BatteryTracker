-- Work's maintenance runs at workspace load. Locking prevents duplicate repeats across devices.
create or replace function public.advance_work() returns integer
language plpgsql security invoker set search_path = '' as $$
declare root public.work_items; made public.work_items; next_date date; today date := (now() at time zone 'America/Los_Angeles')::date; n integer := 0; repeats integer;
begin
 if not pg_try_advisory_xact_lock(32560011) then return 0; end if;
 for root in select * from public.work_items where kind='issue' and not archived and deleted_at is null and data->>'recurrence' in ('weekly','monthly') and data->>'due' ~ '^\d{4}-\d{2}-\d{2}$' for update loop
  next_date := coalesce(nullif(root.data->>'nextRepeat','')::date, (root.data->>'due')::date + case when root.data->>'recurrence'='weekly' then interval '7 days' else interval '1 month' end);
  repeats := 0;
  while next_date <= today and repeats < 52 loop
   insert into public.work_items(kind,title,data) values('issue',root.title,
    (root.data - 'recurrence' - 'nextRepeat' - 'parent' - 'relations' - 'cycle') || jsonb_build_object('due',next_date::text,'status','Todo')) returning * into made;
   insert into public.work_events(item_id,actor,type,body,data) values(made.id,'Workspace','created',made.title,jsonb_build_object('repeat_source',root.id));
   next_date := next_date + case when root.data->>'recurrence'='weekly' then interval '7 days' else interval '1 month' end;
   n := n+1; repeats := repeats+1;
  end loop;
  update public.work_items set data=data || jsonb_build_object('nextRepeat',next_date::text), revision=revision+1, updated_at=now() where id=root.id and data->>'nextRepeat' is distinct from next_date::text;
 end loop;
 return n;
end $$;
revoke all on function public.advance_work() from public,anon,authenticated;
grant execute on function public.advance_work() to service_role;

create or replace function public.mutate_work(changes jsonb, actor_name text) returns jsonb
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
   update public.work_items set title=coalesce(c->>'title',title), data=(data || coalesce(c->'data','{}')) - case when (c->'data'->>'due') is distinct from (before_row.data->>'due') or (c->'data'->>'recurrence') is distinct from (before_row.data->>'recurrence') then 'nextRepeat' else '__never' end,
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
