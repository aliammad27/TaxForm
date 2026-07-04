-- Private buckets; all uploads/downloads flow through server-side service role.
insert into storage.buckets (id, name, public)
values
  ('documents', 'documents', false),
  ('letters', 'letters', false)
on conflict (id) do nothing;
