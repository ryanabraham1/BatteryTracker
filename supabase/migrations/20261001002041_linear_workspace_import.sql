insert into storage.buckets(id,name,public) values('work-imports','work-imports',false)
on conflict(id) do nothing;
grant update on sequence public.work_items_number_seq to service_role;

-- One-time, repeatable imports run only from the trusted server role. Imported
-- rows are left unchanged on a rerun, protecting local edits after migration.
create function public.import_linear_work(payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r jsonb; old public.work_items; created integer:=0; skipped integer:=0; event_count integer:=0; source_workspace text;
begin
 perform pg_advisory_xact_lock(32560014);
 source_workspace:=payload->>'workspaceId';
 if source_workspace is null or jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items')>10000 then raise exception 'Invalid import'; end if;
 for r in select value from jsonb_array_elements(payload->'items') loop
  if r->'data'->'source'->>'system'<>'linear' or r->'data'->'source'->>'workspaceId'<>source_workspace then raise exception 'Missing source provenance'; end if;
  if r->>'kind'='issue' and exists(select 1 from jsonb_array_elements_text(coalesce(r->'data'->'source'->'raw'->'labels','[]')) l where lower(l) in ('fab','fabrication')) then raise exception 'Fabrication issues must be excluded'; end if;
  select * into old from public.work_items where id=(r->>'id')::uuid for update;
  if found then
   if old.kind<>r->>'kind' then raise exception 'Import ID collision'; end if;
   if old.data->'source'->>'system'='linear' and old.data->'source'->>'workspaceId'=source_workspace then skipped:=skipped+1; continue; end if;
   if not coalesce(payload->'mergeIds','[]') ? (r->>'id') then raise exception 'Existing local record cannot be overwritten'; end if;
   update public.work_items set data=data || r->'data',title=r->>'title',archived=(r->>'archived')::boolean,revision=revision+1 where id=old.id;
  else
   insert into public.work_items(id,kind,title,data,archived,created_at,updated_at)
   values((r->>'id')::uuid,r->>'kind',r->>'title',r->'data',coalesce((r->>'archived')::boolean,false),(r->>'created_at')::timestamptz,(r->>'updated_at')::timestamptz);
   created:=created+1;
  end if;
 end loop;
 for r in select value from jsonb_array_elements(payload->'events') loop
  insert into public.work_events(id,item_id,actor,actor_id,type,body,data,created_at)
  values((r->>'id')::uuid,(r->>'item_id')::uuid,r->>'actor',(r->>'actor_id')::uuid,r->>'type',coalesce(r->>'body',''),r->'data',(r->>'created_at')::timestamptz)
  on conflict(id) do nothing;
  if found then event_count:=event_count+1; end if;
 end loop;
 for r in select value from jsonb_array_elements(payload->'access') loop
  if r->>'role'='admin' and lower(r->>'email') not in ('ryan.ryanabraham@gmail.com','ryan.abraham@warriorlife.net','robotics@warriorlife.net') then raise exception 'Only designated initial admins are allowed'; end if;
  insert into public.work_access(email,member_id,role,disabled) values(lower(r->>'email'),(r->>'member_id')::uuid,r->>'role',coalesce((r->>'disabled')::boolean,false))
  on conflict(email) do update set member_id=coalesce(public.work_access.member_id,excluded.member_id);
 end loop;
 -- New locally-created issue numbers must never reuse an imported identifier.
 perform pg_catalog.setval('public.work_items_number_seq', greatest((select coalesce(max(number),1) from public.work_items),coalesce((payload->>'maximumIssueNumber')::bigint,1)),true);
 return jsonb_build_object('created',created,'alreadyImported',skipped,'eventsCreated',event_count);
end $$;
revoke all on function public.import_linear_work(jsonb) from public,anon,authenticated;
grant execute on function public.import_linear_work(jsonb) to service_role;
