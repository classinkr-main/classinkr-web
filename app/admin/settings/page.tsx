"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Save,
  XCircle,
  Zap,
} from "lucide-react"

import { NotificationIcon } from "@/components/notifications/NotificationIcon"
import { adminFetchJson } from "@/lib/admin-client"
import { resolveNotificationPresentation } from "@/lib/notifications/presentation"
import {
  DEFAULT_NOTIFICATION_APPEARANCE,
  NOTIFICATION_CATEGORY_OPTIONS,
  NOTIFICATION_ICON_OPTIONS,
  NOTIFICATION_SEVERITY_OPTIONS,
  NOTIFICATION_TONE_OPTIONS,
  NOTIFICATION_TYPE_OPTIONS,
  type NotificationCategory,
  type NotificationIconKey,
  type NotificationSeverity,
  type NotificationTone,
  type NotificationType,
} from "@/lib/notifications/types"
import { NOTIFICATION_TONE_STYLES } from "@/lib/notifications/ui"
import type { SiteSettings } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type ToastState = { msg: string; type: "success" | "error" } | null
type WebhookStatus = "idle" | "testing" | "success" | "error"

function splitEmails(value: string) {
  return [...new Set(
    value
      .split(/[\n,;]/)
      .map((item) => item.trim())
      .filter(Boolean)
  )]
}

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 text-[13px] font-medium shadow-xl animate-in slide-in-from-bottom-2 duration-200",
        type === "success" ? "bg-[#111110] text-white" : "bg-red-500 text-white"
      )}
    >
      {type === "success" ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0" />
      )}
      {msg}
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="mb-6">
      <div className="mb-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#111110]">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-[12px] text-[#1a1a1a]/45">{description}</p>
        ) : null}
      </div>
      <div className="rounded-2xl border border-[#e8e8e4] bg-white px-6">
        {children}
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between border-b border-[#e8e8e4] py-4 last:border-0">
      <div>
        <p className="text-[14px] font-medium text-[#111110]">{label}</p>
        <p className="mt-0.5 text-[12px] text-[#1a1a1a]/45">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-[#111110]" : "bg-[#e8e8e4]"
        )}
      >
        <span
          className={cn(
            "absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    </div>
  )
}

function SelectField<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className="h-10 rounded-xl border border-[#e8e8e4] bg-white px-3 text-[13px] text-[#111110] outline-none transition-colors focus:border-[#111110]"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function AppearanceRow({
  label,
  description,
  iconKey,
  tone,
  onIconChange,
  onToneChange,
}: {
  label: string
  description: string
  iconKey: NotificationIconKey
  tone: NotificationTone
  onIconChange: (value: NotificationIconKey) => void
  onToneChange: (value: NotificationTone) => void
}) {
  const toneStyles = NOTIFICATION_TONE_STYLES[tone]

  return (
    <div className="grid gap-3 border-b border-[#e8e8e4] py-4 last:border-0 md:grid-cols-[minmax(0,1fr)_160px_140px_72px] md:items-center">
      <div>
        <p className="text-[13px] font-medium text-[#111110]">{label}</p>
        <p className="mt-0.5 text-[12px] text-[#1a1a1a]/45">{description}</p>
      </div>

      <SelectField
        value={iconKey}
        onChange={onIconChange}
        options={NOTIFICATION_ICON_OPTIONS}
      />

      <SelectField
        value={tone}
        onChange={onToneChange}
        options={NOTIFICATION_TONE_OPTIONS}
      />

      <div className="flex items-center justify-center">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-2xl",
            toneStyles.icon
          )}
        >
          <NotificationIcon iconKey={iconKey} />
        </div>
      </div>
    </div>
  )
}

function WebhookRow({
  label,
  description,
  placeholder,
  value,
  onChange,
  webhookType,
}: {
  label: string
  description: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  webhookType: string
}) {
  const [status, setStatus] = useState<WebhookStatus>("idle")
  const [statusMsg, setStatusMsg] = useState("")

  const handleTest = async () => {
    if (!value.trim()) {
      setStatus("error")
      setStatusMsg("Enter a URL to run a connection test.")
      window.setTimeout(() => setStatus("idle"), 3000)
      return
    }

    setStatus("testing")
    setStatusMsg("")

    try {
      const data = await adminFetchJson<{ ok: boolean; message?: string }>(
        "/api/admin/settings/test-webhook",
        {
          method: "POST",
          body: JSON.stringify({ type: webhookType, url: value }),
        }
      )
      setStatus(data.ok ? "success" : "error")
      setStatusMsg(data.message ?? "")
    } catch (error) {
      setStatus("error")
      setStatusMsg(error instanceof Error ? error.message : "Request failed")
    }

    window.setTimeout(() => setStatus("idle"), 5000)
  }

  return (
    <div className="border-b border-[#e8e8e4] py-5 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-[#111110]">{label}</p>
          <p className="mb-3 mt-0.5 text-[12px] text-[#1a1a1a]/45">
            {description}
          </p>
          <div className="flex gap-2">
            <Input
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={placeholder}
              className="flex-1 font-mono text-[13px]"
            />
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={status === "testing"}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-[12px] font-medium transition-all",
                status === "success"
                  ? "border-green-200 bg-green-50 text-green-600"
                  : status === "error"
                    ? "border-red-200 bg-red-50 text-red-500"
                    : "border-[#e8e8e4] bg-[#f0f0ec] text-[#1a1a1a]/60 hover:bg-[#e8e8e4]"
              )}
            >
              {status === "testing" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : status === "success" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : status === "error" ? (
                <XCircle className="h-3.5 w-3.5" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              {status === "testing"
                ? "Testing..."
                : status === "success"
                  ? "Success"
                  : status === "error"
                    ? "Failed"
                    : "Test"}
            </button>
          </div>
          {!value && status === "idle" ? (
            <p className="mt-1.5 text-[11px] text-[#1a1a1a]/35">
              Existing secrets stay hidden after reload. Entering a new URL will replace the
              saved value.
            </p>
          ) : null}
          {statusMsg ? (
            <p
              className={cn(
                "mt-1.5 text-[11px]",
                status === "success" ? "text-green-600" : "text-red-400"
              )}
            >
              {statusMsg}
            </p>
          ) : null}
        </div>
        {value ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 shrink-0 text-[#1a1a1a]/30 transition-colors hover:text-[#1a1a1a]/60"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null)
  const [digestInput, setDigestInput] = useState("")
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [toast, setToast] = useState<ToastState>(null)

  useEffect(() => {
    let active = true

    adminFetchJson<SiteSettings>("/api/admin/settings")
      .then((data) => {
        if (!active) return
        setSettings(data)
        setDigestInput(data.notificationDigestEmailList.join("\n"))
        setLoadError("")
      })
      .catch((error) => {
        if (!active) return
        setLoadError(
          error instanceof Error ? error.message : "Failed to load settings."
        )
      })

    return () => {
      active = false
    }
  }, [])

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    window.setTimeout(() => setToast(null), 3000)
  }

  const updateSettingsState = (patch: Partial<SiteSettings>) => {
    setSettings((current) => (current ? { ...current, ...patch } : current))
  }

  const updateTypeStyle = (
    type: NotificationType,
    patch: Partial<{ iconKey: NotificationIconKey; tone: NotificationTone }>
  ) => {
    setSettings((current) => {
      if (!current) return current

      return {
        ...current,
        notificationAppearance: {
          ...current.notificationAppearance,
          typeStyles: {
            ...current.notificationAppearance.typeStyles,
            [type]: {
              ...current.notificationAppearance.typeStyles[type],
              ...patch,
            },
          },
        },
      }
    })
  }

  const updateCategoryStyle = (
    category: NotificationCategory,
    patch: Partial<{ iconKey: NotificationIconKey; tone: NotificationTone }>
  ) => {
    setSettings((current) => {
      if (!current) return current

      const fallback =
        current.notificationAppearance.categoryStyles[category] ??
        DEFAULT_NOTIFICATION_APPEARANCE.categoryStyles[category] ??
        DEFAULT_NOTIFICATION_APPEARANCE.typeStyles.status_update

      return {
        ...current,
        notificationAppearance: {
          ...current.notificationAppearance,
          categoryStyles: {
            ...current.notificationAppearance.categoryStyles,
            [category]: {
              ...fallback,
              ...patch,
            },
          },
        },
      }
    })
  }

  const updateSeverityOverride = (
    severity: NotificationSeverity,
    patch: Partial<{ iconKey: NotificationIconKey; tone: NotificationTone }>
  ) => {
    setSettings((current) => {
      if (!current) return current

      const fallback = {
        iconKey:
          current.notificationAppearance.severityOverrides[severity]?.iconKey ??
          DEFAULT_NOTIFICATION_APPEARANCE.severityOverrides[severity]?.iconKey ??
          "bell",
        tone:
          current.notificationAppearance.severityOverrides[severity]?.tone ??
          DEFAULT_NOTIFICATION_APPEARANCE.severityOverrides[severity]?.tone ??
          "slate",
      }

      return {
        ...current,
        notificationAppearance: {
          ...current.notificationAppearance,
          severityOverrides: {
            ...current.notificationAppearance.severityOverrides,
            [severity]: {
              ...fallback,
              ...patch,
            },
          },
        },
      }
    })
  }

  const previewItems = useMemo(() => {
    if (!settings) return []

    return [
      {
        key: "lead",
        title: "New lead came in",
        body: "Demo request from a school administrator was submitted.",
        presentation: resolveNotificationPresentation({
          notificationType: "action_required",
          categoryTag: "lead",
          severity: "info",
          appearance: settings.notificationAppearance,
        }),
      },
      {
        key: "schedule",
        title: "Partner schedule requested",
        body: "A partner asked to confirm an installation window.",
        presentation: resolveNotificationPresentation({
          notificationType: "status_update",
          categoryTag: "schedule",
          severity: "warning",
          appearance: settings.notificationAppearance,
        }),
      },
      {
        key: "incident",
        title: "Webhook delivery failed",
        body: "Critical notification channel failed and needs review.",
        presentation: resolveNotificationPresentation({
          notificationType: "incident",
          categoryTag: "system",
          severity: "critical",
          appearance: settings.notificationAppearance,
        }),
      },
    ]
  }, [settings])

  const handleSave = async () => {
    if (!settings) return

    setSaving(true)

    try {
      await adminFetchJson("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          ...settings,
          notificationDigestEmailList: splitEmails(digestInput),
        }),
      })
      showToast("Settings saved.")
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to save settings.",
        "error"
      )
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return (
      <div className="px-8 pt-12 text-[13px] text-[#1a1a1a]/40">
        {loadError || "Loading settings..."}
      </div>
    )
  }

  return (
    <div className="max-w-5xl px-8 pb-20 pt-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">
            Admin
          </p>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">
            Settings
          </h1>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      <Section
        title="Site Features"
        description="Control the core visibility of homepage features."
      >
        <ToggleRow
          label="Demo request form"
          description="Show the demo CTA and the request modal."
          checked={settings.demoFormEnabled}
          onChange={(value) => updateSettingsState({ demoFormEnabled: value })}
        />
        <ToggleRow
          label="Blog section"
          description="Expose the homepage blog section."
          checked={settings.blogSectionEnabled}
          onChange={(value) => updateSettingsState({ blogSectionEnabled: value })}
        />
        <ToggleRow
          label="Demo banner"
          description="Display the promotional banner at the top of the site."
          checked={settings.demoBannerEnabled}
          onChange={(value) => updateSettingsState({ demoBannerEnabled: value })}
        />
        <ToggleRow
          label="Notice banner"
          description="Display a site-wide notice banner."
          checked={settings.noticeBannerEnabled}
          onChange={(value) => updateSettingsState({ noticeBannerEnabled: value })}
        />
      </Section>

      <Section
        title="Banner Copy"
        description="Text shown on enabled banners."
      >
        <div className="space-y-4 py-5">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/55">
              Demo banner text
            </label>
            <Input
              value={settings.demoBannerText}
              onChange={(event) =>
                updateSettingsState({ demoBannerText: event.target.value })
              }
              placeholder="2026 first semester demo slots are now open."
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/55">
              Notice banner text
            </label>
            <Input
              value={settings.noticeBannerText}
              onChange={(event) =>
                updateSettingsState({ noticeBannerText: event.target.value })
              }
              placeholder="Scheduled maintenance 00:00-06:00."
            />
          </div>
        </div>
      </Section>

      <Section
        title="Delivery Channels"
        description="Webhook endpoints used for leads, operational alerts, and external notifications."
      >
        <WebhookRow
          label="Google Sheet webhook"
          description="Push new leads into a Google Sheets pipeline."
          placeholder="https://script.google.com/macros/s/..."
          value={settings.googleSheetWebhookUrl ?? ""}
          onChange={(value) => updateSettingsState({ googleSheetWebhookUrl: value })}
          webhookType="googleSheet"
        />
        <WebhookRow
          label="Lead automation webhook"
          description="Forward leads to Make, Zapier, n8n, or a custom workflow."
          placeholder="https://hook.make.com/..."
          value={settings.leadWebhookUrl ?? ""}
          onChange={(value) => updateSettingsState({ leadWebhookUrl: value })}
          webhookType="lead"
        />
        <WebhookRow
          label="ChannelTalk webhook"
          description="Immediate lead push for the sales inbox."
          placeholder="https://talk.channel.io/hooks/..."
          value={settings.channelTalkWebhookUrl ?? ""}
          onChange={(value) => updateSettingsState({ channelTalkWebhookUrl: value })}
          webhookType="channelTalk"
        />
        <WebhookRow
          label="WeCom ops webhook"
          description="Operational notifications for normal warnings and partner activity."
          placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
          value={settings.wecomOpsWebhookUrl ?? ""}
          onChange={(value) => updateSettingsState({ wecomOpsWebhookUrl: value })}
          webhookType="wecom"
        />
        <WebhookRow
          label="WeCom critical webhook"
          description="Escalation channel for incidents and delivery failures."
          placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
          value={settings.wecomCriticalWebhookUrl ?? ""}
          onChange={(value) =>
            updateSettingsState({ wecomCriticalWebhookUrl: value })
          }
          webhookType="wecom"
        />
        <WebhookRow
          label="Kakao notification webhook"
          description="External transactional notifications such as confirmations and reminders."
          placeholder="https://provider.example.com/kakao/..."
          value={settings.kakaoAlimtalkWebhookUrl ?? ""}
          onChange={(value) =>
            updateSettingsState({ kakaoAlimtalkWebhookUrl: value })
          }
          webhookType="kakaoAlimtalk"
        />
        <WebhookRow
          label="Email notification webhook"
          description="Fallback or digest delivery channel for incidents."
          placeholder="https://api.example.com/email/..."
          value={settings.emailWebhookUrl ?? ""}
          onChange={(value) => updateSettingsState({ emailWebhookUrl: value })}
          webhookType="email"
        />
      </Section>

      <Section
        title="Notification Defaults"
        description="Recipients and default rendering rules for the notification layer."
      >
        <div className="space-y-5 py-5">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/55">
              Digest / fallback email recipients
            </label>
            <textarea
              value={digestInput}
              onChange={(event) => setDigestInput(event.target.value)}
              rows={4}
              placeholder={"ops@classin.kr\nowner@classin.kr"}
              className="w-full rounded-2xl border border-[#e8e8e4] px-3 py-3 text-[13px] text-[#111110] outline-none transition-colors focus:border-[#111110]"
            />
            <p className="mt-1.5 text-[11px] text-[#1a1a1a]/38">
              Use new lines, commas, or semicolons. These addresses receive email fallback for
              failed critical notifications.
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="Notification Preview"
        description="Preview how your icon and tone rules will resolve in the inbox."
      >
        <div className="grid gap-3 py-5 md:grid-cols-3">
          {previewItems.map((item) => {
            const tone = NOTIFICATION_TONE_STYLES[item.presentation.tone]

            return (
              <div
                key={item.key}
                className="rounded-2xl border border-[#e8e8e4] bg-[#fcfcfa] p-4"
              >
                <div
                  className={cn(
                    "mb-3 flex h-10 w-10 items-center justify-center rounded-2xl",
                    tone.icon
                  )}
                >
                  <NotificationIcon iconKey={item.presentation.iconKey} />
                </div>
                <p className="text-[13px] font-semibold text-[#111110]">{item.title}</p>
                <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a]/55">{item.body}</p>
                <span
                  className={cn(
                    "mt-3 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    tone.badge
                  )}
                >
                  {item.presentation.tone}
                </span>
              </div>
            )
          })}
        </div>
      </Section>

      <Section
        title="Type Styles"
        description="Base icon and tone for each notification type."
      >
        {NOTIFICATION_TYPE_OPTIONS.map((option) => {
          const style = settings.notificationAppearance.typeStyles[option.value]

          return (
            <AppearanceRow
              key={option.value}
              label={option.label}
              description={`Default rendering token for ${option.label.toLowerCase()}.`}
              iconKey={style.iconKey}
              tone={style.tone}
              onIconChange={(value) => updateTypeStyle(option.value, { iconKey: value })}
              onToneChange={(value) => updateTypeStyle(option.value, { tone: value })}
            />
          )
        })}
      </Section>

      <Section
        title="Category Styles"
        description="Override icon and tone by domain category such as lead, schedule, or system."
      >
        {NOTIFICATION_CATEGORY_OPTIONS.map((option) => {
          const style =
            settings.notificationAppearance.categoryStyles[option.value] ??
            DEFAULT_NOTIFICATION_APPEARANCE.categoryStyles[option.value] ??
            DEFAULT_NOTIFICATION_APPEARANCE.typeStyles.status_update

          return (
            <AppearanceRow
              key={option.value}
              label={option.label}
              description={`Category accent for ${option.label.toLowerCase()}.`}
              iconKey={style.iconKey}
              tone={style.tone}
              onIconChange={(value) =>
                updateCategoryStyle(option.value, { iconKey: value })
              }
              onToneChange={(value) => updateCategoryStyle(option.value, { tone: value })}
            />
          )
        })}
      </Section>

      <Section
        title="Severity Overrides"
        description="Final override layer used when a notification is warning or critical."
      >
        {NOTIFICATION_SEVERITY_OPTIONS.map((option) => {
          const style = {
            iconKey:
              settings.notificationAppearance.severityOverrides[option.value]?.iconKey ??
              DEFAULT_NOTIFICATION_APPEARANCE.severityOverrides[option.value]?.iconKey ??
              "bell",
            tone:
              settings.notificationAppearance.severityOverrides[option.value]?.tone ??
              DEFAULT_NOTIFICATION_APPEARANCE.severityOverrides[option.value]?.tone ??
              "slate",
          }

          return (
            <AppearanceRow
              key={option.value}
              label={option.label}
              description={`Final override applied to ${option.label.toLowerCase()} notifications.`}
              iconKey={style.iconKey}
              tone={style.tone}
              onIconChange={(value) =>
                updateSeverityOverride(option.value, { iconKey: value })
              }
              onToneChange={(value) =>
                updateSeverityOverride(option.value, { tone: value })
              }
            />
          )
        })}
      </Section>

      {toast ? <Toast msg={toast.msg} type={toast.type} /> : null}
    </div>
  )
}
