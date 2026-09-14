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

interface ImportFreshnessStripProps {
  importRun: HardwareDashboard["importRun"]
  // 감사(2026-09-07 #1) — 시트 이관 금액 컬럼이 raw 백업에서 복구된 행 수. optional은 구버전
  // 응답·테스트 픽스처 호환용(shared.tsx HardwareDashboard.importCosting 참고).
  importCosting?: HardwareDashboard["importCosting"]
}

// 시트 이관 금액이 raw 백업에서 조용히 복구되고 있다는 것을 알리는 배너 한 줄.
// 감사(2026-09-07 #1): replace_hardware_sheet_import RPC가 구버전(20260630 마이그레이션 미적용)이면
// amount_usd/amount_cny/unit_price/importer 컬럼이 비고, 화면은 recoverMoneyFromRaw 덕에 멀쩡해
// 보이지만 실은 매 조회마다 raw JSON을 되풀이해서 파싱하는 임시방편이다 — 마이그 적용 전엔 절대
// 0이 될 수 없으니, 신선도 스트립과 별개 줄로 상시 노출해 "쓸 수는 있지만 위태롭다"를 드러낸다.
function MoneyRecoveryNotice({ importCosting }: { importCosting: HardwareDashboard["importCosting"] }) {
  const count = importCosting?.recoveredFromRawCount ?? 0
  if (count <= 0) return null
  return (
    <section
      data-testid="hardware-import-costing-recovery"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[#ECD29C] bg-[#FBF1E0] px-4 py-2.5 text-[11.5px] font-semibold text-[#7A520F] shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[#A8741A]" />
      <span>
        시트 이관 금액 {formatNumber(count)}건이 원본 컬럼이 아니라 raw 백업에서 복구되었습니다 — 이관 RPC가
        구버전(20260630 비용 컬럼 마이그레이션 미적용)일 때 생기는 임시 상태입니다. 매입/매출 단가가 화면엔
        정상으로 보여도 DB 컬럼 자체는 비어 있으니, 운영자가 마이그레이션을 적용해야 근본적으로 해소됩니다.
      </span>
    </section>
  )
}

function ImportFreshnessStrip({ importRun, importCosting }: ImportFreshnessStripProps) {
  if (!importRun) {
    return (
      <>
        <section className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[#A39E98]" />
          <p className="text-[12px] font-semibold text-[#615D59]">
            시트 이관 기록이 없습니다 · 상단 &lsquo;싱크·백업 후 가져오기&rsquo; 또는 업로드로 시작하세요
          </p>
        </section>
        <MoneyRecoveryNotice importCosting={importCosting} />
      </>
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
    <>
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
      <MoneyRecoveryNotice importCosting={importCosting} />
    </>
  )
}

export default memo(ImportFreshnessStrip)
