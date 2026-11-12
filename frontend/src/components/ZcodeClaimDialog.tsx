import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import Modal from "./Modal";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function ZcodeClaimDialog({ id, name, onClose, onChanged }: {
  id: number; name: string; onClose: () => void; onChanged: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [param, setParam] = useState("");
  const [region, setRegion] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.claimZcodePlans>> | null>(null);
  async function claim() {
    setBusy(true); setError(""); setResult(null);
    try {
      const report = await api.claimZcodePlans(id, { captcha_param: param, captcha_region: region });
      setResult(report); setParam("");
      await onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : t("zcode.claimFailed")); }
    finally { setBusy(false); }
  }
  return <Modal show title={`${t("zcode.claimPlans")} · ${name}`} onClose={() => { if (!busy) onClose(); }}
    footer={<Button disabled={busy} onClick={() => void claim()}>{t(busy ? "zcode.claiming" : "zcode.claimPlans")}</Button>}>
    <div className="space-y-4 text-sm">
      <p>{t("zcode.claimHint")}</p>
      <details className="space-y-3 rounded-lg border p-3">
        <summary className="cursor-pointer">{t("zcode.captchaOptions")}</summary>
        <p className="text-muted-foreground">{t("zcode.captchaHint")}</p>
        <label className="block space-y-1">{t("zcode.captchaParam")}<Input type="password" value={param} disabled={busy} maxLength={16384} autoComplete="off" onChange={e => setParam(e.target.value)} /></label>
        <label className="block space-y-1">{t("zcode.captchaRegion")}<Input value={region} disabled={busy} maxLength={64} autoComplete="off" onChange={e => setRegion(e.target.value)} /></label>
      </details>
      <div role="status" aria-live="polite">
        {result && (result.plans.length ? <ul className="space-y-2">{result.plans.map(p => <li key={p.plan_id}>
          <span className="font-medium">{p.name}</span>: {t(`zcode.claimStatus.${p.status}`)}
          {p.status === "failed" && <span className="text-muted-foreground"> ({p.http_status ? `HTTP ${p.http_status}` : t("zcode.connectionFailed")}{p.code ? `, ${p.code}` : ""})</span>}
        </li>)}</ul> : <p>{t("zcode.noOffers")}</p>)}
      </div>
      {result?.quota_error && <p role="alert">{t("zcode.quotaRefreshFailed")}: {result.quota_error}</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </div>
  </Modal>;
}
