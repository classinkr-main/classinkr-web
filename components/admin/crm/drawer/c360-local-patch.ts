// 고객 360 로컬 보정(override) — 딜 mutation 이 성공한 직후 360 재조회가 아직 옛 행을 돌려주는
// 짧은 창 동안, 방금 쓴 값이 화면에서 되돌아 보이지 않게 덮어쓴다. 창을 지나면 서버 값이 정본이다.

import type { Customer360 } from "@/lib/repositories/crm-customer-360"
import type { CrmDealRecord } from "@/lib/repositories/crm-deals"

/** 보정 유효 창. 이 시간이 지난 override 는 무시하고 서버 페이로드를 그대로 쓴다. */
export const C360_OVERRIDE_TTL_MS = 120_000

export interface C360DealPatchedOverride {
  kind: "deal_patched"
  dealId: string
  /**
   * 이 mutation 이 실제로 바꾼 필드만 담는다. 서버 응답 레코드(CrmDealRecord) 전체를 담으면,
   * 그사이 다른 사람이 바꾼 담당자·제목까지 이 창 동안 옛 값으로 되돌려 놓는다.
   */
  patch: Partial<CrmDealRecord>
  /** 기록 시각(Date.now()) */
  at: number
}

export type C360Override = C360DealPatchedOverride

export function patchDealRow(row: CrmDealRecord, patch: Partial<CrmDealRecord>): CrmDealRecord {
  return { ...row, ...patch }
}

export function applyC360Overrides(
  data: Customer360 | null,
  overrides: readonly C360Override[],
  now: number = Date.now()
): Customer360 | null {
  if (!data) return data

  const patches = new Map<string, Partial<CrmDealRecord>>()
  for (const override of overrides) {
    if (now - override.at > C360_OVERRIDE_TTL_MS) continue
    patches.set(override.dealId, { ...patches.get(override.dealId), ...override.patch })
  }
  if (patches.size === 0) return data

  return {
    ...data,
    deals: {
      ...data.deals,
      rows: data.deals.rows.map((row) => {
        const patch = patches.get(row.id)
        return patch ? patchDealRow(row, patch) : row
      }),
    },
  }
}
