-- Allegheny County Property Tax Appeal Platform - core schema
-- Extensions ---------------------------------------------------------------

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Enums ---------------------------------------------------------------------

create type public.client_tier as enum (
  'residential_diy',
  'commercial_contingency',
  'full_service'
);

create type public.client_role as enum ('client', 'admin');

create type public.appeal_status as enum (
  'draft',
  'ready_to_file',
  'filed',
  'hearing_scheduled',
  'decided',
  'withdrawn'
);

create type public.document_type as enum (
  'rent_roll',
  't12',
  'photo',
  'appeal_letter',
  'other'
);

create type public.processing_status as enum (
  'pending',
  'processing',
  'processed',
  'failed'
);

-- Reference data ------------------------------------------------------------

-- Parcels: one row per Allegheny County parcel (WPRDC property assessments).
create table public.parcels (
  parid text primary key,
  house_num text,
  fraction text,
  address text,
  unit text,
  city text,
  state text,
  zip text,
  muni_code text,
  muni_desc text,
  school_code text,
  school_desc text,
  neigh_code text,
  neigh_desc text,
  tax_code text,
  class text,
  class_desc text,
  use_code text,
  use_desc text,
  lot_area numeric,
  homestead boolean default false,
  -- assessment values
  county_building numeric,
  county_land numeric,
  county_total numeric,        -- current (base-year 2012) assessed value
  local_total numeric,
  fair_market_building numeric,
  fair_market_land numeric,
  fair_market_total numeric,   -- county's full market value opinion
  -- residential building characteristics
  style_desc text,
  stories numeric,
  year_built int,
  exterior_desc text,
  roof_desc text,
  basement_desc text,
  grade text,
  grade_desc text,
  condition text,
  condition_desc text,
  total_rooms int,
  bedrooms int,
  full_baths int,
  half_baths int,
  heating_cooling_desc text,
  fireplaces int,
  basement_garage int,
  finished_living_area numeric,
  latitude double precision,
  longitude double precision,
  tax_year int,
  as_of_date date,
  -- deterministic characteristic vector for comp similarity search
  embedding extensions.vector(16),
  full_address text generated always as (
    trim(
      coalesce(house_num, '') || ' ' || coalesce(fraction || ' ', '')
      || coalesce(address, '') || ' ' || coalesce(city, '')
      || ' ' || coalesce(zip, '')
    )
  ) stored,
  updated_at timestamptz not null default now()
);

create index parcels_muni_class_idx on public.parcels (muni_code, class);
create index parcels_school_idx on public.parcels (school_code);
create index parcels_address_trgm_idx on public.parcels
  using gin (full_address extensions.gin_trgm_ops);
create index parcels_embedding_idx on public.parcels
  using hnsw (embedding extensions.vector_l2_ops);

-- Sales history per parcel (from the assessments dataset sale fields).
create table public.sales (
  id bigint generated always as identity primary key,
  parid text not null references public.parcels (parid) on delete cascade,
  sale_date date,
  sale_price numeric,
  sale_code text,
  sale_desc text,
  is_valid_sale boolean not null default false,
  unique (parid, sale_date, sale_price)
);

create index sales_parid_idx on public.sales (parid);
create index sales_date_idx on public.sales (sale_date desc);

-- Common Level Ratio by tax year (STEB).
create table public.common_level_ratio (
  tax_year int primary key,
  ratio numeric not null check (ratio > 0 and ratio <= 1),
  source text,
  updated_at timestamptz not null default now()
);

-- Historical BPAAR appeal dispositions (model training data).
create table public.appeal_outcomes (
  id bigint generated always as identity primary key,
  tax_year int not null,
  parid text not null,
  class text,
  tax_status text,
  muni_desc text,
  school_desc text,
  hearing_type text,
  complainant text,          -- who filed: owner / governing body / both
  hearing_status text,
  status text,
  pre_appeal_land numeric,
  pre_appeal_building numeric,
  pre_appeal_total numeric,
  post_appeal_land numeric,
  post_appeal_building numeric,
  post_appeal_total numeric,
  hearing_date date,
  disposition_date date,
  unique (tax_year, parid, hearing_type, complainant)
);

create index appeal_outcomes_parid_idx on public.appeal_outcomes (parid);
create index appeal_outcomes_year_idx on public.appeal_outcomes (tax_year);

-- Client-facing tables --------------------------------------------------------

create table public.clients (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  company text,
  tier public.client_tier not null default 'residential_diy',
  role public.client_role not null default 'client',
  created_at timestamptz not null default now()
);

create table public.client_properties (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  parid text not null references public.parcels (parid),
  nickname text,
  created_at timestamptz not null default now(),
  unique (client_id, parid)
);

create index client_properties_client_idx on public.client_properties (client_id);

create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  parid text not null references public.parcels (parid),
  tax_year int not null,
  status public.appeal_status not null default 'draft',
  target_value numeric,          -- FMV we intend to argue
  filing_deadline date,
  filed_date date,
  hearing_date date,
  decided_date date,
  outcome_total numeric,         -- post-decision assessed value
  letter_document_id uuid,       -- FK added after documents table exists
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appeals_client_idx on public.appeals (client_id);
create index appeals_status_idx on public.appeals (status);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  parid text references public.parcels (parid),
  appeal_id uuid references public.appeals (id) on delete set null,
  type public.document_type not null default 'other',
  storage_bucket text not null default 'documents',
  storage_path text not null,
  original_name text,
  mime_type text,
  processing_status public.processing_status not null default 'pending',
  extracted_json jsonb,          -- structured extraction output (rent rolls, T-12s, CV)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_client_idx on public.documents (client_id);
create index documents_appeal_idx on public.documents (appeal_id);

alter table public.appeals
  add constraint appeals_letter_document_fk
  foreign key (letter_document_id) references public.documents (id)
  on delete set null;

-- Model outputs ---------------------------------------------------------------

create table public.savings_scores (
  id uuid primary key default gen_random_uuid(),
  parid text not null references public.parcels (parid) on delete cascade,
  tax_year int not null,
  estimated_fmv numeric not null,
  implied_assessed numeric not null,   -- estimated_fmv * CLR
  current_assessed numeric not null,
  estimated_annual_savings numeric not null,
  probability numeric not null check (probability >= 0 and probability <= 1),
  inputs jsonb not null default '{}'::jsonb,  -- comp set + adjustments snapshot
  created_at timestamptz not null default now(),
  unique (parid, tax_year)
);

create index savings_scores_parid_idx on public.savings_scores (parid);

create table public.model_versions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version int not null,
  coefficients jsonb not null,
  metrics jsonb,
  trained_at timestamptz not null default now(),
  unique (name, version)
);

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  appeal_id uuid not null references public.appeals (id) on delete cascade,
  model_version_id uuid references public.model_versions (id),
  probability_reduction numeric not null check (probability_reduction between 0 and 1),
  expected_reduction_pct numeric not null,
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index predictions_appeal_idx on public.predictions (appeal_id);

-- RAG store for appeal letter generation.
create table public.letter_chunks (
  id uuid primary key default gen_random_uuid(),
  source text not null,           -- e.g. 'hearing_guidance', 'sample_letter'
  title text,
  content text not null,
  embedding extensions.vector(384) not null,
  created_at timestamptz not null default now()
);

create index letter_chunks_embedding_idx on public.letter_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- Auth: mirror new users into clients ------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.clients (id, email, full_name, tier)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(
      (new.raw_user_meta_data ->> 'tier')::public.client_tier,
      'residential_diy'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.clients
    where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.parcels enable row level security;
alter table public.sales enable row level security;
alter table public.common_level_ratio enable row level security;
alter table public.appeal_outcomes enable row level security;
alter table public.clients enable row level security;
alter table public.client_properties enable row level security;
alter table public.appeals enable row level security;
alter table public.documents enable row level security;
alter table public.savings_scores enable row level security;
alter table public.model_versions enable row level security;
alter table public.predictions enable row level security;
alter table public.letter_chunks enable row level security;

-- Public reference data: readable by everyone (powers the free score).
create policy "parcels public read" on public.parcels
  for select using (true);
create policy "sales public read" on public.sales
  for select using (true);
create policy "clr public read" on public.common_level_ratio
  for select using (true);
create policy "appeal outcomes public read" on public.appeal_outcomes
  for select using (true);
create policy "savings scores public read" on public.savings_scores
  for select using (true);

-- Clients: own row, admins everything.
create policy "clients self read" on public.clients
  for select using (id = auth.uid() or public.is_admin());
create policy "clients self update" on public.clients
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = 'client');
create policy "clients admin all" on public.clients
  for all using (public.is_admin());

-- Client-owned rows.
create policy "client_properties owner" on public.client_properties
  for all using (client_id = auth.uid() or public.is_admin())
  with check (client_id = auth.uid() or public.is_admin());

create policy "appeals owner" on public.appeals
  for all using (client_id = auth.uid() or public.is_admin())
  with check (client_id = auth.uid() or public.is_admin());

create policy "documents owner" on public.documents
  for all using (client_id = auth.uid() or public.is_admin())
  with check (client_id = auth.uid() or public.is_admin());

create policy "predictions owner" on public.predictions
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.appeals a
      where a.id = appeal_id and a.client_id = auth.uid()
    )
  );

-- model_versions and letter_chunks: service-role only (no policies).

-- Comp candidate retrieval --------------------------------------------------------

-- Returns comparable-sale candidates for a subject parcel: same municipality or
-- school district, same class, similar size, sold recently and at arm's length,
-- ordered by characteristic-vector distance.
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

-- Letter chunk similarity search for RAG.
create or replace function public.match_letter_chunks(
  query_embedding extensions.vector(384),
  match_count int default 5
)
returns table (id uuid, source text, title text, content text, similarity double precision)
language sql
stable
as $$
  select
    lc.id,
    lc.source,
    lc.title,
    lc.content,
    (1 - (lc.embedding operator(extensions.<=>) query_embedding))::double precision as similarity
  from public.letter_chunks lc
  order by lc.embedding operator(extensions.<=>) query_embedding
  limit match_count;
$$;
