-- Keep account binding SECURITY INVOKER. The trusted server role already has
-- Auth Admin API access, but lacks SQL read privileges on these Auth tables.
-- Grant only the fields this identity check needs; no public/client grants.
grant select (id, email, email_confirmed_at, raw_user_meta_data)
  on auth.users to service_role;
grant select (user_id, provider) on auth.identities to service_role;

create or replace function public.claim_work_account(auth_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare u record; access public.work_access; member uuid; name text;
begin
 select id,email,email_confirmed_at,raw_user_meta_data into u from auth.users where id=auth_id;
 if not found or u.email_confirmed_at is null or not exists(select 1 from auth.identities where user_id=auth_id and provider='google') then raise exception 'A verified Google account is required'; end if;
 select * into access from public.work_access where email=lower(u.email) for update;
 if not found or access.disabled then raise exception 'This email has not been granted workspace access. Ask an admin to add it.'; end if;
 if access.user_id is not null and access.user_id <> auth_id then raise exception 'This email is linked to a different account'; end if;
 member := access.member_id;
 if member is null then
  name := coalesce(nullif(u.raw_user_meta_data->>'full_name',''), split_part(u.email,'@',1));
  insert into public.work_items(kind,title,data) values('member',left(name,300),jsonb_build_object('color','#6b3fd4')) returning id into member;
 end if;
 update public.work_access set user_id=auth_id,member_id=member where email=access.email;
 return member;
end $$;
revoke all on function public.claim_work_account(uuid) from public,anon,authenticated;
grant execute on function public.claim_work_account(uuid) to service_role;
