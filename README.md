# RezervujKurt

Webový rezervační systém pro tenisové kurty TJ Baník Stříbro. Aplikace používá Next.js App Router a lokální nebo hostovanou Supabase jako zdroj dat a autentizace.

## Aktuálně dostupné funkce

- veřejný denní přehled obsazenosti kurtů bez zveřejnění osobních údajů;
- přihlášení e-mailem přes Supabase magic link a zachování uživatelské session;
- vytvoření čekající rezervace přihlášeným uživatelem;
- ochrana proti duplicitám a překryvům rezervací v UI i databázi;
- přehled vlastních rezervací a zrušení povolené budoucí rezervace;
- administrátorské schválení nebo zrušení čekající rezervace;
- serverové e-mailové upozornění aktivním administrátorům přes transakční outbox;
- auditní stopa vytvoření rezervace a změn jejího stavu;
- unit testy a Playwright smoke scénáře pro anonymní i autentizovaný průchod.

Rozsah potvrzeného MVP a navazující práci eviduje [řídicí checklist](docs/dalsi-postup.md). Funkce jako blokace kurtů, produktové notifikace, platby nebo další poskytovatelé přihlášení jsou plánované, ale nejsou součástí aktuálně dokončeného základu.

Pro bezpečné nasazení a řešení výpadků slouží [provozní release, incident a rollback runbook](docs/provozni-runbook.md). Konkrétní vlastníci a neveřejné kontakty musí být před produkčním použitím doplněné v provozní evidenci.

## Technologie

- Next.js 15 (App Router), React 19 a TypeScript;
- Tailwind CSS;
- Supabase (PostgreSQL, Row Level Security a Auth);
- Node.js test runner a Playwright;
- GitHub Actions pro build gate a E2E lifecycle.

## Rychlý start v GitHub Codespaces

Codespaces je doporučená cesta, pokud nechceš lokálně připravovat Node.js a Docker. Postup počítá s novým Codespace vytvořeným z tohoto repozitáře.

### 1. Nainstaluj závislosti

```bash
npm ci
```

### 2. Spusť lokální Supabase pro Codespaces

```bash
npm run supabase:start:codespaces
```

Příkaz odvodí veřejné adresy z Codespaces prostředí, spustí lokální Supabase a zapíše URL aplikace a API do ignorovaného souboru `.env.local`. Verzovaný `supabase/config.toml` po startu vrátí do původního stavu. Při prvním běhu může stažení Supabase CLI a Docker obrazů trvat několik minut.

Potom zobraz lokální klíče:

```bash
npx supabase status
```

Z výpisu zkopíruj hodnotu **anon key** do `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_ANON_KEY=<lokální anon key>
```

Tento krok je na čistém checkoutu nutný: Codespaces skript automaticky nastavuje URL, ale lokální anon key do souboru nedoplňuje.

### 3. Spusť aplikaci

```bash
npm run dev
```

V panelu **Ports** nastav porty `3000` a `54321` na **Public**. U portu `3000` zvol **Open in Browser**. Port `54321` musí být veřejný, aby šel otevřít Supabase magic link; port `3000` musí být veřejný, aby se z něj přihlášení mohlo vrátit do aplikace.

Pro přihlášení otevři Mailpit přes port `54324` v panelu **Ports**, v aplikaci si vyžádej magic link a otevři nejnovější zprávu. Odkaz musí používat adresu ve tvaru `https://<CODESPACE_NAME>-54321.app.github.dev/auth/v1/verify` a vracet se na port `3000` s cestou `/rezervace`.

> Po změně `.env.local` vždy restartuj `npm run dev`, protože Next.js načítá veřejné proměnné při startu serveru.

### Další spuštění stejného Codespace

Po zastavení nebo restartu Codespace spusť znovu:

```bash
npm run supabase:start:codespaces
npm run dev
```

Pokud se změnil název Codespace nebo jeho veřejné URL, skript `.env.local` aktualizuje. Hodnota `NEXT_PUBLIC_SUPABASE_ANON_KEY` zůstane zachovaná.

## Lokální spuštění

### Předpoklady

- Node.js 22 LTS a npm; při použití nvm aktivuj verzi příkazem `nvm use`;
- běžící Docker;
- Supabase CLI spouštěné přes `npx` nebo nainstalované samostatně.

### 1. Nainstaluj závislosti

Na čistém checkoutu použij reprodukovatelnou instalaci podle `package-lock.json`:

```bash
npm ci
```

### 2. Spusť lokální Supabase

```bash
npx supabase start
```

První spuštění stáhne potřebné kontejnery. Migrace a seed se při čistém startu aplikují z adresáře `supabase/`. Stav služeb a lokální klíče zobrazíš příkazem:

```bash
npx supabase status
```

Pro opětovné vytvoření databáze použij `npx supabase db reset`. Reset odstraní všechna aktuální data v lokální databázi a znovu aplikuje migrace a seed.

### 3. Nastav prostředí

Vytvoř lokální konfiguraci z připravené šablony:

```bash
cp .env.example .env.local
```

V `.env.local` nahraď `your-local-anon-key` hodnotou **anon key** z `npx supabase status`. Pro standardní lokální běh ponech tyto hodnoty:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<lokální anon key>
NEXT_PUBLIC_SUPABASE_REDIRECT_URL=http://localhost:3000/rezervace
NEXT_PUBLIC_SUPABASE_AUTH_REDIRECT_URL=http://localhost:3000/rezervace
```

Soubor `.env.local` se necommituje.

| Proměnná | Povinnost | Účel |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ano | URL Supabase API používaná aplikací. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ano | Veřejný anon/publishable klíč pro klientská a veřejná API volání. |
| `NEXT_PUBLIC_SUPABASE_REDIRECT_URL` | doporučeno | Absolutní URL pro návrat z magic linku; aplikace vždy použije cestu `/rezervace`. |
| `NEXT_PUBLIC_SUPABASE_AUTH_REDIRECT_URL` | volitelná kompatibilita | Starší alternativa redirect URL; při nastavení obou proměnných má přednost `NEXT_PUBLIC_SUPABASE_REDIRECT_URL`. |
| `SUPABASE_SERVICE_ROLE_KEY` | pouze autentizované E2E | Serverový klíč pro přípravu profilů a cílený úklid E2E dat; nesmí se použít ve frontend kódu ani commitnout. |

Secrets pro Edge Function `process-notification-outbox` se nenastavují jako
`NEXT_PUBLIC_*` ani do klientského prostředí Vercelu. Patří do secrets příslušného
Supabase projektu:

```bash
supabase secrets set \
  RESEND_API_KEY=<serverový-api-klíč> \
  NOTIFICATION_FROM_EMAIL='RezervujKurt <rezervace@example.cz>' \
  SITE_URL='https://rezervuj-kurt.vercel.app'
```

`SUPABASE_URL` a `SUPABASE_SERVICE_ROLE_KEY` poskytuje hostované Edge Function
automaticky Supabase. Pro lokální spuštění je nutné dodat odpovídající lokální
hodnoty bezpečným způsobem; service-role klíč nesmí být dostupný v klientu.

### Worker e-mailových notifikací

Po nasazení migrací nasaď Edge Function:

```bash
supabase functions deploy process-notification-outbox
```

Worker přijímá pouze `POST` autorizovaný service-role klíčem. Jednorázové ruční
spuštění lze provést například takto:

```bash
curl --request POST \
  --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/functions/v1/process-notification-outbox"
```

V produkci použij nativní Supabase Cron s `pg_net` a Vault. Kompletní postup,
bezpečný SQL snippet, monitoring, ověření i porovnání s GitHub Actions jsou v
[`docs/notifikacni-worker.md`](docs/notifikacni-worker.md). Scheduler volá funkci
metodou `POST` každou minutu a service-role token zůstává pouze ve Vault.
Worker atomicky claimuje nejvýše deset událostí, po chybě plánuje exponenciální
retry a po pěti pokusech ponechá událost ve stavu `failed` pro ruční kontrolu.

### 4. Spusť aplikaci

```bash
npm run dev
```

Aplikace je dostupná na [http://localhost:3000](http://localhost:3000). Lokální e-maily s magic linkem otevřeš v Mailpit rozhraní, jehož URL vypíše `npx supabase status`.

## Řešení častých problémů

### Magic link hlásí `127.0.0.1:54321 refused to connect`

- **Lokálně:** ověř `npx supabase status`; pokud služby neběží, spusť `npx supabase start`. Potom si vyžádej nový magic link, protože starý mohl vypršet nebo už být použitý.
- **V Codespaces:** nepoužívej běžné `npx supabase start`. Spusť `npm run supabase:start:codespaces`, nastav porty `3000` a `54321` na **Public**, restartuj `npm run dev` a vyžádej si nový magic link.

### Aplikace hlásí chybějící Supabase konfiguraci

Ověř, že `.env.local` obsahuje neprázdné hodnoty `NEXT_PUBLIC_SUPABASE_URL` a `NEXT_PUBLIC_SUPABASE_ANON_KEY`, a poté restartuj vývojový server.

### Supabase po změně migrací používá staré schéma

```bash
npx supabase db reset
```

Tento příkaz smaže lokální databázová data. Nepoužívej jej proti hostovanému produkčnímu projektu.

> `npm run supabase:start:codespaces` je pouze vývojový příkaz. Produkční aplikace musí používat hostovaný Supabase projekt a veřejné HTTPS redirect URL.

## Kontroly kvality

Základní kontroly odpovídající workflow **Build Gate**:

```bash
npm run lint
npm run test
npm run check:rls
npm run build
```

Před produkčním releasem spusť přísnější kontrolu RLS migrací:

```bash
npm run check:rls:prod
```

Produkční build lze lokálně spustit až po úspěšném `npm run build`:

```bash
npm run start
```

## E2E testy

Playwright používá Chromium a ve výchozím nastavení si spustí Next.js dev server. Před prvním lokálním během nainstaluj prohlížeč:

```bash
npx playwright install chromium
```

Lokální Supabase musí běžet. Před autentizovanými scénáři exportuj do aktuálního shellu lokální URL, anon key a service-role key:

```bash
eval "$(npx supabase status -o env \
  --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
  --override-name auth.anon_key=NEXT_PUBLIC_SUPABASE_ANON_KEY \
  --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY)"
```

Service-role key používej pouze v lokálním nebo zabezpečeném CI prostředí. Dostupné scénáře:

```bash
# Anonymní read-only smoke
npm run test:e2e:smoke

# Vytvoření member/admin session přes lokální Mailpit
npm run test:e2e:auth:bootstrap

# Rezervační lifecycle; vyžaduje již připravené session soubory
npm run test:e2e:lifecycle

# Doporučený autentizovaný průchod včetně přípravy session
npm run test:e2e:lifecycle:with-auth-bootstrap
```

Pokud aplikace neběží na výchozím `http://127.0.0.1:3000`, nastav `PLAYWRIGHT_BASE_URL`. Přesné předpoklady, seed účty a stabilizační pravidla popisuje [E2E smoke strategie](docs/e2e-smoke-strategy.md).

## Dostupné npm skripty

| Příkaz | Popis |
|---|---|
| `npm run dev` | Spustí Next.js vývojový server. |
| `npm run build` | Vytvoří produkční build. |
| `npm run start` | Spustí vytvořený produkční build. |
| `npm run lint` | Spustí neinteraktivní ESLint kontrolu. |
| `npm run test` | Spustí unit testy; aktuálně je aliasem `test:unit`. |
| `npm run test:unit` | Přeloží testovací TypeScript a spustí Node.js test runner. |
| `npm run check:rls` | Ověří bezpečnostní invariantu RLS migrací pro vývoj. |
| `npm run check:rls:prod` | Spustí přísnější release kontrolu RLS migrací. |
| `npm run supabase:start:codespaces` | Spustí lokální Supabase s veřejnými URL aktuálního Codespace a aktualizuje `.env.local`. |
| `npm run test:e2e:smoke` | Spustí anonymní Playwright smoke scénář. |
| `npm run test:e2e:auth` | Spustí auth bootstrap; kompatibilní alias `test:e2e:auth:bootstrap`. |
| `npm run test:e2e:auth:bootstrap` | Připraví a ověří member/admin Playwright session. |
| `npm run test:e2e:lifecycle` | Spustí autentizovaný rezervační lifecycle s existující session. |
| `npm run test:e2e:lifecycle:with-auth-bootstrap` | Připraví session a následně spustí lifecycle. |

## Struktura repozitáře

- `app/` – stránky a API route pro auth OTP proxy;
- `components/` – sdílené UI komponenty;
- `lib/` – doménové typy, Supabase klienti a aplikační služby;
- `supabase/` – lokální konfigurace, migrace, seed a e-mailová šablona;
- `tests/` – unit a integrační testy spouštěné přes Node.js test runner;
- `e2e/` – Playwright smoke a lifecycle scénáře;
- `.github/workflows/` – build gate a automatizované E2E ověření;
- `docs/` – aktivní projektový checklist a provozní/testovací dokumentace.

## Související dokumentace

- [Další postup projektu](docs/dalsi-postup.md) – aktivní zdroj pravdy pro priority a podmínky dokončení;
- [Runtime verification checklist](docs/runtime-verification.md) – ruční ověření aplikace nad lokální Supabase;
- [E2E smoke strategie](docs/e2e-smoke-strategy.md) – rozsah, předpoklady a spouštění Playwright scénářů;
- [E2E PR stability log](docs/e2e-pr-stability-log.md) – evidence automatických PR běhů.
