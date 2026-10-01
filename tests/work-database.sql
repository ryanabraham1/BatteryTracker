begin;
do $$
declare made jsonb; issue uuid; before_count int; revision int; root uuid; repeats int;
begin
 select count(*) into before_count from public.work_items;
 made := public.mutate_work('[{"kind":"issue","title":"__work_database_test__","data":{"status":"Todo"}}]'::jsonb,'Test');
 issue := (made->0->>'id')::uuid;
 if not exists(select 1 from public.work_events where item_id=issue and type='created') then raise exception 'Missing creation event'; end if;
 perform public.mutate_work(jsonb_build_array(jsonb_build_object('id',issue,'revision',1,'data',jsonb_build_object('status','Done'))),'Test');
 begin
  perform public.mutate_work(jsonb_build_array(jsonb_build_object('id',issue,'revision',1,'data',jsonb_build_object('status','Backlog'))),'Test');
  raise exception 'Stale update was accepted';
 exception when others then
  if sqlerrm not like '%Someone else changed%' then raise; end if;
 end;
 if (select data->>'status' from public.work_items where id=issue) <> 'Done' then raise exception 'Stale update changed data'; end if;
 begin
  perform public.mutate_work(jsonb_build_array(jsonb_build_object('kind','issue','title','__bulk_test__','data','{}'::jsonb),jsonb_build_object('id',issue,'revision',1,'data','{}'::jsonb)),'Test');
  raise exception 'Invalid bulk edit accepted';
 exception when others then
  if sqlerrm not like '%Someone else changed%' then raise; end if;
 end;
 if exists(select 1 from public.work_items where title='__bulk_test__') then raise exception 'Bulk edit did not roll back'; end if;
 perform public.mutate_work(jsonb_build_array(jsonb_build_object('id',issue,'revision',2,'deleted',true)),'Test');
 if not exists(select 1 from public.work_items where id=issue and deleted_at is not null) then raise exception 'Soft delete failed'; end if;
 perform public.mutate_work(jsonb_build_array(jsonb_build_object('id',issue,'revision',3,'deleted',false)),'Test');
 if not exists(select 1 from public.work_items where id=issue and deleted_at is null) then raise exception 'Restore failed'; end if;
 made := public.mutate_work(jsonb_build_array(jsonb_build_object('kind','issue','title','__recurrence_test__','data',jsonb_build_object('status','Done','recurrence','weekly','due',((now() at time zone 'America/Los_Angeles')::date - 14)::text))),'Test');
 root := (made->0->>'id')::uuid;
 perform public.advance_work();
 select count(*) into repeats from public.work_events where data->>'repeat_source'=root::text;
 if repeats <> 2 then raise exception 'Expected two occurrences, got %',repeats; end if;
 perform public.advance_work();
 if (select count(*) from public.work_events where data->>'repeat_source'=root::text) <> 2 then raise exception 'Duplicate occurrences'; end if;
 if has_table_privilege('anon','public.work_items','SELECT') or has_table_privilege('authenticated','public.work_items','SELECT') then raise exception 'Public data access'; end if;
 if has_function_privilege('anon','public.mutate_work(jsonb,text)','EXECUTE') then raise exception 'Public edit function'; end if;
end $$;
select 'Passed: creation/history, stale edits, atomic bulk rollback, soft delete/restore, repeat idempotency, private permissions' as result;
rollback;
