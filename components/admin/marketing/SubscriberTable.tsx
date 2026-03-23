/**
 * ─────────────────────────────────────────────────────────────
 * SubscriberTable  —  구독자 목록 테이블 컴포넌트
 * ─────────────────────────────────────────────────────────────
 *
 * [NOTE-17] 기존 BlogPostTable 패턴을 따르되,
 *   태그 뱃지, 상태 표시, 필터 기능을 추가.
 */

"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Trash2, Mail } from "lucide-react"
import type { Subscriber } from "@/lib/marketing-types"

interface Props {
  subscribers: Subscriber[]
  onDelete: (subscriber: Subscriber) => void
}

export default function SubscriberTable({ subscribers, onDelete }: Props) {
  if (subscribers.length === 0) {
    return (
      <div className="text-center py-16 text-[#1a1a1a]/40 text-sm">
        구독자가 없습니다. 뉴스레터 구독 또는 수동 추가를 통해 구독자를 등록하세요.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#e8e8e4] bg-[#FAFAF8]">
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50">이름</th>
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50">이메일</th>
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50">학원</th>
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50">태그</th>
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50">상태</th>
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50">유입</th>
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50">구독일</th>
            <th className="text-right px-4 py-3 font-medium text-[#1a1a1a]/50"></th>
          </tr>
        </thead>
        <tbody>
          {subscribers.map((s) => (
            <tr key={s.id} className="border-b border-[#e8e8e4] hover:bg-[#FAFAF8]/50">
              <td className="px-4 py-3 font-medium text-[#111110]">{s.name}</td>
              <td className="px-4 py-3 text-[#1a1a1a]/60">
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  {s.email}
                </span>
              </td>
              <td className="px-4 py-3 text-[#1a1a1a]/60">{s.org || "—"}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {s.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0.5 bg-[#084734]/10 text-[#084734] border-0"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3">
                {/* [NOTE-7] 상태에 따른 뱃지 색상 구분 */}
                <Badge
                  variant={s.status === "active" ? "default" : "secondary"}
                  className={
                    s.status === "active"
                      ? "bg-green-100 text-green-700 border-0 text-[10px]"
                      : "bg-red-100 text-red-600 border-0 text-[10px]"
                  }
                >
                  {s.status === "active" ? "수신중" : "거부"}
                </Badge>
              </td>
              <td className="px-4 py-3 text-[11px] text-[#1a1a1a]/40">
                {sourceLabel(s.source)}
              </td>
              <td className="px-4 py-3 text-[11px] text-[#1a1a1a]/40">
                {new Date(s.optInAt).toLocaleDateString("ko-KR")}
              </td>
              <td className="px-4 py-3 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                  onClick={() => onDelete(s)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function sourceLabel(source: string) {
  switch (source) {
    case "demo_modal": return "데모신청"
    case "contact_page": return "문의"
    case "newsletter": return "뉴스레터"
    case "manual": return "수동추가"
    default: return source
  }
}
