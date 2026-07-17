"use client"

/**
 * ShowMore — 어드민 리스트 공용 "더보기/접기" (클라이언트 배열 슬라이싱 전용).
 *
 * Pager와 짝을 이루는 목록 확장 부품이지만 서버 페이징이 아니라, 이미 메모리에
 * 올라온 배열을 몇 개씩 더 드러낼 때 쓴다(무한스크롤 대체). visible 등 상태는
 * useVisibleCount 훅이 들고, <ShowMore>는 순수 표시 + 콜백만 담당한다. 컨테이너
 * (보더·배경·패딩)는 Pager와 동일하게 소비처가 감싼다.
 *
 * onCollapse는 "지금 initial보다 펼쳐진 상태일 때만" 넘길 것 — 훅이 돌려주는
 * canCollapse로 게이팅한다. 조건 없이 항상 onCollapse를 넘기면 접을 게 없을 때도
 * "접기" 버튼이 떠버린다.
 *
 * 예정 사용처(W1/W2 phase): app/admin/channel-talk/page.tsx,
 *   components/admin/marketing/LeadSegmentView.tsx 등.
 */

import { useCallback, useState } from "react"
import { Button } from "@/components/ui/button"

export interface VisibleCountState {
  /** 현재 노출 중인 항목 수 (total로 클램프됨) */
  visible: number
  /** step만큼 더 펼친다 */
  showMore: () => void
  /** initial로 되돌린다 */
  collapse: () => void
  /** 더 보여줄 항목이 남았는지 */
  canMore: boolean
  /** initial보다 펼쳐진 상태인지(접기 버튼을 보여줄지 판단용) */
  canCollapse: boolean
}

/**
 * rawVisible(내부 카운터)을 total 범위로 클램프하고 canMore/canCollapse를 파생한다.
 * 렌더마다 순수 계산이라 total이 줄어도(필터 변경 등) 별도 동기화 이펙트 없이 안전하다.
 * 훅에서 분리해 둔 이유는 이 순수 함수만 독립적으로 단위 테스트하기 위해서다
 * (useState/useCallback은 React 렌더 트리 밖에서 직접 호출할 수 없다).
 */
export function deriveVisibleState(
  rawVisible: number,
  total: number,
  initial: number
): { visible: number; canMore: boolean; canCollapse: boolean } {
  const safeTotal = Math.max(0, total)
  const visible = Math.min(Math.max(0, rawVisible), safeTotal)
  return {
    visible,
    canMore: visible < safeTotal,
    canCollapse: visible > initial,
  }
}

export function useVisibleCount(total: number, step: number, initial: number = step): VisibleCountState {
  const [rawVisible, setRawVisible] = useState(() => Math.max(0, initial))
  const { visible, canMore, canCollapse } = deriveVisibleState(rawVisible, total, initial)

  const showMore = useCallback(() => {
    setRawVisible((prev) => prev + step)
  }, [step])

  const collapse = useCallback(() => {
    setRawVisible(initial)
  }, [initial])

  return { visible, showMore, collapse, canMore, canCollapse }
}

export interface ShowMoreProps {
  /** 현재 노출 중인 항목 수 */
  visible: number
  /** 전체 항목 수 */
  total: number
  /** 한 번 더보기를 누를 때 추가로 펼칠 항목 수 */
  step: number
  onMore: () => void
  /** 펼친 상태를 초기값으로 되돌리는 콜백. canCollapse가 true일 때만 넘길 것. */
  onCollapse?: () => void
}

export default function ShowMore({ visible, total, step, onMore, onCollapse }: ShowMoreProps) {
  const remaining = Math.max(0, total - visible)
  const canMore = remaining > 0
  const moreCount = Math.min(step, remaining)

  if (!canMore && !onCollapse) return null

  return (
    <div className="flex items-center justify-center gap-1.5">
      {canMore ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onMore}
          className="h-8 px-3.5 text-[12px] font-semibold"
        >
          더보기 <span className="tabular-nums text-[#1a1a1a]/40">({moreCount.toLocaleString("ko-KR")}개 더)</span>
        </Button>
      ) : null}
      {onCollapse ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCollapse}
          className="h-8 px-3.5 text-[12px] font-semibold text-[#1a1a1a]/55"
        >
          접기
        </Button>
      ) : null}
    </div>
  )
}
