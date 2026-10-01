begin;
do $$
declare admin_id uuid:=gen_random_uuid(); viewer_id uuid:=gen_random_uuid(); member uuid; result jsonb;
begin
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data) values(admin_id,'__work_admin_test__@example.com',now(),'{"full_name":"Test admin"}','{"provider":"google"}'),(viewer_id,'__work_viewer_test__@example.com',now(),'{"full_name":"Test viewer"}','{"provider":"google"}');
 insert into auth.identities(user_id,provider,provider_id,identity_data) values(admin_id,'google',admin_id::text,'{}'),(viewer_id,'google',viewer_id::text,'{}');
 insert into public.work_access(email,role) values('__work_admin_test__@example.com','admin'),('__work_viewer_test__@example.com','viewer');
 -- Fixtures are created as postgres; all app operations must use its actual role.
 execute 'set local role service_role';
 member:=public.claim_work_account(admin_id);
 if member is null then raise exception 'Profile was not created'; end if;
 if public.claim_work_account(admin_id)<>member then raise exception 'Duplicate profile'; end if;
 perform public.claim_work_account(viewer_id);
 perform public.set_work_access(admin_id,'__new_member_test__@example.com','member',false);
 if not exists(select 1 from public.work_access where email='__new_member_test__@example.com' and role='member') then raise exception 'Admin invite failed'; end if;
 begin
  perform public.set_work_access(viewer_id,'__bad_invite__@example.com','admin',false);
  raise exception 'Viewer granted access';
 exception when others then if sqlerrm not like '%Only admins%' then raise; end if; end;
 begin
  perform public.set_work_access(admin_id,'__work_admin_test__@example.com','member',false);
  raise exception 'Self demotion accepted';
 exception when others then if sqlerrm not like '%another admin%' then raise; end if; end;
 begin
  perform public.mutate_work_authenticated('[{"kind":"issue","title":"__viewer_write__","data":{}}]',viewer_id);
  raise exception 'Viewer edit accepted';
 exception when others then if sqlerrm not like '%No edit access%' then raise; end if; end;
 result:=public.mutate_work_authenticated('[{"kind":"issue","title":"__admin_write__","data":{}}]',admin_id);
 if not exists(select 1 from public.work_events where item_id=(result->0->>'id')::uuid and actor_id=member) then raise exception 'Identity attribution failed'; end if;
 if (select count(*) from public.work_access where email in ('ryan.ryanabraham@gmail.com','ryan.abraham@warriorlife.net','robotics@warriorlife.net') and role='admin' and not disabled)<>3 then raise exception 'Initial admins missing'; end if;
 if has_table_privilege('anon','public.work_access','SELECT') or has_function_privilege('authenticated','public.set_work_access(uuid,text,text,boolean)','EXECUTE') then raise exception 'Public access privilege'; end if;
 if has_function_privilege('anon','public.claim_work_account(uuid)','EXECUTE') or has_function_privilege('authenticated','public.claim_work_account(uuid)','EXECUTE') then raise exception 'Public identity binding privilege'; end if;
 if (select prosecdef from pg_proc where oid='public.claim_work_account(uuid)'::regprocedure) then raise exception 'Binding unexpectedly uses definer permissions'; end if;
end $$;
select 'Passed: three initial admins, verified identity binding, profile idempotency, admin invites, viewer denial, self-demotion prevention, stable attribution, private permissions' as result;
rollback;
