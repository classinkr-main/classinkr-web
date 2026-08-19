"use client"

import { memo } from "react"

import { getBusinessDateParts } from "@/lib/business-time"
import { formatNumber, MONO_META_CLASS, type HardwareDashboard } from "./shared"

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

function daysBetweenKeys(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.max(0, Math.round((end - start) / 86400000))
}

function ImportFreshnessStrip({ importRun }: { importRun: HardwareDashboard["importRun"] }) {
  if (!importRun) {
    return (
      <section className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[#A39E98]" />
        <p className="text-[12px] font-semibold text-[#615D59]">
          시트 이관 기록이 없습니다 · 상단 &lsquo;싱크·백업 후 가져오기&rsquo; 또는 업로드로 시작하세요
        </p>
      </section>
    )
  }

  const failed = importRun.status !== "success"
  const finishedKey = kstDateKey(importRun.finished_at ?? importRun.started_at)
  const todayKst = getBusinessDateParts().date
  const daysAgo = finishedKey ? daysBetweenKeys(finishedKey, todayKst) : null
  const level: "danger" | "warning" | "ok" =
    failed || (daysAgo != null && daysAgo > STALE_MAX_DAYS) ? "danger" : daysAgo != null && daysAgo > FRESH_MAX_DAYS ? "warning" : "ok"

  const toneClass =
    level === "danger"
      ? "border-[#F2B8B8] bg-[#FCE9E9]"
      : level === "warning"
        ? "border-[#ECD29C] bg-[#FBF1E0]"
        : "border-[rgba(0,0,0,0.08)] bg-white"
  const dotClass = level === "danger" ? "bg-[#B43E3E]" : level === "warning" ? "bg-[#A8741A]" : "bg-[#084734]"
  const textClass = level === "danger" ? "text-[#8F2C2C]" : level === "warning" ? "text-[#7A520F]" : "text-[#615D59]"

  return (
    <section
      data-testid="hardware-import-freshness"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] ${toneClass}`}
    >
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
      <p className={`text-[12px] font-bold ${level === "ok" ? "text-[#111110]" : textClass}`}>
        {failed ? "마지막 시트 이관 실패" : daysAgo == null ? "시트 이관" : daysAgo === 0 ? "시트 이관 오늘" : `시트 이관 ${formatNumber(daysAgo)}일 전`}
      </p>
      {finishedKey && <span className={`text-[11.5px] ${MONO_META_CLASS} ${textClass}`}>{finishedKey}</span>}
      {!failed && importRun.rows_imported != null && (
        <span className={`text-[11.5px] font-semibold tabular-nums ${textClass}`}>
          {formatNumber(importRun.rows_imported)}행 반영
          {importRun.rows_skipped ? ` · ${formatNumber(importRun.rows_skipped)}행 건너뜀` : ""}
        </span>
      )}
      {failed && (
        <span className="min-w-0 truncate text-[11.5px] font-semibold text-[#8F2C2C]" title={importRun.error ?? undefined}>
          {importRun.error ?? `상태 ${importRun.status}`} · 상단 &lsquo;싱크·백업 후 가져오기&rsquo;로 재시도
        </span>
      )}
      {!failed && level !== "ok" && (
        <span className={`text-[11.5px] font-semibold ${textClass}`}>
          {level === "danger"
            ? "재고 수치가 실물과 다를 수 있습니다 · 상단 '싱크·백업 후 가져오기'로 갱신"
            : "이관 경과 — 갱신 검토"}
        </span>
      )}
    </section>
  )
}

export default memo(ImportFreshnessStrip)
