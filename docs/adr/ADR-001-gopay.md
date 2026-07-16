# ADR-001: Bezpečná integrace GoPay plateb pro rezervace nečlenů

## Stav

Navrženo.

## Kontext

RezervujKurt je produkční rezervační systém, ve kterém už probíhají reálné rezervace. Platební brána GoPay má být použita pouze pro rezervace nečlenů. Členové a administrátoři musí rezervovat stejně jako doposud a současné automatické schvalování členů a administrátorů nesmí být narušeno.

Integrace plateb přidává nové rizikové oblasti:

- blokaci termínu během platby,
- potvrzení rezervace až po ověřené platbě,
- zpracování webhooků,
- expiraci nezaplacených rezervací,
- automatické refundy,
- reconciliation při výpadku webhooku nebo GoPay API,
- rollback a provozní kill switch.

## Rozhodnutí

### Použít samostatnou tabulku `payments`

Platební stav bude oddělený od stavu rezervace. Rezervace bude popisovat stav termínu a jeho schválení, zatímco `payments` bude popisovat stav platby, refundu, GoPay identifikátorů, idempotence, expirace a technických chyb.

Důvody:

- platba a rezervace mají rozdílný lifecycle,
- členové a administrátoři platbu nepotřebují,
- refundy vyžadují samostatný stavový model,
- bezpečnostní a provozní metadata nemají být ukládána přímo do `reservations`,
- samostatný model usnadní RLS a audit.

### Zavést stav `waiting_for_payment`

Nečlenská rezervace čekající na platbu bude používat samostatný stav `waiting_for_payment`, nikoli běžný `pending`.

Důvody:

- `pending` dnes znamená běžnou čekající rezervaci pro admin/auto-approve workflow,
- platební rezervace nesmí být omylem ručně schválena běžnou admin akcí,
- `waiting_for_payment` může blokovat slot, ale neznamená finální schválení,
- stav umožní bezpečně expirovat nezaplacené rezervace se zachováním historie.

### Schvalovat pouze serverově po ověření GoPay

Návratová URL z GoPay není důkaz zaplacení. Schválení rezervace proběhne pouze po serverovém ověření stavu platby u GoPay a transakční změně databázového stavu.

Důvody:

- klient nesmí označit rezervaci jako zaplacenou,
- webhook může být doručen opakovaně nebo pozdě,
- GoPay stav je nutné ověřit proti očekávané částce, měně a konkrétní rezervaci,
- transakční RPC umožní idempotenci a audit.

### Použít reconciliation workflow

Webhook nebude jediný mechanismus pro dokončení platby nebo refundu. Systém bude mít reconciliation proces pro platby a refundy, které jsou příliš dlouho v mezistavu nebo u kterých došlo k timeoutu či chybě.

Důvody:

- webhook nemusí přijít,
- webhook může přijít pozdě,
- GoPay API může dočasně selhat,
- create payment může skončit nejednoznačným timeoutem,
- refund může zůstat dlouho ve stavu `processing`.

### Zavést feature flagy a kill switche

Platební funkcionalita bude zaváděna za vypnutými feature flagy. Aplikační capability flags určují, zda deployment obsahuje platební kód a jaké prostředí používá. Dynamické provozní kill switche umožní bez deploye zastavit vytváření nových plateb nebo auto-refundy.

Důvody:

- Vercel environment variable nemusí být okamžitý provozní přepínač,
- nové platby musí jít rychle vypnout,
- vypnutí create flow nesmí zastavit zpracování existujících webhooků,
- vypnutí auto-refundu nesmí ztratit rozpracované refundy.

### Oddělit platební audit od `notification_outbox`

`notification_outbox` bude sloužit k doručování e-mailů a uživatelských/admin notifikací. Technický platební audit bude uložen samostatně, například v `payment_audit_log` nebo `payment_events`.

Důvody:

- ne každá technická platební událost má vyvolat e-mail,
- audit musí evidovat stavové přechody, retry a reconciliation,
- audit nesmí obsahovat secrets ani citlivé raw payloady,
- samostatný audit zjednoduší provozní diagnostiku.

## Důsledky

Pozitivní:

- nižší riziko schválení rezervace bez platby,
- lepší rollback a postupné nasazení,
- jasnější provozní diagnostika,
- menší dopad na členy a administrátory,
- bezpečnější práce s refundy.

Negativní / náklady:

- vyšší složitost databázového modelu,
- potřeba více testů,
- potřeba reconciliation workeru,
- nutnost admin/provozního přehledu,
- nutnost udržovat feature flag lifecycle.

## Alternativy

### Přidat platební sloupce přímo do `reservations`

Zamítnuto. Smíchalo by to stav rezervace a stav platby, zhoršilo RLS, audit i refund lifecycle a zbytečně by zatížilo rezervace členů a administrátorů.

### Použít pouze stav `pending` pro čekání na platbu

Zamítnuto. `pending` už dnes znamená běžnou čekající rezervaci a může být viditelný v manuálním admin schvalování. To by zvyšovalo riziko schválení nezaplacené rezervace.

### Spoléhat pouze na webhook

Zamítnuto. Webhook může být zpožděný, duplicitní nebo nedoručený. Reconciliation je nutná pro provozní spolehlivost.

### Použít pouze Vercel environment variable jako kill switch

Zamítnuto jako jediný mechanismus. Změna Vercel env proměnné může vyžadovat redeploy, takže pro okamžité provozní vypnutí nových plateb je vhodnější dynamický serverově čtený flag.

## Otevřené otázky

- Konkrétní pravidla cenotvorby nejsou v tomto ADR určena.
- Konkrétní GoPay credentials a produkční konfigurace nejsou v repozitáři a nesmí být domýšleny.
- Přesná implementace dynamické konfigurační tabulky bude předmětem samostatného implementačního PR.
- Přesný formát GoPay metadat/correlation reference musí být ověřen proti aktuální GoPay dokumentaci před implementací.
