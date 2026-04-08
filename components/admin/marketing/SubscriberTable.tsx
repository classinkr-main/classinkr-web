/**
 * ─────────────────────────────────────────────────────────────
 * SubscriberTable  —  구독자 목록 테이블 컴포넌트
 * ─────────────────────────────────────────────────────────────
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
  onTagFilter?: (tag: string) => void
}

const SOURCE_LABEL: Record<string, string> = {
  demo_modal: "데모",
  contact_page: "문의",
  newsletter: "뉴스레터",
  manual: "수동",
}

export default function SubscriberTable({
  subscribers,
  onDelete,
  onCompose,
  onAddSubscriber,
  onComposeCampaign,
  onTagFilter,
}: Props) {
  if (subscribers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#e0e0dc] bg-[#fafaf8] px-5 py-12 text-center">
        <p className="text-[14px] font-medium text-[#111110]">구독자가 없습니다.</p>
        <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-[#1a1a1a]/40">
          뉴스레터 구독, 데모 신청, 문의 유입이 들어오면 이 테이블에서 바로 정리할 수 있습니다.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button type="button" size="sm" className="bg-[#084734] hover:bg-[#084734]/90" onClick={onAddSubscriber} disabled={!onAddSubscriber}>
            구독자 추가
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onComposeCampaign} disabled={!onComposeCampaign}>
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
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50 whitespace-nowrap">이름</th>
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50">이메일</th>
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50 hidden md:table-cell">학원</th>
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50">태그</th>
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50 whitespace-nowrap">상태</th>
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50 hidden lg:table-cell whitespace-nowrap">유입</th>
            <th className="text-left px-4 py-3 font-medium text-[#1a1a1a]/50 hidden lg:table-cell whitespace-nowrap">구독일</th>
            <th className="text-right px-4 py-3 font-medium text-[#1a1a1a]/50"></th>
          </tr>
        </thead>
        <tbody>
          {subscribers.map((s) => (
            <tr key={s.id} className="border-b border-[#f0f0ec] hover:bg-[#FAFAF8]/60 transition-colors">
              {/* 이름 */}
              <td className="px-4 py-3 font-medium text-[#111110] whitespace-nowrap">
                <span title={s.name}>{s.name}</span>
              </td>

              {/* 이메일 */}
              <td className="px-4 py-3 text-[12px] text-[#1a1a1a]/60 max-w-[180px]">
                <span className="block truncate" title={s.email}>{s.email}</span>
              </td>

              {/* 학원 (md 이상) */}
              <td className="px-4 py-3 text-[12px] text-[#1a1a1a]/55 hidden md:table-cell max-w-[140px]">
                <span className="block truncate" title={s.org || undefined}>{s.org || "—"}</span>
              </td>

              {/* 태그 — 최대 2개 노출, 초과 시 +N */}
              <td className="px-4 py-3">
                <TagsCell tags={s.tags} onTagFilter={onTagFilter} />
              </td>

              {/* 상태 */}
              <td className="px-4 py-3 whitespace-nowrap">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  s.status === "active"
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-500"
                }`}>
                  {s.status === "active" ? "수신중" : "거부"}
                </span>
              </td>

              {/* 유입 (lg 이상) */}
              <td className="px-4 py-3 text-[11px] text-[#1a1a1a]/40 hidden lg:table-cell whitespace-nowrap">
                {SOURCE_LABEL[s.source] ?? s.source}
              </td>

              {/* 구독일 (lg 이상) */}
              <td className="px-4 py-3 text-[11px] text-[#1a1a1a]/40 hidden lg:table-cell whitespace-nowrap">
                {new Date(s.optInAt).toLocaleDateString("ko-KR")}
              </td>

              {/* 액션 */}
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1">
                  {onCompose && (
                    <Button
                      variant="ghost"
                      size="sm"
                      title="이 구독자 기준으로 이메일 작성"
                      className="h-7 w-7 p-0 text-[#084734]/60 hover:text-[#084734] hover:bg-[#084734]/5"
                      onClick={() => onCompose(s)}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    title="구독자 삭제"
                    className="h-7 w-7 p-0 text-[#1a1a1a]/25 hover:text-red-500 hover:bg-red-50"
                    onClick={() => onDelete(s)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2.5 text-[11px] text-[#1a1a1a]/30 border-t border-[#f0f0ec]">
        {subscribers.length}명 표시 중
      </p>
    </div>
  )
}

function TagsCell({ tags, onTagFilter }: { tags: string[]; onTagFilter?: (tag: string) => void }) {
  if (tags.length === 0) return <span className="text-[11px] text-[#1a1a1a]/25">—</span>

  const visible = tags.slice(0, 2)
  const overflow = tags.length - 2

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {visible.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          title={onTagFilter ? `"${tag}" 태그로 필터` : tag}
          className={`text-[10px] px-1.5 py-0.5 bg-[#084734]/8 text-[#084734] border-0 ${
            onTagFilter ? "cursor-pointer hover:bg-[#084734]/15 transition-colors" : ""
          }`}
          onClick={onTagFilter ? () => onTagFilter(tag) : undefined}
        >
          {tag}
        </Badge>
      ))}
      {overflow > 0 && (
        <span
          className="text-[10px] text-[#1a1a1a]/35 cursor-default"
          title={tags.slice(2).join(", ")}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
