import type { HwInboundParsed, HwOutboundParsed } from "@/lib/branch/parsers/hw"

/**
 * Parser for the per-lot "Hardware Ledger - Korea v1" workbook (file-upload import path).
 *
 * The real ops ledger is organized PER LOT: one tab per import lot (H1, H3, H4, …),
 * each tab holding its own INBOUND block (cost, USD+CNY) on top and OUTBOUND block
 * (revenue, customer, manager, serials, type) below — plus SampleDeptQA (sample/A-S)
 * and 과사람 (a dedicated guarantee account). This is a completely different shape from
 * the old 4-tab Google Sheet the live sync reads (lib/branch/parsers/hw.ts).
 *
 * Rather than reinvent the DB write path, this parser ADAPTS the rich per-lot data into
 * the EXISTING staging shapes (HwInboundParsed / HwOutboundParsed). Everything downstream
 * — replace_branch_hw_*, importHardwareFromBranchSheets, snapshot/RPC, dashboard — is
 * reused unchanged. Extra signals that the staging columns can't hold (CNY, reconciliation,
 * promotion/branch flags) ride along in each row's `raw`.
 */

export type LedgerCell = string | number | boolean | Date | null
export type LedgerGrid = LedgerCell[][]
export interface LedgerWorkbook {
  sheets: Record<string, LedgerGrid>
}

export interface LedgerParseResult {
  inbound: HwInboundParsed[]
  outbound: HwOutboundParsed[]
  warnings: string[]
  stats: {
    lots: string[]
    inboundRows: number
    outboundRows: number
    byType: Record<string, number>
    byLot: Record<string, { inbound: number; outbound: number }>
  }
}

/* ── cell helpers ─────────────────────────────────────────────────────────── */

function str(v: LedgerCell): string | null {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const t = String(v).replace(/\s+/g, " ").trim()
  return t.length ? t : null
}

function num(v: LedgerCell): number | null {
  if (v == null || v === "") return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  const cleaned = String(v).replace(/[¥₩$€£,\s]/g, "")
  if (cleaned === "" || cleaned === "-") return null
  const x = Number(cleaned)
  return Number.isFinite(x) ? x : null
}

// Inbound `Date` cells are real Excel datetimes; outbound dates are strings that are
// either dotted (2025.01.31 / 2025-01-31) or fuzzy Korean (3월초, 4월 중) → return null
// for the latter but preserve the raw string separately.
function toDate(v: LedgerCell): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const t = str(v)
  if (!t) return null
  const m = t.match(/(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null
}

// Serials are newline-delimited within one cell, aligned 1:1 to quantity.
function splitSerials(v: LedgerCell): string[] {
  const t = v == null ? "" : String(v)
  return t
    .split(/[\r\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// The app's items use `86" IFP` / `STD1(promoted)`; the ledger writes `86'' IFP` /
// `STD1 (Promoted)`. Normalize to the app's naming so ensureHardwareItems matches
// existing items instead of creating duplicates.
export function normalizeLedgerProduct(product: string): string {
  let t = product.replace(/''/g, '"').replace(/[“”]/g, '"').replace(/\s+/g, " ").trim()
  t = t.replace(/\s*\(\s*promoted\s*\)/i, "(promoted)")
  return t
}

function isPromoted(product: string): boolean {
  return /\(promoted\)/i.test(product)
}

// Per-lot / 과사람 outbound sale type. A/S is NOT derived here (it only comes from the
// SampleDeptQA QA block); per-lot remarks like "고장 T1 교체" are sales with a note.
function deriveSaleType(product: string, sheetType: string | null, amountUsd: number | null, remarks: string | null): string {
  const t = (sheetType ?? "").trim()
  if (/sample/i.test(t)) return "Sample"
  if (/promotion/i.test(t)) return "Promotion"
  if (isPromoted(product)) return "Promotion"
  if ((amountUsd == null || amountUsd === 0) && /증정|프로모션/.test(remarks ?? "")) return "Promotion"
  return t || "Sales"
}

/* ── header detection ─────────────────────────────────────────────────────── */

function rowHas(row: LedgerGrid[number], ...needles: string[]): boolean {
  const joined = row.map((c) => str(c) ?? "").join(" ").toLowerCase()
  return needles.every((needle) => joined.includes(needle.toLowerCase()))
}

/* ── per-lot sheet (H1, H3, H4, H5, H6, H8) ───────────────────────────────── */

function parseLotSheet(lot: string, grid: LedgerGrid, warnings: string[]): { inbound: HwInboundParsed[]; outbound: HwOutboundParsed[] } {
  const inbound: HwInboundParsed[] = []
  const outbound: HwOutboundParsed[] = []

  const inboundHeader = grid.findIndex((row) => rowHas(row, "importer") && rowHas(row, "product") && rowHas(row, "quantity"))
  const outboundHeader = grid.findIndex((row) => rowHas(row, "manager") && (rowHas(row, "destination") || rowHas(row, "type")))
  if (inboundHeader === -1 || outboundHeader === -1) {
    warnings.push(`${lot}: 입고/출고 헤더를 찾지 못해 건너뜀`)
    return { inbound, outbound }
  }

  // INBOUND block: header+1 .. outboundHeader
  let importer: string | null = null
  for (let r = inboundHeader + 1; r < outboundHeader; r++) {
    const row = grid[r] ?? []
    const product = str(row[3])
    if (!product) continue
    const rowImporter = str(row[1])
    if (rowImporter) importer = rowImporter
    const qty = num(row[4]) ?? 0
    const unitPrice = num(row[5])
    const amountUsd = num(row[6])
    const amountCny = num(row[7])
    const deliveredQty = num(row[10])
    const instorageDelta = num(row[11])
    inbound.push({
      logistics_no: lot,
      inbound_date: toDate(row[2]),
      product: normalizeLedgerProduct(product),
      quantity: qty,
      unit_price: unitPrice,
      amount: amountUsd,
      serials: [],
      storage: "오산 창고",
      importer: importer ?? "Hecto Financial",
      remarks: str(row[8]),
      raw: {
        source: "ledger_lot_inbound",
        lot,
        amount_usd: amountUsd,
        unit_price: unitPrice,
        importer: importer ?? "Hecto Financial",
        amount_cny: amountCny,
        delivered_qty: deliveredQty,
        instorage_delta: instorageDelta,
        is_promoted: isPromoted(product),
      },
    })
  }

  // OUTBOUND block: header+1 .. end. Group boundary = Manager (col 2) present.
  let manager: string | null = null
  let dateRaw: string | null = null
  let destination: string | null = null
  let sheetType: string | null = null
  for (let r = outboundHeader + 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    if (row.every((c) => str(c) == null)) {
      // blank separator — reset the group context
      manager = dateRaw = destination = sheetType = null
      continue
    }
    const product = str(row[3])
    if (!product) continue
    // A new group starts when Manager is present; sub-rows inherit context.
    const rowManager = str(row[2])
    if (rowManager) {
      manager = rowManager
      dateRaw = str(row[9])
      destination = str(row[10])
      sheetType = str(row[11])
    }
    const remarks = str(row[12])
    const amountUsd = num(row[6])
    const amountCny = num(row[7])
    const saleType = deriveSaleType(product, sheetType, amountUsd, remarks)
    outbound.push({
      logistics_no: lot,
      outbound_date: toDate(dateRaw),
      owner: manager,
      product: normalizeLedgerProduct(product),
      quantity: num(row[4]) ?? 0,
      revenue: amountUsd,
      destination,
      serials: splitSerials(row[8]),
      progress: /^h8$/i.test(lot) ? "배송 예정" : null,
      type: saleType,
      remarks,
      raw: {
        source: "ledger_lot_outbound",
        lot,
        amount_usd: amountUsd,
        amount_cny: amountCny,
        unit_price: num(row[5]),
        outbound_date_raw: dateRaw,
        is_date_approximate: Boolean(dateRaw) && toDate(dateRaw) == null,
        is_promoted: isPromoted(product),
        group_no: str(row[1]),
      },
    })
  }

  return { inbound, outbound }
}

/* ── SampleDeptQA (Sample loaners + QA A/S) ───────────────────────────────── */

function parseSampleDeptQa(grid: LedgerGrid): HwOutboundParsed[] {
  const out: HwOutboundParsed[] = []
  // Section markers live in col 1: "Sample", "Debt", "QA".
  // NOTE: the Sample block is intentionally NOT parsed here — those sample rows
  // are largely a consolidated duplicate of the per-lot sheets' own Sample rows,
  // so importing both double-counts. Only the QA (A/S) block is unique to this
  // sheet, so we take only that. (Dedicated-only samples → v1.1 with dedup.)
  const markerAt = (label: string) => grid.findIndex((row) => (str(row[1]) ?? "").toLowerCase() === label.toLowerCase())
  const qaHdr = markerAt("QA")

  // QA block (A/S): Manager(2) | Destination(3) | Product(4) | Qty(5) | Date(6) | Fault(7) | Action(8)
  if (qaHdr !== -1) {
    for (let r = qaHdr + 1; r < grid.length; r++) {
      const row = grid[r] ?? []
      const product = str(row[4])
      if (!product) continue
      const manager = str(row[2])
      const destination = str(row[3])
      const fault = str(row[7])
      const action = str(row[8])
      const note = [fault, action].filter(Boolean).join(" → ")
      out.push({
        logistics_no: null,
        outbound_date: toDate(row[6]),
        owner: manager,
        product: normalizeLedgerProduct(product),
        quantity: num(row[5]) ?? 0,
        revenue: null,
        destination,
        serials: [],
        progress: null,
        type: "A/S",
        remarks: note || null,
        raw: { source: "ledger_qa", fault, action, outbound_date_raw: str(row[6]) },
      })
    }
  }

  return out
}

/* ── 과사람 (dedicated guarantee account) ─────────────────────────────────── */

function parseGwasaram(grid: LedgerGrid): { inbound: HwInboundParsed[]; outbound: HwOutboundParsed[] } {
  const inbound: HwInboundParsed[] = []
  const outbound: HwOutboundParsed[] = []
  const inboundHeader = grid.findIndex((row) => rowHas(row, "importer") && rowHas(row, "product"))
  const outboundHeader = grid.findIndex((row, i) => i > inboundHeader && rowHas(row, "manager") && rowHas(row, "product"))
  if (inboundHeader === -1) return { inbound, outbound }

  // Inbound: Importer(1) | Date(2) | Product(3) | Qty(4) | Unit(5) | Amount$(6) | Amount¥(7)
  let importer: string | null = null
  const inboundEnd = outboundHeader !== -1 ? outboundHeader : grid.length
  for (let r = inboundHeader + 1; r < inboundEnd; r++) {
    const row = grid[r] ?? []
    const product = str(row[3])
    if (!product) continue
    const rowImporter = str(row[1])
    if (rowImporter) importer = rowImporter
    inbound.push({
      logistics_no: "과사람",
      inbound_date: toDate(row[2]),
      product: normalizeLedgerProduct(product),
      quantity: num(row[4]) ?? 0,
      unit_price: num(row[5]),
      amount: num(row[6]),
      serials: [],
      storage: "오산 창고",
      importer: importer ?? "Hecto Financial",
      remarks: str(row[9]),
      raw: {
        source: "ledger_gwasaram_inbound",
        amount_usd: num(row[6]),
        unit_price: num(row[5]),
        importer: importer ?? "Hecto Financial",
        amount_cny: num(row[7]),
      },
    })
  }

  // Outbound: #(1) | Manager(2) | Product(3) | Qty(4) | Unit(5) | Amount$(6) | Amount¥(7) | Serial(8) | Date(9) | 비고(10)
  if (outboundHeader !== -1) {
    let product = "86\" IFP"
    for (let r = outboundHeader + 1; r < grid.length; r++) {
      const row = grid[r] ?? []
      const qty = num(row[4])
      if (qty == null || qty === 0) continue
      const rowProduct = str(row[3])
      if (rowProduct) product = normalizeLedgerProduct(rowProduct)
      const branch = str(row[10])
      outbound.push({
        logistics_no: null,
        outbound_date: toDate(row[9]),
        owner: str(row[2]) ?? "Wangchan",
        product,
        quantity: qty,
        revenue: num(row[6]),
        destination: branch ? `과사람 ${branch}` : "과사람",
        serials: splitSerials(row[8]),
        progress: null,
        type: "Sales",
        remarks: branch,
        raw: { source: "ledger_gwasaram_outbound", amount_usd: num(row[6]), amount_cny: num(row[7]), account: "과사람", branch },
      })
    }
  }

  return { inbound, outbound }
}

/* ── entry point ──────────────────────────────────────────────────────────── */

export function parseLedgerWorkbook(wb: LedgerWorkbook): LedgerParseResult {
  const inbound: HwInboundParsed[] = []
  const outbound: HwOutboundParsed[] = []
  const warnings: string[] = []
  const byLot: Record<string, { inbound: number; outbound: number }> = {}

  const lotNames = Object.keys(wb.sheets)
    .filter((name) => /^H\d+$/i.test(name.trim()))
    .sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")))

  for (const lot of lotNames) {
    const { inbound: li, outbound: lo } = parseLotSheet(lot, wb.sheets[lot], warnings)
    inbound.push(...li)
    outbound.push(...lo)
    byLot[lot] = { inbound: li.length, outbound: lo.length }
  }

  // SampleDeptQA
  const sampleSheet = Object.keys(wb.sheets).find((name) => /sampledeptqa/i.test(name.replace(/\s+/g, "")))
  if (sampleSheet) {
    const rows = parseSampleDeptQa(wb.sheets[sampleSheet])
    outbound.push(...rows)
    byLot["SampleDeptQA"] = { inbound: 0, outbound: rows.length }
  }

  // 과사람
  const gwasaramSheet = Object.keys(wb.sheets).find((name) => name.trim() === "과사람")
  if (gwasaramSheet) {
    const { inbound: gi, outbound: go } = parseGwasaram(wb.sheets[gwasaramSheet])
    inbound.push(...gi)
    outbound.push(...go)
    byLot["과사람"] = { inbound: gi.length, outbound: go.length }
  }

  const byType: Record<string, number> = {}
  for (const row of outbound) byType[row.type ?? "Sales"] = (byType[row.type ?? "Sales"] ?? 0) + 1

  return {
    inbound,
    outbound,
    warnings,
    stats: { lots: lotNames, inboundRows: inbound.length, outboundRows: outbound.length, byType, byLot },
  }
}
