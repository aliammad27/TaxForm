-- York County onboarding (Phase 3 of the PA statewide build):
--   * comp_candidates() gains a sale-recency parameter (county adapters pass
--     a wider window when the county's data snapshot is older)
--   * York CLR, appeal window, millage rates, county_data_status

-- comp_candidates: parameterized sale-recency window ----------------------------
-- York's free PASDA parcel snapshot is dated Sept 2022, so its adapter widens
-- the sale window and relies on market-time adjustments; Allegheny keeps the
-- default 3 years. Dropped and recreated because the signature changes.

drop function public.comp_candidates(text, int);

create function public.comp_candidates(
  p_parid text,
  p_limit int default 20,
  p_max_sale_age_years int default 3
)
returns table (
  parid text,
  full_address text,
  muni_desc text,
  school_desc text,
  class text,
  finished_living_area numeric,
  bedrooms int,
  full_baths int,
  half_baths int,
  year_built int,
  condition_desc text,
  grade_desc text,
  county_total numeric,
  sale_date date,
  sale_price numeric,
  distance double precision
)
language sql
stable
as $$
  with subject as (
    select * from public.parcels where public.parcels.parid = p_parid
  )
  select
    p.parid,
    p.full_address,
    p.muni_desc,
    p.school_desc,
    p.class,
    p.finished_living_area,
    p.bedrooms,
    p.full_baths,
    p.half_baths,
    p.year_built,
    p.condition_desc,
    p.grade_desc,
    p.county_total,
    s.sale_date,
    s.sale_price,
    (p.embedding operator(extensions.<->) (select embedding from subject))::double precision as distance
  from public.parcels p
  join lateral (
    select sale_date, sale_price
    from public.sales
    where sales.parid = p.parid
      and is_valid_sale
      and sale_price > 1000
      and sale_date >= (current_date - make_interval(years => p_max_sale_age_years))
    order by sale_date desc
    limit 1
  ) s on true
  cross join subject
  where p.parid <> subject.parid
    and p.county = subject.county
    and p.class = subject.class
    and (p.muni_code = subject.muni_code or p.school_code = subject.school_code)
    and p.embedding is not null
    and subject.embedding is not null
    and (
      subject.finished_living_area is null
      or p.finished_living_area between subject.finished_living_area * 0.6
                                    and subject.finished_living_area * 1.4
    )
  order by p.embedding operator(extensions.<->) subject.embedding
  limit p_limit;
$$;

-- York CLR (STEB, certified 2024 ratios used for appeals Jul 2025 - Jun 2026;
-- the county board itself cites 50.46) ------------------------------------------

insert into public.common_level_ratio (county, tax_year, ratio, source)
values ('York', 2026, 0.5046, 'STEB (cited by York County Board of Assessment Appeals)')
on conflict (county, tax_year) do update
  set ratio = excluded.ratio, source = excluded.source, updated_at = now();

-- York appeal window: annual appeals accepted year-round, but must be filed by
-- close of business Aug 1 to take effect the following tax year (York County
-- Code ch. 145; verified against yorkcountypa.gov July 2026) --------------------

insert into public.appeal_windows
  (county, tax_year, board_name, open_date, close_date, portal_url)
values
  ('York', 2026, 'York County Board of Assessment Appeals', null, '2025-08-01',
   'https://yorkcountypa.gov/707/Assessment-Appeals'),
  ('York', 2027, 'York County Board of Assessment Appeals', null, '2026-08-01',
   'https://yorkcountypa.gov/707/Assessment-Appeals')
on conflict (county, tax_year) do update set
  board_name = excluded.board_name,
  open_date = excluded.open_date,
  close_date = excluded.close_date,
  portal_url = excluded.portal_url;

-- York millage rates, tax year 2025 (parsed from the county treasurer's
-- "2025 York County Millage Rates" PDF; municipal_mills includes secondary
-- levies like fire taxes; municipality matches parcels.muni_desc, school
-- district matches parcels.school_desc). Newberry Twp and Springettsbury Twp
-- each span two school districts, hence two rows. -------------------------------

insert into public.millage_rates
  (county, municipality, school_district, tax_year,
   county_mills, municipal_mills, school_mills)
values
  ('York', 'CARROLL TWP', 'Northern', 2025, 6.9, 3.21, 20.1337),
  ('York', 'CHANCEFORD TWP', 'Red Lion', 2025, 6.9, 0.6, 23.2594),
  ('York', 'CODORUS TWP', 'Southern', 2025, 6.9, 0.6, 19.91),
  ('York', 'CONEWAGO TWP', 'Northeastern', 2025, 6.9, 1.58, 27.46),
  ('York', 'CROSS ROADS BORO', 'Southeastern', 2025, 6.9, 0.36, 22.2503),
  ('York', 'DALLASTOWN BORO', 'Dallastown', 2025, 6.9, 2.15, 25.6861),
  ('York', 'DELTA BORO', 'Southeastern', 2025, 6.9, 5.5, 22.2503),
  ('York', 'DILLSBURG BORO', 'Northern', 2025, 6.9, 2.87, 20.1337),
  ('York', 'DOVER BORO', 'Dover', 2025, 6.9, 3.94, 24.307),
  ('York', 'DOVER TWP', 'Dover', 2025, 6.9, 1.6, 24.307),
  ('York', 'EAST HOPEWELL TWP', 'Southeastern', 2025, 6.9, 1.0, 22.2503),
  ('York', 'EAST MANCHESTER TWP', 'Northeastern', 2025, 6.9, 1.04, 27.46),
  ('York', 'EAST PROSPECT BORO', 'Eastern', 2025, 6.9, 2.27, 26.43),
  ('York', 'FAIRVIEW TWP', 'West Shore', 2025, 6.9, 1.98, 17.3022),
  ('York', 'FAWN GROVE BORO', 'Southeastern', 2025, 6.9, 2.0, 22.2503),
  ('York', 'FAWN TWP', 'Southeastern', 2025, 6.9, 0.75, 22.2503),
  ('York', 'FELTON BORO', 'Red Lion', 2025, 6.9, 3.0, 23.2594),
  ('York', 'FRANKLIN TWP', 'Northern', 2025, 6.9, 1.19, 20.1337),
  ('York', 'FRANKLINTOWN BORO', 'Northern', 2025, 6.9, 2.07, 20.1337),
  ('York', 'GLEN ROCK BORO', 'Southern', 2025, 6.9, 4.45, 19.91),
  ('York', 'GOLDSBORO BORO', 'West Shore', 2025, 6.9, 1.1, 17.3022),
  ('York', 'HALLAM BORO', 'Eastern', 2025, 6.9, 6.07, 26.43),
  ('York', 'HANOVER BORO', 'Hanover', 2025, 6.9, 6.65, 23.06),
  ('York', 'HEIDELBERG TWP', 'Spring Grove', 2025, 6.9, 2.25, 24.4535),
  ('York', 'HELLAM TWP', 'Eastern', 2025, 6.9, 3.1, 26.43),
  ('York', 'HOPEWELL TWP', 'Southeastern', 2025, 6.9, 0.21, 22.2503),
  ('York', 'JACKSON TWP', 'Spring Grove', 2025, 6.9, 1.8, 24.4535),
  ('York', 'JACOBUS BORO', 'Dallastown', 2025, 6.9, 2.0, 25.6861),
  ('York', 'JEFFERSON BORO', 'Spring Grove', 2025, 6.9, 4.5, 24.4535),
  ('York', 'LEWISBERRY BORO', 'West Shore', 2025, 6.9, 1.8, 17.3022),
  ('York', 'LOGANVILLE BORO', 'Dallastown', 2025, 6.9, 1.0, 25.6861),
  ('York', 'LOWER CHANCEFORD TWP', 'Red Lion', 2025, 6.9, 1.2, 23.2594),
  ('York', 'LOWER WINDSOR TWP', 'Eastern', 2025, 6.9, 2.0, 26.43),
  ('York', 'MANCHESTER BORO', 'Northeastern', 2025, 6.9, 2.9, 27.46),
  ('York', 'MANCHESTER TWP', 'Central', 2025, 6.9, 1.0, 22.7448),
  ('York', 'MANHEIM TWP', 'Southwestern', 2025, 6.9, 1.65, 22.4),
  ('York', 'MONAGHAN TWP', 'Northern', 2025, 6.9, 1.5, 20.1337),
  ('York', 'MOUNT WOLF BORO', 'Northeastern', 2025, 6.9, 5.5, 27.46),
  ('York', 'NEW FREEDOM BORO', 'Southern', 2025, 6.9, 2.58, 19.91),
  ('York', 'NEW SALEM BORO', 'Spring Grove', 2025, 6.9, 1.5, 24.4535),
  ('York', 'NEWBERRY TWP', 'Northeastern', 2025, 6.9, 3.5, 27.46),
  ('York', 'NEWBERRY TWP', 'West Shore', 2025, 6.9, 3.5, 17.3022),
  ('York', 'NORTH CODORUS TWP', 'Spring Grove', 2025, 6.9, 2.0, 24.4535),
  ('York', 'NORTH HOPEWELL TWP', 'Red Lion', 2025, 6.9, 1.349, 23.2594),
  ('York', 'NORTH YORK BORO', 'Central', 2025, 6.9, 8.0, 22.7448),
  ('York', 'PARADISE TWP', 'Spring Grove', 2025, 6.9, 2.0, 24.4535),
  ('York', 'PEACH BOTTOM TWP', 'Southeastern', 2025, 6.9, 0.97, 22.2503),
  ('York', 'PENN TWP', 'Southwestern', 2025, 6.9, 4.4, 22.4),
  ('York', 'RAILROAD BORO', 'Southern', 2025, 6.9, 0.69, 19.91),
  ('York', 'RED LION BORO', 'Red Lion', 2025, 6.9, 4.4, 23.2594),
  ('York', 'SEVEN VALLEYS BORO', 'Spring Grove', 2025, 6.9, 1.2, 24.4535),
  ('York', 'SHREWSBURY BORO', 'Southern', 2025, 6.9, 2.12, 19.91),
  ('York', 'SHREWSBURY TWP', 'Southern', 2025, 6.9, 0.534, 19.91),
  ('York', 'SPRING GARDEN TWP', 'York Suburban', 2025, 6.9, 4.376, 26.5848),
  ('York', 'SPRING GROVE BORO', 'Spring Grove', 2025, 6.9, 6.0, 24.4535),
  ('York', 'SPRINGETTSBURY TWP', 'Central', 2025, 6.9, 1.5, 22.7448),
  ('York', 'SPRINGETTSBURY TWP', 'York Suburban', 2025, 6.9, 1.5, 26.5848),
  ('York', 'SPRINGFIELD TWP', 'Dallastown', 2025, 6.9, 1.25, 25.6861),
  ('York', 'STEWARTSTOWN BORO', 'Southeastern', 2025, 6.9, 2.85, 22.2503),
  ('York', 'WARRINGTON TWP', 'Northern', 2025, 6.9, 0.21, 20.1337),
  ('York', 'WASHINGTON TWP', 'Northern', 2025, 6.9, 0.45, 20.1337),
  ('York', 'WELLSVILLE BORO', 'Northern', 2025, 6.9, 0.42, 20.1337),
  ('York', 'WEST MANCHESTER TWP', 'West York', 2025, 6.9, 1.75, 25.0716),
  ('York', 'WEST MANHEIM TWP', 'Southwestern', 2025, 6.9, 4.1, 22.4),
  ('York', 'WEST YORK BORO', 'West York', 2025, 6.9, 17.5, 25.0716),
  ('York', 'WINDSOR BORO', 'Red Lion', 2025, 6.9, 2.8, 23.2594),
  ('York', 'WINDSOR TWP', 'Red Lion', 2025, 6.9, 1.1, 23.2594),
  ('York', 'WINTERSTOWN BORO', 'Red Lion', 2025, 6.9, 1.1, 23.2594),
  ('York', 'WRIGHTSVILLE BORO', 'Eastern', 2025, 6.9, 6.0, 26.43),
  ('York', 'YOE BORO', 'Dallastown', 2025, 6.9, 4.407, 25.6861),
  ('York', 'YORK CITY', 'York City', 2025, 6.9, 18.97, 37.3093),
  ('York', 'YORK HAVEN BORO', 'Northeastern', 2025, 6.9, 7.5, 27.46),
  ('York', 'YORK TWP', 'Dallastown', 2025, 6.9, 1.74, 25.6861),
  ('York', 'YORKANA BORO', 'Eastern', 2025, 6.9, 0.25, 26.43)
on conflict (county, municipality, school_district, tax_year) do update set
  county_mills = excluded.county_mills,
  municipal_mills = excluded.municipal_mills,
  school_mills = excluded.school_mills;

-- Mark York onboarded ------------------------------------------------------------

update public.county_data_status
set onboarded_at = now(),
    has_parcel_data = true,
    has_sales_data = true,
    notes = coalesce(notes, '') || ' Onboarded via PASDA YorkCounty MapServer (parcels + sales, Sept 2022 snapshot); millage from county treasurer 2025 PDF; CLR 50.46 per county board.',
    updated_at = now()
where county = 'York';
