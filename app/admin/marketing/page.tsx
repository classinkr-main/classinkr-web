/**
 * ─────────────────────────────────────────────────────────────
 * /admin/marketing  —  마케팅 이메일 관리자 페이지 v2
 * ─────────────────────────────────────────────────────────────
 *
 * 탭 구성 (5개):
 *   1. 구독자 관리
 *   2. 이메일 발송
 *   3. 발송 이력
 *   4. 템플릿       — 카드 그리드 + TemplateEditorDrawer
 *   5. 자동화       — Master-Detail 2패널 레이아웃
 */

"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Plus, RefreshCw, Users, Send, History, ArrowLeft, FileText, Zap, Mail, Sparkles, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

import AdminAuthGate           from "@/components/admin/AdminAuthGate"
import LeadSegmentView         from "@/components/admin/marketing/LeadSegmentView"
import SubscriberTable         from "@/components/admin/marketing/SubscriberTable"
import SubscriberForm          from "@/components/admin/marketing/SubscriberForm"
import EmailComposer           from "@/components/admin/marketing/EmailComposer"
import CampaignHistory         from "@/components/admin/marketing/CampaignHistory"
import TemplateCard            from "@/components/admin/marketing/TemplateCard"
import TemplateEditorDrawer    from "@/components/admin/marketing/TemplateEditorDrawer"
import AutomationRuleList      from "@/components/admin/marketing/AutomationRuleList"
import AutomationRuleDetail    from "@/components/admin/marketing/AutomationRuleDetail"
import AutomationRuleSlideOver from "@/components/admin/marketing/AutomationRuleSlideOver"
import AutomationLogTable      from "@/components/admin/marketing/AutomationLogTable"
import AiCampaignComposer     from "@/components/admin/marketing/AiCampaignComposer"
import SmsComposer            from "@/components/admin/marketing/SmsComposer"

import type { Subscriber, EmailCampaign } from "@/lib/marketing-types"
import type { EmailTemplate, AutomationRule, AutomationLog } from "@/lib/automation-types"
import type { LeadRecord } from "@/lib/repositories/leads"

// ─── 인증 헬퍼 ────────────────────────────────────────────────
function getToken() { return sessionStorage.getItem("admin_password") ?? "" }

function adminFetch(url: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...options?.headers },
  })
}

// ─── 토스트 ───────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-[13px] font-medium ${
      type === "success" ? "bg-[#111110] text-white" : "bg-red-500 text-white"
    }`}>
      {msg}
    </div>
  )
}

type Tab = "subscribers" | "compose" | "ai" | "history" | "templates" | "automation" | "sms"

export default function AdminMarketingPage() {
  const [isAuthed, setIsAuthed] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>("subscribers")
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── 리드 ──
  const [leads, setLeads]                 = useState<LeadRecord[]>([])
  const [leadsLoading, setLeadsLoading]   = useState(false)
  const [subscriberSubTab, setSubscriberSubTab] = useState<"subscribers" | "leads">("subscribers")
  const [composeInitialTags, setComposeInitialTags] = useState<string[]>([])

  // ── 구독자 ──
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [loading, setLoading]         = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [isFormOpen, setIsFormOpen]   = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Subscriber | null>(null)

  // ── 캠페인 ──
  const [campaigns, setCampaigns]   = useState<EmailCampaign[]>([])
  const [sendLoading, setSendLoading] = useState(false)

  // ── 템플릿 ──
  const [templates, setTemplates]         = useState<EmailTemplate[]>([])
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false)
  const [editingTemplate, setEditingTemplate]       = useState<EmailTemplate | null>(null)
  const [templateLoading, setTemplateLoading]       = useState(false)

  // ── 자동화 ──
  const [rules, setRules]           = useState<AutomationRule[]>([])
  const [logs, setLogs]             = useState<AutomationLog[]>([])
  const [selectedRule, setSelectedRule]     = useState<AutomationRule | null>(null)
  const [ruleSlideOpen, setRuleSlideOpen]   = useState(false)
  const [editingRule, setEditingRule]       = useState<AutomationRule | null>(null)
  const [ruleLoading, setRuleLoading]       = useState(false)
  const [triggeringId, setTriggeringId]     = useState<string | undefined>()
  const [deleteRuleTarget, setDeleteRuleTarget] = useState<AutomationRule | null>(null)
  const [automationSubTab, setAutomationSubTab] = useState<"rules" | "logs">("rules")

  // ─── 데이터 페칭 ──────────────────────────────────────────
  const fetchSubscribers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminFetch("/api/admin/subscribers")
      if (res.ok) setSubscribers((await res.json()).subscribers)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/email")
      if (res.ok) setCampaigns((await res.json()).campaigns)
    } catch { /* silent */ }
  }, [])

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/automation/templates")
      if (res.ok) setTemplates((await res.json()).templates)
    } catch { /* silent */ }
  }, [])

  const fetchRules = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/automation/rules")
      if (res.ok) {
        const data = await res.json()
        setRules(data.rules)
        // selectedRule 동기화
        setSelectedRule((prev) => prev ? data.rules.find((r: AutomationRule) => r.id === prev.id) ?? null : null)
      }
    } catch { /* silent */ }
  }, [])

  const fetchLogs = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/automation/logs")
      if (res.ok) setLogs((await res.json()).logs)
    } catch { /* silent */ }
  }, [])

  const fetchLeads = useCallback(async () => {
    setLeadsLoading(true)
    try {
      const res = await adminFetch("/api/admin/leads")
      if (res.ok) setLeads((await res.json()).leads)
    } catch { /* silent */ } finally { setLeadsLoading(false) }
  }, [])

  const fetchAll = useCallback(() => {
    fetchSubscribers(); fetchCampaigns(); fetchTemplates(); fetchRules(); fetchLogs(); fetchLeads()
  }, [fetchSubscribers, fetchCampaigns, fetchTemplates, fetchRules, fetchLogs, fetchLeads])

  useEffect(() => {
    // 미들웨어에서 admin_session 쿠키로 이미 인증된 상태 — 별도 비밀번호 불필요
    setIsAuthed(true)
  }, [])

  useEffect(() => { if (isAuthed) fetchAll() }, [isAuthed, fetchAll])

  // ─── 리드 세그먼트 → 이메일 발송 ────────────────────────────
  const handleSendToSegment = (tags: string[]) => {
    setComposeInitialTags(tags)
    setActiveTab("compose")
  }

  // ─── 구독자 핸들러 ────────────────────────────────────────
  const handleAddSubscriber = async (data: { name: string; email: string; org?: string; role?: string; phone?: string; tags: string[] }) => {
    setFormLoading(true)
    try {
      await adminFetch("/api/admin/subscribers", { method: "POST", body: JSON.stringify(data) })
      setIsFormOpen(false)
      await fetchSubscribers()
    } catch { /* silent */ } finally { setFormLoading(false) }
  }

  const handleDeleteSubscriber = async () => {
    if (!deleteTarget) return
    setFormLoading(true)
    try {
      await adminFetch(`/api/admin/subscribers?id=${deleteTarget.id}`, { method: "DELETE" })
      setDeleteTarget(null)
      await fetchSubscribers()
    } catch { /* silent */ } finally { setFormLoading(false) }
  }

  // ─── 이메일 발송 핸들러 ───────────────────────────────────
  const handleSendEmail = async (data: { subject: string; body: string; targetTags: string[] }) => {
    setSendLoading(true)
    try {
      const res  = await adminFetch("/api/admin/email/send", { method: "POST", body: JSON.stringify(data) })
      const result = await res.json()
      if (result.ok) { showToast(`${result.recipientCount}명에게 발송 완료`); await fetchCampaigns(); setActiveTab("history") }
      else showToast(result.error || "발송 실패", "error")
    } catch { showToast("발송 중 오류", "error") } finally { setSendLoading(false) }
  }

  // ─── AI 발송 핸들러 ───────────────────────────────────────
  const handleAiSend = async (data: { brief: string; targetTags: string[]; recipientCount: number }) => {
    setSendLoading(true)
    try {
      // 수신자 목록 구성 (태그 필터)
      const matched = data.targetTags.length === 0
        ? subscribers.filter((s) => s.status === "active")
        : subscribers.filter((s) => s.status === "active" && data.targetTags.some((t) => s.tags.includes(t)))

      // 각 수신자에 대해 AI 생성 + 발송
      const token = getToken()
      const personalized = await Promise.all(
        matched.map(async (s) => {
          try {
            const res = await fetch("/api/admin/marketing/ai", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                brief: data.brief,
                recipient: { name: s.name, org: s.org, role: s.role, phone: s.phone, size: s.size, source: s.source, tags: s.tags },
              }),
            })
            const json = await res.json()
            return { email: s.email, name: s.name, subject: json.subject ?? "클래스인 안내", personalizedBody: json.body ?? "" }
          } catch {
            return null
          }
        })
      )

      const valid = personalized.filter(Boolean) as { email: string; name: string; subject: string; personalizedBody: string }[]
      if (valid.length === 0) { showToast("발송 대상이 없습니다.", "error"); return }

      // 이메일 웹훅 호출
      const res = await adminFetch("/api/admin/email/send", {
        method: "POST",
        body: JSON.stringify({ subject: data.brief.slice(0, 50), body: "(AI 개인화)", targetTags: data.targetTags, aiPersonalized: valid }),
      })
      const result = await res.json()
      if (result.ok || result.recipientCount >= 0) {
        showToast(`${valid.length}명에게 AI 개인화 발송 완료`)
        await fetchCampaigns()
        setActiveTab("history")
      } else {
        showToast(result.error || "발송 실패", "error")
      }
    } catch { showToast("AI 발송 중 오류", "error") } finally { setSendLoading(false) }
  }

  // ─── 템플릿 핸들러 ────────────────────────────────────────
  const handleSaveTemplate = async (data: { name: string; subject: string; body: string; variables: string[] }) => {
    setTemplateLoading(true)
    try {
      if (editingTemplate) {
        await adminFetch(`/api/admin/automation/templates/${editingTemplate.id}`, { method: "PATCH", body: JSON.stringify(data) })
        showToast("템플릿이 수정되었습니다.")
      } else {
        await adminFetch("/api/admin/automation/templates", { method: "POST", body: JSON.stringify(data) })
        showToast("템플릿이 생성되었습니다.")
      }
      setTemplateDrawerOpen(false)
      setEditingTemplate(null)
      await fetchTemplates()
    } catch { showToast("저장 실패", "error") } finally { setTemplateLoading(false) }
  }

  const handleDuplicateTemplate = async (t: EmailTemplate) => {
    try {
      await adminFetch("/api/admin/automation/templates", {
        method: "POST",
        body: JSON.stringify({ name: `${t.name} (복사본)`, subject: t.subject, body: t.body, variables: t.variables }),
      })
      showToast("템플릿이 복제되었습니다.")
      await fetchTemplates()
    } catch { showToast("복제 실패", "error") }
  }

  const handleDeleteTemplate = async (t: EmailTemplate) => {
    if (!confirm(`"${t.name}" 템플릿을 삭제하시겠습니까?`)) return
    await adminFetch(`/api/admin/automation/templates/${t.id}`, { method: "DELETE" })
    showToast("템플릿이 삭제되었습니다.")
    await fetchTemplates()
  }

  // ─── 자동화 규칙 핸들러 ───────────────────────────────────
  const handleSaveRule = async (data: Parameters<typeof adminFetch>[1] extends undefined ? never : object) => {
    setRuleLoading(true)
    try {
      if (editingRule) {
        await adminFetch(`/api/admin/automation/rules/${editingRule.id}`, { method: "PATCH", body: JSON.stringify(data) })
        showToast("규칙이 수정되었습니다.")
      } else {
        await adminFetch("/api/admin/automation/rules", { method: "POST", body: JSON.stringify(data) })
        showToast("규칙이 생성되었습니다.")
      }
      setRuleSlideOpen(false)
      setEditingRule(null)
      await fetchRules()
    } catch { showToast("저장 실패", "error") } finally { setRuleLoading(false) }
  }

  const handleToggleRuleStatus = async (rule: AutomationRule) => {
    const newStatus = rule.status === "active" ? "paused" : "active"
    await adminFetch(`/api/admin/automation/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) })
    showToast(newStatus === "active" ? "규칙이 활성화되었습니다." : "규칙이 일시정지되었습니다.")
    await fetchRules()
  }

  const handleDeleteRule = async () => {
    if (!deleteRuleTarget) return
    await adminFetch(`/api/admin/automation/rules/${deleteRuleTarget.id}`, { method: "DELETE" })
    setDeleteRuleTarget(null)
    setSelectedRule(null)
    showToast("규칙이 삭제되었습니다.")
    await fetchRules()
  }

  const handleTriggerRule = async (rule: AutomationRule) => {
    setTriggeringId(rule.id)
    try {
      const res    = await adminFetch(`/api/admin/automation/rules/${rule.id}/trigger`, { method: "POST" })
      const result = await res.json()
      if (result.ok) showToast(`${result.recipientCount}명에게 발송 완료`)
      else showToast(result.error || "발송 실패", "error")
      await fetchLogs()
    } catch { showToast("실행 중 오류", "error") } finally { setTriggeringId(undefined) }
  }

  // ─── 인증 전 ───────────────────────────────────────────────
  if (!isAuthed) return <AdminAuthGate onAuth={() => setIsAuthed(true)} />

  const activeCount   = subscribers.filter((s) => s.status === "active").length
  const activeRules   = rules.filter((r) => r.status === "active").length
  const todaySent     = logs.filter((l) => {
    const d = new Date(l.triggeredAt); const today = new Date()
    return l.status === "sent" && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
  }).reduce((sum, l) => sum + l.recipientCount, 0)
  const successRate = logs.length === 0 ? 100 : Math.round(logs.filter((l) => l.status === "sent").length / logs.length * 100)

  const todayStr   = new Date().toISOString().slice(0, 10)
  const todayLeads = leads.filter((l) => l.timestamp.startsWith(todayStr)).length
  const lastCampaign = campaigns.filter((c) => c.status === "sent")
    .sort((a, b) => new Date(b.sentAt!).getTime() - new Date(a.sentAt!).getTime())[0]
  const lastSentDaysAgo = lastCampaign
    ? Math.floor((Date.now() - new Date(lastCampaign.sentAt!).getTime()) / 86400000)
    : null

  // ─── 렌더링 ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-[1100px] mx-auto px-6 pt-32 pb-20">

        {/* ── 헤더 ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <p className="text-[12px] font-medium text-[#1a1a1a]/30 uppercase tracking-wide">Admin</p>
              <a href="/admin/blog" className="text-[11px] text-[#084734] hover:underline flex items-center gap-1">
                <ArrowLeft className="w-3 h-3" />블로그 관리
              </a>
            </div>
            <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">마케팅 이메일</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />새로고침
            </Button>
            {activeTab === "subscribers" && subscriberSubTab === "subscribers" && (
              <Button size="sm" onClick={() => setIsFormOpen(true)}>
                <Plus className="w-4 h-4 mr-1.5" />구독자 추가
              </Button>
            )}
            {activeTab === "templates" && (
              <Button size="sm" onClick={() => { setEditingTemplate(null); setTemplateDrawerOpen(true) }}>
                <Plus className="w-4 h-4 mr-1.5" />새 템플릿
              </Button>
            )}
            {activeTab === "automation" && automationSubTab === "rules" && (
              <Button size="sm" onClick={() => { setEditingRule(null); setRuleSlideOpen(true) }}>
                <Plus className="w-4 h-4 mr-1.5" />새 규칙
              </Button>
            )}
          </div>
        </div>

        {/* ── 통합 요약 스탯바 (항상 표시) ── */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "오늘 신규 리드",  value: todayLeads,         color: "text-[#084734]" },
            { label: "전체 구독자",     value: subscribers.length, color: "text-[#111110]" },
            { label: "활성 구독자",     value: activeCount,        color: "text-green-600" },
            { label: "마지막 발송",     value: lastSentDaysAgo === null ? "–" : lastSentDaysAgo === 0 ? "오늘" : `${lastSentDaysAgo}일 전`, color: "text-[#111110]" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-[#e8e8e4] p-4 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-[11px] text-[#1a1a1a]/40 mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* ── 탭 네비게이션 ── */}
        <div className="flex gap-1 mb-6 bg-white rounded-lg border border-[#e8e8e4] p-1 w-fit">
          {([
            { key: "subscribers" as Tab, label: "구독자 관리", icon: Users },
            { key: "compose"     as Tab, label: "이메일 발송", icon: Send },
            { key: "ai"          as Tab, label: "AI 발송",     icon: Sparkles, badge: "NEW" },
            { key: "history"     as Tab, label: "발송 이력",   icon: History },
            { key: "templates"   as Tab, label: "템플릿",      icon: FileText },
            { key: "automation"  as Tab, label: "자동화",      icon: Zap },
            { key: "sms"         as Tab, label: "SMS",         icon: MessageSquare },
          ] as { key: Tab; label: string; icon: React.ElementType; badge?: string }[]).map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-medium transition-colors ${
                activeTab === key ? "bg-[#084734] text-white" : "text-[#1a1a1a]/50 hover:text-[#1a1a1a]/80 hover:bg-[#FAFAF8]"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />{label}
              {badge && activeTab !== key && (
                <span className="text-[9px] px-1 rounded-full font-bold ml-0.5 bg-violet-100 text-violet-600">
                  {badge}
                </span>
              )}
              {key === "automation" && activeRules > 0 && (
                <span className={`text-[9px] px-1 rounded-full font-bold ml-0.5 ${
                  activeTab === key ? "bg-white/20 text-white" : "bg-green-100 text-green-600"
                }`}>{activeRules}</span>
              )}
            </button>
          ))}
        </div>

        {/* ──────── 탭 콘텐츠 ──────── */}

        {/* 구독자 */}
        {activeTab === "subscribers" && (
          <>
            {/* 서브탭 */}
            <div className="flex gap-1 mb-4 bg-white rounded-lg border border-[#e8e8e4] p-1 w-fit">
              {([
                { key: "subscribers" as const, label: "구독자" },
                { key: "leads"       as const, label: `리드${leads.length > 0 ? ` (${leads.length})` : ""}` },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSubscriberSubTab(key)}
                  className={`px-4 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                    subscriberSubTab === key ? "bg-[#084734] text-white" : "text-[#1a1a1a]/50 hover:text-[#1a1a1a]/80"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {subscriberSubTab === "subscribers" && (
              <div className="bg-white rounded-xl border border-[#e8e8e4] overflow-hidden">
                <SubscriberTable subscribers={subscribers} onDelete={setDeleteTarget} />
              </div>
            )}

            {subscriberSubTab === "leads" && (
              <LeadSegmentView
                leads={leads}
                loading={leadsLoading}
                onRefresh={fetchLeads}
                onSendToSegment={handleSendToSegment}
              />
            )}
          </>
        )}

        {/* 이메일 발송 */}
        {activeTab === "compose" && (
          <EmailComposer
            onSend={handleSendEmail}
            loading={sendLoading}
            subscriberCount={activeCount}
            initialTags={composeInitialTags}
            onClearInitialTags={() => setComposeInitialTags([])}
          />
        )}

        {/* AI 발송 */}
        {activeTab === "ai" && (
          <AiCampaignComposer
            subscribers={subscribers}
            onSend={handleAiSend}
            loading={sendLoading}
          />
        )}

        {/* 발송 이력 */}
        {activeTab === "history" && (
          <div className="bg-white rounded-xl border border-[#e8e8e4] overflow-hidden">
            <CampaignHistory campaigns={campaigns} />
          </div>
        )}

        {/* SMS */}
        {activeTab === "sms" && <SmsComposer />}

        {/* ── 템플릿 탭 — 카드 그리드 ── */}
        {activeTab === "templates" && (
          <>
            {templates.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#e8e8e4] text-center py-20">
                <div className="w-12 h-12 rounded-2xl bg-[#f0f0ec] flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-5 h-5 text-[#1a1a1a]/30" />
                </div>
                <p className="text-[14px] font-semibold text-[#111110] mb-1">템플릿이 없습니다</p>
                <p className="text-[12px] text-[#1a1a1a]/40 mb-5">재사용 가능한 이메일 템플릿을 만들어보세요.</p>
                <Button size="sm" onClick={() => { setEditingTemplate(null); setTemplateDrawerOpen(true) }}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />첫 템플릿 만들기
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {templates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    rules={rules}
                    onEdit={(tmpl) => { setEditingTemplate(tmpl); setTemplateDrawerOpen(true) }}
                    onDuplicate={handleDuplicateTemplate}
                    onDelete={handleDeleteTemplate}
                  />
                ))}
                {/* 새 템플릿 카드 */}
                <button
                  onClick={() => { setEditingTemplate(null); setTemplateDrawerOpen(true) }}
                  className="bg-white rounded-xl border border-dashed border-[#e8e8e4] p-6 flex flex-col items-center justify-center gap-2 text-[#1a1a1a]/30 hover:border-[#c8c8c4] hover:text-[#1a1a1a]/50 transition-colors min-h-[140px]"
                >
                  <Plus className="w-6 h-6" />
                  <span className="text-[12px] font-medium">새 템플릿 추가</span>
                </button>
              </div>
            )}
          </>
        )}

        {/* ── 자동화 탭 — Master-Detail 2패널 ── */}
        {activeTab === "automation" && (
          <>
            {/* 자동화 전용 스탯 */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { label: "활성 자동화 규칙", value: `${activeRules}개`, sub: `전체 ${rules.length}개`, color: "text-[#084734]" },
                { label: "오늘 자동 발송",   value: `${todaySent}명`,  sub: "수신자 합계",            color: "text-[#111110]" },
                { label: "발송 성공률",      value: `${successRate}%`, sub: `전체 ${logs.length}건`,   color: successRate >= 90 ? "text-green-600" : "text-yellow-600" },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="bg-white rounded-xl border border-[#e8e8e4] p-4 text-center">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-[11px] text-[#1a1a1a]/40 mt-0.5">{label}</p>
                  <p className="text-[10px] text-[#1a1a1a]/25 mt-0.5">{sub}</p>
                </div>
              ))}
            </div>

            {/* 서브탭 */}
            <div className="flex gap-1 mb-4 bg-white rounded-lg border border-[#e8e8e4] p-1 w-fit">
              {([
                { key: "rules" as const, label: "규칙 목록" },
                { key: "logs"  as const, label: `실행 이력 ${logs.length > 0 ? `(${logs.length})` : ""}` },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setAutomationSubTab(key)}
                  className={`px-4 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                    automationSubTab === key ? "bg-[#084734] text-white" : "text-[#1a1a1a]/50 hover:text-[#1a1a1a]/80"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* 규칙 목록 — 2패널 */}
            {automationSubTab === "rules" && (
              <div className="flex gap-5 items-start" style={{ minHeight: "520px" }}>
                {/* 좌측: 규칙 리스트 (w-[360px] fixed) */}
                <div className="w-[360px] flex-shrink-0">
                  <AutomationRuleList
                    rules={rules}
                    logs={logs}
                    selectedId={selectedRule?.id}
                    onSelect={setSelectedRule}
                  />
                </div>

                {/* 우측: 규칙 상세 (flex-1) */}
                <AutomationRuleDetail
                  rule={selectedRule}
                  logs={logs}
                  triggeringId={triggeringId}
                  onEdit={(rule) => { setEditingRule(rule); setRuleSlideOpen(true) }}
                  onDelete={setDeleteRuleTarget}
                  onToggleStatus={handleToggleRuleStatus}
                  onTrigger={handleTriggerRule}
                  onShowAllLogs={() => setAutomationSubTab("logs")}
                  onCreateFirst={() => { setEditingRule(null); setRuleSlideOpen(true) }}
                />
              </div>
            )}

            {/* 실행 이력 */}
            {automationSubTab === "logs" && (
              <div className="bg-white rounded-xl border border-[#e8e8e4] overflow-hidden">
                <AutomationLogTable logs={logs} rules={rules} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ──────── 다이얼로그들 ──────── */}

      {/* 구독자 추가 */}
      <Dialog open={isFormOpen} onOpenChange={(v) => !v && setIsFormOpen(false)}>
        <DialogContent className="sm:max-w-lg bg-white">
          <DialogHeader><DialogTitle>구독자 수동 추가</DialogTitle></DialogHeader>
          <SubscriberForm onSave={handleAddSubscriber} onCancel={() => setIsFormOpen(false)} loading={formLoading} />
        </DialogContent>
      </Dialog>

      {/* 구독자 삭제 */}
      {deleteTarget && (
        <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent className="sm:max-w-sm bg-white">
            <DialogHeader><DialogTitle>구독자 삭제</DialogTitle></DialogHeader>
            <p className="text-sm text-[#1a1a1a]/60 py-2">
              <strong>{deleteTarget.name}</strong> ({deleteTarget.email})을 삭제하시겠습니까?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>취소</Button>
              <Button size="sm" variant="destructive" onClick={handleDeleteSubscriber} disabled={formLoading}>삭제</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* 규칙 삭제 확인 */}
      {deleteRuleTarget && (
        <Dialog open={!!deleteRuleTarget} onOpenChange={() => setDeleteRuleTarget(null)}>
          <DialogContent className="sm:max-w-sm bg-white">
            <DialogHeader><DialogTitle>규칙 삭제</DialogTitle></DialogHeader>
            <p className="text-sm text-[#1a1a1a]/60 py-2">
              <strong>{deleteRuleTarget.name}</strong> 규칙을 삭제하시겠습니까?
              <br /><span className="text-[12px] text-[#1a1a1a]/40">연결된 실행 로그도 함께 삭제됩니다.</span>
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteRuleTarget(null)}>취소</Button>
              <Button size="sm" variant="destructive" onClick={handleDeleteRule}>삭제</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── 슬라이드오버들 (Dialog 아님, fixed overlay) ── */}

      <TemplateEditorDrawer
        open={templateDrawerOpen}
        initial={editingTemplate ?? undefined}
        onSave={handleSaveTemplate}
        onClose={() => { setTemplateDrawerOpen(false); setEditingTemplate(null) }}
        loading={templateLoading}
      />

      <AutomationRuleSlideOver
        open={ruleSlideOpen}
        templates={templates}
        initial={editingRule ?? undefined}
        onSave={async (data) => { await handleSaveRule(data) }}
        onClose={() => { setRuleSlideOpen(false); setEditingRule(null) }}
        adminToken={getToken()}
        loading={ruleLoading}
      />

      {/* 토스트 */}
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
