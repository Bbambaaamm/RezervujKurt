# Stabilita automatického E2E lifecycle ověřování

## Cíl

Ověřit stabilitu workflow `E2E Lifecycle Verification` v automatickém PR provozu před nastavením jobu `Auth lifecycle nad lokální Supabase` jako povinného status checku.

## Pravidla vyhodnocení

- Hodnotí se pouze běhy automaticky spuštěné událostí `pull_request`.
- Každý řádek musí obsahovat odkaz na konkrétní pull request a GitHub Actions run; neurčité hodnoty jako „Tento PR“ nejsou dostatečným auditním záznamem.
- Rozhodující je výsledek prvního pokusu (`run_attempt = 1`). Úspěšný retry nemění původní neúspěch na stabilní běh.
- Ruční běhy přes `workflow_dispatch`, zrušené běhy a běhy s přeskočeným lifecycle jobem se do vzorku nezapočítávají.
- Běh se zapisuje až po dokončení, aby evidence neobsahovala dlouhodobý stav „Čeká na ověření“.
- Selhání se klasifikuje jako produktová regrese, nestabilita testu, problém testovacích dat nebo problém CI infrastruktury. Neznámá příčina zůstává otevřeným blokátorem.
- Klasifikace musí vycházet z prvního neúspěšného pokusu. Úspěšný retry je signál možné nestability, nikoli důvod původní selhání ignorovat.
- U každého selhání se zapisuje konkrétní příčina, navazující oprava nebo issue a výsledek opakovaného ověření.
- Evidence se aktualizuje v některém následujícím PR; dodatečný commit pouze kvůli výsledku právě běžícího checku by spustil nový běh a znejasnil vyhodnocení.

## Evidence automatických PR běhů

| # | Pull request | Actions run | Commit | Typ změny | Výsledek prvního pokusu | Délka jobu | Klasifikace / poznámka |
|---:|---|---|---|---|---|---:|---|
| 1 | [#159](https://github.com/Bbambaaamm/RezervujKurt/pull/159) | [run 27287450026](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27287450026) | `661846f` | ESLint konfigurace a závislosti | Úspěch | 3m 9s | První evidovaný pokus, bez retry |
| 2 | [#160](https://github.com/Bbambaaamm/RezervujKurt/pull/160) | [run 27287860300](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27287860300) | `04f2f28` | CI workflow | Úspěch | 3m 6s | První evidovaný pokus, bez retry |
| 3 | [#161](https://github.com/Bbambaaamm/RezervujKurt/pull/161) | [run 27291238013](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27291238013) | `0c14bbc` | Dokumentace | Úspěch | 3m 2s | První evidovaný pokus, bez retry |
| 4 | [#162](https://github.com/Bbambaaamm/RezervujKurt/pull/162) | [run 27292237088](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27292237088) | `e835b66` | Testovací infrastruktura | Úspěch | 3m 9s | První evidovaný pokus, bez retry |
| 5 | [#163](https://github.com/Bbambaaamm/RezervujKurt/pull/163) | [run 27292820773](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27292820773) | `37867f7` | Runtime a CI konfigurace | Úspěch | 4m 4s | První evidovaný pokus, bez retry |
| 6 | [#164](https://github.com/Bbambaaamm/RezervujKurt/pull/164) | [run 27294076829](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27294076829) | `dd460e9` | E2E evidence a řídicí checklist | Úspěch | 3m 21s | První evidovaný pokus, bez retry |
| 7 | [#173](https://github.com/Bbambaaamm/RezervujKurt/pull/173) | [run 27324983652](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27324983652) | `604b37f` | Dokumentace a potvrzení E1 | Úspěch | 2m 56s | První pokus bez retry; upload krok toleroval chybějící diagnostické soubory, jejich publikaci neověřil |
| 8 | — | — | — | — | — | — | — |
| 9 | — | — | — | — | — | — | — |
| 10 | — | — | — | — | — | — | — |

## Řízené ověření diagnostiky E2

[PR #175](https://github.com/Bbambaaamm/RezervujKurt/pull/175) spustil dočasně řízené selhání po otevření stránky. [Actions run 27327043964](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27327043964) skončil podle očekávání neúspěchem za `3m 5s` a publikoval artefakt `playwright-lifecycle-failure` o velikosti `876 KB` s digestem `sha256:bd91ec2a95c2c010542c0fd6482c70407aa46ae16d4af3153c9c514370ff53f1`. Tím je potvrzeno, že upload krok při reálném browserovém selhání diagnostický artefakt vytvoří.

Vlastník projektu stažený artefakt zkontroloval a dodanými screenshoty potvrdil trace a screenshot prvního neúspěšného browserového pokusu i zachování diagnostiky retry. Diagnostická změna z commitu `a13ebcd` byla sloučena do cílové větve merge commitem `258a332`; standardní lifecycle byl obnoven až následným commitem `cf1b016`. Cílová větev proto mezi těmito dvěma commity dočasně obsahovala úmyslně selhávající konfiguraci. Tím je diagnostické kritérium E2 splněné. Tento záměrný neúspěch se nezapočítává do vzorku stability E1 ani se neklasifikuje jako produktová regrese.

## Průběžné vyhodnocení

K 11. 6. 2026 je evidováno sedm dokončených automatických PR běhů bez retry. Vzorek obsahuje čtyři nedokumentační změny a tři dokumentační změny. Žádný z evidovaných prvních pokusů neselhal, takže nevzniklo selhání vyžadující klasifikaci ani otevřený nevysvětlený blokátor. Sedmý běh ověřil, že upload krok při čistém běhu toleruje chybějící diagnostické soubory; neověřil vznik ani obsah artefaktu při selhání. Medián délky lifecycle jobu je `3m 9s` a nejhorší pozorovaná délka je `4m 4s`.

## Vyhodnocení provozních nákladů

Vyhodnocení vychází ze šesti běhů uvedených výše a z konfigurace standardního runneru `ubuntu-latest` s limitem `timeout-minutes: 20`.

| Ukazatel | Výsledek | Dopad |
|---|---:|---|
| Součet skutečné délky vzorku | `19m 51s` | Průměrně přibližně `3m 19s` na PR |
| Medián skutečné délky | `3m 9s` | Běžný PR čeká na lifecycle přibližně tři minuty |
| Nejhorší pozorovaná délka | `4m 4s` | Dosavadní maximum využívá přibližně 20 % timeoutu |
| Konzervativní účtovací odhad vzorku | `25 minut` | GitHub u privátních repozitářů zaokrouhluje každý job nahoru na celou minutu |
| Konzervativní odhad pro 100 PR za měsíc | `400 minut` | Odhad používá čtyři účtované minuty na typický běh bez retry |

Repozitář je k datu vyhodnocení veřejný a workflow používá standardní GitHub-hosted runner. Podle dokumentace GitHubu proto běhy nemají účtované Actions minuty. Pokud by se repozitář změnil na privátní, je nutné odhad znovu porovnat s tarifem vlastníka; při současném mediánu odpovídá jeden úspěšný běh konzervativně čtyřem účtovaným minutám. Diagnostický artefakt se nahrává pouze při vzniku souborů v `test-results/` a má retenční dobu sedm dní, takže šest úspěšných běhů nevytvořilo evidovaný artefaktový náklad.

Timeout 20 minut zůstává přiměřený. Je téměř pětinásobkem nejhorší pozorované délky, ponechává rezervu pro první stažení Docker obrazů a pomalejší GitHub runner, ale stále ukončí zaseknutý lokální Supabase nebo Playwright běh výrazně dříve než výchozí šestihodinový limit GitHub-hosted jobu. Zkrácení timeoutu by při malém vzorku nepřineslo měřitelnou úsporu běžných úspěšných běhů, protože timeout není rezervovaná ani předem účtovaná kapacita.

**Závěr:** provozní náklady lifecycle jobu jsou pro spuštění na každém pull requestu přijatelné. Předpoklad platí, dokud repozitář zůstává veřejný, používá standardní runner a délka jobu se významně nezvýší. Náklady je vhodné znovu posoudit při změně viditelnosti repozitáře, runneru, překročení deseti minut mediánu nebo při pravidelných retry.

**Použité externí podklady (ověřeno 10. 6. 2026):**

- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) — standardní GitHub-hosted runnery jsou pro veřejné repozitáře bez účtovaných minut;
- [Viewing job execution time](https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/monitoring-workflows/viewing-job-execution-time) — u privátních repozitářů se účtované minuty jobu zaokrouhlují nahoru;
- [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) — `ubuntu-latest` patří mezi standardní GitHub-hosted runnery.

## Postup zápisu dokončeného běhu

1. V detailu GitHub Actions ověřit událost `pull_request`, název jobu `Auth lifecycle nad lokální Supabase` a první pokus bez retry.
2. Zapsat odkazy na PR a konkrétní Actions run, krátký commit SHA, typ změny, závěr prvního pokusu a délku jobu.
3. Při selhání stáhnout artefakt `playwright-lifecycle-failure` a pro první neúspěšný pokus projít Playwright trace, screenshot, chybový kontext a log kroku workflow.
4. Zapsat jednu z povolených klasifikací, konkrétní příčinu, odkaz na opravu nebo issue a výsledek navazujícího ověření. Pokud příčinu nelze doložit, ponechat ji jako otevřený blokátor.
5. Zrušený nebo ručně spuštěný běh nezapisovat jako úspěšný ani neúspěšný vzorek.

## Diagnostika selhání

Playwright ukládá trace každého neúspěšného pokusu do `test-results/` a při selhání po vytvoření stránky také screenshot. Workflow se pokusí tento adresář nahrát jako artefakt `playwright-lifecycle-failure` vždy po lifecycle kroku, tedy i když retry obnoví úspěšný výsledek. Pokud čistý běh nevytvoří žádnou diagnostiku, `if-no-files-found: ignore` ponechá upload krok úspěšný bez artefaktu. Infrastrukturní chyby před spuštěním browseru se určují z trace a logu workflow; screenshot u nich nemusí existovat.

### Ověřený důkaz pro E2

Řízený neúspěšný běh v PR #175 prokázal diagnostické chování workflow za těchto podmínek:

1. testovací změna vyvolala očekávané selhání až po otevření stránky, takže Playwright vytvořil trace i screenshot;
2. změna neoslabila produkční autentizaci, RLS, databázové migrace ani ochranu proti kolizím;
3. artefakt `playwright-lifecycle-failure` obsahoval trace a screenshot prvního neúspěšného pokusu;
4. artefakt zachoval také diagnostiku retry;
5. diagnostická změna byla sloučena commitem `258a332` a standardní lifecycle následně obnovil commit `cf1b016`; výsledek vlastník projektu potvrdil dodanými screenshoty.

Ruční nebo záměrně neúspěšný běh se nezapočítává do vzorku stability E1; slouží pouze jako důkaz diagnostické připravenosti E2.

Při klasifikaci použijte následující rozlišení:

- **produktová regrese** — aplikace, auth nebo databázové chování neodpovídá očekávanému produkčnímu kontraktu;
- **nestabilita testu** — produktový stav je správný, ale test závisí na nespolehlivém čekání, selektoru nebo pořadí;
- **problém testovacích dat** — příčinou je kolize, neprovedený cleanup nebo neplatný fixture stav;
- **problém CI infrastruktury** — selže runner, instalace, lokální Supabase, síť nebo jiná infrastruktura mimo produkt a testovací data.

Klasifikace nesmí vést k oslabení produkční autentizace, RLS politik ani databázové ochrany proti kolizím pouze proto, aby E2E test prošel.

## Kritéria pro nastavení povinného checku

Job lze doporučit jako povinný check, pokud:

1. proběhne alespoň 5, ideálně 10 reprezentativních automatických PR běhů;
2. nevyskytne se nevysvětlené selhání prvního pokusu;
3. případné chyby bude možné jednoznačně diagnostikovat z logů a Playwright artefaktů;
4. bude známý přibližný medián a nejhorší délka jobu;
5. runtime a spotřeba GitHub Actions budou přijatelné;
6. cleanup testovacích dat a lokální Supabase bude fungovat opakovaně.

Po splnění kritérií lze job `Auth lifecycle nad lokální Supabase` nastavit jako povinný check v GitHub Rulesets nebo Branch protection. Změna workflow ani trigger `push` do `main` k tomu nejsou potřeba.
