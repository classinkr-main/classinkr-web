import { describe, expect, it } from 'vitest'
import { buildChannelSettlementOverview } from '@/lib/branch/channel-settlement'
import { parseChannelSettlement, type SettlementCell, type SettlementGridRow } from '@/lib/branch/parsers/channel-settlement'
const cell = (value: string | number | null): SettlementCell => value === null ? {} : { effectiveValue: typeof value === 'number' ? { numberValue: value } : { stringValue: value } }
const head = ['EEO Account', 'UID', 'Partner', 'Service\nVersion', 'BD', 'Contract amount\n(RMB)', '원화 적용\n(KRW)', 'fee rate\n(%)', '수수료 지급액', 'payment date', 'settlement date', 'Note']
const record = (rmb: number | null, fee: number | null, date: string | null = '2026.09.01', settlement: string | null = null) => ['private account', 'private UID', 'Partner A', 'Business', 'former manager', rmb, null, 0.2, fee, date, settlement, null].map(cell)
const grid = (...rows: SettlementCell[][]): SettlementGridRow[] => [{ values: [] }, { values: head.map(cell) }, ...rows.map(values => ({ values }))]
describe('채널 정산 읽기 전용 파싱과 집계', () => {
  it('수식 유효값의 소수·음수·명시0·미입력과 고객 식별자 제외를 보존한다', () => {
    const row = record(2039, 407.8)
    row[8].formattedValue = '¥408'
    const parsed = parseChannelSettlement(grid(row, record(-2039, -407.8), record(0, null)))
    expect(parsed[0].feeAmountRmb).toBe(407.8)
    const result = buildChannelSettlementOverview(parsed, 'M', new Date('2026-09-01Z'), 'now')
    expect(result.totals).toMatchObject({ contracts: 3, contractAmountRmb: 0, contractAmountRmbCount: 3, feeAmountRmb: 0, feeAmountRmbCount: 2, contractAmountKrw: null, contractAmountKrwCount: 0, settlementDateMissing: 3 })
    expect(JSON.stringify(result)).not.toMatch(/private|former manager/)
  })
  it('빈 템플릿의 수수료 수식0은 계약으로 만들지 않는다', () => {
    const template: SettlementCell[] = []; template[8] = { effectiveValue: { numberValue: 0 }, userEnteredValue: { formulaValue: '=F99*H99' } }
    expect(parseChannelSettlement(grid(template))).toEqual([])
  })
  it('수식 오류·부분 헤더·모호한 금액·잘못된 날짜를 정상0으로 숨기지 않는다', () => {
    const broken = record(10, 2); broken[8] = { effectiveValue: { errorValue: { type: 'REF' } } }
    expect(() => parseChannelSettlement(grid(broken))).toThrow(/수식 오류/)
    const partial = grid(record(10, 2)); partial[1].values!.pop()
    expect(() => parseChannelSettlement(partial)).toThrow(/헤더/)
    const invalid = record(10, 2); invalid[5] = cell('TBD')
    expect(() => parseChannelSettlement(grid(invalid))).toThrow(/금액/)
    expect(() => parseChannelSettlement(grid(record(10, 2, '2026.02.30')))).toThrow(/날짜/)
  })
  it('FY와 분기 경계 및 결제일 미입력을 구분하고 정산일로 기간을 옮기지 않는다', () => {
    const records = parseChannelSettlement(grid(record(100, 20, '2026.03.31', '2026.04.01'), record(200, 40, '2026.04.01'), record(300, 60, '2027.03.31'), record(400, 80, '2027.04.01'), record(500, 100, null)))
    const fy = buildChannelSettlementOverview(records, 'Y', new Date('2026-10-15Z'), 'now')
    expect(fy.periodStart).toBe('2026-04-01'); expect(fy.periodEnd).toBe('2027-04-01')
    expect(fy.totals.contractAmountRmb).toBe(500)
    expect(fy.quality).toEqual({ totalSourceContracts: 5, missingPaymentDate: 1, excludedOutsidePeriod: 2 })
    const q4 = buildChannelSettlementOverview(records, 'Q', new Date('2027-02-15Z'), 'now')
    expect(q4.periodStart).toBe('2027-01-01'); expect(q4.periodEnd).toBe('2027-04-01'); expect(q4.totals.contracts).toBe(1)
  })
  it('시트 일련번호 날짜를 보존한다', () => {
    const row = record(100, 20); row[9] = cell(46266)
    expect(parseChannelSettlement(grid(row))[0].paymentDate).toBe('2026-09-01')
  })
})
