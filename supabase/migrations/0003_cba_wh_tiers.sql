-- CBA capacity tiers in Wh (what the Andymark CBA actually reports).
-- A-tier ≥ cba_a_wh, B-tier ≥ cba_b_wh, C-tier below. Only used when a
-- cba_test event has `measured_wh`; older Ah-only tests keep the % thresholds.
alter table settings
  add column if not exists cba_a_wh numeric not null default 130,
  add column if not exists cba_b_wh numeric not null default 120;
