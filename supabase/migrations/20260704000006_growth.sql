-- Phase 8 growth features:
--   * notifications — dedupe + audit log for Resend email reminders
--     (filing deadlines, hearings, assessment changes)
--   * client_properties.last_known_assessed — assessment-change watcher state
--   * clients.referral_code / referred_by — referral program scaffolding

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  appeal_id uuid references public.appeals (id) on delete set null,
  parid text references public.parcels (parid),
  kind text not null check (kind in ('deadline_reminder', 'hearing_reminder', 'assessment_change')),
  -- One notification per (kind, subject-entity, occasion), e.g.
  -- 'deadline_reminder:<appeal_id>:2026-09-01:14d'
  dedupe_key text not null unique,
  subject text not null,
  body text not null,
  sent_at timestamptz,
  send_error text,
  created_at timestamptz not null default now()
);

create index notifications_client_idx on public.notifications (client_id);

alter table public.notifications enable row level security;

create policy "notifications owner read" on public.notifications
  for select using (client_id = auth.uid() or public.is_admin());

-- Assessment watcher: last assessed total we notified about (null = baseline
-- not yet captured; the first watch run snapshots it silently).
alter table public.client_properties
  add column last_known_assessed numeric,
  add column assessed_changed_at timestamptz;

-- Referral program scaffolding (activated once there are paying users).
alter table public.clients
  add column referral_code text unique,
  add column referred_by uuid references public.clients (id);

update public.clients
  set referral_code = upper(substr(md5(id::text || email), 1, 8))
  where referral_code is null;

-- New signups get a code from the signup trigger.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.clients (id, email, full_name, tier, referral_code, referred_by)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(
      (new.raw_user_meta_data ->> 'tier')::public.client_tier,
      'residential_diy'
    ),
    upper(substr(md5(new.id::text || new.email), 1, 8)),
    (
      select c.id from public.clients c
      where c.referral_code = upper(new.raw_user_meta_data ->> 'referral_code')
      limit 1
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
