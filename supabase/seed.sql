-- Common Level Ratio (STEB), keyed by (county, tax_year).
insert into public.common_level_ratio (county, tax_year, ratio, source)
values
  ('Allegheny', 2021, 0.8110, 'STEB'),
  ('Allegheny', 2022, 0.6353, 'STEB (litigated value)'),
  ('Allegheny', 2023, 0.6353, 'STEB'),
  ('Allegheny', 2024, 0.5450, 'STEB'),
  ('Allegheny', 2025, 0.5270, 'STEB'),
  ('Allegheny', 2026, 0.5014, 'STEB')
on conflict (county, tax_year) do update set ratio = excluded.ratio, source = excluded.source;

-- Allegheny parcel + sales fixture (~440 rows) for working search out of the box.
\ir fixtures/parcel-fixture.sql
