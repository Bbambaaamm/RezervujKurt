# RezervujKurt

Webový rezervační systém pro tenisové kurty TJ Baník Stříbro.

## Stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Připraveno pro Supabase + Vercel

## Spuštění projektu přímo z GitHubu

### Varianta A (doporučeno): GitHub Codespaces
1. Otevři repozitář na GitHubu.
2. Klikni na **Code** → **Codespaces** → **Create codespace on main**.
3. Po otevření terminálu v Codespaces spusť čistou instalaci závislostí (pomůže předejít chybám typu `ENOTEMPTY` nebo `next: not found`):

```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

4. V panelu **Ports** otevři port `3000` v prohlížeči.

5. Pokud by instalace i tak selhala, spusť ještě:

```bash
npm cache verify
rm -rf node_modules package-lock.json
npm install
```

> Poznámka: V Codespaces není potřeba lokální instalace Node.js, běh probíhá v cloudovém vývojovém prostředí GitHubu.

### Varianta B: Klon repozitáře z GitHubu do lokálního počítače
```bash
git clone <URL_REPOZITARE>
cd RezervujKurt
npm install
npm run dev
```

Poté otevři `http://localhost:3000`.

## Spuštění projektu (lokálně)

### 1) Předpoklady
- Nainstalovaný Node.js a npm.

> Poznámka: V repozitáři není definovaná povinná verze Node.js (`engines`), takže použij aktuální LTS verzi Node.js.

### 2) Instalace závislostí
V kořeni projektu spusť:

```bash
npm install
```

### 3) Spuštění vývojového serveru
```bash
npm run dev
```

Po spuštění otevři v prohlížeči:

- http://localhost:3000

### 4) Produkční build a spuštění (volitelně)
Vytvoření build artefaktů:

```bash
npm run build
```

Spuštění aplikace v produkčním režimu:

```bash
npm run start
```

### 5) Kontrola lint pravidel (volitelně)
```bash
npm run lint
```

## Dostupné npm skripty
- `npm run dev` – spustí vývojový server (Next.js).
- `npm run build` – vytvoří produkční build.
- `npm run start` – spustí aplikaci z produkčního buildu.
- `npm run lint` – spustí ESLint kontrolu.

## Struktura
- `app/` – stránky (Domů, Rezervace, Přihlášení, Admin)
- `components/` – sdílené UI komponenty
- `lib/` – doménové typy a mock data

## Aktuální stav (MVP základ)
- české UI a základní layout
- denní přehled všech 3 kurtů na jedné stránce
- hodinové sloty a vizuální rozlišení stavu
- základ připravený pro další napojení na Supabase

## Další kroky
1. Přidat Supabase schéma (profiles, reservations, payments, audit log...).
2. Napojit autentizaci (Google, Apple, e-mail).
3. Implementovat formulář rezervace a workflow schvalování.
4. Přidat notifikační e-mail službu (placeholder/service vrstva).

## Supabase (základ schématu)
V repozitáři je připravená inicializační migrace a seed:
- `supabase/migrations/20260514120000_init_reservation_schema.sql`
- `supabase/seed.sql`

Příklad spuštění přes Supabase CLI:

```bash
supabase db reset
```

Případně samostatně:

```bash
supabase migration up
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```


## Supabase Auth (magic link) – lokální ověření redirect URL

Pokud se v Mailpitu objevuje `127.0.0.1` v magic linku, postupuj přesně takto (CLI musí načíst aktuální `supabase/config.toml`):

```bash
npx supabase stop
npx supabase start
```

Poté:
1. V aplikaci odešli nový magic link (přihlášení přes e-mail).
2. Otevři Mailpit inbox a zkontroluj odkaz v e-mailu.
3. Ověř, že tlačítko/odkaz používá `{{ .ConfirmationURL }}` (ne ručně skládané `{{ .SiteURL }}/auth/v1/verify?...`).
4. Ověř, že query parametr `redirect_to` odpovídá hodnotě z request payloadu (např. `/rezervace`).

Poznámka: v tomto repozitáři je magic link šablona explicitně nastavena v `supabase/config.toml` přes `[auth.email.template.magic_link]` a HTML šablonu `supabase/templates/magic_link.html`.

### Codespaces poznámka k magic link hostu
V GitHub Codespaces musí magic link v e-mailové šabloně používat veřejný Supabase API host na portu `54321` (např. `https://<CODESPACE_NAME>-54321.app.github.dev`), ne lokální `127.0.0.1`.

Pokud by link mířil na `127.0.0.1`, e-mail otevřený mimo kontejner nedokončí ověření, protože localhost adresa je dostupná jen uvnitř Codespace kontejneru.

## Debug veřejného occupancy čtení pro `/rezervace`

Rychlý anonymní REST test (bez osobních údajů), který má vrátit i `pending` rezervace:

```bash
curl \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/reservations?select=id,court_id,reservation_date,time_from,time_to,status&reservation_date=eq.2026-05-21&status=in.(pending,approved)"
```

Očekávání: odpověď obsahuje `pending` rezervaci pro daný den (např. `court_id=2`, `time_from=16:00:00`, `time_to=18:00:00`).


## Codespace host rotation

Při vytvoření nového Codespace se změní veřejný host. Aby fungovalo přihlášení přes magic link, je potřeba sjednotit host ve frontend env i v Supabase konfiguraci.

1. Zjisti `CODESPACE_NAME`:
   - v aktivním Codespace obvykle `echo $CODESPACE_NAME`,
   - případně z URL otevřeného portu (část před `-3000.app.github.dev`).
2. Nastav `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<CODESPACE_NAME>-54321.app.github.dev
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key z npx supabase status>
NEXT_PUBLIC_SUPABASE_REDIRECT_URL=https://<CODESPACE_NAME>-3000.app.github.dev
```

3. Uprav `supabase/config.toml`:
   - `auth.site_url` na `https://<CODESPACE_NAME>-3000.app.github.dev`,
   - `auth.additional_redirect_urls` minimálně pro root a `/rezervace` na stejném hostu.
4. Uprav `supabase/templates/magic_link.html`:
   - odkaz musí mířit na `https://<CODESPACE_NAME>-54321.app.github.dev/auth/v1/verify?...`.
5. Po změně konfigurace proveď restart Supabase:

```bash
npx supabase stop && npx supabase start
```

6. Odešli nový magic link. Staré magic linky po změně hostu/configu už nejsou validní.
