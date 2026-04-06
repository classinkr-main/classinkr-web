"use client"

import { useState, useEffect, useCallback } from "react"
import type { ReactNode } from "react"
import {
  Save,
  CheckCircle2,
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
} from "lucide-react"
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
    <div className="flex flex-col gap-3 py-4 border-b border-[#e8e8e4] last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[14px] font-medium text-[#111110]">{label}</p>
        <p className="text-[12px] text-[#1a1a1a]/40 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 self-start rounded-full transition-colors shrink-0 sm:self-auto ${checked ? "bg-[#111110]" : "bg-[#e8e8e4]"}`}
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-[#111110]">{label}</p>
          <p className="text-[12px] text-[#1a1a1a]/40 mt-0.5 mb-3">{description}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="flex-1 text-[13px] font-mono"
            />
            <button
              onClick={handleTest}
              disabled={status === "testing"}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium border transition-all whitespace-nowrap sm:shrink-0 ${
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
          <a href={value} target="_blank" rel="noopener noreferrer" className="self-start text-[#1a1a1a]/30 transition-colors hover:text-[#1a1a1a]/60 sm:mt-6">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}

type SettingsTab = "general" | "lead" | "cta" | "integrations" | "history"

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
    key: "history",
    label: "변경 이력",
    desc: "준비중인 리비전 로그",
    icon: <History className="w-4 h-4" />,
  },
]

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
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>("general")

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
    return <div className="px-4 pt-8 text-[13px] text-[#1a1a1a]/30 sm:px-6 sm:pt-10 lg:px-8">불러오는 중...</div>
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button size="sm" variant="outline" className="w-full gap-1.5 bg-white sm:w-auto">
            <Sparkles className="w-4 h-4" />
            미리보기
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="w-full gap-1.5 sm:w-auto">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)] items-start">
        <aside className="space-y-3 xl:sticky xl:top-6">
          <div className="rounded-2xl border border-[#e8e8e4] bg-white px-4 py-4">
            <p className="text-[12px] font-semibold text-[#111110]">설정 카테고리</p>
            <p className="text-[12px] text-[#1a1a1a]/40 mt-1">현재는 5개 핵심 영역만 열어둡니다.</p>
          </div>
          <nav className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] xl:block xl:space-y-1 xl:overflow-visible xl:pb-0">
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveTab(item.key)}
                  className={`flex min-w-[156px] shrink-0 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all xl:w-full xl:min-w-0 ${
                    active
                      ? "bg-[#111110] border-[#111110] text-white shadow-sm"
                      : "bg-white border-[#e8e8e4] text-[#1a1a1a]/65 hover:border-[#c8c8c4] hover:text-[#111110]"
                  }`}
                >
                  <span className={active ? "text-white" : "text-[#1a1a1a]/40"}>{item.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">{item.label}</span>
                    <span className={`block text-[11px] mt-0.5 ${active ? "text-white/65" : "text-[#1a1a1a]/35"}`}>
                      {item.desc}
                    </span>
                  </span>
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

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
