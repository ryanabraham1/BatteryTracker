-- Parts: what the team is making, loaded from Onshape (or added by hand).
-- Each part sits on the kanban board for its kind (plate, tube, shaft, print,
-- machined) and carries its files (DXF, STEP, …) in the private `fab-files`
-- storage bucket. Machines describe what the shop can actually make, for the
-- manufacturability (DFM) checks and the cut planner.

create table fab_designs (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  url             text not null default '',
  -- parsed from the Onshape URL
  document_id     text,
  wvm             text check (wvm in ('w', 'v', 'm')),
  wvm_id          text,
  element_id      text,
  element_type    text check (element_type in ('assembly', 'partstudio')),
  -- robots/sets being built: multiplies every part's quantity in the planner
  copies          int not null default 1 check (copies > 0),
  last_synced_at  timestamptz,
  sync_note       text not null default '',
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table fab_parts (
  id                uuid primary key default gen_random_uuid(),
  design_id         uuid references fab_designs (id) on delete cascade,
  -- stable Onshape identity (document:element:partId:configuration) so a re-sync updates in place
  onshape_key       text,
  -- where to export files from: {did, wvm, wvmid, eid, partId, configuration}
  source            jsonb,
  name              text not null,
  part_number       text not null default '',
  description       text not null default '',
  kind              text not null default 'machined'
                      check (kind in ('plate', 'tube', 'shaft', 'print', 'machined')),
  stage             text not null default 'todo',
  stage_changed_at  timestamptz not null default now(),
  quantity          int not null default 1 check (quantity > 0),
  -- how many have been through the cut planner (nested + committed)
  cut_qty           int not null default 0 check (cut_qty >= 0),
  -- inventory material this is cut from; locked once someone picks it by hand
  material_id       uuid references fab_materials (id) on delete set null,
  material_locked   boolean not null default false,
  material_text     text not null default '',   -- Onshape's material name
  -- bounding box, sorted longest → shortest (mm)
  size_l_mm         numeric,
  size_w_mm         numeric,
  size_t_mm         numeric,
  -- 2D outline for sheet parts: {loops: [{segs: [{a:[x,y], b:[x,y], bulge}]}]} in mm
  geometry          jsonb,
  properties        jsonb not null default '{}'::jsonb,
  assignees         text[] not null default '{}',
  notes             text not null default '',
  -- no longer in the design as of the last sync
  missing           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (design_id, onshape_key)
);
create index fab_parts_kind_idx on fab_parts (kind, stage);

create table fab_part_files (
  id          uuid primary key default gen_random_uuid(),
  part_id     uuid not null references fab_parts (id) on delete cascade,
  kind        text not null default 'other' check (kind in ('dxf', 'step', 'stl', 'pdf', 'image', 'other')),
  name        text not null,
  path        text not null,           -- object path in the fab-files bucket
  size_bytes  bigint,
  source      text not null default 'upload' check (source in ('onshape', 'upload')),
  created_at  timestamptz not null default now()
);
create index fab_part_files_part_idx on fab_part_files (part_id);

create table fab_part_events (
  id           uuid primary key default gen_random_uuid(),
  part_id      uuid not null references fab_parts (id) on delete cascade,
  type         text not null check (type in ('import', 'stage', 'assign', 'file', 'cut', 'edit')),
  data         jsonb not null default '{}'::jsonb,
  occurred_at  timestamptz not null default now()
);
create index fab_part_events_part_idx on fab_part_events (part_id, occurred_at desc);

create table fab_machines (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  process           text not null check (process in ('router', 'laser', 'waterjet', 'mill', 'lathe', 'saw', 'printer')),
  -- work area / bed (router, laser, waterjet, mill, printer)
  bed_w_mm          numeric,
  bed_l_mm          numeric,
  -- thickest sheet (router/laser/waterjet), Z height (printer, mill)
  max_thickness_mm  numeric,
  -- per-material limits that beat max_thickness_mm, mm: "stainless: 5, aluminum: 4" (first match wins)
  thickness_limits  text not null default '',
  -- router/mill: end mill diameter (sets the inside-corner radius and narrowest slot);
  -- laser/waterjet: kerf
  tool_diameter_mm  numeric,
  min_hole_mm       numeric,
  min_web_mm        numeric,
  -- saw: longest stock it takes; lathe: longest part between centres
  max_length_mm     numeric,
  -- lathe swing
  max_diameter_mm   numeric,
  -- comma-separated keywords matched against the material ("aluminum, polycarbonate"); empty = anything
  materials         text not null default '',
  active            boolean not null default true,
  notes             text not null default '',
  sort              int not null default 0,
  created_at        timestamptz not null default now()
);
-- The shop as of Sept 2026. Specs are left blank until someone measures them:
-- a DFM check whose limit is blank says "not checked" instead of guessing.
-- Only the material lists are filled in, from what each machine can cut at all.
-- The xTool MetalFab (1200 W) is a fiber laser: metal only, 24" x 24" bed
-- (with a pass-through for longer parts). xTool's burr-free limits: 10 mm
-- carbon steel, 5 mm stainless, 4 mm aluminum, 3 mm brass.
insert into fab_machines (name, process, bed_w_mm, bed_l_mm, max_thickness_mm, thickness_limits, materials, notes, sort) values
  ('xTool MetalFab 1200W', 'laser', 610, 610, 10, 'stainless: 5, aluminum: 4, al: 4, brass: 3, copper: 3', 'aluminum, al, steel, stainless, brass, copper, titanium, galvanized', 'Fiber laser (also a welder). 24" x 24" bed; the pass-through takes longer parts. Limits are xTool''s burr-free numbers for the 1200 W. Set the kerf once you''ve measured one.', 2);
insert into fab_machines (name, process, materials, notes, sort) values
  ('CNC router', 'router', 'aluminum, al, polycarbonate, hdpe, delrin, acetal, uhmw, abs, plywood, wood, mdf, garolite, g10, carbon fiber, acrylic', 'Fill in bed size, bit diameter and max thickness to turn on the checks.', 1),
  ('Mill', 'mill', 'aluminum, al, steel, brass, delrin, acetal, hdpe, polycarbonate, uhmw, nylon', 'Manual mill. Fill in the X/Y travel and Z clearance.', 3),
  ('CNC mill (3-axis)', 'mill', 'aluminum, al, steel, brass, delrin, acetal, hdpe, polycarbonate, uhmw, nylon', 'Fill in the X/Y travel and Z clearance.', 4),
  ('Manual lathe', 'lathe', 'aluminum, al, steel, brass, delrin, acetal, hdpe, nylon, uhmw', 'Fill in the swing and distance between centres.', 5),
  ('Horizontal bandsaw', 'saw', 'aluminum, al, steel, brass, delrin, acetal, hdpe, polycarbonate, uhmw', '', 6),
  ('Vertical bandsaw', 'saw', 'aluminum, al, steel, brass, delrin, acetal, hdpe, polycarbonate, uhmw, plywood, wood', '', 7);

-- Parts / planner settings live on the single fab_settings row.
alter table fab_settings
  -- Onshape custom property that says how a part is made ("Process": Router / Tube / Lathe / 3D print / Mill / COTS)
  add column if not exists onshape_process_prop text not null default 'Process',
  -- only import parts that have that property set (so COTS from linked documents stay out)
  add column if not exists onshape_require_prop boolean not null default true,
  -- gap between nested parts, on top of the tool diameter
  add column if not exists nest_gap_mm numeric not null default 3.175,
  -- keep this far from the edge of a sheet
  add column if not exists nest_margin_mm numeric not null default 12.7;

create trigger fab_designs_updated_at before update on fab_designs
  for each row execute function set_updated_at();
create trigger fab_parts_updated_at before update on fab_parts
  for each row execute function set_updated_at();

alter table fab_designs      enable row level security;
alter table fab_parts        enable row level security;
alter table fab_part_files   enable row level security;
alter table fab_part_events  enable row level security;
alter table fab_machines     enable row level security;

create trigger fab_designs_changed after insert or update or delete on fab_designs
  for each statement execute function notify_board_changed();
create trigger fab_parts_changed after insert or update or delete on fab_parts
  for each statement execute function notify_board_changed();
create trigger fab_part_files_changed after insert or update or delete on fab_part_files
  for each statement execute function notify_board_changed();
create trigger fab_machines_changed after insert or update or delete on fab_machines
  for each statement execute function notify_board_changed();

-- Private bucket for part files. The app hands out short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('fab-files', 'fab-files', false)
on conflict (id) do nothing;
