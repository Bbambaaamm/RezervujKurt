# Minimální E2E smoke strategie pro RezervujKurt

## Stručné shrnutí problému
Projekt má stabilní business logiku i unit/integration testy, ale chybí minimální end-to-end vrstva, která ověří kritickou cestu přes UI + autentizaci + databázové stavy v jednom průchodu.

Cílem není přidat „velký test framework“, ale zavést malý, udržitelný smoke set, který rychle odhalí regresi v nejdůležitějších scénářích rezervací.

## A) Doporučený E2E nástroj
**Playwright** (TypeScript).

## B) Proč právě tento nástroj
1. **Přirozeně sedí do současného stacku** (Next.js + TypeScript + npm test) a nevyžaduje změnu architektury.
2. **Spolehlivé čekání na UI stav** (auto-waiting, locators) snižuje flaky testy oproti „ručnímu čekání“.
3. **Jednoduché role/session scénáře** (anonymous/member/admin) přes izolované browser contexty.
4. **Dobré debug artefakty** (trace/screenshot/video) při pádu testu — vhodné pro rychlé triage bez refaktoru aplikace.
5. **Minimální provozní náklady**: 1 config, 1 smoke suite, bez nutnosti hned budovat složitý test harness.

> Alternativy (např. Cypress) jsou použitelné, ale pro tento konkrétní cíl je Playwright praktičtější díky jednodušší paralelní práci s rolemi a stabilnímu auto-waitu bez doplňků.

## C) Minimální počet testů
Doporučení: **3 smoke testy** (ne 6 samostatných), kde každý test pokryje více kroků kritické cesty.

### Test 1: Anonymous read-only guard
Pokryje:
1) anonymous user vidí kurty + occupancy
2) anonymous user nemůže vytvořit rezervaci

Kontroly:
- grid je načtený a obsahuje očekávané kurty/sloty
- occupancy je vizuálně/tekstově odlišená
- CTA pro vytvoření rezervace je disabled nebo vede na přihlášení
- přímý pokus o submit (pokud lze vyvolat) končí guardem/chybou bez zápisu

### Test 2: Member vytvoří pending + pending blokuje slot
Pokryje:
3) member vytvoří pending rezervaci
4) pending rezervace blokuje slot

Kontroly:
- member vytvoří rezervaci konkrétního slotu
- v UI je stav pending (ne approved)
- stejný slot nelze znovu rezervovat (buď disabled, nebo server-side odmítnutí a UI hláška)

### Test 3: Admin approve/cancel + grid reakce
Pokryje:
5) admin approve/cancel
6) grid správně reaguje na approved/cancelled

Kontroly:
- admin otevře pending rezervaci a provede approve
- grid/overview reflektuje approved stav
- admin následně provede cancel (na stejné nebo nově vytvořené rezervaci)
- grid/overview reflektuje cancelled (slot dostupný dle doménové logiky)

## D) Testovací data a role (member/admin)
Bez overengineeringu doporučuji:

1. **Fixní seed identity pro E2E**
   - `e2e.member@...`
   - `e2e.admin@...`
   - role řešit přes existující profil/role mechanismus v DB (žádné nové feature).

2. **Deterministický časový slot pro test**
   - používat slot v relativně blízké budoucnosti (např. +2 dny) vypočtený v test helperu, aby test nestárnul.

3. **Před testem cílený cleanup pouze E2E dat**
   - mazat/rušit jen rezervace vytvořené E2E uživateli ve zvoleném test slotu.
   - neprovádět plošné truncaty tabulek.

4. **Autentizace rolí přes uložený session state**
   - jednorázový login v setupu + `storageState` pro member/admin.
   - anonymous scénář běží v čistém contextu bez session.

5. **Idempotence**
   - každý smoke běh musí být opakovatelný i po pádu předchozího běhu.

## E) Co zatím netestovat
Aby rozsah zůstal minimální:

- Neřešit cross-browser matici (zatím pouze Chromium).
- Netestovat kompletní validační matice formulářů (to už kryjí unit/integration testy).
- Netestovat všechny hraniční časy, time-zone varianty, paralelní race scénáře.
- Netestovat kompletní admin UI workflow mimo approve/cancel.
- Netestovat notifikace/e-maily, pokud nejsou součástí kritické cesty pro blokaci slotu.
- Nezavádět page-object architekturu od začátku (stačí malé helpery).

## F) Přesný návrh prvního implementačního kroku
**Krok 1 (jediný první PR): „Playwright skeleton + 1 smoke test (anonymous read-only guard)“**

Obsah kroku:
1. Přidat Playwright jako dev dependency.
2. Přidat minimální `playwright.config.ts`:
   - baseURL z env
   - pouze Chromium
   - trace při retry/fail
   - testDir `e2e/`
3. Přidat `e2e/smoke.anonymous.spec.ts` jen pro scénář C1.
4. Přidat npm script `test:e2e:smoke`.
5. Přidat krátký runbook do `README`/`docs` (lokální spuštění + potřebné env).

**Proč právě takto:**
- Nejmenší bezpečný řez.
- Ověříme, že E2E infrastruktura funguje na CI/lokále.
- Minimalizujeme riziko, že zároveň budeme ladit framework i složitá role-based data.

## Rizika a vedlejší dopady
- E2E testy budou citlivé na konzistenci seed dat (nutné explicitně popsat v runbooku).
- Pokud login flow závisí na externím e-mail OTP, bude potřeba test-only přihlášení přes existující interní mechanismus (bez nové feature, ideálně přes session bootstrap v setupu).
- I minimální E2E přidá čas do pipeline; proto držet smoke set malý a spouštět ho cíleně.

## Co ověřit po zavedení
1. Stabilita: 10 po sobě jdoucích lokálních běhů bez flake.
2. Rychlost: smoke suite do rozumného času (orientačně do několika minut).
3. Diagnostika: při uměle vyvolané chybě je dostupný trace/screenshot.
4. Izolace: opakovaný běh bez ručního zásahu do DB.

## G) Runbook pro první minimální E2E krok (Playwright skeleton + 1 anonymous smoke)

### 1) Předpoklady prostředí
- Lokální Supabase musí běžet na `http://127.0.0.1:54321`.
- V prostředí Codespaces může `.env.local` obsahovat public GitHub URL; pro E2E běh je nutné explicitně přepsat `NEXT_PUBLIC_SUPABASE_URL` na lokální endpoint.

### 2) Instalace a příprava
```bash
npx supabase start
npm install
npx playwright install chromium
# Pokud chybí systémové knihovny:
# sudo npx playwright install-deps chromium
```

### 3) Spuštění smoke testu proti lokální Supabase
```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 npm run test:e2e:smoke
```

### 4) Stabilizační pravidla pro test
- Test nesmí být navázaný na konkrétní text `Kurt 1`; lokální data obsahují různé názvy kurtů (`Kurt 3/4/5`).
- Test nesmí být závislý na „dnešním“ datu.
- Test musí ověřit, že není aktivní fallback/mock banner (`DEV upozornění...`). Pokud je banner viditelný, je problém v runtime env nebo v Supabase endpointu.
- Test kontroluje jen anonymní read-only guard:
  - stránka `/rezervace` se načte,
  - grid/sloty jsou viditelné,
  - anonymní uživatel vidí výzvu k přihlášení,
  - akce `Rezervovat` není pro anonymous dostupná.
