"use client"

import { useMemo, useState } from "react"
import { AlertCircle, Loader2, PencilLine } from "lucide-react"

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

/** 인라인 숫자 입력 — blur/Enter에서만 커밋한다. 표시는 원시 정수(콤마 없음)로 편집 마찰을 줄인다. */
function NumberCell({
  value,
  label,
  disabled,
  onCommit,
}: {
  value: number | null
  label: string
  disabled: boolean
  onCommit: (next: number | null) => void
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value))
  // 저장 후 상위가 canonical 값을 되돌려주면 편집 초안을 다시 맞춘다.
  // (렌더 중 state 조정 패턴 — useEffect 캐스케이드를 만들지 않는다.)
  const [syncedValue, setSyncedValue] = useState(value)
  if (value !== syncedValue) {
    setSyncedValue(value)
    setDraft(value == null ? "" : String(value))
  }

  const commit = () => {
    const trimmed = draft.trim()
    // 빈 칸은 0이 아니라 "미입력"(null)이다 — 0으로 저장하면 ROI 분모·목표 달성률이
    // "입력됐는데 성과가 0"으로 잘못 잡힌다.
    const next = trimmed === "" ? null : Math.max(0, Math.floor(Number(trimmed)))
    const safe = next != null && Number.isFinite(next) ? next : null
    setDraft(safe == null ? "" : String(safe))
    if (safe !== value) onCommit(safe)
  }

  return (
    <span
      className={`inline-flex w-full items-center gap-1 rounded-lg border px-2 py-1 ${
        value == null
          ? "border-dashed border-[#e0dfd9] bg-white"
          : "border-[#e8e8e4] bg-[#fafaf8]"
      } focus-within:border-[#084734] focus-within:bg-white`}
    >
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
        }}
        placeholder="미입력"
        aria-label={label}
        className="w-full min-w-0 bg-transparent text-right text-[12px] tabular-nums text-[#111110] outline-none placeholder:text-[11px] placeholder:text-[#1a1a1a]/25 disabled:opacity-50"
      />
    </span>
  )
}

export function EventMetricsQuickTable({
  rows,
  onSaved,
  onOpenFullEditor,
}: {
  rows: PerEventEconRow[]
  onSaved: (metrics: EventMetrics) => void
  onOpenFullEditor: (event: PublicEvent) => void
}) {
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 최근 시작한 행사부터 — 성과를 채워야 할 대상은 대개 방금 끝난 행사다.
  const sorted = useMemo(
    () => [...rows].sort((a, b) => new Date(b.event.startsAt).getTime() - new Date(a.event.startsAt).getTime()),
    [rows]
  )

  const missingRevenue = sorted.filter((row) => row.metrics.dealsRevenue == null).length
  const missingSpend = sorted.filter((row) => row.econ.adSpendTotal === 0).length

  async function saveField(row: PerEventEconRow, field: EditableField, next: number | null) {
    setSavingId(row.event.id)
    setError(null)
    try {
      // PATCH는 본문 전체를 정본으로 삼는다(빠진 필드는 null로 초기화된다).
      // 그래서 한 칸만 고쳐도 현재 메트릭 전체를 다시 실어 보낸다 — 부분 전송은 다른 값을 지운다.
      const saved = await adminFetchJson<EventMetrics>(`/api/admin/event-metrics/${row.event.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...row.metrics, [field]: next }),
      })
      onSaved(saved)
    } catch (e) {
      setError(
        e instanceof Error
          ? `${row.event.title} · ${FIELD_LABEL[field]} 저장 실패 — ${e.message}`
          : "성과 저장에 실패했습니다."
      )
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

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
                const busy = savingId === row.event.id
                const spendEntries = row.metrics.adSpendEntries ?? []
                return (
                  <div key={row.event.id} className={`${GRID} px-3 py-2`}>
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
                          <span className="text-[10px] text-[#1a1a1a]/30">채널 미배분</span>
                        )}
                      </span>
                    </span>

                    <span
                      className={`text-right text-[12px] tabular-nums ${
                        row.econ.adSpendTotal > 0 ? "text-[#111110]" : "text-[#1a1a1a]/25"
                      }`}
                    >
                      {row.econ.adSpendTotal > 0 ? won(row.econ.adSpendTotal) : "미입력"}
                    </span>

                    <NumberCell
                      value={row.metrics.dealsRevenue}
                      label={`${row.event.title} 매출`}
                      disabled={busy}
                      onCommit={(next) => void saveField(row, "dealsRevenue", next)}
                    />
                    <NumberCell
                      value={row.metrics.targetLeads}
                      label={`${row.event.title} 목표 리드`}
                      disabled={busy}
                      onCommit={(next) => void saveField(row, "targetLeads", next)}
                    />
                    <NumberCell
                      value={row.metrics.targetRevenue}
                      label={`${row.event.title} 목표 매출`}
                      disabled={busy}
                      onCommit={(next) => void saveField(row, "targetRevenue", next)}
                    />

                    <span className="text-right text-[12px] tabular-nums text-[#1a1a1a]/60">
                      {KRW.format(row.funnel.leads)}
                    </span>
                    <span
                      className={`text-right text-[12px] font-semibold tabular-nums ${
                        row.econ.roi == null
                          ? "text-[#1a1a1a]/25"
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
