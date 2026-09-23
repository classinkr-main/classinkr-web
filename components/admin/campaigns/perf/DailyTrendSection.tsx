"use client"

import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { PeriodToggle } from "@/components/admin/PeriodToggle"
import { EmptyState } from "@/components/admin/viz"
import { CHART, gridProps } from "@/components/admin/viz/theme"
import { COUNT, money } from "@/components/admin/campaigns/event-format"
import {
  shiftDays,
  type DailyPoint,
  type LeadDailyBySourcePoint,
  type PerfPeriod,
} from "@/lib/marketing/perf"
import { foldSourceGroups, foldSourceRow, type FoldedSources } from "@/lib/marketing/source-fold"

// 일자별 추이 — 2단 소형 다중(위 리드 · 아래 광고비), 날짜축 공유.
//
// 2026-09-14 재구성 전에는 "막대 광고비(좌축) + 선 리드(우축)" 이중축 콤보였다. 두 스케일이 한 판에
// 얹히면 추이를 읽으려면 축을 번갈아 봐야 한다 — 축을 하나씩 가진 차트 둘로 나누고 syncId 로
// 커서·툴팁을 묶어 "같은 날"을 위아래로 함께 읽게 했다(기획 §3.3-3).
//
//  · 위: 리드 — [소스별](리드DB, 상위 4 소스 + 그 외로 접음) ↔ [Meta 리포트](스냅샷 leads) 토글.
//         두 축은 모집단이 다르다(리드DB 전 소스 vs Meta 리포트 리드) — 캡션이 그 사실을 말한다.
//  · 아래: 광고비 USD — Meta 일자 스냅샷. 스냅샷이 없는 날은 0 이 아니라 빈 칸(undefined)이다.
//
// Recharts 를 끌고 오므로 소비처(SummaryTab)는 next/dynamic(ssr:false)으로 로드한다.

type TrendMode = "source" | "meta"

const TREND_MODES = [
  { id: "source", label: "소스별 리드" },
  { id: "meta", label: "Meta 리포트 리드" },
] as const

const USD_COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
const SYNC_ID = "marketing-daily-trend"
const Y_AXIS_WIDTH = 40
const META_LEADS_KEY = "metaLeads"
const SPEND_KEY = "spend"

// "YYYY-MM-DD" → "M/D" 축 라벨.
function shortDate(iso: string): string {
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
}

function labelStep(length: number): number {
  return Math.max(1, Math.ceil(length / 10))
}

interface TrendRow {
  date: string
  label: string
  weekend: boolean
  /** 접힌 소스 시리즈 키 → 리드 수(리드DB). 소스 조회 실패면 비어 있다. */
  [key: string]: string | number | boolean | undefined
}

/** 기간 전체 날짜로 행을 만든다 — 소스 축은 0 채움(실측 0), 스냅샷 축은 없는 날을 비워 둔다. */
function buildRows(
  period: PerfPeriod,
  daily: DailyPoint[],
  leadDailyBySource: LeadDailyBySourcePoint[],
  fold: FoldedSources | null
): TrendRow[] {
  const snapshotByDate = new Map(daily.map((point) => [point.date, point]))
  const sourceByDate = new Map(leadDailyBySource.map((point) => [point.date, point]))
  const rows: TrendRow[] = []
  let cursor = period.since
  let guard = 0
  while (cursor <= period.until && guard < 400) {
    const snapshot = snapshotByDate.get(cursor)
    const dow = new Date(`${cursor}T00:00:00Z`).getUTCDay()
    const row: TrendRow = {
      date: cursor,
      label: shortDate(cursor),
      weekend: dow === 0 || dow === 6,
      [META_LEADS_KEY]: snapshot?.leads,
      [SPEND_KEY]: snapshot?.spend,
    }
    if (fold) Object.assign(row, foldSourceRow(sourceByDate.get(cursor), fold))
    rows.push(row)
    cursor = shiftDays(cursor, 1)
    guard += 1
  }
  return rows
}

/** 한 툴팁에 그날의 리드(소스별·합)와 광고비를 함께 — 위아래 차트가 같은 날을 말하게 한다. */
function TrendTooltip({
  active,
  payload,
  fold,
  mode,
}: {
  active?: boolean
  payload?: Array<{ payload?: TrendRow }>
  fold: FoldedSources | null
  mode: TrendMode
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  const spend = row[SPEND_KEY]
  const metaLeads = row[META_LEADS_KEY]
  const sourceTotal = fold ? fold.series.reduce((sum, item) => sum + Number(row[item.key] ?? 0), 0) : null
  return (
    <div className="min-w-[168px] rounded-xl bg-[#111110] px-3 py-2 text-[11.5px] text-white shadow-xl">
      <p className="mb-1 font-semibold">
        {row.date}
        {row.weekend ? " · 주말" : ""}
      </p>
      {mode === "source" && fold ? (
        <>
          {fold.series.map((item) => (
            <p key={item.key} className="flex items-center justify-between gap-3 text-white/85">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
              <span className="tabular-nums">{COUNT.format(Number(row[item.key] ?? 0))}</span>
            </p>
          ))}
          <p className="mt-1 flex items-center justify-between gap-3 border-t border-white/15 pt-1 font-semibold">
            <span>리드 합</span>
            <span className="tabular-nums">{COUNT.format(sourceTotal ?? 0)}</span>
          </p>
        </>
      ) : (
        <p className="flex items-center justify-between gap-3 font-semibold">
          <span>Meta 리포트 리드</span>
          <span className="tabular-nums">{typeof metaLeads === "number" ? COUNT.format(metaLeads) : "미수집"}</span>
        </p>
      )}
      <p className="mt-1 flex items-center justify-between gap-3 text-white/85">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: CHART.barMuted }} />
          광고비
        </span>
        <span className="tabular-nums">{typeof spend === "number" ? money(spend, "USD") : "미수집"}</span>
      </p>
    </div>
  )
}

export function DailyTrendSection({
  daily,
  leadDailyBySource,
  period,
  snapshotAt,
  leadsMeasured,
}: {
  daily: DailyPoint[]
  leadDailyBySource: LeadDailyBySourcePoint[]
  period: PerfPeriod
  snapshotAt: string | null
  /** 리드 소스 조회 성공 여부(kpis.leads.value != null) — 실패를 "유입 0"으로 위장하지 않는다. */
  leadsMeasured: boolean
}) {
  const [mode, setMode] = useState<TrendMode>("source")

  // 소스 접기는 기간 합계 기준 — 리드 조회가 실패했으면 접을 것도 없다(null).
  const fold = useMemo(() => (leadsMeasured ? foldSourceGroups(leadDailyBySource) : null), [leadsMeasured, leadDailyBySource])
  const rows = useMemo(() => buildRows(period, daily, leadDailyBySource, fold), [period, daily, leadDailyBySource, fold])
  const step = labelStep(rows.length)
  const spendTotal = useMemo(() => daily.reduce((sum, point) => sum + point.spend, 0), [daily])
  const metaLeadsTotal = useMemo(() => daily.reduce((sum, point) => sum + point.leads, 0), [daily])
  const snapshotMissing = daily.length === 0

  const topEmpty =
    mode === "source"
      ? !leadsMeasured
        ? { title: "리드 소스 조회 실패", description: "리드 저장소 조회가 실패해 소스별 유입을 표시할 수 없습니다 — 유입 0건과 구분됩니다." }
        : fold && fold.series.length === 0
          ? { title: "기간 내 리드 유입이 없습니다", description: "리드DB 기준(테스트 리드 제외)으로 이 기간에 들어온 리드가 없습니다." }
          : null
      : snapshotMissing
        ? { title: "스냅샷 미적재 — 크론/백필 적용 전", description: "Meta 일자 인사이트 스냅샷이 아직 수집되지 않아 리포트 리드를 그릴 수 없습니다." }
        : null

  const axisProps = { tickLine: false, fontSize: 11, stroke: CHART.warmGray } as const

  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5" aria-label="일자별 추이">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">일자별 추이</h2>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
            {mode === "source"
              ? "위 리드(소스별 · 리드DB, 테스트 제외) · 아래 광고비(Meta 스냅샷) · 같은 날짜축"
              : "위 리드(Meta 리포트 · 스냅샷) · 아래 광고비(Meta 스냅샷) · 같은 날짜축"}
          </p>
        </div>
        <PeriodToggle options={TREND_MODES} value={mode} onChange={setMode} ariaLabel="추이 보기 방식" />
      </div>

      {/* 범례 = 기간 합계 병기(직접 라벨) — 색만으로 시리즈를 가르지 않는다. */}
      <div className="mb-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] tabular-nums text-[#615D59]">
        {mode === "source" && fold
          ? fold.series.map((item) => (
              <span
                key={item.key}
                className="inline-flex items-center gap-1.5"
                title={item.members.length > 0 ? `접힘: ${item.members.join(" · ")}` : undefined}
              >
                <span aria-hidden className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />
                {item.label} {COUNT.format(item.total)}
              </span>
            ))
          : !snapshotMissing && (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-sm" style={{ backgroundColor: CHART.brand }} />
                Meta 리포트 리드 {COUNT.format(metaLeadsTotal)}
              </span>
            )}
        {!snapshotMissing && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-sm" style={{ backgroundColor: CHART.barMuted }} />
            광고비 USD {money(spendTotal, "USD")}
          </span>
        )}
      </div>

      {topEmpty ? (
        <EmptyState title={topEmpty.title} description={topEmpty.description} />
      ) : (
        <div className="h-[190px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid {...gridProps} />
              {/* 위 차트는 축 라벨을 숨긴다 — 아래 광고비 차트가 공유 날짜축을 그린다. */}
              <XAxis dataKey="label" hide />
              <YAxis {...axisProps} width={Y_AXIS_WIDTH} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "rgba(17,17,16,0.04)" }}
                content={<TrendTooltip fold={fold} mode={mode} />}
              />
              {mode === "source" && fold
                ? fold.series.map((item, index) => (
                    <Bar
                      key={item.key}
                      dataKey={item.key}
                      stackId="leads"
                      name={item.label}
                      fill={item.color}
                      // 스택 세그먼트 사이 표면색 틈 — 인접 색이 붙어 보이지 않게 한다.
                      stroke="#ffffff"
                      strokeWidth={1}
                      radius={index === fold.series.length - 1 ? [3, 3, 0, 0] : 0}
                      maxBarSize={22}
                      // 지표 대시보드는 즉시 판독이 목적이고, 숨김 탭 마운트 시 애니메이션이 멈춘 프레임에 갇힌다.
                      isAnimationActive={false}
                    />
                  ))
                : (
                    <Bar
                      dataKey={META_LEADS_KEY}
                      name="Meta 리포트 리드"
                      fill={CHART.brand}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={22}
                      isAnimationActive={false}
                    />
                  )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {snapshotMissing ? (
        <p className="mt-3 rounded-xl bg-[#fafaf8] px-4 py-3 text-[11.5px] text-[#A39E98]">
          광고비 — {snapshotAt == null ? "스냅샷 미적재(크론/백필 적용 전)" : "기간 내 집행 기록 없음"}
        </p>
      ) : (
        <div className="mt-2 h-[112px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid {...gridProps} />
              <XAxis
                dataKey="label"
                {...axisProps}
                interval={0}
                tickFormatter={(value: string, index: number) => (index % step === 0 || index === rows.length - 1 ? value : "")}
              />
              <YAxis {...axisProps} width={Y_AXIS_WIDTH} tickFormatter={(value: number) => `$${USD_COMPACT.format(value)}`} />
              {/* 툴팁은 위 차트 하나만 그린다 — syncId 로 커서만 함께 움직인다. */}
              <Tooltip cursor={{ fill: "rgba(17,17,16,0.04)" }} content={() => null} />
              <Bar
                dataKey={SPEND_KEY}
                name="광고비 USD"
                fill={CHART.barMuted}
                radius={[3, 3, 0, 0]}
                maxBarSize={22}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 표로 보기 — 색을 못 읽는 독자와 값 대조용. 차트와 같은 행 배열을 그대로 쓴다. */}
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-[#615D59] hover:text-[#111110]">표로 보기</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-[520px] text-[11.5px] tabular-nums">
            <thead className="text-[#615D59]">
              <tr>
                <th className="py-1 pr-3 text-left font-medium">날짜</th>
                {mode === "source" && fold
                  ? fold.series.map((item) => (
                      <th key={item.key} className="px-2 py-1 text-right font-medium">{item.label}</th>
                    ))
                  : <th className="px-2 py-1 text-right font-medium">Meta 리포트 리드</th>}
                {mode === "source" && fold && <th className="px-2 py-1 text-right font-medium">합</th>}
                <th className="py-1 pl-2 text-right font-medium">광고비 USD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0ec]">
              {rows.map((row) => (
                <tr key={row.date}>
                  <td className="py-1 pr-3 text-left">{row.date}{row.weekend ? " 주말" : ""}</td>
                  {mode === "source" && fold ? (
                    <>
                      {fold.series.map((item) => (
                        <td key={item.key} className="px-2 py-1 text-right">{COUNT.format(Number(row[item.key] ?? 0))}</td>
                      ))}
                      <td className="px-2 py-1 text-right font-semibold">
                        {COUNT.format(fold.series.reduce((sum, item) => sum + Number(row[item.key] ?? 0), 0))}
                      </td>
                    </>
                  ) : (
                    <td className="px-2 py-1 text-right">
                      {typeof row[META_LEADS_KEY] === "number" ? COUNT.format(row[META_LEADS_KEY] as number) : "—"}
                    </td>
                  )}
                  <td className="py-1 pl-2 text-right">
                    {typeof row[SPEND_KEY] === "number" ? money(row[SPEND_KEY] as number, "USD") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
