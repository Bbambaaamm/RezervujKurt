# Cílová prostředí projektu RezervujKurt

> Rozhodnutí vlastníka projektu pro první produkční verzi s cílovými náklady **0 Kč/měsíc**.

- **Stav:** částečně rozhodnuto
- **Datum rozhodnutí:** 11. 6. 2026
- **Repozitář:** GitHub
- **Hosting aplikace:** Vercel Hobby
- **Databáze a autentizace:** Supabase Free

## 1. Cíl a hranice rozhodnutí

První produkční verze bude provozována pouze na bezplatných tarifech GitHubu, Vercel Hobby a Supabase Free. Architektura proto nesmí předpokládat placenou infrastrukturu ani vlastní doménu.

Rozhodnutí určuje poskytovatele, oddělení prostředí a vlastnictví konfigurace. P1 zatím není plně dokončené, protože ještě nejsou známé:

- konkrétní URL staging a production deploymentu na Vercelu;
- konkrétní Supabase project ref pro staging a production;
- konečný seznam osob s přístupem k Vercel a Supabase projektům;
- přesné povolené auth redirect URL odvozené z nasazených aplikačních URL.

Tyto hodnoty se nesmí odhadovat ani nahrazovat smyšlenými identifikátory. Po vytvoření projektů se doplní do matice níže.

## 2. Cílová bezplatná architektura

```text
GitHub repozitář
    ├── lokální vývoj / GitHub Codespaces
    │       └── lokální Supabase
    └── Vercel projekt (Hobby)
            ├── Preview deployment (staging)
            │       └── samostatný Supabase Free projekt pro staging
            └── Production deployment
                    └── samostatný Supabase Free projekt pro production
```

- **GitHub** je zdroj pravdy pro verzovaný kód, dokumentaci, migrace a CI kontroly.
- **Vercel Hobby** sestavuje aplikaci z GitHub repozitáře. Preview deployment slouží jako staging, production deployment jako veřejná produkce.
- **Supabase Free** poskytuje databázi a autentizaci. Staging a production používají různé projekty, aby se nemíchala data, uživatelé ani auth konfigurace.
- **Development** používá lokální Supabase. Codespaces je pouze vzdálené vývojové pracoviště; není staging ani production.
- Bezplatný provoz platí pouze při dodržení limitů tarifů. Překročení limitu se nesmí automaticky řešit přechodem na placený tarif bez nového rozhodnutí vlastníka projektu.

## 3. Prostředí

### Development

- Aplikace běží lokálně přes `npm run dev` nebo v GitHub Codespaces.
- Databáze a autentizace běží v lokální Supabase instanci.
- Vývojář spravuje lokální hodnoty v ignorovaném souboru `.env.local`; sdílené citlivé hodnoty pro Codespaces patří do GitHub Codespaces secrets, nikoli do repozitáře.
- Auth redirect vede na lokální nebo aktuální Codespaces URL aplikace a cestu `/rezervace`.

### Staging

- Staging tvoří Vercel Preview deployment propojený s GitHub branchem nebo pull requestem určeným k ověření.
- Používá samostatný Supabase Free projekt určený pouze pro staging.
- Aplikační proměnné se spravují ve Vercelu pro prostředí **Preview**.
- Povolené Supabase Auth redirect URL musí odpovídat používané Preview URL. Konkrétní URL nebo bezpečně omezený vzor se nastaví až po vytvoření Vercel projektu a ověření skutečného formátu Preview URL.
- Staging nesmí používat produkční databázi, produkční uživatele ani produkční secrets.

### Production

- Produkce běží jako Vercel Hobby production deployment z produkční větve nastavené ve Vercelu.
- Používá samostatný Supabase Free projekt určený pouze pro produkční data a autentizaci.
- Aplikační proměnné se spravují ve Vercelu pro prostředí **Production**.
- Supabase Auth Site URL a povolený redirect musí odpovídat skutečné produkční Vercel URL a cestě `/rezervace`.
- Přístup k produkčnímu Vercel a Supabase projektu má pouze vlastník projektu a jím výslovně pověření správci.

## 4. Matice prostředí

| Prostředí | Aplikační URL | Supabase projekt | Secrets spravuje | Přístup | Auth redirect |
|---|---|---|---|---|---|
| Development | `http://localhost:3000`, případně aktuální Codespaces URL | Lokální Supabase | Vývojář v ignorovaném `.env.local`; případné sdílené hodnoty v GitHub Codespaces secrets | Vývojář pracující na daném lokálním prostředí / Codespace | `http://localhost:3000/rezervace`, případně aktuální Codespaces URL s cestou `/rezervace` |
| Staging | Bude doplněna konkrétní Vercel Preview URL | Samostatný Supabase Free projekt; project ref bude doplněn | Pověřený správce ve Vercel **Preview** environment variables; auth nastavení v Supabase Dashboardu | Vlastník projektu a výslovně pověření správci; aplikační přístup podle účelu testu | Bude doplněna a povolena po vzniku Preview deploymentu; musí končit cestou `/rezervace` |
| Production | Bude doplněna konkrétní Vercel production URL | Samostatný Supabase Free projekt; project ref bude doplněn | Pověřený správce ve Vercel **Production** environment variables; auth nastavení v Supabase Dashboardu | Vlastník projektu a výslovně pověření správci; veřejný přístup k aplikaci | Bude doplněna a explicitně povolena podle production URL; musí končit cestou `/rezervace` |

## 5. Vlastní doména

Vlastní doména se v první produkční verzi **nepoužívá**. Aplikace bude do dalšího rozhodnutí používat URL přidělenou Vercel platformou. Vlastní doména, DNS a odpovídající změny Supabase Auth Site URL a redirect allowlistu se doplní později jako samostatná provozní změna.

## 6. Bezpečná pravidla konfigurace

1. **Žádné skutečné secrets nesmí být uložené v Git repozitáři**, commitech, pull requestech, veřejné dokumentaci ani klientských logách.
2. Lokální secrets patří do ignorovaného `.env.local`; Vercel hodnoty patří do environment variables příslušného deployment prostředí; Supabase auth konfigurace patří do odpovídajícího Supabase projektu.
3. **Supabase service-role key se nikdy nesmí uložit do proměnné s prefixem `NEXT_PUBLIC_`** ani jinak zpřístupnit klientskému bundle. Pokud je někdy nutný pro zabezpečený serverový nebo CI úkol, musí být uložen jako neveřejný secret s nejmenším nutným rozsahem přístupu.
4. Hodnoty `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` a `NEXT_PUBLIC_SUPABASE_REDIRECT_URL` musí vždy patřit ke stejnému prostředí.
5. **Změna environment variables vyžaduje nový Vercel deployment nebo restart lokálního vývojového serveru.** Nestačí upravit hodnotu za běhu již sestavené aplikace.
6. **Staging a production data se nesmí míchat.** Je zakázáno připojit staging deployment k production Supabase projektu nebo production deployment ke staging projektu.
7. Auth redirect URL se povolují jen pro skutečně používané hosty a požadovanou cestu. Po změně aplikační URL se musí současně zkontrolovat Vercel konfigurace i Supabase Auth allowlist.
8. Veřejný Supabase anon key není náhradou za autorizaci. Přístup k datům musí nadále vynucovat databázové RLS politiky; toto rozhodnutí je však nemění.

## 7. Konfigurace proměnných

Repozitář obsahuje verzovaný `.env.example` s ukázkovými lokálními hodnotami a bez skutečných secrets. Pro všechna tři prostředí jsou relevantní zejména:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_REDIRECT_URL=
```

Skutečné hodnoty se doplňují pouze v úložišti konfigurace daného prostředí. `.env.example` slouží jako šablona a nesmí obsahovat staging ani production credentials.

## 8. Podmínky dokončení P1

P1 lze označit jako plně dokončené až po provedení těchto kroků:

- [ ] vytvořit nebo potvrdit Vercel projekt a zapsat konkrétní Preview a Production URL;
- [ ] vytvořit dva oddělené Supabase Free projekty a zapsat jejich project refs;
- [ ] nastavit oddělené Preview a Production environment variables ve Vercelu;
- [ ] nastavit a ověřit Site URL a povolené auth redirect URL v obou Supabase projektech;
- [ ] zapsat konkrétní vlastníky a osoby s administrátorským přístupem;
- [ ] ověřit, že staging deployment používá pouze staging Supabase a production deployment pouze production Supabase;
- [ ] doplnit datum a důkaz dokončení do `docs/dalsi-postup.md`.
