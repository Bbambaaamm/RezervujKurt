# Runtime verification checklist (lokální Supabase)

Tento checklist je určený pro "Production Confidence Pass" bez změny business logiky. Cíl je ověřit, že běh aplikace odpovídá datům v lokální Supabase instanci a že fallback režim není tichý.

## Předpoklady
- Běží lokální Supabase (`npx supabase start`).
- Aplikace běží přes `npm run dev`.
- `.env.local` ukazuje na stejný Supabase endpoint jako `npx supabase status`.
- V DB existuje alespoň jeden `member` a jeden `admin` účet (seed nebo ručně).


## Ověřovací kroky
1. **Anonymous user vidí kurty a veřejnou occupancy**
   - Otevři `/rezervace` v anonymním okně.
   - Ověř, že se načtou kurty a blokované sloty (`pending` + `approved`).
   - V DEV konzoli zkontroluj, že se vypisují requesty na `reservation_public_occupancy` a nejsou vidět fallback hlášky.
   - ✅ PASS

2. **Anonymous user nemůže vytvořit rezervaci**
   - Na `/rezervace` bez přihlášení ověř, že se nezobrazuje rezervační formulář.
   - Ověř, že je vidět pouze výzva k přihlášení.
   - ✅ PASS

3. **Přihlášený member vytvoří pending rezervaci**
   - Přihlas se jako member.
   - Vytvoř rezervaci na volný slot.
   - Ověř, že UI zobrazí úspěch vytvoření.
   - V Supabase DB ověř `reservations.status = 'pending'` pro novou položku.
   - ✅ PASS

4. **Pending rezervace okamžitě blokuje slot v gridu**
   - Po vytvoření rezervace zůstaň na `/rezervace`.
   - Ověř, že stejný slot je okamžitě označen jako obsazený.
   - ✅ PASS

5. **Admin vidí pending rezervaci**
   - Přihlas se jako admin a otevři `/admin`.
   - Ověř, že nová pending rezervace je v seznamu čekajících.
   - ✅ PASS

6. **Admin rezervaci approve/cancel**
   - Proveď schválení (`approve`) nebo zrušení (`cancel`) pending rezervace.
   - Ověř, že UI akci potvrdí a položka změní stav.
   - ✅ PASS

7. **Approved rezervace blokuje slot**
   - Po `approve` ověř na `/rezervace`, že slot zůstává blokovaný.
   - ✅ PASS

8. **Cancelled rezervace slot uvolní**
   - Po `cancel` ověř na `/rezervace`, že slot je opět volný.
   - ✅ PASS

9. **Data v UI odpovídají Supabase DB**
   - Porovnej minimálně: `court_id`, `reservation_date`, `time_from`, `time_to`, `status` mezi UI a tabulkou/view (`reservations`, `reservation_public_occupancy`).
   - ✅ PASS

10. **Aplikace neběží omylem na mock/fallback datech**
   - V DEV ověř, že se nezobrazuje banner o fallback režimu.
   - Pokud banner vidíš, považuj runtime verifikaci za nevalidní, dokud není opravena příčina Supabase read chyby.
   - ✅ PASS

## Poznámky k limitům ověření
- Tento checklist je manuální smoke průchod; nenahrazuje E2E automatizaci.
- Pokud nejsou dostupné testovací účty pro member/admin, kroky 3–8 nelze plně ověřit pouze z kódu.
