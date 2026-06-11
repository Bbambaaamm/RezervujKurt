# Audit stavu projektu vůči milestone plánu (k 20. 5. 2026)

## Stručné shrnutí
Původní milestone plán **A–P je dokončený**. Core MVP flow je implementované a pokryté cílenými unit testy: auth/session persistence, create reservation, kolizní ochrana + lightweight availability pre-check, admin approve/cancel, moje rezervace, user cancellation, audit trail, RLS hardening, UX polish i test/build gate.

Předchozí verze dokumentu obsahovala interní rozpory (např. otevřené dluhy u položek, které jsou v kódu už hotové). Tento dokument je sjednocený podle reálného stavu kódu.

---

## Milestone audit (A–P)

### A: DB schéma
**Stav: SPLNĚNO**
- Tabulky `profiles`, `courts`, `reservations`, `reservation_audit_log` existují.
- Integritní kontroly intervalů/kolizí jsou zavedené.

### B: Migrace
**Stav: SPLNĚNO**
- Inicializační schéma i navazující migrace jsou přítomné.

### C: RLS
**Stav: SPLNĚNO**
- RLS je aktivní na klíčových tabulkách.
- Owner/admin model je zavedený a hardened pro release.

### D: Seed
**Stav: SPLNĚNO**
- Seed pokrývá uživatele, profily, kurty, rezervace i audit demo data.

### E: Read-only flow
**Stav: SPLNĚNO**
- Načítání kurtů/rezervací a grid po dnech fungují.

### F–H: Auth, magic link, session persistence
**Stav: SPLNĚNO**
- Magic link login + callback/session sync fungují.
- Session persistence přes `localStorage` funguje.
- Session refresh orchestrace při expiraci tokenu je implementovaná (silent refresh + fallback logout).

### I: Create reservation flow
**Stav: SPLNĚNO**
- Vytvoření rezervace funguje včetně refresh gridu.

### J: Kolizní validace
**Stav: SPLNĚNO**
- DB-level ochrana proti kolizím je zachována jako source of truth.
- Lightweight availability pre-check je doplněný jako UX helper.
- Overlap porovnání v pre-checku je normalizované na numerické porovnání času (minuty), takže funguje i pro vstupy bez zero-paddingu (např. `9:00`).

### K: Refresh gridu po vytvoření
**Stav: SPLNĚNO**

### L: Fallback logika
**Stav: SPLNĚNO**

### M: Audit log připravenost
**Stav: SPLNĚNO**
- Audit trigger pro create je hotový.
- Audit trigger pro update/cancel je hotový.

### N: Auditovatelnost + session hardening + error mapping
**Stav: SPLNĚNO**
- Session refresh orchestrace je centralizovaná.
- Centralized reservation write error mapping je implementovaný.
- Cílené unit testy mapperu jsou přítomné.

### O: Admin reservation overview + pending actions
**Stav: SPLNĚNO**
- Admin guard/authorization je pokrytý.
- Pending přehled + approve/cancel akce fungují.
- Stale pending handling je implementovaný.
- History přehled (read-only) je implementovaný.
- Admin overview už nezobrazuje technické UUID uživatelů; používá fallback řetězec `display_name/full_name -> email -> Uživatel`.
- Missing refreshed access token ve stale-pending recovery větvi je nyní obsloužen lokálně přes UI chybu a bezpečný návrat bez dalšího throw (prevence unhandled rejected promise při expiraci session).

### P: My reservations overview + user cancellation
**Stav: SPLNĚNO**
- `/moje-rezervace` read-only přehled je implementovaný.
- User cancellation flow je implementovaný (pending/approved budoucí rezervace).
- Cancelability logika je timezone-safe (`Europe/Prague`).
- Oprava stale success message po reloadu je hotová.
- UX helpery a polish jsou pokryté.

---

## Ověření vůči kódu (kontrolované oblasti)

### Implementace
- Audit trigger create/update/cancel: přítomno.
- Session refresh orchestrace: přítomna.
- Centralized error mapping: přítomen.
- Admin authorization coverage: přítomna.
- My reservations overview: přítomen.
- User cancellation flow: přítomen.
- Timezone-safe cancellation logika: přítomna.
- Stale success message fix: přítomen.
- UX polish helpery: přítomny.
- Lightweight availability pre-check: přítomen.
- `/ucet` profile save flow: doplněný robustní transport-failure handling (try/catch/finally), takže se vždy ukončí loading state a zobrazí se srozumitelná chyba při síťovém výpadku.

### Test coverage
- Reservation write error mapper: pokryto.
- Admin role resolution / guard decision: pokryto.
- Admin update status stale/unauthorized: pokryto.
- History/pending endpoint construction: pokryto.
- My reservations endpoint construction: pokryto.
- User cancellation helper: pokryto.
- Timezone/cancelability logika: pokryto.
- Stale success message preservation: pokryto.
- Reservation overview UX helpery: pokryto.
- Availability overlap detection/query construction: pokryto.

---

## Otevřené milestone / dluh
Žádný otevřený dluh už **není blockerem původního milestone plánu A–P**.

---

## Future / production readiness backlog

> Aktivní řízení navazujících úkolů, akceptačních kritérií a potvrzení dokončení je vedeno v `docs/dalsi-postup.md`.
Následující body jsou záměrně oddělené jako budoucí rozvoj mimo scope původního MVP plánu:

1. Rozšířená observabilita (strukturované logování, metriky, alerting).
2. Stabilizace E2E smoke scénářů v automatickém PR ověřování a následné nastavení lifecycle jobu jako povinného checku.
3. Produktové UX enhancementy (např. pokročilejší lokalizovaný date/time picker).
4. Operational playbook (incident checklist, release runbook).

---

## Production Confidence Pass (26. 5. 2026)

### Hotové
- Přidán runtime checklist pro lokální Supabase průchod: `docs/runtime-verification.md`.
- DEV fallback režim pro `/rezervace` už není tichý: při selhání Supabase read je vidět DEV-only upozornění v UI + výraznější log.
- Dokumentace prostředí doplněna o rychlý env sanity postup (`README.md`) a `.env.example` obsahuje i Codespaces vzor.
- `supabase/config.toml` vrácen do bezpečného repo-default stavu pro localhost, aby se snížilo riziko driftu mezi vývojáři.

### Ověřené testy
- `npm test` (unit test suite).

### Runtime ověřit manuálně
- Kritická cesta member/admin podle `docs/runtime-verification.md`:
  auth → pending create → admin approve/cancel → occupancy refresh.

### Stav E2E automatizace (11. 6. 2026)
- Anonymous smoke: implementováno v `e2e/smoke.anonymous.spec.ts`.
- Auth bootstrap: implementován pro oddělený member/admin `storageState`.
- Approve lifecycle: implementován v `e2e/smoke.reservation-lifecycle.spec.ts`.
- Cancel/release lifecycle: implementován přes oprávněný member flow v `/moje-rezervace`; veřejný grid následně ověřuje uvolnění slotu.
- Bezpečný cleanup: lifecycle používá unikátní poznámku `E2E-LIFECYCLE` a cleanup před testem i v `finally` bez globálního mazání dat.
- Automatické PR ověřování: sedm evidovaných běhů bez retry potvrdilo minimální reprezentativní vzorek; medián jobu je `3m 9s` a nejhorší pozorovaná délka `4m 4s`.
- Diagnostický běh [PR #175 / run 27327043964](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27327043964) publikoval artefakt `playwright-lifecycle-failure`; vlastník projektu dodanými screenshoty potvrdil trace a screenshot prvního neúspěšného pokusu i diagnostiku retry.
- Povinný branch protection check: dokončeno; Ruleset vyžaduje job `Auth lifecycle nad lokální Supabase` a [PR #183](https://github.com/Bbambaaamm/RezervujKurt/pull/183) prakticky potvrdil blokaci standardního sloučení při jeho selhání.

### Doporučený další krok
**Cíl:** pokračovat položkou P1 a definovat cílová prostředí a vlastnictví konfigurace.

1. Rozhodnout, zda budou existovat oddělená `development`, `staging` a `production` prostředí.
2. Přiřadit každému prostředí Supabase projekt a aplikační URL.
3. Určit správu secrets, vlastníky přístupů a povolené auth redirect URL.
4. Autoritativní akceptační kritéria a evidenci vést v `docs/dalsi-postup.md`.

---

## Závěr
Původní MVP milestone plán **A–P je dokončený** a dokumentace je sjednocená s reálným stavem kódu. Další práce patří do odděleného **Future / production readiness backlogu**.

- Oprava regrese refresh flow na `/rezervace`: reload rezervací po create nyní používá explicitní parametr `date` a ochranu proti přepsání novějších dat starším requestem (stale closure/race condition).

- Reservation grid occupancy nyní používá normalizované numerické porovnání časových intervalů stejně jako availability pre-check (pending + approved blokují, cancelled neblokuje).
