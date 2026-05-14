# RezervujKurt

Webový rezervační systém pro tenisové kurty TJ Baník Stříbro.

## Stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Připraveno pro Supabase + Vercel

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
