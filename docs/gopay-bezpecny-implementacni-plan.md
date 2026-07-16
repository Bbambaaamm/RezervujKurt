# Bezpečný implementační plán GoPay plateb pro rezervace nečlenů

Tento dokument je pracovní checklist pro postupné zavedení platební brány GoPay do projektu RezervujKurt. Je záměrně navržený tak, aby jednotlivé kroky neohrozily současný produkční rezervační systém.

## Hlavní pravidlo

Současné rezervace musí fungovat během celé implementace. Žádný krok nesmí změnit chování členů a administrátorů, dokud není změna připravená, otestovaná, nasazená za vypnutým feature flagem a bezpečně vratná.

## Bezpečnostní principy

- Každý krok musí být malý, izolovaný a samostatně reviewovatelný.
- Databázové migrace mají být přednostně aditivní.
- Nový kód musí být nasaditelný s vypnutým feature flagem.
- Starý kód musí fungovat i s novou databází.
- Rollback aplikace nesmí vyžadovat destruktivní rollback databáze.
- Členové a administrátoři musí rezervovat stejně jako nyní.
- Nečlen nesmí získat potvrzenou rezervaci bez serverově ověřené platby.
- Klient nikdy nesmí potvrzovat platbu, refund ani schválení rezervace.
- Návratová URL z GoPay není důkaz zaplacení.
- Zdroj pravdy pro schválení je pouze serverové ověření GoPay stavu a transakční zápis v databázi.
- Dočasně blokovaný termín musí být chráněn databázovou ochranou proti překryvu.
- Automatický refund nesmí být označen jako dokončený jen proto, že byl odeslán požadavek do GoPay.
- Při problému musí jít vypnout vytváření nových plateb bez poškození rozpracovaných plateb.

## Aktuální produkční invarianta, kterou nesmíme rozbít

- Rezervace dnes používají stavy `pending`, `approved`, `cancelled`.
- `pending` a `approved` rezervace blokují překryv termínů.
- Členové a administrátoři jsou automaticky schvalováni samostatnou databázovou funkcí/cronem.
- Admin stále musí umět ručně schvalovat běžné čekající rezervace.
- Public grid musí správně ukazovat obsazenost.
- Uživatel musí umět zrušit svoji budoucí rezervaci podle současného chování.
- Notification outbox je existující notifikační mechanismus a nemá vzniknout druhý paralelní systém.
- Auditní log rezervací musí zůstat použitelný.

## Oddělení merge aplikace a produkční databázové migrace

- [ ] Merge do `main` nesmí automaticky znamenat spuštění `supabase db push` do produkce.
- [ ] Produkční databázová migrace je samostatná, řízená a auditovatelná operace.
- [ ] Před produkční migrací musí být zkontrolován přesný SQL obsah všech migrací, které se mají aplikovat.
- [ ] Musí být potvrzeno, které tabulky, funkce, policies, views, triggery, indexy a constraints migrace mění.
- [ ] Musí být posouzeno riziko zámků, délka zámků a možnost blokování zápisů rezervací.
- [ ] Po produkční migraci musí následovat produkční smoke test současného systému.
- [ ] Aplikační kód se nesmí začít spoléhat na databázovou změnu, která ještě není v produkci.
- [ ] U čistě aditivní migrace může být merge kódu bezpečný i před produkční migrací pouze tehdy, pokud aktuální produkční kód nový objekt vůbec nepoužívá.
- [ ] Feature flag musí zůstat vypnutý, dokud není potvrzeno, že příslušná databázová změna existuje v produkci.

## Deployment kompatibilita Blue/Green

Každá změna musí být kompatibilní po dobu, kdy mohou současně běžet stará i nová verze aplikace. Deployment nesmí předpokládat, že všechny instance aplikace už běží na nové verzi.

- [ ] Po dobu rolloutu mohou několik minut běžet dvě různé verze aplikace.
- [ ] Nová databázová struktura musí být kompatibilní se starou aplikací.
- [ ] Nová aplikace musí bezpečně fungovat i před aktivací nové databázové funkcionality.
- [ ] Nová aplikace nesmí začít používat nový DB objekt bez ověření, že existuje v cílovém prostředí.
- [ ] Staré instance nesmí chybně interpretovat nové stavy nebo nové řádky vytvořené novou verzí.
- [ ] Během rolloutu nesmí vzniknout race condition mezi starým create/cancel flow a novým platebním flow.
- [ ] Feature flag nebo kill switch musí být vyhodnocen serverově pro každou operaci, ne pouze při startu procesu.
- [ ] Při změně kontraktu mezi DB a aplikací musí existovat přechodová verze, která rozumí starému i novému stavu.

### Doporučené pořadí databázového PR

- [ ] Vytvořit feature branch.
- [ ] Připravit migraci a testy.
- [ ] Spustit automatické testy.
- [ ] Aplikovat migraci na staging.
- [ ] Spustit staging regresní test současných rezervací.
- [ ] Zkontrolovat přesný SQL obsah migrace.
- [ ] Posoudit produkční rizika, zámky a dobu běhu.
- [ ] Aplikovat migraci do production jako samostatnou řízenou operaci.
- [ ] Provést produkční smoke test původního systému.
- [ ] Teprve následně začít používat novou databázovou funkcionalitu aplikací.
- [ ] Feature flag ponechat vypnutý až do výslovné aktivační fáze.

## Klasifikace rizikovosti migrací

### Nízké riziko

Typické příklady:

- [ ] Vytvoření nové izolované tabulky, kterou produkční kód zatím nepoužívá.
- [ ] Vytvoření nové nepoužívané funkce.
- [ ] Přidání neaktivního serverového endpointu.
- [ ] Přidání testů.
- [ ] Přidání vypnutého feature flagu.

Požadovaná kontrola:

- [ ] Standardní review.
- [ ] Automatické testy.
- [ ] Ověření, že starý kód nový objekt nepoužívá.
- [ ] Produkční smoke test po migraci, pokud se migrace aplikuje do production.

### Střední riziko

Typické příklady:

- [ ] Nový foreign key.
- [ ] Nový index.
- [ ] Nové RLS policies.
- [ ] Změna view.
- [ ] Přidání triggeru.
- [ ] Nový cron.
- [ ] Změna práv k existující tabulce.

Požadovaná kontrola:

- [ ] Důkladné DB review.
- [ ] Staging migrace a staging regresní test.
- [ ] Posouzení lock levelu a doby běhu.
- [ ] Produkční databázový preflight.
- [ ] Produkční smoke test po migraci.

### Vysoké riziko

Typické příklady:

- [ ] Změna existujícího check constraintu.
- [ ] Nahrazení exclusion constraintu.
- [ ] Změna RLS na `reservations`.
- [ ] Změna významu existujícího statusu.
- [ ] Přejmenování nebo odstranění sloupce.
- [ ] Změna typu sloupce.
- [ ] Backfill existujících produkčních dat.
- [ ] Automatická migrace spouštěná při každém deploymentu.

Požadovaná kontrola:

- [ ] Senior DB/code review.
- [ ] Přesný SQL plán v PR.
- [ ] Staging test se simulací produkčních dat, pokud je to možné.
- [ ] Posouzení zámků, dlouhých transakcí, cronů a souběžného provozu.
- [ ] Předem připravená dopředná opravná migrace nebo nápravný postup.
- [ ] Provedení v době nejnižšího provozu.
- [ ] Produkční smoke test ihned po migraci.
- [ ] Zvýšený monitoring po nasazení.

## Produkční databázový preflight

Samotný úspěch migrace na stagingu neznamená, že je migrace bezriziková pro production. Staging nemusí mít stejná data, počet řádků, souběžný provoz, cron úlohy ani zatížení.

Před každou produkční databázovou migrací musí být splněno:

### Git

- [ ] Zkontrolovat `git status`.
- [ ] Zkontrolovat aktuální branch a commit.
- [ ] Zkontrolovat, že pracovní strom neobsahuje necommitnuté změny.
- [ ] Ověřit, že commit odpovídá reviewované a schválené verzi.

### Supabase

- [ ] Zkontrolovat `supabase migration list` pro staging.
- [ ] Zkontrolovat `supabase migration list` pro production.
- [ ] Potvrdit správný Supabase project ref.
- [ ] Potvrdit, že žádná staging nebo testovací konfigurace nesměřuje do production.
- [ ] Ověřit, že produkční migrace není spouštěná automaticky jako vedlejší efekt aplikačního deploye.

### SQL

- [ ] Zkontrolovat přesný obsah všech dosud neaplikovaných migrací.
- [ ] Identifikovat všechny dotčené databázové objekty.
- [ ] Posoudit SQL lock level každé operace.
- [ ] Posoudit dobu běhu na reálném množství dat.
- [ ] Ověřit kompatibilitu starého kódu s novou databází.
- [ ] Ověřit kompatibilitu nového kódu se stavem před aktivací.
- [ ] Ověřit, že migrace není destruktivní.
- [ ] U rizikovější migrace připravit `lock_timeout`/postup, který neblokuje nové rezervace neomezeně dlouho.

### Backup

- [ ] Ověřit aktuální zálohu databáze.
- [ ] Ověřit, kdo má oprávnění obnovu nebo nápravný postup spustit.
- [ ] Připravit dopřednou opravnou migraci nebo nápravný postup.
- [ ] Rizikovější migraci provádět v době nejnižšího provozu.

### Smoke test a monitoring

- [ ] Připravit produkční smoke test.
- [ ] Po migraci zkontrolovat databázové logy.
- [ ] Po migraci zkontrolovat chyby aplikace.
- [ ] Po migraci zkontrolovat, že cron úlohy a notification outbox nevykazují nové chyby.

## Produkční smoke test

Produkční smoke test se používá po každém merge, který může ovlivnit runtime, a po každé produkční databázové migraci. Nesmí vytvářet zbytečné nebo matoucí rezervace; používej určený testovací účet a testovací rezervaci po ověření bezpečně zruš.

- [ ] Veřejná rezervační stránka se načte.
- [ ] Public occupancy vrací správná data.
- [ ] Přihlášení funguje.
- [ ] Člen vytvoří rezervaci.
- [ ] Členova rezervace zůstane `pending` do současného auto-approve procesu.
- [ ] Automatické schválení člena proběhne.
- [ ] Administrátor vidí běžné pending rezervace.
- [ ] Administrátor může běžnou rezervaci schválit.
- [ ] Administrátor může běžnou rezervaci zrušit.
- [ ] Uživatel může zrušit vlastní budoucí rezervaci.
- [ ] Překryv rezervací je odmítnut.
- [ ] Turnajová blokace funguje.
- [ ] Notification outbox nevykazuje chyby.
- [ ] Cron auto-approve běží.
- [ ] Aplikační logy neobsahují nové chyby.
- [ ] Platební feature flag je ve správném stavu.
- [ ] Pokud je GoPay vypnuté, žádný běžný uživatel se do platebního flow nedostane.

## Rollback aplikace, databáze a dopředné opravy

- [ ] Rollback aplikace a rollback databáze nejsou totéž.
- [ ] Vercel rollback nevrátí Supabase migraci.
- [ ] Produkční databázové migrace se nemají mazat z historie.
- [ ] U aditivních změn je obvykle bezpečnější ponechat nový objekt nevyužitý.
- [ ] Chybná migrace se primárně opravuje novou dopřednou migrací.
- [ ] Destruktivní rollback databáze se používá pouze při výslovně posouzené nouzové situaci.

### Checklist dopředné opravné migrace

- [ ] Popsat původní problém.
- [ ] Ověřit rozsah dotčených dat.
- [ ] Zastavit nové problematické operace flagem.
- [ ] Připravit samostatnou opravnou migraci.
- [ ] Otestovat ji na stagingu se simulací produkčních dat, pokud je to možné.
- [ ] Provést produkční databázový preflight.
- [ ] Po aplikaci provést produkční smoke test a reconciliation.

## Kompatibilita rollback verzí aplikace

Jakmile se v databázi začnou skutečně vytvářet rezervace se stavem `waiting_for_payment`, nelze bezpečně provést rollback na libovolnou starší verzi aplikace, která tento stav nezná.

### Rollback před přidáním `payments`

- [ ] Rollback na starší verzi je obvykle bezpečný, pokud nová tabulka není používaná produkčním kódem.
- [ ] Nové nevyužité DB objekty mohou zůstat v databázi.

### Rollback po přidání `waiting_for_payment`

- [ ] Rollback je bezpečný pouze na verzi, která zná `waiting_for_payment`.
- [ ] Rollback verze musí stav načíst bez chyby.
- [ ] Rollback verze jej musí zobrazit bezpečně.
- [ ] Rollback verze jej nesmí zaměnit za `pending`, `approved` ani `cancelled`.

### Rollback po první skutečné produkční platbě

- [ ] Rollback nesmí vypnout zpracování existujících webhooků a reconciliation.
- [ ] Rollback nesmí ztratit možnost dokončit nebo ručně vyřešit rozpracovanou platbu.
- [ ] Rollback nesmí skrýt refundy vyžadující zásah.
- [ ] Bezpečný rollback cíl musí být předem určený a otestovaný.

## Architecture Decision Records

U takto zásadní změny musí být klíčová rozhodnutí zdokumentována jako ADR v `docs/adr/`.

- [ ] Vytvořit ADR pro GoPay integraci.
- [ ] Zdokumentovat, proč se používá samostatná tabulka `payments`.
- [ ] Zdokumentovat, proč se zavádí `waiting_for_payment`.
- [ ] Zdokumentovat, proč nestačí webhook bez reconciliation.
- [ ] Zdokumentovat, proč je GoPay workflow za feature flagy a kill switchi.
- [ ] ADR aktualizovat nebo doplnit novým ADR při změně architektonického rozhodnutí.


## Globální release gate pro každý PR

Každý PR smí být mergnutý pouze pokud platí:

- [ ] Změna je malá a jasně ohraničená.
- [ ] Změna je zpětně kompatibilní.
- [ ] Při vypnutém feature flagu se nemění současné chování rezervací.
- [ ] Člen vytvoří rezervaci stejně jako před změnou.
- [ ] Administrátor vytvoří a spravuje rezervace stejně jako před změnou.
- [ ] Současné automatické schvalování členů a administrátorů zůstává funkční.
- [ ] Nečlenské rezervace se bez aktivního GoPay flagu nechovají jinak než v aktuálním systému.
- [ ] DB migrace nepoškozuje existující data.
- [ ] Rollback aplikace je možný bez destruktivního rollbacku databáze.
- [ ] Feature flag lze okamžitě vypnout.
- [ ] Neexistuje klientská cesta ke schválení platby nebo rezervace.
- [ ] Testy pokrývají novou funkcionalitu i regresi starého chování.
- [ ] Logy neobsahují secrets, tokeny, platební údaje ani raw citlivé payloady.
- [ ] Je popsaný rollback a provozní dopad.

## Doporučené pořadí implementace

1. Platební databázový základ bez aktivace.
2. Feature flagy ve výchozím stavu vypnuté.
3. Rozšíření stavů rezervací a ochrany proti překryvům.
4. Serverové vytvoření rezervace a GoPay platby v sandboxu.
5. Webhook a transakční schválení rezervace.
6. Expirace nezaplacených rezervací.
7. Reconciliation plateb a refundů.
8. Automatické refundy.
9. Administrační a provozní přehled.
10. Kompletní staging a regresní testy.
11. Pilotní produkční aktivace.
12. Plná produkční aktivace.

---

# Fáze 0: Příprava a baseline ověření

## Cíl

Získat jistotu, že před začátkem implementace známe aktuální funkční stav systému a máme regresní scénáře, podle kterých budeme ověřovat, že se nic nerozbilo.

## Konkrétní kroky

- [ ] Ověřit lokální/staging testovací prostředí.
- [ ] Ověřit aktuální migrace a RLS kontroly.
- [ ] Zapsat aktuální baseline chování rezervací.
- [ ] Ověřit, že člen dokáže vytvořit rezervaci.
- [ ] Ověřit, že členova rezervace je automaticky schválena.
- [ ] Ověřit, že administrátor dokáže vytvořit rezervaci.
- [ ] Ověřit, že administrátor dokáže schválit a zrušit čekající rezervaci.
- [ ] Ověřit, že nečlen podle současného režimu vytvoří čekající rezervaci.
- [ ] Ověřit, že public grid zobrazuje obsazené sloty.
- [ ] Ověřit, že překryv rezervací je odmítnut databází.
- [ ] Ověřit, že uživatel dokáže zrušit vlastní budoucí rezervaci.
- [ ] Ověřit, že e-mailový notification outbox funguje podle aktuálního režimu.
- [ ] Ověřit, že auditní log vzniká při vytvoření, schválení a zrušení rezervace.

## Nedělat v této fázi

- [ ] Neměnit zdrojový kód plateb.
- [ ] Neměnit databázový model rezervací.
- [ ] Neměnit stavový model rezervací.
- [ ] Neměnit cron úlohy.
- [ ] Neměnit RLS policies.
- [ ] Nezapínat žádné GoPay workflow.

## Testy

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run check:rls`
- [ ] Lokální nebo staging E2E lifecycle rezervace.

## Kritéria úspěchu

- [ ] Všechny současné klíčové rezervační scénáře fungují.
- [ ] Existuje jasný seznam regresních scénářů pro další fáze.

## Rollback

Žádný rollback není potřeba, fáze je pouze ověřovací.

---

# Fáze 1: Databázový základ plateb bez aktivace

## Cíl

Přidat izolovaný platební datový model, který stará aplikace zcela ignoruje a který nemění současné chování rezervací.

## Konkrétní změny

- [ ] Přidat novou tabulku `payments`.
- [ ] Přidat interní `id uuid primary key`.
- [ ] Přidat `reservation_id` jako foreign key na `reservations`.
- [ ] Přidat `provider`, výchozí hodnota `gopay`.
- [ ] Přidat `provider_payment_id` pro GoPay payment ID.
- [ ] Přidat interní `idempotency_key`.
- [ ] Přidat `amount_cents`.
- [ ] Přidat `currency`.
- [ ] Přidat `status` platby.
- [ ] Přidat `expires_at`.
- [ ] Přidat `paid_at`.
- [ ] Přidat `failed_at`.
- [ ] Přidat `cancelled_at`.
- [ ] Přidat `refunded_amount_cents`.
- [ ] Přidat `refund_status`.
- [ ] Přidat `provider_refund_id`.
- [ ] Přidat `refund_requested_at`.
- [ ] Přidat `refunded_at`.
- [ ] Přidat `last_error` omezený na bezpečnou délku.
- [ ] Přidat `attempt_count`.
- [ ] Přidat `metadata jsonb` bez citlivých údajů.
- [ ] Přidat `created_at` a `updated_at`.

## Doporučené platební stavy

- [ ] `created`
- [ ] `awaiting_payment`
- [ ] `paid`
- [ ] `failed`
- [ ] `cancelled`
- [ ] `expired`
- [ ] `requires_manual_review`

## Doporučené refund stavy

- [ ] `not_requested`
- [ ] `not_eligible`
- [ ] `requested`
- [ ] `processing`
- [ ] `succeeded`
- [ ] `failed`
- [ ] `manual_review`

## Constraints a indexy

- [ ] Check constraint na `provider in ('gopay')`.
- [ ] Check constraint na `amount_cents > 0`.
- [ ] Check constraint na `currency = 'CZK'`, pokud bude první verze pouze v CZK.
- [ ] Check constraint na validní payment statusy.
- [ ] Check constraint na validní refund statusy.
- [ ] Check constraint `refunded_amount_cents >= 0`.
- [ ] Check constraint `refunded_amount_cents <= amount_cents`.
- [ ] Unique index na `idempotency_key`.
- [ ] Partial unique index na `(provider, provider_payment_id)` tam, kde `provider_payment_id is not null`.
- [ ] Partial unique index zajišťující nejvýše jednu aktivní platbu na rezervaci.
- [ ] Index na `reservation_id`.
- [ ] Index na `expires_at` pro aktivní čekající platby.
- [ ] Index na problémové refund stavy.

## RLS a oprávnění

- [ ] Zapnout RLS na `payments`.
- [ ] Odebrat broad privileges pro `anon` a `authenticated`.
- [ ] Běžný uživatel nesmí insertovat ani updatovat `payments`.
- [ ] Běžný uživatel ideálně nemá mít přímý přístup k celé tabulce `payments`.
- [ ] Preferovat omezený databázový view, security definer RPC nebo serverový status endpoint.
- [ ] Běžný uživatel smí číst pouze bezpečný výřez vlastní platby, pokud je to nutné pro UI.
- [ ] Admin smí číst provozní přehled plateb, ale nemá ručně přepisovat citlivé stavy mimo určené RPC.
- [ ] Stav platby smí měnit pouze serverová service role / security definer RPC.

### Bezpečný uživatelský výřez platby

Uživateli lze zobrazit pouze:

- [ ] `reservation_id`
- [ ] `amount_cents`
- [ ] `currency`
- [ ] `status`
- [ ] `refund_status`
- [ ] `expires_at`
- [ ] `paid_at`
- [ ] `refunded_at`

Běžnému uživateli nezobrazovat:

- [ ] `provider_payment_id`
- [ ] `provider_refund_id`
- [ ] `idempotency_key`
- [ ] `last_error`
- [ ] `attempt_count`
- [ ] Interní metadata.
- [ ] Webhook metadata.
- [ ] Technické retry informace.

## Platební audit oddělený od notification outboxu

`notification_outbox` slouží k doručování notifikací. Nemá být jediným platebním auditem a ne každá technická platební událost má vyvolat e-mail.

- [ ] Navrhnout samostatnou tabulku `payment_audit_log` nebo `payment_events`.
- [ ] Evidovat interní payment ID.
- [ ] Evidovat reservation ID.
- [ ] Evidovat typ události.
- [ ] Evidovat starý stav.
- [ ] Evidovat nový stav.
- [ ] Evidovat bezpečný důvod změny.
- [ ] Evidovat interní zdroj události.
- [ ] Evidovat počet pokusů.
- [ ] Evidovat timestamp.
- [ ] Evidovat pouze bezpečná metadata bez secrets.
- [ ] Auditní zápis nesmí obsahovat raw tokeny, Authorization headery ani citlivé payloady.

Možné eventy:

- [ ] `payment_created`
- [ ] `provider_payment_created`
- [ ] `payment_verification_started`
- [ ] `payment_verified`
- [ ] `payment_verification_failed`
- [ ] `payment_expired`
- [ ] `refund_requested`
- [ ] `refund_processing`
- [ ] `refund_succeeded`
- [ ] `refund_failed`
- [ ] `manual_review_required`
- [ ] `reconciliation_started`
- [ ] `reconciliation_completed`

## Nedělat v této fázi

- [ ] Neměnit `reservations.status`.
- [ ] Nepřidávat `waiting_for_payment`.
- [ ] Neměnit public occupancy.
- [ ] Neměnit admin UI.
- [ ] Neměnit klientské vytvoření rezervace.
- [ ] Nevolat GoPay API.

## Testy

- [ ] DB test vytvoření validní platby.
- [ ] DB test odmítnutí nulové nebo záporné částky.
- [ ] DB test odmítnutí neplatné měny.
- [ ] DB test odmítnutí neplatného payment statusu.
- [ ] DB test odmítnutí neplatného refund statusu.
- [ ] DB test unikátního idempotency key.
- [ ] DB test unikátního GoPay payment ID.
- [ ] DB test zákazu dvojí aktivní platby na jednu rezervaci.
- [ ] RLS test, že authenticated uživatel nemůže měnit platební stav.
- [ ] Test, že běžný uživatel nevidí `provider_payment_id`.
- [ ] Test, že běžný uživatel nevidí `provider_refund_id`.
- [ ] Test, že běžný uživatel nevidí `idempotency_key`.
- [ ] Test, že běžný uživatel nevidí `last_error`, `attempt_count` ani interní metadata.
- [ ] Test, že platební audit neukládá secrets ani raw citlivé payloady.
- [ ] Regresní test, že současné rezervace fungují beze změny.

## Kritéria úspěchu

- [ ] Nová tabulka existuje a je bezpečně chráněná.
- [ ] Starý aplikační kód dál funguje.
- [ ] Současné rezervace nejsou nijak ovlivněny.

## Rollback

- [ ] Aplikační rollback není potřeba.
- [ ] Tabulku lze ponechat nevyužitou.
- [ ] Destruktivní rollback databáze se nedoporučuje.

---

# Fáze 2: Feature flagy ve výchozím stavu vypnuté

## Cíl

Připravit bezpečnou aktivační brzdu před zavedením jakéhokoli platebního chování.

## Dvě úrovně flagů

Vercel environment variable nemusí být okamžitý provozní přepínač, protože změna může vyžadovat nový deployment. Proto rozlišuj aplikační capability flags a dynamické provozní kill switche.

### Aplikační capability flags

Ty určují, zda deployment platební kód vůbec obsahuje a jaké prostředí používá.

- [ ] `PAYMENTS_GOPAY_CODE_AVAILABLE=false`
- [ ] `PAYMENTS_GOPAY_ENV=sandbox`

### Dynamické provozní flagy

Dynamické flagy mohou být uložené v bezpečné Supabase konfigurační tabulce nebo jiném serverově dostupném bezpečném úložišti.

- [ ] `gopay_create_enabled=false`
- [ ] `gopay_webhook_processing_enabled=true` pro existující platby, pokud je webhook bezpečný.
- [ ] `payment_expiration_enabled=false`
- [ ] `auto_refund_enabled=false`
- [ ] `payment_admin_monitoring_enabled=false`

## Požadavky na flagy

- [ ] Flagy se čtou pouze serverově.
- [ ] Běžný uživatel je nemůže měnit.
- [ ] Admin UI pro jejich změnu není nutné v první verzi.
- [ ] Změny flagů se auditují.
- [ ] Výchozí hodnota je bezpečně vypnutá.
- [ ] Při nedostupnosti konfigurace se systém chová fail-closed pro nové platby.
- [ ] Vypnutí create flow nesmí vypnout zpracování existujících webhooků.
- [ ] Vypnutí auto-refundu nesmí ztratit již rozpracované refundy.

## Lifecycle feature flagů

Dočasné feature flagy nesmí zůstat v systému navždy bez vlastníka a termínu odstranění.

- [ ] Každý dočasný flag má vlastníka.
- [ ] Každý dočasný flag má podmínku odstranění.
- [ ] Po stabilním provozu se má odstranit mrtvý kód za již nepotřebným flagem.
- [ ] Po plné aktivaci se má vyhodnotit, které flagy zůstávají jako trvalé provozní kill switche.
- [ ] Kill switche pro incidenty mohou zůstat, ale musí být zdokumentované a pravidelně ověřené.
- [ ] Nepoužívané flagy se nesmí hromadit jako technický dluh.

## Konkrétní změny

- [ ] Přidat server-side načítání feature flagů.
- [ ] Přidat helper pro rozhodnutí, zda je GoPay flow dostupné.
- [ ] Přidat testy, že výchozí hodnota je vypnuto.
- [ ] Přidat server-side guard pro budoucí payment routes.
- [ ] Přidat dokumentaci konfigurace bez skutečných secrets.

## Nedělat v této fázi

- [ ] Nezapínat GoPay v produkci.
- [ ] Neměnit klientské rezervační UI.
- [ ] Neměnit stav rezervace.
- [ ] Nevytvářet platby.

## Testy

- [ ] Unit test defaultní hodnoty flagu.
- [ ] Unit test, že flag off zakáže platební flow.
- [ ] Regresní test současného vytvoření rezervace.
- [ ] Regresní test admin approve/cancel.
- [ ] Regresní test auto-approve členů/adminů.

## Kritéria úspěchu

- [ ] Nasazení nemění produkční chování.
- [ ] Nové chování je bezpečně vypnuté.

## Rollback

- [ ] Vypnout flag.
- [ ] Rollback aplikace je možný bez DB zásahu.

---

# Fáze 3: Rozšíření stavů rezervací a ochrany proti překryvům

## Cíl

Bezpečně zavést stav `waiting_for_payment`, který bude blokovat termín během platebního limitu, ale nebude považován za definitivně schválenou rezervaci.

## Výrazné upozornění: kontraktová a rizikovější změna

Tato fáze je změnou sdíleného kontraktu mezi databází a aplikací. Týká se minimálně:

- [ ] `reservations.status`.
- [ ] `reservation_audit_log`.
- [ ] Exclusion constraintu proti překryvům.
- [ ] Occupancy views.
- [ ] TypeScript typů.
- [ ] Admin filtrování a schvalovacích akcí.

Migrace nesmí neomezeně čekat na zámek a tím blokovat nové rezervace. U rizikových operací zvaž bezpečný `lock_timeout`, explicitní plán provedení v době nízkého provozu a připravenou dopřednou opravnou migraci.

## Povinné kroky před touto fází

- [ ] Zjistit počet řádků v `reservations`.
- [ ] Zkontrolovat existující hodnoty statusů.
- [ ] Zkontrolovat případné dlouhé transakce.
- [ ] Posoudit zámky vznikající při změně constraintů.
- [ ] Použít bezpečný `lock_timeout`, pokud je to vhodné.
- [ ] Připravit přesnou dopřednou opravnou migraci.
- [ ] Provést změnu v době nízkého provozu.
- [ ] Ihned po migraci ověřit vytvoření, schválení, zrušení a kolizní ochranu rezervace.

## Předpoklady

- [ ] Fáze 1 je hotová.
- [ ] Fáze 2 je hotová.
- [ ] Feature flag je ve výchozím stavu vypnutý.
- [ ] Existují DB/RLS testy pro `payments`.
- [ ] Před prvním produkčním vytvořením rezervace `waiting_for_payment` existuje a je otestována stabilní rollback verze, která tento stav zná.
- [ ] Umí tento stav načíst bez chyby.
- [ ] Zobrazuje jej bezpečně.
- [ ] Neumožní jeho ruční schválení běžnou admin akcí.
- [ ] Zohledňuje jej v public occupancy.
- [ ] Nezamění jej za `pending`, `approved` ani `cancelled`.
- [ ] Neumožní klientovi jeho změnu mimo serverové platební workflow.

## Konkrétní změny

- [ ] Rozšířit povolené `reservations.status` o `waiting_for_payment`.
- [ ] Rozšířit auditní check constraint pro nové statusy, pokud audit ukládá `old_status`/`new_status`.
- [ ] Upravit exclusion constraint tak, aby blokoval `pending`, `approved` i `waiting_for_payment`.
- [ ] Upravit public occupancy view tak, aby `waiting_for_payment` blokoval slot.
- [ ] Upravit private/member occupancy notes view, pokud používá výčet stavů.
- [ ] Upravit TypeScript typy pro stav rezervace.
- [ ] Upravit mapování stavů v UI tak, aby neznámý stav nespadl do nesprávného významu.
- [ ] Upravit admin pending query tak, aby `waiting_for_payment` nebyl běžná manuálně schvalovaná rezervace.
- [ ] Přidat testy, že `waiting_for_payment` není automaticky schválen člen/admin cronem.

## Důležité invarianty

- [ ] `waiting_for_payment` blokuje překryvy.
- [ ] `waiting_for_payment` není `approved`.
- [ ] `waiting_for_payment` není běžný `pending` pro manuální schválení.
- [ ] `waiting_for_payment` lze bezpečně expirovat na `cancelled`.
- [ ] `waiting_for_payment` lze schválit pouze platebním workflow.

## Nedělat v této fázi

- [ ] Ještě nevytvářet `waiting_for_payment` v produkčním uživatelském flow.
- [ ] Ještě nevolat GoPay API.
- [ ] Ještě nezapínat platební flag.

## Testy

- [ ] DB test, že `waiting_for_payment` je povolený stav.
- [ ] DB test, že neplatný stav je odmítnut.
- [ ] DB test, že `waiting_for_payment` blokuje překryv.
- [ ] DB test, že `cancelled` slot neblokuje.
- [ ] Test public occupancy pro `waiting_for_payment`.
- [ ] Test admin pending listu, že `waiting_for_payment` není běžná schvalovací položka.
- [ ] Regresní test `pending -> approved` pro člena/admina.
- [ ] Regresní test ručního admin schválení obyčejné `pending` rezervace.

## Kritéria úspěchu

- [ ] Nový stav existuje, ale při vypnutém flagu se v běžném flow nevytváří.
- [ ] Současné rezervace fungují stejně.
- [ ] Public grid neukáže platebně blokovaný slot jako volný.

## Rollback

- [ ] Feature flag ponechat vypnutý.
- [ ] Nepoužívat nový stav.
- [ ] DB změny nevracet destruktivně, pokud nejsou škodlivé.

---

# Fáze 4: Serverové vytvoření rezervace a GoPay platby v sandboxu

## Cíl

Přidat bezpečnou serverovou cestu pro vytvoření platební rezervace nečlena a GoPay sandbox platby. Produkční aktivace zůstává vypnutá.

## Konkrétní změny

- [ ] Přidat serverový endpoint nebo Edge Function pro vytvoření GoPay platby.
- [ ] Ověřit session uživatele serverově.
- [ ] Serverově načíst roli uživatele.
- [ ] Pokud je uživatel `member` nebo `admin`, zachovat současné neplatební flow.
- [ ] Pokud je uživatel `user`, použít platební flow pouze při zapnutém flagu.
- [ ] Serverově spočítat cenu.
- [ ] Ověřit datum, čas, kurt a dostupnost.
- [ ] V DB transakci vytvořit rezervaci `waiting_for_payment`.
- [ ] V DB transakci vytvořit payment `awaiting_payment`.
- [ ] Nastavit `expires_at`.
- [ ] Vytvořit GoPay sandbox platbu.
- [ ] Uložit `provider_payment_id`.
- [ ] Vrátit klientovi pouze GoPay redirect URL a bezpečné interní identifikátory.
- [ ] Přidat idempotenci pro opakované kliknutí.

## Cena

- [ ] Cenu nikdy nepřebírat důvěryhodně z klienta.
- [ ] Cenu počítat serverově z kurtu, data, času, délky rezervace a aktuálních pravidel.
- [ ] Uložit očekávanou částku do `payments.amount_cents`.
- [ ] Uložit očekávanou měnu do `payments.currency`.

## Neatomický vztah databáze a GoPay API

Externí volání GoPay API nemůže být součástí jedné PostgreSQL transakce. Proto musí být flow navržené jako odolný stavový proces:

- [ ] Databáze vytvoří rezervaci `waiting_for_payment`.
- [ ] Databáze vytvoří payment řádek.
- [ ] Server zavolá GoPay API.
- [ ] GoPay API může uspět, jednoznačně selhat nebo skončit timeoutem.
- [ ] Databáze musí podle výsledku bezpečně dokončit stavový přechod.

### Jednoznačné selhání vytvoření GoPay platby

- [ ] Payment přejde na `failed`.
- [ ] Rezervace přejde na `cancelled`.
- [ ] Slot se uvolní.
- [ ] Vznikne auditní událost.

### Nejednoznačný timeout

Pokud není jisté, zda GoPay platbu vytvořilo:

- [ ] Neoznačovat okamžitě jako definitivně `failed`.
- [ ] Zachovat stav vyžadující reconciliation.
- [ ] Opakovaný request musí použít stejný idempotency key, pokud to GoPay podporuje.
- [ ] Ověřit stav přes GoPay API.
- [ ] Zabránit vytvoření druhé platby za stejnou rezervaci.

## Performance budget

GoPay workflow přidává SQL dotazy, serverovou logiku a externí HTTP volání. Nové endpointy nesmí významně zhoršit čas vytvoření rezervace ani zbytečně držet databázovou transakci otevřenou během čekání na externí API.

- [ ] Změřit současný baseline času vytvoření běžné rezervace před zapnutím GoPay flow.
- [ ] Změřit počet SQL dotazů pro vytvoření platební rezervace.
- [ ] Změřit počet GoPay requestů pro vytvoření platby.
- [ ] Změřit délku databázové transakce.
- [ ] DB transakce nesmí zůstat otevřená během volání GoPay API.
- [ ] Nastavit timeouty externích GoPay requestů podle ověřeného doporučení GoPay a reálného měření, ne jako náhodně zvolené číslo.
- [ ] Konkrétní p95/p99 limity stanovit až podle změřeného současného baseline a staging měření.
- [ ] Před produkcí ověřit p95/p99 odezvy nového serverového endpointu na stagingu.
- [ ] Při zhoršení oproti současnému create flow definovat limit, kdy se dynamický flag `gopay_create_enabled` nezapne.

## Nedělat v této fázi

- [ ] Neschvalovat rezervaci po návratu z GoPay.
- [ ] Nespoléhat na klientský stav platby.
- [ ] Nezapínat produkční GoPay credentials.
- [ ] Nezapínat flow pro všechny uživatele v produkci.

## Testy

- [ ] Unit test výpočtu ceny.
- [ ] Unit test rozpoznání role.
- [ ] Unit test výpočtu expirace.
- [ ] Test idempotence opakovaného vytvoření platby.
- [ ] Integrační test GoPay sandbox create payment.
- [ ] Test GoPay create uspěje.
- [ ] Test GoPay create jednoznačně selže.
- [ ] Test GoPay create timeoutne po odeslání.
- [ ] Test databáze uspěje, ale uložení provider ID selže.
- [ ] Test opakovaného požadavku po timeoutu.
- [ ] Test reconciliation najde již vytvořenou GoPay platbu.
- [ ] Test reconciliation nenajde žádnou platbu.
- [ ] DB test, že souběžné pokusy o stejný slot skončí jednou úspěšně a jednou konfliktem.
- [ ] Regresní test člen/admin flow.
- [ ] Regresní test současného admin schvalování.

## Kritéria úspěchu

- [ ] Sandbox platba jde vytvořit.
- [ ] Při vypnutém flagu se produkční chování nemění.
- [ ] Souběžné pokusy nevytvoří dva blokující záznamy stejného slotu.

## Rollback

- [ ] Vypnout dynamický flag `gopay_create_enabled`.
- [ ] Ponechat existující payments bez dalšího použití.
- [ ] Rozpracované sandbox platby nechat expirovat.

---

# Fáze 5: Webhook a transakční schválení rezervace

## Cíl

Schválit nečlenskou rezervaci pouze po serverově ověřené úspěšné platbě u GoPay.

## Konkrétní změny

- [ ] Přidat GoPay webhook Edge Function nebo server route.
- [ ] Ověřit autentizaci/podpis webhooku podle GoPay dokumentace.
- [ ] Nikdy neschvalovat pouze podle webhook payloadu bez ověření, pokud GoPay API umožňuje serverové ověření stavu.
- [ ] Načíst aktuální stav platby z GoPay API.
- [ ] Přidat DB RPC pro potvrzení platby.
- [ ] V RPC zamknout payment row `for update`.
- [ ] V RPC zamknout reservation row `for update`.
- [ ] Ověřit vazbu payment na reservation.
- [ ] Ověřit `provider_payment_id`.
- [ ] Ověřit částku.
- [ ] Ověřit měnu.
- [ ] Ověřit aktuální payment status.
- [ ] Ověřit aktuální reservation status `waiting_for_payment`.
- [ ] Nastavit payment `paid`.
- [ ] Nastavit reservation `approved`.
- [ ] Zapsat audit.
- [ ] Zařadit notifikaci do `notification_outbox`.
- [ ] Idempotentně ignorovat opakovaný webhook pro již zaplacenou a schválenou rezervaci.

## Return URL

- [ ] Return URL z GoPay pouze zobrazí stav uživateli.
- [ ] Return URL neschvaluje rezervaci.
- [ ] Return URL může zavolat bezpečný read-only status endpoint.
- [ ] Pokud platba ještě není potvrzená, zobrazit „Platbu ověřujeme“.

## Chybové a hraniční stavy

- [ ] Pokud je payment zaplacená, ale reservation už je `cancelled`, přejít do `requires_manual_review`.
- [ ] Pokud nesedí částka, neschvalovat a nastavit `requires_manual_review`.
- [ ] Pokud nesedí měna, neschvalovat a nastavit `requires_manual_review`.
- [ ] Pokud GoPay API dočasně neodpovídá, zapsat retry stav bez změny rezervace na `approved`.

## Testy

- [ ] Webhook doručený jednou.
- [ ] Webhook doručený vícekrát.
- [ ] Webhook doručený se zpožděním.
- [ ] Ověření platby u GoPay selže dočasně.
- [ ] Nesoulad částky.
- [ ] Nesoulad měny.
- [ ] Platba zaplacena, rezervace stále `waiting_for_payment` -> schválit.
- [ ] Platba zaplacena, rezervace už `cancelled` -> manual review.
- [ ] Return URL sama nic neschválí.
- [ ] Regresní test auto-approve členů/adminů.

## Kritéria úspěchu

- [ ] Neexistuje cesta ke schválení nečlenské rezervace bez serverově ověřené platby.
- [ ] Opakovaný webhook nezpůsobí dvojí schválení ani duplicitní notifikace.

## Rollback

- [ ] Vypnout vytváření nových plateb.
- [ ] Webhook ponechat aktivní pro již existující platby, pokud je bezpečný.
- [ ] Problémové platby převést do `requires_manual_review`.

---

# Fáze 6: Expirace nezaplacených rezervací

## Cíl

Automaticky uvolnit termíny, které byly dočasně blokované pro platbu, ale nebyly zaplaceny ve stanoveném limitu.

## Konkrétní změny

- [ ] Přidat RPC `expire_unpaid_payments`.
- [ ] Přidat worker nebo cron pro periodické spouštění.
- [ ] Vyhledat payments `awaiting_payment` s `expires_at < now()`.
- [ ] Zamknout payment a reservation.
- [ ] Ověřit, že payment není `paid`.
- [ ] Nastavit payment `expired`.
- [ ] Nastavit reservation `cancelled`.
- [ ] Zapsat audit.
- [ ] Zařadit notifikaci o expiraci, pokud je požadovaná.

## Hraniční případy

- [ ] Platba dokončená těsně před expirací.
- [ ] Platba dokončená těsně po expiraci.
- [ ] Webhook doručený po expiraci.
- [ ] Uživatel zavře platební stránku.
- [ ] Uživatel obnoví stránku během platby.
- [ ] Uživatel opakuje pokus o platbu.

## Doporučené chování

- [ ] Nezaplacenou rezervaci fyzicky nemazat.
- [ ] Zachovat historii přes `reservation.status = 'cancelled'` a `payment.status = 'expired'`.
- [ ] Pokud později přijde potvrzení platby, neschvalovat automaticky bez kontroly aktuálního stavu slotu.

## Testy

- [ ] Expirace změní `waiting_for_payment` na `cancelled`.
- [ ] Expirace změní payment na `expired`.
- [ ] Expirace uvolní slot pro novou rezervaci.
- [ ] Opožděný webhook po expiraci neschválí kolizní rezervaci.
- [ ] Worker je idempotentní.
- [ ] Dva workery nezpracují stejnou platbu dvakrát.

## Kritéria úspěchu

- [ ] Nezaplacené termíny nezůstávají blokované donekonečna.
- [ ] Expirace nezpůsobí ztrátu auditní stopy.

## Rollback

- [ ] Vypnout expirační cron/worker.
- [ ] Ručně řešit stuck `waiting_for_payment` v admin diagnostice.

---


# Fáze 7: Reconciliation plateb a refundů

## Cíl

Zajistit bezpečné zotavení situací, kdy webhook nepřijde, přijde pozdě, GoPay API dočasně selže nebo vznikne nejednoznačný timeout.

## Konkrétní změny

- [ ] Přidat pravidelné ověření plateb příliš dlouho v `awaiting_payment`.
- [ ] Ověřit platby, u kterých proběhl nejednoznačný timeout při create flow.
- [ ] Ověřit platby, které GoPay označuje jako zaplacené, ale rezervace není `approved`.
- [ ] Ověřit refundy dlouho v `processing`.
- [ ] Zpracování nesmí záviset na jediném webhooku.
- [ ] Přidat idempotentní RPC pro reconciliation.
- [ ] Používat zámky nebo claim mechanismus, aby dva workery nezpracovaly stejný záznam konfliktně.
- [ ] Nastavit limity počtu pokusů.
- [ ] Po překročení limitů přejít do `manual_review`.
- [ ] Zapisovat platební audit.
- [ ] Vytvářet alert pro stuck nebo neznámé stavy.

## Nedělat

- [ ] Neschvalovat rezervaci bez opětovného ověření částky, měny a vazby na rezervaci.
- [ ] Nevytvářet druhou GoPay platbu pro stejnou aktivní rezervaci.
- [ ] Neoznačovat refund jako úspěšný bez potvrzení poskytovatele.

## Testy

- [ ] Webhook nikdy nepřijde.
- [ ] Webhook přijde až po reconciliation.
- [ ] Reconciliation běží vícekrát.
- [ ] Dva workery zpracují stejný záznam.
- [ ] GoPay vrátí neznámý stav.
- [ ] Refund zůstane dlouho v `processing`.
- [ ] Po překročení retry limitu vznikne `manual_review`.

## Kritéria úspěchu

- [ ] Platby a refundy nejsou závislé pouze na webhooku.
- [ ] Opakované reconciliation běhy jsou idempotentní.
- [ ] Problémové stavy jsou auditované a viditelné v alertingu/admin přehledu.

## Rollback

- [ ] Vypnout reconciliation worker, pokud způsobuje chyby.
- [ ] Ponechat webhook aktivní pro existující platby, pokud je bezpečný.
- [ ] Problémové položky převést do `manual_review`.

---

# Fáze 8: Automatické refundy

## Cíl

Při včasném zrušení placené rezervace automaticky požádat GoPay o vrácení peněz a bezpečně evidovat výsledek.

## Konkrétní změny

- [ ] Přidat serverovou cancel route pro placené rezervace.
- [ ] Ověřit session.
- [ ] Ověřit vlastníka rezervace nebo admin oprávnění.
- [ ] Načíst reservation a payment.
- [ ] Ověřit, že reservation je budoucí.
- [ ] Spočítat storno lhůtu v časové zóně Europe/Prague.
- [ ] Ověřit, že payment je `paid`.
- [ ] Ověřit, že refund ještě nebyl úspěšně proveden.
- [ ] Ověřit, že refund není právě `processing`.
- [ ] Nastavit reservation `cancelled`.
- [ ] Nastavit refund status `requested`.
- [ ] Zapsat audit.
- [ ] Zařadit notifikaci `refund.requested`.
- [ ] Worker zavolá GoPay refund API s idempotency key.
- [ ] Při potvrzení nastavit `refund_status = 'succeeded'`.
- [ ] Při selhání nastavit `failed` nebo `manual_review`.

## Plný a částečný refund

- [ ] První verze může podporovat pouze plný refund.
- [ ] Datový model musí mít `refunded_amount_cents` pro budoucí částečný refund.
- [ ] Nikdy nepoužívat pouze boolean `refunded`.

## Důležité pravidlo

- [ ] `refund_status = 'succeeded'` nastavit až po potvrzení úspěchu z GoPay.
- [ ] Odeslaný požadavek do GoPay znamená maximálně `processing`, ne `succeeded`.

## Testy

- [ ] Včasné storno placené rezervace spustí refund.
- [ ] Pozdní storno refund nespustí.
- [ ] Nezaplacená rezervace refund nespustí.
- [ ] Opakované kliknutí nespustí dvojitý refund.
- [ ] Výpadek GoPay API nastaví retry/manual review.
- [ ] Timeout GoPay API neoznačí refund jako dokončený.
- [ ] Selhání refundu vytvoří admin-visible stav.
- [ ] Úspěšný refund odešle notifikaci.

## Kritéria úspěchu

- [ ] Automatický refund je idempotentní.
- [ ] Selhání refundu je viditelné a neopíše se jako úspěch.

## Rollback

- [ ] Vypnout dynamický flag `auto_refund_enabled`.
- [ ] Nové refundy převádět do `manual_review`.
- [ ] Již rozpracované refundy reconcileovat podle GoPay administrace/API.

---

# Fáze 9: Administrační a provozní přehled

## Cíl

Dát administrátorovi a provozu bezpečný přehled o platebních stavech a problémových situacích.

## Konkrétní změny

- [ ] Přidat read-only přehled čekajících plateb.
- [ ] Přidat read-only přehled expirovaných plateb.
- [ ] Přidat přehled `paid`, ale reservation není `approved`.
- [ ] Přidat přehled `approved`, ale payment není `paid` pro platební rezervace.
- [ ] Přidat přehled refundů `requested` a `processing`.
- [ ] Přidat přehled refundů `failed` a `manual_review`.
- [ ] Zobrazit poslední bezpečnou chybu.
- [ ] Zobrazit počet pokusů.
- [ ] Zobrazit časy vytvoření, zaplacení, expirace, refundu.
- [ ] Přidat bezpečné retry akce pouze tam, kde jsou idempotentní.

## Nedělat

- [ ] Nezobrazovat GoPay secrets.
- [ ] Nezobrazovat access tokeny.
- [ ] Nezobrazovat citlivé platební údaje.
- [ ] Nedávat platební rezervace do běžné admin fronty pro ruční schválení bez jasného bezpečnostního guardu.

## Testy

- [ ] Admin vidí problémové platby.
- [ ] Neadmin přehled nevidí.
- [ ] Retry je dostupné pouze adminovi.
- [ ] Retry je idempotentní.
- [ ] UI nezobrazuje secrets ani raw citlivé payloady.

## Kritéria úspěchu

- [ ] Provozní problémy lze najít bez přístupu do databáze.
- [ ] Admin má bezpečný postup pro manual review.

## Rollback

- [ ] Skrýt administrační platební sekci flagem.
- [ ] Data zůstanou v DB.

---

# Fáze 10: Kompletní staging a regresní testy

## Cíl

Ověřit kompletní platební workflow mimo produkci a potvrdit, že současné rezervace nebyly rozbité.

## Povinné staging scénáře

- [ ] Člen vytvoří rezervaci stejně jako nyní.
- [ ] Členova rezervace se automaticky schválí.
- [ ] Administrátor vytvoří rezervaci stejně jako nyní.
- [ ] Administrátor schválí běžnou pending rezervaci.
- [ ] Administrátor zruší běžnou rezervaci.
- [ ] Nečlen při vypnutém flagu neprojde novým platebním flow.
- [ ] Nečlen při zapnutém staging flagu vytvoří `waiting_for_payment`.
- [ ] GoPay sandbox platba se vytvoří.
- [ ] Úspěšná platba schválí rezervaci.
- [ ] Neúspěšná platba rezervaci neschválí.
- [ ] Přerušená platba zůstane do expirace čekající.
- [ ] Expirace zruší nezaplacenou rezervaci a uvolní slot.
- [ ] Opožděný webhook nezpůsobí nekonzistentní stav.
- [ ] Včasné storno spustí refund.
- [ ] Pozdní storno refund nespustí.
- [ ] Selhání refundu je viditelné v admin přehledu.
- [ ] E-mailové notifikace nevznikají duplicitně.
- [ ] Public grid správně blokuje `waiting_for_payment` a `approved`.
- [ ] Mobilní workflow funguje.
- [ ] Obnovení stránky během platby zobrazí správný stav.

## Povinné regresní oblasti

- [ ] Současné rezervace členů.
- [ ] Automatické schvalování členů.
- [ ] Rezervace administrátorů.
- [ ] Manuální admin schválení.
- [ ] Rušení rezervací.
- [ ] Turnaje a blokace termínů.
- [ ] Ochrana proti překryvům.
- [ ] Public occupancy.
- [ ] E-mailové notifikace.
- [ ] Auditní log.
- [ ] RLS.

## Kritéria úspěchu

- [ ] Všechny staging scénáře prošly.
- [ ] Neexistuje známá regresní chyba v současném rezervačním flow.
- [ ] Existuje produkční rollback plán.
- [ ] Existuje provozní runbook pro stuck platby/refundy.

---

# Fáze 11: Pilotní produkční aktivace

## Cíl

Zapnout GoPay v produkci řízeně a s možností rychlého vypnutí.

Omezený pilot nesmí být obecný ani náhodný pojem. Preferovaný pilot je allowlist konkrétních uživatelských účtů, interních testovacích účtů nebo omezení na konkrétní kurt a konkrétní období.

## Předprodukční checklist

- [ ] GoPay obchodní účet potvrzen.
- [ ] GoPay produkční schválení potvrzeno.
- [ ] Sandbox credentials ověřeny.
- [ ] Production credentials bezpečně uloženy.
- [ ] Secrets nejsou v repozitáři.
- [ ] Secrets nejsou v klientském `NEXT_PUBLIC_` prostoru.
- [ ] Webhook URL nastavena.
- [ ] Return URL nastavena.
- [ ] HTTPS ověřeno.
- [ ] Staging testy prošly.
- [ ] DB migrace nasazeny.
- [ ] RLS zkontrolováno.
- [ ] Cron/worker zkontrolován.
- [ ] Monitoring připraven.
- [ ] Alerty připraveny.
- [ ] Refund test proveden podle možností GoPay.
- [ ] Částka a měna ověřeny.
- [ ] Obchodní podmínky připraveny.
- [ ] Storno podmínky připraveny.
- [ ] Ochrana osobních údajů zkontrolována.
- [ ] Uživatel vidí cenu před platbou.
- [ ] Uživatel je informován o refund pravidlech.
- [ ] Rollback plán schválen.

## Pilotní omezení a odpovědnosti

- [ ] Pilotní uživatelé jsou explicitně určeni.
- [ ] Ostatní nečlenové dál používají původní flow.
- [ ] Pilotní aktivace neprobíhá náhodně.
- [ ] První reálná platba má předem definovaný scénář.
- [ ] Je jasné, kdo kontroluje GoPay administraci.
- [ ] Je jasné, kdo kontroluje Supabase data.
- [ ] Je jasné, kdo může aktivovat kill switch.
- [ ] Je jasné, jak se vyřeší první neúspěšný refund.
- [ ] Je stanoveno kritérium pro zastavení pilotu.
- [ ] Je stanoveno kritérium pro rozšíření pilotu.

## Aktivační postup

- [ ] Nasadit aplikaci s produkčními secrets, ale flagem off.
- [ ] Ověřit běžné rezervace v produkci.
- [ ] Ověřit health webhook endpointu bez zpracování reálné platby, pokud je to možné.
- [ ] Zapnout GoPay pro omezený pilot.
- [ ] Vytvořit první kontrolovanou produkční platbu podle domluveného scénáře.
- [ ] Ověřit schválení rezervace.
- [ ] Ověřit notifikace.
- [ ] Ověřit admin monitoring.
- [ ] Sledovat stuck platby/refundy.

## Kritéria úspěchu

- [ ] Pilotní platby fungují.
- [ ] Současné rezervace členů/adminů nejsou ovlivněné.
- [ ] Neexistují stuck platby bez provozního řešení.

## Rollback

- [ ] Vypnout vytváření nových GoPay plateb.
- [ ] Webhook ponechat aktivní pro již rozpracované platby.
- [ ] Expiraci ponechat aktivní, pokud je bezpečná.
- [ ] Refundy při problému převést do `manual_review`.
- [ ] Informovat administrátory o ručním režimu.

---

# Fáze 12: Plná produkční aktivace

## Cíl

Po úspěšném pilotu zapnout GoPay workflow pro všechny nečleny podle schválených pravidel.

## Konkrétní kroky

- [ ] Vyhodnotit pilotní provoz.
- [ ] Ověřit počet stuck payments.
- [ ] Ověřit počet failed/manual_review refundů.
- [ ] Ověřit duplicitní webhooky.
- [ ] Ověřit zákaznickou komunikaci.
- [ ] Ověřit, že admin nemusí ručně schvalovat úspěšně zaplacené rezervace nečlenů.
- [ ] Ověřit, že běžné admin schválení zůstává jen pro scénáře, kde je potřeba.
- [ ] Zapnout feature flag plně.
- [ ] Sledovat alerty po dobu zvýšeného dohledu.

## Kritéria úspěchu

- [ ] Nečlenové platí přes GoPay.
- [ ] Zaplacené rezervace se automaticky schvalují.
- [ ] Nezaplacené rezervace expirují.
- [ ] Včasná storna spouští refundy.
- [ ] Selhané refundy jsou viditelné a řešitelné.
- [ ] Členové a administrátoři stále rezervují stejně jako před zavedením GoPay.

## Rollback

- [ ] Vypnout GoPay create flow.
- [ ] Zachovat webhook/reconciliation pro existující platby.
- [ ] Převést nové refundy do manual review.
- [ ] Pokračovat ve standardním rezervačním režimu pro členy/adminy.

---

# Provozní alerty a monitoring

## Correlation ID

Každá platební rezervace musí mít jednoznačný correlation ID, podle kterého lze dohledat celý průběh jedné platby napříč systémy.

- [ ] Vygenerovat interní correlation ID při založení platebního workflow.
- [ ] Zapsat correlation ID do `payments` nebo bezpečných metadata.
- [ ] Zapsat correlation ID do platebního auditu.
- [ ] Používat correlation ID v aplikačních serverových logách.
- [ ] Používat correlation ID v Edge Function logách.
- [ ] Používat correlation ID při webhook zpracování.
- [ ] Pokud to GoPay podporuje, předat correlation ID jako bezpečné referenční ID/metadata do GoPay.
- [ ] Nepoužívat correlation ID jako secret.
- [ ] Correlation ID nesmí obsahovat osobní ani citlivé platební údaje.

## Alerty

- [ ] Payment `paid`, ale reservation není `approved` déle než 2 minuty.
- [ ] Reservation `approved`, ale payment není `paid` u platební rezervace.
- [ ] Refund `failed`.
- [ ] Refund `manual_review`.
- [ ] GoPay API opakovaně nedostupné.
- [ ] Vysoký počet expirovaných plateb.
- [ ] Webhook opakovaně selhává.
- [ ] Nesoulad částky.
- [ ] Nesoulad měny.
- [ ] Dvojitý webhook nad očekávaný limit.
- [ ] Expirační worker neběžel déle než očekávaný interval.

## Bezpečné logování

Logovat:

- [ ] Interní `payment_id`.
- [ ] Interní `reservation_id`.
- [ ] Bezpečný provider status.
- [ ] Počet pokusů.
- [ ] Bezpečnou poslední chybu.
- [ ] Stavový přechod.

Nelogovat:

- [ ] GoPay secrets.
- [ ] Service role key.
- [ ] Access tokeny.
- [ ] Authorization headery.
- [ ] Citlivé platební údaje.
- [ ] Raw webhook payload, pokud obsahuje citlivá data.

---

# Nouzové scénáře

## Zaplaceno, ale rezervace není schválena

- [ ] Zastavit nové platby flagem, pokud se problém opakuje.
- [ ] Ověřit GoPay stav platby.
- [ ] Ověřit reservation status.
- [ ] Pokud je slot stále volný a rezervace je validní, provést bezpečné serverové schválení.
- [ ] Pokud slot volný není nebo stav není jednoznačný, převést do manual review.
- [ ] Podle pravidel provést refund.

## Rezervace schválena bez platby

- [ ] Okamžitě vypnout platební create flow.
- [ ] Najít rozsah dotčených rezervací.
- [ ] Ověřit audit log.
- [ ] Zrušit nebo ručně vyřešit dotčené rezervace.
- [ ] Opravit guard, který schválení umožnil.

## Dvojitý refund

- [ ] Vypnout auto-refund.
- [ ] Reconcileovat stav v GoPay.
- [ ] Zkontrolovat idempotency keys.
- [ ] Opravit transakční lock/constraint.

## Blokovaný termín po neúspěšné platbě

- [ ] Ověřit expirační worker.
- [ ] Ručně převést payment na `expired` a reservation na `cancelled` pouze bezpečným admin/RPC postupem.
- [ ] Ověřit, že slot je znovu volný.

## Nefunkční webhook

- [ ] Zastavit nové platby.
- [ ] Ověřit GoPay konfiguraci webhook URL.
- [ ] Spustit reconciliation přes GoPay API.
- [ ] Nechat existující platby doběhnout přes polling/manual review.

## Dlouhodobá nedostupnost GoPay

Pokud je GoPay dlouhodobě nedostupné, systém musí degradovat bezpečně a neblokovat členy ani administrátory.

- [ ] Vypnout vytváření nových placených rezervací dynamickým kill switchem.
- [ ] Ponechat členům a administrátorům současné rezervační flow.
- [ ] Rozpracované platby nevydávat za úspěšné bez ověření.
- [ ] Existující webhooky a reconciliation ponechat aktivní, pokud neškodí.
- [ ] Admin dostane upozornění na dlouhodobou nedostupnost GoPay.
- [ ] Uživatelům zobrazit bezpečnou informaci, že online platba je dočasně nedostupná.
- [ ] Refundy v nejasném stavu převést do `manual_review`.
- [ ] Po obnovení GoPay spustit reconciliation plateb a refundů.

## Chybné časové pásmo pro storno nebo expiraci

- [ ] Vypnout auto-refund.
- [ ] Převést refundy do manual review.
- [ ] Opravit výpočet Europe/Prague.
- [ ] Doplnit testy kolem DST a hranic dne.

---

# Definice hotovo pro celou implementaci

Implementace je považována za hotovou až když platí:

- [ ] Členové rezervují stejně jako před GoPay.
- [ ] Administrátoři rezervují a spravují rezervace stejně jako před GoPay.
- [ ] Nečlen bez zaplacení nezíská `approved` rezervaci.
- [ ] Úspěšná GoPay platba automaticky schválí rezervaci.
- [ ] Return URL sama nic neschvaluje.
- [ ] Opakovaný webhook je idempotentní.
- [ ] Nezaplacené rezervace expirují a uvolní slot.
- [ ] Včasné storno zaplacené rezervace spustí refund.
- [ ] Selhaný refund není označen jako úspěšný.
- [ ] Admin vidí všechny problémové platební stavy.
- [ ] Monitoring a alerty jsou aktivní.
- [ ] Rollback plán je ověřený.
- [ ] Produkční checklist je splněný.
