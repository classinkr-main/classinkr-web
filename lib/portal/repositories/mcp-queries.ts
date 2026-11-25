import "server-only"

/**
 * 홈페이지 MCP(lib/ops-tools/defs/quotes.ts)·이후 갈매봇 전용 딜·견적 조회.
 *
 * 포털·어드민 화면이 쓰는 listDealListItems / listPortalDocuments(deals.ts·documents.ts)는 딜 전체를 읽어 메모리에서
 * 거른다. 딜이 늘면 PostgREST 한 번 응답 상한(1000행)에서 조용히 잘리고, `.in()` id 목록이 URL 한도를 넘는다.
 * 이 모듈은 그 함수를 건드리지 않고 같은 결과 꼴을 DB 쪽 거르기로 낸다.
 *
 *  - 검색어·상태·기간·limit 은 DB 질의로 내려간다(최신 갱신순 + limit+1 행만 읽어 "더 있음"을 안다).
 *  - id 목록 조회는 MCP_ID_CHUNK(100)개씩 나눈다. 행이 많을 수 있는 조회는 1000행씩 쪽을 넘겨 읽는다.
 *  - 한 갈래의 후보가 상한(MCP_SCAN_CAP)에 닿아 다 못 본 경우에도 more=true — 조용히 잘리지 않는다.
 */
import { QUOTE_INTERACTION_ACTIONS, summarizeQuoteInteractionLogs } from "@/lib/portal/repositories/activity"
import { resolveQuoteVatIncluded } from "@/lib/portal/quote-vat"
import type { ActivityLog, PartnerDocumentListItem } from "@/lib/portal/types"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const MCP_ID_CHUNK = 100
/** 검색어 한 갈래(제목·번호·고객 등)에서 읽는 후보 상한. 닿으면 more=true */
export const MCP_SCAN_CAP = 300
const PAGE_SIZE = 1000
const MAX_PAGES = 10

// supabase-js 질의 빌더는 단계마다 제네릭이 달라 구조 타입으로 받는다.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from: (table: string) => any }
type Builder = any
/* eslint-enable @typescript-eslint/no-explicit-any */

export type McpListResult<T> = { items: T[]; more: boolean }

export type McpListFilters = {
  query?: string
  /** YYYY-MM-DD (KST 하루의 시작) */
  updatedFrom?: string
  /** YYYY-MM-DD (KST 하루의 끝) */
  updatedTo?: string
  limit: number
}

const chunk = <T>(items: T[], size = MCP_ID_CHUNK): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** ilike 패턴 — 검색어 속 % _ \ 는 글자 그대로 */
export const likePattern = (query: string) => `%${query.replace(/[\\%_]/g, "\\$&")}%`

const fromBound = (date: string) => `${date}T00:00:00+09:00`
const toBound = (date: string) => `${date}T23:59:59.999+09:00`

const includesText = (needle: string, ...hay: Array<string | null | undefined>) =>
  hay.some((v) => v?.toLocaleLowerCase("ko-KR").includes(needle.toLocaleLowerCase("ko-KR")))

function applyRange(q: Builder, filters: Pick<McpListFilters, "updatedFrom" | "updatedTo">, column = "updated_at"): Builder {
  let next = q
  if (filters.updatedFrom) next = next.gte(column, fromBound(filters.updatedFrom))
  if (filters.updatedTo) next = next.lte(column, toBound(filters.updatedTo))
  return next
}

/** 쪽을 넘겨 끝까지 읽는다(PostgREST 한 번 1000행 상한에서 조용히 잘리지 않게). build 는 정렬이 정해진 질의를 준다 */
async function readAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await build(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (error) throw error
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }
  return out
}

// ---------------------------------------------------------------- 딜

export type McpDealRow = {
  id: string
  title: string
  customer_name: string | null
  customer_campus_name: string | null
  customer_region_label: string | null
  current_stage: string
  status: string
  owner_name: string | null
  updated_at: string
}

type DealRaw = {
  id: string
  title: string
  status: string
  current_stage: string
  owner_id: string | null
  updated_at: string
  customer_id: string
  customers: { name: string | null; campus_name: string | null; region_label: string | null } | null
}

const DEAL_SELECT = "id, title, status, current_stage, owner_id, updated_at, customer_id, customers!inner(name, campus_name, region_label)"

const byUpdatedDesc = (a: { updated_at: string }, b: { updated_at: string }) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0)

async function ownerNames(db: Db, ownerIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  for (const ids of chunk(Array.from(new Set(ownerIds)))) {
    const { data } = await db.from("admin_profiles").select("user_id, display_name").in("user_id", ids)
    for (const row of (data as Array<{ user_id: string; display_name: string | null }> | null) ?? []) names.set(row.user_id, row.display_name ?? "")
  }
  return names
}

/**
 * 딜 목록 — 고객(학원)명·캠퍼스·딜 제목 일부로 거르고 최근 갱신순. 읽는 행은 limit+1 개(갈래마다).
 * 검색어가 있으면: 제목 ilike / 고객 이름·캠퍼스 ilike → 그 고객들의 딜(id 100개씩) 을 합쳐 최신순으로 자른다.
 */
export async function searchDealsForMcp(filters: McpListFilters, db: Db = createSupabaseAdminClient()): Promise<McpListResult<McpDealRow>> {
  const limit = filters.limit
  if (limit <= 0) return { items: [], more: false }
  const query = filters.query?.trim() || undefined

  const dealQuery = () => applyRange(db.from("deals").select(DEAL_SELECT), filters).order("updated_at", { ascending: false }).limit(limit + 1)

  let rows: DealRaw[] = []
  let incomplete = false
  if (!query) {
    const { data, error } = await dealQuery()
    if (error) throw error
    rows = (data ?? []) as DealRaw[]
  } else {
    const pattern = likePattern(query)
    const sources: Array<PromiseLike<{ data: DealRaw[] | null; error: unknown }>> = [dealQuery().ilike("title", pattern)]

    const customerIds = new Set<string>()
    for (const column of ["name", "campus_name"]) {
      const { data, error } = await db.from("customers").select("id").ilike(column, pattern).limit(MCP_SCAN_CAP + 1)
      if (error) throw error
      const found = (data ?? []) as Array<{ id: string }>
      if (found.length > MCP_SCAN_CAP) incomplete = true
      for (const c of found.slice(0, MCP_SCAN_CAP)) customerIds.add(c.id)
    }
    for (const ids of chunk(Array.from(customerIds))) sources.push(dealQuery().in("customer_id", ids))

    const merged = new Map<string, DealRaw>()
    let sawFull = false
    for (const { data, error } of await Promise.all(sources)) {
      if (error) throw error
      const got = (data ?? []) as DealRaw[]
      if (got.length > limit) sawFull = true
      for (const row of got) merged.set(row.id, row)
    }
    // DB 후보는 상위 집합이다 — PostgREST 는 ilike 의 * 를 % 로 읽는다(likePattern 이 막지 못한다). 전처럼 글자 그대로 포함인지 다시 본다.
    // 다시 걸러 빠진 행이 있고 어느 갈래가 limit+1 까지 찼으면, 그 뒤에 맞는 딜이 더 있을 수 있어 more 로 알린다.
    const candidates = Array.from(merged.values())
    const exact = candidates.filter((d) => includesText(query, d.title, d.customers?.name, d.customers?.campus_name))
    if (sawFull && exact.length < candidates.length) incomplete = true
    rows = exact.sort(byUpdatedDesc).slice(0, limit + 1)
  }

  const more = rows.length > limit || incomplete
  const page = rows.slice(0, limit)
  const owners = await ownerNames(db, page.map((d) => d.owner_id).filter((id): id is string => Boolean(id)))
  return {
    items: page.map((d) => ({
      id: d.id,
      title: d.title,
      customer_name: d.customers?.name ?? null,
      customer_campus_name: d.customers?.campus_name ?? null,
      customer_region_label: d.customers?.region_label ?? null,
      current_stage: d.current_stage,
      status: d.status,
      owner_name: d.owner_id ? owners.get(d.owner_id) ?? null : null,
      updated_at: d.updated_at,
    })),
    more,
  }
}

// ---------------------------------------------------------------- 견적

export type McpQuoteFilters = McpListFilters & { dealId?: string; status?: string }

type QuoteDocRow = { id: string; deal_id: string; quote_number: string; current_version_id: string | null; status: string; updated_at: string }
type DealInfo = { id: string; title: string; customer_id: string; customer_name: string | null }
type VersionTitle = { id: string; quote_document_id: string; title: string | null; version_number: number }

/** 제목 없는 견적의 목록 제목(documents.ts 와 같다) */
const DEFAULT_QUOTE_TITLE = "견적서"

const DOC_SELECT = "id, deal_id, quote_number, current_version_id, status, updated_at"

/**
 * 견적 문서 후보를 읽는다 — 삭제된 견적은 뺀다. 삭제함 마이그레이션 전(deleted_at 없음, 42703)에는 그 조건 없이 다시 읽는다
 * (documents.ts 와 같은 처리). narrow 는 갈래별 조건(번호 ilike·deal id 목록 등).
 */
async function selectQuoteDocs(db: Db, filters: McpQuoteFilters, narrow: (q: Builder) => Builder, cap: number): Promise<QuoteDocRow[]> {
  const build = (withDeleted: boolean) => {
    let q = db.from("quote_documents").select(DOC_SELECT)
    if (withDeleted) q = q.is("deleted_at", null)
    if (filters.dealId) q = q.eq("deal_id", filters.dealId)
    if (filters.status) q = q.eq("status", filters.status)
    q = applyRange(q, filters)
    return narrow(q).order("updated_at", { ascending: false }).limit(cap)
  }
  let { data, error } = await build(true)
  if (error?.code === "42703") ({ data, error } = await build(false))
  if (error) throw error
  return (data ?? []) as QuoteDocRow[]
}

async function loadDealInfo(db: Db, dealIds: string[]): Promise<Map<string, DealInfo>> {
  const out = new Map<string, DealInfo>()
  for (const ids of chunk(Array.from(new Set(dealIds)))) {
    const { data, error } = await db.from("deals").select("id, title, customer_id, customers!inner(name)").in("id", ids)
    if (error) throw error
    for (const d of (data ?? []) as Array<{ id: string; title: string; customer_id: string; customers: { name: string | null } | null }>) {
      out.set(d.id, { id: d.id, title: d.title, customer_id: d.customer_id, customer_name: d.customers?.name ?? null })
    }
  }
  return out
}

/** 문서마다 "현재 버전" 제목 — current_version_id 가 가리키는 버전, 없으면 가장 높은 버전(documents.ts 와 같은 선택) */
async function loadCurrentTitles(db: Db, docs: QuoteDocRow[]): Promise<Map<string, string | null>> {
  const titles = new Map<string, string | null>()
  const withCurrent = docs.filter((d) => d.current_version_id)
  const byId = new Map<string, VersionTitle>()
  for (const ids of chunk(withCurrent.map((d) => d.current_version_id as string))) {
    const { data, error } = await db.from("quote_document_versions").select("id, quote_document_id, title, version_number").in("id", ids)
    if (error) throw error
    for (const v of (data ?? []) as VersionTitle[]) byId.set(v.id, v)
  }
  const missing: string[] = []
  for (const d of docs) {
    const v = d.current_version_id ? byId.get(d.current_version_id) : undefined
    if (v) titles.set(d.id, v.title)
    else missing.push(d.id)
  }
  for (const ids of chunk(missing)) {
    const rows = await readAll<VersionTitle>((from, to) =>
      db.from("quote_document_versions").select("id, quote_document_id, title, version_number").in("quote_document_id", ids).order("version_number", { ascending: false }).range(from, to)
    )
    const first = new Map<string, VersionTitle>()
    for (const v of rows) if (!first.has(v.quote_document_id)) first.set(v.quote_document_id, v)
    for (const id of ids) titles.set(id, first.get(id)?.title ?? null)
  }
  return titles
}

type VersionFull = {
  id: string
  quote_document_id: string
  version_number: number
  title: string | null
  subtotal: number | null
  discount_amount: number | null
  tax_amount: number | null
  total_amount: number | null
  template_id: string | null
  vat_included: string | null
}

/** 견적 문서 목록 — listPortalDocuments({type:"quote"}) 의 항목과 같은 꼴 */
export async function searchQuotesForMcp(filters: McpQuoteFilters, db: Db = createSupabaseAdminClient()): Promise<McpListResult<PartnerDocumentListItem>> {
  const limit = filters.limit
  if (limit <= 0) return { items: [], more: false }
  const query = filters.query?.trim() || undefined

  // 1단계: 후보 문서(가벼운 열만)
  let candidates: QuoteDocRow[]
  let incomplete = false
  if (!query) {
    candidates = await selectQuoteDocs(db, filters, (q) => q, limit + 1)
  } else {
    const pattern = likePattern(query)
    const merged = new Map<string, QuoteDocRow>()
    const take = (rows: QuoteDocRow[]) => {
      if (rows.length >= MCP_SCAN_CAP) incomplete = true
      for (const r of rows) merged.set(r.id, r)
    }
    // 번호
    take(await selectQuoteDocs(db, filters, (q) => q.ilike("quote_number", pattern), MCP_SCAN_CAP))
    // 딜 제목·고객명 → 그 딜들의 견적
    const dealIds = new Set<string>()
    const { data: byTitle, error: titleError } = await db.from("deals").select("id").ilike("title", pattern).limit(MCP_SCAN_CAP + 1)
    if (titleError) throw titleError
    const { data: customers, error: customerError } = await db.from("customers").select("id").ilike("name", pattern).limit(MCP_SCAN_CAP + 1)
    if (customerError) throw customerError
    if (((byTitle ?? []) as unknown[]).length > MCP_SCAN_CAP || ((customers ?? []) as unknown[]).length > MCP_SCAN_CAP) incomplete = true
    for (const d of ((byTitle ?? []) as Array<{ id: string }>).slice(0, MCP_SCAN_CAP)) dealIds.add(d.id)
    for (const ids of chunk(((customers ?? []) as Array<{ id: string }>).slice(0, MCP_SCAN_CAP).map((c) => c.id))) {
      const { data, error } = await db.from("deals").select("id").in("customer_id", ids).limit(MCP_SCAN_CAP + 1)
      if (error) throw error
      if (((data ?? []) as unknown[]).length > MCP_SCAN_CAP) incomplete = true
      for (const d of ((data ?? []) as Array<{ id: string }>).slice(0, MCP_SCAN_CAP)) dealIds.add(d.id)
    }
    for (const ids of chunk(Array.from(dealIds))) take(await selectQuoteDocs(db, filters, (q) => q.in("deal_id", ids), MCP_SCAN_CAP))
    // 버전 제목(현재 버전인지는 아래 3단계에서 다시 가린다)
    const { data: versions, error: versionError } = await db.from("quote_document_versions").select("quote_document_id").ilike("title", pattern).limit(MCP_SCAN_CAP + 1)
    if (versionError) throw versionError
    const versionDocIds = Array.from(new Set(((versions ?? []) as Array<{ quote_document_id: string }>).slice(0, MCP_SCAN_CAP).map((v) => v.quote_document_id)))
    if (((versions ?? []) as unknown[]).length > MCP_SCAN_CAP) incomplete = true
    for (const ids of chunk(versionDocIds)) take(await selectQuoteDocs(db, filters, (q) => q.in("id", ids), MCP_SCAN_CAP))
    // 제목 없는 버전 — 목록은 기본 제목 "견적서" 로 보이고 전에는 그 글자로도 찾혔다. 검색어가 그 안에 들면 후보에 넣는다
    if (includesText(query, DEFAULT_QUOTE_TITLE)) {
      const { data: untitled, error: untitledError } = await db.from("quote_document_versions").select("quote_document_id").is("title", null).limit(MCP_SCAN_CAP + 1)
      if (untitledError) throw untitledError
      if (((untitled ?? []) as unknown[]).length > MCP_SCAN_CAP) incomplete = true
      const untitledDocIds = Array.from(new Set(((untitled ?? []) as Array<{ quote_document_id: string }>).slice(0, MCP_SCAN_CAP).map((v) => v.quote_document_id)))
      for (const ids of chunk(untitledDocIds)) take(await selectQuoteDocs(db, filters, (q) => q.in("id", ids), MCP_SCAN_CAP))
    }
    candidates = Array.from(merged.values()).sort(byUpdatedDesc)
  }

  // 2~3단계: 이름·현재 제목으로 정확히 거른다(DB 후보는 상위 집합이다)
  const deals = await loadDealInfo(db, candidates.map((d) => d.deal_id))
  let matched = candidates.filter((d) => deals.has(d.deal_id)) // 딜·고객이 없는 견적은 전에도 목록에 없었다(딜 inner join)
  if (query) {
    const titles = await loadCurrentTitles(db, matched)
    matched = matched.filter((d) => {
      const deal = deals.get(d.deal_id)
      return includesText(query, deal?.customer_name, titles.get(d.id) ?? DEFAULT_QUOTE_TITLE, d.quote_number, deal?.title)
    })
  }
  const more = matched.length > limit || incomplete
  const page = matched.slice(0, limit)
  if (page.length === 0) return { items: [], more }

  // 4단계: 최종 문서만 버전·공유·열람 기록을 붙인다
  const docIds = page.map((d) => d.id)
  const versions: VersionFull[] = []
  const shares: Array<{ created_at: string; quote_document_id: string }> = []
  const logs: ActivityLog[] = []
  for (const ids of chunk(docIds)) {
    versions.push(
      ...(await readAll<VersionFull>((from, to) =>
        db
          .from("quote_document_versions")
          .select(
            "id, quote_document_id, version_number, title, subtotal, discount_amount, tax_amount, total_amount, template_id:structured_json->quoteDetails->>templateId, vat_included:structured_json->quoteDetails->>vatIncluded"
          )
          .in("quote_document_id", ids)
          .order("version_number", { ascending: false })
          .range(from, to)
      ))
    )
    const shareRows = await readAll<{ created_at: string; quote_document_versions: { quote_document_id: string } | null }>((from, to) =>
      db
        .from("quote_document_shares")
        .select("created_at, quote_document_versions!inner(quote_document_id)")
        .in("quote_document_versions.quote_document_id", ids)
        .order("created_at", { ascending: false })
        .range(from, to)
    )
    for (const s of shareRows) if (s.quote_document_versions) shares.push({ created_at: s.created_at, quote_document_id: s.quote_document_versions.quote_document_id })
    logs.push(
      ...(await readAll<ActivityLog>((from, to) =>
        db
          .from("activity_logs")
          .select("*")
          .eq("target_type", "quote_document")
          .in("target_id", ids)
          .in("action_type", [...QUOTE_INTERACTION_ACTIONS])
          .order("created_at", { ascending: false })
          .range(from, to)
      ))
    )
  }

  const versionsByDoc = new Map<string, VersionFull[]>()
  for (const v of versions) versionsByDoc.set(v.quote_document_id, [...(versionsByDoc.get(v.quote_document_id) ?? []), v])
  const sharesByDoc = new Map<string, Array<{ created_at: string }>>()
  for (const s of shares) sharesByDoc.set(s.quote_document_id, [...(sharesByDoc.get(s.quote_document_id) ?? []), s])
  const logsByDoc = new Map<string, ActivityLog[]>()
  for (const l of logs) if (l.target_id) logsByDoc.set(l.target_id, [...(logsByDoc.get(l.target_id) ?? []), l])

  const items = page.map((doc): PartnerDocumentListItem => {
    const deal = deals.get(doc.deal_id)
    const docVersions = versionsByDoc.get(doc.id) ?? []
    const current = docVersions.find((v) => v.id === doc.current_version_id) ?? docVersions[0] ?? null
    const docShares = sharesByDoc.get(doc.id) ?? []
    const interaction = summarizeQuoteInteractionLogs(logsByDoc.get(doc.id) ?? [], { version_id: null, share_id: null, token: null })
    return {
      id: doc.id,
      kind: "quote",
      deal_id: doc.deal_id,
      customer_id: deal?.customer_id ?? "",
      customer_name: deal?.customer_name ?? null,
      deal_title: deal?.title ?? "",
      document_number: doc.quote_number,
      title: current?.title ?? DEFAULT_QUOTE_TITLE,
      template_id: current?.template_id ?? null,
      status: doc.status,
      version_count: docVersions.length,
      total_amount: current?.total_amount ?? null,
      subtotal: current?.subtotal ?? null,
      discount_amount: current?.discount_amount ?? null,
      tax_amount: current?.tax_amount ?? null,
      vat_included: current ? resolveQuoteVatIncluded(current.vat_included, current.tax_amount) : null,
      updated_at: doc.updated_at,
      latest_version_number: current?.version_number ?? null,
      share_count: docShares.length,
      latest_share_created_at: docShares[0]?.created_at ?? null,
      view_count: interaction.viewCount,
      last_viewed_at: interaction.lastViewedAt,
      review_confirmed_at: interaction.reviewConfirmedAt,
      accepted_at: interaction.acceptedAt,
      pdf_url: null,
    }
  })
  return { items, more }
}
