import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const template = readFileSync("supabase/templates/magic_link.html", "utf8");

test("magic link šablona nepoužívá hardcoded host ani verify URL", () => {
  assert.equal(template.includes("app.github.dev"), false);
  assert.equal(template.includes("<CODESPACE_NAME>"), false);
  assert.equal(template.includes("auth/v1/verify"), false);
});

test("magic link šablona používá ConfirmationURL", () => {
  assert.equal(template.includes("{{ .ConfirmationURL }}"), true);
});
