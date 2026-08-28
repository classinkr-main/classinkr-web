"use client"

import { useEffect, useState } from "react"

import CrmDataCheckPanel from "@/components/admin/crm/CrmDataCheckPanel"
import { adminFetchJsonCached } from "@/lib/admin-client"
import type { AdminCrmOverview } from "@/lib/admin-crm-overview"

/**
 * 매칭 인박스의 HTML 스트림을 느린 전체 overview 집계에 묶지 않는다. 하단 보조 점검은
 * 화면이 열린 뒤 별도 요청하고, 최근 결과는 짧게 재사용한다.
 */
export default function CrmDataCheckPanelLoader() {
  const [overview, setOverview] = useState<AdminCrmOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    adminFetchJsonCached<AdminCrmOverview>("/api/admin/crm/overview", undefined, {
      cacheKey: "/api/admin/crm/overview:data-check",
      ttlMs: 30_000,
      staleWhileRevalidateMs: 2 * 60_000,
    })
      .then((data) => {
        if (!alive) return
        setOverview(data)
        setError(null)
      })
      .catch((reason) => {
        if (!alive) return
        setError(reason instanceof Error ? reason.message : "정합성 데이터를 불러오지 못했습니다.")
      })
    return () => {
      alive = false
    }
  }, [])

  return <CrmDataCheckPanel overview={overview} loading={!overview && !error} error={error} />
}
