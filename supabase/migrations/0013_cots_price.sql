-- Unit price on COTS BOM lines, for the buy list exported to Sheets
-- (Name, Link, Part #, Qty, Unit price, Total).
alter table fab_parts add column if not exists unit_price numeric check (unit_price is null or unit_price >= 0);
