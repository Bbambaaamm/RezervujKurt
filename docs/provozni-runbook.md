# Provozní runbook: release, incident a rollback

Tento dokument definuje minimální bezpečný postup pro nasazení a provoz aplikace RezervujKurt. Nenahrazuje rozhodnutí o cílových prostředích, hostingu, vlastnících ani správě secrets z bodu P1 v `docs/dalsi-postup.md`. Dokud tato rozhodnutí nejsou doplněná, jsou níže uvedené role závaznější než konkrétní názvy služeb, ale runbook nelze považovat za kompletně provozně potvrzený.

## 1. Role a povinné údaje před prvním staging/produkčním releasem

Před použitím runbooku musí vlastník projektu doplnit následující údaje do neveřejné provozní evidence. Osobní kontakty ani secrets nepatří do repozitáře.

| Role | Odpovědnost | Povinný kontakt mimo repozitář |
|---|---|---|
| Release owner | rozhodnutí GO/NO-GO, potvrzení commitu a koordinace nasazení | Michal Bartoněk |
| Database owner | migrace, záloha, kontrola RLS a databázový rollback/forward fix | Michal Bartoněk |
| Incident owner | převzetí incidentu, komunikace a rozhodnutí o omezení provozu | Michal Bartoněk |
| Product owner | rozhodnutí o přijatelnosti výpadku a ručním zpracování rezervací | Michal Bartoněk |

Release se nesmí zahájit, pokud není pro daný termín dostupný alespoň release owner a database owner. Produkční provoz se nesmí označit za připravený bez určeného incident ownera.

## 2. Release checklist

### 2.1 Příprava a rozhodnutí GO/NO-GO

Release owner zaznamená do release záznamu:

- cílové prostředí a aplikační URL;
- přesný Git commit a odkaz na pull request;
- seznam nových migrací v `supabase/migrations/`;
- vlastníka aplikace a databáze pro dané nasazení;
- čas zahájení, plánované ověřovací okno a komunikační kanál;
- známá rizika a způsob návratu.

Před rozhodnutím GO musí na potvrzeném commitu projít:

```bash
npm ci
npm run lint
npm run test:unit
npm run check:rls:prod
npm run build
```

Dále musí být splněno:

- CI `Build Gate` je zelený;
- povinné E2E checky cílové větve jsou zelené, pokud už jsou aktivované;
- změny databáze byly nejprve aplikované a ověřené na čistém staging prostředí;
- je dostupná aktuální databázová záloha nebo platformní point-in-time recovery odpovídající riziku releasu;
- cílové env proměnné a povolené Supabase Auth redirect URL odpovídají cílové aplikační URL;
- žádný secret, service-role klíč ani magic-link token není součástí commitu, logu nebo release poznámek.

Výsledek je **NO-GO**, pokud chybí vlastník, záloha pro databázovou změnu, staging ověření migrací, některý povinný check nebo jednoznačný cílový commit.

### 2.2 Pořadí nasazení

1. Pozastav další releasy a změny migrací po dobu nasazení.
2. Zaznamenej stav aplikace a databáze před releasem.
3. Aplikuj schválené migrace přes standardní deployment mechanismus zvoleného prostředí. Nepoužívej ruční SQL, které není zachycené v migraci.
4. Ověř úspěšné dokončení migrací a výsledný release RLS kontrakt.
5. Nasaď aplikaci z potvrzeného commitu. Nebuilduj produkční artefakt z pracovního stromu s lokálními změnami.
6. Ověř health signál hostingu a dostupnost veřejné stránky.
7. Projdi kritický smoke podle `docs/runtime-verification.md` nad cílovým prostředím, nikoli nad mock daty.
8. Zkontroluj chyby auth, Supabase a rezervačních operací v dostupné provozní diagnostice.
9. Release owner zaznamená výsledek GO, rollback nebo předání do incidentního režimu.

### 2.3 Povinný post-release smoke

Minimálně ověř:

- anonymní načtení skutečné veřejné obsazenosti;
- odmítnutí vytvoření rezervace anonymním uživatelem;
- přihlášení testovacího member účtu přes správný magic-link redirect;
- vytvoření unikátní `pending` rezervace a okamžité blokování slotu;
- zobrazení rezervace administrátorovi a změnu stavu;
- uvolnění slotu po oprávněném zrušení;
- shodu stavu UI s `reservations` a `reservation_public_occupancy`;
- nepřítomnost localhostu, historického Codespaces hostu a mock fallback dat.

Testovací rezervace musí být jednoznačně označená a po ověření bezpečně zrušená. Nesmí se globálně mazat produkční rezervace.

## 3. Rollback

### 3.1 Rozhodovací pravidlo

Rollback zahaj, pokud release způsobí nedostupnost, poruší autorizaci/RLS, ukazuje nespolehlivou obsazenost, znemožní bezpečné vytvoření nebo zrušení rezervace, případně vede k nekonzistentním datům.

Nejdřív zastav dopad podle části 4.4. Potom rozlišuj aplikační a databázovou změnu.

### 3.2 Rollback pouze aplikace

Použij, pokud je databázové schéma zpětně kompatibilní s předchozí verzí aplikace:

1. Označ release jako neúspěšný a pozastav další nasazení.
2. Nasaď poslední potvrzený zdravý commit nebo artefakt standardním mechanismem hostingu.
3. Neměň env ani databázi, pokud nejsou prokazatelně příčinou.
4. Opakuj anonymní read, member create a admin změnu stavu z runtime checklistu.
5. Zaznamenej vadný a obnovený commit, časy a výsledek smoke ověření.

### 3.3 Databázová změna

Databázový rollback není automaticky totéž jako spuštění opačného SQL. Migrace mohou obsahovat nevratné datové operace a starší aplikace nemusí být kompatibilní s novým schématem.

1. Database owner určí, zda je bezpečnější dopředná opravná migrace, obnovení ze zálohy, nebo návrat aplikace při ponechání kompatibilního schématu.
2. Před zásahem zastav zápisy rezervací, aby nevznikla další data určená k pozdějšímu sloučení.
3. Nevkládej ad-hoc produkční SQL bez peer review, záznamu příkazu a plánu ověření.
4. Obnovení databáze ze zálohy vyžaduje rozhodnutí product ownera, protože může odstranit legitimní rezervace vytvořené po okamžiku zálohy.
5. Po opravě spusť release RLS kontrolu a celý kritický runtime lifecycle.
6. Chybějící rezervace se řeší podle auditní stopy a provozní evidence; nevytvářej je odhadem.

Pokud nelze prokázat konzistenci dat, služba zůstává v omezeném režimu.

## 4. Incident runbook

### 4.1 Založení incidentu

První reagující zaznamená:

- UTC čas detekce a prostředí;
- hlášenou operaci a URL/cestu bez tokenů;
- poslední známý zdravý a aktuálně nasazený commit;
- rozsah dopadu: anonymní čtení, auth, member zápis, admin zápis nebo databáze;
- korelační/request identifikátor, pokud jej platforma poskytuje;
- počet známých dotčených rezervací a časový interval;
- incident ownera a komunikační kanál.

Do incidentu nikdy nekopíruj access token, refresh token, service-role klíč, magic-link URL ani celé osobní údaje uživatele.

### 4.2 Závažnost a reakce

| Závažnost | Příklad | První reakce |
|---|---|---|
| SEV-1 | obcházení RLS, únik citlivých dat, nespolehlivá obsazenost při povolených zápisech | okamžitě omezit provoz a eskalovat incident/database ownerovi |
| SEV-2 | nefunguje auth nebo vytváření/správa rezervací, ale integrita dat není prokazatelně porušená | zastavit dotčenou operaci nebo vrátit poslední zdravou verzi |
| SEV-3 | dílčí UX chyba bez dopadu na autorizaci a integritu rezervací | evidovat, diagnostikovat a opravit standardním releasem |

### 4.3 Diagnostika

Postupuj od nejméně invazivních kontrol:

1. Ověř stav hostingu a Supabase bez restartu nebo změny konfigurace.
2. Porovnej čas incidentu s posledním releasem, migrací a změnou env/Auth redirectů.
3. Reprodukuj problém testovacím účtem a unikátním testovacím slotem; nemanipuluj s cizí rezervací.
4. Porovnej UI se stavem `reservations`, `reservation_public_occupancy` a auditním logem.
5. Rozliš chybu anonymního čtení, session/auth, RLS, databázové kolize a nedostupnost infrastruktury.
6. Uchovej relevantní logy a diagnostické artefakty v souladu s retenčními pravidly provozovatele.
7. Pokud je incident spojený s releasem, použij rozhodnutí z rollback části; jinak nedělej preventivní změny bez potvrzené hypotézy.

### 4.4 Omezení provozu při nespolehlivé obsazenosti

Pokud nelze důvěřovat veřejné obsazenosti, nesmí aplikace dál přijímat rezervace. DEV mock fallback je pouze vývojová pomůcka a není bezpečným produkčním režimem.

Doporučené pořadí omezení:

1. Aktivuj maintenance/read-only režim hostingu, pokud je pro cílové prostředí připravený.
2. Pokud takový režim není dostupný, stáhni vadný aplikační release nebo dočasně znepřístupni aplikaci na hraně hostingu.
3. Databázové zápisy omezuj jen schválenou, auditovatelnou změnou pod vedením database ownera; neupravuj RLS ad-hoc v produkční konzoli.
4. Na veřejném komunikačním kanálu uveď, že rezervace dočasně nejsou přijímány. Neuváděj nepotvrzený čas obnovy.
5. Obnov zápisy až po ověření veřejné occupancy, databázové kolizní ochrany a member/admin lifecycle.

Pokud infrastruktura zatím neumí maintenance/read-only režim, jde o blocker produkční připravenosti, nikoli o důvod ponechat zápisy aktivní.

### 4.5 Ukončení incidentu

Incident lze uzavřít, až když:

- je odstraněná nebo izolovaná příčina;
- kritický runtime lifecycle znovu projde;
- je ověřená konzistence dotčených rezervací a auditní stopy;
- provozní omezení je bezpečně odstraněné;
- incident owner zaznamená dopad, čas obnovy a následné úkoly.

Pro SEV-1 a SEV-2 vznikne krátké postmortem bez obviňování osob: příčina, proč ochrany nestačily, časová osa, dopad a konkrétní prevence s vlastníkem a termínem.

## 5. Nácvik a evidence

Před označením bodu P6 za dokončený musí tým runbook alespoň jednou projít nanečisto na staging nebo izolovaném lokálním prostředí.

Nácvik musí ověřit:

1. dohledání potvrzeného commitu a výsledků všech release kontrol;
2. simulovaný neúspěšný release aplikace a návrat na předchozí zdravý commit;
3. rozhodnutí pro databázovou migraci bez spuštění destruktivního zásahu;
4. omezení zápisů při nespolehlivé occupancy;
5. předání mezi release, database a incident ownerem;
6. vyplnění časové osy, výsledku smoke testu a následných úkolů.

Evidence nácviku má obsahovat datum, prostředí, účastníky/role, použité commity, výsledek a odkazy na bezpečné artefakty. Secrets ani osobní kontakty se do repozitáře nezapisují.
