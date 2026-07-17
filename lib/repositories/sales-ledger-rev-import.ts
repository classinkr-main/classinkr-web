import "server-only"

import { createHash } from "node:crypto"

import { revalidateTag, unstable_cache } from "next/cache"

import { normalizedAccountKey } from "@/lib/branch/account-key"
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
  // 이 run이 캡처된 시각(started_at ISO) — dedupe 시 기존 run의 시각
  capturedAt: string
  // 동일 checksum의 기존 succeeded run을 재사용했으면 true (새 run 생성 없음)
  deduped: boolean
}

function toNumber(value: unknown): number {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
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

// 같은 시트 미러 상태를 다시 캡처하면 같은 checksum이 나오도록 결정적으로 직렬화한다.
// 캡처 산출물에 들어가는 전부(라인 필드·월별 금액/확도/red·raw=주차 폴백 소스)를 포함해
// 어느 하나라도 바뀌면 새 run, 전부 같으면 dedupe. "rev-native:" 프리픽스로 weekly-close
// 스냅샷 checksum(같은 fiscal_year·source_kind='manual' 유니크 인덱스 공간 공유)과의
// 충돌 가능성을 차단한다. raw는 branch_rev_deals jsonb에서 읽혀 키 순서가 결정적이다.
function revImportChecksum(deals: BranchRevDeal[]): string {
  const sortedMonths = (map: Record<string, unknown> | null | undefined) =>
    Object.entries(map ?? {})
      .filter(([month]) => FISCAL_MONTH_RE.test(month))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const canonical = deals
    .map((deal) => ({
      key: recordKeyOf(deal),
      row: deal.sheet_row,
      account: deal.customer_name || "미지정",
      contact: deal.branch_contact ?? null,
      location: deal.region ?? null,
      importance: deal.importance ?? null,
      team: deal.team ?? null,
      manager: deal.manager ?? null,
      status: deal.status ?? null,
      dealType: deal.deal_type ?? null,
      product: deal.product_version ?? null,
      firstPayment: deal.first_payment ?? null,
      remark: deal.note ?? null,
      total: toNumber(deal.contract_target),
      payments: sortedMonths(deal.monthly_payments).map(([month, value]) => [month, toNumber(value)]),
      confirmed: sortedMonths(deal.monthly_confirmed).map(([month, value]) => [month, toNumber(value)]),
      highConf: sortedMonths(deal.monthly_high_conf).map(([month, value]) => [month, toNumber(value)]),
      red: sortedMonths(deal.monthly_red).map(([month, value]) => [month, value === true]),
      raw: deal.raw ?? {},
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.row - b.row))
  return createHash("sha256").update(`rev-native:${JSON.stringify(canonical)}`).digest("hex")
}

// 유니크 인덱스: sales_ledger_import_runs_checksum_idx
//   (fiscal_year, source_kind, source_checksum) WHERE source_checksum IS NOT NULL AND status = 'succeeded'
// → succeeded 행에만 걸리므로 같은 (fy, manual, checksum) succeeded run은 최대 1개.
async function findExistingRevImportRun(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  fiscalYear: number,
  checksum: string,
): Promise<{ id: string; startedAt: string; rowCounts: Record<string, number> } | null> {
  const { data, error } = await supabase
    .from("sales_ledger_import_runs")
    .select("id,started_at,row_counts")
    .eq("fiscal_year", fiscalYear)
    .eq("source_kind", "manual")
    .eq("status", "succeeded")
    .eq("source_checksum", checksum)
    .maybeSingle()
  if (error) throw new Error(`[rev-import] 기존 run 조회 실패: ${error.message}`)
  if (!data) return null
  return {
    id: data.id as string,
    startedAt: data.started_at as string,
    rowCounts: (data.row_counts ?? {}) as Record<string, number>,
  }
}

// 인덱스가 succeeded 행에만 걸리므로 경합 시 충돌은 insert가 아니라 succeeded 전환 update에서 드러난다.
function isChecksumConflictError(error: { code?: string; message?: string }) {
  return error.code === "23505" || (error.message ?? "").includes("sales_ledger_import_runs_checksum_idx")
}

function dedupedResult(
  existing: { id: string; startedAt: string; rowCounts: Record<string, number> },
  fiscalYear: number,
  activated: boolean,
): RevDbImportResult {
  return {
    runId: existing.id,
    fiscalYear,
    lineCount: toNumber(existing.rowCounts.rev_lines),
    entryCount: toNumber(existing.rowCounts.rev_period_entries),
    activated,
    capturedAt: existing.startedAt,
    deduped: true,
  }
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

export interface ActiveRevImportStatus {
  active: boolean
  fiscalYear: number
  runId: string | null
  capturedAt: string | null
}

async function lookupActiveRevImportStatus(fiscalYear: number): Promise<ActiveRevImportStatus> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("sales_ledger_active_sources")
    .select("import_run_id, sales_ledger_import_runs!inner(status, started_at)")
    .eq("tab_key", "rev")
    .eq("fiscal_year", fiscalYear)
    .eq("sales_ledger_import_runs.status", "succeeded")
    .maybeSingle()
  if (error) {
    const haystack = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase()
    if (haystack.includes("42p01") || haystack.includes("does not exist") || haystack.includes("schema cache")) {
      // 마이그레이션 미적용 = DB-native 기능 자체가 없음 → 비활성으로 취급.
      return { active: false, fiscalYear, runId: null, capturedAt: null }
    }
    throw new Error(`[rev-import] active source 상태 조회 실패: ${error.message}`)
  }
  const runId = (data?.import_run_id as string | undefined) ?? null
  // M2O inner join은 객체로 오지만, 타입 미탐지 시 배열로 직렬화될 수 있어 양쪽 다 수용한다.
  const joined = data?.sales_ledger_import_runs as { started_at?: string } | Array<{ started_at?: string }> | null | undefined
  const startedAt = Array.isArray(joined) ? joined[0]?.started_at : joined?.started_at
  return { active: Boolean(runId), fiscalYear, runId, capturedAt: startedAt ?? null }
}

// GET db-import 캐시(60초 TTL, SALES_LEDGER_IMPORTS_CACHE_TAG — R5 항목 4: 10초→60초,
// 실측 캐시 미스 0.5~1.3s 스파이크 빈도를 5~6배 줄인다). activateRevImportRun(인앱
// 재캡처/활성화)이 성공 직후 이 태그를 revalidateTag("max")로 즉시 무효화하므로(위 함수 끝)
// 워크벤치에서 "재동기화 → 활성화"로 전환한 케이스는 TTL과 무관하게 지연 없이 반영된다 —
// sales-ledger-imports.ts의 getCachedActiveImportRunInfoForYear도 동일한
// SALES_LEDGER_IMPORTS_CACHE_TAG를 태그로 쓰므로 이 한 번의 revalidateTag 호출이 두 캐시를
// 모두 무효화한다(코드 확인: 두 unstable_cache 모두 tags: [SALES_LEDGER_IMPORTS_CACHE_TAG]).
// 이 캐시가 실제로 지연시키는 유일한 경로는 앱 밖(운영 스크립트)이
// sales_ledger_active_sources를 직접 upsert하는 경우다 — TTL을 10초에서 60초로 올리면서
// 그 stale 창도 최대 10초에서 60초로 함께 늘어난다는 뜻이다. 인앱 전환은 즉시 반영되므로
// 이 확장은 "수동으로 시트 모드로 되돌린 직후" 같은 외부 스크립트 경로에만 영향을 준다 —
// 감내 가능한 트레이드오프로 판단(외부 스크립트 전환은 애초에 분 단위 운영 작업).
const getCachedActiveRevImportStatus = unstable_cache(
  async (fiscalYear: number) => lookupActiveRevImportStatus(fiscalYear),
  ["sales-ledger-active-rev-import-status"],
  { revalidate: 60, tags: [SALES_LEDGER_IMPORTS_CACHE_TAG] },
)

// 액티브 REV 소스 상태 조회(GET db-import 용) — 클라이언트가 "지금 DB 임포트 run을 읽는 중인지"를
// localStorage 추정이 아니라 서버 원장(sales_ledger_active_sources)으로 판별하게 한다.
export async function getActiveRevImportStatus(): Promise<ActiveRevImportStatus> {
  const fiscalYear = fiscalYearOf(new Date())
  return getCachedActiveRevImportStatus(fiscalYear)
}

// 시트 미러 → 버전드 DB 임포트 + (기본) 활성화. 실패 시 run을 failed로 남기고 throw.
export async function captureRevDbImport(actor: string, options?: { activate?: boolean }): Promise<RevDbImportResult> {
  const activate = options?.activate ?? true
  const supabase = createSupabaseAdminClient()
  const now = new Date()
  const fiscalYear = fiscalYearOf(now)

  // raw(원본 84칸 row) 보존이 이 마이그레이션의 충실도 핵심(파일 상단 주석 참조) — opt-in 필수.
  const deals = await listBranchRevDeals(undefined, { withRaw: true })
  if (deals.length === 0) {
    throw new Error("임포트할 REV 행이 없습니다. 시트 동기화 후 다시 시도하세요.")
  }

  // dedupe: 동일 미러 상태 재캡처는 새 run을 만들지 않고 기존 run을 돌려준다.
  // 내용이 같으므로 (요청 시) 기존 run 재활성화가 곧 캡처의 멱등 결과다.
  const checksum = revImportChecksum(deals)
  const existing = await findExistingRevImportRun(supabase, fiscalYear, checksum)
  if (existing) {
    if (activate) await activateRevImportRun(existing.id, fiscalYear, actor)
    return dedupedResult(existing, fiscalYear, activate)
  }

  const { data: runRow, error: runError } = await supabase
    .from("sales_ledger_import_runs")
    .insert({
      fiscal_year: fiscalYear,
      source_kind: "manual",
      source_name: `rev db-native ${now.toISOString().slice(0, 16).replace("T", " ")}`,
      status: "running",
      source_checksum: checksum,
      imported_by: actor,
      metadata: { purpose: "rev-native", dataSource: "branch_rev_deals" },
    })
    .select("id,started_at")
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
    if (doneError) {
      if (isChecksumConflictError(doneError)) {
        // 동시 캡처 경합 패자: 같은 checksum run이 먼저 succeeded — 이 run은 중복으로 접고 승자를 반환
        await supabase
          .from("sales_ledger_import_runs")
          .update({ status: "failed", error: "deduped: 동일 checksum run이 먼저 완료됨", finished_at: new Date().toISOString() })
          .eq("id", runId)
        const winner = await findExistingRevImportRun(supabase, fiscalYear, checksum)
        if (winner) {
          if (activate) await activateRevImportRun(winner.id, fiscalYear, actor)
          return dedupedResult(winner, fiscalYear, activate)
        }
      }
      throw new Error(`[rev-import] run 완료 처리 실패: ${doneError.message}`)
    }

    if (activate) await activateRevImportRun(runId, fiscalYear, actor)

    return {
      runId,
      fiscalYear,
      lineCount: lineRows.length,
      entryCount: entryRows.length,
      activated: activate,
      capturedAt: runRow.started_at as string,
      deduped: false,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase
      .from("sales_ledger_import_runs")
      .update({ status: "failed", error: message.slice(0, 500), finished_at: new Date().toISOString() })
      .eq("id", runId)
    throw error
  }
}
