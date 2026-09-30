-- 1. Sheet stock: mark parts of a sheet that can't be used (cut out, gouged,
--    warped). Each zone is a rectangle in mm, measured from the sheet's corner:
--    [{x, y, w, h}] with x along the length and y across the width. The
--    stock pages subtract them from what's on hand and only suggest a sheet
--    for a need that fits in its clean area.
alter table fab_pieces
  add column if not exists dead_zones jsonb not null default '[]'::jsonb;

-- 2. Fab tracker: the team's Machining / 3D Printing tracker sheets, one row
--    per part to make. Columns follow the sheet; lists (bots, subsystems,
--    machines, materials) are free text with suggestions so a new robot or
--    subsystem never needs a schema change.
create table fab_jobs (
  id                 uuid primary key default gen_random_uuid(),
  tracker            text not null default 'machining' check (tracker in ('machining', 'print')),
  status             text not null default 'not_started' check (status in
                       ('not_started', 'have_cam', 'in_progress', 'finished', 'spares_needed',
                        'spares_finished', 'outsourced', 'not_needed')),
  status_changed_at  timestamptz not null default now(),
  bot                text not null default '',
  subsystem          text not null default '',
  name               text not null,
  priority           int check (priority between 0 and 4),   -- #0 = most urgent
  qty                int not null default 1 check (qty >= 0),
  spare_qty          int not null default 0 check (spare_qty >= 0),
  -- machining: stock material/type ("Aluminum Sheet"); 3D printing: filament ("PLA (Bambu)")
  material           text not null default '',
  stock_dims         text not null default '',   -- '1/8" thick', '1/2 diam shaft'
  length             text not null default '',
  tapped             text not null default '',
  machine            text not null default '',
  infill             text not null default '',   -- 3D printing
  designer           text not null default '',   -- 3D printing
  dri                text not null default '',   -- who's responsible
  file               text not null default '',   -- drawing / CAM / STEP / STL: a file name or a link
  notes              text not null default '',
  linear_url         text not null default '',
  -- optional link to the rack, so the row can say whether the stock is on hand
  material_id        uuid references fab_materials (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index fab_jobs_tracker_idx on fab_jobs (tracker, status);

create trigger fab_jobs_updated_at before update on fab_jobs
  for each row execute function set_updated_at();
alter table fab_jobs enable row level security;
create trigger fab_jobs_changed after insert or update or delete on fab_jobs
  for each statement execute function notify_board_changed();
