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

Dne `11. 6. 2026` vlastník projektu stáhl artefakt přes přihlášené GitHub rozhraní a ověřil jeho obsah. Archiv obsahoval otevíratelný Playwright `trace.zip`, automatické PNG screenshoty a cílený screenshot `diagnostika-pokus-1.png`. Trace patřil lifecycle scénáři v projektu `chromium`, zachycoval navigaci na `/rezervace` a skončil očekávanou chybou `Řízené E2E selhání po načtení stránky pro ověření diagnostiky, pokus 1.` Tím je doložen trace i screenshot prvního neúspěšného browserového pokusu a E2 je splněné. Dočasná aktivace selhání byla následně odstraněna. Tento záměrný neúspěch se nezapočítává do vzorku stability E1 ani se neklasifikuje jako produktová regrese.

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

### Postup externího ověření a uzavření E2

Tento postup dokončuje pouze chybějící kontrolu obsahu již publikovaného artefaktu. Není potřeba měnit aplikaci, workflow, autentizaci ani RLS. Doporučená varianta je stažení přes přihlášený web GitHubu, protože nevyžaduje GitHub CLI ani vytváření osobního tokenu.

#### 1. Stáhnout artefakt přes přihlášený GitHub

1. Přihlásit se ke GitHubu účtem, který má alespoň právo číst repozitář `Bbambaaamm/RezervujKurt`.
2. Otevřít [Actions run 27327043964](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27327043964).
3. Na souhrnné stránce běhu najít sekci **Artifacts** a kliknout na `playwright-lifecycle-failure`.
4. Uložit stažený ZIP mimo pracovní strom repozitáře, například jako `~/Downloads/playwright-lifecycle-failure.zip`. Artefakt se nesmí commitnout: může obsahovat snapshoty stránky, testovací data a další diagnostický obsah.
5. Pokud GitHub místo stažení vyžádá přihlášení, dokončit přihlášení ve stejném prohlížeči a vrátit se na stránku běhu. Anonymní přístup nestačí ani u veřejného repozitáře.
6. Pokud sekce **Artifacts** uvádí, že artefakt expiroval, pokračovat rovnou částí **Když artefakt již expiroval**. Workflow má retenční dobu pouze sedm dní, takže odklad kontroly může původní důkaz nenávratně znepřístupnit.

#### 2. Bezpečně zkontrolovat strukturu ZIPu

Následující příkazy pouze čtou archiv a rozbalí jej do dočasného adresáře:

```bash
ARTIFACT="$HOME/Downloads/playwright-lifecycle-failure.zip"
WORKDIR="$(mktemp -d)"

unzip -t "$ARTIFACT"
unzip -l "$ARTIFACT"
unzip -q "$ARTIFACT" -d "$WORKDIR"
find "$WORKDIR" -type f -print | sort
```

Je nutné doložit obě následující skupiny souborů:

- alespoň jeden Playwright trace archiv, typicky soubor pojmenovaný `trace.zip`;
- alespoň jeden screenshot selhání, typicky soubor s příponou `.png`, například `test-failed-1.png`.

Přesný název nadřazeného adresáře není akceptační kritérium a může obsahovat jméno testu, projektu nebo retry. Samotná přítomnost libovolného ZIPu a PNG ale také nestačí: oba soubory musí patřit řízeně selhanému lifecycle testu z tohoto běhu.

Pro rychlou kontrolu lze použít:

```bash
find "$WORKDIR" -type f -name 'trace.zip' -print
find "$WORKDIR" -type f -iname '*.png' -print
```

Pokud některý příkaz nic nevypíše, E2 se nesmí uzavřít. Výsledek se zapíše jako neúspěšné ověření a je nutné opravit diagnostickou konfiguraci nebo zopakovat řízený běh.

#### 3. Otevřít trace a potvrdit, že jde o první neúspěšný pokus

Každý nalezený `trace.zip` otevřít lokálním Playwright Trace Viewerem. Příkaz lze spustit z checkoutu projektu, kde je Playwright již vedený jako vývojová závislost:

```bash
npx playwright show-trace "/absolutni/cesta/k/trace.zip"
```

V Trace Vieweru ověřit a zaznamenat:

1. trace patří lifecycle scénáři z PR #175 a projektu `chromium`;
2. timeline obsahuje otevření stránky a následné záměrné browserové selhání, nikoli pouze chybu instalace nebo startu infrastruktury;
3. je dostupný DOM/snímek stránky a chybová informace odpovídající řízenému selhání;
4. diagnostika obsahuje první neúspěšný pokus. Pokud jsou v artefaktu adresáře nebo traces pro více pokusů, první pokus určit podle retry označení a obsahu trace, ne pouze podle pořadí výpisu souborů;
5. nalezený PNG screenshot patří stejnému neúspěšnému pokusu a lze jej otevřít jako validní obrázek.

Pro kontrolu PNG bez závislosti na konkrétním grafickém programu lze alespoň ověřit typ souboru:

```bash
file "/absolutni/cesta/k/test-failed-1.png"
```

Korektní výsledek musí uvádět PNG image data. Vizuální otevření screenshotu je přesto doporučené, protože samotná hlavička souboru nepotvrzuje, že zachycuje správný stav testu.

#### 4. Zapsat auditovatelný výsledek

Po úspěšné kontrole doplnit do části **Řízené ověření diagnostiky E2** krátký záznam v tomto tvaru:

```md
Dne YYYY-MM-DD ověřil/a @github-login přes přihlášené GitHub rozhraní artefakt
`playwright-lifecycle-failure` z runu 27327043964. Stažený archiv prošel kontrolou
`unzip -t` a obsahoval Playwright `trace.zip` prvního neúspěšného browserového pokusu
i odpovídající PNG screenshot. Trace byl otevřen příkazem `npx playwright show-trace ...`
a zachycoval řízené selhání lifecycle scénáře po otevření stránky. E2 je tímto doložené.
```

Do repozitáře se zapisuje pouze tento závěr, datum a GitHub identita ověřující osoby. Nestandardní lokální cesty, obsah trace, testovací přihlašovací údaje, celý ZIP ani screenshot se necommitují. Odkaz na run, název artefaktu, velikost a veřejně evidovaný digest už v dokumentaci jsou.

Následně provést dvě malé změny v `docs/dalsi-postup.md`:

1. u posledního akceptačního kritéria E2 změnit `[ ]` na `[x]`;
2. změnit nadpis `## [!] E2` na `## [x] E2` a nahradit blokující potvrzení odkazem na datovaný záznam ověření v tomto souboru.

Teprve po tomto zápisu je korektní považovat E2 za uzavřené a zahájit E4.

#### 5. Když ověření neprojde

E2 ponechat jako `[!]` v kterékoli z těchto situací:

- artefakt nejde stáhnout přihlášeným účtem;
- ZIP je poškozený;
- chybí `trace.zip` nebo PNG screenshot;
- trace nelze otevřít;
- trace či screenshot nepatří prvnímu řízeně neúspěšnému browserovému pokusu;
- nelze spolehlivě odlišit první pokus od retry.

Do této evidence zapsat konkrétní zjištění bez domněnek. Pouhá existence artefaktu, jeho velikost nebo digest nedokládají požadovaný obsah.

#### 6. Když artefakt již expiroval

Expirovaný artefakt nelze použít k uzavření E2. V takovém případě je nutné zopakovat řízený důkaz podle části **Chybějící důkaz pro E2** v novém dočasném pull requestu:

1. vyvolat očekávané selhání až po otevření stránky;
2. nezasahovat do produkčních auth/RLS ochran;
3. po skončení běhu stáhnout nový artefakt ještě před uplynutím sedmidenní retence;
4. provést kontroly z kroků 2 až 4 výše;
5. před sloučením odstranit dočasné selhání;
6. nový řízený běh nezapočítat do stability E1.

Není správné pouze znovu spustit starý job a předpokládat stejný obsah. Nový důkaz musí mít vlastní odkaz na run a vlastní datovaný záznam kontroly.

#### Volitelná varianta pro správce s GitHub CLI

Pokud správce později použije GitHub CLI, ekvivalentní stažení konkrétního artefaktu je:

```bash
gh auth login
gh run download 27327043964 \
  --repo Bbambaaamm/RezervujKurt \
  --name playwright-lifecycle-failure \
  --dir "$HOME/Downloads/playwright-lifecycle-failure"
```

Tato varianta není doporučeným předpokladem pro uzavření E2. Webové stažení přihlášeným vlastníkem poskytuje pro požadovanou obsahovou kontrolu stejný podklad bez zavádění tokenu do lokálního prostředí.

Související oficiální dokumentace: [stažení GitHub Actions artefaktů](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/downloading-workflow-artifacts) a [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer-intro).

### Chybějící důkaz pro E2

Úspěšný běh bez retry neprokazuje publikaci diagnostiky, protože při něm může být adresář `test-results/` prázdný a `if-no-files-found: ignore` nevytvoří artefakt. Před uzavřením E2 je nutné provést samostatný dočasný testovací pull request s těmito podmínkami:

1. testovací změna vyvolá očekávané selhání až po otevření stránky, aby Playwright vytvořil trace i screenshot;
2. změna neoslabí produkční autentizaci, RLS, databázové migrace ani ochranu proti kolizím;
3. po dokončení běhu se stáhne `playwright-lifecycle-failure` a ověří se trace a screenshot prvního neúspěšného pokusu;
4. pokud následný retry uspěje, v artefaktu musí zůstat diagnostika prvního pokusu;
5. testovací změna se před sloučením odstraní a odkazy na PR, Actions run a ověřený obsah artefaktu se zapíší do této dokumentace.

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
