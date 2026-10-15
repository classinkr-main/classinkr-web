import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ChannelSettlementOverview, ChannelSettlementTotals } from "@/lib/branch/channel-settlement"
import type { BranchJsonState } from "@/components/admin/branch/client-api"
import type { Period } from "@/components/admin/branch/types"

const mocks = vi.hoisted(() => ({ resource: vi.fn(), chart: vi.fn() }))
vi.mock("@/components/admin/branch/client-api", () => ({ useBranchJson: mocks.resource }))
vi.mock("@/components/admin/viz/ComparisonBarChart", () => ({ ComparisonBarChart: (props: unknown) => { mocks.chart(props); return null } }))
import ChannelSettlementSection from "@/components/admin/branch/sections/ChannelSettlementSection"

function totals(fee: number | null): ChannelSettlementTotals {
  return { contracts: 1, contractAmountRmb: 25, contractAmountRmbCount: 1, contractAmountKrw: null, contractAmountKrwCount: 0, feeAmountRmb: fee, feeAmountRmbCount: fee == null ? 0 : 1, settlementDateEntered: 0, settlementDateMissing: 1 }
}
function fixture(): ChannelSettlementOverview {
  return {
    scope: "company-wide", currency: "CNY", dateBasis: "payment-date", period: "Y", periodStart: "2026-04-01", periodEnd: "2027-04-01",
    source: { kind: "live-sheet", sheetTitle: "3. 채널 정산", readAt: "2026-10-15T03:00:00.000Z" },
    totals: { ...totals(0), contracts: 4, contractAmountRmb: 100, contractAmountRmbCount: 4, feeAmountRmbCount: 3, settlementDateMissing: 4 },
    partners: [["환불 파트너", -10], ["양수 파트너", 10], ["영원 파트너", 0], ["미입력 파트너", null]].map(([partner, fee]) => ({ partner: partner as string, ...totals(fee as number | null) })),
    months: [-10, 10, 0, null].map((fee, i) => ({ month: `2026-0${i + 4}`, ...totals(fee) })),
    quality: { totalSourceContracts: 5, missingPaymentDate: 1, excludedOutsidePeriod: 0 }, caveats: [],
  }
}
function ready(data = fixture(), extra: Partial<BranchJsonState<ChannelSettlementOverview>> = {}) {
  mocks.resource.mockReturnValue({ key: "test", loading: false, error: null, data, stale: false, staleSince: null, ...extra })
}
const render = (period: Period = "Y") => renderToStaticMarkup(<ChannelSettlementSection period={period} selectedMonth="2026-09" refreshKey={7} />)

beforeEach(() => { vi.clearAllMocks(); ready() })

describe("파트너 정산 읽기 전용 요약", () => {
  it("상계 0·음수·미입력을 구분하고 월별 차트도 원값과 음수 축을 유지한다", () => {
    const html = render()
    expect(html).toContain("환불 파트너 수수료 계산액 ¥-10")
    expect(html).toContain("영원 파트너 수수료 계산액 ¥0")
    expect(html).toContain("수수료 금액 미입력")
    expect(html).not.toContain("미입력 파트너 수수료 계산액 ¥0")
    const props = mocks.chart.mock.calls[0][0]
    expect(props.data.map((row: { feeAmountRmb: number | null }) => row.feeAmountRmb)).toEqual([-10, 10, 0, null])
    expect(props.leftDomain).toEqual([-10, 10])
    expect(html).toContain("내역이 있는 결제 월")
    expect(html).toContain("2026-04 ~ 2027-03")
  })

  it("전사 범위·통화·지급 여부 한계를 표시하고 원화 미입력을 환산하지 않는다", () => {
    const html = render()
    expect(html).toContain("전사 정산 · 결제일 기준 · CNY · 팀 필터와 별도 범위")
    expect(html).toContain("매출에 합산하지 않음")
    expect(html).toContain("정산일 미입력")
    expect(html).toContain("정산일 공란만으로 미지급을 판단하지 않습니다")
    expect(html).toContain("미입력 · 임의 환산하지 않습니다")
    expect(html).not.toContain("₩")
    expect(html).toContain("결제일 미입력 1건은 기간을 판단할 수 없어 집계에서 제외")
    expect(html).toContain("원본 읽기 전용")
    expect(html).toContain("gid=658082117")
    expect(html).not.toContain("<input")
  })

  it("입력된 원화는 CNY와 분리해 그대로 표시한다", () => {
    const data = fixture()
    data.totals.contractAmountKrw = 123_456
    data.totals.contractAmountKrwCount = 1
    ready(data)
    const html = render()
    expect(html).toContain("₩123,456 · 원화 입력 1건, CNY와 별도 표시합니다")
    expect(html).toContain("¥100")
  })

  it("로딩·원천 오류·정상 빈 기간을 구분하고 오류를 0건으로 숨기지 않는다", () => {
    ready(fixture(), { data: null, loading: true })
    expect(render()).toContain("불러오는 중입니다")
    ready(fixture(), { data: null, error: "원천 확인 실패" })
    const failed = render()
    expect(failed).toContain('role="alert"')
    expect(failed).toContain("다시 불러오기")
    expect(failed).not.toContain("정산 내역이 없습니다")
    expect(failed).not.toContain("¥0")
    const data = fixture()
    data.totals = { ...totals(null), contracts: 0, contractAmountRmb: null, contractAmountRmbCount: 0, settlementDateMissing: 0 }
    data.partners = []; data.months = []
    ready(data)
    expect(render()).toContain("선택한 기간에 결제일이 있는 정산 내역이 없습니다")
    expect(mocks.chart).not.toHaveBeenCalled()
  })

  it("갱신 실패 시 이전 숫자와 조회 시각을 남기고 최신으로 표시하지 않는다", () => {
    ready(fixture(), { stale: true, staleSince: 1_000 })
    const html = render()
    expect(html).toContain("이전 조회 결과를 표시합니다")
    expect(html).toContain("¥100")
    expect(html).toContain("3. 채널 정산 · 조회")
  })

  it("월만 선택 월을 전달하고 분기·FY는 현재 기간을 요청하며 팀을 임의 귀속하지 않는다", () => {
    render("M")
    expect(mocks.resource).toHaveBeenLastCalledWith("/api/admin/branch/channel-settlement?period=M&month=2026-09", 7)
    render("Q")
    expect(mocks.resource).toHaveBeenLastCalledWith("/api/admin/branch/channel-settlement?period=Q", 7)
    render("Y")
    expect(mocks.resource).toHaveBeenLastCalledWith("/api/admin/branch/channel-settlement?period=Y", 7)
  })
})
