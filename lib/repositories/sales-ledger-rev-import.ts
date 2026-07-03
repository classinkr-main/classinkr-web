import "server-only"

import { revalidateTag } from "next/cache"

import { confirmedMonthAmount } from "@/lib/branch/computations/rev-confirmed"
import { listBranchRevDeals, type BranchRevDeal } from "@/lib/repositories/branch-deals"
import { SALES_LEDGER_IMPORTS_CACHE_TAG } from "@/lib/repositories/sales-ledger-imports"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// 자체 DB화 재동기화: 시트 미러(branch_rev_deals)를 버전드 DB 임포트(branch_rev_lines /
// branch_rev_period_entries)로 스냅샷하고 active_sources를 그 런으로 전환한다. 이후 앱은
// readRevDealsFromActiveImport로 이 런을 원천 삼아 읽는다(시트 재참조 없음).
//
// 충실도 핵심: 원본 raw(=.row 84칸)를 branch_rev_lines.raw에 그대로 실어, 재구성 시
// weeklyPaymentsFromRaw 폴백이 원본과 동일한 주차·불일치를 복원하게 한다. 월/확도는
// period_entries(월×확도 분해)로 정확 복원. weekly-close 스냅샷과 달리 raw.row를
// 보존하는 것이 유일하지만 결정적인 차이다.

const FISCAL_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const INSERT_CHUNK = 400

export interface RevDbImportResult {
  runId: string
  fiscalYear: number
  lineCount: number
  entryCount: number
  activated: boolean
}

function toNumber(value: unknown): number {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
}

function normalizedAccountKey(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s()[\]{}._\-|/]+/g, "")
}

function recordKeyOf(deal: BranchRevDeal): string {
  const stored = deal.raw?.source_record_key
  if (typeof stored === "string" && stored.trim()) return stored.trim()
  return `sheet:${deal.sheet_row}:${normalizedAccountKey(deal.customer_name)}`
}

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

function fiscalYearOf(date: Date): number {
  const month = date.getUTCMonth() + 1
  return month >= 4 ? date.getUTCFullYear() : date.getUTCFullYear() - 1
}

export async function activateRevImportRun(runId: string, fiscalYear: number, actor: string | null): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from("sales_ledger_active_sources")
    .upsert(
      { tab_key: "rev", fiscal_year: fiscalYear, import_run_id: runId, activated_by: actor },
      { onConflict: "tab_key,fiscal_year" },
    )
  if (error) throw new Error(`[rev-import] active source 전환 실패: ${error.message}`)
  // 액티브 소스 조회는 60초 unstable_cache라 즉시 반영 위해 무효화한다.
  revalidateTag(SALES_LEDGER_IMPORTS_CACHE_TAG, "max")
}

// 시트 미러 → 버전드 DB 임포트 + (기본) 활성화. 실패 시 run을 failed로 남기고 throw.
export async function captureRevDbImport(actor: string, options?: { activate?: boolean }): Promise<RevDbImportResult> {
  const activate = options?.activate ?? true
  const supabase = createSupabaseAdminClient()
  const now = new Date()
  const fiscalYear = fiscalYearOf(now)

  const deals = await listBranchRevDeals()
  if (deals.length === 0) {
    throw new Error("임포트할 REV 행이 없습니다. 시트 동기화 후 다시 시도하세요.")
  }

  const { data: runRow, error: runError } = await supabase
    .from("sales_ledger_import_runs")
    .insert({
      fiscal_year: fiscalYear,
      source_kind: "manual",
      source_name: `rev db-native ${now.toISOString().slice(0, 16).replace("T", " ")}`,
      status: "running",
      imported_by: actor,
      metadata: { purpose: "rev-native", dataSource: "branch_rev_deals" },
    })
    .select("id")
    .single()
  if (runError || !runRow) throw new Error(`[rev-import] run 생성 실패: ${runError?.message ?? "empty insert"}`)
  const runId = runRow.id as string

  try {
    const lineIdByKey = new Map<string, string>()
    const lineRows = deals.map((deal) => ({
      import_run_id: runId,
      fiscal_year: fiscalYear,
      source_row: deal.sheet_row,
      source_record_key: recordKeyOf(deal),
      account_name: deal.customer_name || "미지정",
      branch_contact: deal.branch_contact ?? null,
      location: deal.region ?? null,
      scale: null,
      importance: deal.importance ?? null,
      team: deal.team ?? null,
      manager: deal.manager ?? null,
      status: deal.status ?? null,
      deal_type: deal.deal_type ?? null,
      product: deal.product_version ?? null,
      first_payment: typeof deal.first_payment === "string" && ISO_DATE_RE.test(deal.first_payment) ? deal.first_payment : null,
      remark: deal.note ?? null,
      total_amount: toNumber(deal.contract_target),
      raw: deal.raw ?? {}, // ← 원본 raw(.row 포함) 보존: 주차 폴백 소스
    }))
    for (const chunk of chunked(lineRows, INSERT_CHUNK)) {
      const { data, error } = await supabase.from("branch_rev_lines").insert(chunk).select("id,source_record_key")
      if (error) throw new Error(`[rev-import] line 삽입 실패: ${error.message}`)
      for (const row of data ?? []) lineIdByKey.set(row.source_record_key as string, row.id as string)
    }

    const entryRows: Array<Record<string, unknown>> = []
    for (const deal of deals) {
      const lineId = lineIdByKey.get(recordKeyOf(deal))
      if (!lineId) continue
      for (const [month, rawAmount] of Object.entries(deal.monthly_payments ?? {})) {
        if (!FISCAL_MONTH_RE.test(month)) continue
        const amount = toNumber(rawAmount)
        if (amount === 0) continue
        // 확도 분해는 시트폴백과 동일 규칙(confirmedMonthAmount: 금액맵 → red-불리언 전액 → 무색상 전액)을
        // 쓴다. 금액맵만 보면 색 금액 도입 전 동기화분(red=true, 맵 비어 있음)·무색상 레거시 행의 확정이
        // expected로 강등돼, DB-native 전환 직후 확정 합계가 시트폴백 대비 급감한다.
        const confirmed = Math.min(Math.max(confirmedMonthAmount(deal, month, amount), 0), Math.max(amount, 0))
        const high = Math.min(Math.max(toNumber(deal.monthly_high_conf?.[month]), 0), Math.max(amount - confirmed, 0))
        const expected = amount - confirmed - high
        for (const [confidence, amt] of [["confirmed", confirmed], ["high_confidence", high], ["expected", expected]] as const) {
          if (amt === 0) continue
          entryRows.push({
            import_run_id: runId,
            rev_line_id: lineId,
            fiscal_year: fiscalYear,
            period_month: month,
            amount: amt,
            confidence,
            source_row: deal.sheet_row,
          })
        }
      }
    }
    for (const chunk of chunked(entryRows, INSERT_CHUNK)) {
      const { error } = await supabase.from("branch_rev_period_entries").insert(chunk)
      if (error) throw new Error(`[rev-import] period entry 삽입 실패: ${error.message}`)
    }

    const { error: doneError } = await supabase
      .from("sales_ledger_import_runs")
      .update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
        row_counts: { rev_lines: lineRows.length, rev_period_entries: entryRows.length },
      })
      .eq("id", runId)
    if (doneError) throw new Error(`[rev-import] run 완료 처리 실패: ${doneError.message}`)

    if (activate) await activateRevImportRun(runId, fiscalYear, actor)

    return { runId, fiscalYear, lineCount: lineRows.length, entryCount: entryRows.length, activated: activate }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase
      .from("sales_ledger_import_runs")
      .update({ status: "failed", error: message.slice(0, 500), finished_at: new Date().toISOString() })
      .eq("id", runId)
    throw error
  }
}
