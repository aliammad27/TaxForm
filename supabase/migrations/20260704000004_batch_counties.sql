-- Phase 4 batch onboarding: Cumberland, Montgomery, Butler, Indiana, Juniata
-- (all Tier A — PASDA layers carry assessed values + sales).
-- CLRs from the STEB 2024-certified publication (used Jul 2025 - Jun 2026).
-- Deadlines per each county board: Aug 1 (Butler, Indiana, Montgomery) or
-- Sept 1 (Cumberland, Juniata); filings accepted year-round, effective the
-- following tax year.

insert into public.common_level_ratio (county, tax_year, ratio, source)
values
  ('Cumberland', 2026, 0.6780, 'STEB'),
  ('Montgomery', 2026, 0.3076, 'STEB'),
  ('Butler',     2026, 0.0600, 'STEB'),
  ('Indiana',    2026, 0.7532, 'STEB'),
  ('Juniata',    2026, 0.0811, 'STEB')
on conflict (county, tax_year) do update
  set ratio = excluded.ratio, source = excluded.source, updated_at = now();

insert into public.appeal_windows
  (county, tax_year, board_name, open_date, close_date, portal_url)
values
  ('Cumberland', 2026, 'Cumberland County Board of Assessment Appeals', null, '2025-09-01',
   'https://www.cumberlandcountypa.gov/3713/Property-Appeal-Information'),
  ('Cumberland', 2027, 'Cumberland County Board of Assessment Appeals', null, '2026-09-01',
   'https://www.cumberlandcountypa.gov/3713/Property-Appeal-Information'),
  ('Montgomery', 2026, 'Montgomery County Board of Assessment Appeals', null, '2025-08-01',
   'https://www.montgomerycountypa.gov/173/Board-of-Assessment-Appeals'),
  ('Montgomery', 2027, 'Montgomery County Board of Assessment Appeals', null, '2026-08-01',
   'https://www.montgomerycountypa.gov/173/Board-of-Assessment-Appeals'),
  ('Butler', 2026, 'Butler County Board of Assessment Appeals', null, '2025-08-01',
   'https://www.butlercountypa.gov/328/Assessment'),
  ('Butler', 2027, 'Butler County Board of Assessment Appeals', null, '2026-08-01',
   'https://www.butlercountypa.gov/328/Assessment'),
  ('Indiana', 2026, 'Indiana County Board of Assessment Appeals', null, '2025-08-01',
   'https://www.indianacountypa.gov/departments/tax-assessment/assessment-and-appeal-process/'),
  ('Indiana', 2027, 'Indiana County Board of Assessment Appeals', null, '2026-08-01',
   'https://www.indianacountypa.gov/departments/tax-assessment/assessment-and-appeal-process/'),
  ('Juniata', 2026, 'Juniata County Board of Assessment Appeals', null, '2025-09-01',
   'https://www.juniataco.org/departments/assessment/'),
  ('Juniata', 2027, 'Juniata County Board of Assessment Appeals', null, '2026-09-01',
   'https://www.juniataco.org/departments/assessment/')
on conflict (county, tax_year) do update set
  board_name = excluded.board_name,
  open_date = excluded.open_date,
  close_date = excluded.close_date,
  portal_url = excluded.portal_url;

update public.county_data_status
set onboarded_at = now(),
    has_parcel_data = true,
    has_sales_data = true,
    updated_at = now()
where county in ('Cumberland', 'Montgomery', 'Butler', 'Indiana', 'Juniata');
