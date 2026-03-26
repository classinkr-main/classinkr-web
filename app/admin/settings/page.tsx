"use client"

import { useState, useEffect, useCallback } from "react"
import { Save, CheckCircle2, XCircle, Loader2, ExternalLink, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { SiteSettings } from "@/lib/db"

function adminFetch(url: string, options?: RequestInit) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })
}

// ─── 토스트 ──────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-[13px] font-medium animate-in slide-in-from-bottom-2 duration-200 ${
      type === "success" ? "bg-[#111110] text-white" : "bg-red-500 text-white"
    }`}>
      {type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
      {msg}
    </div>
  )
}

// ─── 토글 행 ─────────────────────────────────────────────────────
function ToggleRow({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-[#e8e8e4] last:border-0">
      <div>
        <p className="text-[14px] font-medium text-[#111110]">{label}</p>
        <p className="text-[12px] text-[#1a1a1a]/40 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? "bg-[#111110]" : "bg-[#e8e8e4]"}`}
      >
        <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  )
}

// ─── 웹훅 행 ─────────────────────────────────────────────────────
type WebhookStatus = "idle" | "testing" | "success" | "error"

function WebhookRow({
  label, description, placeholder, value, onChange, webhookType,
}: {
  label: string; description: string; placeholder: string
  value: string; onChange: (v: string) => void; webhookType: string
}) {
  const [status, setStatus] = useState<WebhookStatus>("idle")
  const [statusMsg, setStatusMsg] = useState("")

  const handleTest = useCallback(async () => {
    if (!value.trim()) {
      setStatus("error")
      setStatusMsg("URL을 먼저 입력해주세요.")
      setTimeout(() => setStatus("idle"), 3000)
      return
    }
    setStatus("testing")
    setStatusMsg("")
    try {
      const res = await adminFetch("/api/admin/settings/test-webhook", {
        method: "POST",
        body: JSON.stringify({ type: webhookType, url: value }),
      })
      const data = await res.json()
      setStatus(data.ok ? "success" : "error")
      setStatusMsg(data.message ?? "")
    } catch {
      setStatus("error")
      setStatusMsg("요청 실패")
    }
    setTimeout(() => setStatus("idle"), 5000)
  }, [value, webhookType])

  return (
    <div className="py-5 border-b border-[#e8e8e4] last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-[#111110]">{label}</p>
          <p className="text-[12px] text-[#1a1a1a]/40 mt-0.5 mb-3">{description}</p>
          <div className="flex gap-2">
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="flex-1 text-[13px] font-mono"
            />
            <button
              onClick={handleTest}
              disabled={status === "testing"}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium border transition-all whitespace-nowrap ${
                status === "success" ? "bg-green-50 border-green-200 text-green-600"
                : status === "error" ? "bg-red-50 border-red-200 text-red-500"
                : "bg-[#f0f0ec] border-[#e8e8e4] text-[#1a1a1a]/60 hover:bg-[#e8e8e4]"
              }`}
            >
              {status === "testing" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : status === "success" ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : status === "error" ? (
                <XCircle className="w-3.5 h-3.5" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              {status === "testing" ? "테스트 중..." : status === "success" ? "성공" : status === "error" ? "실패" : "테스트"}
            </button>
          </div>
          {statusMsg && (
            <p className={`text-[11px] mt-1.5 ${status === "success" ? "text-green-600" : "text-red-400"}`}>
              {statusMsg}
            </p>
          )}
        </div>
        {value && (
          <a href={value} target="_blank" rel="noopener noreferrer" className="mt-6 text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60 transition-colors shrink-0">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}

// ─── 섹션 래퍼 ───────────────────────────────────────────────────
function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-3">
        <h2 className="text-[13px] font-semibold text-[#111110] uppercase tracking-wide">{title}</h2>
        {description && <p className="text-[12px] text-[#1a1a1a]/40 mt-0.5">{description}</p>}
      </div>
      <div className="bg-white rounded-2xl border border-[#e8e8e4] px-6">
        {children}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    adminFetch("/api/admin/settings").then((r) => r.json()).then(setSettings)
  }, [])

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try {
      await adminFetch("/api/admin/settings", { method: "PATCH", body: JSON.stringify(settings) })
      showToast("설정이 저장되었습니다.")
    } catch {
      showToast("저장에 실패했습니다.", "error")
    } finally {
      setSaving(false)
    }
  }

  const set = (patch: Partial<SiteSettings>) => setSettings((prev) => prev ? { ...prev, ...patch } : prev)

  if (!settings) {
    return <div className="px-8 pt-12 text-[13px] text-[#1a1a1a]/30">불러오는 중...</div>
  }

  return (
    <div className="px-8 pt-10 pb-20 max-w-2xl">
      {/* ── 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">Settings</h1>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "저장 중..." : "저장"}
        </Button>
      </div>

      {/* ── 사이트 기능 토글 */}
      <Section title="사이트 기능" description="홈페이지 주요 기능 표시 여부를 제어합니다.">
        <ToggleRow label="데모 신청 폼" description="홈페이지 데모 신청 버튼 및 모달 활성화" checked={settings.demoFormEnabled} onChange={(v) => set({ demoFormEnabled: v })} />
        <ToggleRow label="블로그 섹션" description="홈페이지 블로그 섹션 표시" checked={settings.blogSectionEnabled} onChange={(v) => set({ blogSectionEnabled: v })} />
        <ToggleRow label="데모 배너" description="상단 데모 안내 배너 표시" checked={settings.demoBannerEnabled} onChange={(v) => set({ demoBannerEnabled: v })} />
        <ToggleRow label="공지 배너" description="전체 공지 배너 표시" checked={settings.noticeBannerEnabled} onChange={(v) => set({ noticeBannerEnabled: v })} />
      </Section>

      {/* ── 배너 문구 */}
      <Section title="배너 문구" description="활성화된 배너에 표시될 텍스트를 설정합니다.">
        <div className="py-5 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">데모 배너 문구</label>
            <Input value={settings.demoBannerText} onChange={(e) => set({ demoBannerText: e.target.value })} placeholder="예: 2025년 신학기 무료 체험 신청 중" />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">공지 배너 문구</label>
            <Input value={settings.noticeBannerText} onChange={(e) => set({ noticeBannerText: e.target.value })} placeholder="예: 시스템 점검 안내 (00:00 ~ 06:00)" />
          </div>
        </div>
      </Section>

      {/* ── 외부 연동 */}
      <Section title="외부 연동" description="리드 전달 및 이메일 발송에 사용되는 웹훅 URL을 설정합니다. 저장 후 테스트하세요.">
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
          label="이메일 발송 Webhook"
          description="마케팅 이메일 발송에 사용됩니다. 미설정 시 시뮬레이션 모드로 동작합니다."
          placeholder="https://api.resend.com/..."
          value={settings.emailWebhookUrl ?? ""}
          onChange={(v) => set({ emailWebhookUrl: v })}
          webhookType="email"
        />
      </Section>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
