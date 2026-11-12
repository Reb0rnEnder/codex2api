import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { recoverBasisPointsCallback, buildBasisPointsRecoveryScript } from "./basisPointsLogin.ts";

const callback = "https://bps.openai.com/basispoints/extension/360590d7-f8f9-4d88-bf75-0edfe0a4b9f3/auth/callback";
test("recover the matching callback after its query was removed", () => {
  const original = callback + "?code=test-code&state=test-state";
  assert.equal(recoverBasisPointsCallback(callback, [original], "test-state"), original);
  assert.equal(recoverBasisPointsCallback(callback, [original], "wrong-state"), null);
  assert.equal(recoverBasisPointsCallback("https://evil.example", [original], "test-state"), null);
  assert.equal(recoverBasisPointsCallback(callback, [callback + "?code=test&state=test-state&error=denied"], "test-state"), null);
});
test("console and bookmarklet script display only the callback for this session", () => {
  const original = callback + "?code=test-code&state=test-state";
  let displayed;
  vm.runInNewContext(buildBasisPointsRecoveryScript("test-state"), {
    URL, location: { href: callback }, performance: { getEntriesByType: () => [{ name: original }] },
    prompt: (_message, value) => { displayed = value; }, alert: () => assert.fail("unexpected alert"),
  });
  assert.equal(displayed, original);
});
