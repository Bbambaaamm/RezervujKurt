# Cílová prostředí projektu RezervujKurt

> Rozhodnutí vlastníka projektu pro první produkční verzi s cílovými náklady **0 Kč/měsíc**.

- **Stav:** částečně rozhodnuto
- **Datum rozhodnutí:** 11. 6. 2026
- **Repozitář:** GitHub
- **Hosting aplikace:** Vercel Hobby
- **Databáze a autentizace:** Supabase Free
- **Doporučený transakční e-mail pro auth:** Brevo Free (custom SMTP v Supabase; čeká na potvrzení a konfiguraci)

## 1. Cíl a hranice rozhodnutí

První produkční verze bude provozována pouze na bezplatných tarifech GitHubu, Vercel Hobby, Supabase Free a potvrzeného SMTP poskytovatele. Architektura proto nesmí předpokládat placenou infrastrukturu ani vlastní doménu.

Rozhodnutí určuje poskytovatele, oddělení prostředí a vlastnictví konfigurace. P1 zatím není plně dokončené, protože ještě nejsou známé:

- konkrétní URL staging a production deploymentu na Vercelu;
- konkrétní Supabase project ref pro staging a production;
- konečný seznam osob s přístupem k Vercel a Supabase projektům;
- přesné povolené auth redirect URL odvozené z nasazených aplikačních URL;
- potvrzení Brevo Free jako SMTP poskytovatele, založený účet, ověřený odesílatel a SMTP credentials pro staging a production;
- prakticky ověřené doručování magic linků na adresy mimo tým Supabase projektu.

Tyto hodnoty se nesmí odhadovat ani nahrazovat smyšlenými identifikátory. Po vytvoření projektů se doplní do matice níže.

## 2. Cílová bezplatná architektura

```text
GitHub repozitář
    ├── lokální vývoj / GitHub Codespaces
    │       └── lokální Supabase
    ├── Vercel projekt (Hobby)
    │       ├── Preview deployment (staging)
    │       │       └── samostatný Supabase Free projekt pro staging
    │       └── Production deployment
    │               └── samostatný Supabase Free projekt pro production
    └── Brevo Free (doporučený custom SMTP)
            ├── auth e-maily staging Supabase projektu
            └── auth e-maily production Supabase projektu
```

- **GitHub** je zdroj pravdy pro verzovaný kód, dokumentaci, migrace a CI kontroly.
- **Vercel Hobby** sestavuje aplikaci z GitHub repozitáře. Preview deployment slouží jako staging, production deployment jako veřejná produkce.
- **Supabase Free** poskytuje databázi a autentizaci. Staging a production používají různé projekty, aby se nemíchala data, uživatelé ani auth konfigurace.
- **Development** používá lokální Supabase a lokální Mailpit; skutečné e-maily se při vývoji neposílají. Codespaces je pouze vzdálené vývojové pracoviště; není staging ani production.
- **Brevo Free** je doporučený custom SMTP poskytovatel pro první veřejnou verzi. Bezplatný tarif podporuje SMTP a aktuálně omezuje odesílání na 300 e-mailů denně.
- Bezplatný provoz platí pouze při dodržení limitů tarifů. Překročení limitu se nesmí automaticky řešit přechodem na placený tarif bez nového rozhodnutí vlastníka projektu.

## 3. Prostředí

### Development

- Aplikace běží lokálně přes `npm run dev` nebo v GitHub Codespaces.
- Databáze a autentizace běží v lokální Supabase instanci.
- Vývojář spravuje lokální hodnoty v ignorovaném souboru `.env.local`; sdílené citlivé hodnoty pro Codespaces patří do GitHub Codespaces secrets, nikoli do repozitáře.
- Auth redirect vede na lokální nebo aktuální Codespaces URL aplikace a cestu `/rezervace`.
- Auth e-maily zachytává lokální Mailpit; Brevo ani produkční SMTP credentials se v development prostředí nepoužívají.

### Staging

- Staging tvoří Vercel Preview deployment propojený s GitHub branchem nebo pull requestem určeným k ověření.
- Používá samostatný Supabase Free projekt určený pouze pro staging.
- Aplikační proměnné se spravují ve Vercelu pro prostředí **Preview**.
- Staging Supabase projekt používá custom SMTP Brevo Free. SMTP host, port, uživatelské jméno, heslo a ověřený odesílatel se spravují pouze v Supabase Dashboardu daného projektu.
- Povolené Supabase Auth redirect URL musí odpovídat používané Preview URL. Konkrétní URL nebo bezpečně omezený vzor se nastaví až po vytvoření Vercel projektu a ověření skutečného formátu Preview URL.
- Staging nesmí používat produkční databázi, produkční uživatele ani produkční secrets.

### Production

- Produkce běží jako Vercel Hobby production deployment z produkční větve nastavené ve Vercelu.
- Používá samostatný Supabase Free projekt určený pouze pro produkční data a autentizaci.
- Aplikační proměnné se spravují ve Vercelu pro prostředí **Production**.
- Production Supabase projekt používá custom SMTP Brevo Free. SMTP credentials se ukládají pouze do Supabase Auth SMTP settings a nesmí být vložené do Vercelu, `.env` souborů ani repozitáře.
- Veřejný provoz se nesmí prohlásit za auth-ready, dokud magic link přes Brevo nedorazí na externí adresy mimo tým projektu a u alespoň dvou běžných poskytovatelů schránek.
- Supabase Auth Site URL a povolený redirect musí odpovídat skutečné produkční Vercel URL a cestě `/rezervace`.
- Přístup k produkčnímu Vercel a Supabase projektu má pouze vlastník projektu a jím výslovně pověření správci.

## 4. Matice prostředí

| Prostředí | Aplikační URL | Supabase projekt | Secrets spravuje | Přístup | Auth redirect |
|---|---|---|---|---|---|
| Development | `http://localhost:3000`, případně aktuální Codespaces URL | Lokální Supabase + Mailpit | Vývojář v ignorovaném `.env.local`; případné sdílené hodnoty v GitHub Codespaces secrets; bez Brevo credentials | Vývojář pracující na daném lokálním prostředí / Codespace | `http://localhost:3000/rezervace`, případně aktuální Codespaces URL s cestou `/rezervace` |
| Staging | Bude doplněna konkrétní Vercel Preview URL | Samostatný Supabase Free projekt; project ref bude doplněn | Pověřený správce ve Vercel **Preview** environment variables; auth a Brevo SMTP credentials v Supabase Dashboardu | Vlastník projektu a výslovně pověření správci; aplikační přístup podle účelu testu | Bude doplněna a povolena po vzniku Preview deploymentu; musí končit cestou `/rezervace` |
| Production | Bude doplněna konkrétní Vercel production URL | Samostatný Supabase Free projekt; project ref bude doplněn | Pověřený správce ve Vercel **Production** environment variables; auth a Brevo SMTP credentials v Supabase Dashboardu | Vlastník projektu a výslovně pověření správci; veřejný přístup k aplikaci | Bude doplněna a explicitně povolena podle production URL; musí končit cestou `/rezervace` |

## 5. Doručování magic linků přes SMTP

Aplikace se přihlašuje výhradně e-mailem přes Supabase magic link. Výchozí SMTP služba Supabase není vhodná pro veřejnou produkci: bez custom SMTP odmítá adresy mimo tým projektu, má velmi nízký limit a neposkytuje produkční garanci doručení. Staging i production proto musí před veřejným použitím dostat vlastní SMTP konfiguraci.

Pro cíl 0 Kč/měsíc je doporučen **Brevo Free**:

- podporuje standardní SMTP relay kompatibilní se Supabase Auth;
- bezplatný tarif aktuálně umožňuje 300 odeslaných e-mailů denně;
- SMTP credentials a adresa odesílatele se nastavují samostatně v každém Supabase projektu;
- přístup k Brevo účtu a oběma Supabase projektům má pouze vlastník projektu a výslovně pověření správci.

Vlastník projektu zatím odložil vlastní doménu. Pro první technické ověření lze v Brevo použít individuálně ověřenou adresu odesílatele, ale bez autentizované vlastní domény nelze předem garantovat doručitelnost ani reputaci odesílatele. Toto je vědomé provozní riziko, nikoli splněná produkční podmínka. Před zveřejněním musí projít reálný test doručení, otevření magic linku a návratu do aplikace alespoň na dvou externích adresách mimo tým Supabase projektu (doporučeně u dvou různých poskytovatelů schránek).

Pokud test nebude spolehlivý, je nutné přehodnotit odklad vlastní domény, doménu pořídit a nastavit SPF, DKIM a DMARC. Placený SMTP tarif ani koupě domény nesmí proběhnout bez nového rozhodnutí vlastníka projektu.

Oficiální podklady:

- [Supabase: Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase: Production Checklist](https://supabase.com/docs/guides/platform/going-into-prod/)
- [Brevo: bezplatný tarif](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans)
- [Brevo: vytvoření a ověření odesílatele](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email)

## 6. Vlastní doména

Vlastní doména se v první produkční verzi **nepoužívá**. Aplikace bude do dalšího rozhodnutí používat URL přidělenou Vercel platformou. Vlastní doména, DNS a odpovídající změny Supabase Auth Site URL a redirect allowlistu se doplní později jako samostatná provozní změna.

## 7. Bezpečná pravidla konfigurace

1. **Žádné skutečné secrets nesmí být uložené v Git repozitáři**, commitech, pull requestech, veřejné dokumentaci ani klientských logách.
2. Lokální secrets patří do ignorovaného `.env.local`; Vercel hodnoty patří do environment variables příslušného deployment prostředí; Supabase auth konfigurace patří do odpovídajícího Supabase projektu.
3. **Supabase service-role key se nikdy nesmí uložit do proměnné s prefixem `NEXT_PUBLIC_`** ani jinak zpřístupnit klientskému bundle. Pokud je někdy nutný pro zabezpečený serverový nebo CI úkol, musí být uložen jako neveřejný secret s nejmenším nutným rozsahem přístupu.
4. Hodnoty `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` a `NEXT_PUBLIC_SUPABASE_REDIRECT_URL` musí vždy patřit ke stejnému prostředí.
5. **Změna environment variables vyžaduje nový Vercel deployment nebo restart lokálního vývojového serveru.** Nestačí upravit hodnotu za běhu již sestavené aplikace.
6. **Staging a production data se nesmí míchat.** Je zakázáno připojit staging deployment k production Supabase projektu nebo production deployment ke staging projektu.
7. Auth redirect URL se povolují jen pro skutečně používané hosty a požadovanou cestu. Po změně aplikační URL se musí současně zkontrolovat Vercel konfigurace i Supabase Auth allowlist.
8. SMTP heslo nebo klíč je neveřejný secret. Nesmí mít prefix `NEXT_PUBLIC_` ani být uložený ve Vercelu, pokud ho používá pouze Supabase Auth. Pro staging a production se použijí oddělené SMTP klíče, pokud to zvolený poskytovatel umožňuje; případné sdílení musí vlastník výslovně schválit a evidovat.
9. Veřejný Supabase anon key není náhradou za autorizaci. Přístup k datům musí nadále vynucovat databázové RLS politiky; toto rozhodnutí je však nemění.

## 8. Konfigurace proměnných

Repozitář obsahuje verzovaný `.env.example` s ukázkovými lokálními hodnotami a bez skutečných secrets. Pro všechna tři prostředí jsou relevantní zejména:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_REDIRECT_URL=
```

Skutečné hodnoty se doplňují pouze v úložišti konfigurace daného prostředí. `.env.example` slouží jako šablona a nesmí obsahovat staging ani production credentials. SMTP konfigurace není aplikační environment variable: nastavuje se přímo v Supabase Auth SMTP settings a do `.env.example` nepatří.

## 9. Podmínky dokončení P1

P1 lze označit jako plně dokončené až po provedení těchto kroků:

- [ ] vytvořit nebo potvrdit Vercel projekt a zapsat konkrétní Preview a Production URL;
- [ ] vytvořit dva oddělené Supabase Free projekty a zapsat jejich project refs;
- [ ] nastavit oddělené Preview a Production environment variables ve Vercelu;
- [ ] potvrdit Brevo Free jako SMTP poskytovatele nebo zdokumentovat jinou variantu kompatibilní s cílem 0 Kč/měsíc; následně založit účet, ověřit odesílatele a nastavit oddělené custom SMTP konfigurace ve staging a production Supabase projektu;
- [ ] nastavit a ověřit Site URL a povolené auth redirect URL v obou Supabase projektech;
- [ ] ověřit doručení a použití magic linku přes custom SMTP alespoň na dvou externích adresách mimo tým Supabase projektu;
- [ ] zapsat konkrétní vlastníky a osoby s administrátorským přístupem;
- [ ] ověřit, že staging deployment používá pouze staging Supabase a production deployment pouze production Supabase;
- [ ] doplnit datum a důkaz dokončení do `docs/dalsi-postup.md`.
