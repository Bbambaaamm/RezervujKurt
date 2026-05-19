# Audit stavu projektu vůči milestone plánu (k 19. 5. 2026)

## Stručné shrnutí
Projekt je nyní stabilní na úrovni produkčního základu pro core rezervační flow: build prochází, RLS release hardening je zavedený, auth typy jsou sjednocené přes interní `AuthSession`, magic link + session persistence + `AuthSessionSync` fungují a create reservation flow je funkční včetně refresh gridu. Otevřené položky jsou primárně provozní/technický dluh (audit write hook, session refresh orchestrace, hlubší error mapping), ne blokery základního provozu.

---

## Milestone audit

### Milestone A: DB schéma
**Stav: SPLNĚNO (production-ready)**
- Tabulky `profiles`, `courts`, `reservations`, `reservation_audit_log` existují.
- Integritní kontroly pro časové intervaly a kolize jsou zavedené.

### Milestone B: Migrace
**Stav: SPLNĚNO (production-ready)**
- Inicializační migrace schématu je přítomná.
- Navazující migrace pro auth/profile bootstrap i policy úpravy jsou přítomné.

### Milestone C: RLS
**Stav: SPLNĚNO (production-ready)**
- RLS je aktivní na klíčových tabulkách.
- Owner/admin model je zavedený.
- Release hardening pro dev-only policy je zavedený (včetně guardu a kontrol v CI).

### Milestone D: Seed
**Stav: SPLNĚNO (MVP/dev ready)**
- Seed pokrývá uživatele, profily, kurty, rezervace i audit log demo data.

### Milestone E: Read-only flow
**Stav: SPLNĚNO (production-ready)**
- Načítání kurtů a rezervací funguje.
- Grid zobrazuje data po dnech.

### Milestone F: Auth flow
**Stav: SPLNĚNO (MVP+ stabilizováno)**
- Magic link login funguje.
- Lightweight REST auth klient funguje.
- Auth typy jsou sjednocené přes interní `AuthSession`.
- Session persistence přes `localStorage` funguje.
- `AuthSessionSync` funguje.
- Route/write guard existuje.
- Menu korektně rozlišuje anonymního vs přihlášeného uživatele.
- `/ucet` existuje.
- Logout flow funguje.
- UX fixy kolem `SIGNED_OUT` a výchozího dne rezervace jsou hotové.

### Milestone G: Magic link login
**Stav: SPLNĚNO (production-ready)**
- Login stránka odesílá OTP + redirect.
- Callback/session synchronizace je funkční.

### Milestone H: Session persistence
**Stav: SPLNĚNO (production hardening dokončen v N.3)**
- Persist/reload session funguje.
- Session refresh orchestrace při expiraci tokenu je implementovaná (silent refresh + fallback logout).

### Milestone I: Create reservation flow
**Stav: SPLNĚNO (MVP funkční)**
- Write flow vytvoření rezervace je funkční.
- Po úspěchu probíhá refresh dat aktuálního dne.

### Milestone J: Kolizní validace
**Stav: ČÁSTEČNĚ SPLNĚNO**
- DB-level ochrana proti kolizím je robustní.
- Otevřené: sjednocenější mapování chybových kódů a případný lightweight pre-check dostupnosti slotu pro lepší UX.

### Milestone K: Refresh gridu po vytvoření rezervace
**Stav: SPLNĚNO (production-ready)**
- Refresh gridu po create funguje.

### Milestone L: Fallback logika
**Stav: SPLNĚNO (MVP/provozní fallback)**
- Fallback při chybě čtení je přítomný.

### Milestone M: Audit log připravenost
**Stav: ČÁSTEČNĚ SPLNĚNO (N.1 HOTOVO)**
- Datová i policy připravenost existuje.
- Hotovo: N.1 write hook pro create (DB trigger).
- Otevřené: write hook pro update/cancel (další krok).

---

## Ověření
- `npm run build` **prochází**.
- `npm run check:rls` **prochází**.
- GitHub Actions build gate existuje a běží (včetně RLS checku v gate).

---

## Rozdělení podle provozní připravenosti

### Production-ready části
- DB schéma + klíčové integritní constrainty.
- RLS model včetně release hardeningu dev-only policy.
- Read-only flow.
- Refresh gridu po create.
- Build gate + build/check:rls průchod.

### MVP části (funkční, ale s prostorem pro hardening)
- Auth/session vrstva (funkční login, persistence, sync, guardy, logout).
- Create reservation flow.
- Fallback logika.

### Otevřené milestone / dluh
- Milestone J: hlubší UX/error mapping kolizí.
- Milestone M: audit write hook.
- Session refresh orchestrace po expiraci tokenu.

---

## Technické dluhy (aktuální)
1. **Audit write hook je částečně dotažený** (create hotovo, zbývá update/cancel).
2. **Session refresh orchestrace není centralizovaná** (riziko sporadických auth výpadků po expiraci).
3. **Error mapping kolizí není plně sjednocený** (UX konzistence).

## Bezpečnostní rizika (aktuální)
- **Původní riziko dev-only RLS policy v produkci je mitigováno** release hardeningem + CI kontrolami.
- **Zbývající riziko:** bez audit write hooku je omezená forenzní stopa write operací.

---

## Doporučený další milestone (small safe)
**Milestone N: Auditovatelnost a session hardening.**

### Rozsah
1. ✅ **Audit write hook pro update/cancel je hotový (N.2)**.
   - Trigger na `reservations` zapisuje audit při `UPDATE`.
   - Rozlišuje `action='cancel'` při změně statusu na `cancelled`, jinak `action='update'`.
   - Ukládá `old_status`, `new_status` a payload snapshotu staré/nové hodnoty.
2. ✅ **Session refresh orchestrace je hotová (N.3).**
   - `getSession()` nyní validuje `exp` z JWT payloadu a při expiraci/krátce před expirací spouští silent refresh přes `refresh_token`.
   - Je přidané plánování refresh krátce před expirací tokenu (timer), bez zásahu do UI architektury.
   - Při nevalidním refresh tokenu proběhne fallback logout: vyčištění localStorage, emit `SIGNED_OUT` a redirect na `/prihlaseni` jen pokud je to potřeba.
3. ✅ **Sjednocení error mappingu Supabase/DB chyb je hotové (N.4).**
   - Vytvořena centrální mapovací vrstva pro create reservation flow.
   - Konzistentní mapování na: kolize rezervace, chybějící oprávnění, nevalidní vstup, neočekávaná chyba.
   - Zachovaná česká UX hláška pro kolizi: „Kolize rezervace. Vybraný termín je už obsazen.“
4. ✅ **Cílené unit testy pro error mapper jsou hotové (N.5).**
   - Přidané unit testy pro `mapReservationWriteError` pokrývají mapování `23P01`/`409`, `42501`/`403`, `22P02`/`422` i fallback neočekávané chyby.
   - Přidán skript `npm run test:unit` (alias `npm run test`) s minimálním Node.js test setupem přes `node:test` + kompilace přes `tsc` do dočasného výstupu.
   - Test je zapojený do CI build gate před `check:rls` a `build`.

### Proč právě tento krok
- Auditní stopa write operací je nyní pokrytá pro create i update/cancel.
- Další postup může zůstat malý a bezpečný (session hardening bez zásahu do UI).

---

## UX poznámka (ne-blocker)
- Lokalizovaný custom date picker je vhodný budoucí UX enhancement, ale není blocker pro aktuální milestone ani pro provoz MVP.


### Milestone O: Admin reservation overview + basic pending actions
**Stav: O.5 HOTOVO (stale pending UX handling pro souběžné admin akce)**
- Route `/admin` už nepoužívá dočasný DEV guard.
- Přidán lightweight helper `getCurrentUserRoleFromSession`, který přes REST (`/profiles`) načte roli aktuálního profilu podle `session.user.id`.
- Guard na stránce `/admin` rozlišuje 3 stavy:
  - anonymní uživatel: výzva k přihlášení,
  - přihlášený bez admin role: „Nemáte oprávnění pro správu rezervací.“,
  - admin: načtení pending rezervací.
- Přidány development logy guardu: `admin guard: anonymous`, `admin guard: user`, `admin guard: admin`.
- Header menu nyní zobrazuje položku `Admin` pouze uživateli s rolí `admin`; anonymní i běžný přihlášený uživatel položku nevidí.
- Přidány development logy headeru: `header admin link visible` a `header admin link hidden`.
- Role lookup je v klientu lightweight cachovaný (in-memory podle `session.user.id` + deduplikace in-flight lookupu), aby se při stabilní session neposílal zbytečný request navíc na každý render.
- Admin přehled pending rezervací nově obsahuje dvě minimální akce pouze pro řádky se stavem `pending`:
  - `Schválit` → `status='approved'`
  - `Zrušit` → `status='cancelled'`
- Akce jsou implementované lightweight přes REST `PATCH /rest/v1/reservations?id=eq.<id>&status=eq.pending` a pouze mění `status`.
- Během requestu je řádková akce ve stavu loading/disabled a po úspěchu proběhne refresh seznamu pending rezervací.
- Přidány dev logy akcí:
  - `admin approve started`
  - `admin approve success`
  - `admin cancel started`
  - `admin cancel success`
  - `admin action failed`
- Doplněn explicitní stale pending handling pro souběžný admin scénář (2 admini nad stejným řádkem):
  - `updateReservationStatus` nyní detekuje „0 affected rows“ přes `return=representation,count=exact` a mapuje scénáře `empty array` / `Content-Range */0` na specializovanou chybu.
  - V `/admin` se tato chyba mapuje na uživatelskou hlášku: `Rezervace už není ve stavu pending.`
  - Po stale pending chybě se automaticky refreshne pending seznam, aby zastaralý řádek ihned zmizel z UI.
- Přidány dev logy stale scénáře:
  - `admin stale pending detected`
  - `admin stale pending refresh`
- Bez zásahu do create reservation flow, bez zásahu do auth/session orchestrace a bez zásahu do existujících audit triggerů.
- O.6 test coverage: přidány cílené unit testy pro `updateReservationStatus` (stale pending: `[]`, `Content-Range */0`, úspěch pro neprázdné pole a mapování 403/42501 přes existující error mapper).
- RLS/policy změna nebyla potřeba, existující owner/admin model v `profiles` + `reservations` enforcement pokrývá cílové chování.
- O.7 small safe rozšíření `/admin`: pod existující pending sekci přidán read-only blok **„Poslední rezervace“** s posledními 20 záznamy (`order=created_at.desc&limit=20`) a sloupci datum, čas od/do, kurt, uživatel, status.
- Status je vizuálně odlišen badge stylem pro `pending` / `approved` / `cancelled` bez přidání nových write akcí nebo filtrační/pagination logiky.
- Přidán dev log `admin reservation history loaded` při načtení historie.
