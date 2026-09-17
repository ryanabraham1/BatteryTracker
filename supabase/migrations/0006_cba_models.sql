-- Knobs for the CBA-derived health models (lib/cba.ts).
-- peukert_k: exponent for rate-correcting rated Ah on high-current tests
--   (C_eff = C · (I20 / I)^(k-1)); ~1.2 for SLA, ~1.05 for lithium, 1.0 disables.
-- cba_max_temp_c: external-probe battery temperature that triggers a warning.
alter table settings
  add column if not exists peukert_k numeric not null default 1.2,
  add column if not exists cba_max_temp_c numeric not null default 50;
