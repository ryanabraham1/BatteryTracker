-- Tubes and rods: does the part need to be an exact length with perfectly
-- smooth ends, or is an approximate cut fine — and if so, may it come out a
-- little short, a little long, or either way? Null = nobody has said yet.
alter table fab_parts
  add column if not exists length_spec text
    check (length_spec is null or length_spec in ('exact', 'under', 'over', 'any'));
