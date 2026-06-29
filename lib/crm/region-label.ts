import { normalizeRegionLabel } from "@/lib/regions/korea-regions"

// 지역 라벨 = 고객 실제 위치(주소) 기준 (culture-fit §5). 담당자/영업권과 섞지 않는다.
// 주소 기반 자동값과 수동 보정값은 출처를 구분하고, 매칭 실패 시 "지역 미지정"으로 표시한다.

export const REGION_UNSPECIFIED = "지역 미지정"

export type RegionSource = "address" | "manual" | "unspecified"

export interface CustomerRegion {
  label: string
  source: RegionSource
}

export function deriveCustomerRegion(
  candidates: Array<string | null | undefined>,
  manual?: string | null
): CustomerRegion {
  // 수동 보정이 있으면 우선하되 출처를 manual로 표시한다.
  const manualLabel = normalizeRegionLabel(manual)
  if (manualLabel) return { label: manualLabel, source: "manual" }

  for (const candidate of candidates) {
    const label = normalizeRegionLabel(candidate)
    if (label) return { label, source: "address" }
  }

  return { label: REGION_UNSPECIFIED, source: "unspecified" }
}

// NEO/HQ 스냅샷 payload에서 주소·지역 후보 필드를 모은다(销售易 + 표준 키 best-effort).
const REGION_PAYLOAD_KEYS = [
  "region",
  "Region__c",
  "province",
  "Province__c",
  "city",
  "City__c",
  "address",
  "Address__c",
  "addr",
  "area",
  "district",
  "지역",
  "주소",
]

export function regionCandidatesFromPayload(payload: Record<string, unknown> | null | undefined): string[] {
  if (!payload) return []
  const out: string[] = []
  for (const key of REGION_PAYLOAD_KEYS) {
    const value = payload[key]
    if (typeof value === "string" && value.trim()) out.push(value)
  }
  return out
}
