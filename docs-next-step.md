# Audit stavu projektu vůči milestone plánu (k 14. 5. 2026)

## Stručné shrnutí
Projekt už má solidní datový a bezpečnostní základ (schéma, migrace, RLS, seed), funkční read-only část a základ auth/create flow přes magic link. End-to-end však ještě není produkčně uzavřený kvůli chybějícímu audit log zápisu při create/update, nehotovým guardům a nekonzistenci v auth type vrstvě, která aktuálně rozbíjí build.

---

## Milestone audit

### Milestone A: DB schéma
**Stav: SPLNĚNO**
- Tabulky `profiles`, `courts`, `reservations`, `reservation_audit_log` existují.
- Jsou přítomné klíčové integritní kontroly: `check (time_from < time_to)`, unikátní slot index i exclusion constraint proti překryvu.

### Milestone B: Migrace
**Stav: SPLNĚNO**
- Inicializační migrace schématu je přítomná.
- Dev migrace pro anon read-only policy je přítomná.
- Migrace pro bootstrap profilu po vytvoření auth uživatele je přítomná.

### Milestone C: RLS
**Stav: ČÁSTEČNĚ SPLNĚNO**
- RLS je zapnuté na všech klíčových tabulkách a owner/admin model je implementovaný.
- Chybí provozní oddělení dev/prod policy režimu (dev anon policy je stále explicitně otevřená pro `reservations` přes `using (true)`).

**Co chybí přesně**
- Jednoznačný mechanismus, který při produkčním nasazení zabrání aktivaci `reservations_select_public_overview_anon using (true)`.

**Technické riziko**
- Riziko nechtěného zveřejnění rezervačních dat při chybně nastaveném release procesu.

### Milestone D: Seed
**Stav: SPLNĚNO**
- Seed obsahuje uživatele, profily, kurty, rezervace i audit log seed záznamy.

### Milestone E: Read-only flow
**Stav: SPLNĚNO**
- Read service načítá kurty a rezervace ze Supabase.
- Grid zobrazuje data po dnech.

### Milestone F: Auth flow
**Stav: ČÁSTEČNĚ SPLNĚNO**
- Přihlášení/odhlášení přes OTP je implementované.
- Session se čte a propaguje do UI.
- Chybí route guard pro chráněné akce/stránky a jednotná server/client strategie auth enforcementu.

**Co chybí přesně**
- Guard minimálně pro write akce a stránky, které mají být jen pro přihlášené.
- Stabilizace typové vrstvy auth klienta (aktuální build fail).

**Technické riziko**
- Nekonzistentní UX a možnost, že nepřihlášený uživatel vstoupí do flow, které pak padá až při submitu.

### Milestone G: Magic link login
**Stav: SPLNĚNO**
- Login stránka odesílá OTP a redirect URL.
- `AuthSessionSync` zpracuje hash token z URL a uloží session.

### Milestone H: Session persistence
**Stav: ČÁSTEČNĚ SPLNĚNO**
- Session je perzistovaná v `localStorage` a obnovuje se po reloadu.
- Chybí refresh token orchestrace/obnova expirované session.

**Co chybí přesně**
- Obnova session přes refresh token a handling expirace access tokenu.

**Technické riziko**
- Náhlé odhlašování nebo selhání write operací po expiraci tokenu.

### Milestone I: Create reservation flow
**Stav: SPLNĚNO (MVP úroveň)**
- Existuje write service (`POST /rest/v1/reservations`) s bearer tokenem.
- UI formulář je navázaný na výběr slotu a submit.
- Při úspěchu proběhne refresh dat aktuálního dne.

### Milestone J: Kolizní validace
**Stav: ČÁSTEČNĚ SPLNĚNO**
- DB-level validace kolizí je robustní (exclusion constraint).
- Aplikace mapuje konfliktní odpověď na uživatelskou chybu.
- Chybí pre-submit validace v UI (např. jemnější kontrola slotu před odesláním a detailnější mapování všech DB error kódů).

**Co chybí přesně**
- Jednotná mapovací vrstva pro Postgres/Supabase error kódy.
- Volitelný lightweight pre-check dostupnosti slotu.

**Technické riziko**
- Vyšší četnost „obecných“ chybových hlášek a horší UX při souběžných rezervacích.

### Milestone K: Refresh gridu po vytvoření rezervace
**Stav: SPLNĚNO**
- Po vytvoření rezervace se znovu načtou rezervace pro vybraný den.

### Milestone L: Fallback logika
**Stav: SPLNĚNO**
- Při chybě čtení ze Supabase aplikace přechází na mock fallback data.

### Milestone M: Audit log připravenost
**Stav: ČÁSTEČNĚ SPLNĚNO**
- Audit log tabulka i select/insert policy jsou připravené.
- Chybí aplikační write mechanismus, který při create/update/cancel skutečně zapisuje audit událost.

**Co chybí přesně**
- Trigger nebo aplikační vrstva, která konzistentně zapisuje audit eventy.

**Technické riziko**
- Nízká dohledatelnost změn a slabší forenzní stopa při incidentech.

---

## Ověření
- `npm run build` aktuálně **neprošlo**: chybí modul `@supabase/supabase-js` v `components/header.tsx` (import typu `Session`), zatímco zbytek auth vrstvy používá vlastní lightweight klient.

---

## Závěrečné doporučení roadmapy

### Aktuální největší technický dluh
- Nekonzistentní auth vrstva (mix vlastního klienta + import typu ze SDK), která nyní rozbíjí build a komplikuje další vývoj.

### Aktuální největší bezpečnostní riziko
- Riziko ponechání dev anon read policy (`reservations ... using (true)`) v prostředí, kde to nemá být veřejné.

### Doporučený další milestone
**Milestone 3: Stabilizace auth + bezpečnostní hardening před dalším feature rozvojem.**

### Proč je to teď nejlepší další krok
- Bez stabilního buildu, konzistentní auth vrstvy a jasného policy režimu je rizikové přidávat admin workflow nebo další business logiku.
- Tento krok je malý, bezpečný, dobře reviewovatelný a sníží provozní i bezpečnostní riziko.

### Návrh konkrétního Milestone 3 (malé bezpečné kroky)
1. **Sjednotit auth typy bez nové dependency**
   - odstranit zbytkový import `Session` ze SDK,
   - používat interní typ session z `auth-client`.
2. **Zprovoznit build gate**
   - CI/locally vyžadovat `npm run build` jako povinný check.
3. **Zpevnit RLS release režim**
   - explicitně oddělit dev/prod policy migrace (nebo guard skript v release pipeline).
4. **Doplnit minimální route/write guard**
   - write CTA jen pro přihlášené, redirect na login pro chráněné kroky.
5. **Připravit audit write hook**
   - trigger nebo service zápis pro create/update/cancel jako základ Milestone 4.

---

## Co je aktuálně production-ready
- Datový model rezervací včetně integritních omezení proti kolizím.
- Základ RLS modelu owner/admin.
- Read-only flow s fallbackem.

## Co je zatím pouze MVP
- Auth/session vrstva (bez plného refresh orchestrace a guardů).
- Create flow (funkční, ale bez audit zápisu a bez plně sjednocené chybové mapy).
- Provozní oddělení dev/prod policy režimu.

## Doporučení seniorního architekta
Nejprve uzavřít **Milestone 3 (stabilizace auth + security hardening)**, teprve potom pokračovat Milestone 4 (audit write + admin workflow). Tím se minimalizuje riziko regresí i bezpečnostních incidentů při dalším škálování funkcionality.
