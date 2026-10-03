-- Fab stock: the sheet sizes from the team's "Standard Stock List" that we can
-- fabricate (the green / yellow cells) as materials on the rack. Only the
-- material and thickness are known, so full sheet size, vendor and cost stay
-- blank, and no pieces are added — receive them as they arrive. Skips a size
-- if the rack already has that material at that thickness.
insert into fab_materials (material, shape, system, wall_mm)
select v.material, 'sheet', 'in', v.wall_mm
from (values
  ('Aluminum',      6.35,    '(alum|606|707|\mal\M)'),  -- 1/4"
  ('Aluminum',      4.7625,  '(alum|606|707|\mal\M)'),  -- 3/16"
  ('Aluminum',      3.175,   '(alum|606|707|\mal\M)'),  -- 1/8"
  ('Aluminum',      1.5875,  '(alum|606|707|\mal\M)'),  -- 1/16"
  ('Polycarbonate', 3.175,   '(polycarb|lexan)'),       -- 1/8"
  ('Polycarbonate', 2.38125, '(polycarb|lexan)'),       -- 3/32"
  ('Polycarbonate', 1.5875,  '(polycarb|lexan)'),       -- 1/16"
  ('SRPP',          6.35,    '(srpp|polyprop)')         -- 1/4"
) as v(material, wall_mm, family)
where not exists (
  select 1 from fab_materials m
  where m.shape = 'sheet'
    and abs(coalesce(m.wall_mm, 0) - v.wall_mm) < 0.1
    and m.material ~* v.family
);
