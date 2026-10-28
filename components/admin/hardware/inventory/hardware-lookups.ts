// 출고·회수·확정 화면이 부르는 조회 API — 계약: docs/active/hardware-inventory-process-gap-2026-10-28.md §7-3.
// 응답 모양을 여기서 한 번 정리한다(빠진 칸·모르는 값은 버린다). fetcher 를 받아 테스트에서 바꿔 끼운다.

import { adminFetchJson } from "@/lib/admin-client"
import type { LotRemaining } from "@/lib/hardware/inventory-process"

import { normalizeReturnCandidate, type ReturnCandidate } from "./return-form-model"

export type JsonFetcher = <T>(input: string, init?: RequestInit) => Promise<T>

const defaultFetcher: JsonFetcher = (input, init) => adminFetchJson(input, init)

export interface HardwareLotsResult {
  itemId: string | null
  product: string | null
  lotTracked: boolean
  lots: LotRemaining[]
  nextLotNo: string | null
}

function normalizeLots(raw: unknown): LotRemaining[] {
  if (!Array.isArray(raw)) return []
  const lots: LotRemaining[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const lotNo = (entry as { lotNo?: unknown }).lotNo
    const remaining = (entry as { remaining?: unknown }).remaining
    if (typeof lotNo !== "string" || !lotNo.trim()) continue
    lots.push({ lotNo: lotNo.trim(), remaining: typeof remaining === "number" && Number.isFinite(remaining) ? remaining : 0 })
  }
  return lots
}

/** GET /api/admin/hardware/lots — itemId 가 있으면 그것, 없으면 품목명. excludeMovementId 는 확정·수정 중인 예정 행. */
export async function fetchHardwareLots(
  params: { itemId?: string | null; product?: string | null; excludeMovementId?: string | null },
  fetcher: JsonFetcher = defaultFetcher
): Promise<HardwareLotsResult> {
  const search = new URLSearchParams()
  if (params.itemId) search.set("itemId", params.itemId)
  else if (params.product) search.set("product", params.product)
  if (params.excludeMovementId) search.set("excludeMovementId", params.excludeMovementId)
  const raw = await fetcher<Record<string, unknown> | null>(`/api/admin/hardware/lots?${search.toString()}`, { cache: "no-store" })
  return {
    itemId: typeof raw?.itemId === "string" ? raw.itemId : params.itemId ?? null,
    product: typeof raw?.product === "string" ? raw.product : params.product ?? null,
    // 칸이 없으면 관리 품목으로 본다(품목 기본값 lot_tracked = true).
    lotTracked: raw?.lotTracked !== false,
    lots: normalizeLots(raw?.lots),
    nextLotNo: typeof raw?.nextLotNo === "string" ? raw.nextLotNo : null,
  }
}

/** GET /api/admin/hardware/return-candidates — 회수할 수 있는 실제 출고. */
export async function fetchReturnCandidates(
  params: { q?: string; customerId?: string | null },
  fetcher: JsonFetcher = defaultFetcher
): Promise<ReturnCandidate[]> {
  const search = new URLSearchParams()
  if (params.q?.trim()) search.set("q", params.q.trim())
  if (params.customerId) search.set("customerId", params.customerId)
  const raw = await fetcher<{ candidates?: unknown } | null>(`/api/admin/hardware/return-candidates?${search.toString()}`, {
    cache: "no-store",
  })
  if (!Array.isArray(raw?.candidates)) return []
  return raw.candidates.map(normalizeReturnCandidate).filter((candidate): candidate is ReturnCandidate => candidate != null)
}

export interface HardwareCustomerOption {
  id: string
  name: string
  campusName: string | null
  regionLabel: string | null
}

/** GET /api/admin/hardware/customers — CRM 고객 고르기(최대 20). */
export async function fetchHardwareCustomers(q: string, fetcher: JsonFetcher = defaultFetcher): Promise<HardwareCustomerOption[]> {
  const raw = await fetcher<{ customers?: unknown } | null>(`/api/admin/hardware/customers?q=${encodeURIComponent(q.trim())}`, {
    cache: "no-store",
  })
  if (!Array.isArray(raw?.customers)) return []
  const options: HardwareCustomerOption[] = []
  for (const entry of raw.customers) {
    if (!entry || typeof entry !== "object") continue
    const row = entry as Record<string, unknown>
    if (typeof row.id !== "string" || typeof row.name !== "string" || !row.name.trim()) continue
    options.push({
      id: row.id,
      name: row.name.trim(),
      campusName: typeof row.campusName === "string" && row.campusName.trim() ? row.campusName.trim() : null,
      regionLabel: typeof row.regionLabel === "string" && row.regionLabel.trim() ? row.regionLabel.trim() : null,
    })
  }
  return options
}

/** 고객 표시 이름 — 원장 to_location 에 남는 값. 캠퍼스가 이름에 없으면 붙인다. */
export function customerDisplayName(option: Pick<HardwareCustomerOption, "name" | "campusName">): string {
  if (option.campusName && !option.name.includes(option.campusName)) return `${option.name} ${option.campusName}`
  return option.name
}

export interface HardwareOwnerOption {
  userId: string
  name: string
}

/** GET /api/admin/crm/owners — 계정 id 가 있는 담당자만(ownerUserId 로 보낼 수 있어야 한다). */
export async function fetchOwnerOptions(fetcher: JsonFetcher = defaultFetcher): Promise<HardwareOwnerOption[]> {
  const raw = await fetcher<{ owners?: unknown } | null>("/api/admin/crm/owners")
  if (!Array.isArray(raw?.owners)) return []
  const seen = new Set<string>()
  const options: HardwareOwnerOption[] = []
  for (const entry of raw.owners) {
    if (!entry || typeof entry !== "object") continue
    const row = entry as Record<string, unknown>
    if (typeof row.userId !== "string" || !row.userId || seen.has(row.userId)) continue
    const name = typeof row.displayName === "string" ? row.displayName.trim() : ""
    if (!name) continue
    seen.add(row.userId)
    options.push({ userId: row.userId, name })
  }
  return options
}

/** CRM 고객 링크 — customers.id 는 고객 360 키(lead:·neo:)가 아니라서 통합 고객 목록 검색으로 연다. */
export function crmCustomerHref(customerName: string): string {
  return `/admin/crm/customers/unified?owner=&q=${encodeURIComponent(customerName)}`
}
