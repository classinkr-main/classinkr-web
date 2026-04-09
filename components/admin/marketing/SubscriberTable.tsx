/**
 * SubscriberTable — 구독자 목록 테이블
 * 8컬럼 → 5컬럼으로 압축: 이름+학원 / 이메일 / 태그 / 상태+유입 / 액션
 */

"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Send, Trash2 } from "lucide-react"
import type { Subscriber } from "@/lib/marketing-types"

interface Props {
  subscribers: Subscriber[]
  onDelete: (subscriber: Subscriber) => void
  onCompose?: (subscriber: Subscriber) => void
  onAddSubscriber?: () => void
  onComposeCampaign?: () => void
}

const SOURCE_LABELS: Record<string, string> = {
  demo_modal:   "데모",
  contact_page: "문의",
  newsletter:   "뉴스레터",
  manual:       "수동",
}

function sourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? source
}

export default function SubscriberTable({
  subscribers,
  onDelete,
  onCompose,
  onAddSubscriber,
  onComposeCampaign,
}: Props) {
  if (subscribers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-5 py-12 text-center">
        <p className="text-[14px] font-medium text-[#111110]">구독자가 없습니다.</p>
        <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-[#1a1a1a]/40">
          뉴스레터 구독, 데모 신청, 문의 유입이 들어오면 이 테이블에서 바로 정리할 수 있습니다.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            size="sm"
            className="bg-[#084734] hover:bg-[#084734]/90"
            onClick={onAddSubscriber}
            disabled={!onAddSubscriber}
          >
            구독자 추가
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onComposeCampaign}
            disabled={!onComposeCampaign}
          >
            이메일 작성
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#e8e8e4] bg-[#FAFAF8]">
            <th className="px-4 py-3 text-left text-[12px] font-medium text-[#1a1a1a]/50">이름 / 학원</th>
            <th className="px-4 py-3 text-left text-[12px] font-medium text-[#1a1a1a]/50">이메일</th>
            <th className="px-4 py-3 text-left text-[12px] font-medium text-[#1a1a1a]/50">태그</th>
            <th className="px-4 py-3 text-left text-[12px] font-medium text-[#1a1a1a]/50">상태 / 유입</th>
            <th className="px-4 py-3 text-right text-[12px] font-medium text-[#1a1a1a]/50"></th>
          </tr>
        </thead>
        <tbody>
          {subscribers.map((s) => (
            <tr key={s.id} className="border-b border-[#e8e8e4] hover:bg-[#FAFAF8]/60">
              {/* 이름 + 학원 */}
              <td className="px-4 py-3">
                <p className="text-[13px] font-medium text-[#111110]">{s.name}</p>
                {s.org && (
                  <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">{s.org}</p>
                )}
              </td>

              {/* 이메일 */}
              <td className="max-w-[180px] px-4 py-3">
                <p className="truncate text-[12px] text-[#1a1a1a]/60">{s.email}</p>
                {s.phone && (
                  <p className="mt-0.5 text-[11px] text-[#1a1a1a]/35">{s.phone}</p>
                )}
              </td>

              {/* 태그 */}
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {s.tags.length > 0 ? s.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="border-0 bg-[#084734]/10 px-1.5 py-0.5 text-[10px] text-[#084734]"
                    >
                      {tag}
                    </Badge>
                  )) : (
                    <span className="text-[11px] text-[#1a1a1a]/30">—</span>
                  )}
                </div>
              </td>

              {/* 상태 + 유입 */}
              <td className="px-4 py-3">
                <Badge
                  variant="secondary"
                  className={`mb-1 border-0 text-[10px] ${
                    s.status === "active"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-600"
                  }`}
                >
                  {s.status === "active" ? "수신중" : "거부"}
                </Badge>
                <p className="text-[11px] text-[#1a1a1a]/35">{sourceLabel(s.source)}</p>
              </td>

              {/* 액션 */}
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  {onCompose && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 border-[#e8e8e4] px-2.5 text-[11px] text-[#084734] hover:bg-[#084734]/5"
                      onClick={() => onCompose(s)}
                    >
                      <Send className="h-3 w-3" />
                      <span className="hidden sm:inline">발송</span>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-[#1a1a1a]/25 hover:text-red-500"
                    onClick={() => onDelete(s)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
