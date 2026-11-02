// 하드웨어 재고관리 프로세스 일일 알림 — 배송 예정 30일 경과 · 샘플 반납 예정일 지남(§6 D9).
// 고르는 규칙과 메시지 모양만 둔다(순수 함수, DB·Next 의존 없음). 읽기는 lib/repositories/hardware-process-alerts.ts,
// 발송은 lib/server/hardware-process-alerts.ts, 깨우는 곳은 /api/cron/dispatch/[slot] 의 고정 슬롯이다.
// 경과·회수 규칙은 lib/hardware/inventory-process.ts 의 함수를 그대로 쓴다 — 여기서 다시 만들지 않는다.
// 문서: docs/active/hardware-inventory-process-gap-2026-10-28.md §3-2·§6 D9.

import {
  PLANNED_STALE_DAYS,
  isPlannedProgressStatus,
  plannedAgeBasis,
  plannedAgeDays,
  resolveOutboundType,
  returnableQuantity,
} from "@/lib/hardware/inventory-process"
import { kstHourToUtcSlot } from "@/lib/notifications/schedule"

/** 알림 이벤트 종류 — notification_events.event_type. */
export const HARDWARE_PROCESS_ALERT_EVENT_TYPE = "hardware.process.daily_alert"
/** 같은 날 두 번 보내지 않게 하는 키의 source(notification_events.source). source_id 는 KST 날짜. */
export const HARDWARE_PROCESS_ALERT_SOURCE = "hardware_process_alerts"

/** 매일 보내는 시각(KST). 출근 전에 방에 올라와 있게 하고, 09~11시 크론 묶음(채널톡·연락 동기화·아침 카드)을 피한다. */
export const HARDWARE_PROCESS_ALERT_KST_HOUR = 8
/** /api/cron/dispatch/[slot] 의 UTC 슬롯(= 23). 새 크론·vercel.json 변경 없이 편승한다. */
export const HARDWARE_PROCESS_ALERT_UTC_SLOT = kstHourToUtcSlot(HARDWARE_PROCESS_ALERT_KST_HOUR)

/** 메시지에 싣는 줄 수 상한 — 넘으면 "외 N건"으로 줄인다. */
export const HARDWARE_PROCESS_ALERT_MAX_ITEMS = 20
/**
 * 메시지 본문 바이트 상한(UTF-8). WeCom 텍스트는 2,048바이트까지 받는다 — 제목·"Open:" 줄 몫을 빼고 남긴다.
 * 한글은 한 글자 3바이트라 글자 수로 세면 넘친다.
 */
export const HARDWARE_PROCESS_ALERT_MESSAGE_BYTES = 1_700

export const NO_OWNER_LABEL = "담당자 없음"

const DAY_MS = 86_400_000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DATE_KEY = /^(\d{4}-\d{2}-\d{2})/

/** 알림이 읽는 원장 행 — 기본 칸 + (있으면) 프로세스 칸. */
export interface ProcessAlertMovementRow {
  id: string
  product_name: string
  movement_type: string
  quantity: number
  occurred_at: string | null
  created_at: string
  to_location: string | null
  owner: string | null
  status: string | null
  memo: string | null
  voided_at: string | null
  // 20261028_hardware_inventory_process.sql — 적용 전 DB 에는 없다.
  owner_user_id?: string | null
  outbound_type?: string | null
  expected_return_at?: string | null
  return_of_movement_id?: string | null
}

export interface StalePlannedAlertItem {
  kind: "stale_planned"
  id: string
  productName: string
  quantity: number
  customer: string | null
  /** 예정일이 있으면 예정일, 없으면 등록일(KST 날짜). */
  basisDate: string
  basisKind: "planned" | "created"
  ageDays: number
}

export interface OverdueSampleAlertItem {
  kind: "overdue_sample"
  id: string
  productName: string
  /** 아직 돌아오지 않은 수량. */
  outstanding: number
  quantity: number
  customer: string | null
  expectedReturnAt: string
  overdueDays: number
}

export type ProcessAlertItem = StalePlannedAlertItem | OverdueSampleAlertItem

export interface ProcessAlertOwnerGroup {
  /** 묶음 키 — `user:<계정 id>` · `name:<정리한 이름>` · `none`. */
  key: string
  label: string
  stalePlanned: StalePlannedAlertItem[]
  overdueSamples: OverdueSampleAlertItem[]
}

export interface ProcessAlertSelection {
  /** 기준일(KST). */
  dateKey: string
  groups: ProcessAlertOwnerGroup[]
  stalePlannedCount: number
  overdueSampleCount: number
  /** false = 프로세스 칸이 없는 DB(마이그레이션 전) — 샘플 반납 확인을 건너뛰었다. */
  sampleCheckAvailable: boolean
}

/** KST 날짜 키(YYYY-MM-DD). */
export function kstDateKey(value: Date | string): string | null {
  if (typeof value === "string") {
    // 날짜만 있는 값(YYYY-MM-DD)은 그대로 — 시각이 있는 값만 KST 로 옮긴다.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
    const time = Date.parse(value)
    if (!Number.isFinite(time)) return DATE_KEY.exec(value)?.[1] ?? null
    return new Date(time + KST_OFFSET_MS).toISOString().slice(0, 10)
  }
  const time = value.getTime()
  if (!Number.isFinite(time)) return null
  return new Date(time + KST_OFFSET_MS).toISOString().slice(0, 10)
}

function dateKeyDiffDays(laterKey: string, earlierKey: string): number {
  const later = Date.parse(`${laterKey}T00:00:00.000Z`)
  const earlier = Date.parse(`${earlierKey}T00:00:00.000Z`)
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return 0
  return Math.round((later - earlier) / DAY_MS)
}

function cleanText(value: string | null | undefined): string | null {
  const text = (value ?? "").trim()
  return text ? text : null
}

function nameKey(value: string | null | undefined): string | null {
  const key = (value ?? "").replace(/\s+/g, "").toLowerCase()
  return key ? key : null
}

interface OwnerResolver {
  resolve(row: Pick<ProcessAlertMovementRow, "owner" | "owner_user_id">): { key: string; label: string }
}

/**
 * 담당자 묶음 — 계정 id 가 있으면 계정, 없으면 담당자 이름, 둘 다 없으면 "담당자 없음".
 * 계정이 붙기 전 행(이름만 있음)은 같은 이름을 가진 계정 묶음이 하나뿐일 때 그 묶음에 합친다.
 */
function buildOwnerResolver(rows: readonly Pick<ProcessAlertMovementRow, "owner" | "owner_user_id">[]): OwnerResolver {
  const userLabels = new Map<string, string>()
  for (const row of rows) {
    const userId = cleanText(row.owner_user_id)
    if (!userId) continue
    const name = cleanText(row.owner)
    if (name && !userLabels.has(userId)) userLabels.set(userId, name)
    else if (!userLabels.has(userId)) userLabels.set(userId, "")
  }
  const usersByName = new Map<string, string[]>()
  for (const [userId, label] of userLabels) {
    const key = nameKey(label)
    if (!key) continue
    usersByName.set(key, [...(usersByName.get(key) ?? []), userId])
  }
  const userGroup = (userId: string) => ({
    key: `user:${userId}`,
    label: userLabels.get(userId) || `계정 ${userId.slice(0, 8)}`,
  })
  return {
    resolve(row) {
      const userId = cleanText(row.owner_user_id)
      if (userId) return userGroup(userId)
      const name = cleanText(row.owner)
      const key = nameKey(name)
      if (!name || !key) return { key: "none", label: NO_OWNER_LABEL }
      const matches = usersByName.get(key)
      if (matches && matches.length === 1) return userGroup(matches[0])
      return { key: `name:${key}`, label: name }
    },
  }
}

/**
 * 오늘 알릴 건을 고른다.
 * - 배송 예정 30일 경과: 취소 안 된 출고 중 예정 상태(isPlannedProgressStatus)이고 plannedAgeDays ≥ PLANNED_STALE_DAYS.
 *   기준일은 예정일, 없으면 등록일(D9).
 * - 샘플 반납 지남: 취소 안 된 실제(예정 아님) 출고 중 유형이 샘플(resolveOutboundType)이고 반납 예정일이 오늘(KST) 전이며
 *   아직 회수할 수량이 남은 건. 회수량 = 그 출고를 가리키는(return_of_movement_id) 취소 안 된 회수 행 합.
 * sampleCheckAvailable=false 면(프로세스 칸 없음) 샘플 쪽은 고르지 않는다.
 */
export function selectProcessAlerts(
  rows: readonly ProcessAlertMovementRow[],
  now: Date,
  options: { sampleCheckAvailable?: boolean } = {}
): ProcessAlertSelection {
  const sampleCheckAvailable = options.sampleCheckAvailable !== false
  const today = kstDateKey(now) ?? now.toISOString().slice(0, 10)
  const live = rows.filter((row) => !row.voided_at)

  const returnedByOutbound = new Map<string, number[]>()
  if (sampleCheckAvailable) {
    for (const row of live) {
      if (row.movement_type !== "return") continue
      const originalId = cleanText(row.return_of_movement_id)
      if (!originalId) continue
      returnedByOutbound.set(originalId, [...(returnedByOutbound.get(originalId) ?? []), row.quantity])
    }
  }

  const picked: Array<{ row: ProcessAlertMovementRow; item: ProcessAlertItem }> = []
  for (const row of live) {
    if (row.movement_type !== "outbound") continue
    if (isPlannedProgressStatus(row.status)) {
      const ageDays = plannedAgeDays(row, now)
      if (ageDays < PLANNED_STALE_DAYS) continue
      const basis = plannedAgeBasis(row)
      picked.push({
        row,
        item: {
          kind: "stale_planned",
          id: row.id,
          productName: row.product_name,
          quantity: row.quantity,
          customer: cleanText(row.to_location),
          basisDate: kstDateKey(basis) ?? basis,
          basisKind: row.occurred_at ? "planned" : "created",
          ageDays,
        },
      })
      continue
    }
    if (!sampleCheckAvailable) continue
    const expected = kstDateKey(row.expected_return_at ?? "")
    if (!expected || expected >= today) continue
    if (resolveOutboundType(row) !== "sample") continue
    const outstanding = returnableQuantity(row, returnedByOutbound.get(row.id) ?? [])
    if (outstanding <= 0) continue
    picked.push({
      row,
      item: {
        kind: "overdue_sample",
        id: row.id,
        productName: row.product_name,
        outstanding,
        quantity: row.quantity,
        customer: cleanText(row.to_location),
        expectedReturnAt: expected,
        overdueDays: dateKeyDiffDays(today, expected),
      },
    })
  }

  const owners = buildOwnerResolver(picked.map(({ row }) => row))
  const groups = new Map<string, ProcessAlertOwnerGroup>()
  for (const { row, item } of picked) {
    const owner = owners.resolve(row)
    let group = groups.get(owner.key)
    if (!group) {
      group = { key: owner.key, label: owner.label, stalePlanned: [], overdueSamples: [] }
      groups.set(owner.key, group)
    }
    if (item.kind === "stale_planned") group.stalePlanned.push(item)
    else group.overdueSamples.push(item)
  }

  const sorted = [...groups.values()]
  for (const group of sorted) {
    group.stalePlanned.sort((a, b) => b.ageDays - a.ageDays || a.productName.localeCompare(b.productName, "ko"))
    group.overdueSamples.sort((a, b) => b.overdueDays - a.overdueDays || a.productName.localeCompare(b.productName, "ko"))
  }
  // 건수 많은 담당자 먼저, "담당자 없음"은 맨 뒤.
  sorted.sort((a, b) => {
    if (a.key === "none" || b.key === "none") return a.key === "none" ? (b.key === "none" ? 0 : 1) : -1
    const countDiff = groupSize(b) - groupSize(a)
    return countDiff || a.label.localeCompare(b.label, "ko")
  })

  return {
    dateKey: today,
    groups: sorted,
    stalePlannedCount: picked.filter(({ item }) => item.kind === "stale_planned").length,
    overdueSampleCount: picked.filter(({ item }) => item.kind === "overdue_sample").length,
    sampleCheckAvailable,
  }
}

function groupSize(group: ProcessAlertOwnerGroup) {
  return group.stalePlanned.length + group.overdueSamples.length
}

export function processAlertTotal(selection: Pick<ProcessAlertSelection, "stalePlannedCount" | "overdueSampleCount">) {
  return selection.stalePlannedCount + selection.overdueSampleCount
}

// ── 메시지 ─────────────────────────────────────────────────────────────────────

function utf8Bytes(text: string) {
  return new TextEncoder().encode(text).length
}

function customerPart(customer: string | null) {
  return customer ?? "출고처 미기재"
}

export function formatProcessAlertItem(item: ProcessAlertItem): string {
  if (item.kind === "stale_planned") {
    const basis = item.basisKind === "planned" ? `예정일 ${item.basisDate}` : `등록 ${item.basisDate}(예정일 없음)`
    return `· [배송 예정] ${item.productName} ×${item.quantity} · ${customerPart(item.customer)} · ${basis} · ${item.ageDays}일 경과`
  }
  const quantity = item.outstanding === item.quantity ? `×${item.quantity}` : `미반납 ${item.outstanding}/${item.quantity}대`
  return `· [샘플] ${item.productName} ${quantity} · ${customerPart(item.customer)} · 반납 예정 ${item.expectedReturnAt} · ${item.overdueDays}일 지남`
}

function ownerHeader(group: ProcessAlertOwnerGroup) {
  const parts = [
    group.stalePlanned.length ? `배송 예정 ${group.stalePlanned.length}` : null,
    group.overdueSamples.length ? `샘플 ${group.overdueSamples.length}` : null,
  ].filter(Boolean)
  return `■ ${group.label} — ${parts.join(" · ")}`
}

export interface ProcessAlertMessage {
  title: string
  message: string
  /** 메시지에 실은 줄 수. */
  shownItems: number
  /** 상한 때문에 뺀 줄 수. */
  omittedItems: number
}

/**
 * 하루 한 통 — 담당자별 묶음. 줄 수(maxItems)와 바이트(maxBytes) 상한을 넘으면 뒤를 자르고 "외 N건"을 붙인다.
 * 담당자 머리줄의 건수는 자른 뒤에도 전체 건수다.
 */
export function buildProcessAlertMessage(
  selection: ProcessAlertSelection,
  options: { maxItems?: number; maxBytes?: number } = {}
): ProcessAlertMessage {
  const maxItems = Math.max(0, options.maxItems ?? HARDWARE_PROCESS_ALERT_MAX_ITEMS)
  const maxBytes = Math.max(0, options.maxBytes ?? HARDWARE_PROCESS_ALERT_MESSAGE_BYTES)
  const total = processAlertTotal(selection)
  const titleParts = [
    selection.stalePlannedCount ? `배송 예정 ${PLANNED_STALE_DAYS}일 경과 ${selection.stalePlannedCount}건` : null,
    selection.overdueSampleCount ? `샘플 반납 지남 ${selection.overdueSampleCount}건` : null,
  ].filter(Boolean)
  const title = `하드웨어 확인 필요 — ${titleParts.join(" · ") || "해당 없음"}`

  const lines: string[] = [
    `${selection.dateKey} 기준 · 담당자 ${selection.groups.length}명. 확정·회수하거나 예정일·반납 예정일을 고쳐 주세요.`,
  ]
  // "외 N건" 줄 몫을 미리 남긴다.
  const tailReserve = utf8Bytes(`\n\n외 ${total}건은 하드웨어 탭에서 확인하세요.`)
  let used = utf8Bytes(lines[0])
  let shown = 0
  let full = false

  const tryPush = (line: string, separator = "\n") => {
    const cost = utf8Bytes(separator + line)
    if (used + cost + tailReserve > maxBytes) return false
    lines.push(separator === "\n\n" ? `\n${line}` : line)
    used += cost
    return true
  }

  for (const group of selection.groups) {
    if (full) break
    const items: ProcessAlertItem[] = [...group.stalePlanned, ...group.overdueSamples]
    if (shown >= maxItems || !tryPush(ownerHeader(group), "\n\n")) {
      full = true
      break
    }
    for (const item of items) {
      if (shown >= maxItems || !tryPush(formatProcessAlertItem(item))) {
        full = true
        break
      }
      shown += 1
    }
  }

  const omitted = total - shown
  if (omitted > 0) lines.push(`\n외 ${omitted}건은 하드웨어 탭에서 확인하세요.`)
  if (!selection.sampleCheckAvailable) {
    const note = "(샘플 반납 확인은 DB 업데이트 적용 후 실립니다.)"
    if (used + utf8Bytes(`\n${note}`) + tailReserve <= maxBytes) lines.push(note)
  }

  return { title, message: lines.join("\n"), shownItems: shown, omittedItems: omitted }
}
