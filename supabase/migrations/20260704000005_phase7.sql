-- Phase 7 hardening:
--   * appeals.assigned_admin_id — admin ownership of an appeal
--   * appeal_windows.mailing_address — powers county-specific filing
--     instructions in every appeal package

alter table public.appeals
  add column assigned_admin_id uuid references public.clients (id);

create index appeals_assigned_admin_idx
  on public.appeals (assigned_admin_id);

alter table public.appeal_windows
  add column mailing_address text;

-- Full evidence package PDFs are stored as documents alongside letters.
alter type public.document_type add value if not exists 'evidence_package';

-- letter_chunks are upserted by title so switching embedding models (hashing
-- -> Voyage) re-embeds in place.
alter table public.letter_chunks
  add constraint letter_chunks_title_key unique (title);

update public.appeal_windows set mailing_address =
  case county
    when 'Allegheny' then
      'Board of Property Assessment Appeals and Review, County Office Building, 542 Forbes Avenue, Room 334, Pittsburgh, PA 15219'
    when 'York' then
      'York County Assessment Office, 28 E. Market Street, Room 105, York, PA 17401'
    when 'Cumberland' then
      'Cumberland County Board of Assessment Appeals, 1 Courthouse Square, Room 107, Carlisle, PA 17013'
    when 'Montgomery' then
      'Montgomery County Board of Assessment Appeals, Montgomery County Courthouse, PO Box 311, Norristown, PA 19404-0311'
    when 'Butler' then
      'Butler County Assessment Office, 124 W. Diamond Street, PO Box 1208, Butler, PA 16003-1208'
    when 'Indiana' then
      'Indiana County Board of Assessment Appeals, Indiana County Courthouse, 825 Philadelphia Street, Indiana, PA 15701'
    when 'Juniata' then
      'Juniata County Assessment Office, Juniata County Courthouse, 1 N. Main Street, Mifflintown, PA 17059'
  end
where county in
  ('Allegheny', 'York', 'Cumberland', 'Montgomery', 'Butler', 'Indiana', 'Juniata');
