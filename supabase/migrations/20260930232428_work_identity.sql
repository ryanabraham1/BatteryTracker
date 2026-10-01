create table public.work_access (
 email text primary key check (email=lower(email)),
 user_id uuid unique references auth.users(id) on delete set null,
 member_id uuid unique references public.work_items(id) on delete set null,
 role text not null default 'member' check (role in ('admin','member','viewer')),
 disabled boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.work_access enable row level security;
revoke all on public.work_access from anon,authenticated;
grant all on public.work_access to service_role;
insert into public.work_access(email,role) values
 ('ryan.ryanabraham@gmail.com','admin'),
 ('ryan.abraham@warriorlife.net','admin'),
 ('robotics@warriorlife.net','admin');

-- The server supplies a verified auth user ID; the DB independently checks the Google identity.
create function public.claim_work_account(auth_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare u auth.users; access public.work_access; member uuid; name text;
begin
 select * into u from auth.users where id=auth_id;
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

create function public.set_work_access(actor_id uuid, account_email text, account_role text, account_disabled boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare actor public.work_access; target public.work_access;
begin
 perform pg_advisory_xact_lock(32560012);
 select * into actor from public.work_access where user_id=actor_id and role='admin' and not disabled;
 if not found then raise exception 'Only admins can manage workspace access'; end if;
 if account_role not in ('admin','member','viewer') or length(account_email)>320 or account_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid account'; end if;
 select * into target from public.work_access where email=lower(account_email);
 if target.role='admin' and not target.disabled and (account_role<>'admin' or account_disabled) and (select count(*) from public.work_access where role='admin' and not disabled)<=1 then raise exception 'Keep at least one active admin'; end if;
 if target.user_id=actor_id and (account_role<>'admin' or account_disabled) then raise exception 'Ask another admin to change your own admin access'; end if;
 insert into public.work_access(email,role,disabled) values(lower(account_email),account_role,account_disabled)
 on conflict(email) do update set role=excluded.role,disabled=excluded.disabled;
end $$;
revoke all on function public.set_work_access(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.set_work_access(uuid,text,text,boolean) to service_role;

alter table public.work_events add column actor_id uuid references public.work_items(id) on delete set null;
create function public.mutate_work_authenticated(changes jsonb,auth_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare account public.work_access; result jsonb; name text; c jsonb; kind text;
begin
 select * into account from public.work_access where user_id=auth_id and not disabled;
 if not found or account.role='viewer' then raise exception 'No edit access'; end if;
 for c in select value from jsonb_array_elements(changes) loop
  if c->>'id' is not null then select w.kind into kind from public.work_items w where id=(c->>'id')::uuid; else kind:=c->>'kind'; end if;
  if kind in ('team','member') and account.role<>'admin' then raise exception 'Only admins can manage teams and members'; end if;
 end loop;
 select title into name from public.work_items where id=account.member_id;
 result:=public.mutate_work(changes,coalesce(name,account.email));
 update public.work_events set actor_id=account.member_id where created_at=now() and item_id in (select (value->>'id')::uuid from jsonb_array_elements(result));
 return result;
end $$;
revoke all on function public.mutate_work_authenticated(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.mutate_work_authenticated(jsonb,uuid) to service_role;
