# Právní, GDPR, privacy a security audit — 26. 8. 2026

> Technický a compliance audit není závazným právním stanoviskem advokáta. Produkční runtime, dashboardy, smlouvy a skutečně nasazené migrace nebyly dostupné; jejich stav je proto označen jako neověřený.

## A. Executive summary

Repozitář má rozumný bezpečnostní základ: rezervace vyžaduje Magic Link účet, vlastnictví a administrace jsou vynuceny RLS i sloupcovými granty a veřejnost čte samostatný minimální occupancy view. Nejvýznamnější nalezený problém byl nadbytečný obsah auditního logu (poznámka a celé snapshoty rezervace). Připravená migrace jej minimalizuje a jednorázově odstraní tyto duplicity; do produkce nebyla spuštěna.

Doplněny byly transparentní veřejné texty, informace přímo u přihlášení, pravidla, patička a testy privacy hranic. Provozovatel rozhodl, že historické provozní údaje rezervací zůstávají dlouhodobě zachované pro statistické vyhodnocování. Před zveřejněním právních textů musí doplnit svou identitu a kontakt a interně stanovit retenční pravidla pro osobní vazby, volné texty, notifikační data a technické záznamy.

Právní posouzení vychází zejména z čl. 5, 6, 12, 13, 15–22, 25 a 32 [GDPR (EUR-Lex)](https://eur-lex.europa.eu/eli/reg/2016/679/oj), zákona č. 110/2019 Sb. a § 89 zákona č. 127/2005 Sb. Pro účet a rezervaci je s vysokou mírou jistoty vhodný čl. 6 odst. 1 písm. b); pro přiměřené bezpečnostní záznamy čl. 6 odst. 1 písm. f). Konkrétní vyvážení oprávněného zájmu musí potvrdit správce.

## B. Skutečný tok osobních údajů

`e-mail z /prihlaseni → Supabase Auth OTP (create_user=true) → auth.users → trigger profiles (e-mail + jméno odvozené z lokální části e-mailu) → localStorage session (access/refresh token) → rezervace s user_id a volitelnou poznámkou → audit změny + notification_outbox → Edge Function → Resend → správce / uživatel dle typu události`.

Magic Link šablona je čistě transakční. Token přichází v URL fragmentu, klient jej po načtení odstraní přes `history.replaceState`; v nalezeném aplikačním logování se celý token nevypisuje. Expiraci odkazu a produkční SMTP/Auth konfiguraci nelze ověřit z dostupného kontextu.

Lifecycle je `authenticated → pending → po přibližně minutě auto-approval pro user/member/admin → approved → případně cancelled`. Deployed stav cron jobu nelze ověřit. Uživatel může vložit jen vlastní `pending` rezervaci a aktualizovat jen její `status` na `cancelled`; admin má provozní správu. Člen a admin navíc mohou přes neveřejný authenticated view číst poznámky obsazenosti.

## C. Inventář osobních údajů

| Údaj | Zdroj | Umístění | Účel | Přístup | Retence |
|---|---|---|---|---|---|
| E-mail | login | `auth.users`, `profiles`, session; snapshot odesílaného e-mailu v outboxu | login, účet, notifikace | vlastník profilu, admin, service role, Resend dle zprávy | automatická konečná lhůta nenalezena |
| UUID účtu | Supabase | auth, profile, reservation, audit | vazba a autorizace | vlastník/admin/service role; veřejný view jej nevrací | automatická lhůta nenalezena |
| Jméno | automaticky z e-mailu, později `/ucet` | `profiles`; administrační e-mail | správa rezervace | vlastník, admin/service role; veřejně ne | automatická lhůta nenalezena |
| Telefon | historický nullable sloupec | `profiles` | aktivní UI jej nesbírá ani nepoužívá | vlastník/admin/service role | automatická lhůta nenalezena |
| Termín, kurt, stav | uživatel/systém | `reservations`, audit, outbox | rezervace, provozní evidence a dlouhodobé statistiky | veřejně jen occupancy; plný řádek vlastník/admin | dlouhodobé uchování je záměrné |
| Poznámka | dobrovolně uživatel | `reservations`, admin e-mail/outbox; před stagingovým nasazením také audit | provozní informace | vlastník, member, admin/service role; nikdy anon | pravidlo pro osobní volný text není stanoveno |
| Audit metadata | DB trigger | `reservation_audit_log` | bezpečnost a dohledatelnost změn | vlastník příslušné rezervace a admin | automatická lhůta nenalezena |
| E-mailový snapshot/chyba | worker | `notification_outbox` | retry a idempotence | pouze service role | odeslané řádky zůstávají bez cleanupu |
| Payment UUID, stav, částka | připravený payment kód | payment tabulky | budoucí platby | owner výřez/admin/service role | nelze ověřit; produkční aktivace neověřena |

Databázové objekty: `profiles` obsahuje výše uvedený profil; `reservations` rezervace; `reservation_public_occupancy` pouze obsazenost; `reservation_member_occupancy_notes` poznámky pro vlastníka rezervace a záměrně také pro role `member` a `admin`; `reservation_audit_log` změny; `notification_outbox` doručení; `tournaments` provozní blokace (volný text může obsahovat osobní údaj); payment tabulky jsou připravené za defaultně vypnutými flags. Anonymní role nemá grant na notes view, běžný `user` projde jeho podmínkou jen u vlastní rezervace a samotný view neprojektuje `user_id`, e-mail ani jméno. Storage bucket je určen turnajovým plakátům, osobní data v něm z kódu potvrzena nebyla.

## D. Externí služby

| Služba | Produkční stav | Data | Účel |
|---|---|---|---|
| Supabase | `UNKNOWN_FROM_AVAILABLE_CONTEXT` (kód ji vyžaduje) | účet, e-mail, session, profil, rezervace, logy/outbox | auth, DB, Edge Functions |
| Vercel | `UNKNOWN_FROM_AVAILABLE_CONTEXT` (metadata míří na Vercel URL) | běžné HTTP/technické údaje dle platformy | hosting Next.js |
| Resend | `UNKNOWN_FROM_AVAILABLE_CONTEXT` (worker a secret konfigurace existují) | adresát, jméno a detail rezervace včetně poznámky adminovi | transakční e-mail |
| GoPay | `DISABLED_BY_FEATURE_FLAG` podle seed migrace; skutečný produkční stav nelze ověřit | připravený payload používá interní ID, částku, měnu; bez payer kontaktu | budoucí platba |

U Supabase, Vercelu a Resendu: **[VYŽADUJE OVĚŘENÍ PROVOZOVATELE]** — DPA, role dodavatele, region, subdodavatelé, retence a případné předání mimo EHP. GoPay není v aktuálním veřejném privacy výčtu prezentován jako aktivní příjemce.

## E. Cookies/storage

- `localStorage: rezervujkurt.auth.session` — access token, refresh token, user UUID a e-mail; technicky nezbytná relace, odstraněná při logoutu/neplatnosti.
- URL fragment Magic Linku — dočasný access/refresh token; po bootstrapu je fragment odstraněn.
- V aplikačním kódu nebyly nalezeny `document.cookie`, `sessionStorage`, analytika, reklamní pixely ani marketingové skripty.
- Platformní cookies/HTTP logy Vercelu a produkční nastavení Supabase nelze ověřit z repozitáře.

**Cookie consent banner: NENÍ POTŘEBA**, protože nalezené klientské úložiště je nezbytné pro uživatelem vyžádané přihlášení a nebylo nalezeno nenutné sledování. Závěr platí, pokud provozní dashboard nepotvrdí další technologie.

## F. Co bylo změněno

- `app/ochrana-osobnich-udaju/page.tsx`: konkrétní informace podle čl. 13 a povinné identifikační placeholdery; veřejný text popisuje pouze aktuální stav, ne auditní nebo implementační historii.
- `app/pravidla-rezervaci/page.tsx`: pouze technicky potvrzená pravidla a jednoduchý bezplatný charakter služby; nepotvrzené podmínky ani interní úkoly se veřejně nezobrazují.
- `components/footer.tsx`, `app/layout.tsx`, `app/sitemap.ts`: přístupné odkazy a indexovatelné veřejné route; soukromé route zůstávají v `robots.ts` zakázané.
- `app/prihlaseni/page.tsx`, `app/ucet/page.tsx`: transparentní informace bez checkboxu a vysvětlení jména.
- `app/rezervace/page.tsx`: upozornění, aby poznámka neobsahovala citlivé údaje.
- `supabase/functions/process-notification-outbox/{index,notification}.ts`: telefon se už zbytečně nenačítá ani neposílá jako prázdné pole.
- `supabase/migrations/20260826120000_minimize_reservation_audit_payload.sql`: minimalizace auditu.
- `tests/privacy-compliance-regression.test.ts`: veřejná hranice, audit payload, login UX a právní route.

## G. Databázové změny

`20260826120000_minimize_reservation_audit_payload.sql` předefinuje dva existující triggery tak, aby neukládaly poznámku ani celé `old/new` objekty, a ze starých payloadů odstraní klíče `note`, `old`, `new`. Je aplikačně backward-compatible, nemění rezervace ani jejich historii/stav a zachovává sloupce auditu. `CREATE OR REPLACE FUNCTION` vyžaduje krátký katalogový lock; jednorázový `UPDATE` zamyká jen dotčené auditní řádky a jeho délka závisí na objemu.

Bezpečný postup: záloha → staging restore produkčního schématu → `supabase migration up` proti stagingu → unit/RLS/lifecycle testy → kontrola počtu dotčených auditů → plánované ruční spuštění v produkci → kontrola triggerů a nového payloadu bez vytváření testovací rezervace. Rollback: obnovit předchozí definice funkcí z migrací `20260519100000` a `20260519113000`; odstraněné duplicitní klíče lze vrátit pouze ze zálohy, samotné rezervace zůstávají nedotčené.

**Migrace nebyla automaticky nasazena do produkce.**

## H. Testy

Výsledky příkazů jsou uvedeny v závěrečném výstupu commitu/PR. Live e-mail, produkční anon key a produkční RLS nebyly použity; žádná skutečná rezervace ani zpráva nevznikla.

## I. Co musí doplnit provozovatel

- `[DOPLNIT SPRÁVCE / PROVOZOVATELE, SÍDLO, IČO POKUD RELEVANTNÍ, KONTAKTNÍ E-MAIL]`.
- `[ROZHODNOUT RETENČNÍ PRAVIDLA]` pro účet/profil, osobní vazbu a poznámku rezervace, audit a odeslaný/failed outbox. Toto rozhodnutí se netýká mazání celé historické rezervace: termín, kurt a stav mají zůstat pro dlouhodobé statistiky. Případné budoucí oddělení statistické historie od osobní vazby vyžaduje samostatné zadání a stagingové ověření.
- `[OVĚŘIT ZPRACOVATELSKÉ PODMÍNKY POSKYTOVATELE]` pro Supabase, Vercel a Resend.
- `[ROZHODNOUT PROVOZNÍ PRAVIDLA]` uvedená na stránce pravidel.
- V dashboardech potvrdit runtime/deployment stav, Auth expiraci a redirect allowlist, cron auto-approval/outbox, defaultně vypnuté GoPay flags a absenci další analytiky/cookies.

## J. Rizika

### Kritické
**Žádné nalezené v dostupném kódu.** Produkční konfiguraci nelze ověřit.

### Vysoké
- Neurčený správce/kontakt a chybějící schválená retence brání finálnímu zveřejnění právního textu.

### Střední
- Outbox uchovává celé odesílané zprávy bez cleanupu; obsahuje adresáta a u admin notifikace jméno/poznámku. Pro retry musí zůstat snapshot nevyřízené zprávy a stav pokusů; po úspěšném odeslání lze po stanovení retenčního pravidla odstranit tělo a adresáta nebo celý vyřízený řádek a ponechat jen nezbytnou agregovanou provozní evidenci. Konkrétní lhůta nebyla domyšlena a cleanup nebyl implementován.
- Vlastník rezervace může číst její audit log. Payload je po migraci minimalizovaný, ale nezbytnost tohoto klientského přístupu je vhodné provozně potvrdit.
- Tokeny jsou v localStorage, a jsou proto dostupné JavaScriptu při případném XSS; odpovídá to vlastnímu auth klientu, ale vyžaduje důslednou XSS prevenci/CSP review.

### Potvrzený autorizační model poznámek
- **ANON:** čte jen veřejnou obsazenost; notes view má explicitní `REVOKE` a veřejný view `note` neprojektuje.
- **USER:** notes view vrátí jen řádky, kde `reservations.user_id = auth.uid()`; přímý SELECT celé cizí rezervace blokuje RLS.
- **MEMBER:** má záměrný provozní přístup k poznámkám aktivních obsazených slotů, nikoli k e-mailu, jménu nebo `user_id` přes notes view.
- **ADMIN:** má stejný notes view a samostatná administrační oprávnění odpovídající současné aplikaci.

### Nízké
- Historický `phone` sloupec zůstává, ač jej UI nesbírá; destruktivní odstranění nebylo bez datového ověření provedeno.
- Vývojové OTP logy obsahují e-mail/payload nebo response body; produkčně jsou podmíněné `NODE_ENV=development`, ale sdílené dev logy je třeba chránit.
- Metadata používají doménu `rezervuj-kurt.vercel.app`; shoda s veřejnou `rezervujkurt.cz` vyžaduje ověření provozovatele.

## Povinný závěrečný audit

### Authentication
- Je pro rezervaci nutné přihlášení? **ANO**.
- Je Magic Link bezpečně implementovaný? **ANO v kódu / NELZE OVĚŘIT produkční konfiguraci a expiraci**.
- Neukládají se tokeny do logů? **ANO v nalezeném produkčním kódu**.

### Personal data
- Víme, kde je e-mail a jméno? **ANO v repozitářem řízeném toku**.
- Je telefon skutečně používán? **NE** v aktivním UI/workeru po změně; sloupec historicky existuje.
- Víme, kde je poznámka? **ANO**.

### Public privacy
- Může anon získat e-mail, jméno, `user_id` nebo poznámku? **NE** podle view/grantů a testu.
- Obsahuje veřejný endpoint jen obsazenost? **ANO**.

### Authorization
- Může user A vidět rezervaci user B? **NE** podle RLS.
- Může user A zrušit rezervaci user B? **NE** podle RLS.
- Může user změnit svou roli? **NE** podle sloupcového grantu.

### GDPR UX
- Existuje privacy route a odkaz u loginu? **ANO**.
- Vznikl checkbox nebo cookie banner? **NE**.

### Reservation UX
- Rezervace, Moje rezervace a zrušení stále fungují? **ANO podle unit/build kontrol; NELZE OVĚŘIT proti produkci**.
- Auto-approval zůstal funkční? **ANO, kód nebyl změněn; NELZE OVĚŘIT cron runtime**.

### Legal accuracy
- Text odpovídá nalezeným datům? **ANO**, s označenými neověřenými body.
- Obsahuje jen skutečně potvrzené třetí strany? **ANO jako kódem používané kandidáty, produkční stav je transparentně neověřený**.
- Rozlišuje payment flow? **ANO**, GoPay není vydáván za aktivní produkční službu.

### Historie a retence
- Mažou se celé historické rezervace? **NE**; žádný cleanup rezervací nebyl přidán.
- Je dlouhodobé uchování termínu, kurtu a stavu záměrné? **ANO**, pro provozní statistiky.
- Jsou pravidla pro osobní vazby, poznámky, outbox a technické logy úplná? **NE**, vyžadují interní rozhodnutí provozovatele bez automatického mazání celé rezervace.

## K. Stav připravenosti

### Kód
`READY`

### Databázová migrace
`READY FOR STAGING`

### Právní texty
`REQUIRES OPERATOR INPUT`

### Celkově
`READY AFTER OPERATOR INPUT`
