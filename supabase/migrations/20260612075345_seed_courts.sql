insert into public.courts (name, surface, is_active)
values
  ('Kurt 1', 'antuka', true),
  ('Kurt 2', 'antuka', true),
  ('Kurt 3', 'antuka', true)
on conflict (name) do update
set
  surface = excluded.surface,
  is_active = excluded.is_active;