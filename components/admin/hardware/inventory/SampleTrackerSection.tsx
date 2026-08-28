"use client"

import { memo, useMemo, useState } from "react"
import { ChevronDown, ChevronRight, PackagePlus } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import {
  formatNumber,
  loanElapsedDays,
  MONO_META_CLASS,
  SAMPLE_STATUS_META,
  type HardwareSampleEvent,
  type HardwareSampleUnit,
  type HardwareStockRow,
  type SampleUnitStatus,
} from "./shared"

type StatusFilter = "all" | SampleUnitStatus

const FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "loaned", label: "대여중" },
  { key: "office", label: "사무실" },
  { key: "repair", label: "수리" },
  { key: "converted", label: "판매 전환" },
  { key: "retired", label: "폐기" },
]

// 홈 위계 보호 — 유닛이 수십 개여도 기본은 행동 필요한 상단(대여중 우선 정렬)만 보여주고,
// 전체 목록은 명시적 펼침으로만 연다. 필터·정렬·행 클릭 기능은 그대로다.
const COLLAPSED_ROW_LIMIT = 8

// 장기 대여 에이징 밴드 — 대여중 유닛 전원이 장기(1~2년+)인 상태를 개별 "N일째"만으로는 조망할 수
// 없어 밴드 요약·필터를 둔다. 밴드 선택 시 상태 필터는 대여중으로 고정된다(대여중에만 의미 있는 축).
const AGING_BANDS: Array<{ key: string; label: string; minDays: number }> = [
  { key: "d90", label: "90일+", minDays: 90 },
  { key: "y1", label: "1년+", minDays: 365 },
  { key: "y2", label: "2년+", minDays: 730 },
]

interface RegisterPlanLine {
  itemId: string
  productName: string
  status: "office" | "loaned"
  count: number
}

interface SampleTrackerSectionProps {
  units: HardwareSampleUnit[] | null
  latestEvents: Record<string, HardwareSampleEvent>
  loading: boolean
  error: string | null
  stock: HardwareStockRow[] | null
  onOpenUnit: (unitId: string) => void
  onChanged: () => Promise<void> | void
}

function locationQuantity(row: HardwareStockRow, location: string): number {
  return row.locationBalances.find((balance) => balance.location === location)?.quantity ?? 0
}

function SampleTrackerSection({ units, latestEvents, loading, error, stock, onOpenUnit, onChanged }: SampleTrackerSectionProps) {
  const [filter, setFilter] = useState<StatusFilter>("all")
  const [agingMinDays, setAgingMinDays] = useState<number | null>(null)
  const [showAllRows, setShowAllRows] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)

  // 정합 대조 — 원장 위치 잔량(사무실/샘플) vs 등록 유닛 수. 양수 diff = 미등록(원클릭 등록 대상),
  // 음수 diff = 유닛이 원장보다 많음(수동 정리 필요, 배지로만 알림).
  const integrity = useMemo(() => {
    if (!stock || !units) return null
    const plan: RegisterPlanLine[] = []
    let overCount = 0
    for (const row of stock) {
      const officeExpected = Math.max(0, locationQuantity(row, "사무실"))
      const loanedExpected = Math.max(0, locationQuantity(row, "샘플"))
      if (officeExpected === 0 && loanedExpected === 0) continue
      const officeActual = units.filter((unit) => unit.product_name === row.product && unit.status === "office").length
      const loanedActual = units.filter((unit) => unit.product_name === row.product && unit.status === "loaned").length
      const officeDiff = officeExpected - officeActual
      const loanedDiff = loanedExpected - loanedActual
      if (officeDiff > 0) plan.push({ itemId: row.itemId, productName: row.product, status: "office", count: officeDiff })
      if (loanedDiff > 0) plan.push({ itemId: row.itemId, productName: row.product, status: "loaned", count: loanedDiff })
      if (officeDiff < 0) overCount += -officeDiff
      if (loanedDiff < 0) overCount += -loanedDiff
    }
    const missingCount = plan.reduce((total, line) => total + line.count, 0)
    return { plan, missingCount, overCount }
  }, [stock, units])

  const filtered = useMemo(() => {
    if (!units) return []
    let list = filter === "all" ? units : units.filter((unit) => unit.status === filter)
    if (agingMinDays != null) {
      list = list.filter((unit) => unit.status === "loaned" && (loanElapsedDays(unit.loaned_at) ?? 0) >= agingMinDays)
    }
    // 대여중(경과 오래된 순) → 사무실 → 나머지 — 행동이 필요한 유닛이 위로 온다.
    const statusRank: Record<SampleUnitStatus, number> = { loaned: 0, repair: 1, office: 2, converted: 3, retired: 4 }
    return list.slice().sort((a, b) => {
      if (statusRank[a.status] !== statusRank[b.status]) return statusRank[a.status] - statusRank[b.status]
      if (a.status === "loaned" && b.status === "loaned") {
        return (a.loaned_at ?? "9999") < (b.loaned_at ?? "9999") ? -1 : 1
      }
      return a.asset_code.localeCompare(b.asset_code, "ko")
    })
  }, [units, filter, agingMinDays])

  const counts = useMemo(() => {
    const map: Record<StatusFilter, number> = { all: units?.length ?? 0, office: 0, loaned: 0, repair: 0, converted: 0, retired: 0 }
    for (const unit of units ?? []) map[unit.status] += 1
    return map
  }, [units])

  const agingCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const band of AGING_BANDS) map[band.key] = 0
    for (const unit of units ?? []) {
      if (unit.status !== "loaned") continue
      const elapsed = loanElapsedDays(unit.loaned_at) ?? 0
      for (const band of AGING_BANDS) {
        if (elapsed >= band.minDays) map[band.key] += 1
      }
    }
    return map
  }, [units])

  const selectStatusFilter = (next: StatusFilter) => {
    setFilter(next)
    // 밴드는 대여중 전용 축 — 다른 상태로 옮기면 밴드를 해제해 빈 목록 혼란을 막는다.
    if (next !== "loaned" && next !== "all") setAgingMinDays(null)
  }

  const toggleAgingBand = (minDays: number) => {
    setAgingMinDays((current) => {
      const next = current === minDays ? null : minDays
      if (next != null) setFilter("loaned")
      return next
    })
  }

  const registerMissing = async () => {
    if (!integrity || integrity.plan.length === 0 || registering) return
    setRegistering(true)
    setRegisterError(null)
    try {
      for (const line of integrity.plan) {
        await adminFetchJson("/api/admin/hardware/samples", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "register",
            itemId: line.itemId,
            productName: line.productName,
            count: line.count,
            status: line.status,
            memo: "초기 등록(원장 잔량 백필)",
          }),
        })
      }
      await onChanged()
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : "등록에 실패했습니다.")
    } finally {
      setRegistering(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
        <div className="min-w-0">
          <p className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">샘플 트래커</p>
          <p className="mt-1 text-[12px] text-[#615D59]">
            샘플 1대 = 관리번호 1개. 행을 열면 경로(배정→대여→반환)와 메모가 한 타임라인으로 보입니다.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {integrity && integrity.overCount > 0 && (
            <span className="rounded-full bg-[#FBF1E0] px-2.5 py-1 text-[11px] font-bold text-[#A8741A]" title="유닛 수가 원장 잔량보다 많습니다 — 폐기/전환 처리로 정리하세요">
              정합 확인 {formatNumber(integrity.overCount)}대
            </span>
          )}
          {integrity && integrity.missingCount > 0 && (
            <button
              type="button"
              onClick={() => void registerMissing()}
              disabled={registering}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#084734] px-3 py-2 text-[12px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-60"
            >
              <PackagePlus className={`h-3.5 w-3.5 ${registering ? "animate-pulse" : ""}`} />
              {registering ? "등록 중" : `미등록 ${formatNumber(integrity.missingCount)}대 등록`}
            </button>
          )}
        </div>
      </div>

      {(error || registerError) && (
        <p className="border-b border-[rgba(0,0,0,0.06)] bg-[#FCE9E9] px-5 py-2.5 text-[12px] font-semibold text-[#8F2C2C]">
          {registerError ?? error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 px-5 py-3">
        {FILTERS.map((entry) => {
          const active = filter === entry.key
          const count = counts[entry.key]
          if (entry.key !== "all" && count === 0 && !active) return null
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => selectStatusFilter(entry.key)}
              aria-pressed={active}
              className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 ${
                active ? "bg-[#111110] text-white" : "bg-[#F6F5F4] text-[#615D59] hover:text-[#111110]"
              }`}
            >
              {entry.label}
              <span className="tabular-nums">{formatNumber(count)}</span>
            </button>
          )
        })}
        {AGING_BANDS.some((band) => agingCounts[band.key] > 0) && (
          <span className="mx-1 h-4 w-px bg-[rgba(0,0,0,0.08)]" aria-hidden />
        )}
        {AGING_BANDS.map((band) => {
          const count = agingCounts[band.key]
          const active = agingMinDays === band.minDays
          if (count === 0 && !active) return null
          return (
            <button
              key={band.key}
              type="button"
              onClick={() => toggleAgingBand(band.minDays)}
              aria-pressed={active}
              title={`대여 ${band.label} 경과 유닛만 보기 — 회수·전환 검토 대상`}
              className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 ${
                active ? "bg-[#7A520F] text-white" : "bg-[#FBF1E0] text-[#7A520F] hover:bg-[#ECD29C]"
              }`}
            >
              대여 {band.label}
              <span className="tabular-nums">{formatNumber(count)}</span>
            </button>
          )
        })}
      </div>

      {loading && !units ? (
        <div className="space-y-2 px-5 pb-5" aria-hidden>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-lg bg-[#F6F5F4]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-5 pb-8 pt-4 text-center text-[13px] text-[#615D59]">
          {units && units.length > 0 ? "해당 상태의 유닛이 없습니다." : "등록된 샘플 유닛이 없습니다. 위 등록 버튼으로 현재 잔량을 유닛화하세요."}
        </p>
      ) : (
        <div className="border-t border-[rgba(0,0,0,0.06)]">
          {(showAllRows ? filtered : filtered.slice(0, COLLAPSED_ROW_LIMIT)).map((unit) => {
            const meta = SAMPLE_STATUS_META[unit.status]
            const elapsed = unit.status === "loaned" ? loanElapsedDays(unit.loaned_at) : null
            const latest = latestEvents[unit.id]
            const latestMemo = latest?.memo ?? null
            return (
              <button
                key={unit.id}
                type="button"
                onClick={() => onOpenUnit(unit.id)}
                className="grid w-full cursor-pointer grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[rgba(0,0,0,0.05)] px-5 py-3 text-left transition last:border-b-0 hover:bg-[#FAFAF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/40 sm:grid-cols-[104px_150px_minmax(0,1fr)_auto]"
              >
                <span className={`truncate text-[12px] font-bold text-[#111110] ${MONO_META_CLASS}`}>{unit.asset_code}</span>
                <span className="hidden truncate text-[12.5px] font-semibold text-[#31302E] sm:block">{unit.product_name}</span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${meta.tone}`}>{meta.label}</span>
                    <span className="truncate text-[12.5px] font-semibold text-[#111110]">
                      {unit.status === "loaned" ? unit.current_customer ?? "고객 미상" : ""}
                    </span>
                    {elapsed != null && (
                      <span className="text-[11px] font-semibold tabular-nums text-[#615D59]">{formatNumber(elapsed)}일째</span>
                    )}
                  </span>
                  {latestMemo && (
                    <span className="mt-0.5 block truncate text-[11.5px] text-[#615D59]">{latestMemo}</span>
                  )}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#A39E98]" />
              </button>
            )
          })}
          {filtered.length > COLLAPSED_ROW_LIMIT && (
            <div className="border-t border-[rgba(0,0,0,0.05)] px-5 py-2.5">
              <button
                type="button"
                onClick={() => setShowAllRows((value) => !value)}
                aria-expanded={showAllRows}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-[#615D59] transition hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
              >
                {showAllRows ? "접기" : `전체 ${formatNumber(filtered.length)}개 보기 (${formatNumber(filtered.length - COLLAPSED_ROW_LIMIT)}개 더)`}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAllRows ? "rotate-180" : ""}`} />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default memo(SampleTrackerSection)
