import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createInstance } from "i18next";
import ts from "typescript";
import { languageFallbacks } from "./languageFallbacks.ts";

const readLocale = name => JSON.parse(fs.readFileSync(new URL(`../locales/${name}.json`, import.meta.url), "utf8"));
const en = readLocale("en"), zh = readLocale("zh"), tw = readLocale("zh-TW");
function flatten(object, prefix = "") {
  return Object.fromEntries(Object.entries(object).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === "object" ? Object.entries(flatten(value, path)) : [[path, value]];
  }));
}

test("English catalog covers Chinese keys without Chinese fallback text", () => {
  const english = flatten(en);
  for (const [key, value] of Object.entries(flatten(zh))) {
    assert.ok(key in english, `Missing English translation: ${key}`);
    const placeholders = text => [...String(text).matchAll(/{{\s*([^}]+?)\s*}}/g)].map(m => m[1]).sort();
    assert.deepEqual(placeholders(english[key]), placeholders(value), `Interpolation mismatch: ${key}`);
  }
  for (const [key, value] of Object.entries(english)) assert.doesNotMatch(String(value), /[\u3400-\u9fff]/, key);
});

test("language switching resolves translated labels and English never falls back to Chinese", async () => {
  const i18n = createInstance();
  await i18n.init({ lng: "en", fallbackLng: languageFallbacks, resources: { en: { translation: en }, zh: { translation: { ...zh, chineseOnlyTest: "仅中文" } }, "zh-TW": { translation: tw } } });
  const key = "uiExtra.channelMonitor.channelMonitoring";
  assert.equal(i18n.t(key), "Channel monitoring");
  assert.equal(i18n.t("chineseOnlyTest"), "chineseOnlyTest");
  await i18n.changeLanguage("zh");
  assert.equal(i18n.t(key), "渠道监控");
  await i18n.changeLanguage("en");
  assert.equal(i18n.t(key), "Channel monitoring");
});

test("audited UI surfaces contain no unlocalized Chinese literals", () => {
  const files = ["pages/ChannelMonitor.tsx", "pages/IntelligenceCheck.tsx", "components/PromptFilterNewAPIBindings.tsx", "components/IntelligenceRunDialog.tsx", "components/AccountIntelligenceHistoryDialog.tsx", "components/ChannelMonitorConfigDialog.tsx", "components/AccountQuickConfigSheet.tsx", "components/AccountIntelligenceBar.tsx", "pages/Accounts.tsx", "pages/Settings.tsx", "components/ChipInput.tsx"];
  for (const file of files) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["c", "t"].includes(node.expression.text)) return;
      if (ts.isPropertyAssignment(node) && ["zh", "zhTW", "zh-TW"].includes(node.name?.text)) return;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) {
        if ((ts.isPropertyAssignment(node.parent) && node.parent.name === node) || ts.isBinaryExpression(node.parent) || ts.isCaseClause(node.parent)) return;
        assert.doesNotMatch(node.text, /[\u3400-\u9fff]/, `${file}: ${node.text}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  }
});
