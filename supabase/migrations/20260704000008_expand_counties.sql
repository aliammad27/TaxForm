-- Phase 3 expansion: Chester (Tier A), Bedford, Forest, Franklin (Tier B).
-- CLRs from STEB 2024-certified publication. Appeal windows and mailing
-- addresses verified against county board pages (2026-07-04).

insert into public.common_level_ratio (county, tax_year, ratio, source)
values
  ('Chester',  2026, 0.3184, 'STEB'),
  ('Bedford',  2026, 0.5452, 'STEB'),
  ('Forest',   2026, 0.1305, 'STEB'),
  ('Franklin', 2026, 0.0768, 'STEB')
on conflict (county, tax_year) do update
  set ratio = excluded.ratio, source = excluded.source, updated_at = now();

insert into public.appeal_windows
  (county, tax_year, board_name, open_date, close_date, portal_url, mailing_address)
values
  ('Chester', 2026, 'Chester County Board of Assessment Appeals', null, '2025-08-01',
   'https://www.chesco.org/3584/Assessment-Appeals',
   '313 West Market Street, Suite 4202, West Chester, PA 19382'),
  ('Chester', 2027, 'Chester County Board of Assessment Appeals', null, '2026-08-01',
   'https://www.chesco.org/3584/Assessment-Appeals',
   '313 West Market Street, Suite 4202, West Chester, PA 19382'),
  ('Bedford', 2026, 'Bedford County Board of Assessment Appeals', null, '2025-08-01',
   'https://www.bedfordcountypa.org/departments/assessment',
   '200 South Juliana Street, Bedford, PA 15522'),
  ('Bedford', 2027, 'Bedford County Board of Assessment Appeals', null, '2026-08-01',
   'https://www.bedfordcountypa.org/departments/assessment',
   '200 South Juliana Street, Bedford, PA 15522'),
  ('Forest', 2026, 'Forest County Board of Assessment Appeals', null, '2025-08-01',
   'https://www.forestcountypa.gov/',
   '526 Elm Street, Tionesta, PA 16353'),
  ('Forest', 2027, 'Forest County Board of Assessment Appeals', null, '2026-08-01',
   'https://www.forestcountypa.gov/',
   '526 Elm Street, Tionesta, PA 16353'),
  ('Franklin', 2026, 'Franklin County Board of Assessment Appeals', null, '2025-08-01',
   'https://www.franklincountypa.gov/',
   '272 North Second Street, Chambersburg, PA 17201'),
  ('Franklin', 2027, 'Franklin County Board of Assessment Appeals', null, '2026-08-01',
   'https://www.franklincountypa.gov/',
   '272 North Second Street, Chambersburg, PA 17201')
on conflict (county, tax_year) do update set
  board_name = excluded.board_name,
  open_date = excluded.open_date,
  close_date = excluded.close_date,
  portal_url = excluded.portal_url,
  mailing_address = excluded.mailing_address;

update public.county_data_status
set onboarded_at = now(),
    has_parcel_data = true,
    has_sales_data = case when county = 'Chester' then true else has_sales_data end,
    updated_at = now()
where county in ('Chester', 'Bedford', 'Forest', 'Franklin');

-- Chester is Tier A (assessed + sales); mark sales for Franklin too (layer has SLH_PRICE).
update public.county_data_status
set has_sales_data = true, updated_at = now()
where county in ('Franklin');
