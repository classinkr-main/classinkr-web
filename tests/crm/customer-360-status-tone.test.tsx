import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { SEVERITY_CLASS, SERVICE_RISK_CLASS as DETAIL_SERVICE_RISK_CLASS, TASK_PRIORITY_CLASS } from "@/components/admin/crm/Customer360DetailShared"
import { SERVICE_RISK_CLASS as DRAWER_SERVICE_RISK_CLASS, formatClock } from "@/components/admin/crm/drawer/shared"
import DrawerDealsSection from "@/components/admin/crm/drawer/DrawerDealsSection"
import { HEALTH_BAND_STYLE } from "@/lib/crm/customer-health"
import { STATUS_TONE, STATUS_TONE_CLASS } from "@/lib/crm/status-tone"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"
import type { CrmDealRecord } from "@/lib/repositories/crm-deals"

// c360-07 — 위험·경고 상태색이 DESIGN.md 팔레트 밖(#B85C33 계열)이고 '주의/주시'가 성공 녹색으로 그려지던 결함.
// 세 정의 파일이 모두 lib/crm/status-tone.ts 토큰만 쓰는지, 경고 단계가 warning인지 고정한다.

describe("c360-07 상태색 토큰 치환", () => {
  it("SEVERITY_CLASS: critical→danger, high/medium→warning (medium은 더 이상 녹색이 아니다)", () => {
    expect(SEVERITY_CLASS.critical).toBe(STATUS_TONE_CLASS.danger)
    expect(SEVERITY_CLASS.high).toBe(STATUS_TONE_CLASS.warning)
    expect(SEVERITY_CLASS.medium).toBe(STATUS_TONE_CLASS.warning)
    expect(SEVERITY_CLASS.medium).not.toContain("#ECFDF5")
  })

  it("SERVICE_RISK_CLASS(드로어·상세 동일): urgent→danger, soon/watch→warning", () => {
    for (const map of [DRAWER_SERVICE_RISK_CLASS, DETAIL_SERVICE_RISK_CLASS]) {
      expect(map.urgent).toBe(STATUS_TONE_CLASS.danger)
      expect(map.soon).toBe(STATUS_TONE_CLASS.warning)
      expect(map.watch).toBe(STATUS_TONE_CLASS.warning)
      expect(map.watch).not.toContain("#084734")
    }
    expect(TASK_PRIORITY_CLASS.urgent).toBe(STATUS_TONE_CLASS.danger)
    expect(TASK_PRIORITY_CLASS.high).toBe(STATUS_TONE_CLASS.warning)
  })

  it("HEALTH_BAND_STYLE은 hex 토큰과 동기화된다(safe→ok, watch→warning, risk→danger)", () => {
    expect(HEALTH_BAND_STYLE.safe).toEqual({ fc: STATUS_TONE.ok.text, bg: STATUS_TONE.ok.bg, bd: STATUS_TONE.ok.border })
    expect(HEALTH_BAND_STYLE.watch).toEqual({ fc: STATUS_TONE.warning.textStrong, bg: STATUS_TONE.warning.bg, bd: STATUS_TONE.warning.border })
    expect(HEALTH_BAND_STYLE.risk).toEqual({ fc: STATUS_TONE.danger.text, bg: STATUS_TONE.danger.bg, bd: STATUS_TONE.danger.border })
  })

  it("세 정의 파일 어디에도 은퇴한 #B85C33/#FEF3EE/#F6D5C5 리터럴이 없다", () => {
    const all = JSON.stringify({ SEVERITY_CLASS, DETAIL_SERVICE_RISK_CLASS, DRAWER_SERVICE_RISK_CLASS, TASK_PRIORITY_CLASS, HEALTH_BAND_STYLE })
    expect(all).not.toContain("#B85C33")
    expect(all).not.toContain("#FEF3EE")
    expect(all).not.toContain("#F6D5C5")
  })

  it("formatClock은 HH:MM을 만들고 값이 없거나 깨지면 '—'(확인 불가)를 돌린다", () => {
    expect(formatClock(null)).toBe("—")
    expect(formatClock("not-a-date")).toBe("—")
    expect(formatClock("2026-09-15T03:02:00.000Z")).toMatch(/^\d{2}:\d{2}$/)
  })
})

function makeDeal(overrides: Partial<CrmDealRecord> = {}): CrmDealRecord {
  return {
    id: "deal-1",
    targetType: "lead",
    targetId: "lead-1",
    targetLabel: "테스트 학원",
    ownerKey: null,
    ownerNameSnapshot: null,
    title: "테스트 딜",
    stage: "consult",
    status: "open",
    expectedAmount: 1_000_000,
    expectedCloseAt: null,
    nextTaskId: null,
    quoteRef: null,
    orderRef: null,
    riskNote: null,
    createdBy: null,
    closedAt: null,
    closedBy: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  }
}

function make360(deals: CrmDealRecord[]): Customer360 {
  return {
    deals: {
      generatedAt: "2026-09-10T00:00:00.000Z",
      health: { ok: true, message: null },
      summary: { total: deals.length, returned: deals.length, open: 0, won: 0, lost: 0, openAmount: 0, noNextActionCount: 0, aggregateTruncated: false },
      rows: deals,
    },
  } as unknown as Customer360
}

const noop = () => undefined

// c360-03/08 — 딜 행 인라인 저장 상태(SaveStateCaption)와 실패 재시도, 종료 딜 배지의 danger 토큰.
describe("DrawerDealsSection 인라인 저장 상태", () => {
  it("open 딜은 항상 마운트된 저장 캡션(aria-describedby 연결)을 갖고, failed면 재시도 버튼을 그린다", () => {
    const data = make360([makeDeal({ id: "d1" }), makeDeal({ id: "d2", status: "lost", stage: "lost" })])
    const html = renderToStaticMarkup(
      <DrawerDealsSection
        data={data}
        actingId={null}
        dealFormOpen={false}
        onDealFormOpenChange={noop}
        dealTitle=""
        onDealTitleChange={noop}
        dealAmount={null}
        onDealAmountChange={noop}
        dealStage="consult"
        onDealStageChange={noop}
        onAddDeal={noop}
        onDealStage={noop}
        onDealAmountCommit={noop}
        dealSave={{ d1: { state: "failed", onRetry: noop } }}
      />
    )
    expect(html).toContain('aria-describedby="c360-deal-save-d1"')
    expect(html).toContain('id="c360-deal-save-d1"')
    expect(html).toContain('data-state="failed"')
    expect(html).toContain("이전 값으로 되돌림")
    expect(html).toContain(">다시 시도</button>")
    // 종료(lost) 딜은 캡션 없음 + 배지는 danger 토큰(이 섹션이 소유한 마크업 기준 —
    // AdminMoneyInput 내부의 오류 캡션 색은 공용 컴포넌트 소관이라 여기서 단정하지 않는다).
    expect(html).not.toContain('id="c360-deal-save-d2"')
    const lostBadge = html.match(/<span class="([^"]*)">실패<\/span>/)
    expect(lostBadge?.[1]).toContain(STATUS_TONE_CLASS.danger)
    expect(lostBadge?.[1]).not.toContain("#B85C33")
  })

  it("저장 중인 딜 행의 단계 select는 disabled + aria-busy로 연타를 막는다", () => {
    const html = renderToStaticMarkup(
      <DrawerDealsSection
        data={make360([makeDeal({ id: "d1" })])}
        actingId="deal:d1"
        dealFormOpen={false}
        onDealFormOpenChange={noop}
        dealTitle=""
        onDealTitleChange={noop}
        dealAmount={null}
        onDealAmountChange={noop}
        dealStage="consult"
        onDealStageChange={noop}
        onAddDeal={noop}
        onDealStage={noop}
        onDealAmountCommit={noop}
        dealSave={{ d1: { state: "saving" } }}
      />
    )
    expect(html).toMatch(/<select[^>]*disabled=""[^>]*aria-busy="true"|<select[^>]*aria-busy="true"[^>]*disabled=""/)
    expect(html).toContain('data-state="saving"')
  })
})
