"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { EmptyState } from "@/components/admin/viz"
// Sparkline 은 Recharts 의존이라 viz 배럴 밖 — 직접 경로 import(이 컴포넌트 자체가
// SummaryTab 에서 dynamic(ssr:false) 청크로 로드된다).
import { Sparkline } from "@/components/admin/viz/Sparkline"
import { CHART } from "@/components/admin/viz/theme"
import { COUNT, money } from "@/components/admin/campaigns/event-format"
import { formatRelativeTime, UpdateKindChip } from "./format"
import {
  CAMPAIGN_STATUS_LABEL,
  type CampaignStatus,
} from "@/lib/types/marketing-campaign"
import { ANOMALY_KIND_LABEL, ANOMALY_THRESHOLDS, type AnomalyKind } from "@/lib/marketing/anomaly"
import { splitScoreboardByActivity, type Pacing, type PerfScoreboardRow } from "@/lib/marketing/perf"

// 캠페인 스코어보드 — 우산 캠페인별 [이름+최근 업데이트 / 페이싱 / 리드 / CPL / 14일 스파크라인].
// 리드·CPL 은 링크된 Meta 캠페인 귀속 축(응답 계약 주석 참조) — KPI 의 리드와 정의가 다르다.
//
// 표시는 활동 기준 2그룹(활성 / 접힌 "이전 캠페인")이다. 옛 "진행중 N / 전체 N" 상태 필터는
// status !== "done" 판정이라 프로덕션에서 양쪽이 항상 같은 수(18/18)로 나와 무의미했다 —
// 실제로 목록을 파묻던 건 완료가 아니라 몇 달째 멈춘 paused 캠페인이다.

function statusLabel(status: string): string {
  return CAMPAIGN_STATUS_LABEL[status as CampaignStatus] ?? status
}

// 행의 anomalies 는 계약상 문자열 배열(AnomalyKind) — 라벨 매핑은 SSOT 한 곳만 본다.
// 모르는 종류가 오면 지어내지 않고 원문 그대로 보여준다.
function anomalyLabel(kind: string): string {
  return ANOMALY_KIND_LABEL[kind as AnomalyKind] ?? kind
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
  // 집행이 기간 경과보다 임계(%p) 넘게 앞서면(과속 집행 — 예산 조기 소진 위험) danger 톤.
  // 임계는 pacing_over 배지와 같은 SSOT 를 쓴다 — 바가 빨간데 배지는 없는(또는 그 반대) 어긋남 방지.
  // 경계값(정확히 임계)은 아직 정상 톤 — 감지 규칙과 같은 엄격 부등호.
  const overPacing =
    executionPct != null &&
    elapsedPct != null &&
    executionPct - elapsedPct > ANOMALY_THRESHOLDS.pacingOverGapPp
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

function ScoreboardRow({ row, muted = false }: { row: PerfScoreboardRow; muted?: boolean }) {
  // 빈 배열 = 미측정(insights 소스 실패·Meta 링크 없음), 전부 0 = 실측 0 — 둘을 구분 표기한다.
  const measured = row.sparkline.length > 0
  const hasLeads = row.sparkline.some((point) => point.leads > 0)
  return (
    // 휴면 행은 톤만 눌러 둔다(색 추가 없이 투명도) — 접힘을 펼친 사람에게 "이건 이전 것"임을
    // 알리되, 읽을 수 없게 만들지는 않는다.
    <div className={muted ? `${ROW_GRID} py-3 opacity-55` : `${ROW_GRID} py-3`}>
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
        {/* 이상 신호 — 규칙 감지(lib/marketing/anomaly.ts)가 걸린 종류만. 파스텔 채움 없이
            danger 토큰 아웃라인 칩으로만 표시한다(넓은 면적 채색 지양). */}
        {row.anomalies.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {row.anomalies.map((kind) => (
              <span
                key={kind}
                className="rounded border border-[#F6D5C5] px-1.5 py-px text-[10px] font-medium text-[#B85C33]"
              >
                {anomalyLabel(kind)}
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

function DisclosureChevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path
        d="M4.5 2.5 8 6l-3.5 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CampaignScoreboard({ rows }: { rows: PerfScoreboardRow[] }) {
  const [showDormant, setShowDormant] = useState(false)
  // 활동 기준 2그룹(판정 규칙은 splitScoreboardByActivity 참조) — 몇 달 전 중단된 캠페인이
  // 목록을 채워 실제로 돌아가는 캠페인을 파묻는 것을 막는다. 각 그룹은 리드 내림차순 정렬.
  // 판정 시각은 rows 가 바뀔 때만 다시 읽는다(리렌더마다 경계 행이 그룹을 오가지 않게).
  const { active, dormant } = useMemo(() => splitScoreboardByActivity(rows), [rows])

  // 전부 휴면이면 접을 게 아니라 그냥 다 보여준다 — 빈 표는 만들지 않는다.
  const allDormant = active.length === 0 && dormant.length > 0
  const primaryRows = allDormant ? dormant : active

  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5" aria-label="캠페인 스코어보드">
      <div className="mb-3">
        <h2 className="text-[14px] font-semibold text-[#111110]">캠페인 스코어보드</h2>
        <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
          리드·CPL 은 링크된 Meta 캠페인 귀속 · 스파크라인은 최근 14일 리드
        </p>
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

            {allDormant && (
              <p className="pt-2.5 text-[11px] text-[#A39E98]">
                진행 상태·리드·최근 업데이트 중 어느 신호도 없는 캠페인뿐입니다 — 전체{" "}
                {rows.length}개를 그대로 보여줍니다.
              </p>
            )}

            <div className="divide-y divide-[#f0f0ec]">
              {primaryRows.map((row) => (
                <ScoreboardRow key={row.campaignId} row={row} />
              ))}

              {!allDormant && dormant.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowDormant((open) => !open)}
                    aria-expanded={showDormant}
                    className="flex w-full items-center gap-1.5 py-2.5 text-[11.5px] font-medium text-[#1a1a1a]/45 transition hover:text-[#111110]"
                  >
                    <DisclosureChevron open={showDormant} />
                    이전 캠페인 {dormant.length}개
                  </button>
                  {showDormant && (
                    <div className="divide-y divide-[#f0f0ec] border-t border-[#f0f0ec]">
                      {dormant.map((row) => (
                        <ScoreboardRow key={row.campaignId} row={row} muted />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
