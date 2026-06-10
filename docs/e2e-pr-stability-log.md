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
- Evidence se aktualizuje v některém následujícím PR; dodatečný commit pouze kvůli výsledku právě běžícího checku by spustil nový běh a znejasnil vyhodnocení.

## Evidence automatických PR běhů

| # | Pull request | Actions run | Commit | Typ změny | Výsledek prvního pokusu | Délka jobu | Klasifikace / poznámka |
|---:|---|---|---|---|---|---:|---|
| 1 | [#159](https://github.com/Bbambaaamm/RezervujKurt/pull/159) | [run 27287450026](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27287450026) | `661846f` | ESLint konfigurace a závislosti | Úspěch | 3m 9s | První evidovaný pokus, bez retry |
| 2 | [#160](https://github.com/Bbambaaamm/RezervujKurt/pull/160) | [run 27287860300](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27287860300) | `04f2f28` | CI workflow | Úspěch | 3m 6s | První evidovaný pokus, bez retry |
| 3 | [#161](https://github.com/Bbambaaamm/RezervujKurt/pull/161) | [run 27291238013](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27291238013) | `0c14bbc` | Dokumentace | Úspěch | 3m 2s | První evidovaný pokus, bez retry |
| 4 | [#162](https://github.com/Bbambaaamm/RezervujKurt/pull/162) | [run 27292237088](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27292237088) | `e835b66` | Testovací infrastruktura | Úspěch | 3m 9s | První evidovaný pokus, bez retry |
| 5 | [#163](https://github.com/Bbambaaamm/RezervujKurt/pull/163) | [run 27292820773](https://github.com/Bbambaaamm/RezervujKurt/actions/runs/27292820773) | `37867f7` | Runtime a CI konfigurace | Úspěch | 4m 4s | První evidovaný pokus, bez retry |
| 6 | — | — | — | — | — | — | — |
| 7 | — | — | — | — | — | — | — |
| 8 | — | — | — | — | — | — | — |
| 9 | — | — | — | — | — | — | — |
| 10 | — | — | — | — | — | — | — |

## Průběžné vyhodnocení

K 10. 6. 2026 je evidováno pět dokončených automatických PR běhů bez retry. Vzorek obsahuje čtyři nedokumentační změny a jednu dokumentační změnu. Medián délky lifecycle jobu je `3m 9s`, nejhorší pozorovaná délka je `4m 4s`; jde o průběžný podklad pro E3, nikoli o potvrzení přijatelnosti provozních nákladů vlastníkem projektu.

## Postup zápisu dokončeného běhu

1. V detailu GitHub Actions ověřit událost `pull_request`, název jobu `Auth lifecycle nad lokální Supabase` a první pokus bez retry.
2. Zapsat odkazy na PR a konkrétní Actions run, krátký commit SHA, typ změny, závěr prvního pokusu a délku jobu.
3. Při selhání stáhnout artefakt `playwright-lifecycle-failure`, určit klasifikaci a uvést odkaz na navazující opravu nebo issue.
4. Zrušený nebo ručně spuštěný běh nezapisovat jako úspěšný ani neúspěšný vzorek.

## Kritéria pro nastavení povinného checku

Job lze doporučit jako povinný check, pokud:

1. proběhne alespoň 5, ideálně 10 reprezentativních automatických PR běhů;
2. nevyskytne se nevysvětlené selhání prvního pokusu;
3. případné chyby bude možné jednoznačně diagnostikovat z logů a Playwright artefaktů;
4. bude známý přibližný medián a nejhorší délka jobu;
5. runtime a spotřeba GitHub Actions budou přijatelné;
6. cleanup testovacích dat a lokální Supabase bude fungovat opakovaně.

Po splnění kritérií lze job `Auth lifecycle nad lokální Supabase` nastavit jako povinný check v GitHub Rulesets nebo Branch protection. Změna workflow ani trigger `push` do `main` k tomu nejsou potřeba.
