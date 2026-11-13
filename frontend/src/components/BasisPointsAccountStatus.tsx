import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import type { AccountRow } from "../types";
import { api } from "../api";
import { Button } from "./ui/button";
import { BasisPointsIcon } from "./BasisPointsIcon";

export function BasisPointsAccountStatus({ account }: { account: AccountRow }) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState({ plan_type: account.plan_type || "", models: account.models ?? [], checked_at: account.basispoints_access_checked_at || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const date = (value: string) => new Intl.DateTimeFormat(i18n.resolvedLanguage || "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  async function refresh() {
    setBusy(true); setError("");
    try { setState(await api.refreshBasisPointsAccess(account.id)); }
    catch (e) { setError(e instanceof Error ? e.message : t("basispoints.accessRefreshFailed")); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border bg-muted/15 p-4">
    <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><BasisPointsIcon className="size-4 text-primary" />{t("basispoints.accountStatus")}</h3><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void refresh()}><RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />{t("common.refresh")}</Button></div>
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div><dt className="text-muted-foreground">{t("basispoints.plan")}</dt><dd className="mt-1 font-medium capitalize">{state.plan_type || t("basispoints.unknown")}</dd></div>
      <div><dt className="text-muted-foreground">{t("basispoints.access")}</dt><dd className="mt-1 font-medium">{t(state.checked_at ? "basispoints.confirmed" : "basispoints.unknown")}</dd></div>
      <div><dt className="text-muted-foreground">{t("basispoints.subscriptionExpiry")}</dt><dd className="mt-1">{account.subscription_expires_at ? date(account.subscription_expires_at) : t("basispoints.notProvided")}</dd></div>
      <div><dt className="text-muted-foreground">{t("basispoints.checked")}</dt><dd className="mt-1">{state.checked_at ? date(state.checked_at) : t("basispoints.unknown")}</dd></div>
    </dl>
    <p className="text-xs text-muted-foreground">{t("basispoints.modelAccess", { count: state.models.length })}</p>
    <p className="text-xs text-muted-foreground">{t("basispoints.billingLimit")}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
