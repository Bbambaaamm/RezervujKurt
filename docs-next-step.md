# Stav plánu: audit create reservation flow (k 14. 5. 2026)

## Stručné shrnutí
Po kontrole aktuálního repozitáře není „create reservation flow“ v UI ani service vrstvě fakticky dokončený. Implementovaný je stabilní **read-only vertical slice** (grid + čtení ze Supabase + fallback na mock data), ale chybí write service, formulář pro vytvoření rezervace a napojení na autentizovaný token flow.

To znamená, že Milestone 1 ve smyslu „minimum vertical slice create reservation flow“ je aktuálně splněn jen částečně (datový základ je připraven, create tok end-to-end ne).

---

## 1) End-to-end audit create reservation flow

## Co je reálně hotové
- Read-only načítání kurtů a rezervací přes Supabase REST (`supabaseSelect`, `getCourtsReadOnly`, `getReservationsReadOnly`).
- Funkční grid s denním přehledem a fallbackem na mock data při chybě.
- DB schéma + RLS + constraints proti kolizím (včetně exclusion constraint).

## Co chybí pro create flow
- Chybí write service (`insert` rezervace) v `lib/services`.
- Chybí create formulář na stránce rezervací (datum/kurt/čas/poznámka + submit).
- Chybí zpracování access tokenu z auth session (ať už automaticky nebo dočasně ručně).
- Chybí UX/error handling pro create operaci (konflikt slotu, validační chyba, neautorizovaný přístup).

**Závěr:** End-to-end create flow v této revizi není nasaditelný; k dispozici je pouze read-only část.

---

## 2) Vyhodnocení vůči MVP standardu

## UX kvalita
- **Pozitivní:** Grid je přehledný, statusy jsou vizuálně odlišené, výběr dne funguje.
- **Nedostatek:** UI naznačuje interakci „klikněte a tahem vyberte úsek“, ale výběr nevede k vytvoření rezervace.
- **MVP dopad:** Pro read-only demo dostačující; pro create MVP nedostatečné.

## Bezpečnost
- **Pozitivní:** DB má RLS zapnuté a data model má kvalitní omezení pro časové kolize.
- **Nedostatek:** V dev migraci je `reservations_select_public_overview_anon using (true)`, což je záměrně otevřené čtení. To je pro dev akceptovatelné, ale nesmí se dostat do produkce beze změny.
- **MVP dopad:** Jako přechodný režim pro čtení akceptovatelné, pro produkční provoz ne.

## Architektura
- **Pozitivní:** Rozumné oddělení doménových typů, service vrstvy a UI.
- **Nedostatek:** `lib/supabase/client.ts` je čistě anon-read klient; zatím není infrastruktura pro authenticated write requesty s user tokenem.
- **MVP dopad:** Architektura je vhodná pro pokračování, ale write větev chybí.

## Připravenost na další milestone
- DB základ je dostatečný pro navázání.
- Nejmenší bezpečný další krok je doplnit minimální write slice (service + formulář + mapování chyb).

---

## 3) Fokusované body

## Ruční access token input
- V aktuálním kódu není implementovaný ani tento dočasný mechanismus.
- Doporučení: pokud má být přechodně použit, tak pouze v developer režimu, maskovaný input, neperzistovat do localStorage, neposílat do logů.

## RLS model
- RLS model pro `profiles/reservations/audit` je koncepčně správný (owner/admin).
- Chybí explicitní oddělení dev a prod policy režimu v release procesu (nejen v SQL souborech, ale i provozně).

## anon/authenticated role
- Read flow používá anon klíč (správně pro veřejný přehled).
- Pro create flow je nutné přejít na authenticated token konkrétního uživatele; bez toho nelze korektně splnit `reservations_insert_owner_or_admin` policy.

## Error handling
- Read flow má fallback a logování chyb.
- Create flow error handling neexistuje (není implementace).
- Doporučení: standardizovat minimálně 4 stavy: validace, kolize (constraint), auth chyba 401/403, neočekávaná 5xx.

## Validace času a kolizí
- DB validace je kvalitní a blokující nekonzistenci.
- V UI zatím chybí pre-check i post-submit interpretace kolize (human-readable hláška).

## Audit log připravenost
- Tabulka audit log existuje, select policy je připravená.
- Chybí write mechanismus audit záznamu při create a status změnách.

## Budoucí auth flow
- Datový model je kompatibilní s auth flow (profiles + auth.uid vazba).
- Největší mezera je aplikační orchestrace session/tokenu a route guardů.

---

## 4) Kritické blokátory a minimální bezpečné řešení

## Je blokující problém?
Ano: pokud by se mělo pokračovat v „create reservation MVP“, blokující je absence authenticated write kanálu.

## Minimální bezpečné řešení (bez velkého refactoru)
1. Přidat separátní write service funkci pro `POST /rest/v1/reservations` s předaným bearer tokenem uživatele.
2. Přidat jednoduchý formulář (nebo navázat na drag výběr) se serverovým submit handlerem a explicitními chybami.
3. Prozatím ponechat read-only anon režim, ale write povolit pouze authenticated tokenem.
4. Doplnit guard: pokud není token/session, submit zakázat a zobrazit call-to-action na přihlášení.

Tento rozsah je minimální, reverzibilní a bezpečně navazuje na stávající architekturu.

---

## 5) Doporučení k roadmapě

- Aktuální implementace **stačí jako přechodné MVP pro read-only milestone**, nikoliv pro create milestone.
- Doporučený další krok:
  - buď dokončit skutečný Milestone 1 (create vertical slice) minimálním write doplněním,
  - nebo pokud je prioritou bezpečnost a dlouhodobá udržitelnost, přesunout prioritu na auth flow a teprve potom dokončit create UI.

**Doporučená varianta:** nejdřív tenký auth základ (session/token orchestrace), hned poté create write slice. Důvod: odstraní to dočasné bezpečnostní kompromisy kolem tokenu a zamezí duplicitní implementaci.

---

## 6) Finální rozhodovací shrnutí

- **Největší technický dluh:** chybějící write větev (service + formulář + chybové scénáře), zatímco UI už naznačuje create interakci.
- **Největší bezpečnostní riziko:** potenciální provoz dev anon read policy bez přísného oddělení od produkce; sekundárně rizikový by byl ad-hoc ruční token flow bez guardů.
- **Je vhodné pokračovat Milestone 2?** Ne, dokud není dokončen reálný create flow Milestone 1.
- **Milestone 2 vs auth flow?** Konzervativně doporučuji nejdřív minimální auth flow (alespoň session/token vrstva), pak dokončit create flow, teprve následně Milestone 2 (UX validace kolizí).

---

## 7) Stav implementace auth-first kroku (update 14. 5. 2026)

**Stav:** rozpracováno (MVP auth základ hotový).

Doplněno:
- minimální přihlášení/odhlášení přes Supabase Auth (OTP e-mail),
- načtení session tokenu v aplikaci,
- create reservation submit používá výhradně session access token aktuálně přihlášeného uživatele,
- odstraněna potřeba ručního zadávání tokenu ve create flow,
- doplněné hlášky pro nepřihlášeného uživatele, úspěch, kolizi a chybu oprávnění.

### Další doporučený milestone
Dokončit „auth-first“ do produkčnější podoby:
1. Route guard pro stránky/akce vyžadující přihlášení.
2. Stabilní obnovování session a jednotný auth stav v layoutu.
3. Následně teprve navázat schvalovací workflow (admin).
