-- Fab stock: raw material the team cuts and machines (tube, bar, angle,
-- channel, rod, hex shaft, sheet/plate). Every length is stored in mm; the app
-- shows inches or mm per viewer.

create table fab_locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  -- 'pit' locations travel to competitions (pit kit + comp mode view)
  kind        text not null default 'shop' check (kind in ('shop', 'pit')),
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
insert into fab_locations (name, kind, sort) values
  ('Tube rack', 'shop', 1),
  ('Sheet cart', 'shop', 2),
  ('Offcut bin', 'shop', 3),
  ('Pit cart', 'pit', 4);

create table fab_materials (
  id              uuid primary key default gen_random_uuid(),
  material        text not null,               -- '6061 Al', 'Polycarbonate', …
  shape           text not null check (shape in
                    ('box_tube', 'round_tube', 'flat_bar', 'angle', 'channel', 'round_rod', 'hex_shaft', 'sheet')),
  -- the system the stock is sold in, so sizes read the way they're ordered (1/16 wall vs 1.5 mm)
  system          text not null default 'in' check (system in ('in', 'mm')),
  dim_a_mm        numeric,  -- width / OD / diameter / across flats
  dim_b_mm        numeric,  -- height (box tube, angle, channel)
  wall_mm         numeric,  -- wall (tube) or thickness (bar, angle, channel, sheet)
  full_length_mm  numeric,  -- length of a new stick / sheet as bought
  full_width_mm   numeric,  -- sheet only
  vendor          text not null default '',
  vendor_part     text not null default '',
  url             text not null default '',
  unit_cost       numeric,  -- per full stick / sheet
  min_amount      numeric,  -- low-stock line: total mm (linear) or mm² (sheet)
  notes           text not null default '',
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table fab_pieces (
  id           uuid primary key default gen_random_uuid(),
  material_id  uuid not null references fab_materials (id) on delete cascade,
  length_mm    numeric not null check (length_mm > 0),
  width_mm     numeric check (width_mm is null or width_mm > 0),  -- sheet only
  has_cutouts  boolean not null default false,
  location_id  uuid references fab_locations (id) on delete set null,
  status       text not null default 'stock' check (status in ('stock', 'used', 'scrapped')),
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index fab_pieces_material_idx on fab_pieces (material_id) where status = 'stock';

create table fab_events (
  id           uuid primary key default gen_random_uuid(),
  material_id  uuid not null references fab_materials (id) on delete cascade,
  piece_id     uuid references fab_pieces (id) on delete set null,
  type         text not null check (type in ('receive', 'cut', 'move', 'edit', 'scrap', 'order')),
  data         jsonb not null default '{}'::jsonb,
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index fab_events_occurred_idx on fab_events (occurred_at desc);
create index fab_events_material_idx on fab_events (material_id, occurred_at desc);

create table fab_orders (
  id             uuid primary key default gen_random_uuid(),
  material_id    uuid not null references fab_materials (id) on delete cascade,
  quantity       int not null default 1 check (quantity > 0),
  length_mm      numeric,
  width_mm       numeric,
  status         text not null default 'needed' check (status in ('needed', 'ordered', 'received')),
  expected_date  date,
  notes          text not null default '',
  received_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table fab_kits (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table fab_kit_items (
  id             uuid primary key default gen_random_uuid(),
  kit_id         uuid not null references fab_kits (id) on delete cascade,
  material_id    uuid not null references fab_materials (id) on delete cascade,
  count          int not null default 1 check (count > 0),
  min_length_mm  numeric,
  min_width_mm   numeric,
  created_at     timestamptz not null default now()
);

-- Single-row fab settings (id is always 1)
create table fab_settings (
  id            int primary key default 1 check (id = 1),
  kerf_mm       numeric not null default 3.175,  -- blade width lost per cut (1/8")
  scrap_min_mm  numeric not null default 152.4,  -- offer to toss leftovers shorter than this (6")
  updated_at    timestamptz not null default now()
);
insert into fab_settings (id) values (1);

create trigger fab_materials_updated_at before update on fab_materials
  for each row execute function set_updated_at();
create trigger fab_pieces_updated_at before update on fab_pieces
  for each row execute function set_updated_at();
create trigger fab_orders_updated_at before update on fab_orders
  for each row execute function set_updated_at();
create trigger fab_settings_updated_at before update on fab_settings
  for each row execute function set_updated_at();

-- Locked down like the battery tables: the app uses the service role only.
alter table fab_locations  enable row level security;
alter table fab_materials  enable row level security;
alter table fab_pieces     enable row level security;
alter table fab_events     enable row level security;
alter table fab_orders     enable row level security;
alter table fab_kits       enable row level security;
alter table fab_kit_items  enable row level security;
alter table fab_settings   enable row level security;

-- Same "changed" ping on the board topic so every phone refreshes.
create trigger fab_locations_changed after insert or update or delete on fab_locations
  for each statement execute function notify_board_changed();
create trigger fab_materials_changed after insert or update or delete on fab_materials
  for each statement execute function notify_board_changed();
create trigger fab_pieces_changed after insert or update or delete on fab_pieces
  for each statement execute function notify_board_changed();
create trigger fab_orders_changed after insert or update or delete on fab_orders
  for each statement execute function notify_board_changed();
create trigger fab_kits_changed after insert or update or delete on fab_kits
  for each statement execute function notify_board_changed();
create trigger fab_kit_items_changed after insert or update or delete on fab_kit_items
  for each statement execute function notify_board_changed();
create trigger fab_settings_changed after update on fab_settings
  for each statement execute function notify_board_changed();
