"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { useBranchJson } from "./client-api"

// data-quality.ts(server 전용 REV_RANGE/parseRangeLastRow 임포트 보유)는 import 금지 —
// CrmCoverageStrip과 동일하게 응답 shape만 로컬 선언한다.
type DqSeverity = "info" | "warn" | "error"
interface DqIssue {
  id: string
  severity: DqSeverity
  message: string
  sheetRow?: number
}
interface DataQualityResponse {
  issues?: DqIssue[]
  checkedAt?: string
  ruleCount?: number
}

function ledgerHref(sheetRow: number): string {
  return `/admin/branch/ledger?lens=rev&q=${encodeURIComponent(String(sheetRow))}`
}

/**
 * KR Team 개요의 정합성 배지(스펙 항목 3 — 정합성 배지 승격).
 * `/api/admin/branch/data-quality`가 이미 계산해 둔 이슈 목록을 그대로 승격해 보여줄 뿐,
 * 새 집계·판정 로직은 여기 없다 — 그 라우트는 시트 QC 레인을 직접 읽어 무겁고 서버에서
 * 60초 캐시되므로(readDsh/readSeg/readKpi의 unstable_cache) 클라이언트도 useBranchJson
 * (내부적으로 adminFetchJsonCached, ttl 60초)으로 맞춘다.
 *
 * 롤 주의: /api/admin/branch/data-quality 라우트는 `verifyAdmin(req)`를 두 번째 인자
 * 없이 호출한다 → GET 기본값인 `defaultAdminApiRolesForMethod`가 적용되어
 * BRANCH_READ_ADMIN_API_ROLES(SUPER_ADMIN·ADMIN·BRANCH·EDITOR·VIEWER)로 검증한다. 즉
 * 현재는 BRANCH 롤도 이 라우트를 통과한다. 그래도 401/403을 포함한 모든 실패는
 * "이슈 없음"으로 위장하지 않고 스트립 자체를 렌더하지 않는다(null) — 라우트가 나중에
 * allowedRoles를 좁혀 BRANCH를 막더라도 이 컴포넌트는 조용히 사라지는 것이 맞는 동작이다.
 */
export default function IntegrityStrip({ refreshKey = 0 }: { refreshKey?: number }) {
  const [expanded, setExpanded] = useState(false)
  const { data, error, loading } = useBranchJson<DataQualityResponse>(
    "/api/admin/branch/data-quality",
    refreshKey,
  )

  // info는 참고용 각주라 배지 카운트·펼침 목록에서 제외한다 — 실제 조치가 필요한
  // warn/error만 "이슈"로 센다(예: DQ-11 SEG status==goal 지역 안내).
  const actionable = useMemo(
    () => (data?.issues ?? []).filter((issue) => issue.severity !== "info"),
    [data],
  )
  const warnCount = actionable.filter((issue) => issue.severity === "warn").length
  const errorCount = actionable.filter((issue) => issue.severity === "error").length
  const total = actionable.length

  if (error) return null
  if (loading && !data) return <div className="h-9 animate-pulse rounded-xl bg-[#f0f0ec]" />
  if (!data) return null

  if (total === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-[12px] font-semibold text-emerald-800">
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
        정합 체크 — 이슈 없음 (규칙 {data.ruleCount ?? 0}개 통과)
      </div>
    )
  }

  // error가 하나라도 있으면 배지 톤을 테라코타로 승격 — warning만 있을 때는 기존
  // SyncStatusBar의 "임포트 지연" 앰버 톤을 그대로 재사용한다.
  const tone = errorCount > 0
    ? { border: "border-[#B85C33]/25", bg: "bg-[#FBEAE2]", text: "text-[#7A2A13]", dot: "bg-[#B85C33]" }
    : { border: "border-[#ECD29C]", bg: "bg-[#FBF1E0]", text: "text-[#7A520F]", dot: "bg-[#A8741A]" }

  return (
    <div className={`rounded-xl border ${tone.border} ${tone.bg}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={`flex w-full items-center gap-2 px-3.5 py-2 text-left text-[12px] font-semibold ${tone.text}`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
        정합 체크 — 이슈 {total}건 (warning {warnCount} · error {errorCount})
        <ChevronDown
          className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="space-y-1.5 border-t border-black/5 px-3.5 py-2.5">
          {actionable.map((issue, index) => (
            <div
              key={`${issue.id}-${index}`}
              className="flex flex-wrap items-center gap-2 text-[12px] text-[#111110]/80"
            >
              <span
                className={`shrink-0 rounded-md border bg-white px-1.5 py-0.5 font-mono text-[10.5px] font-bold ${
                  issue.severity === "error"
                    ? "border-[#B85C33]/25 text-[#B85C33]"
                    : "border-[#ECD29C] text-[#A8741A]"
                }`}
              >
                {issue.id}
              </span>
              <span className="min-w-0 flex-1">{issue.message}</span>
              {typeof issue.sheetRow === "number" && (
                <Link
                  href={ledgerHref(issue.sheetRow)}
                  className={`shrink-0 font-semibold underline underline-offset-2 ${tone.text}`}
                >
                  장부에서 열기 →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
