"use client"

// Compass 오버레이 훅 — 화면에 로드된 리드의 전화 키와 리드 id 를 한 번에 던져 마케팅팀 콜 상태 맵을 받는다.
//
//  * 매칭은 리드 id(Compass 링크 home_lead — 홈페이지 폼 리드를 Compass 로 민 뒤 Compass 가 건다, 2026-11-04) 먼저, 전화 키 폴백.
//    전화가 없거나 더미 번호인 홈페이지 리드도 링크로 붙는다.
//  * 키 집합 변경·1분 주기·화면 복귀·네트워크 복구 시 조회한다. 필터·검색은 요청을 유발하지 않는다.
//  * 실패는 down으로 표면화한다 — 빈 맵을 "매칭 없음"으로 위장하면 이미 콜이 돌고 있는
//    리드를 미접촉으로 오인한다. 화면은 down일 때 CompassBridgeDownNote를 띄운다.

import { useEffect, useMemo, useRef, useState } from "react"

import { useVisibleInterval } from "@/components/admin/branch/use-visible-interval"
import { COMPASS_LIVE_REFRESH_MS } from "@/lib/compass/live-sync"

import { adminFetchJson } from "@/lib/admin-client"
import { normalizePhoneKey } from "@/lib/compass/normalize"
import {
  toCompassOverlayLeadIds,
  toCompassPhoneKeys,
  type CompassOverlayEntry,
  type CompassOverlayMap,
  type CompassOverlayResponse,
} from "@/lib/compass/overlay"

export interface CompassOverlayState {
  overlay: CompassOverlayMap
  /** 브리지 장애 또는 조회 실패 — 칩을 그리지 않고 이유를 밝힌다. */
  down: boolean
  /** 매칭된 리드 수(0이면 배지를 띄우지 않는다 — 없는 숫자를 만들지 않는다). 화면의 리드 가운데 lookup 이 맞는 수다. */
  matched: number
  loading: boolean
  updatedAt: string | null
  /** 리드 한 건에 겹칠 Compass 항목 — 리드 id 링크 먼저, 없으면 전화 키. 둘 다 없으면 undefined. */
  lookup: (lead: { id?: string | null; phone?: string | null }) => CompassOverlayEntry | undefined
}

export function useCompassOverlay(leads: Array<{ id?: string | null; phone?: string | null }>): CompassOverlayState {
  const [overlay, setOverlay] = useState<CompassOverlayMap>({})
  const [byLeadId, setByLeadId] = useState<CompassOverlayMap>({})
  const [down, setDown] = useState(false)
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const refreshRef = useRef<(() => void) | null>(null)

  const phoneKeys = useMemo(() => toCompassPhoneKeys(leads), [leads])
  const leadIds = useMemo(() => toCompassOverlayLeadIds(leads), [leads])
  // 키 집합이 실제로 달라졌을 때만 재요청한다 — 배열 정체성만 보면 SWR 갱신마다 던지게 된다.
  const signature = useMemo(() => `${phoneKeys.join(",")}|${leadIds.join(",")}`, [phoneKeys, leadIds])

  useEffect(() => {
    // 요청 목록은 signature 하나에서만 푼다 — 의존성이 signature 하나라 같은 집합이면 다시 돌지 않는다.
    const [phonePart, idPart] = signature.split("|")
    const requestPhoneKeys = phonePart ? phonePart.split(",") : []
    const requestLeadIds = idPart ? idPart.split(",") : []
    if (requestPhoneKeys.length === 0 && requestLeadIds.length === 0) {
      setOverlay({})
      setByLeadId({})
      setDown(false)
      setLoading(false)
      setUpdatedAt(null)
      refreshRef.current = null
      return
    }
    let cancelled = false
    let pending = false
    const refresh = async () => {
      if (pending || cancelled) return
      pending = true
      setLoading(true)
      try {
        const data = await adminFetchJson<CompassOverlayResponse>("/api/admin/compass/leads-overlay", {
          method: "POST",
          body: JSON.stringify({ phoneKeys: requestPhoneKeys, leadIds: requestLeadIds }),
        })
        if (cancelled) return
        if (!data || data.down) {
          setDown(true)
          return
        }
        setOverlay(data.overlay)
        setByLeadId(data.byLeadId ?? {})
        setDown(false)
        setUpdatedAt(new Date().toISOString())
      } catch {
        if (cancelled) return
        // 조회 자체가 실패한 경우도 화면에 미치는 결과는 같다 — 겹쳐 볼 수 없다.
        setDown(true)
      } finally {
        pending = false
        if (!cancelled) setLoading(false)
      }
    }
    refreshRef.current = () => { void refresh() }
    void refresh()
    const reconnect = () => { void refresh() }
    window.addEventListener("online", reconnect)
    return () => {
      cancelled = true
      refreshRef.current = null
      window.removeEventListener("online", reconnect)
    }
  }, [signature])

  useVisibleInterval(() => refreshRef.current?.(), COMPASS_LIVE_REFRESH_MS)

  return useMemo(() => {
    const lookup = (lead: { id?: string | null; phone?: string | null }): CompassOverlayEntry | undefined => {
      const id = lead.id?.trim()
      if (id && byLeadId[id]) return byLeadId[id]
      const key = normalizePhoneKey(lead.phone)
      return key ? overlay[key] : undefined
    }
    // 매칭 수는 화면의 리드 기준으로 센다 — 전화 키 수(서버 matched)로 세면 링크로만 붙은 리드가 빠지고 같은 번호의 리드 둘이 하나로 센다.
    const matched = down ? 0 : leads.reduce((count, lead) => (lookup(lead) ? count + 1 : count), 0)
    return { overlay, down, matched, loading, updatedAt, lookup }
  }, [overlay, byLeadId, down, loading, updatedAt, leads])
}
