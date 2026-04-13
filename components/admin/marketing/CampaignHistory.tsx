/**
 * ─────────────────────────────────────────────────────────────
 * CampaignHistory  —  이메일 캠페인 발송 이력 테이블
 * ─────────────────────────────────────────────────────────────
 *
 * [NOTE-20] 발송 이력 확인용 테이블.
 *   행 클릭 시 캠페인 상세 모달 표시.
 */

"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Copy, Send, Users, X } from "lucide-react"
import type { EmailCampaign } from "@/lib/marketing-types"

interface Props {
  campaigns: EmailCampaign[]
  onDuplicate?: (campaign: EmailCampaign) => void
  onCreateCampaign?: () => void
  onViewSubscribers?: () => void
}

const STATUS_STYLE: Record<string, string> = {
  sent: "bg-green-50 text-green-700",
  failed: "bg-[#FEF3EE] text-[#B85C33]",
  draft: "bg-amber-50 text-amber-700",
}
const STATUS_LABEL: Record<string, string> = {
  sent: "발송완료",
  failed: "실패",
  draft: "임시저장",
}

function fmtDate(v?: string) {
  if (!v) return "—"
  return new Date(v).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })
}

export default function CampaignHistory({
  campaigns,
  onDuplicate,
  onCreateCampaign,
  onViewSubscribers,
}: Props) {
  const [detail, setDetail] = useState<EmailCampaign | null>(null)

  if (campaigns.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-5 py-12 text-center">
        <p className="text-[14px] font-medium text-[#111110]">아직 발송된 캠페인이 없습니다.</p>
        <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-[#1a1a1a]/40">
          첫 발송을 만들면 이력과 성과 요약이 함께 쌓입니다. 구독자와 초안을 먼저 연결해보세요.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button type="button" size="sm" className="bg-[#084734] hover:bg-[#084734]/90" onClick={onCreateCampaign} disabled={!onCreateCampaign}>
            <Send className="mr-1.5 h-4 w-4" />
            발송 만들기
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onViewSubscribers} disabled={!onViewSubscribers}>
            <Users className="mr-1.5 h-4 w-4" />
            구독자 보기
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e8e8e4] bg-[#FAFAF8]">
              <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50">제목</th>
              <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50 whitespace-nowrap">상태</th>
              <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50 whitespace-nowrap hidden sm:table-cell">발송 수</th>
              <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50 hidden md:table-cell">대상 태그</th>
              <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50 whitespace-nowrap hidden lg:table-cell">발송일</th>
              {onDuplicate && <th className="text-right px-4 py-3 font-medium text-[#1a1a1a]/50"></th>}
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr
                key={c.id}
                className="border-b border-[#f0f0ec] hover:bg-[#FAFAF8]/60 transition-colors cursor-pointer"
                onClick={() => setDetail(c)}
                title="클릭하여 상세 보기"
              >
                {/* 제목 */}
                <td className="px-4 py-3 font-medium text-[#111110] max-w-[260px]">
                  <span className="block truncate" title={c.subject}>{c.subject}</span>
                </td>

                {/* 상태 */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[c.status] ?? "bg-[#f0f0ec] text-[#1a1a1a]/50"}`}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </td>

                {/* 발송 수 */}
                <td className="px-4 py-3 text-[12px] text-[#1a1a1a]/60 whitespace-nowrap hidden sm:table-cell">
                  {c.recipientCount}명
                </td>

                {/* 대상 태그 */}
                <td className="px-4 py-3 hidden md:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {c.targetTags.length > 0 ? (
                      c.targetTags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-[#084734]/8 text-[#084734] border-0">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-[11px] text-[#1a1a1a]/35">전체</span>
                    )}
                    {c.targetTags.length > 2 && (
                      <span className="text-[10px] text-[#1a1a1a]/35" title={c.targetTags.slice(2).join(", ")}>
                        +{c.targetTags.length - 2}
                      </span>
                    )}
                  </div>
                </td>

                {/* 발송일 */}
                <td className="px-4 py-3 text-[11px] text-[#1a1a1a]/40 whitespace-nowrap hidden lg:table-cell">
                  {fmtDate(c.sentAt)}
                </td>

                {/* 복제 버튼 — 클릭 전파 방지 */}
                {onDuplicate && (
                  <td className="px-4 py-3 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onDuplicate(c)}
                      className="h-7 gap-1.5 border-[#e8e8e4] bg-white px-2.5 text-[11px] text-[#084734] hover:bg-[#084734]/5 hover:text-[#063523] whitespace-nowrap"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">복제</span>
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-2.5 text-[11px] text-[#1a1a1a]/30 border-t border-[#f0f0ec]">
          {campaigns.length}개 캠페인
        </p>
      </div>

      {/* 캠페인 상세 모달 */}
      {detail && (
        <div
          className="fixed inset-0 bg-black/30 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-6 py-4 border-b border-[#e8e8e4]">
              <div className="min-w-0 flex-1 pr-4">
                <p className="text-[11px] font-medium text-[#1a1a1a]/40 mb-1">캠페인 상세</p>
                <h2 className="text-[15px] font-semibold text-[#111110] leading-snug">{detail.subject}</h2>
              </div>
              <button onClick={() => setDetail(null)} className="text-[#1a1a1a]/35 hover:text-[#1a1a1a] shrink-0 mt-0.5">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* 메타 */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2.5">
                  <p className="text-[10px] font-medium text-[#1a1a1a]/35 uppercase tracking-wider">상태</p>
                  <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[detail.status] ?? ""}`}>
                    {STATUS_LABEL[detail.status] ?? detail.status}
                  </span>
                </div>
                <div className="rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2.5">
                  <p className="text-[10px] font-medium text-[#1a1a1a]/35 uppercase tracking-wider">발송 수</p>
                  <p className="mt-1 text-[15px] font-bold text-[#111110]">{detail.recipientCount}명</p>
                </div>
                <div className="rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2.5 col-span-2 sm:col-span-1">
                  <p className="text-[10px] font-medium text-[#1a1a1a]/35 uppercase tracking-wider">발송일</p>
                  <p className="mt-1 text-[12px] text-[#111110]">{fmtDate(detail.sentAt)}</p>
                </div>
              </div>

              {/* 대상 태그 */}
              <div>
                <p className="text-[11px] font-medium text-[#1a1a1a]/40 mb-2">대상 태그</p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.targetTags.length > 0 ? (
                    detail.targetTags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[11px] px-2 py-0.5 bg-[#084734]/8 text-[#084734] border-0">
                        {tag}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-[12px] text-[#1a1a1a]/40">전체 active 구독자</span>
                  )}
                </div>
              </div>

              {/* 본문 미리보기 */}
              {detail.body && (
                <div>
                  <p className="text-[11px] font-medium text-[#1a1a1a]/40 mb-2">본문 미리보기</p>
                  <div className="rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3 text-[12px] leading-relaxed text-[#1a1a1a]/70 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {detail.body}
                  </div>
                </div>
              )}
            </div>
            {onDuplicate && (
              <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#e8e8e4]">
                <Button variant="outline" size="sm" onClick={() => setDetail(null)}>
                  닫기
                </Button>
                <Button
                  size="sm"
                  className="bg-[#084734] hover:bg-[#084734]/90"
                  onClick={() => { onDuplicate(detail); setDetail(null) }}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  복제해서 작성
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
