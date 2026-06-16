-- Běžný přihlášený uživatel potřebuje bezpečně číst aktivní kurty
-- pro doplnění názvů ve vlastních rezervacích bez přístupu k neaktivním záznamům.
create policy "courts_select_active_authenticated"
  on public.courts
  for select
  to authenticated
  using (is_active = true);
