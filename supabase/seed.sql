-- Common Level Ratio for Allegheny County (STEB), by tax year.
insert into public.common_level_ratio (tax_year, ratio, source)
values
  (2021, 0.8110, 'STEB'),
  (2022, 0.6353, 'STEB (litigated value)'),
  (2023, 0.6353, 'STEB'),
  (2024, 0.5450, 'STEB'),
  (2025, 0.5270, 'STEB'),
  (2026, 0.5014, 'STEB')
on conflict (tax_year) do update set ratio = excluded.ratio, source = excluded.source;
