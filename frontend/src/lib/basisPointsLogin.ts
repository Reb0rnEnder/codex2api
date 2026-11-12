// Navigation entries retain the original document URL after replaceState.
// No tokens are read and no requests are sent by this helper.
export function recoverBasisPointsCallback(currentUrl: string, navigationUrls: string[], expectedState: string): string | null {
  const callbackPath = "/basispoints/extension/360590d7-f8f9-4d88-bf75-0edfe0a4b9f3/auth/callback";
  try {
    const current = new URL(currentUrl);
    if (current.origin !== "https://bps.openai.com" || current.pathname !== callbackPath) return null;
  } catch { return null; }
  for (const candidate of [currentUrl, ...navigationUrls]) {
    try {
      const url = new URL(candidate);
      if (url.origin === "https://bps.openai.com" && url.pathname === callbackPath && url.searchParams.get("code") && url.searchParams.get("state") === expectedState && !url.searchParams.has("error")) return url.href;
    } catch { /* Ignore malformed entries. */ }
  }
  return null;
}

export function buildBasisPointsRecoveryScript(expectedState: string): string {
  return `(() => { const recover = ${recoverBasisPointsCallback.toString()}; const url = recover(location.href, performance.getEntriesByType("navigation").map(entry => entry.name), ${JSON.stringify(expectedState)}); if (!url) { alert("No matching sign-in callback found. Run this on the BasisPoints callback page immediately after signing in, without reloading. If the navigation entry is unavailable, use the Network-tab method."); return; } prompt("Copy this callback URL, then paste it into codex2api:", url); })()`;
}
