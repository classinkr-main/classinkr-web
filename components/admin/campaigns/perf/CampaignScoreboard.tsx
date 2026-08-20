"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { PeriodToggle } from "@/components/admin/PeriodToggle"
import { EmptyState } from "@/components/admin/viz"
// Sparkline 은 Recharts 의존이라 viz 배럴 밖 — 직접 경로 import(이 컴포넌트 자체가
// SummaryTab 에서 dynamic(ssr:false) 청크로 로드된다).
import { Sparkline } from "@/components/admin/viz/Sparkline"
import { CHART } from "@/components/admin/viz/theme"
import { money } from "@/components/admin/campaigns/event-format"
import { formatRelativeTime, UpdateKindChip } from "./UpdatesFeed"
import {
  CAMPAIGN_STATUS_LABEL,
  type CampaignStatus,
} from "@/lib/types/marketing-campaign"
import { sortScoreboardRows, type Pacing, type PerfScoreboardRow } from "@/lib/marketing/perf"

// 캠페인 스코어보드 — 우산 캠페인별 [이름+최근 업데이트 / 페이싱 / 리드 / CPL / 14일 스파크라인].
// 리드·CPL 은 링크된 Meta 캠페인 귀속 축(응답 계약 주석 참조) — KPI 의 리드와 정의가 다르다.

const COUNT = new Intl.NumberFormat("ko-KR")

type ScoreFilter = "ongoing" | "all"

function statusLabel(status: string): string {
  return CAMPAIGN_STATUS_LABEL[status as CampaignStatus] ?? status
}

function PacingCell({ pacing, currency }: { pacing: Pacing; currency: "USD" | "KRW" | null }) {
  const { elapsedPct, executionPct } = pacing
  if (elapsedPct == null && executionPct == null) {
    return <p className="text-[11px] text-[#A39E98]">기간·예산 미설정</p>
  }
  // 캡션: 집행률이 있으면 "집행 n% · 기간 n% · 통화축", 없으면 경과율만(집행 미산정을 0% 로 위장 금지).
  const parts: string[] = []
  if (executionPct != null) parts.push(`집행 ${executionPct}%`)
  if (elapsedPct != null) parts.push(`기간 ${elapsedPct}%`)
  if (executionPct != null && currency) parts.push(currency)
  // 집행이 기간 경과보다 10%p 넘게 앞서면(과속 집행 — 예산 조기 소진 위험) danger 톤.
  // 경계값(정확히 10%p)은 아직 정상 톤 — 엄격 부등호.
  const overPacing = executionPct != null && elapsedPct != null && executionPct - elapsedPct > 10
  return (
    <div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-[#f0f0ec]">
        {executionPct != null && (
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, Math.max(0, executionPct))}%`,
              backgroundColor: overPacing ? CHART.danger : CHART.brand,
            }}
          />
        )}
        {elapsedPct != null && (
          <div
            aria-hidden
            className="absolute top-0 h-full w-px bg-[#111110]/45"
            style={{ left: `${Math.min(99.5, Math.max(0, elapsedPct))}%` }}
          />
        )}
      </div>
      <p className="mt-1 text-[10.5px] tabular-nums text-[#1a1a1a]/45">{parts.join(" · ")}</p>
    </div>
  )
}

const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_150px_56px_88px_120px] items-center gap-x-4 px-1"

function ScoreboardRow({ row }: { row: PerfScoreboardRow }) {
  // 빈 배열 = 미측정(insights 소스 실패·Meta 링크 없음), 전부 0 = 실측 0 — 둘을 구분 표기한다.
  const measured = row.sparkline.length > 0
  const hasLeads = row.sparkline.some((point) => point.leads > 0)
  return (
    <div className={`${ROW_GRID} py-3`}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13px] font-semibold text-[#111110]">{row.name}</p>
          {row.status !== "active" && (
            <span className="shrink-0 text-[10px] font-medium text-[#1a1a1a]/40">
              {statusLabel(row.status)}
            </span>
          )}
        </div>
        {row.latestUpdate ? (
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-[#1a1a1a]/45">
            <UpdateKindChip kind={row.latestUpdate.kind} />
            <span className="truncate">{row.latestUpdate.body}</span>
            <span className="shrink-0 text-[#1a1a1a]/35">
              {formatRelativeTime(row.latestUpdate.createdAt)}
              {row.latestUpdate.createdBy ? ` · ${row.latestUpdate.createdBy}` : ""}
            </span>
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-[#A39E98]">업데이트 기록 없음</p>
        )}
        {/* 이상 신호 슬롯 — 지금은 빈 배열(Phase 3 에서 채워진다). */}
        {row.anomalies.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {row.anomalies.map((anomaly) => (
              <span
                key={anomaly}
                className="rounded border border-[#ECD29C] px-1.5 py-px text-[10px] font-medium text-[#A8741A]"
              >
                {anomaly}
              </span>
            ))}
          </div>
        )}
      </div>
      <PacingCell pacing={row.pacing} currency={row.pacingCurrency} />
      <p className="text-right text-[13px] font-semibold tabular-nums text-[#111110]">
        {COUNT.format(row.leads)}
      </p>
      <p className="text-right text-[13px] font-semibold tabular-nums text-[#111110]">
        {row.cpl != null ? money(row.cpl, "USD") : "—"}
      </p>
      <div className="pl-1">
        {!measured ? (
          <span className="text-[11px] text-[#A39E98]">—</span>
        ) : hasLeads ? (
          <Sparkline data={row.sparkline.map((point) => point.leads)} tone="brand" height={28} />
        ) : (
          <span className="text-[11px] tabular-nums text-[#1a1a1a]/40">리드 0</span>
        )}
      </div>
    </div>
  )
}

export function CampaignScoreboard({ rows }: { rows: PerfScoreboardRow[] }) {
  // 기본 필터는 진행중(status!=="done") — 완료 캠페인은 전체 토글로만 노출.
  const [filter, setFilter] = useState<ScoreFilter>("ongoing")
  // 표시 순서는 리드 내림차순(동률 이름순) 고정 — 원본 rows(API 반환 순서)는 사실상 무작위다.
  const sortedRows = useMemo(() => sortScoreboardRows(rows), [rows])
  const ongoing = useMemo(() => sortedRows.filter((row) => row.status !== "done"), [sortedRows])
  const visible = filter === "all" ? sortedRows : ongoing

  const filterOptions = [
    { id: "ongoing" as const, label: `진행중 ${ongoing.length}` },
    { id: "all" as const, label: `전체 ${rows.length}` },
  ]

  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5" aria-label="캠페인 스코어보드">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">캠페인 스코어보드</h2>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
            리드·CPL 은 링크된 Meta 캠페인 귀속 · 스파크라인은 최근 14일 리드
          </p>
        </div>
        {rows.length > 0 && (
          <PeriodToggle
            options={filterOptions}
            value={filter}
            onChange={setFilter}
            ariaLabel="캠페인 상태 필터"
          />
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="등록된 캠페인이 없습니다"
          description="크로스채널 캠페인을 만들고 Meta 캠페인·행사를 연결하면 여기서 페이싱과 리드가 집계됩니다."
          action={
            <Link
              href="/admin/campaigns/manage"
              className="inline-flex items-center rounded-md bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#065c41]"
            >
              캠페인 관리로 이동
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <p className="rounded-xl bg-[#fafaf8] py-8 text-center text-[12px] text-[#A39E98]">
          진행 중인 캠페인이 없습니다 — 전체 토글로 완료 캠페인을 볼 수 있습니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            <div className={`${ROW_GRID} border-b border-[#f0f0ec] pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1a1a1a]/35`}>
              <span>캠페인</span>
              <span>페이싱</span>
              <span className="text-right">리드</span>
              <span className="text-right">CPL</span>
              <span className="pl-1">리드 14일</span>
            </div>
            <div className="divide-y divide-[#f0f0ec]">
              {visible.map((row) => (
                <ScoreboardRow key={row.campaignId} row={row} />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
