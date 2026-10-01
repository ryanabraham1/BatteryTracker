-- Some COTS is sold in packs (WCP spacers come 5 to a pack). With the pack
-- size known, the buy list orders packs: 8 needed of a 5-pack = 2 to buy.
alter table fab_parts add column if not exists pack_size int check (pack_size is null or pack_size > 0);
