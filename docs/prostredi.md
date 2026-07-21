# Cílová prostředí projektu RezervujKurt

> Rozhodnutí vlastníka projektu pro první produkční verzi s cílovými náklady **0 Kč/měsíc**.

- **Stav:** rozpracováno; production konfigurace a oba Supabase projekty jsou potvrzené, chybí stálý staging Vercel projekt
- **Datum rozhodnutí:** 11. 6. 2026
- **Poslední aktualizace:** 21. 7. 2026
- **Repozitář:** GitHub
- **Hosting aplikace:** Vercel Hobby
- **Databáze a autentizace:** Supabase Free
- **Doporučený transakční e-mail pro auth:** Brevo Free (custom SMTP v Supabase; čeká na potvrzení a konfiguraci)

## 1. Cíl a hranice rozhodnutí

První produkční verze bude provozována pouze na bezplatných tarifech GitHubu, Vercel Hobby, Supabase Free a potvrzeného SMTP poskytovatele. Architektura proto nesmí předpokládat placenou infrastrukturu ani vlastní doménu.

Rozhodnutí určuje poskytovatele, oddělení prostředí a vlastnictví konfigurace. Dne `12. 6. 2026` byly potvrzeny production Vercel URL, production Supabase project ref, staging Supabase project ref a praktické propojení produkční aplikace s produkční databází.

P1 zatím není plně dokončené, protože ještě chybí:

- stálý staging Vercel projekt, doporučeně `rezervuj-kurt-staging` napojený na branch `staging`;
- konkrétní staging URL, například `https://rezervuj-kurt-staging.vercel.app`;
- konečný seznam osob s přístupem k Vercel a Supabase projektům;
- povolená auth redirect URL pro staging prostředí;
- potvrzení a konfigurace custom SMTP pro staging a production; custom SMTP neblokuje základní staging lifecycle, ale zůstává podmínkou finálního production confidence passu a širšího veřejného provozu;
- prakticky ověřené doručování přes custom SMTP na dvě externí adresy před širším veřejným provozem.

Skutečné secrets ani neveřejné osobní kontakty se do této matice nezapisují.

## 2. Cílová bezplatná architektura

```text
GitHub repozitář
    ├── lokální vývoj / GitHub Codespaces
    │       └── lokální Supabase
    ├── Vercel projekt `rezervuj-kurt-staging` (Hobby)
    │       └── staging deployment z branche `staging`
    │               └── samostatný Supabase Free projekt pro staging
    ├── Vercel projekt pro production (Hobby)
    │       └── Production deployment
    │               └── samostatný Supabase Free projekt pro production
    └── Brevo Free (doporučený custom SMTP)
            ├── auth e-maily staging Supabase projektu
            └── auth e-maily production Supabase projektu
```

- **GitHub** je zdroj pravdy pro verzovaný kód, dokumentaci, migrace a CI kontroly.
- **Vercel Hobby** sestavuje aplikaci z GitHub repozitáře. Doporučené rozdělení je samostatný Vercel projekt `rezervuj-kurt-staging` pro branch `staging` a oddělený production projekt pro veřejnou produkci.
- **Supabase Free** poskytuje databázi a autentizaci. Staging a production používají různé projekty, aby se nemíchala data, uživatelé ani auth konfigurace.
- **Development** používá lokální Supabase a lokální Mailpit; skutečné e-maily se při vývoji neposílají. Codespaces je pouze vzdálené vývojové pracoviště; není staging ani production.
- **Brevo Free** je doporučený custom SMTP poskytovatel pro první veřejnou verzi. Bezplatný tarif podporuje SMTP a aktuálně omezuje odesílání na 300 e-mailů denně. Custom SMTP není nutné dokončit před základním staging lifecycle, ale je podmínkou širšího veřejného provozu.
- Bezplatný provoz platí pouze při dodržení limitů tarifů. Překročení limitu se nesmí automaticky řešit přechodem na placený tarif bez nového rozhodnutí vlastníka projektu.

## 3. Prostředí

### Development

- Aplikace běží lokálně přes `npm run dev` nebo v GitHub Codespaces.
- Databáze a autentizace běží v lokální Supabase instanci.
- Vývojář spravuje lokální hodnoty v ignorovaném souboru `.env.local`; sdílené citlivé hodnoty pro Codespaces patří do GitHub Codespaces secrets, nikoli do repozitáře.
- Auth redirect vede na lokální nebo aktuální Codespaces URL aplikace a cestu `/rezervace`.
- Auth e-maily zachytává lokální Mailpit; Brevo ani produkční SMTP credentials se v development prostředí nepoužívají.

### Staging

- Staging má tvořit samostatný Vercel projekt `rezervuj-kurt-staging` propojený s Git branchem `staging`.
- Používá samostatný Supabase Free projekt `rrlvlgoiwesteevzupyi` určený pouze pro staging.
- Aplikační proměnné se spravují ve Vercelu pro staging projekt a všechny hodnoty musí mířit na staging Supabase projekt.
- Platební capability flag má zůstat na stagingu vypnutý (`false`), dokud není výslovně ověřeno platební flow; GoPay prostředí má být připravené jako sandbox.
- Staging Supabase projekt má před širším testováním dostat custom SMTP. SMTP host, port, uživatelské jméno, heslo a ověřený odesílatel se spravují pouze v Supabase Dashboardu daného projektu. Custom SMTP ale neblokuje základní hostovaný staging lifecycle přes výchozího poskytovatele, pokud se výsledek takto zdokumentuje.
- Povolené Supabase Auth redirect URL musí odpovídat stálé staging URL samostatného Vercel projektu a návratové cestě `/rezervace`. Konkrétní URL se nastaví až po vytvoření projektu `rezervuj-kurt-staging` a ověření skutečné deployment URL.
- Staging nesmí používat produkční databázi, produkční uživatele ani produkční secrets.

### Production

- Produkce běží jako Vercel Hobby production deployment z produkční větve nastavené ve Vercelu.
- Používá samostatný Supabase Free projekt určený pouze pro produkční data a autentizaci.
- Aplikační proměnné se spravují ve Vercelu pro prostředí **Production**.
- Production Supabase projekt zatím používá výchozí e-mailový provider Supabase; pro širší veřejný provoz má dostat custom SMTP. SMTP credentials se ukládají pouze do Supabase Auth SMTP settings a nesmí být vložené do Vercelu, `.env` souborů ani repozitáře.
- Širší veřejný provoz se nemá prohlásit za plně auth-ready, dokud magic link přes custom SMTP nedorazí na externí adresy u alespoň dvou běžných poskytovatelů schránek.
- Supabase Auth Site URL a povolený redirect musí odpovídat skutečné produkční Vercel URL a cestě `/rezervace`.
- Přístup k produkčnímu Vercel a Supabase projektu má pouze vlastník projektu a jím výslovně pověření správci.

## 4. Matice prostředí

| Prostředí | Aplikační URL | Supabase projekt | Secrets spravuje | Přístup | Auth redirect |
|---|---|---|---|---|---|
| Development | `http://localhost:3000`, případně aktuální Codespaces URL | Lokální Supabase + Mailpit | Vývojář v ignorovaném `.env.local`; případné sdílené hodnoty v GitHub Codespaces secrets; bez Brevo credentials | Vývojář pracující na daném lokálním prostředí / Codespace | `http://localhost:3000/rezervace`, případně aktuální Codespaces URL s cestou `/rezervace` |
| Staging | Plánovaná stálá URL `https://rezervuj-kurt-staging.vercel.app` po vytvoření projektu `rezervuj-kurt-staging` | Supabase Free `rrlvlgoiwesteevzupyi` | Pověřený správce ve Vercel staging project environment variables; auth a Brevo SMTP credentials v Supabase Dashboardu | Vlastník projektu a výslovně pověření správci; aplikační přístup podle účelu testu | Bude doplněna a povolena po vzniku staging deploymentu; musí končit cestou `/rezervace` |
| Production | `https://rezervuj-kurt.vercel.app` | Supabase Free `jrmenwgaponihgzroduw` | Pověřený správce ve Vercel **Production** environment variables; auth a budoucí custom SMTP credentials v Supabase Dashboardu | Vlastník projektu a výslovně pověření správci; veřejný přístup k aplikaci | Prakticky ověřený návrat na `https://rezervuj-kurt.vercel.app/rezervace` |

## 5. Doručování magic linků přes SMTP

Aplikace se přihlašuje výhradně e-mailem přes Supabase magic link. Výchozí e-mailový provider Supabase postačil pro technické ověření na Gmailu, ale není vhodný pro širší veřejný provoz: má nízký rate limit a neposkytuje produkční garanci doručení. Při intenzivním testování byl prakticky zaznamenán HTTP stav `429` / `email rate limit exceeded`. Staging i production proto mají před větším provozem dostat vlastní SMTP konfiguraci.

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
10. Produktové e-maily o rezervacích odesílá pouze Edge Function přes Resend. Secrets `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL` a `SITE_URL` patří do Supabase Edge Function secrets příslušného prostředí a nesmí mít prefix `NEXT_PUBLIC_`.

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

- [ ] vytvořit samostatný Vercel staging projekt `rezervuj-kurt-staging` napojený na branch `staging` a doplnit jeho konkrétní staging URL; production Vercel URL `https://rezervuj-kurt.vercel.app` je potvrzená;
- [x] vytvořit dva oddělené Supabase Free projekty a zapsat jejich project refs;
- [ ] nastavit a ověřit environment variables v samostatném staging Vercel projektu; všechny `NEXT_PUBLIC_*` hodnoty musí mířit na staging Supabase projekt `rrlvlgoiwesteevzupyi`; production environment variables a propojení s production Supabase byly runtime ověřené;
- [ ] potvrdit Brevo Free jako SMTP poskytovatele nebo zdokumentovat jinou variantu kompatibilní s cílem 0 Kč/měsíc; následně založit účet, ověřit odesílatele a nastavit oddělené custom SMTP konfigurace ve staging a production Supabase projektu;
- [ ] nastavit a ověřit Site URL a povolené auth redirect URL ve staging projektu; production návrat na `https://rezervuj-kurt.vercel.app/rezervace` byl prakticky ověřen;
- [ ] ověřit doručení a použití magic linku přes custom SMTP alespoň na dvou externích adresách mimo tým Supabase projektu;
- [ ] zapsat konkrétní vlastníky a osoby s administrátorským přístupem;
- [ ] ověřit, že staging deployment používá pouze staging Supabase; propojení production deploymentu pouze s production Supabase bylo runtime ověřené `12. 6. 2026`;
- [ ] doplnit datum a důkaz dokončení do `docs/dalsi-postup.md`.
