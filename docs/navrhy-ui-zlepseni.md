# Návrhy na další zpřehlednění UI

Tento dokument shrnuje navazující návrhy, které nejsou nutné pro aktuální opravu, ale dávají smysl jako další malé a bezpečné kroky. Cílem je hlavně zlepšit mobilní použitelnost bez rozsáhlého refaktoru a bez nových závislostí.

## 1. Úvodní stránka na mobilu

### Doporučená varianta

- Zkrátit mobilní hero sekci na jasné sdělení, primární tlačítko `Rezervovat kurt` a sekundární tlačítko `Moje rezervace` / `Přihlásit se`.
- Rychlý stav rezervací ponechat hned pod hero sekcí, ale na mobilu jej zobrazit jako kompaktní seznam tří řádků.
- Turnaje zobrazovat až pod rychlým stavem a jen tehdy, pokud existuje blížící se turnaj nebo se data právě načítají.

### Proč

Na mobilu je nejdůležitější rychle se dostat k rezervaci. Krátký hero blok a rychlý stav pomohou uživateli rozhodnout se bez dlouhého scrollování.

### Dopad

Pouze prezentační změna v `components/home-page.tsx`. Nemění API ani datové načítání.

## 2. Rezervace na mobilu

### Doporučená varianta

- Datum přesunout do kompaktního sticky panelu nad přehledem kurtů, aby bylo jasné, pro který den uživatel vybírá.
- Zachovat současné přepínače kurtů, ale doplnit krátkou legendu stavů: `Volno`, `Obsazeno`, `Již proběhlo`.
- Spodní rezervační panel zjednodušit: před výběrem zobrazit jen instrukci, po výběru zobrazit termín a hlavní CTA. Poznámku nechat jako volitelné rozbalitelné pole.

### Proč

Aktuální mobilní rezervační flow je funkční, ale spodní panel zabírá hodně místa. Kompaktnější panel zlepší viditelnost časových slotů a sníží pocit přeplněnosti.

### Dopad

Změna by se týkala hlavně `app/rezervace/page.tsx` a částečně `components/reservation-grid.tsx`. Logika výběru slotů by měla zůstat beze změny.

## 3. Moje rezervace a administrace

### Doporučená varianta

- Ponechat omezenou výšku seznamů a tabulek se svislým scrollováním.
- U desktopových tabulek držet sticky hlavičku, aby při scrollování zůstaly čitelné sloupce.
- U dlouhých mobilních seznamů případně doplnit jemný text `Posuňte seznam pro další položky`, pokud se ukáže, že uživatelé scroll uvnitř karty přehlížejí.

### Proč

Zachová se stabilní výška stránky, ale uživatel má přístup k více položkám bez stránkování.

### Dopad

Aktuální implementace už tento směr zavádí. Další krok by byl pouze drobný textový hint nebo jemný vizuální fade na konci scroll boxu.

## 4. Co bych nedělal teď

- Nepřidával bych novou UI knihovnu ani carousel.
- Nedělal bych kompletní redesign tabulkových dat, dokud nebude jasné, kde uživatelé skutečně narážejí.
- Nepřidával bych stránkování, pokud zatím stačí scroll box a bezpečný limit načítaných položek.
