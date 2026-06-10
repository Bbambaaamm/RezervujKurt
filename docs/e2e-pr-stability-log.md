# Stabilita automatického E2E lifecycle ověřování

## Cíl

Ověřit stabilitu workflow `E2E Lifecycle Verification` v automatickém PR provozu před nastavením jobu `Auth lifecycle nad lokální Supabase` jako povinného status checku.

## Pravidla vyhodnocení

- Hodnotí se pouze automatické běhy spuštěné událostí `pull_request`.
- Rozhodující je výsledek prvního pokusu bez retry.
- Ručně spuštěné běhy přes `workflow_dispatch` se do evidence nezapočítávají.
- Zrušené nebo přeskočené běhy se do vyhodnocovaného vzorku nezapočítávají.
- Červený první pokus následovaný úspěšným retry se eviduje jako nestabilní běh.
- Každé selhání musí být klasifikováno jako produktová regrese, nestabilita testu, problém testovacích dat nebo problém CI infrastruktury.

## Evidence automatických PR běhů

| # | Pull request | Typ změny | Výsledek prvního pokusu | Délka jobu | Retry | Poznámka |
|---:|---|---|---|---:|---|---|
| 1 | Tento PR | Dokumentace | Čeká na ověření | — | Ne | První ověření automatického `pull_request` triggeru |
| 2 | — | — | — | — | — | — |
| 3 | — | — | — | — | — | — |
| 4 | — | — | — | — | — | — |
| 5 | — | — | — | — | — | — |
| 6 | — | — | — | — | — | — |
| 7 | — | — | — | — | — | — |
| 8 | — | — | — | — | — | — |
| 9 | — | — | — | — | — | — |
| 10 | — | — | — | — | — | — |

## Kritéria pro nastavení povinného checku

Job lze doporučit jako povinný check, pokud:

1. proběhne alespoň 5, ideálně 10 reprezentativních automatických PR běhů;
2. nevyskytne se nevysvětlené selhání prvního pokusu;
3. případné chyby bude možné jednoznačně diagnostikovat z logů a Playwright artefaktů;
4. bude známý přibližný medián a nejhorší délka jobu;
5. runtime a spotřeba GitHub Actions budou přijatelné;
6. cleanup testovacích dat a lokální Supabase bude fungovat opakovaně.

Po splnění těchto kritérií bude možné nastavit job `Auth lifecycle nad lokální Supabase` jako povinný check v GitHub Rulesets nebo Branch protection. Trigger `push` do `main` se kvůli tomu přidávat nemusí.
