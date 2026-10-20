// 장부(A안) 기본 화면 집계 — 순수 함수만. 확도 분해는 rowMonthBucket(캐논 ledgerMonthSplit)만 쓴다.
import { normalizedAccountKey } from "@/lib/branch/account-key"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"
import { rowProductCategory, type LedgerRevenueRow, type RevMonthlyBucket } from "./shared"
import { addMonthlyBucket, emptyMonthlyBucket, rowMonthBucket } from "./workbench-shared"

export type SimpleGroupBy = "none" | "product" | "contract" | "channel"

export const SIMPLE_GROUP_BY_OPTIONS: Array<{ id: SimpleGroupBy; label: string }> = [
  { id: "none", label: "없음" },
  { id: "product", label: "제품" },
  { id: "contract", label: "계약" },
  { id: "channel", label: "경로" },
]

export interface SimpleColumn {
  key: string
  label: string
  /** 이 열이 합치는 회계월(YYYY-MM). 지난달 묶음 열은 여러 달. */
  months: string[]
  current: boolean
  past: boolean
}

export interface SimpleLine {
  key: string
  label: string
  tag: string
  cells: RevMonthlyBucket[]
  total: RevMonthlyBucket
  rows: LedgerRevenueRow[]
}

export interface SimpleSection {
  key: string
  label: string
  lines: SimpleLine[]
  cells: RevMonthlyBucket[]
  total: RevMonthlyBucket
}

export interface SimpleLedger {
  columns: SimpleColumn[]
  sections: SimpleSection[]
  cells: RevMonthlyBucket[]
  total: RevMonthlyBucket
}

function monthNumber(month: string) {
  return Number(month.split("-")[1])
}

/** 지난달(이번 달 이전)은 한 열로 접는다. 이번 달이 FY 밖이면(지난 FY 조회) 12개월을 그대로 둔다. */
export function buildSimpleColumns(months: string[], currentMonth: string): SimpleColumn[] {
  const currentIndex = months.indexOf(currentMonth)
  const columns: SimpleColumn[] = []
  if (currentIndex > 0) {
    const past = months.slice(0, currentIndex)
    const first = monthNumber(past[0])
    const last = monthNumber(past[past.length - 1])
    columns.push({ key: "past", label: past.length === 1 ? `${first}월` : `${first}–${last}월`, months: past, current: false, past: true })
  }
  for (const month of currentIndex > 0 ? months.slice(currentIndex) : months) {
    columns.push({ key: month, label: `${monthNumber(month)}월`, months: [month], current: month === currentMonth, past: false })
  }
  return columns
}

export function contractLabel(row: Pick<LedgerRevenueRow, "status">) {
  const value = (row.status ?? "").trim().toLowerCase()
  if (value === "new" || value === "신규") return "신규"
  if (value === "renew" || value === "갱신") return "갱신"
  return "기타"
}

export function channelLabel(row: Pick<LedgerRevenueRow, "dealType">) {
  const value = (row.dealType ?? "").trim()
  if (value === "Direct") return "직접"
  if (value === "Channel") return "채널"
  return "기타"
}

export function productLabel(row: Pick<LedgerRevenueRow, "customer" | "productVersion" | "draftMetadata">) {
  const category = rowProductCategory(row)
  return category === "hardware" ? "HW" : category === "software" ? "SW" : "미분류"
}

function groupLabel(row: LedgerRevenueRow, groupBy: SimpleGroupBy) {
  if (groupBy === "product") return productLabel(row)
  if (groupBy === "contract") return contractLabel(row)
  if (groupBy === "channel") return channelLabel(row)
  return "전체"
}

function lineTag(row: LedgerRevenueRow, groupBy: SimpleGroupBy) {
  const parts = [
    groupBy === "product" ? null : productLabel(row),
    groupBy === "contract" ? null : contractLabel(row),
    groupBy === "channel" ? null : channelLabel(row),
  ]
  return parts.filter((part) => part && part !== "기타" && part !== "미분류").join(" · ")
}

function emptyCells(count: number) {
  return Array.from({ length: count }, () => emptyMonthlyBucket())
}

export function buildSimpleLedger(rows: LedgerRevenueRow[], columns: SimpleColumn[], groupBy: SimpleGroupBy): SimpleLedger {
  const sections = new Map<string, SimpleSection>()
  const lineMaps = new Map<string, Map<string, SimpleLine>>()
  const cells = emptyCells(columns.length)
  const total = emptyMonthlyBucket()

  for (const row of rows) {
    const rowCells = columns.map((column) => {
      const bucket = emptyMonthlyBucket()
      for (const month of column.months) addMonthlyBucket(bucket, rowMonthBucket(row, month))
      return bucket
    })
    if (rowCells.every((bucket) => bucket.total <= 0)) continue

    const sectionLabel = groupLabel(row, groupBy)
    let section = sections.get(sectionLabel)
    if (!section) {
      section = { key: sectionLabel, label: sectionLabel, lines: [], cells: emptyCells(columns.length), total: emptyMonthlyBucket() }
      sections.set(sectionLabel, section)
      lineMaps.set(sectionLabel, new Map())
    }
    const lines = lineMaps.get(sectionLabel)!
    const lineKey = normalizedAccountKey(row.customer) || row.id
    let line = lines.get(lineKey)
    if (!line) {
      line = { key: `${sectionLabel}:${lineKey}`, label: row.customer || "미지정", tag: lineTag(row, groupBy), cells: emptyCells(columns.length), total: emptyMonthlyBucket(), rows: [] }
      lines.set(lineKey, line)
      section.lines.push(line)
    }
    line.rows.push(row)
    rowCells.forEach((bucket, index) => {
      addMonthlyBucket(line!.cells[index], bucket)
      addMonthlyBucket(section!.cells[index], bucket)
      addMonthlyBucket(cells[index], bucket)
      addMonthlyBucket(line!.total, bucket)
      addMonthlyBucket(section!.total, bucket)
      addMonthlyBucket(total, bucket)
    })
  }

  const byTotal = (a: { total: RevMonthlyBucket }, b: { total: RevMonthlyBucket }) => b.total.total - a.total.total
  const sorted = Array.from(sections.values()).sort(byTotal)
  for (const section of sorted) section.lines.sort(byTotal)
  return { columns, sections: sorted, cells, total }
}

export interface ManagerRollup {
  manager: string
  team: string | null
  goal: number | null
  bucket: RevMonthlyBucket
  /** 이번 달 입금 예정인데 확정이 덜 된 딜 수. */
  dueUnconfirmed: number
}

export interface TeamRollup {
  team: string
  goal: number | null
  bucket: RevMonthlyBucket
  dueUnconfirmed: number
  members: ManagerRollup[]
}

/**
 * 팀·전체 보기(A-2) — 담당자별 FY 확도 합계. 목표는 DSH 개인 목표(KPI period=Y)를 이름으로 붙이고,
 * 목표가 없으면 null(0으로 지어내지 않는다).
 */
export function buildManagerRollup(
  rows: LedgerRevenueRow[],
  months: string[],
  currentMonth: string,
  goals: Array<{ member: string; team: string | null; goal: number }>,
): TeamRollup[] {
  const key = (name: string | null | undefined) => normalizeBranchMemberName(name)?.toLowerCase() ?? ""
  const goalByMember = new Map(goals.map((goal) => [key(goal.member), goal]))
  const managers = new Map<string, ManagerRollup>()

  for (const row of rows) {
    const name = row.manager?.trim() || "미지정"
    let rollup = managers.get(key(name) || name)
    if (!rollup) {
      const goal = goalByMember.get(key(name))
      rollup = { manager: name, team: goal?.team ?? row.team ?? null, goal: goal && goal.goal > 0 ? goal.goal : null, bucket: emptyMonthlyBucket(), dueUnconfirmed: 0 }
      managers.set(key(name) || name, rollup)
    }
    for (const month of months) addMonthlyBucket(rollup.bucket, rowMonthBucket(row, month))
    const current = rowMonthBucket(row, currentMonth)
    if (current.total > 0 && current.confirmed < current.total - 1) rollup.dueUnconfirmed += 1
  }

  const teams = new Map<string, TeamRollup>()
  for (const member of managers.values()) {
    const teamName = member.team || "미지정"
    let team = teams.get(teamName)
    if (!team) {
      team = { team: teamName, goal: null, bucket: emptyMonthlyBucket(), dueUnconfirmed: 0, members: [] }
      teams.set(teamName, team)
    }
    team.members.push(member)
    addMonthlyBucket(team.bucket, member.bucket)
    team.dueUnconfirmed += member.dueUnconfirmed
    if (member.goal) team.goal = (team.goal ?? 0) + member.goal
  }
  const result = Array.from(teams.values())
  for (const team of result) team.members.sort((a, b) => b.bucket.total - a.bucket.total)
  return result.sort((a, b) => b.bucket.total - a.bucket.total)
}

/** 오늘 페이스 — FY 경과 비율(이번 달 포함). 이번 달이 FY 밖이면 1(지난 FY는 끝까지 경과). */
export function fiscalPace(months: string[], currentMonth: string) {
  const index = months.indexOf(currentMonth)
  if (months.length === 0) return 0
  return index < 0 ? 1 : (index + 1) / months.length
}
