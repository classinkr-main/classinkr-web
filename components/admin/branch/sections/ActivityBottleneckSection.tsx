"use client"
// KR Team 파이프라인 — 활동 병목 · 담당자 (2026-07-16 역할 재배분: 장부 KPI 렌즈의 병목 뷰 이식).
// 담당자별로 goal>0인 활동 지표 중 달성률(actual/goal)이 가장 낮은 지표를 병목으로 판정해
// 달성률 오름차순(병목 심한 순)으로 보여준다. 딜 수치 편집은 장부가 정본이라 크로스 링크만 둔다.
import Link from "next/link"
import { useMemo } from "react"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { formatPercent } from "@/lib/branch/ledger-format"
import type { BranchKpiResponse } from "../types"

// KPI 시트 메트릭 키(lib/branch/parsers/kpi.ts KPI_METRICS) → 표기 라벨.
const METRIC_LABELS: Record<string, string> = {
  LD: "LD 리드",
  ACC: "ACC 계정",
  OPP: "OPP 기회",
  SOL: "SOL 제안",
  VST: "VST 방문",
}

interface BottleneckRow {
  member: string
  team: string | null
  metric: string
  goal: number
  actual: number
  pct: number
}

// 배지 3단은 목업 정본과 일치: <30% 페이스 미달(위험) / <60% 주의 / 그 외 양호.
// 확도 색 토큰(CONFIDENCE_TOKENS)만 소비 — 위험 텍스트는 팔레트 danger #B43E3E.
function bottleneckTone(pct: number) {
  if (pct < 30) {
    return { label: "페이스 미달", textClass: "text-[#B43E3E]", chipClass: CONFIDENCE_TOKENS.expected.chipClass }
  }
  if (pct < 60) {
    return { label: "주의", textClass: CONFIDENCE_TOKENS.expected.textClass, chipClass: CONFIDENCE_TOKENS.expected.chipClass }
  }
  return { label: "양호", textClass: CONFIDENCE_TOKENS.confirmed.textClass, chipClass: CONFIDENCE_TOKENS.confirmed.chipClass }
}

export default function ActivityBottleneckSection({
  kpi,
  loading,
}: {
  kpi: BranchKpiResponse | null
  loading: boolean
}) {
  const rows = useMemo<BottleneckRow[]>(() => {
    const members = kpi?.members ?? []
    const result: BottleneckRow[] = []
    for (const member of members) {
      let worst: BottleneckRow | null = null
      for (const [metric, pair] of Object.entries(member.kpi ?? {})) {
        if (!pair || pair.goal <= 0) continue
        const pct = (pair.actual / pair.goal) * 100
        if (!worst || pct < worst.pct) {
          worst = { member: member.member, team: member.team, metric, goal: pair.goal, actual: pair.actual, pct }
        }
      }
      if (worst) result.push(worst)
    }
    return result.sort((a, b) => a.pct - b.pct || a.member.localeCompare(b.member, "ko"))
  }, [kpi])

  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3.5">
        <div>
          <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">활동 병목 · 담당자</h2>
          <p className="mt-0.5 text-[11px] text-[#615D59]">담당자별 목표 대비 달성률이 가장 낮은 활동 지표</p>
        </div>
        <Link
          href="/admin/branch/ledger"
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-[rgba(0,0,0,0.15)] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#084734] transition hover:bg-[#ECFDF5]"
        >
          딜 수치 편집 →
        </Link>
      </div>

      <div className="px-2.5 py-2">
        {loading && !kpi ? (
          <div className="h-40 animate-pulse rounded-lg bg-[#f0f0ec]" />
        ) : rows.length === 0 ? (
          <div className="m-2 rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] p-6 text-center text-[12px] text-[#615D59]">
            목표가 설정된 활동 KPI 데이터가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[12.5px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-[0.06em] text-[#615D59]">
                  <th className="px-2.5 py-2 font-bold">담당</th>
                  <th className="px-2.5 py-2 font-bold">병목 지표</th>
                  <th className="px-2.5 py-2 text-right font-bold">달성</th>
                  <th className="px-2.5 py-2" aria-label="상태" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const tone = bottleneckTone(row.pct)
                  return (
                    <tr key={row.member} className="border-t border-[#F0F0EC]">
                      <td className="px-2.5 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span>
                            <p className="font-bold text-[#111110]">{row.member}</p>
                            {row.team && <p className="mt-0.5 text-[10.5px] text-[#615D59]">{row.team}</p>}
                          </span>
                          <Link
                            href={`/admin/branch/ledger?lens=rev&mgr=${encodeURIComponent(row.member)}`}
                            className="shrink-0 self-start text-[11px] font-medium text-[#084734] opacity-50 transition hover:opacity-100"
                            title="담당자 매출 장부에서 열기"
                          >
                            ↗
                          </Link>
                        </span>
                      </td>
                      <td className="px-2.5 py-2.5 font-semibold text-[#111110]">
                        {METRIC_LABELS[row.metric] ?? row.metric}
                      </td>
                      <td className="px-2.5 py-2.5 text-right tabular-nums">
                        <p className={`font-bold ${tone.textClass}`}>{formatPercent(row.pct)}</p>
                        <p className="mt-0.5 text-[10.5px] font-semibold text-[#A39E98]">{row.actual}/{row.goal}</p>
                      </td>
                      <td className="px-2.5 py-2.5 text-right">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10.5px] font-bold ${tone.chipClass}`}>
                          {tone.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
