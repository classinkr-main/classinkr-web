// CRM 싱크 스트립(A안) — 낮음 상태 톤·렌더 위치·링크 규약 검증.
// 이 저장소는 React 렌더 하네스(@testing-library)가 없어(vitest environment: "node")
// 렌더 검증은 (1) 톤 맵·요약 모델 직접 import + (2) 소스 스캔 관례를 따른다
// (branch-hero-gauges-error-prop.test.ts와 동일 관례).
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { CRM_SYNC_TONE } from "@/components/admin/branch/CrmSyncStrip"
import { buildCrmSyncSummary, type RevSyncCoverageView } from "@/lib/crm/rev-sync-health"

const stripPath = join(process.cwd(), "components/admin/branch/CrmSyncStrip.tsx")
const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")

// 2026-07-18 실측 감각(계정 2/234·행 385/5/13/367·매출 76,585/7,610,544·orphan 136·stale 98).
const LOW_FIXTURE: RevSyncCoverageView = {
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

describe("CrmSyncStrip — 낮음 상태 렌더 규약", () => {
  it("낮음 상태는 테라코타 톤(#B85C33 계열), 건강은 그린 — 파랑(#1E5DA8)은 어디에도 없음", () => {
    expect(CRM_SYNC_TONE.low.dot).toContain("#B85C33")
    expect(CRM_SYNC_TONE.low.bg).toContain("#FBEAE2")
    expect(CRM_SYNC_TONE.partial.dot).toContain("#A8741A")
    expect(CRM_SYNC_TONE.healthy.dot).toContain("#084734")
    for (const tone of Object.values(CRM_SYNC_TONE)) {
      expect(JSON.stringify(tone).toUpperCase()).not.toContain("1E5DA8")
    }
  })

  it("실측 감각 픽스처는 low 요약으로 접혀 헤드라인 수치가 나온다", () => {
    const summary = buildCrmSyncSummary(LOW_FIXTURE)
    expect(summary?.health).toBe("low")
    expect(summary?.accountConnected).toBe(2)
    expect(summary?.accountTotal).toBe(234)
    expect(summary?.rows.review).toBe(13)
  })

  it("펼침은 버튼+aria-expanded, 미연결 상위는 ?name= 딥링크, 과거 이력을 현재 액션으로 오인시키지 않는다", () => {
    const source = readFileSync(stripPath, "utf8")
    expect(source).toContain("aria-expanded={expanded}")
    expect(source).toContain("/admin/crm/matching?name=")
    expect(source).toContain("자동 재생성 대상 아님")
    expect(source).not.toContain("후보 재생성 권장")
    expect(source).toContain('href="/admin/crm/matching"')
    // "후보 재생성"은 실행 버튼이 아니라 링크여야 한다 — 이 컴포넌트에서 쓰기 요청 금지.
    expect(source).not.toContain('method: "POST"')
    expect(source).not.toContain("adminFetch(")
    // 확도 전용 파랑 금지(디자인 토큰 가드와 이중 방어).
    expect(source.toUpperCase()).not.toContain("1E5DA8")
  })

  it("장부 워크벤치에서 IntegrityStrip 바로 아래에 렌더된다", () => {
    const source = readFileSync(workbenchPath, "utf8")
    const integrityAt = source.indexOf("<IntegrityStrip refreshKey={refreshKey} />")
    // 라운드 4 최적화: 워크벤치가 커버리지를 주입한다(<CrmSyncStrip coverage={…} /> —
    // 이중 GET 제거). 위치 규약은 프리픽스 매칭으로 유지한다.
    const stripAt = source.indexOf("<CrmSyncStrip ")
    expect(integrityAt).toBeGreaterThan(-1)
    expect(stripAt).toBeGreaterThan(integrityAt)
    // 두 스트립 사이에 다른 섹션이 끼지 않는다(형제 인접 — 주석만 허용).
    const between = source.slice(integrityAt, stripAt)
    expect(between).not.toContain("<aside")
    expect(between).not.toContain("<section")
  })

  it("장부 워크벤치는 커버리지를 주입해 스트립 자체 fetch를 생략시킨다(이중 GET 제거)", () => {
    const source = readFileSync(workbenchPath, "utf8")
    expect(source).toContain("<CrmSyncStrip coverage={{ data: crmCoverage.data, loading: crmCoverage.loading, error: crmCoverage.error }} />")
    const strip = readFileSync(stripPath, "utf8")
    // 주입 모드에서는 effect가 자체 fetch를 건너뛴다.
    expect(strip).toContain("if (injected) return")
  })
})
