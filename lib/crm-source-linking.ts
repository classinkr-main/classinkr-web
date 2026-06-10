export interface BranchRevSourceRecord {
  sheet_row: number
  customer_name: string
  first_payment: string | null
  contract_target: number | null
}

export function normalizeCrmName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/주식회사|유한회사|\(주\)|㈜|학원|어학원|캠퍼스|센터|본원|분원/g, "")
    .replace(/[()（）\[\]{}·._-]/g, "")
}

export function getBranchRevSourceRecordKey(deal: BranchRevSourceRecord) {
  const normalizedName = normalizeCrmName(deal.customer_name) || "unknown"
  const firstPayment = deal.first_payment ?? "no-first-payment"
  const targetAmount = Math.round(Number(deal.contract_target ?? 0))
  return `rev:${deal.sheet_row}:${normalizedName}:${firstPayment}:${targetAmount}`
}

export function scoreCrmNameMatch(sourceName: string, targetName: string) {
  const source = normalizeCrmName(sourceName)
  const target = normalizeCrmName(targetName)

  if (!source || !target) return 0
  if (source === target) return 0.96
  if (source.length >= 3 && target.includes(source)) return 0.9
  if (target.length >= 3 && source.includes(target)) return 0.86

  const sourceChars = new Set(Array.from(source))
  const targetChars = new Set(Array.from(target))
  const overlap = Array.from(sourceChars).filter((char) => targetChars.has(char)).length
  const union = new Set([...sourceChars, ...targetChars]).size

  return union === 0 ? 0 : overlap / union
}
