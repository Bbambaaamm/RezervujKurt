# E2E smoke runbook (Playwright)

Tento runbook pokrývá minimální smoke scénář pro anonymního uživatele na stránce `/rezervace`.

## Předpoklady
- spuštěná aplikace RezervujKurt (lokálně nebo v CI) na URL, kterou Playwright použije jako `baseURL`
- nainstalované Node.js závislosti (`npm install`)

## Konfigurace base URL
Výchozí hodnota je:

```bash
http://127.0.0.1:3000
```

Pro jinou adresu nastav env proměnnou:

```bash
PLAYWRIGHT_BASE_URL=https://<tvuj-host> npm run test:e2e:smoke
```

## Spuštění smoke testu
```bash
npm run test:e2e:smoke
```

## Co test ověřuje
- stránka `/rezervace` se načte a zobrazí základní obsah
- v gridu je viditelný alespoň jeden obsazený/čekající slot
- anonymní uživatel vidí guard zprávu, že bez přihlášení nelze rezervaci vytvořit
- CTA odkaz vede na `/prihlaseni`
