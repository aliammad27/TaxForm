-- Review flags for documents that failed automated verification or reconciliation.
alter table public.documents
  add column if not exists needs_review boolean not null default false;

create index if not exists documents_needs_review_idx
  on public.documents (needs_review)
  where needs_review = true;
