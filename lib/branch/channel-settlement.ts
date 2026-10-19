import { fiscalQuarter, fyOf } from './fiscal'
import { CHANNEL_SETTLEMENT_SHEET, type ChannelSettlementRecord } from './parsers/channel-settlement'
export interface ChannelSettlementTotals {
  contracts: number
  contractAmountRmb: number | null
  contractAmountRmbCount: number
  contractAmountKrw: number | null
  contractAmountKrwCount: number
  feeAmountRmb: number | null
  feeAmountRmbCount: number
  settlementDateEntered: number
  settlementDateMissing: number
}
export interface ChannelSettlementOverview {
  scope: 'company-wide'
  currency: 'CNY'
  dateBasis: 'payment-date'
  period: 'M' | 'Q' | 'Y'
  periodStart: string
  periodEnd: string
  source: { kind: 'live-sheet'; sheetTitle: string; readAt: string }
  totals: ChannelSettlementTotals
  partners: (ChannelSettlementTotals & { partner: string })[]
  months: (ChannelSettlementTotals & { month: string })[]
  quality: { totalSourceContracts: number; missingPaymentDate: number; excludedOutsidePeriod: number }
  caveats: string[]
}
function totals(rows: ChannelSettlementRecord[]): ChannelSettlementTotals {
  const sum = (field: 'contractAmountRmb' | 'contractAmountKrw' | 'feeAmountRmb') => {
    const values = rows.map(row => row[field]).filter((value): value is number => value !== null)
    return { count: values.length, amount: values.length ? Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100 : null }
  }
  const rmb = sum('contractAmountRmb'), krw = sum('contractAmountKrw'), fee = sum('feeAmountRmb')
  return { contracts: rows.length, contractAmountRmb: rmb.amount, contractAmountRmbCount: rmb.count, contractAmountKrw: krw.amount, contractAmountKrwCount: krw.count, feeAmountRmb: fee.amount, feeAmountRmbCount: fee.count, settlementDateEntered: rows.filter(row => row.settlementDate !== null).length, settlementDateMissing: rows.filter(row => row.settlementDate === null).length }
}
export function buildChannelSettlementOverview(records: ChannelSettlementRecord[], period: 'M' | 'Q' | 'Y', periodDate: Date, readAt: string): ChannelSettlementOverview {
  const fy = fyOf(periodDate)
  const start = period === 'Y' ? new Date(Date.UTC(fy, 3, 1)) : period === 'Q' ? new Date(Date.UTC(fy, 3 + (fiscalQuarter(periodDate.getUTCMonth() + 1) - 1) * 3, 1)) : new Date(Date.UTC(periodDate.getUTCFullYear(), periodDate.getUTCMonth(), 1))
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + (period === 'Y' ? 12 : period === 'Q' ? 3 : 1), 1))
  const periodStart = start.toISOString().slice(0, 10), periodEnd = end.toISOString().slice(0, 10)
  const selected = records.filter(row => row.paymentDate !== null && row.paymentDate >= periodStart && row.paymentDate < periodEnd)
  const group = (key: (row: ChannelSettlementRecord) => string) => {
    const groups = new Map<string, ChannelSettlementRecord[]>()
    for (const row of selected) { const value = key(row); groups.set(value, [...(groups.get(value) ?? []), row]) }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, rows]) => ({ label, ...totals(rows) }))
  }
  return {
    scope: 'company-wide', currency: 'CNY', dateBasis: 'payment-date', period, periodStart, periodEnd,
    source: { kind: 'live-sheet', sheetTitle: CHANNEL_SETTLEMENT_SHEET, readAt }, totals: totals(selected),
    partners: group(row => row.partner).map(({ label, ...value }) => ({ partner: label, ...value })),
    months: group(row => row.paymentDate!.slice(0, 7)).map(({ label, ...value }) => ({ month: label, ...value })),
    quality: { totalSourceContracts: records.length, missingPaymentDate: records.filter(row => row.paymentDate === null).length, excludedOutsidePeriod: records.filter(row => row.paymentDate !== null).length - selected.length },
    caveats: ['전사 채널 정산이며 팀·담당자 필터를 적용하지 않습니다.', '결제일 기준입니다. 정산일 공란은 미입력이며 미지급을 뜻하지 않습니다.', 'RMB(CNY)와 KRW를 환산하거나 매출·목표에 합산하지 않습니다.', '입력된 금액만 합산하며 미입력은 0과 구분합니다.'],
  }
}
