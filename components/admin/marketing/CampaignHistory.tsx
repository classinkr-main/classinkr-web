/**
 * ─────────────────────────────────────────────────────────────
 * CampaignHistory  —  이메일 캠페인 발송 이력 테이블
 * ─────────────────────────────────────────────────────────────
 *
 * [NOTE-20] 발송 이력 확인용 읽기 전용 테이블.
 *   발송 상태(sent/failed), 발송 수, 대상 태그를 표시.
 */

"use client"

import { Badge } from "@/components/ui/badge"
import type { EmailCampaign } from "@/lib/marketing-types"

interface Props {
  campaigns: EmailCampaign[]
}

export default function CampaignHistory({ campaigns }: Props) {
  if (campaigns.length === 0) {
    return (
      <div className="text-center py-12 text-[#1a1a1a]/40 text-sm">
        아직 발송된 캠페인이 없습니다.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#e8e8e4] bg-[#FAFAF8]">
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50">제목</th>
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50">상태</th>
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50">발송 수</th>
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50">대상 태그</th>
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50">발송일</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.id} className="border-b border-[#e8e8e4] hover:bg-[#FAFAF8]/50">
              <td className="px-4 py-3 font-medium text-[#111110] max-w-[280px] truncate">
                {c.subject}
              </td>
              <td className="px-4 py-3">
                <Badge
                  variant="secondary"
                  className={
                    c.status === "sent"
                      ? "bg-green-100 text-green-700 border-0 text-[10px]"
                      : c.status === "failed"
                        ? "bg-red-100 text-red-600 border-0 text-[10px]"
                        : "bg-yellow-100 text-yellow-700 border-0 text-[10px]"
                  }
                >
                  {c.status === "sent" ? "발송완료" : c.status === "failed" ? "실패" : "임시저장"}
                </Badge>
              </td>
              <td className="px-4 py-3 text-[#1a1a1a]/60">{c.recipientCount}명</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {c.targetTags.length > 0 ? (
                    c.targetTags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-[#084734]/10 text-[#084734] border-0">
                        {tag}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-[11px] text-[#1a1a1a]/40">전체</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-[11px] text-[#1a1a1a]/40">
                {c.sentAt
                  ? new Date(c.sentAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
