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

## [!] E2 — Vyhodnotit každé E2E selhání

**Priorita:** P0  
**Závisí na:** průběžných výsledcích E1

**Akceptační kritéria:**

- [x] každé dosud evidované selhání je klasifikované jako produktová regrese, nestabilita testu, problém dat nebo CI infrastruktury; ve vzorku E1 dosud žádné selhání nenastalo;
- [x] žádné nevysvětlené selhání nezůstává uzavřené bez dalšího kroku;
- [x] opravy nesnižují produkční auth nebo RLS ochrany jen kvůli testu;
- [ ] řízený neúspěšný browserový pokus prokáže, že diagnostický artefakt obsahuje trace prvního neúspěšného pokusu a screenshot; pokud retry uspěje, artefakt musí zachovat diagnostiku předchozího pokusu.

**Potvrzení:** blokováno externím přístupem `11. 6. 2026`; [PR #175 / run 27327043964](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27327043964) řízeným browserovým selháním veřejně potvrzuje publikaci artefaktu `playwright-lifecycle-failure` o velikosti `876 KB` a jeho SHA-256 digest. Dočasná aktivace selhání byla následně odstraněna. Anonymní GitHub rozhraní ani lokální prostředí bez GitHub tokenu neumožňuje artefakt stáhnout, proto nelze pravdivě potvrdit jeho obsah. Vlastník projektu musí přes přihlášené GitHub rozhraní ověřit trace a screenshot prvního pokusu podle `docs/e2e-pr-stability-log.md`; do té doby E2 zůstává `[!]` a E4 nesmí být zahájeno.

## [x] E3 — Potvrdit provozní náklady lifecycle jobu

**Priorita:** P1

**Akceptační kritéria:**

- [x] je známý přibližný medián délky jobu;
- [x] je známá nejhorší pozorovaná délka;
- [x] timeout 20 minut je potvrzený jako přiměřený nebo upravený s odůvodněním;
- [x] spotřeba GitHub Actions je pro každý PR přijatelná.

**Potvrzení:** dokončeno `10. 6. 2026`; nákladový rozbor a podmínky opětovného posouzení jsou v `docs/e2e-pr-stability-log.md`, důkaz commit `fa0b19a`.

## [ ] E4 — Nastavit lifecycle jako povinný check

**Priorita:** P0  
**Závisí na:** E1, E2, E3

**Akceptační kritéria:**

- [ ] job `Auth lifecycle nad lokální Supabase` je nastaven v Rulesets nebo Branch protection jako povinný;
- [ ] pull request nelze sloučit při jeho selhání;
- [ ] název povinného checku odpovídá názvu skutečného jobu;
- [ ] změna je ověřena na testovacím pull requestu.

**Potvrzení:** datum `—`, důkaz `—`.

### Potvrzení dokončení Fáze 2

- [ ] E1–E4 jsou dokončené.
- [ ] E2E evidence neobsahuje nevysvětlené selhání prvního pokusu.
- [ ] Lifecycle je součástí ochrany cílové větve.

---

# Fáze 3 — Staging a produkční připravenost

Cíl fáze: ověřit aplikaci nad prostředím, které odpovídá budoucímu produkčnímu provozu, nikoli pouze nad lokální Supabase.

## [ ] P1 — Definovat cílová prostředí a vlastnictví konfigurace

**Priorita:** P0

**Akceptační kritéria:**

- [ ] je rozhodnuto, zda budou existovat `development`, `staging` a `production` prostředí;
- [ ] každé prostředí má určený Supabase projekt a aplikační URL;
- [ ] je zdokumentováno, kde se spravují secrets a kdo k nim má přístup;
- [ ] produkční secrets nejsou uložené v repozitáři ani veřejné dokumentaci;
- [ ] redirect URL pro auth jsou explicitně povolené pro každé prostředí.

**Potvrzení:** datum `—`, důkaz `—`.

## [ ] P2 — Ověřit migrace na čisté staging databázi

**Priorita:** P0  
**Závisí na:** P1

**Akceptační kritéria:**

- [ ] všechny migrace lze aplikovat ve správném pořadí na čistou databázi;
- [ ] výsledné RLS politiky odpovídají očekávanému release stavu;
- [ ] veřejný occupancy kontrakt funguje bez vývojového RLS režimu;
- [ ] je popsaný bezpečný postup migrace a návratu při selhání;
- [ ] legacy RLS migrace nezpůsobí při kompletním aplikačním pořadí regresi.

**Povinné ověření:** `npm run check:rls:prod` a staging databázový reset/migration run.

**Potvrzení:** datum `—`, důkaz `—`.

## [ ] P3 — Projít staging runtime lifecycle

**Priorita:** P0  
**Závisí na:** P1, P2  
**Runbook:** `docs/runtime-verification.md`

**Akceptační kritéria:**

- [ ] anonymní uživatel vidí kurty a skutečnou veřejnou obsazenost;
- [ ] anonymní uživatel nemůže vytvořit rezervaci;
- [ ] member vytvoří `pending` rezervaci;
- [ ] rezervace okamžitě blokuje slot;
- [ ] admin rezervaci vidí a schválí nebo zruší;
- [ ] schválená rezervace zůstává blokující;
- [ ] zrušená rezervace slot uvolní;
- [ ] UI odpovídá datům v databázi;
- [ ] aplikace nepoužívá mock fallback data.

**Potvrzení:** datum `—`, důkaz `—`.

## [ ] P4 — Ověřit auth a doručování magic linku

**Priorita:** P0  
**Závisí na:** P1

**Akceptační kritéria:**

- [ ] magic link je doručen na reálnou testovací adresu;
- [ ] odkaz směřuje na správný Supabase host;
- [ ] následný redirect vede na správnou aplikační URL a `/rezervace`;
- [ ] odkaz neobsahuje localhost ani historický Codespaces host;
- [ ] expirovaný, opakovaně použitý a neplatný odkaz skončí srozumitelnou chybou;
- [ ] odhlášení a obnovení session fungují po reloadu stránky.

**Potvrzení:** datum `—`, důkaz `—`.

## [ ] P5 — Zavést minimální produkční observabilitu

**Priorita:** P1

**Minimální rozsah:**

- chyby autentizace;
- chyby vytvoření, schválení a zrušení rezervace;
- nedostupnost Supabase;
- základní informace potřebné pro dohledání incidentu bez ukládání tokenů nebo citlivých údajů.

**Akceptační kritéria:**

- [ ] je zvolen způsob sběru chyb a provozních událostí;
- [ ] logy neobsahují access tokeny, service-role klíče ani magic-link tokeny;
- [ ] je možné rozlišit prostředí a typ operace;
- [ ] testovací chyba je dohledatelná;
- [ ] je určeno, kdo a kdy reaguje na kritickou chybu.

**Potvrzení:** datum `—`, důkaz `—`.

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
| E2E stabilita v PR | Rozpracováno | E1–E4 potvrzené |
| Staging a produkční připravenost | Neověřeno | P1–P7 potvrzené |
| Produktové dokončení | Částečné | Potřebné F položky potvrzené nebo vědomě odložené |
| Následný rozvoj | Backlog | Prioritizace podle provozních dat |

## Doporučená nejbližší položka

**E2 — Vlastník projektu musí dokončit kontrolu obsahu diagnostického artefaktu.**

Důvod: PR #175 už řízeným selháním prokázal vznik artefaktu `playwright-lifecycle-failure` a dočasná testovací změna byla odstraněna. Veřejně lze ověřit jeho název, velikost `876 KB` a SHA-256 digest, nikoli obsah. Vlastník projektu proto musí artefakt z runu 27327043964 stáhnout přes přihlášené GitHub rozhraní, potvrdit trace a screenshot prvního neúspěšného pokusu a výsledek zapsat do evidence. Bez této externí kontroly zůstává E2 blokované a nelze poctivě zahájit E4.

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
| E3 | 2026-06-10 | commit `fa0b19a` | vlastník projektu, technická kontrola Codex | Medián `3m 9s`, maximum `4m 4s`; 20minutový timeout ponechán a provoz standardního runneru ve veřejném repozitáři vyhodnocen jako přijatelný. |

# 6. Rozhodnutí a změny rozsahu

Sem se zapisují rozhodnutí, která mění prioritu, akceptační kritéria nebo rozsah. Tím se zabrání tichému rozšiřování úkolů během implementace.

| Datum | Oblast | Rozhodnutí | Důvod | Schválil |
|---|---|---|---|---|
| 2026-06-10 | Celý projekt | Core MVP je výchozí baseline; další postup začíná technickým quality gate | Rezervační jádro je implementované, hlavní mezery jsou v provozní připravenosti | vlastník projektu |

# 7. Související dokumentace

- `docs-next-step.md` — historický audit dokončení milestone A–P;
- `docs/runtime-verification.md` — manuální member/admin runtime checklist;
- `docs/e2e-smoke-strategy.md` — návrh a pravidla E2E scénářů;
- `docs/e2e-pr-stability-log.md` — evidence stability automatických PR běhů;
- `AUDIT_RECOVERY_PLAN_2026-05-21.md` — historický recovery audit prostředí a auth konfigurace;
- `.github/workflows/build-gate.yml` — unit, RLS a build kontrola;
- `.github/workflows/e2e-lifecycle.yml` — autentizovaný lifecycle nad lokální Supabase.
