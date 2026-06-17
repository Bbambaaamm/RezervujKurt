-- Veřejné úložiště plakátů turnajů nahrávaných z administrace.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tournament-posters',
  'tournament-posters',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tournament_posters_select_public" on storage.objects;
create policy "tournament_posters_select_public"
  on storage.objects
  for select
  using (bucket_id = 'tournament-posters');

drop policy if exists "tournament_posters_insert_admin" on storage.objects;
create policy "tournament_posters_insert_admin"
  on storage.objects
  for insert
  with check (bucket_id = 'tournament-posters' and public.is_admin());
