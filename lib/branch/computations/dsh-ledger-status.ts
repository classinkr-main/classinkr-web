// DSH 실적을 장부에서 계산한다(D4, 2026-12-01 '2. REV' 시트 고정 뒤) — 순수 모듈(클라이언트 겸용, server-only 금지).
//
// 왜: 시트가 잠기면 '1. DSH' 의 실적(Status) 칸은 사람이 더 적지 않아 12월부터 멈춘다. 새 매출의 원본은 장부다.
// 그래서 고정 달(lockMonth) 이상의 달은 실적을 장부 확정(D1 한 정의 — 시트 행 + 적용된 장부 항목, 확도 캐논)으로
// 바꿔 끼우고, 목표(Goal)는 시트 그대로 둔다. 화면의 모든 DSH 파생(dedupeDshByKind·buildDshTeamGrid·deal_mix)은
// 손대지 않고 그대로 따라오게, 서버에서 DshOutput 한 번만 갈아 끼운다(lib/branch/dsh-ledger.ts 가 부른다).
//
// 규칙(결정 D4 — 다시 열지 않는다):
// - 실적 = 장부 확정(revenue-core.ledgerMonthBucket 의 confirmed — 장부 화면·서버 집계와 같은 함수). 예정·고확도 제외,
//   환불(음수)은 시트 합계처럼 빠진다(D2).
// - 구성: 담당 × SW/HW × New/Renew × Direct/Channel.
//   · SW/HW: 저장된 상품 분류(raw.productCategory)가 hardware 면 HW, 그 밖에 저장값이 있으면 SW, 없으면 공용 분류기.
//   · New/Renew: REV Status 먼저, 없으면 첫 결제일 ≥ 회계연도 4/1 이면 New. 시트 행에 첫 결제일도 없으면 Renew(시트 수식 결과).
//     장부 새 행에 둘 다 없으면 같은 거래처 시트 행의 가장 이른 첫 결제일로 판정, 그것도 없으면 New(추정 — 건수를 센다).
//   · Direct/Channel: REV Type. 장부 새 행에 없으면 같은 거래처 시트 행의 Type 이 하나로 같을 때 그 값, 아니면 '(미구분)'.
//     그다음 시트의 조합 집합에 맞춘다 — 그 조합이 시트에 없고 '(미구분)' 조합이 있으면 '(미구분)'(예: 시트의 HW Renew 는 채널 공란).
// - 팀: DSH 멤버→팀 지도(dsh.members). 멤버에 없거나 담당이 비면 '미배정'. Team KR(ALL) = 모든 행(미배정 포함).
// - 끼워 넣기(델타 스플라이스): lockMonth 이전 달은 시트 값, 이후 달은 장부 값. 분기·연간은 바꾼 달마다 (장부 − 시트)만큼
//   더한다. breakdown 과 팀·멤버 행에 똑같이 적용한다 — 결과를 다시 dedupeDshByKind 해도 그대로(항등)다.
// - dsh.members 지도는 바꾸지 않는다(KPI 병목 멤버 집합 유지).

import { normalizedAccountKey } from "@/lib/branch/account-key"
import { dedupeDshByKind } from "@/lib/branch/dsh-dedupe"
import { fiscalQuarter } from "@/lib/branch/fiscal"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"
import type { DshBreakdownRow, DshOutput, DshRow } from "@/lib/branch/parsers/dsh"
import { classifySalesLedgerProductCategory } from "@/lib/branch/product-category"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { revReadTimeFields } from "./rev-confirmed"
import { ledgerMonthBucket, type LedgerRevenueSource } from "./revenue-core"

/** 장부 담당자가 DSH 멤버에 없거나 비어 있는 매출의 팀 키(Team KR 합계에는 들어간다). */
export const DSH_UNASSIGNED_TEAM = "미배정"
/** 담당이 비어 있는 장부 매출의 멤버 이름. */
export const DSH_NO_MANAGER = "(담당 없음)"
/** 채널을 알 수 없는 조합 — 파서가 채널 공란 행에 붙이는 값과 같다(lib/branch/parsers/dsh.ts 2차 패스). */
export const DSH_UNKNOWN_CHANNEL = "(미구분)"

/** 고정 달 한 달 동안 옆에 흐리게 보이는 시트 '1. DSH' 실적(스플라이스 전 원본). */
export interface DshLedgerSheetCompare {
  /** 비교하는 달(= lockMonth) YYYY-MM. */
  month: string
  /** 시트 Team KR 실적 — breakdown 조합 합(dedupe 뒤). breakdown 이 없으면 ALL 팀 행. */
  total: number
  /** 조합 키 'Software|New|Direct' → 시트 실적. */
  byCombo: Record<string, number>
  /** 팀(ALL·BD·MKT·CSM) → 시트 실적. */
  byTeam: Record<string, number>
  /** 멤버(DSH 표기) → 시트 실적. */
  byMember: Record<string, number>
}

/** summary 응답의 dsh_ledger — 시트 고정이 적용 중일 때만 실린다. JSON 직렬화 가능한 값만 둔다. */
export interface BranchDshLedgerInfo {
  /** 고정 날짜 YYYY-MM-DD(KST). */
  lockedAt: string
  /** 고정 달 YYYY-MM — 이 달부터 실적이 장부다. */
  lockMonth: string
  /** 이 응답에서 실적을 장부로 바꾼 달(DSH 창 안, lockMonth 이상). 비면 시트 값 그대로다. */
  ledgerMonths: string[]
  /** 장부 실적을 계산하지 못했다 — 실적은 시트 값 그대로이고 화면이 알린다. */
  error?: string
  /** 고정 달(KST 영업월 = lockMonth) 동안만 — 시트 실적 비교값. */
  sheetCompare?: DshLedgerSheetCompare
  /** DSH 멤버에 없는 장부 담당자별 확정 합(장부 달 합계, 0 아닌 것만). */
  unassigned?: Array<{ manager: string; amount: number }>
  /** 추정 건수 — channelUnknown: 장부 행에 유형(Direct/Channel)이 없음, statusInferred: New/Renew 를 첫 결제일 없이 추정. */
  inferred?: { channelUnknown: number; statusInferred: number }
}

/** 판정에 쓰는 딜 모양 — mergeLedgerIntoDeals(D1) 결과의 BranchRevDeal 이 그대로 맞는다. */
export type DshLedgerDeal = Pick<
  BranchRevDeal,
  | "id"
  | "customer_name"
  | "manager"
  | "deal_type"
  | "status"
  | "first_payment"
  | "product_version"
  | "monthly_payments"
  | "monthly_red"
  | "monthly_confirmed"
  | "monthly_high_conf"
> & { raw?: Record<string, unknown> | null }

export interface DshNumbersShape {
  annual: number
  quarters: [number, number, number, number]
  months: Record<string, number>
}

interface DshNumbersLike {
  annual: number
  quarters: readonly number[]
  months: Record<string, number>
}

// ── 공통 ────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

export function dshComboKey(category: string, statusType: string, channel: string): string {
  return `${category}|${statusType}|${channel}`
}

/** 'YYYY-MM' 의 회계 분기 인덱스(0~3) — 4~6월 0, 1~3월 3. */
export function dshQuarterIndexOfYm(ym: string): number {
  return fiscalQuarter(Number(ym.slice(5, 7))) - 1
}

/** DSH 창의 달 — 행·breakdown 의 월 키 합집합(YYYY-MM 문자열 정렬이 회계월 순서를 보존한다). */
export function dshMonthKeys(dsh: Pick<DshOutput, "rows" | "breakdown">): string[] {
  const keys = new Set<string>()
  for (const row of dsh.rows) for (const ym of Object.keys(row.months)) keys.add(ym)
  for (const row of dsh.breakdown ?? []) for (const ym of Object.keys(row.months)) keys.add(ym)
  return [...keys].sort()
}

/** 실적을 장부로 바꾸는 달 — DSH 창 안에서 lockMonth 이상. */
export function dshLedgerMonths(monthKeys: readonly string[], lockMonth: string): string[] {
  return monthKeys.filter((ym) => ym >= lockMonth)
}

// ── 분류 ────────────────────────────────────────────────────────────────────

const ISO_DAY_RE = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/

/** 첫 결제일 → 'YYYY-MM-DD'. 못 읽으면 null. */
function isoDay(value: string | null | undefined): string | null {
  const match = ISO_DAY_RE.exec(String(value ?? "").trim())
  if (!match) return null
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`
}

function normalizeStatusType(value: string | null | undefined): "New" | "Renew" | null {
  const text = String(value ?? "").trim().toLowerCase()
  if (text === "new" || text === "신규") return "New"
  if (text === "renew" || text === "갱신") return "Renew"
  return null
}

function normalizeChannel(value: string | null | undefined): "Direct" | "Channel" | null {
  const text = String(value ?? "").trim().toLowerCase()
  if (text === "direct" || text === "직접") return "Direct"
  if (text === "channel" || text === "채널") return "Channel"
  return null
}

/** 장부에서 온 딜(mergeLedgerIntoDeals 의 raw.ledgerDeal) — 시트 행이 아니다. */
export function isLedgerDshDeal(deal: Pick<DshLedgerDeal, "raw">): boolean {
  return isRecord(deal.raw) && isRecord(deal.raw.ledgerDeal)
}

function storedProductCategory(deal: Pick<DshLedgerDeal, "raw">): string | null {
  const value = isRecord(deal.raw) ? deal.raw.productCategory : null
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null
}

export interface DshLedgerClassifyContext {
  /** 회계연도 시작 연도 — 첫 결제일이 그해 4/1 이상이면 New. */
  fiscalYear: number
  /** 시트의 조합 집합(목표 ∪ 실적) — 채널 맞춤에 쓴다. */
  sheetCombos: ReadonlySet<string>
  /** 거래처 키 → 시트 행의 가장 이른 첫 결제일. */
  accountFirstPayment: ReadonlyMap<string, string>
  /** 거래처 키 → 시트 행 Type 이 하나로 같으면 그 값, 엇갈리면 null. */
  accountChannel: ReadonlyMap<string, "Direct" | "Channel" | null>
}

export interface DshLedgerCombo {
  category: "Software" | "Hardware"
  statusType: "New" | "Renew"
  channel: string
  /** New/Renew 를 Status·첫 결제일 없이 추정했다(장부 행). */
  inferredStatus: boolean
  /** 장부 행에 유형(Direct/Channel)이 없어 '(미구분)' 이 됐다. */
  inferredChannel: boolean
}

/** 시트 딜에서 거래처별 첫 결제일·Type 지도를 만든다(장부 새 행의 추정에 쓴다). */
export function buildDshAccountHints(deals: ReadonlyArray<DshLedgerDeal>): Pick<
  DshLedgerClassifyContext,
  "accountFirstPayment" | "accountChannel"
> {
  const accountFirstPayment = new Map<string, string>()
  const channels = new Map<string, Set<string>>()
  for (const deal of deals) {
    if (isLedgerDshDeal(deal)) continue
    const key = normalizedAccountKey(deal.customer_name)
    if (!key) continue
    const day = isoDay(deal.first_payment)
    if (day) {
      const known = accountFirstPayment.get(key)
      if (!known || day < known) accountFirstPayment.set(key, day)
    }
    const channel = normalizeChannel(deal.deal_type)
    if (channel) {
      const set = channels.get(key) ?? new Set<string>()
      set.add(channel)
      channels.set(key, set)
    }
  }
  const accountChannel = new Map<string, "Direct" | "Channel" | null>()
  for (const [key, set] of channels) accountChannel.set(key, set.size === 1 ? ([...set][0] as "Direct" | "Channel") : null)
  return { accountFirstPayment, accountChannel }
}

/** 딜 하나의 DSH 조합(SW/HW × New/Renew × Direct/Channel). */
export function classifyDshDeal(deal: DshLedgerDeal, ctx: DshLedgerClassifyContext): DshLedgerCombo {
  const fromLedger = isLedgerDshDeal(deal)
  const stored = storedProductCategory(deal)
  const category: DshLedgerCombo["category"] =
    stored === "hardware"
      ? "Hardware"
      : stored
        ? "Software"
        : classifySalesLedgerProductCategory({ product: deal.product_version, account: deal.customer_name }) === "hardware"
          ? "Hardware"
          : "Software"

  const accountKey = normalizedAccountKey(deal.customer_name)
  const fyStart = `${ctx.fiscalYear}-04-01`
  let statusType = normalizeStatusType(deal.status)
  let inferredStatus = false
  if (!statusType) {
    const firstPayment = isoDay(deal.first_payment)
    if (firstPayment) statusType = firstPayment >= fyStart ? "New" : "Renew"
    else if (!fromLedger) statusType = "Renew"
    else {
      // 장부 새 행 — 같은 거래처의 시트 첫 결제일로 판정, 처음 보는 거래처면 이번 회계연도 첫 결제(New)로 본다.
      const inherited = accountKey ? ctx.accountFirstPayment.get(accountKey) : undefined
      statusType = inherited ? (inherited >= fyStart ? "New" : "Renew") : "New"
      inferredStatus = true
    }
  }

  let channel: string | null = normalizeChannel(deal.deal_type)
  let inferredChannel = false
  if (!channel && fromLedger && accountKey) channel = ctx.accountChannel.get(accountKey) ?? null
  if (!channel) {
    channel = DSH_UNKNOWN_CHANNEL
    inferredChannel = fromLedger
  }
  // 시트 조합 집합에 맞춘다 — 시트가 채널을 안 나눈 조합(예: HW Renew 공란)에 목표 없는 조합을 새로 만들지 않는다.
  if (
    channel !== DSH_UNKNOWN_CHANNEL &&
    !ctx.sheetCombos.has(dshComboKey(category, statusType, channel)) &&
    ctx.sheetCombos.has(dshComboKey(category, statusType, DSH_UNKNOWN_CHANNEL))
  ) {
    channel = DSH_UNKNOWN_CHANNEL
  }
  return { category, statusType, channel, inferredStatus, inferredChannel }
}

// ── 집계 ────────────────────────────────────────────────────────────────────

/** 딜 → 장부 매출 한 정의(revenue-core)의 행 모양. 읽는 시점 재료(pendingCells·monthWeekMismatch)도 같이 넘긴다. */
function dealRevenueSource(deal: DshLedgerDeal): LedgerRevenueSource {
  return {
    monthlyPayments: deal.monthly_payments,
    monthlyConfirmed: deal.monthly_confirmed ?? null,
    monthlyHighConfidence: deal.monthly_high_conf ?? null,
    monthlyRed: deal.monthly_red,
    ...revReadTimeFields(deal.raw),
  }
}

/** 딜 × 달의 장부 확정(DSH 실적) — 장부 화면·서버 집계와 같은 ledgerMonthBucket. */
export function dshLedgerConfirmed(deal: DshLedgerDeal, ym: string, today?: string): number {
  return ledgerMonthBucket(dealRevenueSource(deal), ym, today).confirmed
}

export interface DshLedgerComboSeries {
  category: string
  statusType: string
  channel: string
  months: Record<string, number>
}

export interface DshLedgerMemberSeries {
  member: string
  team: string
  months: Record<string, number>
}

export interface DshLedgerStatus {
  months: string[]
  total: Record<string, number>
  byCombo: Map<string, DshLedgerComboSeries>
  /** 팀 → 달별 확정. 미배정 포함. */
  byTeam: Map<string, Record<string, number>>
  /** 멤버 키(소문자 정규화) → 시리즈. 멤버 이름은 DSH 표기(미배정이면 장부 표기). */
  byMember: Map<string, DshLedgerMemberSeries>
  unassigned: Array<{ manager: string; amount: number }>
  inferred: { channelUnknown: number; statusInferred: number }
}

export interface AggregateLedgerDshOptions {
  fiscalYear: number
  /** 장부로 바꾸는 달만 읽는다. */
  months: readonly string[]
  /** DSH 멤버 → 팀(dsh.members). */
  members: Readonly<Record<string, string>>
  /** 시트 조합 집합(목표 ∪ 실적). */
  sheetCombos: ReadonlySet<string>
  /** 읽는 시점(KST 'YYYY-MM-DD'). 없으면 지금의 KST 영업일. */
  today?: string
}

function addMonth(target: Record<string, number>, ym: string, value: number) {
  target[ym] = (target[ym] ?? 0) + value
}

/** D1 딜(시트 + 장부 항목) → 장부 달의 DSH 실적(조합·팀·멤버·전체). */
export function aggregateLedgerDshStatus(deals: ReadonlyArray<DshLedgerDeal>, options: AggregateLedgerDshOptions): DshLedgerStatus {
  const months = [...options.months]
  const hints = buildDshAccountHints(deals)
  const ctx: DshLedgerClassifyContext = { fiscalYear: options.fiscalYear, sheetCombos: options.sheetCombos, ...hints }
  // 장부 담당 → DSH 멤버(대소문자·별칭 무시). DSH 표기를 쓴다.
  const memberByKey = new Map<string, string>()
  for (const name of Object.keys(options.members)) {
    const key = normalizeBranchMemberName(name)?.toLowerCase()
    if (key && !memberByKey.has(key)) memberByKey.set(key, name)
  }

  const status: DshLedgerStatus = {
    months,
    total: {},
    byCombo: new Map(),
    byTeam: new Map(),
    byMember: new Map(),
    unassigned: [],
    inferred: { channelUnknown: 0, statusInferred: 0 },
  }
  const unassigned = new Map<string, { manager: string; amount: number }>()

  for (const deal of deals) {
    const amounts: Array<[string, number]> = []
    for (const ym of months) {
      const confirmed = dshLedgerConfirmed(deal, ym, options.today)
      if (confirmed !== 0) amounts.push([ym, confirmed])
    }
    if (amounts.length === 0) continue

    const combo = classifyDshDeal(deal, ctx)
    if (combo.inferredStatus) status.inferred.statusInferred += 1
    if (combo.inferredChannel) status.inferred.channelUnknown += 1

    const managerName = normalizeBranchMemberName(deal.manager)
    const managerKey = managerName?.toLowerCase() ?? ""
    const dshMember = managerKey ? memberByKey.get(managerKey) : undefined
    const team = dshMember ? options.members[dshMember] : DSH_UNASSIGNED_TEAM
    const member = dshMember ?? managerName ?? DSH_NO_MANAGER
    const memberKey = dshMember ? dshMember.toLowerCase() : `${DSH_UNASSIGNED_TEAM}|${managerKey}`

    const comboKey = dshComboKey(combo.category, combo.statusType, combo.channel)
    const comboSeries =
      status.byCombo.get(comboKey) ??
      { category: combo.category, statusType: combo.statusType, channel: combo.channel, months: {} }
    status.byCombo.set(comboKey, comboSeries)
    const teamSeries = status.byTeam.get(team) ?? {}
    status.byTeam.set(team, teamSeries)
    const memberSeries = status.byMember.get(memberKey) ?? { member, team, months: {} }
    status.byMember.set(memberKey, memberSeries)

    for (const [ym, value] of amounts) {
      addMonth(status.total, ym, value)
      addMonth(comboSeries.months, ym, value)
      addMonth(teamSeries, ym, value)
      addMonth(memberSeries.months, ym, value)
    }
    if (!dshMember) {
      const sum = amounts.reduce((acc, [, value]) => acc + value, 0)
      const entry = unassigned.get(memberKey) ?? { manager: member, amount: 0 }
      entry.amount += sum
      unassigned.set(memberKey, entry)
    }
  }
  status.unassigned = [...unassigned.values()]
    .filter((entry) => entry.amount !== 0)
    .sort((a, b) => b.amount - a.amount || a.manager.localeCompare(b.manager))
  return status
}

// ── 끼워 넣기 ───────────────────────────────────────────────────────────────

/**
 * 델타 스플라이스 — 장부 달은 장부 값으로 바꾸고, 바꾼 만큼(장부 − 시트) 그 분기와 연간을 고친다. 장부 달이 아닌 달은 시트 값.
 * 모든 월 키를 0 으로 채운다(전월 비교 isPrevPeriodAvailable 이 키 존재를 본다).
 */
export function spliceDshNumbers(
  sheet: DshNumbersLike | undefined,
  ledger: Readonly<Record<string, number>>,
  ledgerMonths: readonly string[],
  monthKeys: readonly string[],
): DshNumbersShape {
  const months: Record<string, number> = {}
  for (const ym of monthKeys) months[ym] = sheet?.months[ym] ?? 0
  if (sheet) for (const [ym, value] of Object.entries(sheet.months)) months[ym] = value
  const out: DshNumbersShape = {
    annual: sheet?.annual ?? 0,
    quarters: [0, 1, 2, 3].map((index) => sheet?.quarters[index] ?? 0) as DshNumbersShape["quarters"],
    months,
  }
  for (const ym of ledgerMonths) {
    const next = ledger[ym] ?? 0
    const delta = next - (out.months[ym] ?? 0)
    out.months[ym] = next
    out.quarters[dshQuarterIndexOfYm(ym)] += delta
    out.annual += delta
  }
  return out
}

function hasLedgerValue(series: Readonly<Record<string, number>> | undefined, ledgerMonths: readonly string[]): boolean {
  return Boolean(series) && ledgerMonths.some((ym) => (series?.[ym] ?? 0) !== 0)
}

/**
 * 장부 실적을 DshOutput 에 끼워 넣는다(새 객체 — 입력은 바꾸지 않는다).
 * - breakdown = dedupe 된 목표 행(같은 참조) + 조합마다 실적 행 하나(시트 ∪ 장부 조합, 델타 스플라이스).
 * - rows = 목표 행 그대로. 실적 행은 ALL ← 전체, 팀 ← 팀별(미배정 포함), 멤버 ← 멤버별로 스플라이스.
 *   시트에 실적 행이 없는데 장부 값이 있으면 만든다(미배정 팀·그 멤버 포함).
 * - members 지도는 그대로.
 */
export function spliceLedgerStatusIntoDsh(
  dsh: DshOutput,
  status: DshLedgerStatus,
  monthKeys: readonly string[],
): DshOutput {
  const ledgerMonths = status.months
  const deduped = dedupeDshByKind(dsh.breakdown ?? [])
  const statusKeys = [...deduped.status.keys()]
  for (const key of status.byCombo.keys()) if (!deduped.status.has(key)) statusKeys.push(key)
  const breakdown: DshBreakdownRow[] = [
    ...deduped.goal.values(),
    ...statusKeys.map((key): DshBreakdownRow => {
      const sheet = deduped.status.get(key)
      const ledger = status.byCombo.get(key)
      return {
        kind: "status",
        category: sheet?.category ?? ledger!.category,
        status_type: sheet?.status_type ?? ledger!.statusType,
        channel: sheet?.channel ?? ledger!.channel,
        ...spliceDshNumbers(sheet, ledger?.months ?? {}, ledgerMonths, monthKeys),
      }
    }),
  ]

  const memberSeriesByName = new Map<string, DshLedgerMemberSeries>()
  for (const series of status.byMember.values()) {
    if (series.team !== DSH_UNASSIGNED_TEAM) memberSeriesByName.set(series.member.toLowerCase(), series)
  }
  const teamSeries = (team: string) => (team === "ALL" ? status.total : status.byTeam.get(team))

  const seenTeams = new Set<string>()
  const seenMembers = new Set<string>()
  const rows: DshRow[] = dsh.rows.map((row) => {
    if (row.kind !== "status") return row
    if (row.level === "team") {
      seenTeams.add(row.team)
      return { ...row, ...spliceDshNumbers(row, teamSeries(row.team) ?? {}, ledgerMonths, monthKeys) }
    }
    const key = String(row.member ?? "").toLowerCase()
    seenMembers.add(key)
    return { ...row, ...spliceDshNumbers(row, memberSeriesByName.get(key)?.months ?? {}, ledgerMonths, monthKeys) }
  })

  const created = (base: Omit<DshRow, "annual" | "quarters" | "months">, series: Record<string, number>): DshRow => ({
    ...base,
    ...spliceDshNumbers(undefined, series, ledgerMonths, monthKeys),
  })
  if (!seenTeams.has("ALL") && hasLedgerValue(status.total, ledgerMonths)) {
    rows.push(created({ level: "team", team: "ALL", kind: "status" }, status.total))
  }
  for (const [team, series] of status.byTeam) {
    if (seenTeams.has(team) || !hasLedgerValue(series, ledgerMonths)) continue
    rows.push(created({ level: "team", team, kind: "status" }, series))
  }
  for (const series of status.byMember.values()) {
    const assigned = series.team !== DSH_UNASSIGNED_TEAM
    if (assigned && seenMembers.has(series.member.toLowerCase())) continue
    if (!hasLedgerValue(series.months, ledgerMonths)) continue
    rows.push(created({ level: "member", team: series.team, member: series.member, kind: "status" }, series.months))
  }

  return { rows, members: dsh.members, breakdown }
}

/** 스플라이스 전 시트 실적(그 달) — 고정 달 동안 흐린 비교값으로 쓴다. */
export function dshSheetCompareFor(dsh: Pick<DshOutput, "rows" | "breakdown">, month: string): DshLedgerSheetCompare {
  const deduped = dedupeDshByKind(dsh.breakdown ?? [])
  const byCombo: Record<string, number> = {}
  let comboTotal = 0
  for (const [key, row] of deduped.status) {
    const value = row.months[month] ?? 0
    byCombo[key] = value
    comboTotal += value
  }
  const byTeam: Record<string, number> = {}
  const byMember: Record<string, number> = {}
  for (const row of dsh.rows) {
    if (row.kind !== "status") continue
    const value = row.months[month] ?? 0
    // 같은 (팀)·(멤버) 중복 행은 첫 행 채택 — buildDshTeamGrid 와 같은 규약(합산 금지).
    if (row.level === "team") {
      if (!(row.team in byTeam)) byTeam[row.team] = value
    } else if (row.member && !(row.member in byMember)) {
      byMember[row.member] = value
    }
  }
  const total = deduped.status.size > 0 ? comboTotal : byTeam.ALL ?? 0
  return { month, total, byCombo, byTeam, byMember }
}

// ── 한 번에 ─────────────────────────────────────────────────────────────────

export interface SpliceDshWithLedgerInput {
  dsh: DshOutput
  /** D1 딜(시트 스냅샷 + 적용된 장부 항목 — lib/branch/ledger-overlay.ts mergeLedgerIntoDeals 결과). 전 팀. */
  deals: ReadonlyArray<DshLedgerDeal>
  fiscalYear: number
  lockedAt: string
  lockMonth: string
  /** 읽는 시점 KST 'YYYY-MM-DD' — 확도 판정과 비교값(고정 달 동안만)에 쓴다. */
  today: string
}

/**
 * 고정이 적용 중일 때의 DSH 실적 교체(순수). 장부 달이 없으면(지난 회계연도 보기) 입력 그대로, info null.
 * 비교값(sheetCompare)은 오늘의 달이 lockMonth 일 때만 싣는다.
 */
export function spliceDshWithLedger(input: SpliceDshWithLedgerInput): { dsh: DshOutput; info: BranchDshLedgerInfo | null } {
  const monthKeys = dshMonthKeys(input.dsh)
  const ledgerMonths = dshLedgerMonths(monthKeys, input.lockMonth)
  if (ledgerMonths.length === 0) return { dsh: input.dsh, info: null }
  const deduped = dedupeDshByKind(input.dsh.breakdown ?? [])
  const sheetCombos = new Set<string>([...deduped.goal.keys(), ...deduped.status.keys()])
  const status = aggregateLedgerDshStatus(input.deals, {
    fiscalYear: input.fiscalYear,
    months: ledgerMonths,
    members: input.dsh.members,
    sheetCombos,
    today: input.today,
  })
  const dsh = spliceLedgerStatusIntoDsh(input.dsh, status, monthKeys)
  const info: BranchDshLedgerInfo = {
    lockedAt: input.lockedAt,
    lockMonth: input.lockMonth,
    ledgerMonths,
    unassigned: status.unassigned,
    inferred: status.inferred,
  }
  if (input.today.slice(0, 7) === input.lockMonth && monthKeys.includes(input.lockMonth)) {
    info.sheetCompare = dshSheetCompareFor(input.dsh, input.lockMonth)
  }
  return { dsh, info }
}
