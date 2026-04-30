"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import type { ReactNode } from "react"
import {
  Save,
  CheckCircle2,
  Check,
  XCircle,
  Loader2,
  ExternalLink,
  Zap,
  ShieldCheck,
  Link2,
  History,
  LayoutGrid,
  Settings2,
  Sparkles,
  CircleAlert,
  Copy,
  Code2,
  Globe,
} from "lucide-react"

import { NotificationIcon } from "@/components/notifications/NotificationIcon"
import { adminFetch, adminFetchJson } from "@/lib/admin-client"
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
        type === "success" ? "bg-[#111110] text-white" : "bg-[#B85C33] text-white"
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
    <div className="flex flex-col gap-3 py-4 border-b border-[#e8e8e4] last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[14px] font-medium text-[#111110]">{title}</p>
        {description ? (
          <p className="mt-0.5 text-[12px] text-[#1a1a1a]/45">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  )
}

function CopyValueButton({
  value,
  label = "복사",
}: {
  value: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-[12px] font-medium transition-all",
        copied
          ? "border-[#D1FAE5] bg-[#ECFDF5] text-[#084734]"
          : "border-[#e8e8e4] bg-white text-[#1a1a1a]/60 hover:border-[#c8c8c4] hover:text-[#111110]"
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "복사됨" : label}
    </button>
  )
}

function CodeSnippet({
  title,
  description,
  value,
  copyLabel,
}: {
  title: string
  description?: string
  value: string
  copyLabel?: string
}) {
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-[#111110]">{title}</p>
          {description ? (
            <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
              {description}
            </p>
          ) : null}
        </div>
        <CopyValueButton value={value} label={copyLabel ?? "복사"} />
      </div>
      <pre className="overflow-x-auto rounded-xl bg-[#111110] px-4 py-3 text-[12px] leading-relaxed text-white">
        <code>{value}</code>
      </pre>
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
                  ? "border-[#D1FAE5] bg-[#ECFDF5] text-[#084734]"
                  : status === "error"
                    ? "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]"
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
                ? "테스트 중..."
                : status === "success"
                  ? "성공"
                  : status === "error"
                    ? "실패"
                    : "테스트"}
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
                status === "success" ? "text-[#084734]" : "text-[#B85C33]"
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

type SettingsTab = "general" | "lead" | "cta" | "integrations" | "notifications" | "history"

type SettingsKey = keyof SiteSettings

const NAV_ITEMS: Array<{
  key: SettingsTab
  label: string
  desc: string
  icon: ReactNode
}> = [
  {
    key: "general",
    label: "일반",
    desc: "사이트 기능과 공지 문구",
    icon: <Settings2 className="w-4 h-4" />,
  },
  {
    key: "lead",
    label: "리드·폼",
    desc: "데모 신청, 문의, 구독 경로",
    icon: <ShieldCheck className="w-4 h-4" />,
  },
  {
    key: "cta",
    label: "CTA",
    desc: "버튼, 링크, 다운로드 연결",
    icon: <Link2 className="w-4 h-4" />,
  },
  {
    key: "integrations",
    label: "외부 연동",
    desc: "웹훅과 테스트 상태",
    icon: <LayoutGrid className="w-4 h-4" />,
  },
  {
    key: "notifications",
    label: "알림",
    desc: "알림 외관 및 수신자 설정",
    icon: <Sparkles className="w-4 h-4" />,
  },
  {
    key: "history",
    label: "변경 이력",
    desc: "준비중인 리비전 로그",
    icon: <History className="w-4 h-4" />,
  },
]

const SECTION_FIELDS: Record<SettingsTab, SettingsKey[]> = {
  general: [
    "demoFormEnabled",
    "demoBannerEnabled",
    "demoBannerText",
    "blogSectionEnabled",
    "noticeBannerEnabled",
    "noticeBannerText",
  ],
  lead: ["demoFormEnabled", "blogSectionEnabled"],
  cta: [],
  integrations: ["googleSheetWebhookUrl", "leadWebhookUrl", "channelTalkWebhookUrl", "emailWebhookUrl"],
  notifications: ["notificationDigestEmailList", "notificationAppearance"],
  history: [],
}

function isSettingsDirty(current: SiteSettings, baseline: SiteSettings) {
  return Object.keys(SECTION_FIELDS).some((section) => sectionDirtyCount(current, baseline, section as SettingsTab) > 0)
}

function sectionDirtyCount(current: SiteSettings, baseline: SiteSettings, section: SettingsTab) {
  return SECTION_FIELDS[section].reduce((count, key) => {
    return count + (JSON.stringify(current[key]) === JSON.stringify(baseline[key]) ? 0 : 1)
  }, 0)
}

function formatTime(value: Date) {
  return value.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
}

function PanelCard({
  title,
  description,
  children,
  badge,
}: {
  title: string
  description?: string
  children: ReactNode
  badge?: string
}) {
  return (
    <section className="bg-white rounded-2xl border border-[#e8e8e4] overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#e8e8e4] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:py-5">
        <div>
          <h3 className="text-[15px] font-semibold text-[#111110]">{title}</h3>
          {description && <p className="text-[12px] text-[#1a1a1a]/40 mt-1">{description}</p>}
        </div>
        {badge && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#f0f0ec] text-[#1a1a1a]/50 text-[11px] font-medium">
            {badge}
          </span>
        )}
      </div>
      <div className="px-4 py-4 sm:px-6 sm:py-5">{children}</div>
    </section>
  )
}

function EmptyHint({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: string
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-5 py-4">
      <div className="flex items-start gap-3">
        <CircleAlert className="w-4 h-4 text-[#1a1a1a]/30 mt-0.5 shrink-0" />
        <div>
          <p className="text-[13px] font-medium text-[#111110]">{title}</p>
          <p className="text-[12px] text-[#1a1a1a]/40 mt-1 leading-relaxed">{description}</p>
          <p className="text-[12px] text-[#111110] mt-2 font-medium">{action}</p>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null)
  const [initialSettings, setInitialSettings] = useState<SiteSettings | null>(null)
  const [digestInput, setDigestInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>("general")
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [currentOrigin, setCurrentOrigin] = useState("")

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    window.setTimeout(() => setToast(null), 3000)
  }

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    try {
      const response = await adminFetch("/api/admin/settings")
      if (!response.ok) {
        throw new Error("설정을 불러오지 못했습니다.")
      }

      const data = (await response.json()) as SiteSettings
      setSettings(data)
      setInitialSettings(data)
      setDigestInput(data.notificationDigestEmailList?.join("\n") ?? "")
      setLastSavedAt(null)
    } catch {
      setLoadError("설정을 불러오지 못했습니다. 다시 시도해 주세요.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    if (typeof window === "undefined") return
    setCurrentOrigin(window.location.origin)
  }, [])

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

  const pageWebhookPath = "/api/webhook/page"
  const pageWebhookUrl = currentOrigin
    ? `${currentOrigin}${pageWebhookPath}`
    : pageWebhookPath

  const pageWebhookFetchExample = useMemo(
    () =>
      `await fetch("${pageWebhookUrl}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    formType: "demo",
    name: "홍길동",
    organization: "무궁화학원",
    role: "원장",
    size: "120",
    email: "demo@example.com",
    phone: "010-1234-5678",
    message: "도입 상담 요청",
    marketingConsent: true
  })
})`,
    [pageWebhookUrl]
  )

  const pageWebhookDemoPayload = useMemo(
    () =>
      JSON.stringify(
        {
          formType: "demo",
          name: "홍길동",
          organization: "무궁화학원",
          role: "원장",
          size: "120",
          email: "demo@example.com",
          phone: "010-1234-5678",
          message: "도입 상담 요청",
          marketingConsent: true,
        },
        null,
        2
      ),
    []
  )

  const pageWebhookContactPayload = useMemo(
    () =>
      JSON.stringify(
        {
          formType: "contact",
          name: "홍길동",
          organization: "무궁화학원",
          phone: "010-1234-5678",
          message: "문의 남깁니다.",
          marketingConsent: false,
        },
        null,
        2
      ),
    []
  )

  const sectionDirtyTotals =
    settings && initialSettings
      ? (Object.keys(SECTION_FIELDS) as SettingsTab[]).reduce((acc, section) => {
          acc[section] = sectionDirtyCount(settings, initialSettings, section)
          return acc
        }, {} as Record<SettingsTab, number>)
      : null
  const dirtyCount = sectionDirtyTotals ? Object.values(sectionDirtyTotals).reduce((sum, value) => sum + value, 0) : 0
  const hasDirtyChanges = Boolean(settings && initialSettings && isSettingsDirty(settings, initialSettings))

  const handleSave = async () => {
    if (!settings || !initialSettings || !hasDirtyChanges) return
    setSaving(true)

    try {
      const response = await adminFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          ...settings,
          notificationDigestEmailList: splitEmails(digestInput),
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.message ?? "설정 저장에 실패했습니다.")
      }
      showToast(data?.message ?? "설정이 저장되었습니다.")
      const savedSettings = { ...settings, notificationDigestEmailList: splitEmails(digestInput) }
      setInitialSettings(savedSettings as SiteSettings)
      setLastSavedAt(new Date())
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to save settings.",
        "error"
      )
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (!initialSettings || !hasDirtyChanges) return
    setSettings(initialSettings)
    setDigestInput(initialSettings.notificationDigestEmailList?.join("\n") ?? "")
    showToast("저장 전 변경사항을 되돌렸습니다.")
  }

  const set = (patch: Partial<SiteSettings>) => setSettings((prev) => (prev ? { ...prev, ...patch } : prev))

  if (loading) {
    return <div className="px-4 pt-8 text-[13px] text-[#1a1a1a]/30 sm:px-6 sm:pt-10 lg:px-8">불러오는 중...</div>
  }

  if (loadError || !settings || !initialSettings) {
    return (
      <div className="max-w-[1320px] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-8">
        <div className="rounded-2xl border border-[#F6D5C5] bg-[#FEF3EE] px-5 py-4 text-[13px] text-[#B85C33]">
          <p className="font-medium">설정 로드 실패</p>
          <p className="mt-1 text-[12px] leading-5 text-[#9A4A27]/80">{loadError ?? "설정을 불러오지 못했습니다."}</p>
          <Button className="mt-4 gap-1.5" variant="outline" onClick={() => void loadSettings()}>
            다시 시도
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1320px] px-4 pt-8 pb-16 sm:px-6 sm:pt-10 sm:pb-20 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">Settings</h1>
          <p className="text-[13px] text-[#1a1a1a]/45 mt-2 max-w-2xl">
            배포 없이 바꾸는 운영 제어판입니다. 일반 설정은 즉시 반영하고, CTA와 변경 이력은 준비중 상태로 구조만 먼저 잡아둡니다.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:min-w-[280px]">
          <div className={`rounded-2xl border px-4 py-3 ${hasDirtyChanges ? "border-amber-200 bg-amber-50" : "border-[#e8e8e4] bg-white"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-[#111110]">
                  {hasDirtyChanges ? `미저장 변경 ${dirtyCount}개` : "변경사항 없음"}
                </p>
                <p className="text-[12px] text-[#1a1a1a]/45 mt-1">
                  {hasDirtyChanges
                    ? "저장 전에 되돌릴 수 있습니다."
                    : lastSavedAt
                      ? `최근 저장 · ${formatTime(lastSavedAt)}`
                      : "아직 저장한 기록이 없습니다."}
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  hasDirtyChanges ? "bg-amber-100 text-amber-800" : "bg-[#f0f0ec] text-[#1a1a1a]/55"
                }`}
              >
                {saving ? "저장 중" : hasDirtyChanges ? "검토 필요" : "안정"}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button size="sm" variant="outline" className="w-full gap-1.5 bg-white sm:w-auto">
              <Sparkles className="w-4 h-4" />
              미리보기
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              disabled={!hasDirtyChanges || saving}
              className="w-full gap-1.5 bg-white sm:w-auto"
            >
              되돌리기
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!hasDirtyChanges || saving} className="w-full gap-1.5 sm:w-auto">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "저장 중..." : hasDirtyChanges ? `저장 (${dirtyCount})` : "저장"}
            </Button>
          </div>
        </div>
      </div>

      <div className={`mb-6 rounded-2xl border px-4 py-4 sm:px-5 ${hasDirtyChanges ? "border-amber-200 bg-amber-50/60" : "border-[#e8e8e4] bg-white"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[#111110]">
              {hasDirtyChanges ? "저장 전 변경사항이 남아 있습니다." : "설정이 현재 저장본과 일치합니다."}
            </p>
            <p className="text-[12px] text-[#1a1a1a]/45 mt-1">
              {hasDirtyChanges
                ? "섹션별 변경 수를 확인하고, 필요하면 되돌린 뒤 저장하세요."
                : lastSavedAt
                  ? `최근 저장 시각 · ${formatTime(lastSavedAt)}`
                  : "새로 불러온 상태입니다. 저장하면 기준점이 만들어집니다."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-[11px] font-medium ${hasDirtyChanges ? "bg-amber-100 text-amber-800" : "bg-[#f0f0ec] text-[#1a1a1a]/55"}`}>
              {hasDirtyChanges ? `미저장 ${dirtyCount}` : "미변경"}
            </span>
            {lastSavedAt && (
              <span className="rounded-full bg-[#f0f0ec] px-3 py-1 text-[11px] font-medium text-[#1a1a1a]/55">
                저장 · {formatTime(lastSavedAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)] items-start">
        <aside className="space-y-3 xl:sticky xl:top-6">
          <div className="hidden rounded-2xl border border-[#e8e8e4] bg-white px-4 py-4 xl:block">
            <p className="text-[12px] font-semibold text-[#111110]">설정 카테고리</p>
            <p className="text-[12px] text-[#1a1a1a]/40 mt-1">현재는 6개 핵심 영역만 열어둡니다.</p>
          </div>
          <nav className="admin-scroll-snap-x no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 xl:block xl:space-y-1 xl:overflow-visible xl:pb-0">
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.key
              const sectionDirty = sectionDirtyTotals?.[item.key] ?? 0
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveTab(item.key)}
                  className={`flex min-w-[148px] shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all sm:gap-3 sm:px-4 sm:py-3 xl:w-full xl:min-w-0 ${
                    active
                      ? "bg-[#111110] border-[#111110] text-white shadow-sm"
                      : "bg-white border-[#e8e8e4] text-[#1a1a1a]/65 hover:border-[#c8c8c4] hover:text-[#111110]"
                  }`}
                >
                  <span className={active ? "text-white" : "text-[#1a1a1a]/40"}>{item.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">{item.label}</span>
                    <span className={`mt-0.5 hidden text-[11px] sm:block ${active ? "text-white/65" : "text-[#1a1a1a]/35"}`}>
                      {item.desc}
                    </span>
                  </span>
                  {sectionDirty > 0 ? (
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-1 text-[11px] font-medium ${
                        active ? "bg-white/15 text-white" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {sectionDirty}
                    </span>
                  ) : item.key === "cta" || item.key === "history" ? (
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-1 text-[11px] font-medium ${
                        active ? "bg-white/15 text-white" : "bg-[#f0f0ec] text-[#1a1a1a]/45"
                      }`}
                    >
                      {item.key === "cta" ? "연결 예정" : "준비중"}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </nav>

          <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-4">
            <p className="text-[12px] font-medium text-[#111110]">운영 메모</p>
            <p className="text-[12px] text-[#1a1a1a]/45 mt-1 leading-relaxed">
              리드/폼과 외부 연동은 즉시 저장 가능하고, CTA와 변경 이력은 다음 단계에서 데이터 모델을 연결합니다.
            </p>
          </div>
        </aside>

        <main className="space-y-6 min-w-0">
          {activeTab === "general" && (
            <>
              <PanelCard
                title="사이트 기능"
                description="홈페이지 주요 기능 표시 여부를 제어합니다."
                badge="즉시 반영"
              >
                <ToggleRow
                  label="데모 신청 폼"
                  description="홈페이지 데모 신청 버튼 및 모달 활성화"
                  checked={settings.demoFormEnabled}
                  onChange={(v) => set({ demoFormEnabled: v })}
                />
                <ToggleRow
                  label="블로그 섹션"
                  description="홈페이지 블로그 섹션 표시"
                  checked={settings.blogSectionEnabled}
                  onChange={(v) => set({ blogSectionEnabled: v })}
                />
                <ToggleRow
                  label="데모 배너"
                  description="상단 데모 안내 배너 표시"
                  checked={settings.demoBannerEnabled}
                  onChange={(v) => set({ demoBannerEnabled: v })}
                />
                <ToggleRow
                  label="공지 배너"
                  description="전체 공지 배너 표시"
                  checked={settings.noticeBannerEnabled}
                  onChange={(v) => set({ noticeBannerEnabled: v })}
                />
              </PanelCard>

              <PanelCard
                title="배너 문구"
                description="활성화된 배너에 표시될 텍스트를 설정합니다."
                badge="문구 관리"
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">데모 배너 문구</label>
                    <Input
                      value={settings.demoBannerText}
                      onChange={(e) => set({ demoBannerText: e.target.value })}
                      placeholder="예: 2025년 신학기 무료 체험 신청 중"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">공지 배너 문구</label>
                    <Input
                      value={settings.noticeBannerText}
                      onChange={(e) => set({ noticeBannerText: e.target.value })}
                      placeholder="예: 시스템 점검 안내 (00:00 ~ 06:00)"
                    />
                  </div>
                </div>
              </PanelCard>
            </>
          )}

          {activeTab === "lead" && (
            <>
              <PanelCard
                title="리드 흐름"
                description="데모 신청, 문의, 뉴스레터가 어디로 흘러가는지 한 번에 확인합니다."
                badge="운영 핵심"
              >
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl bg-[#fafaf8] border border-[#e8e8e4] p-4">
                    <p className="text-[12px] font-medium text-[#111110] mb-2">데모 신청</p>
                    <p className="text-[12px] text-[#1a1a1a]/45 leading-relaxed">
                      Hero, Final CTA, 모달 신청이 모두 이 경로로 들어옵니다. 리드 생성과 구독자 자동 등록이 함께 동작합니다.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#fafaf8] border border-[#e8e8e4] p-4">
                    <p className="text-[12px] font-medium text-[#111110] mb-2">문의 폼</p>
                    <p className="text-[12px] text-[#1a1a1a]/45 leading-relaxed">
                      상담 문의는 리드 테이블과 외부 연동으로 동시에 전달됩니다. 메시지 포맷은 상담 흐름에 맞게 유지합니다.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#fafaf8] border border-[#e8e8e4] p-4">
                    <p className="text-[12px] font-medium text-[#111110] mb-2">뉴스레터</p>
                    <p className="text-[12px] text-[#1a1a1a]/45 leading-relaxed">
                      푸터와 CTA에서 직접 구독되는 흐름입니다. 수신 동의 문구는 유지하고, 구독자 목록으로 축적됩니다.
                    </p>
                  </div>
                </div>
              </PanelCard>

              <PanelCard
                title="현재 활성 설정"
                description="실제 저장 가능한 값만 편집합니다."
                badge="편집 가능"
              >
                <ToggleRow
                  label="데모 신청 폼"
                  description="홈페이지 데모 신청 버튼 및 모달 활성화"
                  checked={settings.demoFormEnabled}
                  onChange={(v) => set({ demoFormEnabled: v })}
                />
                <ToggleRow
                  label="블로그 섹션"
                  description="홈페이지 블로그 섹션 표시"
                  checked={settings.blogSectionEnabled}
                  onChange={(v) => set({ blogSectionEnabled: v })}
                />
              </PanelCard>
            </>
          )}

          {activeTab === "cta" && (
            <>
              <PanelCard
                title="CTA 인벤토리"
                description="CTA는 다음 단계에서 데이터 모델을 연결할 예정입니다."
                badge="준비중"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-4">
                    <div>
                      <p className="text-[13px] font-medium text-[#111110]">Hero Primary CTA</p>
                      <p className="text-[12px] text-[#1a1a1a]/40 mt-1">도입 문의하기 · form · /contact</p>
                    </div>
                    <span className="text-[11px] px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">연결 예정</span>
                  </div>
                  <div className="flex items-start justify-between gap-4 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-4">
                    <div>
                      <p className="text-[13px] font-medium text-[#111110]">Blog Sidebar CTA</p>
                      <p className="text-[12px] text-[#1a1a1a]/40 mt-1">소개서 받기 · download · /assets/brochure</p>
                    </div>
                    <span className="text-[11px] px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">연결 예정</span>
                  </div>
                  <div className="flex items-start justify-between gap-4 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-4">
                    <div>
                      <p className="text-[13px] font-medium text-[#111110]">Final CTA</p>
                      <p className="text-[12px] text-[#1a1a1a]/40 mt-1">무료 구독 · modal · newsletter</p>
                    </div>
                    <span className="text-[11px] px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">연결 예정</span>
                  </div>
                </div>
              </PanelCard>

              <PanelCard
                title="다음 액션"
                description="CTA 화면은 구조부터 먼저 열어두고, 데이터 모델이 준비되면 즉시 연결합니다."
                badge="읽기 전용"
              >
                <EmptyHint
                  title="CTA 편집은 아직 준비중입니다."
                  description="버튼 라벨, 액션 타입, 다운로드 파일, 추적 이벤트를 한 화면에서 다루는 전용 모델이 다음 단계에서 연결됩니다."
                  action="우선은 Settings의 리드·폼과 Analytics의 CTA 성과 지표를 같이 맞춰주세요."
                />
              </PanelCard>
            </>
          )}

          {activeTab === "integrations" && (
            <>
              <PanelCard
                title="페이지 폼 웹훅"
                description="문의하기와 외부 랜딩페이지 데모 신청을 홈페이지 리드 파이프라인으로 바로 연결합니다."
                badge="복사 가능"
              >
                <div className="space-y-4">
                  <Section
                    title="Webhook URL"
                    description="홈페이지 방문 여부와 상관없이 이 주소로 POST하면 같은 CRM 리드로 저장됩니다."
                  >
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[420px]">
                      <div className="flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2">
                        <Globe className="h-4 w-4 shrink-0 text-[#1a1a1a]/35" />
                        <code className="min-w-0 flex-1 truncate text-[12px] text-[#111110]">
                          {pageWebhookUrl}
                        </code>
                        <CopyValueButton value={pageWebhookUrl} />
                      </div>
                      <div className="flex items-center gap-2 rounded-xl border border-[#e8e8e4] bg-white px-3 py-2">
                        <Code2 className="h-4 w-4 shrink-0 text-[#1a1a1a]/35" />
                        <code className="min-w-0 flex-1 truncate text-[12px] text-[#111110]">
                          {pageWebhookPath}
                        </code>
                        <CopyValueButton value={pageWebhookPath} label="경로 복사" />
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="지원 타입"
                    description="`formType`은 `demo`, `contact`, `newsletter`를 받고 내부에서는 기존 `demo_modal`, `contact_page`, `newsletter` 리드로 저장됩니다."
                  >
                    <div className="flex flex-wrap gap-2">
                      {["demo", "contact", "newsletter"].map((item) => (
                        <span
                          key={item}
                          className="inline-flex items-center rounded-full bg-[#f0f0ec] px-3 py-1 text-[11px] font-medium text-[#1a1a1a]/60"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </Section>

                  <Section
                    title="지원 필드 별칭"
                    description="외부 폼 이름이 조금 달라도 바로 연결되도록 자주 쓰는 키를 같이 받습니다."
                  >
                    <div className="w-full rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3 text-[12px] leading-relaxed text-[#1a1a1a]/55">
                      `organization/company` → 기관명, `phone/tel/mobile` → 연락처,
                      `message/content/note` → 문의 내용, `marketingConsent/marketing_consent`
                      → 수신 동의
                    </div>
                  </Section>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <CodeSnippet
                      title="fetch 예시"
                      description="외부 랜딩페이지 스크립트에서 그대로 붙일 수 있는 기본 예시입니다."
                      value={pageWebhookFetchExample}
                      copyLabel="fetch 복사"
                    />
                    <CodeSnippet
                      title="데모 신청 Payload"
                      description="랜딩페이지 데모 신청 폼용 샘플입니다."
                      value={pageWebhookDemoPayload}
                      copyLabel="데모 JSON 복사"
                    />
                    <CodeSnippet
                      title="문의하기 Payload"
                      description="간단한 문의 폼은 이 구조로 보내면 됩니다."
                      value={pageWebhookContactPayload}
                      copyLabel="문의 JSON 복사"
                    />
                    <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] p-4">
                      <p className="text-[13px] font-medium text-[#111110]">운영 메모</p>
                      <p className="mt-2 text-[12px] leading-relaxed text-[#1a1a1a]/45">
                        이 웹훅은 CORS가 열려 있어서 다른 도메인의 랜딩페이지에서도 브라우저
                        `fetch`로 바로 호출할 수 있습니다. 저장되면 CRM, 외부 리드 웹훅,
                        ChannelTalk, Google Sheet 흐름을 그대로 탑니다.
                      </p>
                    </div>
                  </div>
                </div>
              </PanelCard>

              <PanelCard
                title="외부 연동"
                description="리드 전달 및 이메일 발송에 사용되는 웹훅 URL을 설정합니다."
                badge="저장 가능"
              >
                <WebhookRow
                  label="Google Sheet Webhook"
                  description="새 리드를 Google Sheets에 자동으로 기록합니다."
                  placeholder="https://script.google.com/macros/s/..."
                  value={settings.googleSheetWebhookUrl ?? ""}
                  onChange={(v) => set({ googleSheetWebhookUrl: v })}
                  webhookType="googleSheet"
                />
                <WebhookRow
                  label="범용 리드 Webhook"
                  description="Make, n8n, Zapier 등 자동화 플랫폼과 연동합니다."
                  placeholder="https://hook.make.com/..."
                  value={settings.leadWebhookUrl ?? ""}
                  onChange={(v) => set({ leadWebhookUrl: v })}
                  webhookType="lead"
                />
                <WebhookRow
                  label="채널톡 Webhook"
                  description="새 리드를 채널톡 인박스로 전달합니다."
                  placeholder="https://talk.channel.io/hooks/..."
                  value={settings.channelTalkWebhookUrl ?? ""}
                  onChange={(v) => set({ channelTalkWebhookUrl: v })}
                  webhookType="channelTalk"
                />
                <WebhookRow
                  label="WeCom 운영 Webhook"
                  description="일반 경고 및 파트너 활동 알림에 사용됩니다."
                  placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                  value={settings.wecomOpsWebhookUrl ?? ""}
                  onChange={(v) => set({ wecomOpsWebhookUrl: v })}
                  webhookType="wecom"
                />
                <WebhookRow
                  label="WeCom 긴급 Webhook"
                  description="인시던트 및 전달 실패 에스컬레이션 채널입니다."
                  placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                  value={settings.wecomCriticalWebhookUrl ?? ""}
                  onChange={(v) => set({ wecomCriticalWebhookUrl: v })}
                  webhookType="wecom"
                />
                <WebhookRow
                  label="카카오 알림톡 Webhook"
                  description="확인서, 리마인더 등 외부 트랜잭션 알림에 사용됩니다."
                  placeholder="https://provider.example.com/kakao/..."
                  value={settings.kakaoAlimtalkWebhookUrl ?? ""}
                  onChange={(v) => set({ kakaoAlimtalkWebhookUrl: v })}
                  webhookType="kakaoAlimtalk"
                />
                <WebhookRow
                  label="이메일 발송 Webhook"
                  description="마케팅 이메일 발송에 사용됩니다. 미설정 시 시뮬레이션 모드로 동작합니다."
                  placeholder="https://api.resend.com/..."
                  value={settings.emailWebhookUrl ?? ""}
                  onChange={(v) => set({ emailWebhookUrl: v })}
                  webhookType="email"
                />
              </PanelCard>
            </>
          )}

          {activeTab === "notifications" && (
            <>
              <PanelCard
                title="알림 수신자"
                description="긴급 알림 실패 시 이메일 폴백 수신 주소를 설정합니다."
                badge="저장 가능"
              >
                <div className="space-y-5 py-2">
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
                      줄바꿈, 쉼표, 세미콜론으로 구분합니다. 긴급 알림 전달 실패 시 이메일 폴백으로 사용됩니다.
                    </p>
                  </div>
                </div>
              </PanelCard>

              <PanelCard
                title="알림 미리보기"
                description="아이콘·톤 규칙이 인박스에서 어떻게 표시되는지 확인합니다."
                badge="미리보기"
              >
                <div className="grid gap-3 py-2 md:grid-cols-3">
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
              </PanelCard>

              <PanelCard
                title="타입별 스타일"
                description="알림 타입별 기본 아이콘과 톤을 설정합니다."
                badge="저장 가능"
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
              </PanelCard>

              <PanelCard
                title="카테고리별 스타일"
                description="리드, 일정, 시스템 등 도메인 카테고리별 아이콘·톤 오버라이드입니다."
                badge="저장 가능"
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
              </PanelCard>

              <PanelCard
                title="심각도 오버라이드"
                description="경고·긴급 알림에 적용되는 최종 오버라이드 레이어입니다."
                badge="저장 가능"
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
              </PanelCard>
            </>
          )}

          {activeTab === "history" && (
            <>
              <PanelCard
                title="변경 이력"
                description="아직 리비전 모델이 연결되지 않아 UI만 먼저 준비해 둔 상태입니다."
                badge="준비중"
              >
                <div className="space-y-3">
                  <div className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-4">
                    <div className="flex items-start gap-3">
                      <History className="w-4 h-4 text-[#1a1a1a]/35 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-[#111110]">설정 버전 로그가 아직 없습니다.</p>
                        <p className="text-[12px] text-[#1a1a1a]/40 mt-1 leading-relaxed">
                          저장 이력, 변경자, 이전값/이후값 비교는 다음 단계에서 붙입니다.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] p-4">
                      <p className="text-[12px] font-medium text-[#111110] mb-1">예상되는 이력 항목</p>
                      <p className="text-[12px] text-[#1a1a1a]/45 leading-relaxed">
                        누가, 언제, 무엇을 바꿨는지 기록합니다. 배너 문구와 웹훅처럼 민감한 항목부터 먼저 쌓는 것이 좋습니다.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] p-4">
                      <p className="text-[12px] font-medium text-[#111110] mb-1">다음 연결 포인트</p>
                      <p className="text-[12px] text-[#1a1a1a]/45 leading-relaxed">
                        변경 로그 API가 준비되면 여기에 필터, 롤백, 상세 비교를 붙일 수 있습니다.
                      </p>
                    </div>
                  </div>
                </div>
              </PanelCard>

              <PanelCard
                title="다음 액션"
                description="이력 기능은 지금은 구조만 잡고, 실제 데이터는 추후 연결합니다."
                badge="안내"
              >
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-[#fafaf8] border border-[#e8e8e4] p-4">
                    <p className="text-[12px] font-medium text-[#111110] mb-1">1. 저장 로그 모델</p>
                    <p className="text-[12px] text-[#1a1a1a]/45 leading-relaxed">설정 저장 시 변경 요약과 이전 값을 함께 남깁니다.</p>
                  </div>
                  <div className="rounded-2xl bg-[#fafaf8] border border-[#e8e8e4] p-4">
                    <p className="text-[12px] font-medium text-[#111110] mb-1">2. 안전장치</p>
                    <p className="text-[12px] text-[#1a1a1a]/45 leading-relaxed">웹훅과 보안 설정은 마스킹과 재확인 흐름을 붙입니다.</p>
                  </div>
                  <div className="rounded-2xl bg-[#fafaf8] border border-[#e8e8e4] p-4">
                    <p className="text-[12px] font-medium text-[#111110] mb-1">3. 롤백 UX</p>
                    <p className="text-[12px] text-[#1a1a1a]/45 leading-relaxed">이력 탭에서 이전 버전 되돌리기 액션을 제공할 수 있습니다.</p>
                  </div>
                </div>
              </PanelCard>
            </>
          )}
        </main>
      </div>

      {toast ? <Toast msg={toast.msg} type={toast.type} /> : null}
    </div>
  )
}
