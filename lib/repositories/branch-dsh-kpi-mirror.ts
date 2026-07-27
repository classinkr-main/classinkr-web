import "server-only"
import { unstable_cache, revalidateTag } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"
import type { DshBreakdownRow, DshOutput, DshRow } from "@/lib/branch/parsers/dsh"
import { KPI_METRICS, type KpiBlocks, type KpiMetric, type KpiPair, type KpiRow } from "@/lib/branch/parsers/kpi"

// summary/kpi/insights와 sync 라우트가 공유하는 무효화 태그(기존 문자열 규약 유지)
export const BRANCH_DSH_CACHE_TAG = "branch-dsh"
export const BRANCH_KPI_CACHE_TAG = "branch-kpi"

interface DshMirrorDbRow {
  row_level: "team" | "member" | "breakdown"
  row_kind: "goal" | "status"
  team: string | null
  member: string | null
  category: string | null
  status_type: string | null
  channel: string | null
  annual: number | string
  q1: number | string
  q2: number | string
  q3: number | string
  q4: number | string
  months: Record<string, number> | null
}

interface KpiMirrorDbRow {
  period_month: number | null
  member: string
  pairs: Record<string, { goal?: unknown; actual?: unknown }> | null
}

type PostgrestErrorish = { code?: string; message?: string; details?: string; hint?: string }

// 마이그레이션(20260716_branch_dsh_kpi_mirror) 적용 전 배포에서 미러 읽기가 죽으면
// 폴백 사다리 전체가 막힌다 — 테이블 부재만은 "미러 없음(null)"으로 강등한다.
function isMissingMirrorTableError(error: PostgrestErrorish) {
  const haystack = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase()
  return (
    haystack.includes("42p01") ||
    ((haystack.includes("branch_dsh_mirror") || haystack.includes("branch_kpi_mirror")) &&
      (haystack.includes("does not exist") || haystack.includes("could not find") || haystack.includes("schema cache")))
  )
}

const FETCH_PAGE_SIZE = 1000

// PostgREST는 요청당 기본 1000행 캡에서 조용히 절단한다 — 미러는 보통 수백 행이지만
// 안전하게 결정적 order(id) + range로 짧은 페이지가 나올 때까지 이어 읽는다.
async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: PostgrestErrorish | null }>,
): Promise<{ rows: T[]; error: PostgrestErrorish | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + FETCH_PAGE_SIZE - 1)
    if (error) return { rows: [], error }
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < FETCH_PAGE_SIZE) break
  }
  return { rows, error: null }
}

function toNumber(value: unknown) {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
}

async function readDshMirrorUncached(fiscalYear: number): Promise<DshOutput | null> {
  const supabase = createSupabaseAdminClient()
  const { rows: data, error } = await fetchAllRows<DshMirrorDbRow>((from, to) =>
    supabase
      .from("branch_dsh_mirror")
      .select("row_level,row_kind,team,member,category,status_type,channel,annual,q1,q2,q3,q4,months")
      .eq("fiscal_year", fiscalYear)
      .order("id")
      .range(from, to),
  )
  if (error) {
    if (isMissingMirrorTableError(error)) return null
    throw new Error(`[branch-dsh-mirror] read failed: ${error.message}`)
  }

  const rows: DshRow[] = []
  const members: Record<string, string> = {}
  const breakdown: DshBreakdownRow[] = []
  for (const row of data) {
    const months = row.months ?? {}
    const quarters = [toNumber(row.q1), toNumber(row.q2), toNumber(row.q3), toNumber(row.q4)] as [number, number, number, number]
    if (row.row_level === "breakdown") {
      if (!row.category || !row.status_type || !row.channel) continue
      breakdown.push({ kind: row.row_kind, category: row.category, status_type: row.status_type, channel: row.channel, annual: toNumber(row.annual), quarters, months })
      continue
    }
    // 멤버명은 읽기 시점에도 정규화한다 — 미러에는 동기화 당시 표기(예: "Hwang")가 그대로
    // 저장돼 있어, member-names 별칭 추가가 재동기화 전까지 화면에 안 먹는 문제를 막는다
    // (파서 파싱 시점 정규화와 이중 방어 — branch-deals.ts의 REV manager 읽기 정규화와 동일 계열).
    const member = normalizeBranchMemberName(row.member)
    if (row.row_level === "member") {
      if (!member || !row.team) continue
      members[member] = row.team
    }
    rows.push({
      level: row.row_level,
      team: row.team ?? "ALL",
      member: member ?? undefined,
      kind: row.row_kind,
      annual: toNumber(row.annual),
      quarters,
      months,
    })
  }

  if (rows.length === 0 && breakdown.length === 0) return null
  return { rows, members, breakdown }
}

const readCachedDshMirror = unstable_cache(
  async (fiscalYear: number) => readDshMirrorUncached(fiscalYear),
  ["branch-dsh-mirror"],
  { revalidate: 60, tags: [BRANCH_DSH_CACHE_TAG] },
)

export async function readBranchDshMirror(fiscalYear: number): Promise<DshOutput | null> {
  return readCachedDshMirror(fiscalYear)
}

function toKpiPairs(raw: KpiMirrorDbRow["pairs"]): Record<KpiMetric, KpiPair> {
  const pairs = {} as Record<KpiMetric, KpiPair>
  for (const metric of KPI_METRICS) {
    const entry = raw?.[metric]
    pairs[metric] = { goal: toNumber(entry?.goal), actual: toNumber(entry?.actual) }
  }
  return pairs
}

async function readKpiMirrorUncached(fiscalYear: number): Promise<KpiBlocks | null> {
  const supabase = createSupabaseAdminClient()
  const { rows: data, error } = await fetchAllRows<KpiMirrorDbRow>((from, to) =>
    supabase
      .from("branch_kpi_mirror")
      .select("period_month,member,pairs")
      .eq("fiscal_year", fiscalYear)
      .order("id")
      .range(from, to),
  )
  if (error) {
    if (isMissingMirrorTableError(error)) return null
    throw new Error(`[branch-kpi-mirror] read failed: ${error.message}`)
  }
  if (data.length === 0) return null

  const fy: KpiRow[] = []
  const months: Record<number, KpiRow[]> = {}
  for (const row of data) {
    // DSH 미러와 같은 이유의 읽기 시점 멤버명 정규화 — DSH members("Chanwoo")와 KPI
    // 매칭 키("Hwang")가 어긋나면 kpi 라우트의 kpiRowsByMember 조회가 빗나간다.
    const kpiRow: KpiRow = { member: normalizeBranchMemberName(row.member) ?? row.member, pairs: toKpiPairs(row.pairs) }
    if (row.period_month == null) {
      fy.push(kpiRow)
      continue
    }
    const bucket = months[row.period_month]
    if (bucket) bucket.push(kpiRow)
    else months[row.period_month] = [kpiRow]
  }
  return { fy, months }
}

const readCachedKpiMirror = unstable_cache(
  async (fiscalYear: number) => readKpiMirrorUncached(fiscalYear),
  ["branch-kpi-mirror"],
  { revalidate: 60, tags: [BRANCH_KPI_CACHE_TAG] },
)

export async function readBranchKpiMirror(fiscalYear: number): Promise<KpiBlocks | null> {
  return readCachedKpiMirror(fiscalYear)
}

export async function replaceBranchDshMirror(fiscalYear: number, dsh: DshOutput): Promise<number> {
  const rows = [
    ...dsh.rows.map((r) => ({
      row_level: r.level,
      row_kind: r.kind,
      team: r.team || null,
      member: r.member ?? null,
      category: null,
      status_type: null,
      channel: null,
      annual: r.annual,
      q1: r.quarters[0], q2: r.quarters[1], q3: r.quarters[2], q4: r.quarters[3],
      months: r.months,
    })),
    ...(dsh.breakdown ?? []).map((b) => ({
      row_level: "breakdown",
      row_kind: b.kind,
      team: null,
      member: null,
      category: b.category,
      status_type: b.status_type,
      channel: b.channel,
      annual: b.annual,
      q1: b.quarters[0], q2: b.quarters[1], q3: b.quarters[2], q4: b.quarters[3],
      months: b.months,
    })),
  ]
  const sb = createSupabaseAdminClient()
  const { error } = await sb.rpc("replace_branch_dsh_mirror", { p_fiscal_year: fiscalYear, rows })
  if (error) throw new Error(`[branch-dsh-mirror] replace failed: ${error.message}`)
  revalidateTag(BRANCH_DSH_CACHE_TAG, "max")
  return rows.length
}

export async function replaceBranchKpiMirror(fiscalYear: number, blocks: KpiBlocks): Promise<number> {
  const rows = [
    ...blocks.fy.map((r) => ({ period_month: null as number | null, member: r.member, pairs: r.pairs })),
    ...Object.entries(blocks.months).flatMap(([month, monthRows]) =>
      monthRows.map((r) => ({ period_month: Number(month), member: r.member, pairs: r.pairs })),
    ),
  ]
  const sb = createSupabaseAdminClient()
  const { error } = await sb.rpc("replace_branch_kpi_mirror", { p_fiscal_year: fiscalYear, rows })
  if (error) throw new Error(`[branch-kpi-mirror] replace failed: ${error.message}`)
  revalidateTag(BRANCH_KPI_CACHE_TAG, "max")
  return rows.length
}
