import uiI18n from "../i18n";
import { useTranslation as useUILanguage } from "react-i18next";
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { refreshIntelligenceBars } from '../hooks/useIntelligenceBars'
import { intelligenceColor, intelligenceLabels, intelligenceScheduleLabel, type IntelligenceBar, type IntelligenceRun, type IntelligencePage } from '../lib/intelligenceCheck'
import { getErrorMessage } from '../utils/error'
import { Button } from './ui/button'
import { Switch } from './ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'

function verdict(run: IntelligenceRun) {
  if (run.status === 'queued' || run.status === 'running') return intelligenceLabels[run.status]
  if (run.status === 'error') return uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.requestFailedAnswerAndTimingWereNot")
  if (run.status === 'interrupted') return uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.checkInterruptedResultNotEvaluated")
  const checks = []
  if (run.judge_mode !== 'latency') checks.push(run.answer_passed ? uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.answerMatches") : uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.answerDoesNotMatch"))
  if (run.judge_mode !== 'answer') checks.push(run.latency_passed ? uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.withinTimeLimit") : uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.timeLimitExceeded"))
  return checks.join('；')
}

export default function AccountIntelligenceHistoryDialog({ accountID, accountName, onClose }: {
  accountID: number | null
  accountName?: string
  onClose: () => void
}) {
  useUILanguage();
  const [page, setPage] = useState(1)
  const [data, setData] = useState<IntelligencePage<IntelligenceRun> | null>(null)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [schedule, setSchedule] = useState<IntelligenceBar | null>(null)
  const [saving, setSaving] = useState(false)
  const changing = useRef(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => { setPage(1); setEnabled(null); setSchedule(null) }, [accountID])
  useEffect(() => {
    setData(null)
    setError('')
    if (!accountID) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      if (document.hidden) { timer = setTimeout(load, 4000); return }
      try {
        const [runs, bars] = await Promise.all([
          api.getIntelligenceRuns(page, { account_id: accountID }, controller.signal),
          api.getIntelligenceBars([accountID], controller.signal),
        ])
        if (controller.signal.aborted) return
        setData(runs)
        setSchedule(bars.bars[String(accountID)] ?? null)
        if (!changing.current) setEnabled(bars.bars[String(accountID)]?.enabled ?? false)
        setError('')
      } catch (e) {
        if (!controller.signal.aborted) setError(getErrorMessage(e))
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 4000)
      }
    }
    void load()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [accountID, page, refresh])
  const toggle = async (value: boolean) => {
    if (!accountID) return
    changing.current = true
    setSaving(true)
    try {
      await api.setIntelligenceAccounts([accountID], value)
      setEnabled(value)
      setError('')
      refreshIntelligenceBars()
    } catch (e) { setError(getErrorMessage(e)) }
    finally { changing.current = false; setSaving(false) }
  }
  return <Dialog open={!!accountID} onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle className="break-all pr-6">{uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.intelligenceCheckHistory")}{accountName || data?.items[0]?.account_name || `#${accountID}`}</DialogTitle>
        <DialogDescription>{uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.newestRecordsFirstRequestErrorsAreExcluded")}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4 text-sm">
        <label className="flex items-center gap-2">{uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.automaticChecksForThisAccount")}<Switch aria-label={uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.automaticChecksForThisAccount")} checked={enabled ?? false} disabled={enabled === null || saving} onCheckedChange={v => void toggle(v)} />
        </label>
        <Button variant="outline" size="sm" onClick={() => setRefresh(n => n + 1)}>{uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.refreshHistory")}</Button>
      </div>
      {schedule && <p className="text-sm text-muted-foreground">{intelligenceScheduleLabel(schedule)}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!data && !error && <p className="py-8 text-center text-sm text-muted-foreground">{uiI18n.t("uiExtra.intelligenceRunDialog.loading")}</p>}
      {data?.items.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.noCheckHistoryUseCheckNowAbove")}</p>}
      <div className="min-w-0 space-y-4">
        {data?.items.slice().sort((a, b) => b.id - a.id).map(run => <article key={run.id} className="min-w-0 space-y-3 rounded-lg border bg-card p-4 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-medium"><span className="size-2 rounded-full bg-muted" style={{ backgroundColor: intelligenceColor(run.status) }} />{intelligenceLabels[run.status]}</span>
            <span className="text-xs text-muted-foreground">{run.source === 'manual' ? uiI18n.t("uiExtra.intelligenceRunDialog.manual") : uiI18n.t("uiExtra.intelligenceRunDialog.automatic")}</span>
            <time className="text-xs text-muted-foreground">{new Date(run.created_at || 0).toLocaleString()}</time>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">#{run.id}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="break-all">{uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.question")}{run.question.name}</span><span className="break-all">{uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.model")}{run.model}{run.reasoning_effort ? ` · ${run.reasoning_effort}` : ''}</span>
            <span>{uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.duration")}{((run.duration_ms ?? 0) / 1000).toFixed(2)}{uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.secondsThreshold")}{(run.question.max_duration_ms / 1000).toFixed(2)}{uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.seconds")}</span>
          </div>
          <p className="break-words">{uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.evaluationReason")}{verdict(run)}</p>
          <p className="break-words">{uiI18n.t("uiExtra.intelligenceRunDialog.expectedAnswer")}<code>{run.question.expected_answer}</code></p>
          <div><p className="mb-1 text-xs text-muted-foreground">{uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.actualOutput")}</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 font-sans text-sm [overflow-wrap:anywhere]">{run.output || '暂无输出'}</pre></div>
          {run.error && <div><p className="mb-1 text-xs text-muted-foreground">{uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.error")}</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 font-sans text-sm text-red-800 dark:text-red-400 [overflow-wrap:anywhere]">{run.error}</pre></div>}
          {run.action_message && <p className="break-words text-xs text-muted-foreground">{run.action_message}</p>}
        </article>)}
      </div>
      {data && <div className="flex items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
        <span>{uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.total")}{data.total}{uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.recordsPage")}{page}{uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.page")}</span>
        <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.previousPage")}</Button><Button size="sm" variant="outline" disabled={page * data.page_size >= data.total} onClick={() => setPage(p => p + 1)}>{uiI18n.t("uiExtra.accountIntelligenceHistoryDialog.nextPage")}</Button></div>
      </div>}
    </DialogContent>
  </Dialog>
}
