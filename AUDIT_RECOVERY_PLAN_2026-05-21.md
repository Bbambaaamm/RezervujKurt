# Audit a recovery plán (2026-05-21)

## Diagnostický plán (postup)
1. Ověřit čistotu repozitáře, historii commitů a výskyt legacy Codespace hostname.
2. Ověřit environment (`.env.local`) a vazbu `NEXT_PUBLIC_SUPABASE_*` na aktuální host.
3. Ověřit Supabase runtime (status služeb, porty, načtení configu po restartu).
4. Ověřit auth flow (frontend `emailRedirectTo`, endpoint `/auth/v1/otp`, magic link template).
5. Ověřit migrace/seed resetovatelnost databáze.
6. Ověřit RLS policy kontrakt pro `reservations` a `profiles`.
7. Ověřit konzistenci `/rezervace` (public read, occupancy mapping, pre-check).
8. Ověřit `/admin` a `/moje-rezervace` read/write kontrakty.
9. Vyhodnotit root-cause a seřadit opravy podle rizika.

## Zjištění (fakta)

### A) Repo stav
- Branch je `work`, bez lokálních změn při startu auditu.
- Poslední commit: `79add15 Save current work before recreating codespace`.
- Legacy host `reimagined-space-tribble-...` se stále nachází v:
  - `supabase/config.toml`
  - `supabase/templates/magic_link.html`
  - `README.md`

### B) Environment
- `.env.local` v repo aktuálně chybí.
- To je přímý blocker pro konzistentní local Codespace běh frontend auth klienta.

### C) Supabase služby
- `npx supabase status` nešlo ověřit kvůli 403 na npm registry (`https://registry.npmjs.org/supabase`).
- Kvůli tomu nelze v tomto prostředí potvrdit runtime porty 54321/54323/54324 ani restart configu přes CLI.

### D) Auth / magic link
- `app/prihlaseni/page.tsx` posílá `emailRedirectTo` přes `NEXT_PUBLIC_SUPABASE_REDIRECT_URL`, fallback na `window.location.origin`, vždy s cestou `/rezervace`.
- `lib/supabase/auth-client.ts` volá OTP endpoint `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/otp`.
- Při chybě vrací pouze obecnou chybu (`Supabase Auth OTP selhalo (status)`), bez logování response body mimo development console.
- `supabase/templates/magic_link.html` má natvrdo starý 54321 host (`reimagined-space-tribble...`).
- `supabase/config.toml` má starý `site_url` i `additional_redirect_urls` (3000 host).

### E) DB / migrace
- Migrace `20260521110000_public_reservations_anon_pending_approved.sql` existuje.
- V migracích stále existuje i legacy dev policy migrace `20260514133000_dev_readonly_anon_policies.sql`, ale novější migrace ji má nahrazovat.
- `supabase db reset` nebylo možné ověřit (stejné CLI omezení jako výše).

### F) RLS
- `npm run check:rls` prochází (required policy existují).
- Skript správně varuje na legacy fragment v historii migrací a explicitně připomíná nutnost aplikace migrace `20260521110000...`.

### G) `/rezervace`
- `getReservationsReadOnly(date)` čte anonymně pouze `pending/approved` bez `user_id` filtru.
- Grid dostává `reservations` prop z `app/rezervace/page.tsx`.
- Pre-check používá stejný anonymní occupancy kontrakt (`pending/approved`, bez user filtru).

### H) `/admin`
- Admin čtení a lookupy běží přes `supabaseSelectWithAccessToken` (session token).
- V projektu jsou testy stale/no-op i auth chování pro pending approve/cancel flow.

### I) `/moje-rezervace`
- Read endpoint filtruje `user_id=eq.<session.user.id>`.
- Testy pokrývají cancel flow i timezone logiku.

## Root-cause (nejpravděpodobnější)
1. **Nekonzistentní host v Supabase auth konfiguraci a templatech**:
   - starý host je stále v `supabase/config.toml` a `supabase/templates/magic_link.html`.
   - to vysvětluje špatný redirect/magic link cíl a neúspěšné přihlášení po přesunu Codespace.
2. **Chybějící `.env.local`**:
   - bez jasně nastavených `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_REDIRECT_URL` je auth flow nestabilní.
3. **Nelze potvrdit runtime reload Supabase configu** v aktuálním prostředí kvůli nemožnosti spustit Supabase CLI.

## Doporučené pořadí oprav (small safe)

### Kritické blokery
1. Sjednotit host na aktuální Codespace ve:
   - `supabase/config.toml` (`site_url`, `additional_redirect_urls`),
   - `supabase/templates/magic_link.html`,
   - `.env.local` (včetně `NEXT_PUBLIC_SUPABASE_REDIRECT_URL`).
2. Restartovat Supabase stack a ověřit `npx supabase status` + test OTP requestu (status + body).
3. Ověřit, že kliknutý magic link skutečně vede na aktuální `54321` host a `redirect_to` na aktuální `3000` host `/rezervace`.

### Následné cleanup opravy
4. Do login flow doplnit bezpečné diagnostické logování OTP response body pro non-2xx (jen development).
5. Aktualizovat README příklady hostů (aby nevracely legacy URL).

### Dokumentace / testy
6. Přidat krátký runbook „Codespace host rotation“ (kde všude přepsat host + jak ověřit).
7. Nechat v CI běžet minimálně: `npm run test`, `npm run check:rls`, `npm run build`.

## Stav validace v tomto běhu
- `npm run test`: PASS
- `npm run check:rls`: PASS (s očekávaným warningem na legacy historii)
- `npm run build`: PASS
