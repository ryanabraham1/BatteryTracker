-- Remove the `cooling` battery state: batteries come off the robot and go
-- straight onto the charger. Postgres can't drop an enum value in place, so
-- migrate rows, then rebuild the type.

update batteries set state = 'charging', state_changed_at = now() where state = 'cooling';

alter type battery_state rename to battery_state_old;
create type battery_state as enum ('ready', 'in_robot', 'charging', 'needs_attention');
alter table batteries alter column state drop default;
alter table batteries alter column state type battery_state using state::text::battery_state;
alter table batteries alter column state set default 'ready';
drop type battery_state_old;
