import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const config = readFileSync("supabase/config.toml", "utf8");
const magicLinkTemplate = readFileSync("supabase/templates/magic_link.html", "utf8");
const confirmationTemplate = readFileSync("supabase/templates/confirmation.html", "utf8");

test("magic link šablona nepoužívá hardcoded host ani verify URL", () => {
  assert.equal(magicLinkTemplate.includes("app.github.dev"), false);
  assert.equal(magicLinkTemplate.includes("<CODESPACE_NAME>"), false);
  assert.equal(magicLinkTemplate.includes("auth/v1/verify"), false);
});

test("magic link šablona používá ConfirmationURL", () => {
  assert.equal(magicLinkTemplate.includes("{{ .ConfirmationURL }}"), true);
});

test("signup větev používá českou potvrzovací šablonu", () => {
  assert.match(config, /\[auth\.email\.template\.confirmation\][\s\S]*content_path\s*=\s*"\.\/supabase\/templates\/confirmation\.html"/);
  assert.equal(confirmationTemplate.includes("{{ .ConfirmationURL }}"), true);
  assert.match(confirmationTemplate, /Vytvořit účet a přihlásit se/);
});

test("signup šablona stručně vysvětluje použití e-mailu bez vytváření dojmu souhlasu", () => {
  assert.match(confirmationTemplate, /e-mail používáme pro přihlášení, správu účtu a rezervací/);
  assert.match(confirmationTemplate, /Nepoužíváme jej k marketingu/);
  assert.doesNotMatch(confirmationTemplate, /Kliknutím na odkaz potvrzujete|potvrzujete, že jste se seznámili/i);
  assert.doesNotMatch(confirmationTemplate, /ochrana-osobnich-udaju|\.SiteURL/);
  assert.doesNotMatch(confirmationTemplate, /souhlasíte se zpracováním|Souhlasím s GDPR/i);
  assert.match(confirmationTemplate, /tento e-mail můžete ignorovat/);
});

test("opakovaný magic link neobsahuje znovu GDPR informace", () => {
  assert.doesNotMatch(magicLinkTemplate, /ochrana-osobnich-udaju/);
  assert.doesNotMatch(magicLinkTemplate, /Nepoužíváme jej k marketingu/);
});
