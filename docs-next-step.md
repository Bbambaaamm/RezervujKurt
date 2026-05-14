# Doporučený další krok (seniorní postup)

## Stručné shrnutí problému
Projekt má funkční MVP UI nad mock daty, ale bez backendové domény a perzistence. Největší blokátor dalšího vývoje je, že bez stabilního datového modelu nelze bezpečně navázat autentizaci, formulář rezervace ani admin workflow.

## Doporučené řešení
**Další krok: navrhnout a zafixovat databázové schéma v Supabase včetně základních pravidel konzistence.**

Konkrétně:
1. Definovat tabulky: `profiles`, `courts`, `reservations`, `reservation_audit_log`.
2. Vytvořit minimální omezení: unikátnost slotu (`court_id + date + time_from + time_to`), validace intervalu (`time_from < time_to`), stav rezervace (`pending|approved|cancelled`).
3. Připravit RLS pravidla pro role `user` a `admin`.
4. Přidat seed skript s 3 kurty a několika testovacími rezervacemi.

## Proč právě tento krok
- Odstraní největší architektonické riziko (změny datového modelu později rozbíjí API i UI).
- Umožní další vývoj po malých bezpečných krocích: nejdřív read model, potom create flow, nakonec schvalování.
- Udrží kompatibilitu s aktuálním UI (napojení přes mapování z DB modelu na stávající doménové typy).

## Rizika, dopady a co ověřit testem
- **Riziko:** špatně navržené unikátní klíče mohou blokovat legitimní scénáře (např. změna času rezervace).
- **Dopad:** změna se dotkne `lib/types/domain.ts`, budoucí service vrstvy a následně `components/reservation-grid.tsx`.
- **Ověření:** integrační test na kolizi slotu, test RLS přístupů (user vidí své rezervace, admin vidí vše), test mapování DB -> UI model.
