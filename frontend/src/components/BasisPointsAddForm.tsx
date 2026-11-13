import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { BasisPointsIcon } from "./BasisPointsIcon";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function BasisPointsAddForm({ onAdded }: { onAdded: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [proxyURL, setProxyURL] = useState("");
  const [session, setSession] = useState<{ session_id: string; auth_url: string } | null>(null);
  const [callbackURL, setCallbackURL] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setBusy(true); setError(""); setSession(null); setCallbackURL("");
    try { setSession(await api.startBasisPointsOAuth({ proxy_url: proxyURL })); }
    catch (e) { setError(e instanceof Error ? e.message : t("basispoints.startFailed")); }
    finally { setBusy(false); }
  }
  async function complete() {
    if (!session) return;
    setBusy(true); setError("");
    try {
      await api.completeBasisPointsOAuth({ session_id: session.session_id, callback_url: callbackURL, name });
      setCallbackURL(""); setSession(null); onAdded();
    } catch (e) { setError(e instanceof Error ? e.message : t("basispoints.finishFailed")); }
    finally { setBusy(false); }
  }
  return <div className="space-y-5">
    <div className="flex items-start gap-3 rounded-xl border bg-muted/25 p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background text-primary shadow-sm"><BasisPointsIcon className="size-5" /></span>
      <div><h3 className="font-semibold tracking-tight">BasisPoints</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t("basispoints.intro")}</p></div>
    </div>
    <div role="note" className="flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-200"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><p>{t("basispoints.officeWarning")}</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-2 text-sm font-medium">{t("basispoints.name")}<Input value={name} maxLength={100} onChange={e => setName(e.target.value)} autoComplete="off" /></label>
      <label className="space-y-2 text-sm font-medium">{t("basispoints.proxy")}<Input value={proxyURL} disabled={!!session || busy} onChange={e => setProxyURL(e.target.value)} autoComplete="off" /></label>
    </div>
    <div className="rounded-xl border p-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">{session ? <Check className="size-3.5" /> : "1"}</span>{t("basispoints.signInStep")}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant={session ? "outline" : "default"} disabled={busy} onClick={() => void start()}>{busy ? <Loader2 className="size-4 animate-spin" /> : session ? <RefreshCw className="size-4" /> : <ArrowRight className="size-4" />}{t(session ? "basispoints.restart" : "basispoints.start")}</Button>
        {session && <Button asChild><a href={session.auth_url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />{t("basispoints.openSignIn")}</a></Button>}
      </div>
    </div>
    {session && <div className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">2</span>{t("basispoints.callbackStep")}</div>
      <p className="text-sm leading-relaxed text-muted-foreground">{t("basispoints.callbackHint")}</p>
      <label className="block space-y-2 text-sm font-medium">{t("basispoints.callback")}<Input type="password" value={callbackURL} onChange={e => setCallbackURL(e.target.value)} autoComplete="off" spellCheck={false} placeholder="https://bps.openai.com/.../auth/callback?code=...&state=..." /></label>
      <p className="text-xs text-muted-foreground">{t("basispoints.expiry")}</p>
      <Button type="button" disabled={busy || !callbackURL.trim()} onClick={() => void complete()}>{busy && <Loader2 className="size-4 animate-spin" />}{t("basispoints.add")}</Button>
    </div>}
    {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
  </div>;
}
