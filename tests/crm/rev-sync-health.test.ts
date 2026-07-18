// CRM 싱크 상태 3단계(계정 커버리지 문턱 10%/60%) 순수 판정 + 표기 규약.
// 시안: docs/active/mockups/rev-crm-sync-visual-2026-07-18.html — 낮음=테라코타 /
// 부분=앰버 / 건강=그린. 파랑(#1E5DA8)은 확도 전용이라 이 축에서는 등장하지 않는다.
import { describe, expect, it } from "vitest"

import {
  buildCrmSyncSummary,
  formatRevSyncPct,
  revSyncAccountPct,
  revSyncHealth,
  type RevSyncCoverageView,
} from "@/lib/crm/rev-sync-health"

describe("revSyncHealth", () => {
  it("10% 미만은 low — 2026-07-18 실측(계정 2/234 = 0.9%)이 여기 해당", () => {
    expect(revSyncHealth(2, 234)).toBe("low")
    expect(revSyncHealth(0, 100)).toBe("low")
    expect(revSyncHealth(9, 100)).toBe("low")
  })

  it("10% 이상 60% 미만은 partial (경계 10% 포함)", () => {
    expect(revSyncHealth(10, 100)).toBe("partial")
    expect(revSyncHealth(59, 100)).toBe("partial")
    expect(revSyncHealth(1, 3)).toBe("partial") // 33.3%
  })

  it("60% 이상은 healthy (경계 60% 포함)", () => {
    expect(revSyncHealth(60, 100)).toBe("healthy")
    expect(revSyncHealth(100, 100)).toBe("healthy")
  })

  it("분모 0(시트 비어 있음/집계 실패)은 낙관하지 않고 low", () => {
    expect(revSyncHealth(0, 0)).toBe("low")
    expect(revSyncHealth(5, 0)).toBe("low")
  })
})

describe("revSyncAccountPct / formatRevSyncPct", () => {
  it("실측 감각 — 2/234는 0.9%로 표기", () => {
    expect(formatRevSyncPct(revSyncAccountPct(2, 234))).toBe("0.9%")
  })

  it("10% 미만은 소수 1자리, 이상은 정수 반올림", () => {
    expect(formatRevSyncPct(1.04)).toBe("1.0%")
    expect(formatRevSyncPct(9.94)).toBe("9.9%")
    expect(formatRevSyncPct(87.4)).toBe("87%")
  })

  it("0 이하·비정상 값은 0%", () => {
    expect(formatRevSyncPct(0)).toBe("0%")
    expect(formatRevSyncPct(Number.NaN)).toBe("0%")
    expect(revSyncAccountPct(2, 0)).toBe(0)
  })
})

// 2026-07-18 프로덕션 실측 감각 픽스처 — matchable 385 / linked 5 / review 13 /
// unlinked 367, 계정 2/234, 매출 76,585/7,610,544, orphan 136, stale 98.
const FIXTURE_LOW: RevSyncCoverageView = {
  scannedRows: 434,
  accounts: { total: 234, linked: 2, partial: 0, needsReview: 12, unlinked: 220, placeholder: 3 },
  revenue: { total: 7_610_544, linked: 76_585, coveragePct: 1, placeholder: 1_839_869 },
  topUnlinked: [
    { accountKey: "윤유경플러스", name: "윤유경플러스", rows: 3, unlinkedRevenue: 802_603, manager: "BD Junhyuk" },
  ],
  rows: { matchable: 385, linked: 5, review: 13, unlinked: 367 },
  revenueCny: { total: 7_610_544, linked: 76_585, coveragePct: 1, placeholder: 1_839_869 },
  asOf: "2026-07-18T00:33:00+09:00",
  hygiene: { orphanCandidates: 136, staleLinks: 98 },
  health: "low",
}

describe("buildCrmSyncSummary", () => {
  it("실측 감각 픽스처를 low 상태 요약으로 접는다", () => {
    const summary = buildCrmSyncSummary(FIXTURE_LOW)
    expect(summary).not.toBeNull()
    expect(summary!.health).toBe("low")
    expect(summary!.accountConnected).toBe(2)
    expect(summary!.accountTotal).toBe(234)
    expect(summary!.accountPctLabel).toBe("0.9%")
    expect(summary!.revenuePctLabel).toBe("1.0%")
    expect(summary!.rows.review).toBe(13)
    expect(summary!.hygiene.orphanCandidates).toBe(136)
    expect(summary!.hygiene.staleLinks).toBe(98)
    expect(summary!.placeholderRows).toBe(434 - 385)
    expect(summary!.placeholderRevenue).toBe(1_839_869)
  })

  it("health 필드가 없으면(배포 스큐) 순수 함수로 재판정한다", () => {
    const summary = buildCrmSyncSummary({ ...FIXTURE_LOW, health: undefined })
    expect(summary!.health).toBe("low")
  })

  it("확장 필드가 없거나(구 서버) 스캔 행 0이면 null — 소비자는 조용히 물러난다", () => {
    expect(buildCrmSyncSummary(null)).toBeNull()
    expect(buildCrmSyncSummary({ ...FIXTURE_LOW, rows: undefined })).toBeNull()
    expect(buildCrmSyncSummary({ ...FIXTURE_LOW, hygiene: undefined })).toBeNull()
    expect(buildCrmSyncSummary({ ...FIXTURE_LOW, scannedRows: 0 })).toBeNull()
  })
})
