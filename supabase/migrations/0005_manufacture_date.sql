-- Date printed on the battery by the manufacturer. Distinct from
-- purchase_date: a battery can sit on a shelf for months before it's bought.

alter table batteries add column manufacture_date date;
