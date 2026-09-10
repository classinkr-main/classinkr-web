import "server-only"

import { KOREA_PROVINCE_LABELS, normalizeRegionLabel } from "@/lib/regions/korea-regions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * 지역 분배(territory) — 시도 하나에 담당자 하나.
 *
 * 이 표의 목적은 화면 장식이 아니다. lib/crm/lead-assignment-policy.ts 는 "권위 있는 owner
 * 연결이 없으므로 채널·지역·라운드로빈을 추측하지 않는다"는 이유로 자동 배정 후보를
 * 구조적으로 0으로 닫아 두었고, 실제로 프로덕션 리드 231건 전부가 미배정이다(2026-08-28).
 * 여기 담기는 값은 사람이 정한 배정이므로 그 근거가 된다 — 추론이 아니다.
 *
 * 교체는 파괴적이지 않다. 이전 행의 effective_to 를 닫고 새 행을 넣어, "언제부터 누가
 * 맡았나"를 나중에도 되짚을 수 있게 한다.
 *
 * 마이그레이션이 아직 적용되지 않은 환경에서는 available=false 로 조용히 내려간다.
 * 화면은 그 신호로 "배정표 미적용"을 표시하고, 빈 배정을 '아무도 안 맡음'으로 오해하지 않는다.
 */

export interface CrmRegionAssignment {
  regionLabel: string
  ownerKey: string
  ownerName: string | null
  effectiveFrom: string
  note: string | null
}

export interface CrmRegionAssignmentList {
  available: boolean
  generatedAt: string
  /** 17개 시도 전체 — 배정이 없으면 assignment=null. 공백을 숨기지 않기 위해 항상 전부 싣는다. */
  regions: Array<{ label: string; assignment: CrmRegionAssignment | null }>
  /** 담당자별 배정 시도 수. */
  workload: Array<{ ownerKey: string; ownerName: string | null; regions: string[] }>
  assignedCount: number
  totalRegions: number
  warning: string | null
}

interface AssignmentRow {
  region_label: string
  owner_key: string
  owner_name: string | null
  effective_from: string
  note: string | null
}

const MISSING_TABLE_WARNING =
  "지역 분배 표가 아직 적용되지 않았습니다. supabase/migrations/20260828_crm_region_assignments.sql 적용이 필요합니다."

function isMissingAssignmentsTableError(error: {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
} | null) {
  if (!error) return false
  const haystack = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase()
  return (
    haystack.includes("42p01") ||
    (haystack.includes("crm_region_assignments") &&
      (haystack.includes("does not exist") ||
        haystack.includes("could not find") ||
        haystack.includes("schema cache")))
  )
}

function emptyList(available: boolean, warning: string | null): CrmRegionAssignmentList {
  return {
    available,
    generatedAt: new Date().toISOString(),
    regions: KOREA_PROVINCE_LABELS.map((label) => ({ label, assignment: null })),
    workload: [],
    assignedCount: 0,
    totalRegions: KOREA_PROVINCE_LABELS.length,
    warning,
  }
}

export async function listCrmRegionAssignments(): Promise<CrmRegionAssignmentList> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("crm_region_assignments")
    .select("region_label, owner_key, owner_name, effective_from, note")
    .is("effective_to", null)

  if (error) {
    if (isMissingAssignmentsTableError(error)) return emptyList(false, MISSING_TABLE_WARNING)
    throw new Error(error.message)
  }

  const byRegion = new Map<string, CrmRegionAssignment>()
  for (const row of (data ?? []) as AssignmentRow[]) {
    // 표기가 흔들린 값이 저장돼 있어도 화면 표준(17개 시도)으로 접어 읽는다.
    const label = normalizeRegionLabel(row.region_label) ?? row.region_label
    byRegion.set(label, {
      regionLabel: label,
      ownerKey: row.owner_key,
      ownerName: row.owner_name,
      effectiveFrom: row.effective_from,
      note: row.note,
    })
  }

  const workloadMap = new Map<string, { ownerKey: string; ownerName: string | null; regions: string[] }>()
  for (const assignment of byRegion.values()) {
    const entry = workloadMap.get(assignment.ownerKey) ?? {
      ownerKey: assignment.ownerKey,
      ownerName: assignment.ownerName,
      regions: [],
    }
    entry.regions.push(assignment.regionLabel)
    workloadMap.set(assignment.ownerKey, entry)
  }

  return {
    available: true,
    generatedAt: new Date().toISOString(),
    regions: KOREA_PROVINCE_LABELS.map((label) => ({ label, assignment: byRegion.get(label) ?? null })),
    workload: Array.from(workloadMap.values()).sort(
      (a, b) => b.regions.length - a.regions.length || a.ownerKey.localeCompare(b.ownerKey, "ko")
    ),
    assignedCount: byRegion.size,
    totalRegions: KOREA_PROVINCE_LABELS.length,
    warning: null,
  }
}

export interface SetCrmRegionAssignmentInput {
  regionLabel: string
  /** null 이면 배정 해제(이전 행만 닫는다). */
  ownerKey: string | null
  ownerName?: string | null
  note?: string | null
  actor?: string | null
}

/**
 * 한 시도의 담당자를 교체한다. 이전 활성 행을 오늘로 닫고 새 행을 넣는다.
 * 같은 담당자로 다시 지정하면 아무것도 바꾸지 않는다(무의미한 이력을 남기지 않는다).
 */
export async function setCrmRegionAssignment(
  input: SetCrmRegionAssignmentInput
): Promise<{ ok: true; changed: boolean } | { ok: false; reason: "unavailable" | "invalid_region" }> {
  const label = normalizeRegionLabel(input.regionLabel)
  if (!label) return { ok: false, reason: "invalid_region" }

  const sb = createSupabaseAdminClient()
  const ownerKey = input.ownerKey?.trim() || null

  const { data: current, error: readError } = await sb
    .from("crm_region_assignments")
    .select("id, owner_key")
    .eq("region_label", label)
    .is("effective_to", null)
    .maybeSingle()

  if (readError) {
    if (isMissingAssignmentsTableError(readError)) return { ok: false, reason: "unavailable" }
    throw new Error(readError.message)
  }

  if ((current?.owner_key ?? null) === ownerKey) return { ok: true, changed: false }

  if (current) {
    const { error } = await sb
      .from("crm_region_assignments")
      .update({ effective_to: new Date().toISOString().slice(0, 10) })
      .eq("id", current.id)
    if (error) throw new Error(error.message)
  }

  if (ownerKey) {
    const { error } = await sb.from("crm_region_assignments").insert({
      region_label: label,
      owner_key: ownerKey,
      owner_name: input.ownerName?.trim() || null,
      note: input.note?.trim() || null,
      created_by: input.actor?.trim() || null,
    })
    if (error) throw new Error(error.message)
  }

  return { ok: true, changed: true }
}
