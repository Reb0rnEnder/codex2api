import uiI18n from "../i18n";
import { useTranslation as useUILanguage } from "react-i18next";
import { useEffect, useState } from "react";
import { api } from "../api";
import {
  intelligenceLabels,
  type IntelligenceRun,
} from "../lib/intelligenceCheck";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { getErrorMessage } from "../utils/error";

export default function IntelligenceRunDialog({
  id,
  onClose,
}: {
  id: number | null;
  onClose: () => void;
}) {
  useUILanguage();
  const [run, setRun] = useState<IntelligenceRun | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setRun(null);
    setError("");
    if (!id) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof window.setTimeout> | undefined;
    const load = async () => {
      try {
        const { run } = await api.getIntelligenceRun(id, controller.signal);
        if (controller.signal.aborted) return;
        setRun(run);
        setError("");
        if (run.status === "queued" || run.status === "running")
          timer = window.setTimeout(() => {
            void load();
          }, 4000);
      } catch (e) {
        if (!controller.signal.aborted) setError(getErrorMessage(e));
      }
    };
    void load();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [id, retry]);
  return (
    <Dialog
      open={!!id}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{uiI18n.t("uiExtra.intelligenceRunDialog.checkDetails")}{id}</DialogTitle>
          <DialogDescription>{uiI18n.t("uiExtra.intelligenceRunDialog.savedQuestionEvaluationSettingsAndFinalVisible")}</DialogDescription>
        </DialogHeader>
        {error && (
          <div role="alert" className="text-destructive">
            {error}
            <Button variant="outline" onClick={() => setRetry((n) => n + 1)}>{uiI18n.t("uiExtra.channelMonitor.retry")}</Button>
          </div>
        )}
        {!run && !error && <p className="text-muted-foreground">{uiI18n.t("uiExtra.intelligenceRunDialog.loading")}</p>}
        {run && (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                [uiI18n.t("uiExtra.intelligenceRunDialog.account"), `${run.account_name} (#${run.account_id})`],
                [uiI18n.t("uiExtra.intelligenceRunDialog.result"), intelligenceLabels[run.status]],
                [uiI18n.t("uiExtra.intelligenceRunDialog.requestedModel"), run.model],
                [uiI18n.t("uiExtra.intelligenceRunDialog.responseModel"), run.response_model || "—"],
                [uiI18n.t("uiExtra.intelligenceRunDialog.reasoningEffort"), run.reasoning_effort || "默认"],
                [
                  uiI18n.t("uiExtra.intelligenceRunDialog.evaluationMethod"),
                  { answer: uiI18n.t("uiExtra.intelligenceCheck.answerOnly"), latency: uiI18n.t("uiExtra.intelligenceCheck.timingOnly"), both: uiI18n.t("uiExtra.intelligenceRunDialog.answerAndTiming") }[
                    run.judge_mode
                  ],
                ],
                [
                  uiI18n.t("uiExtra.intelligenceRunDialog.durationThreshold"),
                  `${run.duration_ms ?? 0} / ${run.question.max_duration_ms} ms`,
                ],
                [uiI18n.t("uiExtra.intelligenceRunDialog.configurationVersion"), String(run.config_revision)],
                [uiI18n.t("uiExtra.intelligenceRunDialog.triggeredBy"), run.source === "manual" ? uiI18n.t("uiExtra.intelligenceRunDialog.manual") : uiI18n.t("uiExtra.intelligenceRunDialog.automatic")],
                [
                  uiI18n.t("uiExtra.intelligenceRunDialog.inputOutputReasoningTokens"),
                  `${run.input_tokens} / ${run.output_tokens} / ${run.reasoning_tokens}`,
                ],
                [
                  uiI18n.t("uiExtra.intelligenceRunDialog.startTime"),
                  run.started_at
                    ? new Date(run.started_at).toLocaleString()
                    : uiI18n.t("uiExtra.intelligenceRunDialog.notStarted"),
                ],
                [uiI18n.t("uiExtra.intelligenceRunDialog.action"), intelligenceLabels[run.action] || run.action || "无"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-words">{value}</dd>
                </div>
              ))}
            </dl>
            <div>
              <h3 className="mb-1 font-medium">{run.question.name}</h3>
              <pre className="whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-3 font-sans">
                {run.question.prompt}
              </pre>
            </div>
            <p>{uiI18n.t("uiExtra.intelligenceRunDialog.expectedAnswer")}<code>{run.question.expected_answer}</code>{uiI18n.t("uiExtra.intelligenceRunDialog.matchingMethod")}{run.question.match_mode}
            </p>
            <div>
              <h3 className="mb-1 font-medium">{uiI18n.t("uiExtra.intelligenceRunDialog.finalAnswer")}</h3>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-3 font-sans">
                {run.output || "暂无答案"}
              </pre>
            </div>
            {run.action_message && (
              <p className="text-muted-foreground">{run.action_message}</p>
            )}
            {run.error && (
              <p
                role="alert"
                className="whitespace-pre-wrap break-words text-destructive"
              >
                {run.error}
              </p>
            )}
            {run.effective_context && (
              <details>
                <summary className="cursor-pointer text-muted-foreground">{uiI18n.t("uiExtra.intelligenceRunDialog.effectiveOutboundSettings")}</summary>
                <pre className="mt-2 whitespace-pre-wrap break-words text-xs">
                  {JSON.stringify(run.effective_context, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
