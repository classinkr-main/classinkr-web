"use client"

import { memo } from "react"

import { getBusinessDateParts } from "@/lib/business-time"
import { formatNumber, type HardwareDashboard } from "./shared"

// 시트 이관 신선도 스트립 — importRun(status·finished_at·rows)을 홈 최상단에 상시 노출한다.
// 이관이 오래 묵으면 창고·가용 수치가 실물과 어긋난 채 화면만 멀쩡해 보이는 사고(7/1 이관 데이터로
// 음수 가용을 48일 방치)가 재발하지 않도록, 경과 단계별로 신호를 올린다.
const FRESH_MAX_DAYS = 7
const STALE_MAX_DAYS = 21

function kstDateKey(value: string | null): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return getBusinessDateParts(parsed).date
}

// "10/22 14:20" — KST 기준 짧은 표기. 잘못된 값은 빈 문자열.
function formatCheckedAt(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ""
  const parts = getBusinessDateParts(parsed)
  const time = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(parsed)
  return `${parts.date.slice(5).replace("-", "/")} ${time}`
}

function daysBetweenKeys(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.max(0, Math.round((end - start) / 86400000))
}

// "none"(이관 기록 자체가 없음)은 danger/warning과 다르게 다룬다 — 신규 설치 등 아직 한 번도
// 이관하지 않은 상태라 "악화"가 아니라 "시작 전"이라, 이 화면(스트립)은 계속 중립 톤으로 보여준다.
export type ImportFreshnessLevel = "none" | "ok" | "warning" | "danger"

export interface ImportFreshnessJudgement {
  level: ImportFreshnessLevel
  failed: boolean
  finishedKey: string | null
  daysAgo: number | null
}

// 이관 신선도 판정 — 홈 요약 밴드(SummaryBand)가 이 스트립과 다른 임계값으로 따로 판단하면
// 두 곳이 어긋난 신호를 보여줄 수 있다(예: 스트립은 "정상"인데 요약 밴드는 "경고"). 감사
// (2026-09-14, 홈 가시성 개편)로 판정 로직을 이 순수 함수 하나로 뽑아 두 소비처가 같은 임계값
// (FRESH_MAX_DAYS·STALE_MAX_DAYS)과 같은 결과를 쓰게 한다 — 임계를 새로 발명하지 않는다.
export function judgeImportFreshness(importRun: HardwareDashboard["importRun"]): ImportFreshnessJudgement {
  if (!importRun) return { level: "none", failed: false, finishedKey: null, daysAgo: null }
  const failed = importRun.status !== "success"
  // 매시간 자동 가져오기는 시트가 그대로면 원장을 다시 싣지 않고 확인 시각만 남긴다. 그 확인도 "지금 시트와
  // 원장이 같다"는 근거이므로, 마지막 반영일 대신 마지막 확인일로 신선도를 본다(실패 기록에는 쓰지 않는다).
  const finishedKey = kstDateKey((!failed ? importRun.last_checked_at : null) ?? importRun.finished_at ?? importRun.started_at)
  const todayKst = getBusinessDateParts().date
  const daysAgo = finishedKey ? daysBetweenKeys(finishedKey, todayKst) : null
  const level: ImportFreshnessLevel =
    failed || (daysAgo != null && daysAgo > STALE_MAX_DAYS) ? "danger" : daysAgo != null && daysAgo > FRESH_MAX_DAYS ? "warning" : "ok"
  return { level, failed, finishedKey, daysAgo }
}

interface ImportFreshnessStripProps {
  importRun: HardwareDashboard["importRun"]
  // 감사(2026-09-07 #1) — 시트 이관 금액 컬럼이 raw 백업에서 복구된 행 수. optional은 구버전
  // 응답·테스트 픽스처 호환용(shared.tsx HardwareDashboard.importCosting 참고).
  importCosting?: HardwareDashboard["importCosting"]
}

// 원천 경고는 한 줄 상태로 유지하고, 상세만 펼쳐 본다.
function ImportFreshnessStrip({ importRun, importCosting }: ImportFreshnessStripProps) {
  const { level, failed, finishedKey, daysAgo } = judgeImportFreshness(importRun)
  const recovered = importCosting?.recoveredFromRawCount ?? 0
  const sourceIssue = level !== "ok"
  const issueCount = Number(sourceIssue) + Number(recovered > 0)
  const tone = failed || level === "danger" ? "text-[#B43E3E]" : level === "warning" || recovered > 0 ? "text-[#A8741A]" : "text-[#615D59]"
  const headline = !importRun ? "시트 이관 기록 없음" : failed ? "시트 이관 실패" : `시트 ${finishedKey?.slice(5).replace("-", "/") ?? "일자 미확인"}${level !== "ok" ? " · 갱신 검토" : ""}`

  return (
    <section id="hardware-section-freshness" data-testid="hardware-import-freshness" className="relative flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] sm:w-auto">
      <span className={tone}>{headline}</span>
      <details className="sm:relative" onKeyDown={event => { if (event.key === "Escape" && event.currentTarget.open) { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector<HTMLElement>("summary")?.focus() } }}>
        <summary className={`cursor-pointer rounded-md px-1 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-[#084734] ${tone}`}>{issueCount ? `확인 ${issueCount}건` : "시트 상세"}</summary>
        <div className="absolute left-0 top-full z-40 mt-1 w-80 max-w-[calc(100vw-2rem)] space-y-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4 text-[12px] shadow-lg sm:left-auto sm:right-0">
          <div>
            <p className={`font-semibold ${tone}`}>{!importRun ? "시트를 가져와 시작하세요" : failed ? "마지막 시트 이관 실패" : daysAgo == null ? "반영 일자 확인 필요" : `시트 반영 ${formatNumber(daysAgo)}일 전`}</p>
            <p className="mt-1 leading-relaxed text-[#615D59]">{failed ? importRun?.error ?? "최신화 메뉴에서 다시 시도하세요." : sourceIssue ? "시트 최신화 메뉴에서 동기화·백업 후 반영할 수 있습니다." : "원천 갱신이 정상 범위입니다."}</p>
          </div>
          {importRun ? <p className="text-[11px] tabular-nums text-[#615D59]">{finishedKey ?? "일자 미확인"} · {formatNumber(importRun.rows_imported ?? 0)}행 반영 · {formatNumber(importRun.rows_skipped ?? 0)}행 건너뜀</p> : null}
          {importRun && !failed && importRun.last_checked_at ? <p className="text-[11px] tabular-nums text-[#615D59]">매시간 자동 확인 · 마지막 확인 {formatCheckedAt(importRun.last_checked_at)} · 시트 변경 없음</p> : null}
          {recovered > 0 ? <div data-testid="hardware-import-costing-recovery" className="border-t border-[rgba(0,0,0,0.08)] pt-3"><p className="font-semibold text-[#A8741A]">금액 원본 확인 필요</p><p className="mt-1 leading-relaxed text-[#615D59]">{formatNumber(recovered)}건은 백업 금액을 사용 중입니다. 원본 금액 저장 상태를 확인해야 합니다.</p></div> : null}
        </div>
      </details>
    </section>
  )
}

export default memo(ImportFreshnessStrip)
