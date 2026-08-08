"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, Users } from "lucide-react"

import { adminFetchJsonCached } from "@/lib/admin-client"
import type { PublicEvent } from "@/lib/types/public-events"

interface AttendanceOriginStat {
  origin: string
  attended: number
  converted: number
}

interface EventAttendanceMatrix {
  eventId: string
  total: number
  converted: number
  leadAttended: number
  byOrigin: AttendanceOriginStat[]
}

// 표 컬럼으로 보여줄 출신(unknown 제외, 참석계엔 모두 포함)
const ORIGIN_COLUMNS: Array<{ key: string; label: string }> = [
  { key: "ad_lead", label: "광고 리드" },
  { key: "site_lead", label: "홈페이지 리드" },
  { key: "kr_team_lead", label: "KR 팀 리드" },
  { key: "new_lead", label: "행사 신규" },
  { key: "existing_customer", label: "기존 고객" },
  { key: "partner_customer", label: "파트너 고객" },
]

function attendedFor(matrix: EventAttendanceMatrix, origin: string): number {
  return matrix.byOrigin.find((o) => o.origin === origin)?.attended ?? 0
}

export function EventOriginMatrix({ className = "" }: { className?: string }) {
  const [matrices, setMatrices] = useState<Record<string, EventAttendanceMatrix> | null>(null)
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  // 재시도 키 — 에러 상태의 "다시 시도"가 이 값을 올려 fetch 이펙트를 다시 돌린다.
  // (상태 리셋은 클릭 핸들러에서 수행 — 이펙트 본문 동기 setState 금지 규칙 준수.)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([
      adminFetchJsonCached<{ matrices: Record<string, EventAttendanceMatrix> }>(
        "/api/admin/crm/event-attendance",
        undefined,
        { ttlMs: 60_000 }
      ),
      adminFetchJsonCached<PublicEvent[]>("/api/admin/events", undefined, { ttlMs: 60_000 }),
    ])
      .then(([attendance, eventList]) => {
        if (!alive) return
        setMatrices(attendance.matrices ?? {})
        setEvents(eventList)
      })
      .catch(() => {
        if (alive) setError("참석자 집계를 불러오지 못했습니다.")
      })
    return () => {
      alive = false
    }
  }, [reloadKey])

  const titleById = useMemo(() => {
    const map = new Map<string, string>()
    for (const event of events) map.set(event.id, event.title)
    return map
  }, [events])

  const rows = useMemo(() => {
    if (!matrices) return []
    return Object.values(matrices)
      .filter((m) => m.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [matrices])

  if (error) {
    return (
      <div className={`flex items-center justify-between gap-3 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3 ${className}`}>
        <p className="text-[12px] text-[#1a1a1a]/45">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setMatrices(null)
            setReloadKey((k) => k + 1)
          }}
          className="shrink-0 text-[12px] font-semibold text-[#084734] hover:underline"
        >
          다시 시도
        </button>
      </div>
    )
  }

  if (matrices === null) {
    return <div aria-busy="true" className={`h-28 animate-pulse rounded-2xl bg-[#f0f0ec] ${className}`} />
  }

  return (
    <div className={`overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white ${className}`}>
      <div className="flex items-center justify-between border-b border-[#e8e8e4] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="inline-flex rounded-lg bg-[#ECFDF5] p-1.5 text-[#084734]">
            <Users className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-[14px] font-semibold text-[#111110]">출신 × 성과</h2>
            <p className="text-[11px] text-[#1a1a1a]/40">참석자 출신별 인원과 리드 전환율</p>
          </div>
        </div>
        <Link
          href="/admin/crm/capture"
          className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a]/60 hover:text-[#111110]"
        >
          참석자 입력
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-[13px] font-medium text-[#111110]">아직 참석자 입력 데이터가 없습니다</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-[#1a1a1a]/40">
            <Link href="/admin/crm/capture" className="font-medium text-[#084734] hover:underline">
              CRM · 참석자 입력
            </Link>
            에서 행사 명단을 붙여넣고 확정하면 출신별 전환율이 집계됩니다.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-[12px]">
            <thead className="bg-[#fafaf8] text-[#1a1a1a]/45">
              <tr>
                <th className="px-3 py-2.5 font-semibold">행사</th>
                {ORIGIN_COLUMNS.map((c) => (
                  <th key={c.key} className="px-3 py-2.5 text-right font-semibold">{c.label}</th>
                ))}
                <th className="px-3 py-2.5 text-right font-semibold">참석계</th>
                <th className="px-3 py-2.5 text-right font-semibold">전환</th>
                <th className="px-3 py-2.5 text-right font-semibold">전환율</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0ec]">
              {rows.map((matrix) => {
                const rate = matrix.leadAttended > 0 ? Math.round((matrix.converted / matrix.leadAttended) * 100) : null
                return (
                  <tr key={matrix.eventId}>
                    <td className="max-w-[220px] truncate px-3 py-2.5 font-medium text-[#111110]">
                      {titleById.get(matrix.eventId) ?? "(삭제된 행사)"}
                    </td>
                    {ORIGIN_COLUMNS.map((c) => {
                      const value = attendedFor(matrix, c.key)
                      return (
                        <td key={c.key} className={`px-3 py-2.5 text-right tabular-nums ${value > 0 ? "text-[#111110]" : "text-[#A39E98]"}`}>
                          {value > 0 ? value : "—"}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[#111110]">{matrix.total}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#084734]">{matrix.converted > 0 ? matrix.converted : "—"}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                      {rate != null ? <span className="text-[#084734]">{rate}%</span> : <span className="text-[#A39E98]">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="px-4 py-2.5 text-[11px] text-[#1a1a1a]/40">
            전환율 = 리드 출신(광고·홈페이지·KR 팀·행사신규) 참석자 중 전환 완료 비율. 기존/파트너 고객은 분모에서 제외.
          </p>
        </div>
      )}
    </div>
  )
}
