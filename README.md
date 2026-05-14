# RezervujKurt

Webový rezervační systém pro tenisové kurty TJ Baník Stříbro.

## Stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Připraveno pro Supabase + Vercel

## Spuštění
```bash
npm install
npm run dev
```

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
