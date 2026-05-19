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
3. Volitelně navázat malé sjednocení error mappingu kolizí (priorita 3).

### Proč právě tento krok
- Auditní stopa write operací je nyní pokrytá pro create i update/cancel.
- Další postup může zůstat malý a bezpečný (session hardening bez zásahu do UI).

---

## UX poznámka (ne-blocker)
- Lokalizovaný custom date picker je vhodný budoucí UX enhancement, ale není blocker pro aktuální milestone ani pro provoz MVP.
