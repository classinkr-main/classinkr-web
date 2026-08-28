"use client"

// Compass 오버레이 훅 — 화면에 로드된 리드의 전화 키를 한 번에 던져 마케팅팀 콜 상태 맵을 받는다.
//
//  * 리드 목록이 바뀔 때만 다시 던진다(필터·검색은 요청을 유발하지 않는다).
//  * 실패는 down으로 표면화한다 — 빈 맵을 "매칭 없음"으로 위장하면 이미 콜이 돌고 있는
//    리드를 미접촉으로 오인한다. 화면은 down일 때 CompassBridgeDownNote를 띄운다.

import { useEffect, useMemo, useState } from "react"

import { adminFetchJson } from "@/lib/admin-client"
import { normalizePhoneKey } from "@/lib/compass/normalize"
import {
  toCompassPhoneKeys,
  type CompassOverlayEntry,
  type CompassOverlayMap,
  type CompassOverlayResponse,
} from "@/lib/compass/overlay"

export interface CompassOverlayState {
  overlay: CompassOverlayMap
  /** 브리지 장애 또는 조회 실패 — 칩을 그리지 않고 이유를 밝힌다. */
  down: boolean
  /** 매칭된 리드 수(0이면 배지를 띄우지 않는다 — 없는 숫자를 만들지 않는다). */
  matched: number
  loading: boolean
  /** 리드 한 건에 겹칠 Compass 항목. 전화가 없거나 매칭이 없으면 undefined. */
  lookup: (lead: { phone?: string | null }) => CompassOverlayEntry | undefined
}

export function useCompassOverlay(leads: Array<{ phone?: string | null }>): CompassOverlayState {
  const [overlay, setOverlay] = useState<CompassOverlayMap>({})
  const [down, setDown] = useState(false)
  const [matched, setMatched] = useState(0)
  const [loading, setLoading] = useState(false)

  const phoneKeys = useMemo(() => toCompassPhoneKeys(leads), [leads])
  // 키 집합이 실제로 달라졌을 때만 재요청한다 — 배열 정체성만 보면 SWR 갱신마다 던지게 된다.
  const signature = useMemo(() => phoneKeys.join(","), [phoneKeys])

  useEffect(() => {
    if (!signature) {
      setOverlay({})
      setMatched(0)
      setDown(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const data = await adminFetchJson<CompassOverlayResponse>("/api/admin/compass/leads-overlay", {
          method: "POST",
          body: JSON.stringify({ phoneKeys: signature.split(",") }),
        })
        if (cancelled) return
        setOverlay(data?.overlay ?? {})
        setMatched(data?.matched ?? 0)
        setDown(Boolean(data?.down))
      } catch {
        if (cancelled) return
        // 조회 자체가 실패한 경우도 화면에 미치는 결과는 같다 — 겹쳐 볼 수 없다.
        setOverlay({})
        setMatched(0)
        setDown(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [signature])

  return useMemo(
    () => ({
      overlay,
      down,
      matched,
      loading,
      lookup: (lead) => {
        const key = normalizePhoneKey(lead.phone)
        return key ? overlay[key] : undefined
      },
    }),
    [overlay, down, matched, loading]
  )
}
