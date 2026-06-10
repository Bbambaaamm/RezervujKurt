# RezervujKurt

Webový rezervační systém pro tenisové kurty TJ Baník Stříbro. Aplikace používá Next.js App Router a lokální nebo hostovanou Supabase jako zdroj dat a autentizace.

## Aktuálně dostupné funkce

- veřejný denní přehled obsazenosti kurtů bez zveřejnění osobních údajů;
- přihlášení e-mailem přes Supabase magic link a zachování uživatelské session;
- vytvoření čekající rezervace přihlášeným uživatelem;
- ochrana proti duplicitám a překryvům rezervací v UI i databázi;
- přehled vlastních rezervací a zrušení povolené budoucí rezervace;
- administrátorské schválení nebo zrušení čekající rezervace;
- auditní stopa vytvoření rezervace a změn jejího stavu;
- unit testy a Playwright smoke scénáře pro anonymní i autentizovaný průchod.

Rozsah potvrzeného MVP a navazující práci eviduje [řídicí checklist](docs/dalsi-postup.md). Funkce jako blokace kurtů, produktové notifikace, platby nebo další poskytovatelé přihlášení jsou plánované, ale nejsou součástí aktuálně dokončeného základu.

## Technologie

- Next.js 15 (App Router), React 19 a TypeScript;
- Tailwind CSS;
- Supabase (PostgreSQL, Row Level Security a Auth);
- Node.js test runner a Playwright;
- GitHub Actions pro build gate a E2E lifecycle.

## Lokální spuštění

### Předpoklady

- Node.js 22 LTS a npm; při použití nvm verzi aktivuje příkaz `nvm use`;
- Docker pro lokální Supabase;
- Supabase CLI spouštěné přes `npx` nebo nainstalované samostatně.

### 1. Instalace závislostí

Na čistém checkoutu použij reprodukovatelnou instalaci podle `package-lock.json`:

```bash
npm ci
```

### 2. Spuštění lokální Supabase

```bash
npx supabase start
```

První spuštění stáhne potřebné kontejnery. Migrace a seed se při čistém startu aplikují z adresáře `supabase/`. Pro opětovné vytvoření lokální databáze použij:

```bash
npx supabase db reset
```

Pozor: reset odstraní aktuální lokální databázová data.

### 3. Nastavení prostředí

Vytvoř `.env.local` a doplň hodnoty vypsané příkazem `npx supabase status`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<lokální anon key>
NEXT_PUBLIC_SUPABASE_REDIRECT_URL=http://localhost:3000
```

| Proměnná | Povinnost | Účel |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ano | URL Supabase API používaná aplikací |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ano | veřejný anon/publishable klíč pro klientská a veřejná API volání |
| `NEXT_PUBLIC_SUPABASE_REDIRECT_URL` | doporučeno | veřejný origin aplikace pro návrat z magic linku |
| `NEXT_PUBLIC_SUPABASE_AUTH_REDIRECT_URL` | volitelná kompatibilita | starší alternativa redirect originu; pokud je nastavena i předchozí proměnná, přednost má `NEXT_PUBLIC_SUPABASE_REDIRECT_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | pouze autentizované E2E | serverový klíč pro přípravu profilů a cílený úklid E2E dat; nesmí se použít ve frontend kódu ani commitnout |

Soubor `.env.local` se necommituje. V Codespaces použij pro frontend i Supabase API veřejné URL přesměrovaných portů `3000` a `54321`. Stejný frontend host nastav také do `auth.site_url` a `auth.additional_redirect_urls` v lokální `supabase/config.toml` a poté Supabase restartuj. Verzovaná konfigurace musí zůstat na bezpečných `localhost` výchozích hodnotách.

### 4. Spuštění aplikace

```bash
npm run dev
```

Aplikace je lokálně dostupná na [http://localhost:3000](http://localhost:3000). Lokální e-maily s magic linkem lze otevřít v Mailpit rozhraní, jehož URL vypíše `npx supabase status`.

### Řešení chyby `127.0.0.1:54321 refused to connect` u magic linku

Magic link nejprve vede na Supabase Auth endpoint `/auth/v1/verify` a teprve po ověření přesměruje prohlížeč do aplikace. Adresa `127.0.0.1` proto funguje jen tehdy, když prohlížeč i Supabase běží na stejném počítači.

#### Lokální vývoj na vlastním počítači

Ověř, že současně běží Supabase i aplikace:

```bash
npx supabase status
npm run dev
```

Pokud Supabase neběží, spusť ji příkazem `npx supabase start`. Potom si vyžádej nový magic link; starý odkaz mohl vypršet nebo už být použitý.

#### GitHub Codespaces

V Codespaces výpis `npx supabase status` stále ukazuje interní adresu `127.0.0.1:54321`, ale prohlížeč potřebuje veřejnou URL přesměrovaného portu. Použij projektový příkaz:

```bash
npm run supabase:start:codespaces
```

Příkaz automaticky:

- odvodí veřejné adresy portů `3000` a `54321` z Codespaces proměnných;
- spustí Supabase s veřejným `api.external_url`, aby `ConfirmationURL` v e-mailu neobsahovala `127.0.0.1`;
- nastaví veřejný auth redirect a dočasně jej přidá do allowlistu;
- aktualizuje ignorovaný `.env.local` pro frontend;
- po startu obnoví verzovaný `supabase/config.toml`, takže hostname konkrétního Codespace nezůstane v Gitu.

V panelu **Ports** nastav porty `3000` a `54321` na **Public**, restartuj `npm run dev` a vyžádej si nový magic link. Nový odkaz musí začínat veřejnou adresou ve tvaru `https://<CODESPACE_NAME>-54321.app.github.dev/auth/v1/verify` a parametr `redirect_to` musí mířit na veřejný port `3000` s cestou `/rezervace`.

Pro nasazenou aplikaci tento vývojový příkaz nepoužívej. Produkční `NEXT_PUBLIC_SUPABASE_URL` musí ukazovat na hostovaný Supabase projekt a auth redirect na veřejnou HTTPS adresu aplikace.

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
