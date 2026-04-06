"use client"

import { useState } from "react"
import { RefreshCw, Phone, Mail, Building2, Send, X, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { LeadRecord, LeadStatus } from "@/lib/repositories/leads"

// ─── 상수 ────────────────────────────────────────────────────
const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "신규", contacted: "연락중", converted: "전환", closed: "종료",
}
const STATUS_COLOR: Record<LeadStatus, string> = {
  new:       "bg-blue-50 text-blue-600",
  contacted: "bg-yellow-50 text-yellow-600",
  converted: "bg-green-50 text-green-600",
  closed:    "bg-[#f0f0ec] text-[#1a1a1a]/40",
}
const SOURCE_LABEL: Record<string, string> = {
  demo_modal:   "데모신청",
  contact_page: "문의",
  newsletter:   "뉴스레터",
}

// 세그먼트 필터 → PRESET_TAGS 매핑 (이메일 발송 탭으로 전달)
const SIZE_TO_TAG: Record<string, string> = {
  "100명이하":  "100명이하",
  "100~300명":  "100~300명",
  "300~500명":  "300~500명",
  "500명이상":  "500명이상",
}
const BRANCH_TO_TAG: Record<string, string> = {
  "서울": "서울",
  "경기": "경기",
  "지방": "지방",
}

// ─── Props ───────────────────────────────────────────────────
interface Props {
  leads: LeadRecord[]
  loading: boolean
  onRefresh: () => void
  onSendToSegment: (tags: string[]) => void
  onAddSubscriber?: (lead: LeadRecord) => void
}

// ─── 필터 Chip ───────────────────────────────────────────────
function FilterChip({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap ${
        active
          ? "bg-[#084734] text-white"
          : "bg-white text-[#1a1a1a]/50 border border-[#e8e8e4] hover:border-[#084734]/30 hover:text-[#084734]"
      }`}
    >
      {label}
    </button>
  )
}

// ─── 읽기 전용 드로어 ────────────────────────────────────────
function LeadDrawer({
  lead,
  onClose,
  onAddSubscriber,
}: {
  lead: LeadRecord
  onClose: () => void
  onAddSubscriber?: (lead: LeadRecord) => void
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div
        className="w-[420px] h-full bg-white shadow-2xl flex flex-col overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e4]">
          <div>
            <p className="font-semibold text-[#111110]">{lead.name || "(이름 없음)"}</p>
            <p className="text-[12px] text-[#1a1a1a]/40">{lead.org || "학원명 없음"}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#f0f0ec] text-[#1a1a1a]/40">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 px-6 py-5 space-y-5">
          {/* 상태 + 유입경로 */}
          <div className="flex gap-2">
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_COLOR[lead.status]}`}>
              {STATUS_LABEL[lead.status]}
            </span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#f0f0ec] text-[#1a1a1a]/50">
              {SOURCE_LABEL[lead.source] ?? lead.source}
            </span>
          </div>

          {/* 연락처 */}
          <div className="space-y-2">
            {lead.email && (
              <div className="flex items-center gap-2.5 text-[13px]">
                <Mail className="w-3.5 h-3.5 text-[#1a1a1a]/30 shrink-0" />
                <span className="text-[#111110]">{lead.email}</span>
              </div>
            )}
            {lead.phone && (
              <div className="flex items-center gap-2.5 text-[13px]">
                <Phone className="w-3.5 h-3.5 text-[#1a1a1a]/30 shrink-0" />
                <span className="text-[#111110]">{lead.phone}</span>
              </div>
            )}
            {lead.org && (
              <div className="flex items-center gap-2.5 text-[13px]">
                <Building2 className="w-3.5 h-3.5 text-[#1a1a1a]/30 shrink-0" />
                <span className="text-[#111110]">{lead.org}</span>
              </div>
            )}
          </div>

          {/* 상세 정보 */}
          <div className="grid grid-cols-2 gap-3">
            {lead.role && (
              <div className="bg-[#FAFAF8] rounded-lg p-3">
                <p className="text-[10px] text-[#1a1a1a]/30 mb-1">직책</p>
                <p className="text-[13px] font-medium text-[#111110]">{lead.role}</p>
              </div>
            )}
            {lead.size && (
              <div className="bg-[#FAFAF8] rounded-lg p-3">
                <p className="text-[10px] text-[#1a1a1a]/30 mb-1">규모</p>
                <p className="text-[13px] font-medium text-[#111110]">{lead.size}</p>
              </div>
            )}
            {lead.branch && (
              <div className="bg-[#FAFAF8] rounded-lg p-3">
                <p className="text-[10px] text-[#1a1a1a]/30 mb-1">지역</p>
                <p className="text-[13px] font-medium text-[#111110]">{lead.branch}</p>
              </div>
            )}
            <div className="bg-[#FAFAF8] rounded-lg p-3">
              <p className="text-[10px] text-[#1a1a1a]/30 mb-1">신청일</p>
              <p className="text-[13px] font-medium text-[#111110]">
                {new Date(lead.timestamp).toLocaleDateString("ko-KR")}
              </p>
            </div>
          </div>

          {/* 메시지 */}
          {lead.message && (
            <div className="bg-[#FAFAF8] rounded-lg p-3">
              <p className="text-[10px] text-[#1a1a1a]/30 mb-1.5">문의 내용</p>
              <p className="text-[13px] text-[#1a1a1a]/70 leading-relaxed">{lead.message}</p>
            </div>
          )}
        </div>

        {/* 푸터 */}
        {lead.email && onAddSubscriber && (
          <div className="px-6 py-4 border-t border-[#e8e8e4]">
            <Button
              size="sm"
              className="w-full bg-[#084734] hover:bg-[#084734]/90 text-white"
              onClick={() => { onAddSubscriber(lead); onClose() }}
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              구독자로 추가
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────
export default function LeadSegmentView({ leads, loading, onRefresh, onSendToSegment, onAddSubscriber }: Props) {
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [sizeFilter,   setSizeFilter]   = useState<string | null>(null)
  const [branchFilter, setBranchFilter] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(null)

  // ─── 필터링 ───────────────────────────────────────────────
  const filtered = leads.filter((l) => {
    if (sourceFilter && l.source !== sourceFilter) return false
    if (statusFilter && l.status !== statusFilter) return false
    if (sizeFilter   && l.size   !== sizeFilter)   return false
    if (branchFilter && l.branch !== branchFilter) return false
    return true
  })

  // ─── 세그먼트 → 태그 변환 ─────────────────────────────────
  const hasFilter = !!(sourceFilter || statusFilter || sizeFilter || branchFilter)

  const buildSegmentTags = (): string[] => {
    const tags: string[] = []
    if (sizeFilter   && SIZE_TO_TAG[sizeFilter])   tags.push(SIZE_TO_TAG[sizeFilter])
    if (branchFilter && BRANCH_TO_TAG[branchFilter]) tags.push(BRANCH_TO_TAG[branchFilter])
    return tags
  }

  const activeFiltersCount = [sourceFilter, statusFilter, sizeFilter, branchFilter].filter(Boolean).length

  return (
    <div className="space-y-4">
      {/* ── 필터 바 ── */}
      <div className="bg-white rounded-xl border border-[#e8e8e4] p-4 space-y-3">
        {/* 유입경로 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-medium text-[#1a1a1a]/40 w-14 shrink-0">유입경로</span>
          <div className="flex gap-1.5 flex-wrap">
            {[null, "demo_modal", "contact_page", "newsletter"].map((v) => (
              <FilterChip
                key={v ?? "all"}
                label={v ? SOURCE_LABEL[v] : "전체"}
                active={sourceFilter === v}
                onClick={() => setSourceFilter(v)}
              />
            ))}
          </div>
        </div>

        {/* 상태 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-medium text-[#1a1a1a]/40 w-14 shrink-0">상태</span>
          <div className="flex gap-1.5 flex-wrap">
            {([null, "new", "contacted", "converted", "closed"] as (LeadStatus | null)[]).map((v) => (
              <FilterChip
                key={v ?? "all"}
                label={v ? STATUS_LABEL[v] : "전체"}
                active={statusFilter === v}
                onClick={() => setStatusFilter(v)}
              />
            ))}
          </div>
        </div>

        {/* 규모 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-medium text-[#1a1a1a]/40 w-14 shrink-0">규모</span>
          <div className="flex gap-1.5 flex-wrap">
            {[null, "100명이하", "100~300명", "300~500명", "500명이상"].map((v) => (
              <FilterChip
                key={v ?? "all"}
                label={v ?? "전체"}
                active={sizeFilter === v}
                onClick={() => setSizeFilter(v)}
              />
            ))}
          </div>
        </div>

        {/* 지역 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-medium text-[#1a1a1a]/40 w-14 shrink-0">지역</span>
          <div className="flex gap-1.5 flex-wrap">
            {[null, "서울", "경기", "지방"].map((v) => (
              <FilterChip
                key={v ?? "all"}
                label={v ?? "전체"}
                active={branchFilter === v}
                onClick={() => setBranchFilter(v)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── 결과 헤더 + 액션 ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-[13px] text-[#1a1a1a]/60">
            <span className="font-semibold text-[#111110]">{filtered.length}건</span> 표시 중
            {activeFiltersCount > 0 && (
              <span className="ml-1.5 text-[11px] text-[#084734]">({activeFiltersCount}개 필터 적용)</span>
            )}
          </p>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1 rounded-md text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60 hover:bg-[#f0f0ec] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <Button
          size="sm"
          disabled={!hasFilter}
          onClick={() => onSendToSegment(buildSegmentTags())}
          className="bg-[#084734] hover:bg-[#084734]/90 text-white disabled:opacity-40"
        >
          <Send className="w-3.5 h-3.5 mr-1.5" />
          이 세그먼트에 이메일 발송
        </Button>
      </div>

      {/* ── 리드 테이블 ── */}
      <div className="bg-white rounded-xl border border-[#e8e8e4] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-[#1a1a1a]/30 text-sm">
            {loading ? "불러오는 중..." : "해당하는 리드가 없습니다."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e8e8e4] text-left">
                  <th className="py-3 px-4 text-[11px] font-medium text-[#1a1a1a]/40">신청일</th>
                  <th className="py-3 px-4 text-[11px] font-medium text-[#1a1a1a]/40">이름 / 학원</th>
                  <th className="py-3 px-4 text-[11px] font-medium text-[#1a1a1a]/40 hidden md:table-cell">연락처</th>
                  <th className="py-3 px-4 text-[11px] font-medium text-[#1a1a1a]/40 hidden md:table-cell">규모</th>
                  <th className="py-3 px-4 text-[11px] font-medium text-[#1a1a1a]/40">유입</th>
                  <th className="py-3 px-4 text-[11px] font-medium text-[#1a1a1a]/40">상태</th>
                  <th className="py-3 px-4 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-b border-[#f0f0ec] hover:bg-[#FAFAF8] cursor-pointer transition-colors"
                    onClick={() => setSelectedLead(lead)}
                  >
                    <td className="py-3 px-4 text-[12px] text-[#1a1a1a]/40 whitespace-nowrap">
                      {new Date(lead.timestamp).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-[13px] font-medium text-[#111110]">{lead.name || "-"}</p>
                      <p className="text-[11px] text-[#1a1a1a]/40">{lead.org || "-"}</p>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <p className="text-[12px] text-[#1a1a1a]/60">{lead.email || "-"}</p>
                      <p className="text-[11px] text-[#1a1a1a]/30">{lead.phone || ""}</p>
                    </td>
                    <td className="py-3 px-4 text-[12px] text-[#1a1a1a]/50 hidden md:table-cell">
                      {lead.size || "-"}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] text-[#1a1a1a]/40 bg-[#f0f0ec] px-2 py-0.5 rounded-full">
                        {SOURCE_LABEL[lead.source] ?? lead.source}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[lead.status]}`}>
                        {STATUS_LABEL[lead.status]}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <ChevronRight className="w-3.5 h-3.5 text-[#1a1a1a]/20" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 드로어 ── */}
      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onAddSubscriber={onAddSubscriber}
        />
      )}
    </div>
  )
}
