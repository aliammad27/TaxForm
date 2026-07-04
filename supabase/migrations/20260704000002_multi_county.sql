-- Multi-county foundation (Phase 1 of the PA statewide build):
--   * county column on parcels / appeal_outcomes
--   * common_level_ratio re-keyed to (county, tax_year) — shared STEB table
--   * appeal_windows, millage_rates, county_data_status reference tables
--   * comp_candidates() scoped strictly within the subject parcel's county

-- County columns ---------------------------------------------------------------

alter table public.parcels
  add column county text not null default 'Allegheny';
alter table public.appeal_outcomes
  add column county text not null default 'Allegheny';

create index parcels_county_idx on public.parcels (county);
create index appeal_outcomes_county_idx on public.appeal_outcomes (county);

-- Common Level Ratio: one shared STEB table keyed by county ---------------------

alter table public.common_level_ratio
  add column county text not null default 'Allegheny';
alter table public.common_level_ratio
  drop constraint common_level_ratio_pkey;
alter table public.common_level_ratio
  add primary key (county, tax_year);

-- Appeal windows: per-county, per-tax-year filing periods ------------------------

create table public.appeal_windows (
  county text not null,
  tax_year int not null,
  board_name text,
  open_date date,
  close_date date,
  portal_url text,
  primary key (county, tax_year)
);

-- Millage rates: per municipality + school district, entered annually -----------

create table public.millage_rates (
  county text not null,
  municipality text not null,
  school_district text not null,
  tax_year int not null,
  county_mills numeric,
  municipal_mills numeric,
  school_mills numeric,
  primary key (county, municipality, school_district, tax_year)
);

create index millage_rates_county_idx on public.millage_rates (county, tax_year);

-- County data status: the statewide survey / rollout tracker --------------------

create table public.county_data_status (
  county text primary key,
  data_tier text check (data_tier in ('A', 'B', 'C')),
  wedge_strength text check (wedge_strength in ('strong', 'moderate', 'weak')),
  has_parcel_data boolean not null default false,
  has_sales_data boolean not null default false,
  has_appeal_outcomes boolean not null default false,
  onboarded_at timestamptz,
  notes text,
  updated_at timestamptz not null default now()
);

-- RLS: public reference data, same posture as common_level_ratio ----------------

alter table public.appeal_windows enable row level security;
alter table public.millage_rates enable row level security;
alter table public.county_data_status enable row level security;

create policy "appeal windows public read" on public.appeal_windows
  for select using (true);
create policy "millage rates public read" on public.millage_rates
  for select using (true);
create policy "county data status public read" on public.county_data_status
  for select using (true);

-- comp_candidates: never leak comps across county lines --------------------------

create or replace function public.comp_candidates(
  p_parid text,
  p_limit int default 20
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
      and sale_date >= (current_date - interval '3 years')
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

-- Seed: Allegheny appeal windows (verified July 2026 against
-- alleghenycounty.us; deadline slips a day when Sept 1 is Labor Day) ------------

insert into public.appeal_windows
  (county, tax_year, board_name, open_date, close_date, portal_url)
values
  ('Allegheny', 2026, 'Board of Property Assessment Appeals and Review (BPAAR)',
   '2025-07-01', '2025-09-02',
   'https://www.alleghenycounty.us/Services/Property-Assessments-and-Real-Estate/Appeals/Annual-Appeals'),
  ('Allegheny', 2027, 'Board of Property Assessment Appeals and Review (BPAAR)',
   '2026-07-01', '2026-09-01',
   'https://www.alleghenycounty.us/Services/Property-Assessments-and-Real-Estate/Appeals/Annual-Appeals')
on conflict (county, tax_year) do update set
  board_name = excluded.board_name,
  open_date = excluded.open_date,
  close_date = excluded.close_date,
  portal_url = excluded.portal_url;

-- Seed: Allegheny county_data_status (already onboarded) -------------------------

insert into public.county_data_status
  (county, data_tier, wedge_strength, has_parcel_data, has_sales_data,
   has_appeal_outcomes, onboarded_at, notes)
values
  ('Allegheny', 'B', 'strong', true, true, true, now(),
   'Onboarded via WPRDC open data portal (parcels, sales, BPAAR dispositions). CLR wedge verified; ~40k historical outcomes power the trained adjudication model.')
on conflict (county) do nothing;
