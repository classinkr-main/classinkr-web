"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import { formatCNY } from "@/lib/crm/money-format"
import { projectMonthEnd, kstMonthProgressRatio } from "@/lib/crm/forecast"
import { ChartTooltip } from "../viz/ChartTheme"
import { CHART, axisTick, cursorLine } from "../viz/theme"

// 현황 성과 분석 — CRM 매출 데이터(팀/개인/월)를 KR팀탭 수준 차트로. Recharts 별도 모듈(지연 로드).
interface PerfGroup {
  name: string
  team: string | null
  total: number
  monthly: number[]
}
interface Performance {
  months: string[]
  monthly: { month: string; revenue: number }[]
  total: number
  byTeam: PerfGroup[]
  byMember: PerfGroup[]
  dealCount: number
}

function fmtMan(value: number): string {
  if (!value) return "0"
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만`
  return value.toLocaleString("ko-KR")
}
function monthLabel(key: string): string {
  const month = key.split("-")[1]
  return month ? `${Number(month)}월` : key
}

function PerfBars({ title, rows }: { title: string; rows: { name: string; total: number }[] }) {
  if (rows.length === 0) return null
  return (
    <div>
      <p className="mb-1 text-[12px] font-semibold text-[#1a1a1a]/45">{title}</p>
      <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 30)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, bottom: 0, left: 8 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={64} tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={cursorLine} />
          <Bar dataKey="total" fill={CHART.brand} radius={[0, 4, 4, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function CrmPerformanceCharts() {
  const [data, setData] = useState<Performance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  // 월 매출 목표(CNY) — 없으면 null(목표선/달성률 미표시). 마이그레이션 전에도 안전.
  const [target, setTarget] = useState<number | null>(null)
  const [editingTarget, setEditingTarget] = useState(false)
  const [targetDraft, setTargetDraft] = useState("") // ¥ 만 단위 입력
  const [savingTarget, setSavingTarget] = useState(false)
  const [targetError, setTargetError] = useState<string | null>(null)

  // 당월(KST) 키 — GET/POST 공용. 마운트 시 1회 확정.
  const monthKey = useMemo(() => {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
    return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}`
  }, [])

  useEffect(() => {
    let alive = true
    adminFetchJsonCached<Performance>("/api/admin/crm/performance?months=6", undefined, {
      cacheKey: "/api/admin/crm/performance",
      ttlMs: 120_000,
      staleWhileRevalidateMs: 300_000,
    })
      .then((next) => {
        if (alive) {
          setData(next)
          setLoading(false)
        }
      })
      .catch(() => {
        if (alive) {
          setError(true)
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    adminFetchJsonCached<{ target: { amount: number } | null }>(
      `/api/admin/crm/revenue-target?month=${monthKey}`,
      undefined,
      { cacheKey: `rev-target:${monthKey}`, ttlMs: 300_000, staleWhileRevalidateMs: 600_000 }
    )
      .then((res) => {
        if (alive) setTarget(res.target?.amount ?? null)
      })
      .catch(() => {
        if (alive) setTarget(null)
      })
    return () => {
      alive = false
    }
  }, [monthKey])

  const openTargetEditor = useCallback(() => {
    setTargetDraft(target != null ? String(Math.round(target / 10_000)) : "")
    setTargetError(null)
    setEditingTarget(true)
  }, [target])

  const saveTarget = useCallback(async () => {
    const man = Number(targetDraft.replace(/[^\d.]/g, ""))
    if (!Number.isFinite(man) || man < 0) {
      setTargetError("0 이상 숫자를 입력하세요.")
      return
    }
    setSavingTarget(true)
    setTargetError(null)
    try {
      // 입력은 ¥ 만 단위 → 저장은 원 단위 CNY.
      const res = await adminFetchJson<{ target: { amount: number } }>("/api/admin/crm/revenue-target", {
        method: "POST",
        body: JSON.stringify({ month: monthKey, amount: Math.round(man * 10_000) }),
      })
      setTarget(res.target?.amount ?? null)
      setEditingTarget(false)
    } catch (err) {
      setTargetError(err instanceof Error ? err.message : "목표 저장에 실패했습니다.")
    } finally {
      setSavingTarget(false)
    }
  }, [targetDraft, monthKey])

  if (loading) return <div className="h-44 animate-pulse rounded-xl bg-[#fafaf8]" />
  if (error)
    return (
      <div className="rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] font-medium text-[#B85C33]">
        성과 데이터를 불러오지 못했습니다.
      </div>
    )
  if (!data || data.total === 0)
    return <p className="text-[12px] text-[#1a1a1a]/40">표시할 매출 데이터가 없습니다.</p>

  const trend = data.monthly.map((point) => ({ label: monthLabel(point.month), revenue: point.revenue }))
  const teams = data.byTeam.slice(0, 6).map((group) => ({ name: group.name, total: group.total }))
  const members = data.byMember.slice(0, 6).map((group) => ({ name: group.name, total: group.total }))

  // 당월 실적 + 목표 대비 달성률·월말 추정(목표 있을 때만). 목표 통화도 CNY.
  const currentRevenue = data.monthly.length ? data.monthly[data.monthly.length - 1].revenue : 0
  const projection = projectMonthEnd(currentRevenue, target, kstMonthProgressRatio(new Date()))
  const maxRevenue = trend.reduce((max, point) => Math.max(max, point.revenue), 0)
  const yTop = target != null ? Math.ceil(Math.max(target, maxRevenue) * 1.12) : undefined

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[12px] font-semibold text-[#1a1a1a]/45">매출 추이 (최근 6개월)</p>
            <p className="text-[10px] text-[#1a1a1a]/35">REV 동기화 · 위안화(¥)</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              {target != null && projection.attainmentPct != null ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    projection.attainmentPct >= 100
                      ? "bg-[#ECFDF5] text-[#084734]"
                      : "bg-[#FBF1E0] text-[#7A520F]"
                  }`}
                  title={`당월 목표 ${formatCNY(target)} 대비 · 월말 추정 ${projection.projectedPct ?? "-"}%`}
                >
                  목표 대비 {projection.attainmentPct}%
                </span>
              ) : null}
              <p className="text-[13px] font-bold text-[#084734]">{formatCNY(data.total)}</p>
            </div>
            {editingTarget ? (
              <div className="flex items-center gap-1">
                <span className="flex items-center rounded-lg border border-[#e8e8e4] bg-white px-1.5">
                  <span className="text-[11px] text-[#1a1a1a]/40">¥</span>
                  <input
                    value={targetDraft}
                    onChange={(event) => setTargetDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void saveTarget()
                      else if (event.key === "Escape") setEditingTarget(false)
                    }}
                    placeholder="목표"
                    inputMode="numeric"
                    aria-label="월 매출 목표(만 위안)"
                    className="w-16 bg-transparent px-1 py-0.5 text-[12px] text-[#111110] outline-none"
                  />
                  <span className="text-[11px] text-[#1a1a1a]/40">만</span>
                </span>
                <button
                  type="button"
                  onClick={() => void saveTarget()}
                  disabled={savingTarget}
                  className="rounded-md bg-[#084734] px-2 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTarget(false)}
                  className="rounded-md border border-[#e8e8e4] px-2 py-1 text-[11px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#fafaf8]"
                >
                  취소
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={openTargetEditor}
                className="text-[10px] font-medium text-[#1a1a1a]/40 transition-colors hover:text-[#084734]"
              >
                {target != null ? `목표 ${formatCNY(target)} · 수정` : "+ 월 매출 목표 설정"}
              </button>
            )}
            {targetError ? <p className="text-[10px] font-medium text-[#B85C33]">{targetError}</p> : null}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
            <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => `¥${fmtMan(Number(value))}`}
              width={48}
              domain={yTop != null ? [0, yTop] : undefined}
            />
            <Tooltip content={<ChartTooltip />} cursor={cursorLine} />
            {/* 당월(마지막 막대)만 진한 브랜드색으로 강조, 이전 달은 옅은 그린 */}
            <Bar dataKey="revenue" radius={[5, 5, 0, 0]} maxBarSize={36}>
              {trend.map((entry, index) => (
                <Cell key={entry.label} fill={index === trend.length - 1 ? CHART.brand : "#cfe3d8"} />
              ))}
            </Bar>
            {/* 월 매출 목표선 — 목표가 설정된 경우에만(crm_revenue_target). 통화 CNY. */}
            {target != null ? (
              <ReferenceLine
                y={target}
                stroke="#B85C33"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: `목표 ¥${fmtMan(target)}`, position: "insideTopRight", fontSize: 10, fill: "#B85C33" }}
              />
            ) : null}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <PerfBars title="팀별 매출 (¥)" rows={teams} />
        <PerfBars title="개인별 매출 · 상위 6 (¥)" rows={members} />
      </div>
    </div>
  )
}
