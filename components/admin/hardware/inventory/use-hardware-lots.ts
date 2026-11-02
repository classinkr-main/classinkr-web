"use client"

// 품목별 물류번호 잔여 캐시 — 출고 폼·바구니 줄·확정 다이얼로그가 같은 조회를 나눠 쓴다.
// 저장이 끝나면 invalidate() 로 비운다(잔여가 바뀌었으므로). 조회 실패는 "모름"으로 남겨 화면은 막지 않고
// 서버 422 가 막게 둔다 — 구서버(lots 라우트 없음)에서도 출고가 멈추지 않는다.

import { useCallback, useRef, useState } from "react"

import { fetchHardwareLots, type HardwareLotsResult } from "./hardware-lookups"
import { NO_LOT_REQUIREMENT, type LotRequirement } from "./outbound-v2-model"

export type LotLookupEntry =
  | { status: "loading" }
  | { status: "ready"; data: HardwareLotsResult }
  | { status: "error"; message: string }

export function lotLookupKey(itemId: string | null | undefined, productName: string, excludeMovementId?: string | null): string {
  return `${itemId || `name:${productName.trim()}`}|${excludeMovementId ?? ""}`
}

/**
 * 조회 결과 → 검증 요구. 불러오는 중이면 품목 칸(lot_tracked)으로 필수 여부만 보고, 실패면 화면은 묻지 않는다.
 */
export function lotRequirementFromEntry(
  entry: LotLookupEntry | undefined,
  item: { lot_tracked?: boolean } | null | undefined
): LotRequirement {
  if (!entry) return { lotTracked: item?.lot_tracked === true, lots: null }
  if (entry.status === "ready") return { lotTracked: entry.data.lotTracked, lots: entry.data.lots }
  if (entry.status === "loading") return { lotTracked: item?.lot_tracked !== false, lots: null }
  return NO_LOT_REQUIREMENT
}

export function useHardwareLots() {
  const [entries, setEntries] = useState<Record<string, LotLookupEntry>>({})
  // 한 번 부른 키 — 같은 키를 두 번 부르지 않는다. 실패도 invalidate 전까지 그대로 둔다(effect 재시도 반복 방지).
  const requested = useRef(new Set<string>())
  // invalidate 뒤에 도착한 옛 응답이 새 캐시를 덮지 않게 한다.
  const generation = useRef(0)

  const ensure = useCallback((input: { itemId?: string | null; productName: string; excludeMovementId?: string | null }) => {
    if (!input.itemId && !input.productName.trim()) return
    const key = lotLookupKey(input.itemId, input.productName, input.excludeMovementId)
    if (requested.current.has(key)) return
    requested.current.add(key)
    const startedAt = generation.current
    setEntries((current) => ({ ...current, [key]: { status: "loading" } }))
    void fetchHardwareLots({ itemId: input.itemId, product: input.productName, excludeMovementId: input.excludeMovementId })
      .then((data) => {
        if (generation.current !== startedAt) return
        setEntries((current) => ({ ...current, [key]: { status: "ready", data } }))
      })
      .catch((error: unknown) => {
        if (generation.current !== startedAt) return
        setEntries((current) => ({
          ...current,
          [key]: { status: "error", message: error instanceof Error ? error.message : String(error) },
        }))
      })
  }, [])

  const invalidate = useCallback(() => {
    generation.current += 1
    requested.current.clear()
    setEntries({})
  }, [])

  const get = useCallback(
    (itemId: string | null | undefined, productName: string, excludeMovementId?: string | null) =>
      entries[lotLookupKey(itemId, productName, excludeMovementId)],
    [entries]
  )

  return { entries, ensure, get, invalidate }
}

export type HardwareLotsCache = ReturnType<typeof useHardwareLots>
