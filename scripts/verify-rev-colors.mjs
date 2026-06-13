// 검증 스크립트(읽기 전용): 실제 REV 시트를 새 파서 로직(월 블록 + 주차 칸 글자색)으로 분해해
// 월별 확정(빨강)/임박(파랑)/예상 금액이 그럴듯하게 나오는지 확인한다.
// lib/branch/parsers/rev.ts의 분류 로직과 동일한 식을 사용한다.
// 실행: node --env-file=.env.local scripts/verify-rev-colors.mjs
import { google } from "googleapis"

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
})
const sheets = google.sheets({ version: "v4", auth })

// lib/branch/google-sheets.ts와 동일한 판별식
const isRedBg = (bg) => !!bg && (bg.red ?? 0) >= 0.85 && (bg.green ?? 0) < 0.5 && (bg.blue ?? 0) < 0.5
const isRedText = (fg) => !!fg && (fg.red ?? 0) >= 0.75 && (fg.green ?? 0) <= 0.3 && (fg.blue ?? 0) <= 0.3
const isBlueText = (fg) =>
  !!fg && (fg.blue ?? 0) >= 0.5 && (fg.blue ?? 0) - (fg.red ?? 0) >= 0.25 && (fg.blue ?? 0) - (fg.green ?? 0) >= 0.15

const asNumber = (v) => {
  if (v == null || v === "") return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  const cleaned = String(v).replace(/[¥₩$€£,\s]/g, "")
  if (cleaned === "" || cleaned === "-") return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

const sheetId = process.env.GOOGLE_BRANCH_DASHBOARD_SHEET_ID
if (!sheetId) { console.error("GOOGLE_BRANCH_DASHBOARD_SHEET_ID missing"); process.exit(1) }

const res = await sheets.spreadsheets.get({
  spreadsheetId: sheetId,
  ranges: ["'2. REV'!A1:CF400"],
  includeGridData: true,
  fields:
    "sheets.data.rowData.values(formattedValue,effectiveFormat.backgroundColor,effectiveFormat.textFormat.foregroundColor,userEnteredValue)",
})

const grid = (res.data.sheets?.[0]?.data?.[0]?.rowData ?? []).map((row) =>
  (row.values ?? []).map((cell) => ({
    value: cell.formattedValue ?? cell.userEnteredValue?.stringValue ?? cell.userEnteredValue?.numberValue ?? null,
    bg: cell.effectiveFormat?.backgroundColor ?? null,
    fg: cell.effectiveFormat?.textFormat?.foregroundColor ?? null,
  }))
)

// parsers/rev.ts와 동일한 월 블록 구성 (refFy는 회계연도: 4월 시작)
const now = new Date()
const refFy = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1
const headers = grid[1] ?? []
const monthBlocks = []
for (let i = 13; i < headers.length; i++) {
  const s = String(headers[i]?.value ?? "").trim()
  if (/^([1-9]|1[0-2])$/.test(s)) {
    const month = parseInt(s, 10)
    const year = month >= 4 ? refFy : refFy + 1
    monthBlocks.push({ ym: `${year}-${String(month).padStart(2, "0")}`, totalIdx: i, weekIdxs: [] })
  } else if (/^(w\d|\dw)$/i.test(s) && monthBlocks.length > 0) {
    monthBlocks[monthBlocks.length - 1].weekIdxs.push(i)
  }
}

const perMonth = new Map() // ym -> {total, confirmed, high, expected, rowsNoTotalButWeeks}
let rows = 0
let mismatches = 0
for (let r = 2; r < grid.length; r++) {
  const row = grid[r] ?? []
  if (!String(row[0]?.value ?? "").trim()) continue
  rows++
  for (const block of monthBlocks) {
    const totalCell = row[block.totalIdx]
    const total = asNumber(totalCell?.value)
    let weekSum = 0, confirmed = 0, high = 0
    for (const wi of block.weekIdxs) {
      const cell = row[wi]; if (!cell) continue
      const n = asNumber(cell.value)
      if (n == null || n === 0) continue
      weekSum += n
      if (isRedText(cell.fg) || isRedBg(cell.bg)) confirmed += n
      else if (isBlueText(cell.fg)) high += n
    }
    const monthTotal = total ?? (weekSum !== 0 ? weekSum : null)
    if (monthTotal == null || monthTotal === 0) continue
    if (totalCell && (isRedText(totalCell.fg) || isRedBg(totalCell.bg))) confirmed = Math.max(confirmed, monthTotal)
    else if (totalCell && isBlueText(totalCell.fg) && confirmed === 0) high = Math.max(high, monthTotal)
    if (total != null && weekSum !== 0 && Math.abs(total - weekSum) > 1) mismatches++
    const agg = perMonth.get(block.ym) ?? { total: 0, confirmed: 0, high: 0, expected: 0 }
    agg.total += monthTotal
    agg.confirmed += Math.min(confirmed, monthTotal)
    const highClamped = Math.min(Math.max(0, monthTotal - confirmed), high)
    agg.high += highClamped
    agg.expected += Math.max(0, monthTotal - Math.min(confirmed, monthTotal) - highClamped)
    perMonth.set(block.ym, agg)
  }
}

const fmt = (n) => Math.round(n).toLocaleString("en-US").padStart(12)
console.log(`rows: ${rows} | month blocks: ${monthBlocks.length} (weeks per block: ${monthBlocks.map((b) => b.weekIdxs.length).join(",")})`)
console.log(`month-total vs week-sum mismatches (>±1): ${mismatches}`)
console.log("\n  month     |       total |   confirmed |   high(90%) |    expected")
for (const [ym, v] of [...perMonth.entries()].sort()) {
  console.log(`  ${ym}  |${fmt(v.total)} |${fmt(v.confirmed)} |${fmt(v.high)} |${fmt(v.expected)}`)
}
