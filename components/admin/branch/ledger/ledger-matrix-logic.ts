// 장부 기본 보기(A-2 매트릭스) 순수 로직 — 잎(열) 목록·주차 확도·줄 집계·필터·정렬. React·DOM 없음.
// 확도 분해는 rowMonthBucket(캐논 ledgerMonthSplit)만 쓴다. 주차는 월 집계와 모순되지 않게만 나눈다.
import { normalizedAccountKey } from "@/lib/branch/account-key"
import { branchManagerLabel } from "@/lib/branch/personal-scope"
import type { LedgerCellEditApi } from "./LedgerSimpleEdit"
import { channelLabel, contractLabel, groupLabel, productLabel, type SimpleGroupBy } from "./ledger-simple-logic"
import {
  rowMonthAmount,
  rowWeeklyMismatch,
  rowWeeklySplit,
  weeklyConfidenceFromMetadata,
  type DraftConfidence,
  type LedgerRevenueRow,
  type RevMonthlyBucket,
} from "./shared"
import { addMonthlyBucket, emptyMonthlyBucket, rowMonthBucket } from "./workbench-shared"

export const MATRIX_WIDTH = { customer: 232, product: 44, region: 52, contract: 48, channel: 48, manager: 72, fy: 88, month: 72, monthTotal: 84, week: 58 } as const
export const MATRIX_FROZEN_WIDTH = MATRIX_WIDTH.customer + MATRIX_WIDTH.product // 276

/** 지난달 고정은 이번 달 바로 앞 달 4개까지만(회계연도 4월 시작이면 지난달이 최대 11개). */
export const MATRIX_PINNED_PAST_MONTHS = 4

export interface MatrixLeaf {
  key: string
  kind: "fy" | "month" | "month-total" | "week"
  month: string | null
  week: number | null
  label: string
  width: number
  start: boolean
  past: boolean
  currentMonth: boolean
  currentWeek: boolean
  band: boolean
  lastPast: boolean
  pinned: boolean
  left: number
}

/** `shared.tsx` firstPaymentWeekIndex 와 같은 규칙(1–7일 = 0 … 29일~ = 4). 워크벤치 currentMonth 가 UTC 기준이라 일도 UTC. */
export function weekIndexOfDate(date: Date) {
  return Math.min(4, Math.max(0, Math.ceil(date.getUTCDate() / 7) - 1))
}

export function monthNumber(month: string) {
  return Number(month.split("-")[1])
}

export function buildMatrixLeaves({ months, currentMonth, currentWeek, expanded, pinPast }: {
  months: string[]
  currentMonth: string
  currentWeek: number | null
  expanded: ReadonlySet<string>
  pinPast: boolean
}): MatrixLeaf[] {
  const currentIndex = months.indexOf(currentMonth)
  const base = { month: null, week: null, start: false, past: false, currentMonth: false, currentWeek: false, band: false, lastPast: false, pinned: false, left: 0 }
  const leaves: MatrixLeaf[] = [{ ...base, key: "fy", kind: "fy", label: "FY 합계", width: MATRIX_WIDTH.fy }]
  months.forEach((month, index) => {
    const past = currentIndex >= 0 && index < currentIndex
    const isCurrent = currentIndex >= 0 && index === currentIndex
    const band = currentIndex >= 0 && index > currentIndex && (index - currentIndex) % 2 === 1
    const number = String(monthNumber(month))
    const common = { month, past, band }
    if (expanded.has(month)) {
      leaves.push({ ...base, ...common, key: `m:${month}`, kind: "month-total", label: `${number} 합계`, width: MATRIX_WIDTH.monthTotal, start: true, currentMonth: isCurrent })
      for (let week = 0; week < 5; week += 1) {
        leaves.push({ ...base, ...common, key: `w:${month}:${week}`, kind: "week", week, label: `w${week + 1}`, width: MATRIX_WIDTH.week, currentWeek: isCurrent && currentWeek === week })
      }
    } else {
      leaves.push({ ...base, ...common, key: `m:${month}`, kind: "month", label: number, width: MATRIX_WIDTH.month, start: true, currentMonth: isCurrent })
    }
  })
  let last = -1
  leaves.forEach((leaf, index) => {
    if (leaf.past) last = index
  })
  if (last >= 0) leaves[last].lastPast = true
  let left = MATRIX_FROZEN_WIDTH
  for (const leaf of leaves) {
    if (!leaf.past || !pinPast) continue
    if (months.indexOf(leaf.month ?? "") < currentIndex - MATRIX_PINNED_PAST_MONTHS) continue
    leaf.pinned = true
    leaf.left = left
    left += leaf.width
  }
  return leaves
}

// ── 주차 확도 ──────────────────────────────────────────────────────────────

export interface RowWeekBuckets {
  weeks: RevMonthlyBucket[]
  /** 월합계만 있고 주차 입력이 없다 — 주차 칸은 비우고 합계 잎에서만 보인다. */
  monthOnly: boolean
  /** 첫 입금일로 한 주차에 놓은 추정치. */
  inferred: boolean
}

const EPS = 0.5

function oneBucket(amount: number, confidence: DraftConfidence): RevMonthlyBucket {
  return {
    total: amount,
    confirmed: confidence === "confirmed" ? amount : 0,
    high: confidence === "high-confidence" ? amount : 0,
    open: confidence === "expected" ? amount : 0,
  }
}

/** 그 달 버킷에 확도가 한 가지뿐이면 그 확도, 아니면 null. */
function singleConfidence(bucket: RevMonthlyBucket): DraftConfidence | null {
  const present = ([["confirmed", bucket.confirmed], ["high-confidence", bucket.high], ["expected", bucket.open]] as const).filter(([, value]) => value > EPS)
  return present.length === 1 ? present[0][0] : null
}

function confidenceFromColorMark(mark: string | undefined): DraftConfidence | null {
  if (mark === "r") return "confirmed"
  if (mark === "b") return "high-confidence"
  if (mark === "k") return "expected"
  return null
}

/**
 * 딜 1건 × 달의 주차 확도. 월 집계(캐논)와 모순되지 않는 것이 먼저다.
 *  ⓐ 월이 한 확도뿐 → 주차도 그 확도  ⓑ 초안 주차별 상태  ⓒ 시트 주차 색 글자  ⓓ 월 비율대로 비례 배분.
 */
export function rowWeekBuckets(row: LedgerRevenueRow, month: string): RowWeekBuckets {
  const weeks = Array.from({ length: 5 }, () => emptyMonthlyBucket())
  const split = rowWeeklySplit(row, month)
  if (split.source === "month-only" || split.source === "empty") return { weeks, monthOnly: split.source === "month-only", inferred: false }

  const monthBucket = rowMonthBucket(row, month)
  const single = singleConfidence(monthBucket)
  const draftStates = row.draftMonth === month ? weeklyConfidenceFromMetadata(row.draftMetadata) : null
  const marks = row.weeklyColors?.[month]
  const amount = rowMonthAmount(row, month)
  const confirmedRatio = amount > 0 ? Math.min(monthBucket.confirmed / amount, 1) : 0
  const highRatio = amount > 0 ? Math.min(monthBucket.high / amount, Math.max(1 - confirmedRatio, 0)) : 0

  split.weeks.forEach((value, index) => {
    if (!(value > 0)) return
    if (single) {
      weeks[index] = oneBucket(value, single)
      return
    }
    if (draftStates) {
      weeks[index] = oneBucket(value, draftStates[index] ?? "expected")
      return
    }
    const fromColor = confidenceFromColorMark(marks?.[index])
    if (fromColor) {
      weeks[index] = oneBucket(value, fromColor)
      return
    }
    const confirmed = value * confirmedRatio
    const high = value * highRatio
    weeks[index] = { total: value, confirmed, high, open: Math.max(value - confirmed - high, 0) }
  })
  return { weeks, monthOnly: false, inferred: split.source === "inferred" }
}

// ── 줄 ────────────────────────────────────────────────────────────────────

export interface MatrixMonthCell {
  bucket: RevMonthlyBucket
  weeks: RevMonthlyBucket[]
  monthOnly: boolean
  mismatch: boolean
  inferred: boolean
}

export interface MatrixLine {
  key: string
  label: string
  rows: LedgerRevenueRow[]
  byMonth: Record<string, MatrixMonthCell>
  total: RevMonthlyBucket
  product: string
  region: string
  contract: string
  channel: string
  manager: string
  productRare: boolean
  contractRare: boolean
  channelRare: boolean
  locked: boolean
  hasDraft: boolean
  mismatchMonths: string[]
  monthOnlyMonths: string[]
}

export interface MatrixSection {
  key: string
  label: string
  lines: MatrixLine[]
  total: RevMonthlyBucket
}

export interface MatrixLedger {
  sections: MatrixSection[]
  lines: MatrixLine[]
}

const BLANK_LABELS = new Set(["", "기타", "미분류"])

/** 줄 안 딜들의 값을 등장 순서대로 중복 없이 `·` 로 잇는다. 기타·미분류·빈 값은 뺀다. */
function joinLabels(values: Array<string | null | undefined>) {
  const seen: string[] = []
  for (const raw of values) {
    const value = (raw ?? "").trim()
    if (BLANK_LABELS.has(value) || seen.includes(value)) continue
    seen.push(value)
  }
  return seen.join("·")
}

function emptyMonthCell(): MatrixMonthCell {
  return { bucket: emptyMonthlyBucket(), weeks: Array.from({ length: 5 }, () => emptyMonthlyBucket()), monthOnly: false, mismatch: false, inferred: false }
}

function makeLine(key: string, label: string, months: string[]): MatrixLine {
  return {
    key, label, rows: [], byMonth: Object.fromEntries(months.map((month) => [month, emptyMonthCell()])), total: emptyMonthlyBucket(),
    product: "", region: "", contract: "", channel: "", manager: "",
    productRare: false, contractRare: false, channelRare: false,
    locked: false, hasDraft: false, mismatchMonths: [], monthOnlyMonths: [],
  }
}

/** 줄 묶음·정렬·제외는 buildSimpleLedger 와 같다(고객 1줄·섹션·FY 합계 0 행 제외·FY 합계 큰 순). */
export function buildMatrixLedger(rows: LedgerRevenueRow[], months: string[], groupBy: SimpleGroupBy): MatrixLedger {
  const sections = new Map<string, MatrixSection>()
  const lineMaps = new Map<string, Map<string, MatrixLine>>()

  for (const row of rows) {
    const buckets = months.map((month) => rowMonthBucket(row, month))
    const rowTotal = emptyMonthlyBucket()
    for (const bucket of buckets) addMonthlyBucket(rowTotal, bucket)
    if (rowTotal.total <= 0) continue

    const sectionLabel = groupLabel(row, groupBy)
    let section = sections.get(sectionLabel)
    if (!section) {
      section = { key: sectionLabel, label: sectionLabel, lines: [], total: emptyMonthlyBucket() }
      sections.set(sectionLabel, section)
      lineMaps.set(sectionLabel, new Map())
    }
    const lines = lineMaps.get(sectionLabel)!
    const lineKey = normalizedAccountKey(row.customer) || row.id
    let line = lines.get(lineKey)
    if (!line) {
      line = makeLine(`${sectionLabel}:${lineKey}`, row.customer || "미지정", months)
      lines.set(lineKey, line)
      section.lines.push(line)
    }
    line.rows.push(row)
    addMonthlyBucket(line.total, rowTotal)
    addMonthlyBucket(section.total, rowTotal)
    months.forEach((month, index) => {
      const cell = line!.byMonth[month]
      addMonthlyBucket(cell.bucket, buckets[index])
      if (buckets[index].total <= 0) return
      const week = rowWeekBuckets(row, month)
      week.weeks.forEach((bucket, weekIndex) => addMonthlyBucket(cell.weeks[weekIndex], bucket))
      if (week.monthOnly) cell.monthOnly = true
      if (week.inferred) cell.inferred = true
      if (rowWeeklyMismatch(row, month)) cell.mismatch = true
    })
  }

  for (const section of sections.values()) {
    for (const line of section.lines) finishLine(line, months)
  }
  const byTotal = (a: { total: RevMonthlyBucket }, b: { total: RevMonthlyBucket }) => b.total.total - a.total.total
  const sorted = Array.from(sections.values()).sort(byTotal)
  for (const section of sorted) section.lines.sort(byTotal)
  return { sections: sorted, lines: sorted.flatMap((section) => section.lines) }
}

function finishLine(line: MatrixLine, months: string[]) {
  const products = line.rows.map((row) => productLabel(row))
  const contracts = line.rows.map((row) => contractLabel(row))
  const channels = line.rows.map((row) => channelLabel(row))
  line.product = joinLabels(products)
  line.region = joinLabels(line.rows.map((row) => row.region))
  line.contract = joinLabels(contracts)
  line.channel = joinLabels(channels)
  line.manager = joinLabels(line.rows.map((row) => (row.manager?.trim() ? branchManagerLabel(row.manager.trim()) : "")))
  line.productRare = products.includes("HW")
  line.contractRare = contracts.includes("신규")
  line.channelRare = channels.includes("채널")
  line.hasDraft = line.rows.some((row) => row.ledgerOrigin === "draft")
  line.mismatchMonths = months.filter((month) => line.byMonth[month].mismatch)
  line.monthOnlyMonths = months.filter((month) => line.byMonth[month].monthOnly && line.byMonth[month].bucket.total > 0)
  // 금액이 있는 모든 딜×월이 전액 확정이어야 잠김.
  let any = false
  let allConfirmed = true
  for (const row of line.rows) {
    for (const month of months) {
      const bucket = rowMonthBucket(row, month)
      if (bucket.total <= 0) continue
      any = true
      if (bucket.confirmed < bucket.total - EPS) allConfirmed = false
    }
  }
  line.locked = any && allConfirmed
}

// ── 칸·합계·톤 ───────────────────────────────────────────────────────────────

/** 잎 키(`fy` | `m:YYYY-MM` | `w:YYYY-MM:i`)만으로 그 줄의 버킷을 읽는다. */
export function lineBucketByKey(line: MatrixLine, key: string): RevMonthlyBucket {
  if (key === "fy") return line.total
  const parts = key.split(":")
  const cell = line.byMonth[parts[1]]
  if (!cell) return emptyMonthlyBucket()
  if (parts[0] === "m") return cell.bucket
  return cell.weeks[Number(parts[2])] ?? emptyMonthlyBucket()
}

export function lineLeafBucket(line: MatrixLine, leaf: Pick<MatrixLeaf, "key">) {
  return lineBucketByKey(line, leaf.key)
}

export function sumMatrixLeaf(lines: MatrixLine[], leaf: Pick<MatrixLeaf, "key">): RevMonthlyBucket {
  const sum = emptyMonthlyBucket()
  for (const line of lines) addMonthlyBucket(sum, lineBucketByKey(line, leaf.key))
  return sum
}

export type BucketTone = "confirmed" | "high-confidence" | "expected" | "mixed" | "empty"

export function bucketTone(bucket: RevMonthlyBucket): BucketTone {
  if (!(bucket.total > 0)) return "empty"
  return singleConfidence(bucket) ?? "mixed"
}

export interface MatrixSort {
  key: string
  dir: "asc" | "desc"
}

export const MATRIX_TEXT_SORT_KEYS = ["customer", "product", "region", "contract", "channel", "manager"] as const

export function isTextSortKey(key: string) {
  return (MATRIX_TEXT_SORT_KEYS as readonly string[]).includes(key)
}

export function filterMatrixLines(lines: MatrixLine[], { query, valueKeys }: { query: string; valueKeys: Iterable<string> }): MatrixLine[] {
  const needle = query.trim().toLowerCase()
  const keys = Array.from(valueKeys)
  return lines.filter((line) => {
    if (needle && !line.label.toLowerCase().includes(needle)) return false
    return keys.every((key) => lineBucketByKey(line, key).total > 0)
  })
}

export function sortMatrixLines(lines: MatrixLine[], sort: MatrixSort | null): MatrixLine[] {
  if (!sort) return lines
  const sign = sort.dir === "asc" ? 1 : -1
  const textValue = (line: MatrixLine) => (sort.key === "customer" ? line.label : (line[sort.key as "product" | "region" | "contract" | "channel" | "manager"] ?? ""))
  return lines.slice().sort((a, b) => {
    const diff = isTextSortKey(sort.key)
      ? textValue(a).localeCompare(textValue(b), "ko")
      : lineBucketByKey(a, sort.key).total - lineBucketByKey(b, sort.key).total
    if (diff !== 0) return diff * sign
    return b.total.total - a.total.total
  })
}

/** 칸 → 고칠 딜 후보. 그 달에 금액(또는 대기 변경)이 있는 딜을 먼저, 없으면 수정 가능한 딜 전부. */
export function cellCandidates(rows: LedgerRevenueRow[], month: string, edit: LedgerCellEditApi) {
  const editable = rows.filter((row) => edit.editable(row, month))
  const filled = editable.filter((row) => rowMonthAmount(row, month) > 0 || edit.pending(row, month))
  return filled.length > 0 ? filled : editable
}
