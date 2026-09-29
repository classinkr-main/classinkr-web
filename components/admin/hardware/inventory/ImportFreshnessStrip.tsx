"use client"

import { memo } from "react"

import { formatBusinessDateTimeLabel, getBusinessDateParts } from "@/lib/business-time"
import { formatNumber, MONO_META_CLASS, type HardwareDashboard, type HardwareMirrorRowCounts } from "./shared"

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

// "none"(이관 기록 자체가 없음)은 danger/warning과 다르게 다룬다 — 신규 설치 등 아직 한 번도
// 이관하지 않은 상태라 "악화"가 아니라 "시작 전"이라, 이 화면(스트립)은 계속 중립 톤으로 보여준다.
export type ImportFreshnessLevel = "none" | "ok" | "warning" | "danger"

// 최신 이관 기록의 상태(하드웨어 라운드 2 S-5·H-11). 예전엔 status가 success가 아니면 전부 "실패"였다 —
// 방금 누른 가져오기(running)도, 함수가 죽고 남은 running도 "이관 실패 · 재시도"로 보여 동시 재실행을 부추겼다.
export type ImportRunState = "none" | "success" | "running" | "stalled" | "failed"

// 서버 가져오기 잠금 창(HARDWARE_IMPORT_LOCK_WINDOW_MS)과 같은 값 — 이보다 오래된 running은 중단으로 본다.
export const IMPORT_RUNNING_WINDOW_MS = 10 * 60_000

export interface ImportFreshnessJudgement {
  level: ImportFreshnessLevel
  failed: boolean
  finishedKey: string | null
  daysAgo: number | null
  state: ImportRunState
  // running일 때 시작 후 경과 분.
  runningMinutes: number | null
  // 경과일을 센 기준 이관(마지막 성공)의 KST 날짜. 최신이 성공이면 finishedKey와 같다.
  basisKey: string | null
}

// 이관 신선도 판정 — 홈 요약 밴드(SummaryBand)가 이 스트립과 다른 임계값으로 따로 판단하면
// 두 곳이 어긋난 신호를 보여줄 수 있다(예: 스트립은 "정상"인데 요약 밴드는 "경고"). 감사
// (2026-09-14, 홈 가시성 개편)로 판정 로직을 이 순수 함수 하나로 뽑아 두 소비처가 같은 임계값
// (FRESH_MAX_DAYS·STALE_MAX_DAYS)과 같은 결과를 쓰게 한다 — 임계를 새로 발명하지 않는다.
// 라운드 2: 최신 이관이 성공이 아니면 경과일은 마지막 성공 이관(lastSuccess) 기준으로 센다 — 원장 숫자가
// 실제로 언제 기준인지는 마지막 성공이 정한다. 진행 중이면 실패로 치지 않는다.
export function judgeImportFreshness(
  importRun: HardwareDashboard["importRun"],
  options: { lastSuccess?: HardwareDashboard["importRun"] | null; now?: number } = {}
): ImportFreshnessJudgement {
  if (!importRun) {
    return { level: "none", failed: false, finishedKey: null, daysAgo: null, state: "none", runningMinutes: null, basisKey: null }
  }
  const now = options.now ?? Date.now()
  const todayKst = getBusinessDateParts(new Date(now)).date
  const finishedKey = kstDateKey(importRun.finished_at ?? importRun.started_at)

  let state: ImportRunState = "failed"
  let runningMinutes: number | null = null
  if (importRun.status === "success") state = "success"
  else if (importRun.status === "running") {
    const started = Date.parse(importRun.started_at)
    const elapsed = Number.isFinite(started) ? now - started : Number.POSITIVE_INFINITY
    if (elapsed <= IMPORT_RUNNING_WINDOW_MS) {
      state = "running"
      runningMinutes = Math.max(0, Math.floor(elapsed / 60_000))
    } else {
      state = "stalled"
    }
  }

  const basis = state === "success" ? importRun : options.lastSuccess ?? null
  const basisKey = basis ? kstDateKey(basis.finished_at ?? basis.started_at) : null
  // 기준 이관이 없으면(성공한 적 없음) 최신 기록 날짜로 센다 — 예전 동작 그대로.
  const daysKey = basisKey ?? finishedKey
  const daysAgo = daysKey ? daysBetweenKeys(daysKey, todayKst) : null
  const failed = state === "failed" || state === "stalled"
  const staleLevel: ImportFreshnessLevel =
    daysAgo != null && daysAgo > STALE_MAX_DAYS ? "danger" : daysAgo != null && daysAgo > FRESH_MAX_DAYS ? "warning" : "ok"
  const level: ImportFreshnessLevel = failed ? "danger" : staleLevel
  return { level, failed, finishedKey, daysAgo, state, runningMinutes, basisKey }
}

export interface MirrorPendingJudgement {
  syncedAt: string | null
  // 원장이 기준으로 삼은 이관 당시 미러 행 수 대비 지금 미러의 차이. null = 비교할 기록이 없다.
  delta: HardwareMirrorRowCounts | null
  changed: boolean
}

/**
 * "시트에 원장과 다른 행이 있다" 판정(하드웨어 라운드 2 S-9) — 원장이 기준으로 삼은 이관(마지막 성공)의
 * 미러 행 수(raw.mirror_rows)와 지금 미러 행 수를 비교한다. 크론은 미러를 매일 갱신하지만 원장 반영은
 * 가져오기 버튼이라, 이 차이가 곧 "가져오기 대기"다. 행 수 비교라 같은 행 안의 값 수정은 잡지 못한다.
 */
export function judgeMirrorPending(
  basisRun: HardwareDashboard["importRun"],
  mirror: HardwareDashboard["mirror"]
): MirrorPendingJudgement | null {
  if (!mirror) return null
  const recorded = basisRun?.mirror_rows ?? null
  if (!recorded) return { syncedAt: mirror.syncedAt, delta: null, changed: false }
  const delta: HardwareMirrorRowCounts = {
    inbound: mirror.rows.inbound - (Number(recorded.inbound) || 0),
    outbound: mirror.rows.outbound - (Number(recorded.outbound) || 0),
    stock: mirror.rows.stock - (Number(recorded.stock) || 0),
  }
  return { syncedAt: mirror.syncedAt, delta, changed: delta.inbound !== 0 || delta.outbound !== 0 || delta.stock !== 0 }
}

function signed(value: number): string {
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value)
}

/** "입고 +1 · 출고 +3" — 0인 항목은 뺀다. */
export function describeMirrorDelta(delta: HardwareMirrorRowCounts): string {
  const parts: string[] = []
  if (delta.inbound !== 0) parts.push(`입고 ${signed(delta.inbound)}`)
  if (delta.outbound !== 0) parts.push(`출고 ${signed(delta.outbound)}`)
  if (delta.stock !== 0) parts.push(`재고현황 ${signed(delta.stock)}`)
  return parts.join(" · ")
}

function formatKstDateTime(value: string | null | undefined): string | null {
  if (!value) return null
  const label = formatBusinessDateTimeLabel(value)
  // "YYYY-MM-DD HH:mm" → "M/D HH:mm"
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/.exec(label)
  return match ? `${Number(match[2])}/${Number(match[3])} ${match[4]}` : label
}

interface ImportFreshnessStripProps {
  importRun: HardwareDashboard["importRun"]
  importRunLastSuccess?: HardwareDashboard["importRunLastSuccess"]
  mirror?: HardwareDashboard["mirror"]
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

// 미러 줄 — 시트 싱크 시각과 "가져오기 대기" 판정. 미러 조회가 실패했거나 구응답이면 그리지 않는다.
function MirrorPendingLine({ pending }: { pending: MirrorPendingJudgement | null }) {
  if (!pending) return null
  const synced = formatKstDateTime(pending.syncedAt)
  const changed = pending.changed && pending.delta
  return (
    <p
      data-testid="hardware-mirror-pending"
      className={`flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] font-semibold ${changed ? "text-[#7A520F]" : "text-[#615D59]"}`}
    >
      {synced && <span className={MONO_META_CLASS}>시트 싱크 {synced}</span>}
      {changed ? (
        <span>
          · 시트에 원장과 다른 행 {describeMirrorDelta(pending.delta!)} — 상단 &lsquo;싱크·백업 후 가져오기&rsquo;로 반영(행 수 기준)
        </span>
      ) : pending.delta ? (
        <span>· 행 수 기준 원장과 같음</span>
      ) : null}
    </p>
  )
}

function ImportFreshnessStrip({ importRun, importRunLastSuccess, mirror, importCosting }: ImportFreshnessStripProps) {
  if (!importRun) {
    return (
      <>
        {/* id: 홈 요약 밴드의 "이관 신선도" 칸이 앵커 스크롤로 여기를 가리킨다(감사 2026-09-14). */}
        <section id="hardware-section-freshness" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[#A39E98]" />
          <p className="text-[12px] font-semibold text-[#615D59]">
            시트 이관 기록이 없습니다 · 상단 &lsquo;싱크·백업 후 가져오기&rsquo; 또는 업로드로 시작하세요
          </p>
          <MirrorPendingLine pending={judgeMirrorPending(null, mirror ?? null)} />
        </section>
        <MoneyRecoveryNotice importCosting={importCosting} />
      </>
    )
  }

  const { level, failed, finishedKey, daysAgo, state, runningMinutes, basisKey } = judgeImportFreshness(importRun, {
    lastSuccess: importRunLastSuccess ?? null,
  })
  const basisRun = state === "success" ? importRun : importRunLastSuccess ?? null
  const pending = judgeMirrorPending(basisRun, mirror ?? null)
  // 원장이 시트보다 뒤처졌으면(가져오기 대기) 정상 톤이라도 경고로 올린다 — 숫자가 시트와 다르다는 신호다.
  const effectiveLevel: ImportFreshnessLevel = level === "ok" && pending?.changed ? "warning" : level

  const toneClass =
    effectiveLevel === "danger"
      ? "border-[#F2B8B8] bg-[#FCE9E9]"
      : effectiveLevel === "warning"
        ? "border-[#ECD29C] bg-[#FBF1E0]"
        : "border-[rgba(0,0,0,0.08)] bg-white"
  const dotClass = effectiveLevel === "danger" ? "bg-[#B43E3E]" : effectiveLevel === "warning" ? "bg-[#A8741A]" : "bg-[#084734]"
  const textClass = effectiveLevel === "danger" ? "text-[#8F2C2C]" : effectiveLevel === "warning" ? "text-[#7A520F]" : "text-[#615D59]"
  const originLabel = importRun.origin === "ledger_file" ? "원장 파일 업로드" : importRun.origin === "sheet" ? "시트" : null

  const headline =
    state === "running"
      ? `시트 이관 진행 중 (${runningMinutes === 0 ? "방금 시작" : `${formatNumber(runningMinutes ?? 0)}분 전 시작`})`
      : state === "stalled"
        ? "마지막 시트 이관 중단됨(시간 초과 추정)"
        : failed
          ? "마지막 시트 이관 실패"
          : daysAgo == null
            ? "시트 이관"
            : daysAgo === 0
              ? "시트 이관 오늘"
              : `시트 이관 ${formatNumber(daysAgo)}일 전`

  return (
    <>
      <section
        id="hardware-section-freshness"
        data-testid="hardware-import-freshness"
        aria-live="polite"
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] ${toneClass}`}
      >
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
        <p className={`text-[12px] font-bold ${effectiveLevel === "ok" ? "text-[#111110]" : textClass}`}>{headline}</p>
        {finishedKey && state === "success" && <span className={`text-[11.5px] ${MONO_META_CLASS} ${textClass}`}>{finishedKey}</span>}
        {state === "success" && importRun.rows_imported != null && (
          <span className={`text-[11.5px] font-semibold tabular-nums ${textClass}`}>
            {formatNumber(importRun.rows_imported)}행 반영
            {importRun.rows_skipped ? ` · ${formatNumber(importRun.rows_skipped)}행 건너뜀` : ""}
            {originLabel ? ` · ${originLabel}` : ""}
          </span>
        )}
        {state !== "success" && (
          <span className={`text-[11.5px] font-semibold ${textClass}`}>
            {basisKey ? `원장 숫자는 마지막 성공 이관 ${basisKey}${daysAgo != null ? `(${daysAgo === 0 ? "오늘" : `${formatNumber(daysAgo)}일 전`})` : ""} 기준` : "성공한 이관이 아직 없습니다"}
          </span>
        )}
        {state === "failed" && (
          <span className="min-w-0 truncate text-[11.5px] font-semibold text-[#8F2C2C]" title={importRun.error ?? undefined}>
            {importRun.error ?? `상태 ${importRun.status}`} · 상단 &lsquo;싱크·백업 후 가져오기&rsquo;로 재시도
          </span>
        )}
        {state === "stalled" && (
          <span className="text-[11.5px] font-semibold text-[#8F2C2C]">
            끝나지 않은 채 남은 기록입니다 — 원장은 마지막 성공 기준이고, 다시 가져와도 됩니다
          </span>
        )}
        {state === "running" && (
          <span className={`text-[11.5px] font-semibold ${textClass}`}>끝나면 새로고침으로 반영을 확인하세요 · 지금 다시 누르지 마세요</span>
        )}
        {state === "success" && level !== "ok" && (
          <span className={`text-[11.5px] font-semibold ${textClass}`}>
            {level === "danger"
              ? "재고 수치가 실물과 다를 수 있습니다 · 상단 '싱크·백업 후 가져오기'로 갱신"
              : "이관 경과 — 갱신 검토"}
          </span>
        )}
        <MirrorPendingLine pending={pending} />
      </section>
      <MoneyRecoveryNotice importCosting={importCosting} />
    </>
  )
}

export default memo(ImportFreshnessStrip)
