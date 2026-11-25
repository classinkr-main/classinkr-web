// 장부(A안) 기본 화면 집계 — 순수 함수만. 달 금액·확도는 장부 매출 버킷 하나(ledgerMonthBucket — 부호 그대로,
// 환불 달 포함, 확도는 캐논)만 쓴다(D1 · D2).
import { normalizedAccountKey } from "@/lib/branch/account-key"
import { isZeroLedgerBucket, ledgerMonthBucket, ledgerMonthNet } from "@/lib/branch/computations/revenue-core"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"
import { branchManagerMatches } from "@/lib/branch/personal-scope"
import { rowProductCategory, type LedgerRevenueRow, type RevMonthlyBucket } from "./shared"
import { addMonthlyBucket, emptyMonthlyBucket } from "./workbench-shared"

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

/** 지난달(이번 달 이전)은 한 열로 접는다(expandPast면 펼침). 이번 달이 FY 밖이면(지난 FY 조회) 12개월을 그대로 둔다. */
export function buildSimpleColumns(months: string[], currentMonth: string, expandPast = false): SimpleColumn[] {
  const currentIndex = expandPast ? -1 : months.indexOf(currentMonth)
  const columns: SimpleColumn[] = []
  if (currentIndex > 0) {
    const past = months.slice(0, currentIndex)
    const first = monthNumber(past[0])
    const last = monthNumber(past[past.length - 1])
    columns.push({ key: "past", label: past.length === 1 ? `${first}월` : `${first}–${last}월`, months: past, current: false, past: true })
  }
  for (const month of currentIndex > 0 ? months.slice(currentIndex) : months) {
    const past = months.indexOf(month) < months.indexOf(currentMonth)
    columns.push({ key: month, label: `${monthNumber(month)}월`, months: [month], current: month === currentMonth, past })
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

export const SIMPLE_FILTER_CHIPS: Array<{ dimension: Exclude<SimpleGroupBy, "none">; label: string }> = [
  { dimension: "product", label: "SW" },
  { dimension: "product", label: "HW" },
  { dimension: "contract", label: "신규" },
  { dimension: "contract", label: "갱신" },
  { dimension: "channel", label: "직접" },
  { dimension: "channel", label: "채널" },
]

export const chipKey = (chip: { dimension: string; label: string }) => `${chip.dimension}:${chip.label}`

/** 같은 기준 안에서는 OR, 기준끼리는 AND. 비어 있으면 전부 통과. */
export function rowMatchesChips(row: LedgerRevenueRow, chips: Set<string>) {
  if (chips.size === 0) return true
  return (["product", "contract", "channel"] as const).every((dimension) => {
    const picked = SIMPLE_FILTER_CHIPS.filter((chip) => chip.dimension === dimension && chips.has(chipKey(chip)))
    return picked.length === 0 || picked.some((chip) => chip.label === groupLabel(row, dimension))
  })
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

/**
 * 그 달에 시트 환불(음수)이 든 행인가 — 달 순액이 음수이거나 주차 칸에 음수가 있다. 환불 칸은 장부에서 고치지 않는다
 * (D2 '환불 — 시트 값', 환불 초안 종류가 아직 없다). 그 달을 고치면 주차 병합·월 대체가 음수를 0 으로 지워 환불이 사라진다.
 */
export function rowMonthHasRefund(row: Pick<LedgerRevenueRow, "monthlyPayments" | "weeklyPayments" | "ledgerOrigin" | "draftMonth" | "revenue">, month: string): boolean {
  if (ledgerMonthNet(row, month) < 0) return true
  const weeks = row.weeklyPayments?.[month]
  return Array.isArray(weeks) && weeks.some((value) => Number(value) < 0)
}

/**
 * 기관별 표 — 고객 한 줄에 열(달·지난달 묶음)별 장부 매출 버킷. 금액은 부호 그대로(환불만 있는 행도 남고 합계에서 빠진다,
 * D2), 네 값이 모두 0 인 행만 뺀다(순액 0 상계 달 = 값 없음). today 는 확도를 읽는 날(KST, 생략 = 오늘).
 */
export function buildSimpleLedger(rows: LedgerRevenueRow[], columns: SimpleColumn[], groupBy: SimpleGroupBy, today?: string): SimpleLedger {
  const sections = new Map<string, SimpleSection>()
  const lineMaps = new Map<string, Map<string, SimpleLine>>()
  const cells = emptyCells(columns.length)
  const total = emptyMonthlyBucket()

  for (const row of rows) {
    const rowCells = columns.map((column) => {
      const bucket = emptyMonthlyBucket()
      for (const month of column.months) addMonthlyBucket(bucket, ledgerMonthBucket(row, month, today))
      return bucket
    })
    if (rowCells.every(isZeroLedgerBucket)) continue

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

export interface ManagerRollupGoal {
  member: string
  team: string | null
  goal: number
}

const UNASSIGNED_ROLLUP = "미지정"

/**
 * 팀·전체 보기(A-2) — 담당자별 FY 확도 합계.
 *  - 팀 소계는 행의 팀(row.team)으로 묶는다(F-43) — 팀 필터와 같은 합이다. 한 사람의 행이 두 팀에 있으면 두 팀에 따로 나온다.
 *  - 담당자는 branchManagerMatches 로 맞춘다(별칭 · 대소문자 무시, F-42) — 요약 · 내 담당과 같은 규칙.
 *  - 목표는 DSH 개인 목표(KPI period=Y)를 그 사람의 소속 팀(goal.team) 줄에만 붙인다. 소속 팀에 행이 없으면 그 팀에
 *    금액 0 줄을 두어 목표가 사라지지 않게 한다(팀 목표 = 소속 팀원 목표 합). 목표 팀을 모르면 금액이 가장 큰 줄에.
 *    목표가 없으면 null(0으로 지어내지 않는다).
 */
export function buildManagerRollup(
  rows: LedgerRevenueRow[],
  months: string[],
  currentMonth: string,
  goals: ManagerRollupGoal[],
  today?: string,
): TeamRollup[] {
  const goalOf = (name: string) => goals.find((goal) => branchManagerMatches(goal.member, name)) ?? null
  // 담당자 한 사람 = 처음 본 이름(정규화) 하나. 같은 사람의 다른 표기는 branchManagerMatches 로 같은 사람에 모은다.
  const people: Array<{ name: string; goal: ManagerRollupGoal | null; byTeam: Map<string, ManagerRollup> }> = []
  const personOf = (raw: string | null | undefined) => {
    const name = normalizeBranchMemberName(raw) ?? UNASSIGNED_ROLLUP
    const found = name === UNASSIGNED_ROLLUP
      ? people.find((person) => person.name === UNASSIGNED_ROLLUP)
      : people.find((person) => person.name !== UNASSIGNED_ROLLUP && branchManagerMatches(person.name, name))
    if (found) return found
    const goal = name === UNASSIGNED_ROLLUP ? null : goalOf(name)
    const person = { name: goal?.member ?? name, goal, byTeam: new Map<string, ManagerRollup>() }
    people.push(person)
    return person
  }
  const entryOf = (person: (typeof people)[number], team: string) => {
    let entry = person.byTeam.get(team)
    if (!entry) {
      entry = { manager: person.name, team, goal: null, bucket: emptyMonthlyBucket(), dueUnconfirmed: 0 }
      person.byTeam.set(team, entry)
    }
    return entry
  }

  for (const row of rows) {
    const entry = entryOf(personOf(row.manager), row.team?.trim() || UNASSIGNED_ROLLUP)
    for (const month of months) addMonthlyBucket(entry.bucket, ledgerMonthBucket(row, month, today))
    const current = ledgerMonthBucket(row, currentMonth, today)
    if (current.total > 0 && current.confirmed < current.total - 1) entry.dueUnconfirmed += 1
  }

  for (const person of people) {
    const goal = person.goal
    if (!goal || !(goal.goal > 0)) continue
    const home = goal.team?.trim()
    const target = home
      ? entryOf(person, home)
      : Array.from(person.byTeam.values()).sort((a, b) => b.bucket.total - a.bucket.total || (a.team ?? "").localeCompare(b.team ?? ""))[0]
    if (target) target.goal = goal.goal
  }

  const teams = new Map<string, TeamRollup>()
  for (const person of people) {
    for (const member of person.byTeam.values()) {
      const teamName = member.team || UNASSIGNED_ROLLUP
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
