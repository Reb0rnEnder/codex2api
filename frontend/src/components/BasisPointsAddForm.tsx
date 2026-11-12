import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildBasisPointsRecoveryScript } from "../lib/basisPointsLogin";
import { api } from "../api";

export function BasisPointsAddForm({ onAdded }: { onAdded: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [proxyURL, setProxyURL] = useState("");
  const [session, setSession] = useState<{ session_id: string; auth_url: string } | null>(null);
  const [callbackURL, setCallbackURL] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const recoveryScript = useMemo(() => session ? buildBasisPointsRecoveryScript(new URL(session.auth_url).searchParams.get("state") ?? "") : "", [session]);
  const [copied, setCopied] = useState(false);
  const copyScript = async (bookmark: boolean) => {
    try { await navigator.clipboard.writeText(bookmark ? "javascript:" + encodeURIComponent(recoveryScript) : recoveryScript); setCopied(true); } catch { setError(t("basispoints.copyFailed")); }
  };
  const inputClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  async function start() {
    setBusy(true);
    setError("");
    setSession(null);
    setCopied(false);
    setCallbackURL("");
    try {
      setSession(await api.startBasisPointsOAuth({ proxy_url: proxyURL }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("basispoints.startFailed"));
    } finally { setBusy(false); }
  }

  async function complete() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      await api.completeBasisPointsOAuth({ session_id: session.session_id, callback_url: callbackURL, name });
      setCallbackURL("");
      setSession(null);
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("basispoints.finishFailed"));
    } finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">{t("basispoints.intro")}</p>
    <label className="block space-y-1 text-sm">{t("basispoints.name")}
      <input className={inputClass} value={name} maxLength={100} onChange={e => setName(e.target.value)} autoComplete="off" />
    </label>
    <label className="block space-y-1 text-sm">{t("basispoints.proxy")}
      <input className={inputClass} value={proxyURL} disabled={!!session} onChange={e => setProxyURL(e.target.value)} autoComplete="off" />
    </label>
    <button type="button" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={busy} onClick={() => void start()}>
      {t(busy ? "basispoints.wait" : session ? "basispoints.restart" : "basispoints.start")}
    </button>
    {session && <>
      <p className="text-sm"><a className="text-primary underline" href={session.auth_url} target="_blank" rel="noreferrer">{t("basispoints.openSignIn")}</a></p>
      <p className="text-sm text-muted-foreground">{t("basispoints.helperHint")}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => void copyScript(false)}>{t("basispoints.copyConsole")}</button>
        <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => void copyScript(true)}>{t("basispoints.copyBookmark")}</button>
        {copied && <span role="status" className="text-sm">{t("common.copied")}</span>}
      </div>
      <p className="text-sm text-muted-foreground">{t("basispoints.bookmarkHint")}</p>
      <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer">{t("basispoints.viewScript")}</summary>
        <textarea className={inputClass} value={recoveryScript} readOnly rows={5} spellCheck={false} />
      </details>
      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer">{t("basispoints.networkFallback")}</summary>
        <p>{t("basispoints.networkHint")}</p>
      </details>
      <p className="text-sm text-muted-foreground">{t("basispoints.expiry")}</p>
      <label className="block space-y-1 text-sm">{t("basispoints.callback")}
        <input type="password" className={inputClass} value={callbackURL} onChange={e => setCallbackURL(e.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      <button type="button" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={busy || !callbackURL.trim()} onClick={() => void complete()}>{t("basispoints.add")}</button>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
