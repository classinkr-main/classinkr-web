"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, Loader2, PencilLine } from "lucide-react"

import { AdminMoneyInput } from "@/components/admin/AdminMoneyInput"
import { KRW, pct, won } from "@/components/admin/campaigns/event-format"
import { adminFetchJson } from "@/lib/admin-client"
import { AD_CHANNEL_COLOR, AD_CHANNEL_LABEL, type EventMetrics } from "@/lib/types/event-metrics"
import type { PublicEvent } from "@/lib/types/public-events"
import type { PerEventEconRow } from "@/components/admin/campaigns/tabs/types"

// 성과 입력 퀵 테이블 — "어느 행사에 무엇이 비어 있나"를 한 표에서 보고 그 자리에서 채운다.
//
// 지금까지 광고비·매출·목표는 행사 탭에서 행사를 하나씩 열어야만 보였다. 그래서 광고 탭에서
// ROI가 "—"로 뜨는 이유(매출 미입력)를 알려면 탭을 옮겨 다니며 행사를 하나씩 까봐야 했다.
// 여기서는 미입력을 배지로 드러내고, 스칼라 값(매출·목표)은 인라인으로 고친다.
//
// 광고비만 인라인이 아닌 이유: 채널별 항목(adSpendEntries) 배열이라 한 칸으로 접으면
// 채널 구분이 사라진다. 채널 배분은 전체 편집기(MetricsEditor)에서 다룬다.

const GRID =
  "grid grid-cols-[minmax(0,1.6fr)_92px_104px_92px_104px_72px_64px_44px] items-center gap-2"

type EditableField = "dealsRevenue" | "targetLeads" | "targetRevenue"

const FIELD_LABEL: Record<EditableField, string> = {
  dealsRevenue: "매출",
  targetLeads: "목표 리드",
  targetRevenue: "목표 매출",
}

// 금액 칸에만 통화 기호를 붙인다 — 목표 리드는 건수(카운트)라 ₩ 가 붙으면 단위를 오독한다.
const FIELD_PREFIX: Record<EditableField, string | undefined> = {
  dealsRevenue: "₩",
  targetLeads: undefined,
  targetRevenue: "₩",
}

const SAVED_MS = 1500

export function EventMetricsQuickTable({
  rows,
  onSaved,
  onOpenFullEditor,
}: {
  rows: PerEventEconRow[]
  onSaved: (metrics: EventMetrics) => void
  onOpenFullEditor: (event: PublicEvent) => void
}) {
  // 행 단위 상태 — 단일 슬롯이면 두 행을 연속 커밋할 때 먼저 끝난 요청이 다른 행의
  // 잠금·스피너를 풀고, 에러도 마지막 하나만 남아 다중 실패가 은폐된다.
  // 필드까지 함께 들고 있는 이유: 실패한 칸에 표식을 붙이지 않으면 "저장된 값"과
  // "실패해 안 실린 값"이 화면에서 똑같이 보인다.
  const [savingField, setSavingField] = useState<Record<string, EditableField>>({})
  const [savedField, setSavedField] = useState<Record<string, EditableField>>({})
  const [errors, setErrors] = useState<Record<string, { field: EditableField; message: string }>>({})
  const savedTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    const timers = savedTimersRef.current
    return () => {
      for (const timer of Object.values(timers)) clearTimeout(timer)
    }
  }, [])

  // 최근 시작한 행사부터 — 성과를 채워야 할 대상은 대개 방금 끝난 행사다.
  const sorted = useMemo(
    () => [...rows].sort((a, b) => new Date(b.event.startsAt).getTime() - new Date(a.event.startsAt).getTime()),
    [rows]
  )

  const missingRevenue = sorted.filter((row) => row.metrics.dealsRevenue == null).length
  // "미입력"은 채널 항목이 아예 없는 행사다 — 금액 0 을 명시로 넣은 행사를 미입력으로 세지 않는다.
  const missingSpend = sorted.filter((row) => (row.metrics.adSpendEntries ?? []).length === 0).length

  async function saveField(row: PerEventEconRow, field: EditableField, next: number | null) {
    const id = row.event.id
    const savedTimer = savedTimersRef.current[id]
    if (savedTimer) clearTimeout(savedTimer)
    setSavingField((prev) => ({ ...prev, [id]: field }))
    setSavedField((prev) => {
      if (!(id in prev)) return prev
      const rest = { ...prev }
      delete rest[id]
      return rest
    })
    setErrors((prev) => {
      if (!(id in prev)) return prev
      const rest = { ...prev }
      delete rest[id]
      return rest
    })
    try {
      // PATCH는 본문 전체를 정본으로 삼는다(빠진 필드는 null로 초기화된다).
      // 그래서 한 칸만 고쳐도 현재 메트릭 전체를 다시 실어 보낸다 — 부분 전송은 다른 값을 지운다.
      const saved = await adminFetchJson<EventMetrics>(`/api/admin/event-metrics/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...row.metrics, [field]: next }),
      })
      onSaved(saved)
      // 짧은 성공 확인 — 값이 그대로 보이는 칸에서는 "저장됐다"가 화면에 전혀 안 남는다.
      setSavedField((prev) => ({ ...prev, [id]: field }))
      savedTimersRef.current[id] = setTimeout(() => {
        setSavedField((prev) => {
          if (prev[id] !== field) return prev
          const rest = { ...prev }
          delete rest[id]
          return rest
        })
      }, SAVED_MS)
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [id]: {
          field,
          message:
            e instanceof Error
              ? `${FIELD_LABEL[field]} 저장 실패 — ${e.message}`
              : "성과 저장에 실패했습니다.",
        },
      }))
    } finally {
      setSavingField((prev) => {
        if (!(id in prev)) return prev
        const rest = { ...prev }
        delete rest[id]
        return rest
      })
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-[#e8e8e4] bg-white">
        <div className="min-w-[760px]">
          <div
            className={`${GRID} border-b border-[#f0f0ec] bg-[#fafaf8] px-3 py-2.5 text-[10px] uppercase tracking-[0.12em] text-[#1a1a1a]/40`}
          >
            <span>행사</span>
            <span className="text-right">광고비</span>
            <span className="text-right">매출</span>
            <span className="text-right">목표 리드</span>
            <span className="text-right">목표 매출</span>
            <span className="text-right">리드</span>
            <span className="text-right">ROI</span>
            <span className="text-right">상세</span>
          </div>

          {sorted.length === 0 ? (
            <p className="py-10 text-center text-[12.5px] text-[#1a1a1a]/35">
              선택한 기간에 해당하는 행사가 없습니다.
            </p>
          ) : (
            <div className="divide-y divide-[#f0f0ec]">
              {sorted.map((row) => {
                const pendingField = savingField[row.event.id]
                const busy = pendingField != null
                const rowError = errors[row.event.id]
                const errorId = `event-metric-error-${row.event.id}`
                const spendEntries = row.metrics.adSpendEntries ?? []
                // 세 칸의 공통 배선 — value/label/prefix 만 다르고 상태 규칙은 같다.
                const cellProps = (field: EditableField, label: string) => ({
                  allowNull: true as const,
                  prefix: FIELD_PREFIX[field],
                  placeholder: "미입력",
                  ariaLabel: `${row.event.title} ${label}`,
                  ariaDescribedBy: rowError?.field === field ? errorId : undefined,
                  disabled: busy,
                  pending: pendingField === field,
                  saved: savedField[row.event.id] === field,
                  invalid: rowError?.field === field,
                  className: "w-full",
                  onCommit: (next: number | null) => void saveField(row, field, next),
                })
                return (
                  <div key={row.event.id}>
                  <div className={`${GRID} px-3 py-2`}>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[12.5px] font-medium text-[#111110]" title={row.event.title}>
                        {row.event.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1">
                        {spendEntries.length > 0 ? (
                          spendEntries.slice(0, 5).map((entry, index) => (
                            <span
                              key={`${entry.channel}-${index}`}
                              aria-hidden
                              title={`${AD_CHANNEL_LABEL[entry.channel]} ${won(entry.amount)}`}
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: AD_CHANNEL_COLOR[entry.channel] }}
                            />
                          ))
                        ) : (
                          <span className="text-[10px] text-[#A39E98]">채널 미배분</span>
                        )}
                      </span>
                    </span>

                    <span
                      className={`text-right text-[12px] tabular-nums ${
                        spendEntries.length > 0 ? "text-[#111110]" : "text-[#A39E98]"
                      }`}
                    >
                      {spendEntries.length > 0 ? won(row.econ.adSpendTotal) : "미입력"}
                    </span>

                    {/* allowNull — 빈 칸은 0이 아니라 "미입력"이다. 0으로 저장하면 ROI 분모·
                        목표 달성률이 "입력됐는데 성과가 0"으로 잘못 잡힌다. */}
                    <AdminMoneyInput value={row.metrics.dealsRevenue} {...cellProps("dealsRevenue", "매출")} />
                    <AdminMoneyInput value={row.metrics.targetLeads} {...cellProps("targetLeads", "목표 리드")} />
                    <AdminMoneyInput value={row.metrics.targetRevenue} {...cellProps("targetRevenue", "목표 매출")} />

                    <span className="text-right text-[12px] tabular-nums text-[#1a1a1a]/60">
                      {KRW.format(row.funnel.leads)}
                    </span>
                    <span
                      className={`text-right text-[12px] font-semibold tabular-nums ${
                        row.econ.roi == null
                          ? "text-[#A39E98]"
                          : row.econ.roi >= 0
                            ? "text-[#084734]"
                            : "text-[#B85C33]"
                      }`}
                    >
                      {pct(row.econ.roi)}
                    </span>

                    <span className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => onOpenFullEditor(row.event)}
                        disabled={busy}
                        aria-label={`${row.event.title} 성과 전체 입력`}
                        title="채널별 광고비·퍼널·회고까지 전체 입력"
                        className="rounded-md border border-[#e8e8e4] bg-white p-1.5 text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-45"
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <PencilLine className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </span>
                  </div>
                  {rowError && (
                    <p
                      id={errorId}
                      role="alert"
                      className="flex items-center gap-1.5 px-3 pb-2 text-[11.5px] text-[#B43E3E]"
                    >
                      <AlertCircle aria-hidden className="h-3.5 w-3.5 shrink-0" />
                      {rowError.message}
                    </p>
                  )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-[#1a1a1a]/45">
        매출·목표는 칸을 벗어나면 저장됩니다. 빈 칸은 0이 아니라 &quot;미입력&quot;으로 저장돼 ROI·목표 달성률 집계에서 빠집니다.
        {missingSpend > 0 || missingRevenue > 0 ? (
          <>
            {" "}
            현재 광고비 미입력 {missingSpend}건 · 매출 미입력 {missingRevenue}건 — ROI가 &quot;—&quot;로 보이는 원인입니다.
          </>
        ) : null}
      </p>
    </div>
  )
}

export default EventMetricsQuickTable
