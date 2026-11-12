import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function ZcodeAddForm({ onAdded }: { onAdded: () => void }) {
  const { t } = useTranslation();
  const onAddedRef = useRef(onAdded);
  onAddedRef.current = onAdded;
  const [name, setName] = useState("");
  const [proxyURL, setProxyURL] = useState("");
  const [token, setToken] = useState("");
  const [session, setSession] = useState<{ session_id: string; auth_url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api.pollZcodeLogin({ session_id: session!.session_id });
        if (cancelled) return;
        if (result.status === "ready") { setSession(null); onAddedRef.current(); return; }
        if (result.status !== "pending") { setSession(null); setError(t("zcode.signInExpired")); return; }
        timer = setTimeout(() => void poll(), 2000);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : t("zcode.signInFailed")); }
    }
    timer = setTimeout(() => void poll(), 2000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [session, retry, t]);

  async function start() {
    setBusy(true); setError(""); setSession(null);
    try { setSession(await api.startZcodeLogin({ name, proxy_url: proxyURL })); }
    catch (e) { setError(e instanceof Error ? e.message : t("zcode.signInFailed")); }
    finally { setBusy(false); }
  }
  async function addToken() {
    setBusy(true); setError("");
    try { await api.addZcodeAccount({ name, token, proxy_url: proxyURL }); setToken(""); onAdded(); }
    catch (e) { setError(e instanceof Error ? e.message : t("zcode.importFailed")); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">{t("zcode.intro")}</p>
    <label className="block space-y-1 text-sm">{t("zcode.name")}<Input value={name} maxLength={100} disabled={!!session} onChange={e => setName(e.target.value)} /></label>
    <label className="block space-y-1 text-sm">{t("zcode.proxy")}<Input value={proxyURL} disabled={!!session} onChange={e => setProxyURL(e.target.value)} autoComplete="off" /></label>
    <Button type="button" disabled={busy} onClick={() => void start()}>{t(session ? "zcode.restart" : "zcode.signIn")}</Button>
    {session && <div className="space-y-2 text-sm">
      <a className="text-primary underline" href={session.auth_url} target="_blank" rel="noreferrer">{t("zcode.openSignIn")}</a>
      <p className="text-muted-foreground">{t("zcode.waiting")}</p>
      {error && <Button type="button" variant="outline" onClick={() => { setError(""); setRetry(v => v + 1); }}>{t("common.retry")}</Button>}
    </div>}
    <details className="space-y-3 rounded-lg border p-3">
      <summary className="cursor-pointer text-sm">{t("zcode.importToken")}</summary>
      <p className="text-xs text-muted-foreground">{t("zcode.tokenHint")}</p>
      <Input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" spellCheck={false} />
      <Button type="button" disabled={busy || !token.trim()} onClick={() => void addToken()}>{t("zcode.add")}</Button>
    </details>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
