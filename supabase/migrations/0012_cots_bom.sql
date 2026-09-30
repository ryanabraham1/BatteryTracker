-- COTS BOM: bought parts (motors, belts, gears, bearings) and standard
-- hardware from an Onshape sync go on their own list instead of the fab
-- tracker — what to buy, from whom, and whether it's here yet.

alter table fab_parts drop constraint if exists fab_parts_kind_check;
alter table fab_parts add constraint fab_parts_kind_check
  check (kind in ('plate', 'tube', 'shaft', 'print', 'machined', 'cots'));

alter table fab_parts
  -- where a COTS line is: still to buy, on order, or in the shop
  add column if not exists cots_status text not null default 'needed'
    check (cots_status in ('needed', 'ordered', 'have')),
  add column if not exists vendor text not null default '',
  add column if not exists url text not null default '',
  -- Onshape standard content (bolts, nuts, washers)
  add column if not exists hardware boolean not null default false;

create index if not exists fab_parts_cots_idx on fab_parts (kind) where kind = 'cots';
