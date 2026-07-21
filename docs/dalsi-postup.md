# Další postup projektu RezervujKurt

> Řídicí checklist pro dokončení produkční připravenosti a navazující produktový rozvoj.

**Stav dokumentu:** aktivní  
**Založeno:** 10. 6. 2026  
**Výchozí větev při založení:** `work`  
**Vlastník rozhodnutí o dokončení:** vlastník projektu

## 1. Účel dokumentu

Tento dokument je společný zdroj pravdy pro další postup projektu. Každá položka má:

- jednoznačný identifikátor;
- prioritu a stav;
- konkrétní podmínky dokončení;
- povinné ověření;
- místo pro datum a důkaz dokončení.

Dokument nenahrazuje technické runbooky ani testovací strategie. Odkazuje na ně a eviduje, zda byly jejich podmínky skutečně splněny.

## 2. Pravidla potvrzování položek

### Povolené stavy

- `[ ]` — nehotovo;
- `[-]` — rozpracováno;
- `[x]` — dokončeno a potvrzeno podle akceptačních kritérií;
- `[~]` — vědomě odloženo rozhodnutím vlastníka projektu;
- `[!]` — blokováno externí závislostí nebo rozhodnutím.

### Kdy lze označit položku jako hotovou

Položku lze změnit na `[x]` pouze tehdy, když:

1. jsou splněna všechna uvedená akceptační kritéria;
2. proběhly uvedené testy nebo kontroly;
3. nejsou známé nezdokumentované regrese;
4. je doplněn záznam v tabulce **Evidence dokončení**;
5. vlastník projektu výsledek potvrdil.

Pouhé vytvoření implementace nebo otevření pull requestu nestačí. Pokud například změna funguje lokálně, ale chybí požadované runtime ověření, položka zůstává `[-]`.

### Evidence dokončení

Pro každou dokončenou položku doplňte řádek:

| ID | Datum | Commit / PR / Actions run | Ověřil | Poznámka |
|---|---|---|---|---|
| _Příklad: T1_ | _RRRR-MM-DD_ | _odkaz nebo SHA_ | _jméno_ | _stručný výsledek_ |

## 3. Potvrzený výchozí stav

Následující schopnosti jsou při založení dokumentu považované za dokončený základ MVP. Případná změna jejich chování musí zachovat zpětnou kompatibilitu nebo být výslovně schválena.

- [x] **B1 — Databázové schéma:** profily, kurty, rezervace a auditní log jsou součástí migrací.
- [x] **B2 — Datová integrita rezervací:** databáze odmítá přesné duplicity i překryv aktivních rezervací.
- [x] **B3 — RLS základ:** klíčové tabulky mají zapnuté RLS a owner/admin politiky.
- [x] **B4 — Přihlášení:** e-mailový magic link a persistence session jsou implementované.
- [x] **B5 — Veřejný přehled:** anonymní uživatel může zobrazit veřejnou obsazenost kurtů.
- [x] **B6 — Vytvoření rezervace:** přihlášený uživatel může vytvořit čekající rezervaci.
- [x] **B7 — Ochrana proti kolizi:** UI pre-check doplňuje databázovou ochranu, která zůstává zdrojem pravdy.
- [x] **B8 — Moje rezervace:** uživatel vidí své rezervace a může zrušit povolenou budoucí rezervaci.
- [x] **B9 — Administrace:** administrátor vidí čekající rezervace a může je schválit nebo zrušit.
- [x] **B10 — Auditní stopa:** vytvoření a změny stavu rezervace zapisují auditní události.
- [x] **B11 — Unit testy:** při založení dokumentu prochází 123 testů bez selhání.
- [x] **B12 — Build gate:** pull request ověřuje unit testy, RLS kontrolu a produkční build.
- [x] **B13 — E2E implementace:** existuje anonymní smoke, auth bootstrap a autentizovaný lifecycle scénář.

Podrobnější historický audit MVP je v `docs-next-step.md`. Tento dokument od této chvíle řídí pouze další postup.

---

# Fáze 1 — Technický quality gate

Cíl fáze: odstranit mezery, které snižují reprodukovatelnost a spolehlivost každého dalšího pull requestu.

## [x] T1 — Zprovoznit neinteraktivní ESLint kontrolu

**Priorita:** P0  
**Problém:** `npm run lint` spouští interaktivní průvodce a v CI nebo neinteraktivním terminálu končí chybou.

**Doporučené řešení:**

- doplnit explicitní ESLint konfiguraci kompatibilní s použitou verzí ESLint a Next.js;
- změnit lint skript na neinteraktivní příkaz;
- neopravovat v jednom kroku nesouvisející formátování nebo rozsáhlý technický dluh.

**Akceptační kritéria:**

- [x] `npm run lint` nevyžaduje uživatelský vstup;
- [x] příkaz končí úspěšně na čistém checkoutu;
- [x] nejsou vypnutá klíčová React, Hooks nebo Next.js pravidla bez zdůvodnění;
- [x] případné výjimky jsou minimální a zdokumentované.

**Povinné ověření:**

- `npm run lint`
- `npm run test`
- `npm run build`

**Potvrzení:** dokončeno a technicky ověřeno `10. 6. 2026`; důkaz [PR #159](https://github.com/Bbambaaamm/RezervujKurt/pull/159/checks).

## [x] T2 — Přidat lint do CI Build Gate

**Priorita:** P0  
**Závisí na:** T1

**Akceptační kritéria:**

- [x] workflow `Build Gate` obsahuje samostatný lint krok;
- [x] lint selhání zastaví job;
- [x] alespoň jeden pull request prokáže úspěšný běh celého workflow.

**Povinné ověření:** odkaz na úspěšný GitHub Actions běh.

**Potvrzení:** dokončeno a potvrzeno úspěšným Build Gate během `10. 6. 2026`; důkaz [PR #160](https://github.com/Bbambaaamm/RezervujKurt/pull/160/checks).

## [x] T3 — Sjednotit README se skutečným stavem projektu

**Priorita:** P1  
**Problém:** README stále část projektu popisuje jako budoucí Supabase/auth základ, přestože core MVP je implementované.

**Akceptační kritéria:**

- [x] README stručně popisuje aktuálně dostupné funkce;
- [x] obsahuje aktuální lokální setup a potřebné env proměnné;
- [x] uvádí všechny důležité testovací a kontrolní příkazy;
- [x] odkazuje na tento checklist, runtime checklist a E2E strategii;
- [x] budoucí funkce nejsou prezentované jako hotové.

**Povinné ověření:** ruční kontrola odkazů a příkazů na čistém checkoutu.

**Potvrzení:** dokončeno a ručně ověřeno `10. 6. 2026`; důkaz [PR #161](https://github.com/Bbambaaamm/RezervujKurt/pull/161) a navazující aktualizace [PR #169](https://github.com/Bbambaaamm/RezervujKurt/pull/169).

## [x] T4 — Vyřešit dočasný adresář unit testů

**Priorita:** P2  
**Problém:** `npm run test` po dokončení ponechává `.tmp-tests/` jako neversionovaný artefakt.

**Doporučené řešení:** přidat bezpečný cleanup do testovacího skriptu; ignorování adresáře je přijatelné pouze tehdy, pokud cleanup není spolehlivý napříč podporovanými platformami.

**Akceptační kritéria:**

- [x] po `npm run test` nezůstane nechtěná změna pracovního stromu;
- [x] testy se uklidí i při běžném úspěšném dokončení;
- [x] testovací výstup zůstane diagnosticky použitelný při selhání.

**Povinné ověření:**

- `npm run test`
- `git status --short`

**Potvrzení:** dokončeno a technicky ověřeno `10. 6. 2026`; důkaz [PR #162](https://github.com/Bbambaaamm/RezervujKurt/pull/162).

## [x] T5 — Připnout podporovanou verzi Node.js

**Priorita:** P1  
**Problém:** CI používalo Node.js 20 po ukončení jeho podpory, zatímco lokální vývoj neměl podporovanou verzi formálně deklarovanou.

**Akceptační kritéria:**

- [x] podporovaná verze je uvedena alespoň v `package.json` nebo standardním version souboru;
- [x] README používá stejnou verzi;
- [x] CI a lokální doporučení si neodporují;
- [x] `npm ci`, testy a build na zvolené verzi projdou.

**Povinné ověření:** `node --version`, `npm ci`, `npm run test`, `npm run build`.

**Potvrzení:** dokončeno a ověřeno v CI na Node.js 22 LTS `10. 6. 2026`; důkaz [PR #163](https://github.com/Bbambaaamm/RezervujKurt/pull/163/checks).

### Potvrzení dokončení Fáze 1

- [x] Všechny položky T1–T5 jsou dokončené nebo je vlastník projektu výslovně odložil.
- [x] Build Gate je zelený na reprezentativním pull requestu.
- [x] V tabulce Evidence dokončení jsou odkazy na výsledky.

---

# Fáze 2 — Stabilizace E2E v pull requestech

Cíl fáze: prokázat, že autentizovaný lifecycle test je dostatečně stabilní pro povinný branch protection check.

## [x] E1 — Evidovat reprezentativní automatické PR běhy

**Priorita:** P0  
**Zdroj evidence:** `docs/e2e-pr-stability-log.md`

**Akceptační kritéria:**

- [x] je evidováno alespoň 5, ideálně 10 dokončených automatických PR běhů;
- [x] každý záznam obsahuje PR, Actions run, commit, typ změny, první výsledek a délku;
- [x] ruční a zrušené běhy nejsou započítané jako úspěšný vzorek;
- [x] zastoupené změny nejsou pouze dokumentační.

**Potvrzení:** minimální reprezentativní vzorek šesti automatických PR běhů potvrzen vlastníkem projektu `11. 6. 2026`; rozšíření na doporučených deset běhů zůstává nepovinným průběžným zpřesněním evidence.

## [x] E2 — Vyhodnotit každé E2E selhání

**Priorita:** P0  
**Závisí na:** průběžných výsledcích E1

**Akceptační kritéria:**

- [x] každé dosud evidované selhání je klasifikované jako produktová regrese, nestabilita testu, problém dat nebo CI infrastruktury; ve vzorku E1 dosud žádné selhání nenastalo;
- [x] žádné nevysvětlené selhání nezůstává uzavřené bez dalšího kroku;
- [x] opravy nesnižují produkční auth nebo RLS ochrany jen kvůli testu;
- [x] řízený neúspěšný browserový pokus prokázal, že diagnostický artefakt obsahuje trace a screenshot prvního neúspěšného pokusu i diagnostiku retry.

**Potvrzení:** dokončeno `11. 6. 2026`; [PR #175 / run 27327043964](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27327043964) řízeným browserovým selháním publikoval artefakt `playwright-lifecycle-failure` o velikosti `876 KB`. Vlastník projektu stažený artefakt zkontroloval a dodanými screenshoty potvrdil trace a screenshot prvního neúspěšného pokusu i diagnostiku retry. Diagnostická změna `a13ebcd` byla sloučena commitem `258a332` a standardní lifecycle následně obnovil commit `cf1b016`; produkční auth ani RLS ochrany nebyly oslabeny.

## [x] E3 — Potvrdit provozní náklady lifecycle jobu

**Priorita:** P1

**Akceptační kritéria:**

- [x] je známý přibližný medián délky jobu;
- [x] je známá nejhorší pozorovaná délka;
- [x] timeout 20 minut je potvrzený jako přiměřený nebo upravený s odůvodněním;
- [x] spotřeba GitHub Actions je pro každý PR přijatelná.

**Potvrzení:** dokončeno `10. 6. 2026`; nákladový rozbor a podmínky opětovného posouzení jsou v `docs/e2e-pr-stability-log.md`, důkaz commit `fa0b19a`.

## [x] E4 — Nastavit lifecycle jako povinný check

**Priorita:** P0  
**Závisí na:** E1, E2, E3

**Akceptační kritéria:**

- [x] job `Auth lifecycle nad lokální Supabase` je nastaven v Rulesets nebo Branch protection jako povinný;
- [x] pull request nelze sloučit při jeho selhání;
- [x] název povinného checku odpovídá názvu skutečného jobu;
- [x] změna je ověřena na testovacím pull requestu s dohledatelným odkazem na PR a neúspěšný Actions run.

**Potvrzení:** dokončeno `11. 6. 2026`; aktivní Ruleset [`Ochrana hlavní větve` (ID `17551296`)](https://github.com/Bbambaaamm/RezervujKurt/settings/rules/17551296) cílí na výchozí větev, bez bypass aktérů vyžaduje pull request, uzavření review vláken a úspěch checků `Auth lifecycle nad lokální Supabase` a `Build Gate` a blokuje smazání i force-push. Na testovacím [PR #183](https://github.com/Bbambaaamm/RezervujKurt/pull/183) skončil automatický [`pull_request` run 27346566563](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27346566563) řízeným selháním required jobu `Auth lifecycle nad lokální Supabase`; GitHub zablokoval standardní sloučení a administrátorský bypass nebyl použit. Po odstranění diagnostického kroku prošel [následný run 27347432224](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27347432224) včetně stejného lifecycle jobu, výsledný diff PR byl prázdný a PR nebyl sloučen. Podrobná evidence je v `docs/e2e-pr-stability-log.md`.

### Potvrzení dokončení Fáze 2

- [x] E1–E4 jsou dokončené.
- [x] E2E evidence neobsahuje nevysvětlené selhání prvního pokusu.
- [x] Lifecycle je nakonfigurovaný v ochraně cílové větve a praktický test potvrdil blokaci sloučení při jeho selhání.

---

# Fáze 3 — Staging a produkční připravenost

Cíl fáze: ověřit aplikaci nad prostředím, které odpovídá budoucímu produkčnímu provozu, nikoli pouze nad lokální Supabase.

## [-] P1 — Definovat cílová prostředí a vlastnictví konfigurace

**Priorita:** P0

**Návrh prostředí:** [`docs/prostredi.md`](prostredi.md)

**Aktuálně potvrzená konfigurace:**

- production aplikace: `https://rezervuj-kurt.vercel.app`;
- production Supabase project ref: `jrmenwgaponihgzroduw`;
- staging Supabase project ref: `rrlvlgoiwesteevzupyi`;
- hostovaný produkční lifecycle dne `12. 6. 2026` potvrdil, že production deployment používá uvedený production Supabase projekt.

**Akceptační kritéria:**

- [x] je rozhodnuto, zda budou existovat `development`, `staging` a `production` prostředí;
- [ ] každé prostředí má určený Supabase projekt a aplikační URL — oba hostované Supabase project refs a production Vercel URL jsou známé, chybí stálá staging Vercel URL;
- [x] je zdokumentováno, kde se spravují secrets a kdo k nim má přístup;
- [x] produkční secrets nejsou uložené v repozitáři ani veřejné dokumentaci;
- [x] je runtime ověřeno propojení production Vercel deploymentu s production Supabase projektem;
- [ ] staging a production mají nakonfigurovaný custom SMTP pro veřejné magic linky — technický test přes výchozího Supabase poskytovatele prošel na Gmail, custom SMTP pro širší provoz zatím chybí; custom SMTP neblokuje vytvoření staging Vercelu ani základní staging lifecycle, ale zůstává podmínkou finálního production confidence passu a širšího veřejného provozu;
- [ ] redirect URL pro auth jsou explicitně povolené pro každé prostředí — production návrat na `/rezervace` je prakticky ověřený, staging URL a její redirect allowlist zatím chybí.

**Potvrzení:** rozpracováno; původní návrh prostředí potvrzen `11. 6. 2026`, konkrétní production URL, oba Supabase project refs a produkční propojení ověřeny `12. 6. 2026`. P1 čeká hlavně na stálou staging Vercel URL, konkrétní vlastníky provozních přístupů a povolení staging auth redirectu. Custom SMTP zůstává samostatná podmínka širšího veřejného provozu, ne blocker základního staging lifecycle.

## [-] P2 — Ověřit migrace na hostované databázi

**Priorita:** P0  
**Závisí na:** P1

**Dílčí produkční ověření z 12. 6. 2026:**

- [x] `npx supabase migration list` ověřil stav hostovaných migrací;
- [x] `npx supabase db push` aplikoval chybějící produkční migraci;
- [x] produkční aplikace po migraci úspěšně vytvořila rezervaci;
- [x] produkční databáze je prokazatelně používaná production deploymentem.

**Repozitářová a staging kontrola migračních souborů:**

- [x] `npm run check:rls` prošel nad lokálními SQL soubory v `supabase/migrations`;
- [x] `npm run check:rls:prod` prošel v release režimu nad stejnými lokálními migračními soubory a upozornil na legacy DEV migraci v historii;
- [x] na používaném staging projektu byly ověřené platební tabulky, stav `waiting_for_payment`, constrainty, views, oprávnění, overlap ochrana, veřejné maskování platebního stavu, member occupancy view, granty pro `anon`/`authenticated`, omezení auto-approve pouze na `pending` a rollback test bez zbylých řádků;
- [ ] širší RLS inventura musí ještě potvrdit skutečně nasazené politiky v hostované databázi nad všemi relevantními objekty; statické kontroly lokálních SQL souborů samy o sobě nestačí.

**Zbývající akceptační kritéria pro úplné uzavření P2:**

- [ ] všechny migrace lze aplikovat ve správném pořadí na prázdnou databázi ve fresh replay prostředí mimo aktuálně ověřovaný staging;
- [ ] výsledné RLS politiky po fresh replay odpovídají očekávanému release stavu;
- [x] veřejný occupancy kontrakt funguje na hostovaném production prostředí bez vývojového RLS režimu;
- [x] je popsaný bezpečný postup migrace a návratu při selhání;
- [ ] legacy RLS migrace nezpůsobí při kompletním aplikačním pořadí regresi.

**Povinné ověření pro uzavření:** zachovat rozlišení mezi incrementálním staging runem a fresh database replay. Incrementální staging run ověřuje reálnou aktualizaci používané staging databáze a nesmí být nahrazen destruktivním resetem bez samostatného plánu. Fresh database replay ověřuje celé migrační pořadí na prázdné databázi a má proběhnout v dočasné lokální Supabase instanci nebo samostatném dočasném projektu, ne destruktivně nad aktuálně ověřeným stagingem. Součástí uzavření zůstává databázová kontrola výsledných RLS politik po aplikaci celého migračního pořadí.

**Potvrzení:** významná část ověřena `12. 6. 2026` na production. Před opravou vytvoření rezervace selhalo na `reservations_court_id_fkey` s chybou chybějícího kurtu; po aplikaci seed migrace byla rezervace úspěšně vytvořena. Pro uzavření P2 už nejde o start od nuly: hostovaná staging databáze má významnou část kontrol provedenou. Chybí hlavně zdokumentovat provedené staging ověření, doplnit širší RLS inventuru nad hostovanou databází a případně provést fresh migration replay mimo současný staging, aby se potvrdilo, že legacy RLS migrace nezpůsobí regresi v kompletním migračním pořadí.

## [x] P2a — Seed základních kurtů v hostované production databázi

- **Priorita:** P0
- **Datum:** 12. 6. 2026
- **PR:** [#189](https://github.com/Bbambaaamm/RezervujKurt/pull/189), větev `fix/seed-courts`
- **Merge commit:** `b7c24cf`
- **Migrace:** `20260612075345_seed_courts.sql`

**Výsledek:**

- [x] production databáze obsahuje `Kurt 1`, `Kurt 2` a `Kurt 3`;
- [x] byla odstraněna chyba `reservations_court_id_fkey` způsobená chybějícím referenčním záznamem v tabulce `courts`;
- [x] migrace byla aplikována pomocí `npx supabase db push`;
- [x] po opravě byla v produkční aplikaci úspěšně vytvořena rezervace.

**Potvrzení:** dokončeno a runtime ověřeno `12. 6. 2026`.

## [-] P3 — Projít hostovaný runtime lifecycle

**Priorita:** P0  
**Závisí na:** P1, P2  
**Runbook:** `docs/runtime-verification.md`

**Akceptační kritéria:**

- [ ] anonymní uživatel vidí kurty a skutečnou veřejnou obsazenost;
- [ ] anonymní uživatel nemůže vytvořit rezervaci;
- [x] member vytvoří `pending` rezervaci;
- [x] rezervace se okamžitě zobrazí v obsazenosti a blokuje slot jako „Čeká na schválení“;
- [ ] admin rezervaci vidí a schválí nebo zruší;
- [ ] schválená rezervace zůstává blokující;
- [ ] zrušená rezervace slot uvolní;
- [x] UI odpovídá datům v hostované production databázi;
- [x] ověřený produkční průchod nepoužívá mock fallback data.

**Potvrzení:** rozpracováno `12. 6. 2026`. Na hostovaném production prostředí mimo lokální Supabase proběhla registrace nového uživatele, vytvoření profilu, přihlášení, vytvoření rezervace a okamžité zobrazení blokovaného termínu. Zbývá zejména admin schválení, admin zrušení a potvrzení uvolnění termínu; anonymní oprávnění se mají znovu explicitně projít podle runbooku.

## [-] P4 — Ověřit auth a doručování magic linku

**Priorita:** P0  
**Závisí na:** P1

**Akceptační kritéria:**

- [x] magic link byl doručen na reálnou Gmail adresu přes výchozího Supabase poskytovatele;
- [x] odkaz směřuje na správný production Supabase host;
- [x] následný redirect vede na production aplikaci a `/rezervace`;
- [x] odkaz neobsahuje localhost ani historický Codespaces host;
- [x] po otevření odkazu vznikne účet a odpovídající profil;
- [x] přihlášená session umožní vytvořit produkční rezervaci;
- [ ] magic link je přes nakonfigurovaný custom SMTP doručen alespoň na dvě reálné externí adresy, doporučeně u dvou různých poskytovatelů schránek;
- [ ] expirovaný, opakovaně použitý a neplatný odkaz skončí srozumitelnou chybou;
- [ ] odhlášení a obnovení session po reloadu stránky jsou samostatně ověřené.

**Známé omezení:** při intenzivním testování výchozího Supabase e-mailového poskytovatele lze narazit na HTTP `429` / `email rate limit exceeded`. Uživatelské zobrazení této chyby bylo doplněno v [PR #190](https://github.com/Bbambaaamm/RezervujKurt/pull/190), ale custom SMTP zůstává podmínkou spolehlivějšího širšího provozu, nikoli blockerem technického MVP.

**Potvrzení:** částečně ověřeno `12. 6. 2026` na production přes Gmail. P4 čeká na custom SMTP, druhého poskytovatele schránky a negativní/session scénáře.

## [-] P5 — Zavést minimální produkční observabilitu

**Priorita:** P1

**Minimální rozsah:**

- chyby autentizace;
- chyby vytvoření, schválení a zrušení rezervace;
- nedostupnost Supabase;
- základní informace potřebné pro dohledání incidentu bez ukládání tokenů nebo citlivých údajů.

**Akceptační kritéria:**

- [x] je zvolen způsob sběru chyb a provozních událostí — pro první bezplatný provoz se používají strukturované aplikační logy hostingu bez nové dependency;
- [x] logy neobsahují access tokeny, service-role klíče ani magic-link tokeny;
- [x] je možné rozlišit prostředí a typ operace;
- [ ] testovací chyba je dohledatelná;
- [ ] je určeno, kdo a kdy reaguje na kritickou chybu.

**Potvrzení:** rozpracováno `21. 7. 2026`; aplikace zapisuje strukturované provozní události pro chyby magic-link auth, odhlášení a zápisy rezervací. Klientské auth chyby se posílají přes serverovou `/api/observability` route, aby byly dohledatelné v runtime logách hostingu, ne pouze v konzoli prohlížeče. Uzavření P5 ještě čeká na runtime dohledání testovací chyby v hostingu a potvrzení reakční odpovědnosti vlastníkem provozu.

## [-] P6 — Sepsat release, incident a rollback runbook

**Priorita:** P1

**Runbook:** `docs/provozni-runbook.md`

**Akceptační kritéria:**

- [x] release checklist obsahuje migrace, env, build, smoke a potvrzení vlastníka;
- [x] rollback postup rozlišuje aplikaci a databázové migrace;
- [ ] incident postup obsahuje konkrétní provozní kontakty, diagnostiku a rozhodnutí o omezení provozu; role a bezpečné uložení kontaktů jsou definované, jména musí doplnit vlastník mimo veřejný repozitář;
- [x] je popsáno, jak zabránit rezervacím při nespolehlivé obsazenosti;
- [ ] runbook byl alespoň jednou nanečisto projitý.

**Potvrzení:** rozpracováno `10. 6. 2026`; dokumentační část je v `docs/provozni-runbook.md`, dokončení čeká na určení provozních kontaktů a evidovaný nácvik.

## [ ] P7 — Provést produkční confidence pass

**Priorita:** P0  
**Závisí na:** P1–P6

**Akceptační kritéria:**

- [ ] produkční build pochází z potvrzeného commitu;
- [ ] produkční migrace jsou aplikované a ověřené;
- [ ] env a auth redirecty odpovídají produkční doméně;
- [ ] kritický member/admin lifecycle projde;
- [ ] observabilita zachytí testovací událost;
- [ ] vlastník projektu výslovně schválí ostrý provoz.

**Potvrzení:** datum `—`, důkaz `—`.

### Potvrzení dokončení Fáze 3

- [ ] P1–P7 jsou dokončené.
- [ ] Produkční prostředí není závislé na mock fallback datech.
- [ ] Je známý vlastník provozu a reakce na incident.

---

# Fáze 4 — Produktové dokončení před širším spuštěním

Tato fáze vyžaduje produktová rozhodnutí. Položky se nemají implementovat jen na základě technického odhadu.

## [ ] F1 — Administrátorské blokace a odstávky kurtů

**Priorita:** P1  
**Doporučení:** řešit před platbami, protože jde o základní provozní potřebu areálu.

**Před implementací rozhodnout:**

- zda blokace používá rezervaci se zvláštním typem, nebo samostatnou entitu;
- kdo ji může vytvořit a zrušit;
- zda může být opakovaná nebo celodenní;
- jak se zobrazí veřejnosti a v auditní stopě.

**Akceptační kritéria:**

- [ ] admin může vytvořit blokaci pro kurt a interval;
- [ ] blokace používá stejnou databázovou ochranu proti kolizím;
- [ ] blokovaný interval nelze rezervovat;
- [ ] admin může blokaci bezpečně zrušit;
- [ ] vytvoření a zrušení je auditované;
- [ ] existují cílené unit a E2E testy.

**Potvrzení:** datum `—`, důkaz `—`.

## [ ] F2 — Produktové notifikace

**Priorita:** P1

**Před implementací rozhodnout:** poskytovatele, odesílatele, šablony, retry politiku a které události se posílají.

**Minimální doporučený rozsah:**

- přijetí nové rezervace uživateli;
- oznámení o schválení;
- oznámení o zrušení;
- upozornění správce na novou čekající rezervaci.

**Akceptační kritéria:**

- [ ] odesílání není přímo svázané s React komponentami;
- [ ] selhání e-mailu nezpůsobí nekonzistentní stav rezervace;
- [ ] opakování požadavku neposílá nechtěné duplicity;
- [ ] šablony neobsahují citlivé údaje ani neplatné odkazy;
- [ ] klíčové scénáře mají automatické testy.

**Potvrzení:** datum `—`, důkaz `—`.

## [ ] F3 — Doplnit provozní obsah veřejného webu

**Priorita:** P1

**Rozsah k potvrzení vlastníkem:**

- pravidla rezervací a rušení;
- otevírací doba;
- kontakt a adresa;
- ceník nebo informace o členství;
- ochrana osobních údajů;
- reálné aktuality a fotografie, pokud mají být součástí první verze.

**Akceptační kritéria:**

- [ ] domovská stránka neobsahuje nechtěné placeholder texty;
- [ ] pravidla odpovídají skutečné implementaci;
- [ ] kontaktní a právní informace schválil vlastník projektu;
- [ ] mobilní a desktopové zobrazení je ručně ověřené.

**Potvrzení:** datum `—`, důkaz `—`.

## [ ] F4 — Rozhodnout a případně doplnit profil uživatele

**Priorita:** P2

**Před implementací rozhodnout:** zda je telefon potřebný, povinný a viditelný správci.

**Akceptační kritéria, pokud bude telefon součástí produktu:**

- [ ] uživatel může telefon zadat a změnit;
- [ ] probíhá přiměřená validace a normalizace;
- [ ] přístup k telefonu respektuje RLS a ochranu osobních údajů;
- [ ] admin ho vidí pouze tehdy, pokud je to schválený požadavek;
- [ ] existují testy validace a oprávnění.

**Potvrzení:** datum `—`, důkaz `—`.

## [ ] F5 — Rozhodnout o dalších způsobech přihlášení

**Priorita:** P2  
**Doporučení:** Google nebo Apple přidávat pouze při prokázané potřebě; magic link je pro MVP dostatečný.

**Akceptační kritéria:**

- [ ] existuje zdokumentované rozhodnutí `ponechat magic link` nebo `přidat konkrétního providera`;
- [ ] při přidání providera se nevytvářejí duplicitní profily pro stejnou osobu bez řešení;
- [ ] redirecty fungují ve staging i production prostředí;
- [ ] auth a RLS regresní testy zůstávají zelené.

**Potvrzení:** datum `—`, důkaz `—`.

## [ ] F6 — Rozhodnout o platebním modelu

**Priorita:** P2  
**Stav:** nezačínat implementaci před produktovým rozhodnutím.

**Před implementací rozhodnout:**

- kdo platí a podle jakého ceníku;
- zda členové rezervují zdarma;
- zda se platí před schválením nebo po něm;
- jak dlouho platba blokuje termín;
- storno a refundace;
- účetní a právní odpovědnost;
- stavový model rezervace a platby.

**Akceptační kritéria rozhodovací fáze:**

- [ ] je schválený produktový a stavový model;
- [ ] jsou popsané chybové a refund scénáře;
- [ ] je vybraný poskytovatel až po posouzení nákladů a podmínek;
- [ ] existuje bezpečnostní review webhooků a idempotence;
- [ ] implementace má samostatný plán a není skrytá v jiném úkolu.

**Potvrzení:** datum `—`, důkaz `—`.

### Potvrzení dokončení Fáze 4

- [ ] Všechny funkce vyžadované pro širší spuštění jsou dokončené.
- [ ] Odložené položky jsou označené `[~]` a mají zdokumentovaný důvod.
- [ ] Produktové texty a pravidla schválil vlastník projektu.

---

# Fáze 5 — Následný rozvoj

Tyto body nejsou součástí minimální produkční připravenosti. Zařadí se až podle reálného používání a zpětné vazby.

- [ ] **R1 — Pokročilejší lokalizovaný date/time picker.**
- [ ] **R2 — Administrátorské filtrování a vyhledávání v historii.**
- [ ] **R3 — Uživatelské a provozní metriky bez ukládání nadbytečných osobních údajů.**
- [ ] **R4 — Připomínky před termínem rezervace.**
- [ ] **R5 — Opakované rezervace, pouze pokud budou mít schválená kolizní a storno pravidla.**
- [ ] **R6 — Export nebo report pro správce areálu.**

Každý bod před zahájením musí dostat samostatná akceptační kritéria a prioritu.

---

# 4. Souhrnný stav

| Oblast | Aktuální stav | Podmínka uzavření |
|---|---|---|
| Core MVP | Hotovo | Regresní testy zůstávají zelené |
| Technický quality gate | Hotovo | T1–T5 potvrzené |
| E2E stabilita v PR | Hotovo | E1–E4 potvrzené |
| Staging a produkční připravenost | Rozpracováno; production základ prakticky ověřen | P1–P7 potvrzené |
| Produktové dokončení | Částečné | Potřebné F položky potvrzené nebo vědomě odložené |
| Následný rozvoj | Backlog | Prioritizace podle provozních dat |

## Aktuální orientační stav po ověření 12. 6. 2026

> Procenta jsou plánovací odhad vlastníka projektu, nikoli náhrada akceptačních kritérií jednotlivých položek.

- **MVP:** přibližně 95 %;
- **production readiness:** přibližně 75–80 %;
- **hostovaný member lifecycle:** prakticky potvrzený až po vytvoření čekající rezervace a blokaci termínu;
- **veřejné spuštění:** doporučeně až po dokončení F1, F3 a minimálního rozsahu P5.

## Doporučené nejbližší položky

1. **Vytvořit stálý staging Vercel projekt** — doporučeně `rezervuj-kurt-staging` napojený na Git branch `staging`, se stálou URL například `https://rezervuj-kurt-staging.vercel.app`.
2. **Nastavit staging environment variables** — všechny hodnoty musí mířit na staging Supabase projekt `rrlvlgoiwesteevzupyi`; GoPay capability zůstává vypnutá a GoPay prostředí sandbox.
3. **Doplnit staging auth redirect allowlist** — povolit staging URL s návratem na `/rezervace` a ověřit, že staging nepoužívá production Supabase ani production secrets.
4. **Spustit hostovaný staging lifecycle** — anonymní smoke, member rezervace, admin schválení/zrušení a uvolnění slotu; výsledky zapsat do P3.
5. **Doplnit P2 evidence** — zdokumentovat už provedené staging kontroly, doplnit širší RLS inventuru a fresh migration replay provést pouze mimo současný staging.
6. **Rozhodnout production migraci `waiting_for_payment`** — až po zeleném staging lifecycle a doplněné P2 evidenci.
7. **Custom SMTP, P5 observabilita a P6 runbook** — custom SMTP není blocker základního staging testování, ale zůstává blocker finálního production confidence passu a širšího veřejného provozu.

# 5. Evidence dokončení

Do této tabulky se zapisují pouze položky označené `[x]` po založení dokumentu. Výchozí body B1–B13 jsou historický baseline a samostatně se sem nepřepisují.

| ID | Datum | Commit / PR / Actions run | Ověřil | Poznámka |
|---|---|---|---|---|
| T1 | 2026-06-10 | [PR #159 / commit `661846f`](https://github.com/Bbambaaamm/RezervujKurt/pull/159/checks) | vlastník projektu, technická kontrola Codex | Neinteraktivní lint, unit testy a build úspěšné; tři známá lint warnings bez chyb. |
| T2 | 2026-06-10 | [PR #160 / commit `04f2f28`](https://github.com/Bbambaaamm/RezervujKurt/pull/160/checks) | vlastník projektu, technická kontrola Codex | Build Gate včetně lint kroku úspěšný. |
| T3 | 2026-06-10 | [PR #161 / commit `0c14bbc`](https://github.com/Bbambaaamm/RezervujKurt/pull/161), [PR #169 / commit `f0ea454`](https://github.com/Bbambaaamm/RezervujKurt/pull/169) | vlastník projektu, technická kontrola Codex | README ručně porovnáno s konfigurací, skripty a související dokumentací. |
| T4 | 2026-06-10 | [PR #162 / commit `e835b66`](https://github.com/Bbambaaamm/RezervujKurt/pull/162) | vlastník projektu, technická kontrola Codex | Po 125 úspěšných testech nezůstal `.tmp-tests/` ani změna pracovního stromu. |
| T5 | 2026-06-10 | [PR #163 / commit `37867f7`](https://github.com/Bbambaaamm/RezervujKurt/pull/163/checks) | vlastník projektu, technická kontrola Codex | Node.js 22 je sjednocený v projektu i CI; Build Gate na Node.js 22 úspěšný. |
| E1 | 2026-06-11 | [PR #159–#164 a související Actions běhy](e2e-pr-stability-log.md) | vlastník projektu, technická kontrola Codex | Potvrzen minimální reprezentativní vzorek šesti automatických PR běhů bez retry; čtyři z nich zahrnují nedokumentační změny. |
| E2 | 2026-06-11 | [PR #175 / run 27327043964](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27327043964) | vlastník projektu, technická kontrola Codex | Řízené selhání vytvořilo artefakt; vlastník projektu dodanými screenshoty potvrdil trace a screenshot prvního pokusu i diagnostiku retry. |
| E3 | 2026-06-10 | commit `fa0b19a` | vlastník projektu, technická kontrola Codex | Medián `3m 9s`, maximum `4m 4s`; 20minutový timeout ponechán a provoz standardního runneru ve veřejném repozitáři vyhodnocen jako přijatelný. |
| E4 | 2026-06-11 | [PR #183](https://github.com/Bbambaaamm/RezervujKurt/pull/183), [neúspěšný run 27346566563](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27346566563), [úspěšný run 27347432224](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27347432224) | vlastník projektu, technická kontrola Codex | Řízené selhání required lifecycle checku zablokovalo standardní sloučení bez bypassu; po odstranění diagnostiky následný automatický běh prošel, výsledný diff byl prázdný a testovací PR nebyl sloučen. |
| P2a | 2026-06-12 | [PR #189](https://github.com/Bbambaaamm/RezervujKurt/pull/189) / merge `b7c24cf` | vlastník projektu, runtime ověření | Seed migrace doplnila Kurt 1–3 do production; chyba `reservations_court_id_fkey` zmizela a produkční rezervace byla úspěšně vytvořena. |

# 6. Rozhodnutí a změny rozsahu

Sem se zapisují rozhodnutí, která mění prioritu, akceptační kritéria nebo rozsah. Tím se zabrání tichému rozšiřování úkolů během implementace.

| Datum | Oblast | Rozhodnutí | Důvod | Schválil |
|---|---|---|---|---|
| 2026-06-10 | Celý projekt | Core MVP je výchozí baseline; další postup začíná technickým quality gate | Rezervační jádro je implementované, hlavní mezery jsou v provozní připravenosti | vlastník projektu |
| 2026-06-12 | Veřejné spuštění | Před širším spuštěním prioritizovat F1, F3 a P5; custom SMTP nepovažovat za blocker technického MVP, ale dokončit jej před větším provozem | Hostovaný member lifecycle funguje, zbývají provozní blokace, veřejný obsah, monitoring a dokončení admin lifecycle | vlastník projektu |

# 7. Související dokumentace

- `docs-next-step.md` — historický audit dokončení milestone A–P;
- `docs/runtime-verification.md` — manuální member/admin runtime checklist;
- `docs/e2e-smoke-strategy.md` — návrh a pravidla E2E scénářů;
- `docs/e2e-pr-stability-log.md` — evidence stability automatických PR běhů;
- `AUDIT_RECOVERY_PLAN_2026-05-21.md` — historický recovery audit prostředí a auth konfigurace;
- `.github/workflows/build-gate.yml` — unit, RLS a build kontrola;
- `.github/workflows/e2e-lifecycle.yml` — autentizovaný lifecycle nad lokální Supabase.
