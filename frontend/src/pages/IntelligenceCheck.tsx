import uiI18n from "../i18n";
import { useTranslation as useUILanguage } from "react-i18next";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { api } from "../api";
import PageHeader from "../components/PageHeader";
import AccountIntelligenceHistoryDialog from "../components/AccountIntelligenceHistoryDialog";
import IntelligenceRunDialog from "../components/IntelligenceRunDialog";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { Select } from "../components/ui/select";
import { useToast } from "../hooks/useToast";
import { getErrorMessage } from "../utils/error";
import { refreshIntelligenceBars } from "../hooks/useIntelligenceBars";
import {
  intelligenceTargetConflict,
  type IntelligenceTargetConflict,
  type IntelligenceQuestion,
  type IntelligenceSettings,
} from "../lib/intelligenceCheck";

const fieldClass =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
// 非 HTTPS 的 HTTP 站点不是安全上下文，crypto.randomUUID 可能不存在，
// 退回用 crypto.getRandomValues 生成 UUID v4。
function createQuestionId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const field = (label: string, child: ReactNode, hint?: string) => (
  <label className="flex flex-col gap-2 text-sm">
    <span className="font-medium">{label}</span>
    {child}
    {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
  </label>
);
const options = (values: Record<string, string>) =>
  Object.entries(values).map(([value, label]) => ({ value, label }));

export default function IntelligenceCheck() {
  useUILanguage();
  const [params, setParams] = useSearchParams();
  const accountID = Number(params.get("account_id")) || undefined;
  const runID = Number(params.get("run")) || null;
  const [settings, setSettings] = useState<IntelligenceSettings | null>(null);
  const [saved, setSaved] = useState<IntelligenceSettings | null>(null);
  const [groups, setGroups] = useState<
    { id: number; name: string; channel?: string }[]
  >([]);
  const [targetConflict, setTargetConflict] = useState<IntelligenceTargetConflict | null>(null);
  const conflictPanel = useRef<HTMLDivElement>(null);
  const [configError, setConfigError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<string | null>(null);
  const { showToast } = useToast();
  const dirty =
    !!settings && JSON.stringify(settings) !== JSON.stringify(saved);

  useEffect(() => {
    if (targetConflict) conflictPanel.current?.scrollIntoView({ block: "center" });
  }, [targetConflict]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      api.getIntelligenceSettings(controller.signal),
      api.listAccountGroups(),
    ])
      .then(([config, result]) => {
        if (controller.signal.aborted) return;
        setSettings(config);
        setSaved(config);
        setGroups(result.groups ?? []);
        setConfigError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setConfigError(getErrorMessage(e));
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const change = <K extends keyof IntelligenceSettings>(
    key: K,
    value: IntelligenceSettings[K],
  ) => {
    if (key === "action" || key === "target_group_id") setTargetConflict(null);
    setSettings((s) => (s ? { ...s, [key]: value } : s));
  };
  const mutate = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await fn();
      showToast(message);
    } catch (e) {
      const conflict = intelligenceTargetConflict(e);
      if (conflict) setTargetConflict(conflict);
      showToast(
        conflict
          ? uiI18n.t("uiExtra.intelligenceCheck.valueAccountsHaveIncompatibleCheckChannelsResolve", { value0: (conflict.conflict_count) })
          : getErrorMessage(e),
        "error",
      );
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    mutate(async () => {
      if (!settings) return;
      const next = await api.saveIntelligenceSettings(settings);
      setSettings(next);
      setSaved(next);
      setTargetConflict(null);
    }, uiI18n.t("uiExtra.intelligenceCheck.checkSettingsAndQuestionBankSaved"));
  const disableConflicts = () =>
    mutate(async () => {
      if (!targetConflict) return;
      await api.setIntelligenceAccounts(
        targetConflict.conflicts.map(a => a.account_id), false,
      );
      refreshIntelligenceBars();
      setTargetConflict(null);
    }, uiI18n.t("uiExtra.intelligenceCheck.automaticChecksDisabledForTheListedAccounts"));
  const question = settings?.questions.find((q) => q.id === editor);
  const editQuestion = (patch: Partial<IntelligenceQuestion>) => {
    if (settings)
      change(
        "questions",
        settings.questions.map((q) =>
          q.id === editor ? { ...q, ...patch } : q,
        ),
      );
  };
  const reorder = (index: number, direction: number) => {
    if (!settings) return;
    const questions = [...settings.questions];
    [questions[index], questions[index + direction]] = [
      questions[index + direction],
      questions[index],
    ];
    change("questions", questions);
  };
  const numeric = (
    key:
      | "pause_initial_seconds"
      | "pause_max_seconds"
      | "recovery_initial_seconds"
      | "recovery_min_seconds"
      | "interval_seconds"
      | "retry_seconds"
      | "timeout_seconds"
      | "concurrency"
      | "retention"
      | "degrade_threshold"
      | "recover_threshold",
    label: string,
    min: number,
    max: number,
  ) =>
    field(
      label,
      <Input
        type="number"
        min={min}
        max={max}
        value={settings?.[key] ?? ""}
        onChange={(e) => change(key, Number(e.target.value))}
      />,
    );
  return (
    <>
      <PageHeader
        title={uiI18n.t("uiExtra.intelligenceCheck.intelligenceChecks")}
        description={uiI18n.t("uiExtra.intelligenceCheck.testEachAccountWithSavedQuestionsRecord")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {dirty && (
              <span className="text-xs text-muted-foreground">{uiI18n.t("uiExtra.intelligenceCheck.unsavedChanges")}</span>
            )}
            <Button
              onClick={() => void save()}
              disabled={!settings || busy || !dirty}
            >
              <Save className="size-4" />{uiI18n.t("uiExtra.intelligenceCheck.saveSettings")}</Button>
          </div>
        }
      />
      {configError && (
        <p role="alert" className="mb-4 text-sm text-destructive">{uiI18n.t("uiExtra.intelligenceCheck.unableToLoadSettings")}{configError}{uiI18n.t("uiExtra.intelligenceCheck.refreshThePageToTryAgain")}</p>
      )}
      {settings && <div className="grid items-start gap-6 xl:grid-cols-2">
        <section aria-labelledby="intelligence-settings-title" className="min-w-0 space-y-4">
          <h2 id="intelligence-settings-title" className="text-lg font-semibold">{uiI18n.t("uiExtra.intelligenceCheck.checkSettings")}</h2>
          <p className="text-xs text-muted-foreground">{uiI18n.t("uiExtra.intelligenceCheck.checksUseTheAccountSAssignedProxy")}</p>
          <Card>
            <CardHeader className="pb-0">
              <CardTitle>{uiI18n.t("uiExtra.intelligenceCheck.modelsAndEvaluation")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              {field(
                uiI18n.t("uiExtra.intelligenceCheck.enableAutomaticChecks"),
                <Switch
                  aria-label={uiI18n.t("uiExtra.intelligenceCheck.enableAutomaticChecks")}
                  checked={settings.enabled}
                  onCheckedChange={(v) => change("enabled", v)}
                />,
                uiI18n.t("uiExtra.intelligenceCheck.takesEffectAfterSavingManualChecksRemain"),
              )}
              <div className="col-span-full space-y-3 rounded-lg border p-4">
                <h3 className="text-sm font-medium">{uiI18n.t("uiExtra.intelligenceCheck.sourcesForAutomaticChecks")}</h3>
                <p className="text-xs text-muted-foreground">{uiI18n.t("uiExtra.intelligenceCheck.controlEachAccountSourceIndependentlyOfIts")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    ["codex", "GPT / Codex"],
                    ["claude", "Claude"],
                    ["grok", "Grok"],
                    ["antigravity", "Antigravity"],
                  ] as const).map(([channel, label]) => (
                    <label key={channel} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
                      <span>{label}</span>
                      <Switch aria-label={uiI18n.t("uiExtra.intelligenceCheck.valueAutomaticIntelligenceChecks", { value0: (label) })}
                        checked={settings.channels?.[channel] ?? (channel === "codex" || channel === "claude")}
                        onCheckedChange={(value) => change("channels", {
                          codex: settings.channels?.codex ?? true,
                          claude: settings.channels?.claude ?? true,
                          grok: settings.channels?.grok ?? false,
                          antigravity: settings.channels?.antigravity ?? false,
                          [channel]: value,
                        })} />
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{uiI18n.t("uiExtra.intelligenceCheck.claudeModelsFromAntigravityStillBelongTo")}</p>
              </div>
              {field(uiI18n.t("uiExtra.intelligenceCheck.grokCheckModel"), <Input value={settings.grok_model ?? "grok-4.5"} onChange={(e) => change("grok_model", e.target.value)} />)}
              {field(uiI18n.t("uiExtra.intelligenceCheck.antigravityCheckModel"), <Input value={settings.antigravity_model ?? "gemini-3.8-flash-medium"} onChange={(e) => change("antigravity_model", e.target.value)} />)}
              {field(
                uiI18n.t("uiExtra.intelligenceCheck.gPTCodexModel"),
                <Input
                  value={settings.gpt_model}
                  onChange={(e) => change("gpt_model", e.target.value)}
                />,
              )}
              {field(
                uiI18n.t("uiExtra.intelligenceCheck.claudeModel"),
                <Input
                  value={settings.claude_model}
                  onChange={(e) => change("claude_model", e.target.value)}
                />,
              )}
              {field(
                uiI18n.t("uiExtra.intelligenceCheck.gPTReasoningEffort"),
                <Select
                  value={settings.reasoning_effort}
                  onValueChange={(v) => change("reasoning_effort", v)}
                  options={options({
                    "": uiI18n.t("uiExtra.intelligenceCheck.modelDefault"),
                    none: "none",
                    minimal: "minimal",
                    low: "low",
                    medium: "medium",
                    high: "high",
                    xhigh: "xhigh",
                    max: "max",
                    ultra: "ultra",
                  })}
                />,
              )}
              {field(
                uiI18n.t("uiExtra.intelligenceCheck.evaluationMethod"),
                <Select
                  value={settings.judge_mode}
                  onValueChange={(v) =>
                    change(
                      "judge_mode",
                      v as IntelligenceSettings["judge_mode"],
                    )
                  }
                  options={options({
                    answer: uiI18n.t("uiExtra.intelligenceCheck.answerOnly"),
                    latency: uiI18n.t("uiExtra.intelligenceCheck.timingOnly"),
                    both: uiI18n.t("uiExtra.intelligenceCheck.bothAnswerAndTiming"),
                  })}
                />,
                uiI18n.t("uiExtra.intelligenceCheck.onlyCompleteSuccessfulResponsesAreEvaluatedDuration"),
              )}
              {field(
                uiI18n.t("uiExtra.intelligenceCheck.checkNewAccountsByDefault"),
                <Switch
                  checked={settings.new_accounts_enabled}
                  onCheckedChange={(v) => change("new_accounts_enabled", v)}
                />,
                uiI18n.t("uiExtra.intelligenceCheck.appliesOnlyToNewAccountsFromEnabled"),
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-0">
              <CardTitle>{uiI18n.t("uiExtra.intelligenceCheck.frequencyAndResources")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              {numeric("interval_seconds", uiI18n.t("uiExtra.intelligenceCheck.normalIntervalSeconds"), 1, 86400)}
              {numeric("retry_seconds", uiI18n.t("uiExtra.intelligenceCheck.failureRetryIntervalSeconds"), 1, 86400)}
              {numeric("timeout_seconds", uiI18n.t("uiExtra.intelligenceCheck.requestTimeoutSeconds"), 1, 3600)}
              {numeric("concurrency", uiI18n.t("uiExtra.intelligenceCheck.globalCheckConcurrency"), 1, 100)}
              {numeric("retention", uiI18n.t("uiExtra.intelligenceCheck.recordsRetainedPerAccount"), 1, 10000)}
              <div className="sm:col-span-2">
                {field(uiI18n.t("uiExtra.intelligenceCheck.adaptiveChecks"), <Switch aria-label={uiI18n.t("uiExtra.intelligenceCheck.adaptiveChecks")} checked={settings.adaptive_enabled ?? false} onCheckedChange={v => change("adaptive_enabled", v)} />,
                  uiI18n.t("uiExtra.intelligenceCheck.afterAPauseUnsuccessfulChecksDoubleThe"))}
              </div>
              {settings.adaptive_enabled && <>
                {numeric("pause_initial_seconds", uiI18n.t("uiExtra.intelligenceCheck.initialPauseIntervalSeconds"), 1, 2592000)}
                {numeric("pause_max_seconds", uiI18n.t("uiExtra.intelligenceCheck.maximumPauseIntervalSeconds"), 1, 2592000)}
                {numeric("recovery_initial_seconds", uiI18n.t("uiExtra.intelligenceCheck.initialRecoveryIntervalSeconds"), 1, 2592000)}
                {numeric("recovery_min_seconds", uiI18n.t("uiExtra.intelligenceCheck.minimumRecoveryIntervalSeconds"), 1, 2592000)}
                <p className="text-xs text-muted-foreground sm:col-span-2">{uiI18n.t("uiExtra.intelligenceCheck.recoveryIntervalsHalveAfterEachSuccessUntil")}</p>
              </>}

            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-0">
              <CardTitle>{uiI18n.t("uiExtra.intelligenceCheck.automaticActions")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-5 sm:grid-cols-2">
                {field(
                  uiI18n.t("uiExtra.intelligenceCheck.whenTheFailureThresholdIsReached"),
                  <Select
                    value={settings.action}
                    onValueChange={(v) =>
                      change("action", v as IntelligenceSettings["action"])
                    }
                    options={options({
                      none: uiI18n.t("uiExtra.intelligenceCheck.noAutomaticAction"),
                      pause: uiI18n.t("uiExtra.intelligenceCheck.pauseRequestScheduling"),
                      switch_group: uiI18n.t("uiExtra.intelligenceCheck.switchGroups"),
                    })}
                  />,
                )}
                {numeric("degrade_threshold", uiI18n.t("uiExtra.intelligenceCheck.consecutiveFailures"), 1, 1000)}
                {numeric("recover_threshold", uiI18n.t("uiExtra.intelligenceCheck.consecutiveRecoveryChecks"), 1, 1000)}
                {settings.action === "switch_group" &&
                  field(
                    uiI18n.t("uiExtra.intelligenceCheck.targetGroup"),
                    <Select
                      value={String(settings.target_group_id || "")}
                      onValueChange={(v) =>
                        change("target_group_id", Number(v))
                      }
                      placeholder={uiI18n.t("uiExtra.intelligenceCheck.selectAGroup")}
                      options={groups
                        .filter(g => !g.channel || ["codex", "claude", "grok", "antigravity"].includes(g.channel))
                        .map(g => ({
                          value: String(g.id),
                          label: `${g.name}（${({ codex: "Codex", claude: "Claude", grok: "Grok", antigravity: "Antigravity" } as Record<string, string>)[g.channel ?? "codex"] ?? g.channel}）`,
                        }))}
                    />,
                  )}
              </div>
              {targetConflict && (
                <div
                  ref={conflictPanel}
                  role="alert"
                  className="space-y-3 rounded-md border border-destructive/40 p-3 text-sm"
                >
                  <p className="font-medium">{uiI18n.t("uiExtra.intelligenceCheck.thereAre")}{targetConflict.conflict_count}{" "}{uiI18n.t("uiExtra.intelligenceCheck.accountsWhoseCheckChannelsAreIncompatibleWith")}</p>
                  <p className="text-muted-foreground">{uiI18n.t("uiExtra.intelligenceCheck.targetGroup105")}{groups.find(
                      (g) => g.id === targetConflict.target_group_id,
                    )?.name || `#${targetConflict.target_group_id}`}
                    （{targetConflict.target_group_channel}{uiI18n.t("uiExtra.intelligenceCheck.disableAutomaticChecksForTheAccountsBelow")}</p>
                  <ul className="max-h-60 space-y-2 overflow-y-auto">
                    {targetConflict.conflicts.map((account) => (
                      <li
                        key={account.account_id}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <span className="min-w-0 break-all">
                          #{account.account_id} ·{" "}
                          {account.account_name || "未命名账号"} ·{" "}
                          {account.channel}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            const next = new URLSearchParams(params);
                            next.delete("run");
                            next.set(
                              "account_id",
                              String(account.account_id),
                            );
                            setParams(next);
                          }}
                        >{uiI18n.t("uiExtra.intelligenceCheck.viewAccountChecks")}</Button>
                      </li>
                    ))}
                  </ul>
                  {targetConflict.conflict_count >
                    targetConflict.conflicts.length && (
                    <p className="text-muted-foreground">{uiI18n.t("uiExtra.intelligenceCheck.showingTheFirst")}{targetConflict.conflicts.length}{" "}{uiI18n.t("uiExtra.intelligenceCheck.accountsResolveTheseConflictsAndSaveAgain")}</p>
                  )}
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void disableConflicts()}
                  >{uiI18n.t("uiExtra.intelligenceCheck.disableAutomaticChecksForThese")}{targetConflict.conflicts.length}{" "}{uiI18n.t("uiExtra.intelligenceCheck.accounts")}</Button>
                  <p className="text-xs text-muted-foreground">{uiI18n.t("uiExtra.intelligenceCheck.onlyAutomaticChecksAreDisabledRequestScheduling")}</p>
                </div>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">{uiI18n.t("uiExtra.intelligenceCheck.upstreamErrorsDoNotCountAsIntelligence")}</p>
            </CardContent>
          </Card>
        </section>
        <section aria-labelledby="intelligence-questions-title" className="min-w-0 space-y-4">
          <h2 id="intelligence-questions-title" className="text-lg font-semibold">{uiI18n.t("uiExtra.intelligenceCheck.questionBank")}</h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{uiI18n.t("uiExtra.intelligenceCheck.enabledQuestionsRotateInOrderOneQuestion")}</p>
            <Button
              variant="outline"
              onClick={() => {
                const id = createQuestionId();
                change("questions", [
                  ...settings.questions,
                  {
                    id,
                    name: uiI18n.t("uiExtra.intelligenceCheck.newQuestion"),
                    prompt: "",
                    expected_answer: "",
                    match_mode: "exact",
                    max_duration_ms: 20000,
                    enabled: false,
                  },
                ]);
                setEditor(id);
              }}
            >
              <Plus className="size-4" />{uiI18n.t("uiExtra.intelligenceCheck.addQuestion")}</Button>
          </div>
          {settings.questions.map((q, index) => (
            <Card key={q.id}>
              <CardContent className="flex flex-wrap items-center gap-3 py-4">
                <Switch
                  aria-label={uiI18n.t("uiExtra.intelligenceCheck.enableValue", { value0: (q.name) })}
                  checked={q.enabled}
                  onCheckedChange={(enabled) =>
                    change(
                      "questions",
                      settings.questions.map((item) =>
                        item.id === q.id ? { ...item, enabled } : item,
                      ),
                    )
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{q.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {q.match_mode} · {q.max_duration_ms}{uiI18n.t("uiExtra.intelligenceCheck.msExpected")}{" "}
                    {q.expected_answer.slice(0, 60)}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={uiI18n.t("uiExtra.intelligenceCheck.moveValueUp", { value0: (q.name) })}
                    disabled={index === 0}
                    onClick={() => reorder(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={uiI18n.t("uiExtra.intelligenceCheck.moveValueDown", { value0: (q.name) })}
                    disabled={index === settings.questions.length - 1}
                    onClick={() => reorder(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditor(editor === q.id ? null : q.id)}
                  >{uiI18n.t("uiExtra.intelligenceCheck.edit")}</Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={uiI18n.t("uiExtra.intelligenceCheck.deleteValue", { value0: (q.name) })}
                    onClick={() => {
                      change(
                        "questions",
                        settings.questions.filter((item) => item.id !== q.id),
                      );
                      if (editor === q.id) setEditor(null);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {question?.id === q.id && (
                  <div className="grid w-full gap-4 border-t pt-4 sm:grid-cols-2">
                    {field(
                      uiI18n.t("uiExtra.intelligenceCheck.questionName"),
                      <Input
                        value={question.name}
                        onChange={(e) => editQuestion({ name: e.target.value })}
                      />,
                    )}
                    {field(
                      uiI18n.t("uiExtra.intelligenceCheck.matchingMethod"),
                      <Select
                        value={question.match_mode}
                        onValueChange={(v) =>
                          editQuestion({
                            match_mode: v as IntelligenceQuestion["match_mode"],
                          })
                        }
                        options={options({
                          exact: uiI18n.t("uiExtra.intelligenceCheck.exactAnswer"),
                          contains: uiI18n.t("uiExtra.intelligenceCheck.contains"),
                          regex: uiI18n.t("uiExtra.intelligenceCheck.regularExpressionRE2"),
                        })}
                      />,
                    )}
                    <div className="sm:col-span-2">
                      {field(
                        uiI18n.t("uiExtra.intelligenceCheck.questionText"),
                        <textarea
                          rows={7}
                          className={fieldClass}
                          value={question.prompt}
                          onChange={(e) =>
                            editQuestion({ prompt: e.target.value })
                          }
                        />,
                      )}
                    </div>
                    {field(
                      uiI18n.t("uiExtra.intelligenceCheck.expectedAnswerRegularExpression"),
                      <Input
                        value={question.expected_answer}
                        onChange={(e) =>
                          editQuestion({ expected_answer: e.target.value })
                        }
                      />,
                    )}
                    {field(
                      uiI18n.t("uiExtra.intelligenceCheck.durationThresholdMilliseconds"),
                      <Input
                        type="number"
                        min={1}
                        value={question.max_duration_ms}
                        onChange={(e) =>
                          editQuestion({
                            max_duration_ms: Number(e.target.value),
                          })
                        }
                      />,
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {!settings.questions.length && (
            <p className="py-12 text-center text-muted-foreground">{uiI18n.t("uiExtra.intelligenceCheck.noQuestionsYetAddAndEnableAt")}</p>
          )}
        </section>
      </div>}
      <AccountIntelligenceHistoryDialog accountID={runID ? null : accountID ?? null} onClose={() => { const next = new URLSearchParams(params); next.delete("account_id"); setParams(next); }} />
      <IntelligenceRunDialog
        id={runID}
        onClose={() => {
          const next = new URLSearchParams(params);
          next.delete("run");
          setParams(next);
        }}
      />
    </>
  );
}