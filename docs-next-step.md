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
Následující body jsou záměrně oddělené jako budoucí rozvoj mimo scope původního MVP plánu:

1. Rozšířená observabilita (strukturované logování, metriky, alerting).
2. E2E smoke scénáře pro klíčové user/admin cesty nad runtime prostředím.
3. Produktové UX enhancementy (např. pokročilejší lokalizovaný date/time picker).
4. Operational playbook (incident checklist, release runbook).

---

## Závěr
Původní MVP milestone plán **A–P je dokončený** a dokumentace je sjednocená s reálným stavem kódu. Další práce patří do odděleného **Future / production readiness backlogu**.
