-- One fab tracker. The spreadsheet-style tracker (fab_jobs, 0010) and the
-- Onshape-driven parts (fab_parts, 0009) were two lists of the same thing.
-- Parts gets every column of the team's Machining / 3D Printing sheets, its
-- board columns become the sheet's statuses, and any tracker rows are copied
-- over before fab_jobs goes away.

-- 1. Board columns = the sheet's statuses.
alter table fab_parts rename column stage to status;
alter table fab_parts rename column stage_changed_at to status_changed_at;
update fab_parts set status = case
  when status in ('done') then 'finished'
  when status in ('cam', 'todo', 'queued') then 'not_started'
  when status in ('ready') then 'have_cam'
  else 'in_progress'
end
where status not in ('not_started', 'have_cam', 'in_progress', 'outsourced', 'spares_needed', 'spares_finished', 'finished', 'not_needed');
alter table fab_parts alter column status set default 'not_started';
alter table fab_parts add constraint fab_parts_status_check check (status in
  ('not_started', 'have_cam', 'in_progress', 'outsourced', 'spares_needed', 'spares_finished', 'finished', 'not_needed'));

-- 2. The sheet's columns.
alter table fab_parts
  add column if not exists bot         text not null default '',
  add column if not exists subsystem   text not null default '',
  add column if not exists priority    int check (priority between 0 and 4),   -- #0 = most urgent
  add column if not exists spare_qty   int not null default 0 check (spare_qty >= 0),
  add column if not exists stock_dims  text not null default '',   -- '1/8" thick', '1/2 diam shaft'
  add column if not exists length_text text not null default '',   -- the sheet's Length, as typed
  add column if not exists tapped      text not null default '',
  add column if not exists machine     text not null default '',
  add column if not exists infill      text not null default '',   -- 3D printing
  add column if not exists designer    text not null default '',   -- 3D printing
  add column if not exists file        text not null default '',   -- drawing / CAM / STL: a name or a link
  add column if not exists linear_url  text not null default '';
-- the sheet allows qty 0 (spares only)
alter table fab_parts drop constraint if exists fab_parts_quantity_check;
alter table fab_parts add constraint fab_parts_quantity_check check (quantity >= 0);
create index if not exists fab_parts_status_idx on fab_parts (status);

-- A design is usually one bot ("Aimbot"); synced parts get it as their Bot.
alter table fab_designs add column if not exists bot text not null default '';

-- 3. Bring over anything on the old tracker, then drop it.
do $$
begin
  if to_regclass('public.fab_jobs') is not null then
    insert into fab_parts (
      name, kind, status, status_changed_at, bot, subsystem, priority, quantity, spare_qty,
      material_text, stock_dims, length_text, tapped, machine, infill, designer, file, notes,
      linear_url, material_id, material_locked, assignees, created_at
    )
    select
      j.name,
      case
        when j.tracker = 'print' then 'print'
        when j.material ~* 'sheet|plate|birch|srpp|\mcf\M' then 'plate'
        when j.material ~* 'rod|hex|shaft|spline' then 'shaft'
        when j.material ~* 'tube|maxtube|bracket|angle|channel|nutstrip|bar' then 'tube'
        else 'machined'
      end,
      j.status, j.status_changed_at, j.bot, j.subsystem, j.priority, j.qty, j.spare_qty,
      j.material, j.stock_dims, j.length, j.tapped, j.machine, j.infill, j.designer, j.file, j.notes,
      j.linear_url, j.material_id, j.material_id is not null,
      coalesce(array(select trim(x) from regexp_split_to_table(j.dri, '\s*(,|&|/|\yand\y)\s*') x where trim(x) <> ''), '{}'),
      j.created_at
    from fab_jobs j;
    drop table fab_jobs;
  end if;
end $$;
