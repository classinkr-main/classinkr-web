/**
 * ─────────────────────────────────────────────────────────────
 * /admin/marketing  —  마케팅 이메일 관리자 페이지
 * ─────────────────────────────────────────────────────────────
 *
 * [NOTE-21] 관리자 마케팅 대시보드
 *   기존 /admin/blog 페이지와 동일한 인증 체계(AdminAuthGate) 사용.
 *   3개 탭으로 구성:
 *     1. 구독자 관리 - 목록 조회, 필터, 수동 추가
 *     2. 이메일 발송 - 캠페인 작성 및 발송
 *     3. 발송 이력 - 캠페인 이력 조회
 *
 *   /admin/blog ↔ /admin/marketing 간 네비게이션 링크 포함.
 */

"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, RefreshCw, Users, Send, History, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import AdminAuthGate from "@/components/admin/AdminAuthGate"
import DeleteConfirmDialog from "@/components/admin/DeleteConfirmDialog"
import SubscriberTable from "@/components/admin/marketing/SubscriberTable"
import SubscriberForm from "@/components/admin/marketing/SubscriberForm"
import EmailComposer from "@/components/admin/marketing/EmailComposer"
import CampaignHistory from "@/components/admin/marketing/CampaignHistory"
import type { Subscriber, EmailCampaign } from "@/lib/marketing-types"

// ─── 인증 헬퍼 (기존 blog admin과 동일 패턴) ────────────────
function getToken() {
  return sessionStorage.getItem("admin_password") ?? ""
}

function adminFetch(url: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...options?.headers,
    },
  })
}

// ─── 탭 타입 ─────────────────────────────────────────────────
type Tab = "subscribers" | "compose" | "history"

export default function AdminMarketingPage() {
  const [isAuthed, setIsAuthed] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>("subscribers")

  // 구독자 상태
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [loading, setLoading] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Subscriber | null>(null)

  // 캠페인 상태
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [sendLoading, setSendLoading] = useState(false)

  // ─── 데이터 페칭 ──────────────────────────────────────────
  const fetchSubscribers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminFetch("/api/admin/subscribers")
      if (res.ok) {
        const data = await res.json()
        setSubscribers(data.subscribers)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/email")
      if (res.ok) {
        const data = await res.json()
        setCampaigns(data.campaigns)
      }
    } catch {
      // silent
    }
  }, [])

  // ─── 초기화 ────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("admin_password")) {
      setIsAuthed(true)
    }
  }, [])

  useEffect(() => {
    if (isAuthed) {
      fetchSubscribers()
      fetchCampaigns()
    }
  }, [isAuthed, fetchSubscribers, fetchCampaigns])

  // ─── 구독자 핸들러 ────────────────────────────────────────
  const handleAddSubscriber = async (data: {
    name: string; email: string; org?: string; role?: string; phone?: string; tags: string[]
  }) => {
    setFormLoading(true)
    try {
      const res = await adminFetch("/api/admin/subscribers", {
        method: "POST",
        body: JSON.stringify(data),
      })
      if (res.status === 401) {
        sessionStorage.removeItem("admin_password")
        setIsAuthed(false)
        return
      }
      setIsFormOpen(false)
      await fetchSubscribers()
    } catch {
      // silent
    } finally {
      setFormLoading(false)
    }
  }

  const handleDeleteSubscriber = async () => {
    if (!deleteTarget) return
    setFormLoading(true)
    try {
      const res = await adminFetch(`/api/admin/subscribers?id=${deleteTarget.id}`, {
        method: "DELETE",
      })
      if (res.status === 401) {
        sessionStorage.removeItem("admin_password")
        setIsAuthed(false)
        return
      }
      setDeleteTarget(null)
      await fetchSubscribers()
    } catch {
      // silent
    } finally {
      setFormLoading(false)
    }
  }

  // ─── 이메일 발송 핸들러 ───────────────────────────────────
  const handleSendEmail = async (data: { subject: string; body: string; targetTags: string[] }) => {
    setSendLoading(true)
    try {
      const res = await adminFetch("/api/admin/email/send", {
        method: "POST",
        body: JSON.stringify(data),
      })
      if (res.status === 401) {
        sessionStorage.removeItem("admin_password")
        setIsAuthed(false)
        return
      }
      const result = await res.json()
      if (result.ok) {
        alert(`${result.recipientCount}명에게 이메일이 발송되었습니다.`)
        await fetchCampaigns()
        setActiveTab("history")
      } else {
        alert(result.error || "발송에 실패했습니다.")
      }
    } catch {
      alert("발송 중 오류가 발생했습니다.")
    } finally {
      setSendLoading(false)
    }
  }

  // ─── 인증 전 ───────────────────────────────────────────────
  if (!isAuthed) {
    return <AdminAuthGate onAuth={() => setIsAuthed(true)} />
  }

  const activeCount = subscribers.filter((s) => s.status === "active").length

  // ─── 렌더링 ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-[1100px] mx-auto px-6 pt-32 pb-20">

        {/* 헤더 + 네비게이션 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <p className="text-[12px] font-medium text-[#1a1a1a]/30 uppercase tracking-wide">Admin</p>
              {/* [NOTE-21] 블로그 관리 ↔ 마케팅 관리 네비게이션 */}
              <a
                href="/admin/blog"
                className="text-[11px] text-[#084734] hover:underline flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                블로그 관리
              </a>
            </div>
            <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">마케팅 이메일</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { fetchSubscribers(); fetchCampaigns() }} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            {activeTab === "subscribers" && (
              <Button size="sm" onClick={() => setIsFormOpen(true)}>
                <Plus className="w-4 h-4 mr-1.5" />
                구독자 추가
              </Button>
            )}
          </div>
        </div>

        {/* 요약 통계 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-[#e8e8e4] p-4 text-center">
            <p className="text-2xl font-bold text-[#084734]">{subscribers.length}</p>
            <p className="text-[11px] text-[#1a1a1a]/40 mt-1">전체 구독자</p>
          </div>
          <div className="bg-white rounded-xl border border-[#e8e8e4] p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{activeCount}</p>
            <p className="text-[11px] text-[#1a1a1a]/40 mt-1">활성 구독자</p>
          </div>
          <div className="bg-white rounded-xl border border-[#e8e8e4] p-4 text-center">
            <p className="text-2xl font-bold text-[#111110]">{campaigns.length}</p>
            <p className="text-[11px] text-[#1a1a1a]/40 mt-1">발송 캠페인</p>
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex gap-1 mb-6 bg-white rounded-lg border border-[#e8e8e4] p-1 w-fit">
          {([
            { key: "subscribers" as Tab, label: "구독자 관리", icon: Users },
            { key: "compose" as Tab, label: "이메일 발송", icon: Send },
            { key: "history" as Tab, label: "발송 이력", icon: History },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-medium transition-colors ${
                activeTab === key
                  ? "bg-[#084734] text-white"
                  : "text-[#1a1a1a]/50 hover:text-[#1a1a1a]/80 hover:bg-[#FAFAF8]"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        {activeTab === "subscribers" && (
          <div className="bg-white rounded-xl border border-[#e8e8e4] overflow-hidden">
            <SubscriberTable
              subscribers={subscribers}
              onDelete={setDeleteTarget}
            />
          </div>
        )}

        {activeTab === "compose" && (
          <EmailComposer
            onSend={handleSendEmail}
            loading={sendLoading}
            subscriberCount={activeCount}
          />
        )}

        {activeTab === "history" && (
          <div className="bg-white rounded-xl border border-[#e8e8e4] overflow-hidden">
            <CampaignHistory campaigns={campaigns} />
          </div>
        )}
      </div>

      {/* 구독자 추가 다이얼로그 */}
      <Dialog open={isFormOpen} onOpenChange={(v) => !v && setIsFormOpen(false)}>
        <DialogContent className="sm:max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle>구독자 수동 추가</DialogTitle>
          </DialogHeader>
          <SubscriberForm
            onSave={handleAddSubscriber}
            onCancel={() => setIsFormOpen(false)}
            loading={formLoading}
          />
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 (기존 DeleteConfirmDialog 재사용) */}
      {deleteTarget && (
        <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent className="sm:max-w-sm bg-white">
            <DialogHeader>
              <DialogTitle>구독자 삭제</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-[#1a1a1a]/60 py-2">
              <strong>{deleteTarget.name}</strong> ({deleteTarget.email}) 구독자를 삭제하시겠습니까?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
                취소
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDeleteSubscriber}
                disabled={formLoading}
              >
                삭제
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
