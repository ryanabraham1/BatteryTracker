-- IR tiers + 100 A load test.
--
-- IR tiers (from CD "what criteria do you use" thread):
--   comp-ready < ir_warn_mohm  ≤ reserve < ir_practice_mohm  ≤ practice < ir_suspect_mohm
--   ≤ suspect < ir_fail_mohm ≤ retire
-- ir_warn / ir_fail keep their old meaning for the health score; the two new
-- columns split the middle into "practice only" and "suspect".

alter type event_type add value if not exists 'load_test';

alter table settings
  add column if not exists ir_practice_mohm numeric not null default 18,
  add column if not exists ir_suspect_mohm  numeric not null default 23,
  -- 100 A load test: loaded voltage below this is a fail even if it held steady
  add column if not exists load_test_min_v  numeric not null default 10;

-- Retire band was 20; the CD consensus is 25 with 23–24 as "suspect".
update settings set ir_fail_mohm = 25 where id = 1 and ir_fail_mohm = 20;
