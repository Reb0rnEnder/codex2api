import uiI18n from "../i18n";
import { useTranslation as useUILanguage } from "react-i18next";
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { api } from '../api'
import { useConfirmDialog } from '../hooks/useConfirmDialog'
import { useToast } from '../hooks/useToast'
import type {
  APIKeyRow,
  PromptFilterNewAPIBinding,
  PromptFilterScope,
} from '../types'
import { getErrorMessage } from '../utils/error'
import { formatBeijingTime } from '../utils/time'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

type BindingForm = {
  apiKeyId: string
  platformCode: string
  platformName: string
  enabled: boolean
  requireSignedIdentity: boolean
  promptFilterScope: PromptFilterScope
}

const emptyBindingForm: BindingForm = {
  apiKeyId: '',
  platformCode: '',
  platformName: '',
  enabled: true,
  requireSignedIdentity: false,
  promptFilterScope: 'inherit',
}

function apiKeyLabel(apiKey: APIKeyRow): string {
  return `#${apiKey.id} ${apiKey.name || '未命名 Key'} · ${apiKey.key || '已脱敏'}`
}

function BindingSwitch({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-muted/20 p-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5" />
    </label>
  )
}

function BindingFormFields({
  form,
  setForm,
  apiKeys,
  editing,
}: {
  form: BindingForm
  setForm: (next: BindingForm) => void
  apiKeys: APIKeyRow[]
  editing: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-sm font-medium">Codex2API Key</span>
          <Select
            value={form.apiKeyId}
            disabled={editing}
            placeholder={uiI18n.t("uiExtra.promptFilterNewAPIBindings.selectTheCodex2APIKeyUsedForThis")}
            onValueChange={(apiKeyId) => setForm({ ...form, apiKeyId })}
            options={apiKeys.map((apiKey) => ({ value: String(apiKey.id), label: apiKeyLabel(apiKey) }))}
          />
          <span className="block text-xs leading-5 text-muted-foreground">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.eachKeyCanBindToOneCaller")}</span>
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.callerCode")}</span>
          <Input
            value={form.platformCode}
            placeholder={uiI18n.t("uiExtra.promptFilterNewAPIBindings.enterAUniqueIntegrationIdentifier")}
            maxLength={32}
            onChange={(event) => setForm({
              ...form,
              platformCode: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
            })}
          />
          <span className="block text-xs leading-5 text-muted-foreground">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.useLowercaseLettersNumbersUnderscoresAndHyphens")}</span>
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.callerName")}</span>
          <Input
            value={form.platformName}
            placeholder={uiI18n.t("uiExtra.promptFilterNewAPIBindings.enterARecognizableName")}
            maxLength={255}
            onChange={(event) => setForm({ ...form, platformName: event.target.value })}
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <BindingSwitch
          label={uiI18n.t("uiExtra.promptFilterNewAPIBindings.enableThisBinding")}
          description={uiI18n.t("uiExtra.promptFilterNewAPIBindings.whenDisabledThisKeyWillNotAccept")}
          checked={form.enabled}
          onCheckedChange={(enabled) => setForm({ ...form, enabled })}
        />
        <BindingSwitch
          label={uiI18n.t("uiExtra.promptFilterNewAPIBindings.requireSignedIdentity")}
          description={uiI18n.t("uiExtra.promptFilterNewAPIBindings.disabledByDefaultEnableOnlyAfterConfiguring")}
          checked={form.requireSignedIdentity}
          onCheckedChange={(requireSignedIdentity) => setForm({ ...form, requireSignedIdentity })}
        />
      </div>
      <label className="block space-y-1.5 rounded-lg border border-border/70 bg-muted/20 p-3">
        <span className="text-sm font-medium">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.promptCheckScopeForThisKey")}</span>
        <Select
          value={form.promptFilterScope}
          onValueChange={(promptFilterScope) => setForm({ ...form, promptFilterScope: promptFilterScope as PromptFilterScope })}
          options={[
            { value: 'inherit', label: uiI18n.t("uiExtra.promptFilterNewAPIBindings.inheritGlobalLocalChecksAndRemoteModel") },
            { value: 'local_only', label: uiI18n.t("uiExtra.promptFilterNewAPIBindings.localChecksOnlySkipRemoteModelReview") },
            { value: 'off', label: uiI18n.t("uiExtra.promptFilterNewAPIBindings.skipAllPromptChecks") },
          ]}
        />
        <span className="block text-xs leading-5 text-muted-foreground">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.localOnlyModeStillAppliesHighRisk")}</span>
      </label>
    </div>
  )
}

export default function PromptFilterNewAPIBindings() {
  useUILanguage();
  const [apiKeys, setAPIKeys] = useState<APIKeyRow[]>([])
  const [bindings, setBindings] = useState<PromptFilterNewAPIBinding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<BindingForm>(emptyBindingForm)
  const [editing, setEditing] = useState<PromptFilterNewAPIBinding | null>(null)
  const [editForm, setEditForm] = useState<BindingForm>(emptyBindingForm)
  const [rotating, setRotating] = useState<PromptFilterNewAPIBinding | null>(null)
  const [graceSeconds, setGraceSeconds] = useState('300')
  const [saving, setSaving] = useState(false)
  const [secretReveal, setSecretReveal] = useState<{ platformName: string; secret: string } | null>(null)
  const [secretCopied, setSecretCopied] = useState(false)
  const [secretCloseConfirmOpen, setSecretCloseConfirmOpen] = useState(false)
  const { showToast } = useToast()
  const { confirm, confirmDialog } = useConfirmDialog()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [keyResult, bindingResult] = await Promise.all([
        api.getAPIKeys({ view: 'lite' }),
        api.getPromptFilterNewAPIBindings(),
      ])
      setAPIKeys(keyResult.keys ?? [])
      setBindings(bindingResult.bindings ?? [])
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const boundKeyIDs = useMemo(() => new Set(bindings.map((binding) => binding.api_key_id)), [bindings])
  const availableAPIKeys = useMemo(
    () => apiKeys.filter((apiKey) => !boundKeyIDs.has(apiKey.id)),
    [apiKeys, boundKeyIDs],
  )
  const apiKeyByID = useMemo(() => new Map(apiKeys.map((apiKey) => [apiKey.id, apiKey])), [apiKeys])

  const openCreate = () => {
    const firstAvailable = availableAPIKeys[0]
    setCreateForm({ ...emptyBindingForm, apiKeyId: firstAvailable ? String(firstAvailable.id) : '' })
    setCreateOpen(true)
  }

  const openEdit = (binding: PromptFilterNewAPIBinding) => {
    setEditForm({
      apiKeyId: String(binding.api_key_id),
      platformCode: binding.platform_code,
      platformName: binding.platform_name,
      enabled: binding.enabled,
      requireSignedIdentity: binding.require_signed_identity,
      promptFilterScope: binding.prompt_filter_scope || 'inherit',
    })
    setEditing(binding)
  }

  const revealSecret = (platformName: string, secret?: string) => {
    if (!secret) {
      showToast(uiI18n.t("uiExtra.promptFilterNewAPIBindings.theOperationSucceededButTheServerDid"), 'error')
      return
    }
    setSecretCopied(false)
    setSecretReveal({ platformName, secret })
  }

  const createBinding = async () => {
    const apiKeyId = Number(createForm.apiKeyId)
    if (!Number.isInteger(apiKeyId) || apiKeyId <= 0 || !createForm.platformCode.trim()) {
      showToast(uiI18n.t("uiExtra.promptFilterNewAPIBindings.selectACodex2APIKeyAndEnterA"), 'error')
      return
    }
    if (createForm.promptFilterScope === 'off') {
      const approved = await confirm({
        title: uiI18n.t("uiExtra.promptFilterNewAPIBindings.allowThisKeyToSkipAllPrompt"),
        description: uiI18n.t("uiExtra.promptFilterNewAPIBindings.requestsUsingThisKeyWillSkipLocal"),
        confirmText: uiI18n.t("uiExtra.promptFilterNewAPIBindings.confirmSkipAll"),
        tone: 'warning',
      })
      if (!approved) return
    }
    setSaving(true)
    try {
      const result = await api.createPromptFilterNewAPIBinding({
        api_key_id: apiKeyId,
        platform_code: createForm.platformCode.trim(),
        platform_name: createForm.platformName.trim(),
        enabled: createForm.enabled,
        require_signed_identity: createForm.requireSignedIdentity,
        prompt_filter_scope: createForm.promptFilterScope,
      })
      setCreateOpen(false)
      await load()
      revealSecret(result.platform_name || result.platform_code, result.secret)
    } catch (createError) {
      showToast(getErrorMessage(createError), 'error')
    } finally {
      setSaving(false)
    }
  }

  const updateBinding = async () => {
    if (!editing || !editForm.platformCode.trim()) return
    if (!editing.require_signed_identity && editForm.requireSignedIdentity) {
      const approved = await confirm({
        title: uiI18n.t("uiExtra.promptFilterNewAPIBindings.requireSignedIdentity154"),
        description: (
          <span>{uiI18n.t("uiExtra.promptFilterNewAPIBindings.firstConfigureThisBindingSSecretIn")}{editForm.platformName.trim() || editForm.platformCode.trim()}{uiI18n.t("uiExtra.promptFilterNewAPIBindings.otherwiseRequestsUsingThisCodex2APIKeyWill")}</span>
        ),
        confirmText: uiI18n.t("uiExtra.promptFilterNewAPIBindings.configuredEnableNow"),
        tone: 'warning',
      })
      if (!approved) return
    }
    if (editing.prompt_filter_scope !== 'off' && editForm.promptFilterScope === 'off') {
      const approved = await confirm({
        title: uiI18n.t("uiExtra.promptFilterNewAPIBindings.allowThisKeyToSkipAllPrompt"),
        description: uiI18n.t("uiExtra.promptFilterNewAPIBindings.afterSavingThisKeyWillSkipLocal"),
        confirmText: uiI18n.t("uiExtra.promptFilterNewAPIBindings.confirmSkipAll"),
        tone: 'warning',
      })
      if (!approved) return
    }
    setSaving(true)
    try {
      await api.updatePromptFilterNewAPIBinding(editing.api_key_id, {
        platform_code: editForm.platformCode.trim(),
        platform_name: editForm.platformName.trim(),
        enabled: editForm.enabled,
        require_signed_identity: editForm.requireSignedIdentity,
        prompt_filter_scope: editForm.promptFilterScope,
      })
      setEditing(null)
      await load()
      showToast(uiI18n.t("uiExtra.promptFilterNewAPIBindings.auditIdentityBindingUpdated"))
    } catch (updateError) {
      showToast(getErrorMessage(updateError), 'error')
    } finally {
      setSaving(false)
    }
  }

  const rotateSecret = async () => {
    if (!rotating) return
    const grace = Number(graceSeconds)
    if (!Number.isInteger(grace) || grace < 60 || grace > 86400) {
      showToast(uiI18n.t("uiExtra.promptFilterNewAPIBindings.theOldSecretGracePeriodMustBe"), 'error')
      return
    }
    setSaving(true)
    try {
      const result = await api.generatePromptFilterNewAPIBindingSecret(rotating.api_key_id, grace)
      setRotating(null)
      await load()
      revealSecret(result.platform_name || result.platform_code, result.secret)
    } catch (rotateError) {
      showToast(getErrorMessage(rotateError), 'error')
    } finally {
      setSaving(false)
    }
  }

  const deleteBinding = async (binding: PromptFilterNewAPIBinding) => {
    const approved = await confirm({
      title: uiI18n.t("uiExtra.promptFilterNewAPIBindings.deleteTheBindingForValue", { value0: (binding.platform_name || binding.platform_code) }),
      description: (
        <span>{uiI18n.t("uiExtra.promptFilterNewAPIBindings.afterDeletionKey")}{binding.api_key_id}{uiI18n.t("uiExtra.promptFilterNewAPIBindings.willNoLongerAcceptNewAPISignedIdentities")}</span>
      ),
      confirmText: uiI18n.t("uiExtra.promptFilterNewAPIBindings.confirmDeletion"),
      tone: 'destructive',
      confirmVariant: 'destructive',
    })
    if (!approved) return
    try {
      await api.deletePromptFilterNewAPIBinding(binding.api_key_id)
      await load()
      showToast(uiI18n.t("uiExtra.promptFilterNewAPIBindings.auditIdentityBindingDeleted"))
    } catch (deleteError) {
      showToast(getErrorMessage(deleteError), 'error')
    }
  }

  const copySecret = async () => {
    if (!secretReveal) return
    try {
      await navigator.clipboard.writeText(secretReveal.secret)
      setSecretCopied(true)
      showToast(uiI18n.t("uiExtra.promptFilterNewAPIBindings.bindingSecretCopied"))
    } catch {
      showToast(uiI18n.t("uiExtra.promptFilterNewAPIBindings.copyFailedSelectAndCopyTheSecret"), 'error')
    }
  }

  const requestCloseSecretReveal = () => {
    if (!secretReveal) return
    setSecretCloseConfirmOpen(true)
  }

  const confirmCloseSecretReveal = () => {
    setSecretCloseConfirmOpen(false)
    setSecretReveal(null)
    setSecretCopied(false)
  }

  return (
    <>
      <section aria-labelledby="newapi-key-bindings-title" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" />
              <h4 id="newapi-key-bindings-title" className="text-sm font-semibold">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.bindAuditIdentitiesToCodex2APIKeys")}</h4>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.associateASignedIdentityWithTheKey")}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />{uiI18n.t("uiExtra.channelMonitor.refresh")}</Button>
            <Button size="sm" onClick={openCreate} disabled={loading || availableAPIKeys.length === 0}>
              <Plus className="size-4" />{uiI18n.t("uiExtra.promptFilterNewAPIBindings.addBinding")}</Button>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-sky-500/25 bg-sky-500/[0.06] p-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-sky-600 dark:text-sky-300" />
          <div className="text-sm leading-6">
            <div className="font-medium">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.useTheAuditSecretAssignedToThis")}</div>
            <div className="text-muted-foreground">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.missingSignaturesIncorrectCallerCodesOrMismatched")}</div>
          </div>
        </div>

        {error ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/[0.05] p-3 text-sm text-destructive">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>{uiI18n.t("uiExtra.channelMonitor.retry")}</Button>
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />{uiI18n.t("uiExtra.promptFilterNewAPIBindings.loadingAuditIdentityBindings")}</div>
        ) : bindings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-7 text-center">
            <div className="text-sm font-medium">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.noAuditIdentitiesConfiguredForIndividualKeys")}</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.creatingABindingGeneratesA256Bit")}</p>
            <Button className="mt-4" size="sm" onClick={openCreate} disabled={availableAPIKeys.length === 0}>
              <Plus className="size-4" />{uiI18n.t("uiExtra.promptFilterNewAPIBindings.createTheFirstBinding")}</Button>
            {availableAPIKeys.length === 0 ? <p className="mt-2 text-xs text-amber-600">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.noAPIKeysAvailableToBindCreate")}</p> : null}
          </div>
        ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.caller")}</th>
                    <th className="px-3 py-2.5 font-medium">Codex2API Key</th>
                    <th className="px-3 py-2.5 font-medium">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.status")}</th>
                    <th className="px-3 py-2.5 font-medium">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.bindingSecret")}</th>
                    <th className="px-3 py-2.5 font-medium">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.updated")}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bindings.map((binding) => {
                    const apiKey = apiKeyByID.get(binding.api_key_id)
                    return (
                      <tr key={binding.api_key_id} className="align-top">
                        <td className="px-3 py-3">
                          <div className="font-medium">{binding.platform_name || binding.platform_code}</div>
                          <div className="mt-0.5 font-mono text-xs text-muted-foreground">{binding.platform_code}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium">#{binding.api_key_id} {apiKey?.name || 'Key 已删除或不可见'}</div>
                          <div className="mt-0.5 font-mono text-xs text-muted-foreground">{apiKey?.key || '—'}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant={binding.enabled ? 'default' : 'outline'}>{binding.enabled ? uiI18n.t("uiExtra.promptFilterNewAPIBindings.enabled") : uiI18n.t("uiExtra.promptFilterNewAPIBindings.disabled")}</Badge>
                            <Badge variant={binding.require_signed_identity ? 'default' : 'outline'}>
                              {binding.require_signed_identity ? uiI18n.t("uiExtra.promptFilterNewAPIBindings.signatureRequired") : uiI18n.t("uiExtra.promptFilterNewAPIBindings.signatureOptional")}
                            </Badge>
                            <Badge variant={binding.prompt_filter_scope === 'off' ? 'destructive' : 'outline'}>
                              {binding.prompt_filter_scope === 'local_only'
                                ? uiI18n.t("uiExtra.promptFilterNewAPIBindings.localChecksOnly")
                                : binding.prompt_filter_scope === 'off'
                                  ? uiI18n.t("uiExtra.promptFilterNewAPIBindings.skipPromptChecks")
                                  : uiI18n.t("uiExtra.promptFilterNewAPIBindings.inheritGlobalReview")}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-mono text-xs">{binding.secret_configured ? binding.secret_masked : uiI18n.t("uiExtra.promptFilterNewAPIBindings.notConfigured")}</div>
                          {binding.previous_secret_active ? (
                            <div className="mt-1 text-xs text-amber-600">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.oldSecretValidUntil")}{formatBeijingTime(binding.previous_secret_expires_at)}
                            </div>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{formatBeijingTime(binding.updated_at)}</td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1.5">
                            <Button variant="outline" size="sm" onClick={() => openEdit(binding)}>
                              <Pencil className="size-3.5" />{uiI18n.t("uiExtra.intelligenceCheck.edit")}</Button>
                            <Button variant="outline" size="sm" onClick={() => { setGraceSeconds('300'); setRotating(binding) }}>
                              <RefreshCw className="size-3.5" />{uiI18n.t("uiExtra.promptFilterNewAPIBindings.rotate")}</Button>
                            <Button variant="ghost" size="icon" className="text-destructive" aria-label={uiI18n.t("uiExtra.promptFilterNewAPIBindings.deleteBinding")} onClick={() => void deleteBinding(binding)}>
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
        )}
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{uiI18n.t("uiExtra.promptFilterNewAPIBindings.addAKeyAuditIdentityBinding")}</DialogTitle>
            <DialogDescription>{uiI18n.t("uiExtra.promptFilterNewAPIBindings.selectTheCodex2APIKeyActuallyUsedFor")}</DialogDescription>
          </DialogHeader>
          <BindingFormFields form={createForm} setForm={setCreateForm} apiKeys={availableAPIKeys} editing={false} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{uiI18n.t("uiExtra.promptFilterNewAPIBindings.cancel")}</Button>
            <Button onClick={() => void createBinding()} disabled={saving || !createForm.apiKeyId || !createForm.platformCode.trim()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{uiI18n.t("uiExtra.promptFilterNewAPIBindings.createAndGenerateSecret")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !saving) setEditing(null) }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{uiI18n.t("uiExtra.promptFilterNewAPIBindings.editAuditIdentityBinding")}</DialogTitle>
            <DialogDescription>{uiI18n.t("uiExtra.promptFilterNewAPIBindings.manageTheCallerIdentityAndThisKey")}</DialogDescription>
          </DialogHeader>
          <BindingFormFields form={editForm} setForm={setEditForm} apiKeys={apiKeys.filter((key) => key.id === editing?.api_key_id)} editing />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>{uiI18n.t("uiExtra.promptFilterNewAPIBindings.cancel")}</Button>
            <Button onClick={() => void updateBinding()} disabled={saving || !editForm.platformCode.trim()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{uiI18n.t("uiExtra.promptFilterNewAPIBindings.saveChanges")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rotating)} onOpenChange={(open) => { if (!open && !saving) setRotating(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{uiI18n.t("uiExtra.promptFilterNewAPIBindings.rotateTheSecretFor")}{rotating?.platform_name || rotating?.platform_code}{uiI18n.t("uiExtra.promptFilterNewAPIBindings.label")}</DialogTitle>
            <DialogDescription>{uiI18n.t("uiExtra.promptFilterNewAPIBindings.aNewSecretWillBeGeneratedBoth")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="space-y-1.5">
              <span className="text-sm font-medium">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.oldSecretGracePeriodSeconds")}</span>
              <Input type="number" min={60} max={86400} step={1} value={graceSeconds} onChange={(event) => setGraceSeconds(event.target.value)} />
              <span className="block text-xs leading-5 text-muted-foreground">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.recommended300SecondsMinimum60TheOld")}</span>
            </label>
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-sm leading-6">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />{uiI18n.t("uiExtra.promptFilterNewAPIBindings.theNewSecretIsShownOnlyOnce")}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRotating(null)} disabled={saving}>{uiI18n.t("uiExtra.promptFilterNewAPIBindings.cancel")}</Button>
            <Button onClick={() => void rotateSecret()} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{uiI18n.t("uiExtra.promptFilterNewAPIBindings.confirmRotation")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(secretReveal)} onOpenChange={(open) => { if (!open) requestCloseSecretReveal() }}>
        <DialogContent
          className="sm:max-w-2xl"
          onEscapeKeyDown={(event) => { event.preventDefault(); requestCloseSecretReveal() }}
          onPointerDownOutside={(event) => { event.preventDefault(); requestCloseSecretReveal() }}
        >
          <DialogHeader>
            <DialogTitle>{secretReveal?.platformName}{uiI18n.t("uiExtra.promptFilterNewAPIBindings.bindingSecret")}</DialogTitle>
            <DialogDescription>{uiI18n.t("uiExtra.promptFilterNewAPIBindings.theSecretIsSavedInTheCodex2API")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input readOnly value={secretReveal?.secret ?? ''} className="font-mono text-xs" />
              <Button variant="outline" onClick={() => void copySecret()}>
                {secretCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {secretCopied ? uiI18n.t("uiExtra.promptFilterNewAPIBindings.copied") : uiI18n.t("uiExtra.promptFilterNewAPIBindings.copySecret")}
              </Button>
            </div>
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-sm leading-6 text-amber-800 dark:text-amber-200">{uiI18n.t("uiExtra.promptFilterNewAPIBindings.configureThisSecretOnlyInTheNewAPI")}{secretReveal?.platformName}{uiI18n.t("uiExtra.promptFilterNewAPIBindings.closingThisWindowRemovesAccessToThe")}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={requestCloseSecretReveal}>{uiI18n.t("uiExtra.promptFilterNewAPIBindings.close")}</Button>
            <Button onClick={() => void copySecret()}>
              <Copy className="size-4" />{secretCopied ? uiI18n.t("uiExtra.promptFilterNewAPIBindings.copied") : uiI18n.t("uiExtra.promptFilterNewAPIBindings.copyAndConfigure")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={secretCloseConfirmOpen} onOpenChange={setSecretCloseConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{uiI18n.t("uiExtra.promptFilterNewAPIBindings.closeTheSecretWindow")}</DialogTitle>
            <DialogDescription>{uiI18n.t("uiExtra.promptFilterNewAPIBindings.closingClearsThePlaintextDisplayTheList")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSecretCloseConfirmOpen(false)}>{uiI18n.t("uiExtra.promptFilterNewAPIBindings.backToCopy")}</Button>
            <Button variant="destructive" onClick={confirmCloseSecretReveal}>{uiI18n.t("uiExtra.promptFilterNewAPIBindings.confirmClose")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </>
  )
}
