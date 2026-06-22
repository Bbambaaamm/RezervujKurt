-- Přidává roli člena, aby šlo odlišit běžného přihlášeného nečlena od člena klubu.
-- Výchozí role zůstává user kvůli zpětné kompatibilitě nových registrací.
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'member', 'admin'));
