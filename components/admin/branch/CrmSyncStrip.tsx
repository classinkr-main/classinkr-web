"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronDown } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import {
  buildCrmSyncSummary,
  formatRevSyncPct,
  type CrmSyncSummary,
  type RevSyncCoverageView,
  type RevSyncHealth,
} from "@/lib/crm/rev-sync-health"

// 매출 장부의 "CRM 싱크" 스트립 (A안 — 시안 docs/active/mockups/rev-crm-sync-visual-2026-07-18.html).
// 정합 체크(IntegrityStrip = 시트가 스스로 맞는가) 형제로, "시트가 CRM과 이어져 있는가"를 본다.
// 표시 레이어 전용 — 집계는 /api/admin/crm/coverage(revAccounts 축)가 이미 계산한 값을 그대로
// 소비하고, 여기서 새 판정·집계를 하지 않는다. fail-soft: 로딩 중엔 미렌더, 실패 시 조용한 한 줄.
//
// 상태 3단계는 계정 커버리지 기준(10%/60%) — 낮음=테라코타 / 부분=앰버 / 건강=그린.
// 확도 전용 파랑(REV 3단, lib/branch/confidence-tokens.ts)은 이 축에서 사용 금지
// (scripts/check-design-tokens.mjs가 집행).
export const CRM_SYNC_TONE: Record<
  RevSyncHealth,
  { border: string; bg: string; text: string; dot: string }
> = {
  low: { border: "border-[#EFC9B8]", bg: "bg-[#FBEAE2]", text: "text-[#8A3F1D]", dot: "bg-[#B85C33]" },
  partial: { border: "border-[#ECD29C]", bg: "bg-[#FBF1E0]", text: "text-[#7A520F]", dot: "bg-[#A8741A]" },
  healthy: { border: "border-[#BDEFD8]", bg: "bg-[#ECFDF5]", text: "text-[#084734]", dot: "bg-[#084734]" },
}

export interface CrmCoverageResponse {
  revAccounts?: RevSyncCoverageView | null
}

/** 부모가 이미 커버리지를 들고 있으면 주입 — 스트립 자체 fetch를 생략한다(같은 화면 이중 GET 제거).
 *  생략(undefined)이면 독립 모드(기존 자체 fetch 동작 그대로). */
interface CrmSyncStripProps {
  coverage?: { data: CrmCoverageResponse | null; loading: boolean; error: string | null }
}

// 응답 → 스트립 상태 접기 — 자체 fetch 성공 경로와 부모 주입 경로가 같은 판정을 공유한다.
function stripStateFromResponse(response: CrmCoverageResponse | null): StripState {
  const rev = response?.revAccounts ?? null
  const summary = buildCrmSyncSummary(rev)
  if (rev && summary) return { status: "ready", rev, summary }
  // 확장 필드가 아직 없거나(배포 스큐) 시트가 비어 있으면 조용히 사라진다.
  if (rev && rev.scannedRows <= 0) return { status: "empty" }
  return { status: "unavailable" }
}

const TOP_UNLINKED_DISPLAY = 5

function cny(value: number): string {
  return `¥${Math.round(value).toLocaleString("ko-KR")}`
}

function formatAsOf(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const hh = String(date.getHours()).padStart(2, "0")
  const mm = String(date.getMinutes()).padStart(2, "0")
  return `${date.getMonth() + 1}.${date.getDate()} ${hh}:${mm}`
}

function Meter({
  label,
  value,
  segments,
}: {
  label: string
  value: string
  /** [width%, colorClass] — 스택 게이지(행 연결의 확정+검토)도 같은 트랙에 그린다. */
  segments: Array<{ pct: number; className: string }>
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px] font-bold text-[#615D59]">
        <span>{label}</span>
        <b className="font-extrabold tabular-nums text-[#111110]">{value}</b>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4]">
        {segments.map((segment, index) => (
          <span
            key={index}
            className={`h-full ${segment.className}`}
            style={{
              width: `${Math.min(100, Math.max(0, segment.pct))}%`,
              minWidth: segment.pct > 0 ? 2 : 0,
            }}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  )
}

type StripState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "empty" }
  | { status: "ready"; rev: RevSyncCoverageView; summary: CrmSyncSummary }

export default function CrmSyncStrip({ coverage }: CrmSyncStripProps = {}) {
  const [fetched, setFetched] = useState<StripState>({ status: "loading" })
  const [expanded, setExpanded] = useState(false)
  const injected = coverage !== undefined

  useEffect(() => {
    // 부모 주입 모드 — 자체 fetch 생략(장부 워크벤치가 이미 같은 커버리지를 들고 있어 이중 GET 제거).
    if (injected) return
    let alive = true
    adminFetchJson<CrmCoverageResponse>("/api/admin/crm/coverage")
      .then((response) => {
        if (alive) setFetched(stripStateFromResponse(response))
      })
      .catch(() => {
        if (alive) setFetched({ status: "unavailable" })
      })
    return () => {
      alive = false
    }
  }, [injected])

  // 주입 모드는 부모 상태에서 매 렌더 파생(자체 상태 없음): 로딩(데이터 전) = loading(미렌더),
  // 실패 = unavailable 한 줄, 데이터 도착 = 자체 fetch와 동일 판정(stripStateFromResponse).
  const state: StripState = injected
    ? coverage.loading && !coverage.data
      ? { status: "loading" }
      : coverage.data
        ? stripStateFromResponse(coverage.data)
        : { status: "unavailable" }
    : fetched

  // fail-soft — 로딩 중엔 미렌더(레이아웃은 아래 콘텐츠가 그대로 올라와 있다가 준비되면 삽입).
  if (state.status === "loading" || state.status === "empty") return null
  if (state.status === "unavailable") {
    return (
      <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-2 py-0.5 text-[10.5px] text-[#615D59]">
        CRM 싱크 상태 확인 불가 — 매칭 현황은{" "}
        <Link href="/admin/crm/matching" className="font-semibold text-[#111110] underline underline-offset-2">
          매칭 인박스
        </Link>
        에서 볼 수 있습니다.
      </div>
    )
  }

  const { rev, summary } = state
  const tone = CRM_SYNC_TONE[summary.health]
  const accountPct = summary.accountTotal > 0 ? (summary.accountConnected / summary.accountTotal) * 100 : 0
  const rowLinkedPct = summary.rows.matchable > 0 ? (summary.rows.linked / summary.rows.matchable) * 100 : 0
  const rowReviewPct = summary.rows.matchable > 0 ? (summary.rows.review / summary.rows.matchable) * 100 : 0
  const revenuePct = summary.revenueTotal > 0 ? (summary.revenueLinked / summary.revenueTotal) * 100 : 0
  const topUnlinked = rev.topUnlinked.slice(0, TOP_UNLINKED_DISPLAY)

  return (
    <div className={`rounded-xl border ${tone.border} ${tone.bg}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={`flex w-full items-center gap-1 px-2 py-0.5 text-left text-[10.5px] font-semibold ${tone.text}`}
      >
        <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
        <span className="min-w-0 truncate tabular-nums">
          CRM 싱크 · 계정 {summary.accountConnected}/{summary.accountTotal} · 매출{" "}
          {summary.revenuePctLabel} · 검토 {summary.rows.review}행
        </span>
        <ChevronDown
          className={`ml-auto h-2.5 w-2.5 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="border-t border-black/5 bg-white/60 px-3.5 py-3">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)]">
            <div className="space-y-3">
              <Meter
                label="계정 연결"
                value={`${summary.accountConnected} / ${summary.accountTotal} (${summary.accountPctLabel})`}
                segments={[{ pct: accountPct, className: "bg-[#084734]" }]}
              />
              <Meter
                label={`행 연결 (매칭 대상 ${summary.rows.matchable.toLocaleString("ko-KR")}행)`}
                value={`확정 ${summary.rows.linked} · 검토 ${summary.rows.review} · 미연결 ${summary.rows.unlinked}`}
                segments={[
                  { pct: rowLinkedPct, className: "bg-[#084734]" },
                  { pct: rowReviewPct, className: "bg-[#A8741A]" },
                ]}
              />
              <Meter
                label="매출 커버리지 (¥)"
                value={`${summary.revenueLinked.toLocaleString("ko-KR")} / ${summary.revenueTotal.toLocaleString("ko-KR")} (${formatRevSyncPct(revenuePct)})`}
                segments={[{ pct: revenuePct, className: "bg-[#084734]" }]}
              />

              <p className="border-t border-dashed border-[rgba(0,0,0,0.08)] pt-2.5 text-[11.5px] text-[#615D59]">
                연결 이력: 과거 후보{" "}
                <b className="font-bold tabular-nums text-[#111110]">{summary.hygiene.orphanCandidates}</b>행
                {summary.hygiene.orphanCandidateNames != null
                  ? `(${summary.hygiene.orphanCandidateNames}개 이름)`
                  : ""}
                {" · "}은퇴 링크{" "}
                <b className="font-bold tabular-nums text-[#111110]">{summary.hygiene.staleLinks}</b>행
                {summary.hygiene.staleLinkNames != null
                  ? `(${summary.hygiene.staleLinkNames}개 이름)`
                  : ""}
                {" — "}누적 기록, 자동 재생성 대상 아님
              </p>
              <p className="text-[10.5px] text-[#615D59]">
                기준: {summary.asOf ? formatAsOf(summary.asOf) : "시각 미확인"} 동기화 · 플레이스홀더{" "}
                {summary.placeholderRows.toLocaleString("ko-KR")}행({cny(summary.placeholderRevenue)}) 매칭 제외
              </p>
            </div>

            <div>
              {topUnlinked.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr className="border-b border-[rgba(0,0,0,0.08)] text-left text-[10.5px] font-bold text-[#615D59]">
                        <th className="px-2 py-1.5 font-bold">미연결 상위 (매출 큰 순)</th>
                        <th className="px-2 py-1.5 font-bold">담당</th>
                        <th className="px-2 py-1.5 text-right font-bold">매출(¥)</th>
                        <th className="px-2 py-1.5" aria-label="매칭 이동" />
                      </tr>
                    </thead>
                    <tbody>
                      {topUnlinked.map((account) => (
                        <tr key={account.accountKey} className="border-b border-[rgba(0,0,0,0.08)] last:border-b-0">
                          <td className="whitespace-nowrap px-2 py-1.5 font-bold text-[#111110]">{account.name}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-[#615D59]">{account.manager ?? "—"}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold tabular-nums text-[#111110]">
                            {Math.round(account.unlinkedRevenue).toLocaleString("ko-KR")}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right">
                            <Link
                              href={`/admin/crm/matching?name=${encodeURIComponent(account.name)}`}
                              className="text-[11px] font-bold text-[#084734] underline-offset-2 hover:underline"
                            >
                              매칭 →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-2 py-1.5 text-[12px] text-[#615D59]">미연결 매출 계정이 없습니다.</p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/admin/crm/matching"
                  className="inline-flex items-center rounded-lg bg-[#084734] px-3 py-1.5 text-[11.5px] font-bold text-white transition hover:bg-[#065c41]"
                >
                  매칭 인박스 열기 →
                </Link>
                <Link
                  href="/admin/crm/deals/rev-sheet"
                  className="inline-flex items-center rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[11.5px] font-bold text-[#111110] transition hover:bg-[#F6F5F4]"
                >
                  매출시트 READ 표면 →
                </Link>
              </div>
            </div>
          </div>

          {/* 정직성 원칙 — 금액 "불일치" 대조는 1차 제외: 현재 확정 링크가 전부 금액 필드 없는
              고객 타깃이라 대조 가능한 쌍이 0건이고, 통화도 시트 CNY/내부 KRW/XSY 비정규 3원
              체제라 자동 환산 비교는 오보 위험이 크다. 딜 타깃 링크 확보 후 2단계에서 도입. */}
          <p className="mt-3 border-t border-black/5 pt-2.5 text-[11px] text-[#615D59]">
            금액 불일치 대조는 아직 제공하지 않음 — 대조 가능한 확정 링크 쌍이 0건(전부 금액 없는 고객 타깃)이고,
            통화 3원 체제(시트 ¥ / 내부 ₩ / Xiaoshouyi 비정규)라 자동 환산 비교는 오보 위험이 있습니다.
          </p>
        </div>
      )}
    </div>
  )
}
