"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { useBranchJson } from "./client-api"

const IDLE_FETCH_TIMEOUT_MS = 300

// 통합된 정합 상세(구 AI 탭 DataQualityPanel, 품질 웨이브 2 — 항목 6) — "전체 규칙 상세"
// 토글을 실제로 열 때만 청크를 내려받는다. 이미 개요 진입 시 IntegrityStrip 자체가
// idle-지연 마운트되므로(위 스켈레톤 참조) 여기선 별도 로딩 스켈레톤 없이 showDetail
// 트리거 직후 짧게 비어 있다가 채워지는 정도로 충분하다 — 자체 스켈레톤(h-44)을 그대로 재사용.
const DataQualityPanel = dynamic(() => import("./sections/DataQualityPanel"), {
  loading: () => <div className="h-44 animate-pulse rounded-xl bg-[#f0f0ec]" />,
})

// data-quality.ts(server 전용 REV_RANGE/parseRangeLastRow 임포트 보유)는 import 금지 —
// CrmCoverageStrip과 동일하게 응답 shape만 로컬 선언한다. DataQualityPanel(클라이언트
// 컴포넌트, server 전용 임포트 없음)의 Issue 타입과는 구조적으로 호환되므로(samples 보유)
// 별도 변환 없이 그대로 data prop에 내려줄 수 있다.
type DqSeverity = "info" | "warn" | "error"
interface DqIssue {
  id: string
  severity: DqSeverity
  message: string
  samples?: unknown[]
  sheetRow?: number
}
interface DataQualityResponse {
  issues?: DqIssue[]
  checkedAt?: string
  ruleCount?: number
  sourceCounts?: Record<string, number>
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
 *
 * 페치 지연: /api/admin/branch/data-quality는 구글 시트 3콜(DSH/SEG/KPI)을 직접 읽는
 * 무거운 라우트라 개요 마운트 즉시 fetch하면 크리티컬 패스에 얹힌다. 그래서 마운트 직후
 * 바로 쏘지 않고 (1) 뷰포트에 들어오고 (2) requestIdleCallback(최대 300ms 타임아웃, 미지원
 * 브라우저는 300ms setTimeout)이 지나야 실제 useBranchJson을 마운트해 fetch를 트리거한다.
 * 지연 중에는 자리 유지용 스켈레톤만 그린다(레이아웃 시프트 방지).
 *
 * 정보 계층 단일화(품질 웨이브 2 — 항목 4): 과거엔 이 스트립(개요 요약)과 AI 탭의
 * DataQualityPanel(admin 전용 상세)이 같은 라우트를 각자 fetch해 3중으로 노출됐다.
 * 이제 DataQualityPanel은 AI 탭에서 빠지고, 이 스트립이 펼쳐진 하단의 "전체 규칙 상세"
 * 토글로만 접근한다 — 여기서 이미 받아온 useBranchJson 응답(data)을 그대로 내려줘
 * data-quality 라우트를 다시 fetch하지 않는다. canRunAdminOperations 게이팅은 이
 * 상세 토글에만 적용되고, 배지 자체(요약 배지 + 이슈 목록 펼침)는 모든 열람자에게 보인다.
 */
export default function IntegrityStrip({
  refreshKey = 0,
  canRunAdminOperations = false,
}: {
  refreshKey?: number
  /** "전체 규칙 상세"(구 DataQualityPanel) 토글 노출 여부 — 그 외 배지·펼침은 게이팅 없음. */
  canRunAdminOperations?: boolean
}) {
  const [ready, setReady] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (ready) return
    let idleHandle: number | null = null
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null
    let observer: IntersectionObserver | null = null

    const scheduleIdleFetch = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(() => setReady(true), { timeout: IDLE_FETCH_TIMEOUT_MS })
      } else {
        timeoutHandle = setTimeout(() => setReady(true), IDLE_FETCH_TIMEOUT_MS)
      }
    }

    if (typeof IntersectionObserver === "function" && sentinelRef.current) {
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer?.disconnect()
        scheduleIdleFetch()
      })
      observer.observe(sentinelRef.current)
    } else {
      // IntersectionObserver 미지원 환경(구형 브라우저 등)은 뷰포트 판정 없이 idle 지연만 적용.
      scheduleIdleFetch()
    }

    return () => {
      observer?.disconnect()
      if (idleHandle != null) window.cancelIdleCallback?.(idleHandle)
      if (timeoutHandle != null) clearTimeout(timeoutHandle)
    }
  }, [ready])

  if (!ready) {
    return <div ref={sentinelRef} className="h-9 animate-pulse rounded-xl bg-[#f0f0ec]" />
  }

  return <IntegrityStripPanel refreshKey={refreshKey} canRunAdminOperations={canRunAdminOperations} />
}

function IntegrityStripPanel({
  refreshKey,
  canRunAdminOperations,
}: {
  refreshKey: number
  canRunAdminOperations: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  // 품질 웨이브 3 — 항목 2. 재시도 버튼이 눌리면 nonce를 올려 캐시 키(url 기반)를 바꿔
  // useBranchJson이 새 네트워크 요청을 쏘게 한다 — refreshKey(부모 전역 새로고침)는
  // 건드리지 않고 이 스트립만 독립적으로 재시도한다.
  const [retryNonce, setRetryNonce] = useState(0)
  const dataUrl = retryNonce > 0
    ? `/api/admin/branch/data-quality?retry=${retryNonce}`
    : "/api/admin/branch/data-quality"
  const { data, error, loading } = useBranchJson<DataQualityResponse>(dataUrl, refreshKey)

  // info는 참고용 각주라 배지 카운트·펼침 목록에서 제외한다 — 실제 조치가 필요한
  // warn/error만 "이슈"로 센다(예: DQ-11 SEG status==goal 지역 안내).
  const actionable = useMemo(
    () => (data?.issues ?? []).filter((issue) => issue.severity !== "info"),
    [data],
  )
  const warnCount = actionable.filter((issue) => issue.severity === "warn").length
  const errorCount = actionable.filter((issue) => issue.severity === "error").length
  const total = actionable.length

  // 이전엔 실패를 null로 위장해 "이슈 없음"과 "체크 자체가 안 됨"이 구분되지 않았다
  // (품질 웨이브 3 — 항목 2). 이제 뉴트럴 톤 한 줄 + 재시도로 구분한다.
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-3.5 py-2 text-[12px] text-[#615D59]">
        <span>정합 체크 불가 — 재시도</span>
        <button
          type="button"
          onClick={() => setRetryNonce((n) => n + 1)}
          className="font-semibold text-[#111110] underline underline-offset-2"
        >
          다시 시도
        </button>
      </div>
    )
  }
  if (loading && !data) return <div className="h-9 animate-pulse rounded-xl bg-[#f0f0ec]" />
  if (!data) return null

  const clean = total === 0

  // error가 하나라도 있으면 배지 톤을 캐논 Danger로 승격, 이슈 없음은 Success·Info,
  // warning만 있을 때는 기존 SyncStatusBar의 "임포트 지연" 앰버(캐논 Warning) 톤을 재사용.
  const tone = clean
    ? { border: "border-[#BDEFD8]", bg: "bg-[#ECFDF5]", text: "text-[#084734]", dot: "bg-[#084734]" }
    : errorCount > 0
    ? { border: "border-[#B43E3E]/25", bg: "bg-[#FCE9E9]", text: "text-[#8F2C2C]", dot: "bg-[#B43E3E]" }
    : { border: "border-[#ECD29C]", bg: "bg-[#FBF1E0]", text: "text-[#7A520F]", dot: "bg-[#A8741A]" }

  // DataQualityPanel(구 AI 탭 상세)에 그대로 내려줄 데이터 — 이 시점엔 data가 확정돼 있고
  // 위에서 error가 있으면 이미 return null 했으므로 error는 항상 null.
  const detailData = {
    issues: data.issues ?? [],
    checkedAt: data.checkedAt,
    ruleCount: data.ruleCount,
    sourceCounts: data.sourceCounts,
    error: null,
    loading,
  }

  return (
    <div className={`rounded-xl border ${tone.border} ${tone.bg}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={`flex w-full items-center gap-2 px-3.5 py-2 text-left text-[12px] font-semibold ${tone.text}`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
        {clean
          ? <>정합 체크 — 이슈 없음 (규칙 {data.ruleCount ?? 0}개 통과)</>
          : <>정합 체크 — 이슈 {total}건 (warning {warnCount} · error {errorCount})</>}
        <ChevronDown
          className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="space-y-1.5 border-t border-black/5 px-3.5 py-2.5">
          {actionable.length === 0 && (
            <p className="text-[11.5px] text-[#615D59]">조치가 필요한 이슈가 없습니다.</p>
          )}
          {actionable.map((issue, index) => (
            <div
              key={`${issue.id}-${index}`}
              className="flex flex-wrap items-center gap-2 text-[12px] text-[#111110]/80"
            >
              <span
                className={`shrink-0 rounded-md border bg-white px-1.5 py-0.5 font-mono text-[10.5px] font-bold ${
                  issue.severity === "error"
                    ? "border-[#B43E3E]/25 text-[#B43E3E]"
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

          {/* 상세(구 DataQualityPanel)는 admin 전용 — 요약 배지·이슈 목록은 게이팅 없음. */}
          {canRunAdminOperations && (
            <div className={actionable.length > 0 ? "mt-1.5 border-t border-black/5 pt-2.5" : ""}>
              <button
                type="button"
                onClick={() => setShowDetail((v) => !v)}
                aria-expanded={showDetail}
                className={`inline-flex items-center gap-1 text-[11.5px] font-bold underline underline-offset-2 ${tone.text}`}
              >
                전체 규칙 상세 {showDetail ? "숨기기" : "보기"}
              </button>
              {showDetail && (
                <div className="mt-2.5">
                  <DataQualityPanel mode="ops" data={detailData} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
