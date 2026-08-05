import "server-only"

import { createHash } from "node:crypto"

import {
  NAVER_MAP_SOURCE_OBJECT,
  NAVER_MAP_SOURCE_SYSTEM,
  assessNaverMapPlaceMatch,
  deriveNaverMapRegion,
  normalizeNaverMapPlace,
  parseNaverMapFolderId,
  type NaverMapMatchCandidate,
  type NaverMapMatchStatus,
  type NaverMapMatchTarget,
  type NaverMapPlaceInput,
} from "@/lib/crm/naver-map-source"
import {
  isInactiveSheetStatus,
  normalizeCrmName,
  scoreCrmEntityMatch,
} from "@/lib/crm-source-linking"
import { normalizeRegionLabel } from "@/lib/regions/korea-regions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

const MAP_SOURCE_FRESHNESS_HOURS = 24 * 7
const IMPORT_CHUNK_SIZE = 500
const LIST_LIMIT = 2_000

interface ExternalMapRecordRow {
  external_id: string
  display_name: string | null
  payload: Record<string, unknown> | null
  synced_at: string
  is_stale: boolean
  stale_at: string | null
}

interface ConfirmedMapLinkRow {
  source_record_key: string
  target_type: string
  target_id: string
  confidence: number | null
  metadata: Record<string, unknown> | null
  confirmed_at: string | null
}

export interface CrmNaverMapRow {
  externalId: string
  name: string
  category: string | null
  address: string
  provinceRaw: string | null
  regionLabel: string
  localityLabel: string | null
  folderId: string
  sourceUrl: string
  syncedAt: string
  isStale: boolean
  staleAt: string | null
  matchStatus: NaverMapMatchStatus
  candidate: NaverMapMatchCandidate | null
  revEvidence: NaverMapMatchCandidate | null
  confidenceGap: number | null
  confirmedTarget: {
    targetType: string
    targetId: string
    targetLabel: string | null
    confidence: number | null
    confirmedAt: string | null
  } | null
}

export interface CrmNaverMapSourceList {
  generatedAt: string
  latestSyncedAt: string | null
  freshnessHours: number
  isStale: boolean
  summary: {
    total: number
    active: number
    stale: number
    linked: number
    prelinked: number
    review: number
    unmatched: number
    regions: Array<{ label: string; count: number }>
  }
  warnings: string[]
  rows: CrmNaverMapRow[]
}

export interface ImportCrmNaverMapInput {
  sourceUrl: string
  sourceLabel?: string | null
  expectedCount: number
  fullSnapshot: boolean
  places: NaverMapPlaceInput[]
  actor?: string | null
  now?: Date
}

export interface ImportCrmNaverMapResult {
  runId: string
  folderId: string
  imported: number
  staleMarked: number
  fullSnapshot: boolean
  syncedAt: string
}

export type CrmNaverMapLinkTargetType = "external_account" | "customer" | "partner_account" | "lead"

export interface ConfirmCrmNaverMapLinkInput {
  externalId: string
  targetType: CrmNaverMapLinkTargetType
  targetId: string
  actorUserId?: string | null
  actorLabel?: string | null
}

function payloadString(payload: Record<string, unknown> | null, key: string) {
  const value = payload?.[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function hoursSince(value: string | null, now = Date.now()) {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return null
  return Math.max(0, (now - timestamp) / 3_600_000)
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function buildExternalId(folderId: string, place: NaverMapPlaceInput) {
  const identity = `${normalizeCrmName(place.name)}\n${place.address.normalize("NFKC").toLowerCase()}`
  return `${folderId}:${hashValue(identity).slice(0, 32)}`
}

function canonicalNaverMapUrl(sourceUrl: string) {
  const url = new URL(sourceUrl)
  return `${url.origin}${url.pathname}`
}

function buildImportRows(input: ImportCrmNaverMapInput, folderId: string, runId: string, syncedAt: string) {
  const prepared = input.places.map((place, index) => {
    const normalized = normalizeNaverMapPlace(place)
    if (!normalized) throw new Error(`${index + 1}번째 장소에 이름 또는 주소가 없습니다.`)
    const region = deriveNaverMapRegion(normalized.address)
    const externalId = buildExternalId(folderId, normalized)
    const payload = {
      folder_id: folderId,
      source_label: input.sourceLabel?.trim() || "네이버 공유지도",
      source_url: canonicalNaverMapUrl(input.sourceUrl),
      place_name: normalized.name,
      category: normalized.category,
      address_raw: normalized.address,
      province_raw: region.provinceRaw,
      region_label: region.regionLabel,
      locality_label: region.localityLabel,
      region_source: region.source,
      captured_at: syncedAt,
    }
    return {
      source_system: NAVER_MAP_SOURCE_SYSTEM,
      object_api_key: NAVER_MAP_SOURCE_OBJECT,
      external_id: externalId,
      normalized_name: normalizeCrmName(normalized.name),
      display_name: normalized.name,
      owner_name: input.actor?.trim() || null,
      status: "unverified",
      amount: null,
      occurred_at: null,
      payload,
      payload_hash: hashValue(JSON.stringify(payload)),
      synced_at: syncedAt,
      last_seen_run_id: runId,
      is_stale: false,
      stale_at: null,
    }
  })

  const uniqueIds = new Set(prepared.map((row) => row.external_id))
  if (uniqueIds.size !== prepared.length) {
    throw new Error("같은 이름과 주소가 중복된 장소가 있습니다. 중복을 정리한 뒤 다시 가져오세요.")
  }
  return prepared
}

function targetLabelFromLead(row: { org: string | null; name: string | null }) {
  return row.org?.trim() || row.name?.trim() || ""
}

async function loadMatchTargets(warnings: string[]) {
  const sb = createSupabaseAdminClient()
  const [neo, customers, partners, leads, rev] = await Promise.all([
    sb
      .from("crm_neo_customer_snapshots")
      .select("account_id, account_name, region_label")
      .eq("is_stale", false)
      .limit(10_000),
    sb.from("customers").select("id, name, campus_name").limit(2_000),
    sb.from("partner_accounts").select("id, name").limit(2_000),
    sb.from("leads").select("id, name, org, branch").limit(5_000),
    sb
      .from("branch_rev_deals")
      .select("id, customer_name, region, status")
      .limit(2_000),
  ])

  const results = [neo, customers, partners, leads, rev]
  const labels = ["NEO 고객", "전환 고객", "파트너 계정", "리드", "REV"]
  results.forEach((result, index) => {
    if (result.error) warnings.push(`${labels[index]} 매칭 원천을 읽지 못했습니다: ${result.error.message}`)
  })

  const crmTargets: NaverMapMatchTarget[] = [
    ...((neo.error ? [] : neo.data ?? []) as Array<{
      account_id: string
      account_name: string
      region_label: string | null
    }>).map((row) => ({
      source: "neo" as const,
      targetType: "external_account" as const,
      targetId: row.account_id,
      label: row.account_name,
      regionLabel: row.region_label,
    })),
    ...((customers.error ? [] : customers.data ?? []) as Array<{
      id: string
      name: string
      campus_name: string | null
    }>).map((row) => ({
      source: "customer" as const,
      targetType: "customer" as const,
      targetId: row.id,
      label: [row.name, row.campus_name].filter(Boolean).join(" · "),
      regionLabel: null,
    })),
    ...((partners.error ? [] : partners.data ?? []) as Array<{ id: string; name: string }>).map((row) => ({
      source: "partner" as const,
      targetType: "partner_account" as const,
      targetId: row.id,
      label: row.name,
      regionLabel: null,
    })),
    ...((leads.error ? [] : leads.data ?? []) as Array<{
      id: string
      name: string | null
      org: string | null
      branch: string | null
    }>)
      .map((row) => ({
        source: "lead" as const,
        targetType: "lead" as const,
        targetId: row.id,
        label: targetLabelFromLead(row),
        regionLabel: normalizeRegionLabel(row.branch),
      }))
      .filter((row) => row.label),
  ]

  const revTargets: NaverMapMatchTarget[] = (
    (rev.error ? [] : rev.data ?? []) as Array<{
      id: string
      customer_name: string
      region: string | null
      status: string | null
    }>
  )
    .filter((row) => !isInactiveSheetStatus(row.status))
    .map((row) => ({
      source: "rev" as const,
      targetType: "rev_deal" as const,
      targetId: row.id,
      label: row.customer_name,
      regionLabel: normalizeRegionLabel(row.region),
    }))

  return { crmTargets, revTargets }
}

function confirmedTargetLabel(link: ConfirmedMapLinkRow) {
  return payloadString(link.metadata, "target_label")
}

async function loadConfirmedLinkTarget(
  targetType: CrmNaverMapLinkTargetType,
  targetId: string
): Promise<{ label: string; regionLabel: string | null }> {
  const sb = createSupabaseAdminClient()

  if (targetType === "external_account") {
    const { data, error } = await sb
      .from("crm_neo_customer_snapshots")
      .select("account_name, region_label")
      .eq("source_system", "xiaoshouyi")
      .eq("account_id", targetId)
      .eq("is_stale", false)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error("연결할 NEO 고객을 찾지 못했습니다.")
    return { label: data.account_name, regionLabel: normalizeRegionLabel(data.region_label) }
  }

  if (targetType === "customer") {
    const { data, error } = await sb
      .from("customers")
      .select("name, campus_name")
      .eq("id", targetId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error("연결할 전환 고객을 찾지 못했습니다.")
    return { label: [data.name, data.campus_name].filter(Boolean).join(" · "), regionLabel: null }
  }

  if (targetType === "partner_account") {
    const { data, error } = await sb
      .from("partner_accounts")
      .select("name")
      .eq("id", targetId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error("연결할 파트너 계정을 찾지 못했습니다.")
    return { label: data.name, regionLabel: null }
  }

  const { data, error } = await sb
    .from("leads")
    .select("name, org, branch")
    .eq("id", targetId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("연결할 리드를 찾지 못했습니다.")
  return {
    label: targetLabelFromLead(data),
    regionLabel: normalizeRegionLabel(data.branch),
  }
}

export async function confirmCrmNaverMapLink(input: ConfirmCrmNaverMapLinkInput) {
  const externalId = input.externalId.trim()
  const targetId = input.targetId.trim()
  if (!externalId || !targetId) throw new Error("지도 장소와 연결 대상을 지정해야 합니다.")

  const sb = createSupabaseAdminClient()
  const { data: source, error: sourceError } = await sb
    .from("external_crm_records")
    .select("display_name, normalized_name, payload, is_stale")
    .eq("source_system", NAVER_MAP_SOURCE_SYSTEM)
    .eq("object_api_key", NAVER_MAP_SOURCE_OBJECT)
    .eq("external_id", externalId)
    .maybeSingle()
  if (sourceError) throw sourceError
  if (!source) throw new Error("연결할 지도 장소를 찾지 못했습니다.")
  if (source.is_stale) throw new Error("이전 스냅샷은 연결할 수 없습니다.")

  const payload = (source.payload ?? {}) as Record<string, unknown>
  const sourceLabel = source.display_name ?? payloadString(payload, "place_name") ?? externalId
  const sourceRegion = payloadString(payload, "region_label")
  const target = await loadConfirmedLinkTarget(input.targetType, targetId)
  const match = scoreCrmEntityMatch({ sourceName: sourceLabel, targetName: target.label })
  if (match.score < 0.72) {
    throw new Error("이름 매칭 근거가 약해 확정 연결할 수 없습니다.")
  }

  const { data: existing, error: existingError } = await sb
    .from("crm_source_links")
    .select("id, target_type, target_id")
    .eq("source_system", NAVER_MAP_SOURCE_SYSTEM)
    .eq("source_object", NAVER_MAP_SOURCE_OBJECT)
    .eq("source_record_key", externalId)
    .eq("status", "confirmed")
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) {
    if (existing.target_type === input.targetType && existing.target_id === targetId) return existing
    throw new Error("이미 다른 CRM 레코드와 연결된 지도 장소입니다.")
  }

  const sameRegion = Boolean(sourceRegion && target.regionLabel && sourceRegion === target.regionLabel)
  const confirmedAt = new Date().toISOString()
  const { data: link, error: linkError } = await sb
    .from("crm_source_links")
    .upsert(
      {
        source_system: NAVER_MAP_SOURCE_SYSTEM,
        source_object: NAVER_MAP_SOURCE_OBJECT,
        source_record_key: externalId,
        normalized_name: source.normalized_name ?? normalizeCrmName(sourceLabel),
        target_type: input.targetType,
        target_id: targetId,
        confidence: match.score,
        status: "confirmed",
        metadata: {
          source_label: sourceLabel,
          source_region: sourceRegion,
          target_label: target.label,
          target_region: target.regionLabel,
          same_region: sameRegion,
          evidence: [...match.evidence, ...(sameRegion ? ["region:exact"] : [])],
          auto_confirmed: false,
          actor_label: input.actorLabel?.trim() || null,
        },
        confirmed_by: input.actorUserId?.trim() || null,
        confirmed_at: confirmedAt,
      },
      { onConflict: "source_system,source_object,source_record_key,target_type,target_id" }
    )
    .select("id, target_type, target_id, confidence, confirmed_at")
    .single()
  if (linkError) throw linkError
  return link
}

export async function listCrmNaverMapSource(): Promise<CrmNaverMapSourceList> {
  const sb = createSupabaseAdminClient()
  const warnings: string[] = []
  const [recordsResult, linksResult, targets] = await Promise.all([
    sb
      .from("external_crm_records")
      .select("external_id, display_name, payload, synced_at, is_stale, stale_at")
      .eq("source_system", NAVER_MAP_SOURCE_SYSTEM)
      .eq("object_api_key", NAVER_MAP_SOURCE_OBJECT)
      .order("synced_at", { ascending: false })
      .limit(LIST_LIMIT),
    sb
      .from("crm_source_links")
      .select("source_record_key, target_type, target_id, confidence, metadata, confirmed_at")
      .eq("source_system", NAVER_MAP_SOURCE_SYSTEM)
      .eq("source_object", NAVER_MAP_SOURCE_OBJECT)
      .eq("status", "confirmed")
      .limit(LIST_LIMIT),
    loadMatchTargets(warnings),
  ])

  if (recordsResult.error) throw recordsResult.error
  if (linksResult.error) warnings.push(`확정 링크를 읽지 못했습니다: ${linksResult.error.message}`)

  const records = (recordsResult.data ?? []) as ExternalMapRecordRow[]
  const links = (linksResult.error ? [] : linksResult.data ?? []) as ConfirmedMapLinkRow[]
  const linkByExternalId = new Map(links.map((link) => [link.source_record_key, link]))

  const rows = records.map((record): CrmNaverMapRow => {
    const payload = record.payload ?? {}
    const name = record.display_name ?? payloadString(payload, "place_name") ?? record.external_id
    const address = payloadString(payload, "address_raw") ?? ""
    const derivedRegion = deriveNaverMapRegion(address)
    const regionLabel = payloadString(payload, "region_label") ?? derivedRegion.regionLabel
    const assessment = assessNaverMapPlaceMatch(
      { name, regionLabel },
      targets.crmTargets,
      targets.revTargets
    )
    const link = linkByExternalId.get(record.external_id) ?? null

    return {
      externalId: record.external_id,
      name,
      category: payloadString(payload, "category"),
      address,
      provinceRaw: payloadString(payload, "province_raw") ?? derivedRegion.provinceRaw,
      regionLabel,
      localityLabel: payloadString(payload, "locality_label") ?? derivedRegion.localityLabel,
      folderId: payloadString(payload, "folder_id") ?? record.external_id.split(":")[0],
      sourceUrl: payloadString(payload, "source_url") ?? "https://map.naver.com/",
      syncedAt: record.synced_at,
      isStale: record.is_stale,
      staleAt: record.stale_at,
      matchStatus: link ? "linked" : assessment.status,
      candidate: assessment.candidate,
      revEvidence: assessment.revEvidence,
      confidenceGap: assessment.confidenceGap,
      confirmedTarget: link
        ? {
            targetType: link.target_type,
            targetId: link.target_id,
            targetLabel: confirmedTargetLabel(link),
            confidence: link.confidence,
            confirmedAt: link.confirmed_at,
          }
        : null,
    }
  })

  const latestSyncedAt = rows.map((row) => row.syncedAt).filter(Boolean).sort().at(-1) ?? null
  const ageHours = hoursSince(latestSyncedAt)
  const isStale = ageHours == null || ageHours > MAP_SOURCE_FRESHNESS_HOURS
  if (rows.length === 0) warnings.push("가져온 네이버 공유지도 스냅샷이 없습니다.")
  if (rows.length > 0 && isStale) warnings.push("네이버 공유지도 스냅샷이 7일 이상 갱신되지 않았습니다.")

  const activeRows = rows.filter((row) => !row.isStale)
  const regionCounts = new Map<string, number>()
  for (const row of activeRows) {
    regionCounts.set(row.regionLabel, (regionCounts.get(row.regionLabel) ?? 0) + 1)
  }

  return {
    generatedAt: new Date().toISOString(),
    latestSyncedAt,
    freshnessHours: MAP_SOURCE_FRESHNESS_HOURS,
    isStale,
    summary: {
      total: rows.length,
      active: activeRows.length,
      stale: rows.filter((row) => row.isStale).length,
      linked: activeRows.filter((row) => row.matchStatus === "linked").length,
      prelinked: activeRows.filter((row) => row.matchStatus === "prelinked").length,
      review: activeRows.filter((row) => row.matchStatus === "review").length,
      unmatched: activeRows.filter((row) => row.matchStatus === "unmatched").length,
      regions: Array.from(regionCounts, ([label, count]) => ({ label, count })).sort(
        (left, right) => right.count - left.count || left.label.localeCompare(right.label, "ko")
      ),
    },
    warnings,
    rows,
  }
}

async function updateRunFailure(runId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "네이버 공유지도 가져오기 실패"
  await createSupabaseAdminClient()
    .from("external_crm_sync_runs")
    .update({ status: "failed", finished_at: new Date().toISOString(), error: message })
    .eq("id", runId)
}

export async function importCrmNaverMapSource(input: ImportCrmNaverMapInput): Promise<ImportCrmNaverMapResult> {
  const folderId = parseNaverMapFolderId(input.sourceUrl)
  if (!folderId) throw new Error("올바른 네이버 공유지도 폴더 URL이 필요합니다.")
  if (!Number.isInteger(input.expectedCount) || input.expectedCount < 1 || input.expectedCount > 1_000) {
    throw new Error("예상 장소 수는 1~1000 사이의 정수여야 합니다.")
  }
  if (input.places.length !== input.expectedCount) {
    throw new Error(`예상 ${input.expectedCount}개와 입력 ${input.places.length}개가 일치하지 않습니다.`)
  }

  const sb = createSupabaseAdminClient()
  const syncedAt = (input.now ?? new Date()).toISOString()
  const { data: run, error: runError } = await sb
    .from("external_crm_sync_runs")
    .insert({
      source_system: NAVER_MAP_SOURCE_SYSTEM,
      object_api_key: NAVER_MAP_SOURCE_OBJECT,
      status: "running",
      trigger: "import",
      rows_scanned: input.places.length,
      metadata: {
        folder_id: folderId,
        source_url: canonicalNaverMapUrl(input.sourceUrl),
        source_label: input.sourceLabel?.trim() || "네이버 공유지도",
        full_snapshot: input.fullSnapshot,
        actor: input.actor?.trim() || null,
      },
    })
    .select("id")
    .single()
  if (runError) throw runError

  const runId = String(run.id)
  try {
    const rows = buildImportRows(input, folderId, runId, syncedAt)
    for (let index = 0; index < rows.length; index += IMPORT_CHUNK_SIZE) {
      const { error } = await sb
        .from("external_crm_records")
        .upsert(rows.slice(index, index + IMPORT_CHUNK_SIZE), {
          onConflict: "source_system,object_api_key,external_id",
        })
      if (error) throw error
    }

    let staleMarked = 0
    if (input.fullSnapshot) {
      const { data: priorRows, error: priorError } = await sb
        .from("external_crm_records")
        .select("external_id, last_seen_run_id")
        .eq("source_system", NAVER_MAP_SOURCE_SYSTEM)
        .eq("object_api_key", NAVER_MAP_SOURCE_OBJECT)
        .contains("payload", { folder_id: folderId })
        .limit(LIST_LIMIT)
      if (priorError) throw priorError

      const staleIds = (priorRows ?? [])
        .filter((row) => row.last_seen_run_id !== runId)
        .map((row) => String(row.external_id))
      for (let index = 0; index < staleIds.length; index += IMPORT_CHUNK_SIZE) {
        const chunk = staleIds.slice(index, index + IMPORT_CHUNK_SIZE)
        const { error } = await sb
          .from("external_crm_records")
          .update({ is_stale: true, stale_at: syncedAt })
          .eq("source_system", NAVER_MAP_SOURCE_SYSTEM)
          .eq("object_api_key", NAVER_MAP_SOURCE_OBJECT)
          .in("external_id", chunk)
        if (error) throw error
      }
      staleMarked = staleIds.length
    }

    const { error: finishError } = await sb
      .from("external_crm_sync_runs")
      .update({
        status: "success",
        finished_at: syncedAt,
        rows_upserted: rows.length,
        error: null,
      })
      .eq("id", runId)
    if (finishError) throw finishError

    return {
      runId,
      folderId,
      imported: rows.length,
      staleMarked,
      fullSnapshot: input.fullSnapshot,
      syncedAt,
    }
  } catch (error) {
    await updateRunFailure(runId, error).catch(() => {})
    throw error
  }
}
