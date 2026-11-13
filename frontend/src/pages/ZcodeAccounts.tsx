import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import type { AccountRow } from "../types";
import { ZcodeAddForm } from "../components/ZcodeAddForm";
import { ZcodeClaimDialog } from "../components/ZcodeClaimDialog";
import ClaudeConnectionTestModal from "../components/ClaudeConnectionTestModal";
import Modal from "../components/Modal";
import ChannelLogo from "../components/ChannelLogo";
import { Button } from "../components/ui/button";
import { useConfirmDialog } from "../hooks/useConfirmDialog";

export default function ZcodeAccounts({ headerSlot }: { headerSlot?: ReactNode }) {
  const { t } = useTranslation();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [claim, setClaim] = useState<AccountRow | null>(null);
  const [test, setTest] = useState<AccountRow | null>(null);
  const reload = useCallback(async () => {
    try { const result = await api.getAccounts({ channel: "zcode" }); setAccounts(result.accounts ?? []); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : t("common.error")); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { void reload(); }, [reload]);
  async function remove(account: AccountRow) {
    if (!await confirm({ title: t("accounts.deleteAccount"), description: account.name || `#${account.id}` })) return;
    try { await api.deleteAccount(account.id); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : t("common.error")); }
  }
  return <div className="space-y-4">
    {headerSlot}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="flex items-center gap-2 text-xl font-semibold"><ChannelLogo channel="zcode" size={28} />Zcode</h1>
      <div className="flex gap-2"><Button variant="outline" onClick={() => void reload()}>{t("common.refresh")}</Button><Button onClick={() => setAddOpen(true)}>{t("zcode.add")}</Button></div>
    </div>
    <p className="text-sm text-muted-foreground">{t("zcode.providerHint")}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading ? <p>{t("common.loading")}</p> : accounts.length === 0 ? <p className="rounded-lg border p-6 text-muted-foreground">{t("zcode.noAccounts")}</p> : <div className="space-y-3">{accounts.map(account => <div key={account.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
      <div className="min-w-0 space-y-1"><h2 className="font-medium">{account.name || `#${account.id}`}</h2><p className="text-sm text-muted-foreground">{account.plan_type || "Zcode"} · {account.status}</p><p className="break-all text-xs text-muted-foreground">{(account.models ?? []).join(", ") || t("zcode.noModelAccess")}</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setClaim(account)}>{t("zcode.claimPlans")}</Button><Button variant="outline" onClick={() => setTest(account)}>{t("accounts.testConnection")}</Button><Button variant="ghost" onClick={() => void remove(account)}>{t("accounts.deleteAccount")}</Button></div>
    </div>)}</div>}
    {addOpen && <Modal show title={t("zcode.add")} onClose={() => setAddOpen(false)}><ZcodeAddForm onAdded={() => { setAddOpen(false); void reload(); }} /></Modal>}
    {claim && <ZcodeClaimDialog id={claim.id} name={claim.name || `#${claim.id}`} onClose={() => setClaim(null)} onChanged={reload} />}
    {test && <ClaudeConnectionTestModal account={test} onClose={() => setTest(null)} onSettled={() => void reload()} />}
    {confirmDialog}
  </div>;
}
