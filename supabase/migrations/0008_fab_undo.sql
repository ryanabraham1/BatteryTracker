-- Undo for fab stock log entries. `undo` holds before/after snapshots of the
-- pieces and orders an entry touched ({pieces: [{before, after}], orders: [...]};
-- before = null means the entry created the row, after = null that it deleted
-- it). Undo restores `before` only while the rows still match `after`.
alter table fab_events
  add column if not exists undo jsonb,
  add column if not exists undone_at timestamptz;
