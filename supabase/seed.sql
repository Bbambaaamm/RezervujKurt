-- Seed dat pro lokální a vývojové prostředí.

-- Testovací uživatelé pro lokální Supabase Auth.
insert into auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  aud,
  role,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'jan.novak@example.com',
    crypt('Test1234!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Jan Novák"}',
    'authenticated',
    'authenticated',
    now(),
    now()
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'petr.svoboda@example.com',
    crypt('Test1234!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Petr Svoboda"}',
    'authenticated',
    'authenticated',
    now(),
    now()
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'spravce.arealu@example.com',
    crypt('Test1234!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Správce areálu"}',
    'authenticated',
    'authenticated',
    now(),
    now()
  )
on conflict (id) do update
set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  aud = excluded.aud,
  role = excluded.role,
  updated_at = excluded.updated_at;

insert into public.courts (name, surface, is_active)
values
  ('Kurt 1', 'antuka', true),
  ('Kurt 2', 'antuka', true),
  ('Kurt 3', 'antuka', true)
on conflict (name) do update
set
  surface = excluded.surface,
  is_active = excluded.is_active;

-- Testovací profily navázané na auth.users.
insert into public.profiles (id, full_name, phone, role)
values
  ('11111111-1111-1111-1111-111111111111', 'Jan Novák', '777123456', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'Petr Svoboda', '777654321', 'user'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Správce areálu', null, 'admin')
on conflict (id) do update
set
  full_name = excluded.full_name,
  phone = excluded.phone,
  role = excluded.role;

insert into public.reservations (id, user_id, court_id, reservation_date, time_from, time_to, status, note)
values
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, '2026-05-14', '09:00', '11:00', 'approved', null),
  ('00000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 2, '2026-05-14', '14:00', '16:00', 'pending', 'První rezervace přes seed'),
  ('00000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3, '2026-05-14', '17:00', '19:00', 'cancelled', 'Blokace kurtu kvůli údržbě')
on conflict (id) do update
set
  user_id = excluded.user_id,
  court_id = excluded.court_id,
  reservation_date = excluded.reservation_date,
  time_from = excluded.time_from,
  time_to = excluded.time_to,
  status = excluded.status,
  note = excluded.note;

insert into public.reservation_audit_log (reservation_id, changed_by, action, old_status, new_status, payload)
values
  ('00000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'seed_create', null, 'approved', '{"zdroj":"seed"}'),
  ('00000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'seed_create', null, 'pending', '{"zdroj":"seed"}'),
  ('00000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'seed_create', null, 'cancelled', '{"zdroj":"seed"}')
on conflict do nothing;
