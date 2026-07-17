"use client"

/**
 * Pager — 어드민 리스트 공용 페이저 (offset/limit 서버 페이징 전용).
 *
 * 순수 표시 + 콜백 컴포넌트: offset/total 상태는 소비처가 소유하고, Pager는
 * "N–M / 총 T{unit}" 카운트와 이전/다음 버튼만 그린다. 컨테이너(보더·배경·패딩)는
 * 소비처가 감싼다 — 화면마다 카드 하단 바(border-t)로 쓰기도 하고 독립 카드(border
 * 전체)로 쓰기도 해서, Pager 자신은 바깥 레이아웃을 강제하지 않는다. 내부는 이미
 * 모바일에서 세로로 쌓이는 반응형(`flex-col` → `sm:flex-row`)이라 소비처가 반응형을
 * 따로 신경 쓸 필요 없다.
 *
 * 사용처: components/admin/marketing/MessageLogTable.tsx,
 *        components/admin/crm/CrmActivityClient.tsx
 */

import { Button } from "@/components/ui/button"

export interface PagerProps {
  /** 현재 페이지의 시작 오프셋 (0-based) */
  offset: number
  /** 전체 항목 수 */
  total: number
  /** 페이지당 항목 수 */
  pageSize: number
  onPrev: () => void
  onNext: () => void
  /** 로딩 등 외부 사유로 이전/다음 버튼을 함께 비활성화 */
  disabled?: boolean
  /** 카운트 라벨 단위 (기본 "건") */
  unit?: string
}

export default function Pager({
  offset,
  total,
  pageSize,
  onPrev,
  onNext,
  disabled = false,
  unit = "건",
}: PagerProps) {
  if (total <= 0) return null

  const start = offset + 1
  const end = Math.min(offset + pageSize, total)
  const prevDisabled = disabled || offset <= 0
  const nextDisabled = disabled || offset + pageSize >= total

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p role="status" className="text-[11px] font-medium tabular-nums text-[#1a1a1a]/45">
        {start.toLocaleString("ko-KR")}–{end.toLocaleString("ko-KR")} / 총{" "}
        {total.toLocaleString("ko-KR")}
        {unit}
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPrev}
          disabled={prevDisabled}
          aria-label="이전 페이지"
          className="h-7 px-2.5 text-[11px]"
        >
          이전
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={nextDisabled}
          aria-label="다음 페이지"
          className="h-7 px-2.5 text-[11px]"
        >
          다음
        </Button>
      </div>
    </div>
  )
}
