# Stav plánu: ověření splnění (k 14. 5. 2026)

## Stručné shrnutí problému
Původní plán v tomto dokumentu definoval jeden hlavní krok: stabilizovat backendový základ v Supabase (schéma, omezení, RLS, seed), aby UI mohlo bezpečně přejít z mock dat na reálný read model.

Po kontrole aktuálního stavu repozitáře je tento krok **splněn**. Níže je diff-based audit vůči původním cílům a navazující seniorní roadmapa po malých bezpečných krocích.

## Ověření splnění původních cílů

### 1) Databázové schéma
- ✅ Splněno.
- Jsou vytvořeny tabulky `profiles`, `courts`, `reservations`, `reservation_audit_log`.
- Jsou přítomna klíčová omezení: `time_from < time_to`, stav rezervace (`pending|approved|cancelled`), unikátnost přesného slotu a navíc exkluzní constraint proti překryvu intervalů.

### 2) Migrace
- ✅ Splněno.
- Existuje inicializační migrace schématu a následná migrace s dev read-only anonymními policy pro UI bez auth flow.

### 3) Seed
- ✅ Splněno.
- Seed obsahuje testovací uživatele v `auth.users`, navázané `profiles`, 3 kurty, rezervace a záznamy v audit logu.

### 4) RLS
- ✅ Splněno.
- RLS je zapnuté na všech hlavních tabulkách.
- Je definována helper funkce `is_admin()` a policy pro self/admin přístup.
- Pro lokální/dev scénář je přidaná anonymní read-only policy pro courts + veřejný read přehled rezervací.

### 5) Read-only service vrstva
- ✅ Splněno.
- `lib/services/read-only.ts` implementuje čtení kurtů a rezervací přes Supabase REST a mapuje DB model na UI doménové typy.

### 6) Napojení UI na Supabase
- ✅ Splněno.
- Stránka rezervací načítá data přes read-only service.
- Je přítomný kontrolovaný fallback na mock data při chybě Supabase.

### 7) Odstranění závislosti na mock datech jako primárním zdroji
- ✅ Splněno částečně-architektonicky, funkčně dostačující pro aktuální fázi.
- Primární zdroj je Supabase.
- Mock data zůstávají jako vědomý resilience fallback pro dev/runtime výpadky.

### 8) Lokální development workflow
- ✅ Splněno pro základní běh.
- README popisuje běh Next.js, lint a Supabase reset/seed workflow.

## Označení původních bodů jako dokončených
- [x] Definovat tabulky: `profiles`, `courts`, `reservations`, `reservation_audit_log`.
- [x] Vytvořit minimální omezení konzistence slotů a stavů.
- [x] Připravit RLS pravidla pro role `user` a `admin` (+ dev read-only anon přístup pro UI).
- [x] Přidat seed skript s 3 kurty a testovacími rezervacemi.

---

## Další doporučený postup

### Principy postupu
- Postupovat po malých, reverzibilních krocích.
- Neměnit více vrstev najednou (DB, service, UI, auth odděleně).
- Každý krok uzavřít minimálně jedním ověřitelným testem/scénářem.

### Milestone 1: Create reservation flow (minimum vertical slice)
1. Přidat write service metodu pro vytvoření rezervace (zatím bez velkého UI refactoru).
2. Přidat jednoduchý formulář na stránce rezervací (datum, kurt, čas od/do, poznámka).
3. Persistovat `pending` rezervaci přes RLS jako přihlášený user.
4. Doplnit základní chybové stavy (validace vstupu, konflikt slotu, neočekávaná chyba).

**Proč:** Umožní ověřit end-to-end hodnotu systému bez skoku do komplexních workflow.

### Milestone 2: Validace kolizí
1. Zachovat DB jako zdroj pravdy (exclusion constraint už existuje).
2. Přidat aplikační pre-check pro lepší UX (indikace konfliktu před odesláním).
3. V UI standardizovat hlášku pro kolizi slotu.
4. Pokrýt integračním testem: souběžné vytvoření konfliktu musí skončit jedním úspěchem a jedním odmítnutím.

**Proč:** Snižuje riziko nekonzistence a dává predikovatelné chování při souběhu.

### Milestone 3: Auth flow
1. Zapnout přihlášení přes Supabase Auth (nejdřív e-mail magic link nebo heslo; bez provider expanze).
2. Navázat profil uživatele (`profiles`) při prvním přihlášení.
3. Odstranit anon read policy z produkční konfigurace, ponechat jen cíleně pro dev.
4. Zpřesnit route guardy: rezervace jako authenticated, admin sekce jako admin role.

**Proč:** Bez auth nelze bezpečně provozovat write operace ani audit stopu.

### Milestone 4: Admin workflow
1. Admin přehled čekajících rezervací (`pending`).
2. Akce schválit/zamítnout/zrušit s kontrolou role.
3. Každou změnu stavu zapisovat do `reservation_audit_log`.
4. Přidat minimální filtraci (datum, kurt, stav) pro operativní práci.

**Proč:** Uzavírá klíčový business proces schvalování a správy rezervací.

### Milestone 5: Audit log použití
1. Definovat, které akce musí být auditované (create, status change, cancel, admin override).
2. Zavést jednotný payload contract (kdo, co, kdy, proč, odkud).
3. Přidat read-only admin výpis auditu.
4. Ověřit neměnnost logiky zápisu (žádný update/delete nad logem mimo servisní maintenance).

**Proč:** Audit je důležitý pro dohledatelnost sporů a provozní bezpečnost.

### Milestone 6: Produkční security checklist
1. Zrevidovat všechny RLS policy pro princip nejmenších práv.
2. Oddělit dev a production policy/migrace (anon read pouze dev).
3. Nastavit správu tajemství (Supabase klíče, env proměnné, rotace).
4. Zapnout monitoring chyb (API + UI) a minimální alerting.
5. Doplnit abuse ochrany (rate limit, anti-automation strategie podle budgetu).

**Proč:** Snižuje bezpečnostní a provozní riziko před produkčním nasazením.

### Milestone 7: Testing strategy
1. Unit testy mapování DB -> doménové typy (read/write service).
2. Integrační testy pro RLS scénáře (user vs admin vs anon).
3. Integrační test kolizí rezervací (DB constraint + UX message).
4. E2E smoke: načtení gridu, vytvoření rezervace, schválení adminem.
5. Přidat CI gate: lint + test + (volitelně) typová kontrola.

**Proč:** Bez testovacího rámce bude každá další změna zvyšovat regresní riziko.

---

## Co je hotové
- Hotový datový základ v Supabase: schéma, omezení, RLS, seed.
- Hotová read-only service vrstva a napojení UI na Supabase.
- Mock data už nejsou primární zdroj, pouze fallback pro robustnost vývoje.

## Největší aktuální riziko projektu
- Chybějící produkční auth + write flow znamená, že systém zatím není připraven na bezpečný reálný provoz rezervací (zejména identita uživatele, autorizace akcí a operativní workflow schvalování).

## Další doporučený milestone
- **Milestone 1: Create reservation flow (minimum vertical slice)** s navazující validací kolizí jako bezprostředně další krok.
