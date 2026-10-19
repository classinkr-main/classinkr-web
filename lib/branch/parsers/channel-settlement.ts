/** Only effective values are authoritative: formatted currency is often rounded. */
export interface SettlementCell {
  effectiveValue?: { stringValue?: string | null; numberValue?: number | null; errorValue?: unknown } | null
  formattedValue?: string | null
  userEnteredValue?: { formulaValue?: string | null } | null
}
export interface SettlementGridRow { values?: SettlementCell[] | null }
export interface ChannelSettlementRecord {
  partner: string
  contractAmountRmb: number | null
  contractAmountKrw: number | null
  feeAmountRmb: number | null
  paymentDate: string | null
  settlementDate: string | null
}
export const CHANNEL_SETTLEMENT_SHEET = '3. 채널 정산'
const HEADERS = ['EEO Account', 'UID', 'Partner', 'Service Version', 'BD', 'Contract amount (RMB)', '원화 적용 (KRW)', 'fee rate (%)', '수수료 지급액', 'payment date', 'settlement date', 'Note']
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
function text(cell: SettlementCell | undefined): string {
  if (cell?.effectiveValue?.errorValue != null) throw new Error('채널 정산 시트에 수식 오류가 있습니다.')
  return String(cell?.effectiveValue?.stringValue ?? cell?.effectiveValue?.numberValue ?? cell?.formattedValue ?? '').trim()
}
function money(cell: SettlementCell | undefined): number | null {
  const raw = text(cell)
  if (!raw) return null
  const effective = cell?.effectiveValue?.numberValue
  if (effective != null && Number.isFinite(effective)) return effective
  const cleaned = raw.replace(/[,\s¥￥₩]/g, '')
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(cleaned)) throw new Error('채널 정산 금액 형식을 확인해 주세요.')
  const value = Number(cleaned)
  if (!Number.isFinite(value)) throw new Error('채널 정산 금액 형식을 확인해 주세요.')
  return value
}
function date(cell: SettlementCell | undefined): string | null {
  const raw = text(cell)
  if (!raw) return null
  let iso: string
  if (cell?.effectiveValue?.numberValue != null) {
    const value = cell.effectiveValue.numberValue
    if (!Number.isInteger(value) || value < 1 || value > 2958465) throw new Error('채널 정산 날짜 형식을 확인해 주세요.')
    iso = new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10)
  } else {
    const parts = raw.match(/^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\.?$/)
    if (!parts) throw new Error('채널 정산 날짜 형식을 확인해 주세요.')
    iso = `${parts[1]}-${parts[2].padStart(2, '0')}-${parts[3].padStart(2, '0')}`
  }
  const parsed = new Date(`${iso}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) throw new Error('채널 정산 날짜 형식을 확인해 주세요.')
  return iso
}
export function parseChannelSettlement(grid: SettlementGridRow[]): ChannelSettlementRecord[] {
  const header = grid[1]?.values
  if (!header || !HEADERS.every((expected, index) => normalize(text(header[index])) === expected)) {
    throw new Error('채널 정산 시트 헤더가 불완전하거나 변경됐습니다.')
  }
  const records: ChannelSettlementRecord[] = []
  for (const row of grid.slice(2)) {
    const cells = row.values ?? []
    // A template fee formula can return zero on otherwise unused rows.
    const hasRecord = cells.slice(0, 12).some((cell, index) => index !== 8 && text(cell) !== '')
    if (!hasRecord) {
      text(cells[8]) // A formula error must never become an apparently valid empty result.
      if ((money(cells[8]) ?? 0) !== 0) throw new Error('채널 정산에 계약 정보가 없는 수수료가 있습니다.')
      continue
    }
    const partner = text(cells[2])
    if (!partner) throw new Error('채널 정산 파트너가 누락됐습니다.')
    records.push({ partner, contractAmountRmb: money(cells[5]), contractAmountKrw: money(cells[6]), feeAmountRmb: money(cells[8]), paymentDate: date(cells[9]), settlementDate: date(cells[10]) })
  }
  return records
}
