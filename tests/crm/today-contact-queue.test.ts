import { describe, expect, it } from "vitest"

import type { NeoCrmCustomerRow } from "@/lib/admin-crm-customers-neo"
import type { CompassLeadIndexRow, CompassNextActionRow } from "@/lib/compass/bridge"
import type { LastContactFact } from "@/lib/crm/last-contact"
import {
  buildTodayContacts,
  collectTodayContactPhoneKeys,
  defaultTodayContactNextTitle,
  isTodayContactSnoozeOutcome,
  maskTodayContactHandle,
  resolveTodayContactNextDueAt,
  todayContactCustomerHref,
  todayContactDateKey,
  todayContactLanePattern,
  todayContactSnoozeOutcome,
  TODAY_CONTACT_UNDO_OUTCOME,
  type TodayContactQueueInput,
} from "@/lib/crm/today-contact-queue"
import type { CrmTaskRecord } from "@/lib/repositories/crm-tasks"
import type { LeadRecord } from "@/lib/repositories/leads"

// 기준 시각: 2026-09-25(금) 12:00 KST = 03:00Z. 오늘(KST) = 09-24T15:00Z ~ 09-25T15:00Z.
const NOW = new Date("2026-09-25T03:00:00.000Z")
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString()

function lead(overrides: Partial<LeadRecord> & { id: string }): LeadRecord {
  return {
    source: "contact_page",
    name: `담당자 ${overrides.id}`,
    org: `학원 ${overrides.id}`,
    phone: null as unknown as string,
    timestamp: at(-2 * HOUR),
    status: "new",
    ...overrides,
  } as LeadRecord
}

function neo(overrides: Partial<NeoCrmCustomerRow> & { accountId: string }): NeoCrmCustomerRow {
  return {
    name: `기관 ${overrides.accountId}`,
    ownerId: null,
    ownerName: "박담당",
    phone: null,
    balance: 100,
    expireAt: null,
    lastClassAt: at(-2 * DAY),
    uid: null,
    orderAmount: 0,
    orderCount: 0,
    createdAt: null,
    updatedAt: null,
    riskReasons: [],
    ...overrides,
  }
}

function task(overrides: Partial<CrmTaskRecord> & { id: string }): CrmTaskRecord {
  return {
    targetType: "unknown",
    targetId: null,
    targetLabel: null,
    ownerKey: null,
    ownerNameSnapshot: null,
    taskType: "call",
    title: `할 일 ${overrides.id}`,
    detail: null,
    dueAt: at(2 * HOUR),
    snoozedUntil: null,
    priority: "normal",
    status: "open",
    sourceEventId: null,
    createdBy: null,
    assignedBy: null,
    completedAt: null,
    completedBy: null,
    outcome: null,
    createdAt: at(-5 * DAY),
    updatedAt: at(-5 * DAY),
    ...overrides,
  }
}

function due(overrides: Partial<CompassNextActionRow> & { id: number }): CompassNextActionRow {
  return {
    academy: `Compass 학원 ${overrides.id}`,
    name: null,
    phone_key: null,
    stage: "contact",
    owner: "이콤",
    caller: null,
    bd_owner: null,
    care_stage: null,
    next_action_at: at(1 * HOUR),
    next_action: null,
    created_at: at(-10 * DAY),
    updated_at: null,
    last_inflow_at: null,
    ...overrides,
  }
}

function indexRow(overrides: Partial<CompassLeadIndexRow> & { id: number; phone_key: string }): CompassLeadIndexRow {
  return {
    stage: "contact",
    owner: "이콤",
    caller: null,
    bd_owner: null,
    care_stage: null,
    next_action_at: null,
    created_at: at(-10 * DAY),
    updated_at: null,
    last_inflow_at: null,
    ...overrides,
  }
}

function input(overrides: Partial<TodayContactQueueInput> = {}): TodayContactQueueInput {
  return {
    now: NOW,
    leads: [],
    neoRows: [],
    tasks: [],
    closedTasksToday: [],
    engagements: null,
    demoIndex: null,
    homeContacts: new Map(),
    compass: { dueActions: [], leadIndex: [], latestContacts: new Map() },
    sources: { leadsOk: true, neoAccountsOk: true, tasksOk: true, closedTasksOk: true },
    neoSync: { latestSyncedAt: "2026-08-28T00:00:00.000Z", stale: true },
    limit: 60,
    ...overrides,
  }
}

const PHONE_A = "010-1111-2002"
const KEY_A = "01011112002"
const PHONE_B = "010-3333-4004"
const KEY_B = "01033334004"

describe("오늘 연락 — 병합", () => {
  it("같은 리드의 팔로업·할 일·Compass 다음 액션을 한 행으로 합치고 사유를 기한 순으로 나열한다", () => {
    const result = buildTodayContacts(
      input({
        leads: [
          lead({ id: "L1", status: "contacted", confirmed_at: at(-9 * DAY), phone: PHONE_A, follow_up_at: at(-2 * DAY) }),
        ],
        tasks: [task({ id: "T1", targetType: "lead", targetId: "L1", dueAt: at(3 * HOUR) })],
        compass: {
          dueActions: [due({ id: 77, phone_key: KEY_A, next_action_at: at(1 * HOUR), next_action: "견적 설명 후 재통화" })],
          leadIndex: [indexRow({ id: 77, phone_key: KEY_A })],
          latestContacts: new Map(),
        },
      })
    )
    expect(result.rows).toHaveLength(1)
    const [row] = result.rows
    expect(row.key).toBe("lead:L1")
    expect(row.reasons.map((reason) => reason.kind)).toEqual(["follow_up", "compass_next_action", "task"])
    expect(row.reasons[0].overdue).toBe(true)
    expect(row.overdue).toBe(true)
    expect(row.openTaskIds).toEqual(["T1"])
    // Compass 에 매칭된 리드 — 주 행동은 "Compass에서 열기"뿐.
    expect(row.primaryAction).toBe("open_compass")
    expect(row.compass?.leadId).toBe(77)
    expect(row.compass?.url).toBe("https://mkt.classin.co.kr/leads?open=77")
    expect(row.lane).toBe("reengage")
    expect(result.counts.bySource.compass_next_action).toBe(1)
  })

  it("Compass 다음 액션은 한 엔티티에만 붙는다 — Home 리드 → NEO 계정 → Compass 단독 순", () => {
    const longText = "가".repeat(80)
    const result = buildTodayContacts(
      input({
        leads: [lead({ id: "L1", status: "contacted", confirmed_at: at(-9 * DAY), phone: PHONE_A, timestamp: at(-30 * DAY) })],
        neoRows: [neo({ accountId: "N1", phone: PHONE_B, lastClassAt: null, balance: 0 })],
        compass: {
          dueActions: [
            due({ id: 1, phone_key: KEY_A }),
            due({ id: 2, phone_key: KEY_B, stage: "quote" }),
            due({ id: 3, phone_key: "01099998008", next_action: longText, owner: "정마케" }),
          ],
          leadIndex: [],
          latestContacts: new Map(),
        },
      })
    )
    const keys = result.rows.map((row) => row.key).sort()
    expect(keys).toEqual(["compass:3", "lead:L1", "neo:N1"])
    const compassRow = result.rows.find((row) => row.key === "compass:3")!
    expect(compassRow.entityType).toBe("compass_lead")
    expect(compassRow.primaryAction).toBe("open_compass")
    // 문구는 60자로 잘라 표시만 한다.
    expect(Array.from(compassRow.reasons[0].detail ?? "").length).toBeLessThanOrEqual(60)
    expect(compassRow.ownerKeys).toContain("정마케")
    const neoRow = result.rows.find((row) => row.key === "neo:N1")!
    expect(neoRow.primaryAction).toBe("record_outcome")
    expect(neoRow.lane).toBe("money")
    // 다음 액션이 붙은 리드는 Compass 에 있는 리드다 — 주 행동은 열기.
    const leadRow = result.rows.find((row) => row.key === "lead:L1")!
    expect(leadRow.primaryAction).toBe("open_compass")
    expect(leadRow.compass?.leadId).toBe(1)
  })

  it("NEO 등록 확정 리드는 Compass 매칭이 있어도 Home 기록 — 360·리드 보드와 같은 판정(write-surface)", () => {
    const base = {
      leads: [lead({ id: "L1", status: "contacted" as const, confirmed_at: at(-9 * DAY), phone: PHONE_A, follow_up_at: at(-2 * DAY) })],
      compass: {
        dueActions: [],
        leadIndex: [indexRow({ id: 77, phone_key: KEY_A })],
        latestContacts: new Map(),
      },
    }
    const registered = buildTodayContacts(input({ ...base, neoRegisteredLeadIds: new Set(["L1"]) }))
    expect(registered.rows[0].primaryAction).toBe("record_outcome_lead")
    // Compass 참조는 남겨 화면이 보조 링크로 쓸 수 있다.
    expect(registered.rows[0].compass?.leadId).toBe(77)
    const unknown = buildTodayContacts(input({ ...base, neoRegisteredLeadIds: null }))
    expect(unknown.rows[0].primaryAction).toBe("open_compass")
  })

  it("Compass 에 없는 Home 리드는 행 안 입력(record_outcome_lead) 폴백", () => {
    const result = buildTodayContacts(input({ leads: [lead({ id: "L1", phone: PHONE_A })] }))
    expect(result.rows[0].primaryAction).toBe("record_outcome_lead")
    expect(result.rows[0].compass).toBeNull()
    expect(result.sources.compass).toBe("ok")
  })

  it("14일보다 오래 지난 Compass 다음 액션은 목록에 올리지 않고 건수만 센다 · 종료 단계는 뺀다", () => {
    const result = buildTodayContacts(
      input({
        compass: {
          dueActions: [
            due({ id: 1, next_action_at: at(-20 * DAY) }),
            due({ id: 2, next_action_at: at(-13 * DAY) }),
            due({ id: 3, stage: "lost" }),
            due({ id: 4, care_stage: "closed" }),
          ],
          leadIndex: [],
          latestContacts: new Map(),
        },
      })
    )
    expect(result.rows.map((row) => row.key)).toEqual(["compass:2"])
    expect(result.rows[0].reasons[0].label).toBe("Compass 다음 액션 · 13일 지남")
    expect(result.counts.compassOverdueBeyondLookback).toBe(1)
  })

  it("14일 넘은 건수는 건수 전용 조회(beyondLookback)에서 센다 — 열린 액션·담당 필터를 같은 규칙으로, 목록과 겹친 행은 한 번만", () => {
    const result = buildTodayContacts(
      input({
        compass: {
          // 목록 창 조회에 창 밖 행(id 5)이 섞여 와도 건수 조회와 합쳐 한 번만 센다.
          dueActions: [
            due({ id: 1, next_action_at: at(-2 * DAY), owner: "김담당" }),
            due({ id: 5, next_action_at: at(-20 * DAY), owner: "김담당" }),
          ],
          beyondLookback: [
            due({ id: 5, next_action_at: at(-20 * DAY), owner: "김담당" }),
            due({ id: 6, next_action_at: at(-400 * DAY), owner: "김담당" }),
            due({ id: 7, next_action_at: at(-30 * DAY), owner: "최담당" }),
            due({ id: 8, next_action_at: at(-30 * DAY), owner: "김담당", stage: "lost" }),
          ],
          beyondLookbackTruncated: false,
          leadIndex: [],
          latestContacts: new Map(),
        },
        ownerKeys: ["김담당"],
      })
    )
    expect(result.rows.map((row) => row.key)).toEqual(["compass:1"])
    expect(result.counts.compassOverdueBeyondLookback).toBe(2)
    expect(result.sources.compass).toBe("ok")
  })

  it("건수 전용 조회만 실패하면 목록은 그대로 서고 partial·경고(0 과 구분) — 잘리면 하한이라 partial", () => {
    const failed = buildTodayContacts(
      input({ compass: { dueActions: [due({ id: 1 })], beyondLookback: null, leadIndex: [], latestContacts: new Map() } })
    )
    expect(failed.rows.map((row) => row.key)).toEqual(["compass:1"])
    expect(failed.sources.compass).toBe("partial")
    expect(failed.sources.warnings).toContain("14일 넘게 지난 Compass 다음 액션 건수를 세지 못했습니다(0건이 아닙니다).")

    const capped = buildTodayContacts(
      input({
        compass: {
          dueActions: [],
          beyondLookback: [due({ id: 9, next_action_at: at(-30 * DAY) })],
          beyondLookbackTruncated: true,
          leadIndex: [],
          latestContacts: new Map(),
        },
      })
    )
    expect(capped.counts.compassOverdueBeyondLookback).toBe(1)
    expect(capped.sources.compass).toBe("partial")
    expect(capped.sources.warnings).toContain("14일 넘게 지난 Compass 다음 액션이 많아 일부만 셌습니다.")
  })
})

describe("오늘 연락 — 연락처 원문 비노출", () => {
  it("NEO 행 보조 줄은 지역 · UID 이고 전화 원문을 싣지 않는다", () => {
    const result = buildTodayContacts(
      input({
        neoRows: [
          neo({ accountId: "N1", phone: PHONE_B, expireAt: at(3 * DAY), regionLabel: "서울 강남", uid: "U-77" }),
          neo({ accountId: "N2", phone: PHONE_A, expireAt: at(4 * DAY) }),
        ],
      })
    )
    const n1 = result.rows.find((row) => row.key === "neo:N1")!
    const n2 = result.rows.find((row) => row.key === "neo:N2")!
    expect(n1.subtitle).toBe("서울 강남 · UID U-77")
    expect(n2.subtitle).toBeNull()
  })

  it("리드 보조 줄은 이름(기관이 제목일 때)만, 이름·기관이 없으면 제목은 가린 연락처", () => {
    const none = null as unknown as string
    const result = buildTodayContacts(
      input({
        leads: [
          lead({ id: "L1", org: "가 학원", name: none, phone: PHONE_A, email: "owner@ga.kr" }),
          lead({ id: "L2", org: none, name: none, phone: PHONE_B, timestamp: at(-3 * HOUR) }),
          lead({ id: "L3", org: none, name: none, email: "ab@naver.com", timestamp: at(-4 * HOUR) }),
          lead({ id: "L4", org: "라 학원", name: "라원장", phone: "010-5555-6006", timestamp: at(-5 * HOUR) }),
        ],
      })
    )
    const byKey = new Map(result.rows.map((row) => [row.key, row]))
    expect(byKey.get("lead:L1")?.subtitle).toBeNull()
    expect(byKey.get("lead:L2")?.title).toBe("이름 없는 리드 (010-****-4004)")
    expect(byKey.get("lead:L2")?.subtitle).toBeNull()
    expect(byKey.get("lead:L3")?.title).toBe("이름 없는 리드 (a***@naver.com)")
    expect(byKey.get("lead:L4")?.subtitle).toBe("라원장")
  })

  it("응답 전체에 전화·이메일 원문(하이픈 형식·키 형식)이 없다 — Compass 다음 액션 문구 속 번호도 가린다", () => {
    const none = null as unknown as string
    const result = buildTodayContacts(
      input({
        leads: [
          lead({ id: "L1", org: "가 학원", name: "김원장", phone: PHONE_A, email: "kim@ga.kr" }),
          lead({ id: "L2", org: none, name: none, phone: "010-7777-8008", timestamp: at(-3 * HOUR) }),
        ],
        neoRows: [neo({ accountId: "N1", phone: PHONE_B, expireAt: at(3 * DAY) })],
        compass: {
          dueActions: [due({ id: 3, phone_key: "01099998008", next_action: "010-9999-8008 로 콜백, 메일 boss@da.kr" })],
          leadIndex: [],
          latestContacts: new Map(),
        },
      })
    )
    expect(result.rows.map((row) => row.key).sort()).toEqual(["compass:3", "lead:L1", "lead:L2", "neo:N1"])
    const json = JSON.stringify(result)
    for (const raw of [
      PHONE_A,
      KEY_A,
      PHONE_B,
      KEY_B,
      "3333-4004",
      "010-7777-8008",
      "01077778008",
      "010-9999-8008",
      "01099998008",
      "kim@ga.kr",
      "boss@da.kr",
    ]) {
      expect(json).not.toContain(raw)
    }
    const compassRow = result.rows.find((row) => row.key === "compass:3")!
    expect(compassRow.reasons[0].detail).toBe("010-****-8008 로 콜백, 메일 ***@da.kr")
  })

  it("maskTodayContactHandle — 전화 앞 3·끝 4, 이메일 앞 1~2글자", () => {
    expect(maskTodayContactHandle("010-1234-5678")).toBe("010-****-5678")
    expect(maskTodayContactHandle("owner@ga.kr")).toBe("ow***@ga.kr")
    expect(maskTodayContactHandle("ab@ga.kr")).toBe("a***@ga.kr")
    expect(maskTodayContactHandle("1234")).toBeNull()
    expect(maskTodayContactHandle(" ")).toBeNull()
  })
})

describe("오늘 연락 — 제외 규칙", () => {
  it("엔진 추천(계정 만료)뿐인 행은 미래 다음 일정이 있으면 뺀다", () => {
    const account = neo({ accountId: "N1", expireAt: at(3 * DAY) })
    const without = buildTodayContacts(input({ neoRows: [account] }))
    expect(without.rows.map((row) => row.key)).toEqual(["neo:N1"])
    expect(without.rows[0].reasons[0].kind).toBe("account_expiry")
    expect(without.rows[0].neoAsOf).toBe("2026-08-28T00:00:00.000Z")

    const withFuture = buildTodayContacts(
      input({
        neoRows: [account],
        tasks: [task({ id: "T9", targetType: "neo_account", targetId: "N1", dueAt: at(3 * DAY) })],
      })
    )
    expect(withFuture.rows).toHaveLength(0)
  })

  it("할 일 기한 도래는 강한 사유라 미래 팔로업이 있어도 남는다", () => {
    const result = buildTodayContacts(
      input({
        leads: [lead({ id: "L1", status: "contacted", confirmed_at: at(-9 * DAY), follow_up_at: at(4 * DAY) })],
        tasks: [task({ id: "T1", targetType: "lead", targetId: "L1", dueAt: at(-1 * DAY) })],
      })
    )
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].reasons[0].kind).toBe("task")
    expect(result.rows[0].nextContact?.kind).toBe("follow_up")
  })

  it("미래 팔로업이 잡힌 신규 리드는 첫 응답 사유를 만들지 않는다", () => {
    const result = buildTodayContacts(input({ leads: [lead({ id: "L1", follow_up_at: at(2 * DAY) })] }))
    expect(result.rows).toHaveLength(0)
  })

  it("사유가 첫 응답뿐인 메타 광고 리드는 목록 대신 메타 밴드로 간다", () => {
    const result = buildTodayContacts(
      input({
        leads: [
          lead({ id: "M1", source: "meta_lead_ads" }),
          lead({ id: "M2", source: "meta_lead_ads", status: "contacted", confirmed_at: at(-3 * DAY), follow_up_at: at(-1 * DAY) }),
        ],
      })
    )
    expect(result.rows.map((row) => row.key)).toEqual(["lead:M2"])
    expect(result.meta.total).toBe(1)
    expect(result.meta.top[0].key).toBe("lead:M1")
  })
})

describe("오늘 연락 — 레인 끼워 넣기", () => {
  it("쿼터 2·2·1 은 상한이 아니라 [신규, 돈, 신규, 돈, 재활성] 패턴이다", () => {
    expect(todayContactLanePattern()).toEqual(["new_response", "money", "new_response", "money", "reengage"])
    const result = buildTodayContacts(
      input({
        leads: [
          lead({ id: "L1", org: "가", timestamp: at(-3 * HOUR) }),
          lead({ id: "L2", org: "나", timestamp: at(-2 * HOUR) }),
          lead({ id: "L3", org: "다", timestamp: at(-1 * HOUR) }),
          lead({ id: "F1", status: "contacted", confirmed_at: at(-9 * DAY), follow_up_at: at(1 * HOUR) }),
        ],
        neoRows: [
          neo({ accountId: "N1", expireAt: at(2 * DAY) }),
          neo({ accountId: "N2", expireAt: at(4 * DAY) }),
          neo({ accountId: "N3", expireAt: at(6 * DAY) }),
        ],
      })
    )
    expect(result.rows.map((row) => row.lane)).toEqual([
      "new_response",
      "money",
      "new_response",
      "money",
      "reengage",
      "new_response",
      "money",
    ])
    // 신규 응대 레인 안은 오래 기다린 순서(첫 응답 = 유입 시각 오름차순).
    expect(result.rows.filter((row) => row.lane === "new_response").map((row) => row.key)).toEqual([
      "lead:L1",
      "lead:L2",
      "lead:L3",
    ])
  })

  it("빈 레인 자리는 돈 → 재활성 → 신규 순으로 대체한다", () => {
    const result = buildTodayContacts(
      input({
        leads: [lead({ id: "F1", status: "contacted", confirmed_at: at(-9 * DAY), follow_up_at: at(1 * HOUR) })],
        neoRows: [neo({ accountId: "N1", expireAt: at(2 * DAY) }), neo({ accountId: "N2", expireAt: at(4 * DAY) })],
      })
    )
    expect(result.rows.map((row) => row.key)).toEqual(["neo:N1", "neo:N2", "lead:F1"])
  })

  it("신규 응대의 같은 기관 중복 리드는 접고 groupedCount 로 센다", () => {
    const result = buildTodayContacts(
      input({ leads: [lead({ id: "L1", org: "한빛 학원" }), lead({ id: "L2", org: "한빛학원", timestamp: at(-1 * HOUR) })] })
    )
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].groupedCount).toBe(2)
  })
})

describe("오늘 연락 — 재문의", () => {
  const reinflowLead = lead({
    id: "R1",
    status: "contacted",
    confirmed_at: at(-40 * DAY),
    timestamp: at(-30 * DAY),
    last_inflow_at: at(-2 * DAY),
    phone: PHONE_A,
  })

  it("최근 14일 재유입 뒤 연락이 없으면 재문의 사유", () => {
    const result = buildTodayContacts(input({ leads: [reinflowLead] }))
    expect(result.rows[0].reasons.map((reason) => reason.kind)).toContain("reinflow")
    expect(result.rows[0].lane).toBe("reengage")
  })

  it("재유입 뒤 Home·Compass 연락이 있으면 재문의가 아니다", () => {
    const contact: LastContactFact = { at: at(-1 * DAY), source: "compass", channel: "call", actor: "이콤" }
    const result = buildTodayContacts(
      input({
        leads: [reinflowLead],
        compass: { dueActions: [], leadIndex: [], latestContacts: new Map([[KEY_A, contact]]) },
      })
    )
    expect(result.rows).toHaveLength(0)
  })

  it("Compass 가 끊기면(전화가 있는 리드) 미접촉을 단정하지 않는다", () => {
    const result = buildTodayContacts(
      input({ leads: [reinflowLead], compass: { dueActions: null, leadIndex: null, latestContacts: null } })
    )
    expect(result.rows).toHaveLength(0)
    expect(result.sources.compass).toBe("down")
  })

  it("백필(last_inflow_at = 생성 시각)은 재문의가 아니다", () => {
    const backfilled = { ...reinflowLead, last_inflow_at: reinflowLead.timestamp }
    expect(buildTodayContacts(input({ leads: [backfilled] })).rows).toHaveLength(0)
  })
})

describe("오늘 연락 — 처리 판정·진행률(추정)", () => {
  it("오늘 Home 연락이 있는 계정 행은 처리됨 — 진행률에 남고 includeHandled=false 면 목록에서만 빠진다", () => {
    const account = neo({ accountId: "N1", expireAt: at(3 * DAY) })
    const homeContacts = new Map<string, LastContactFact>([
      ["neo_account:N1", { at: at(-1 * HOUR), source: "home_event", channel: "call", actor: "박담당" }],
    ])
    const result = buildTodayContacts(
      input({
        neoRows: [account],
        homeContacts,
        tasks: [task({ id: "T2", targetType: "neo_account", targetId: "N1", dueAt: at(3 * DAY), sourceEventId: "E1" })],
      })
    )
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].handled?.kind).toBe("contact_logged")
    expect(result.rows[0].handled?.nextAt).toBe(at(3 * DAY))
    expect(result.progress).toMatchObject({ total: 1, handled: 1, remaining: 0, approximate: true })
    expect(result.progress.byLane.money).toEqual({ total: 1, handled: 1 })

    const hidden = buildTodayContacts(input({ neoRows: [account], homeContacts, includeHandled: false }))
    expect(hidden.rows).toHaveLength(0)
    expect(hidden.progress.total).toBe(1)
  })

  it("어제 연락한 계정은 오늘 처리가 아니다", () => {
    const result = buildTodayContacts(
      input({
        neoRows: [neo({ accountId: "N1", expireAt: at(3 * DAY) })],
        homeContacts: new Map([["neo_account:N1", { at: at(-13 * HOUR), source: "home_event", channel: "call", actor: null }]]),
      })
    )
    expect(result.rows[0].handled).toBeNull()
    expect(result.rows[0].lastContact?.channelLabel).toBe("콜 기록")
  })

  it("오늘 닫은(기한이 오늘 이전이던) 할 일은 처리된 행으로 남는다", () => {
    const result = buildTodayContacts(
      input({
        closedTasksToday: [
          task({ id: "T1", status: "done", dueAt: at(-1 * DAY), completedAt: at(-1 * HOUR), completedBy: "김담당" }),
          task({ id: "T2", status: "done", dueAt: at(5 * DAY), completedAt: at(-1 * HOUR) }),
        ],
      })
    )
    expect(result.rows.map((row) => row.key)).toEqual(["task:T1"])
    expect(result.rows[0].handled).toMatchObject({ kind: "task_done", by: "김담당", approximate: false })
    expect(result.rows[0].primaryAction).toBe("complete_task")
  })

  it("오늘 연락 미루기(취소 + '미룸 →')는 '미룸' 흔적 — 완료로 보이지 않고, 다음 연락은 이어받은 할 일", () => {
    expect(todayContactSnoozeOutcome("2026-09-26T00:00:00.000Z")).toBe("미룸 → 다음 09-26")
    expect(isTodayContactSnoozeOutcome("미룸 → 다음 09-26")).toBe(true)
    expect(isTodayContactSnoozeOutcome("전화 · 부재 → 다음 09-26")).toBe(false)
    const result = buildTodayContacts(
      input({
        neoRows: [neo({ accountId: "N1", expireAt: at(3 * DAY) })],
        tasks: [
          task({ id: "C1", targetType: "neo_account", targetId: "N1", dueAt: "2026-09-26T00:00:00.000Z", createdAt: at(-1 * HOUR) }),
        ],
        closedTasksToday: [
          task({
            id: "T1",
            targetType: "neo_account",
            targetId: "N1",
            status: "canceled",
            outcome: "미룸 → 다음 09-26",
            dueAt: at(-1 * DAY),
            completedAt: at(-1 * HOUR),
            completedBy: "김운영",
          }),
        ],
      })
    )
    expect(result.rows.map((row) => row.key)).toEqual(["neo:N1"])
    const [row] = result.rows
    expect(row.handled).toMatchObject({
      kind: "task_snoozed",
      by: "김운영",
      nextAt: "2026-09-26T00:00:00.000Z",
      approximate: false,
    })
    expect(result.progress).toMatchObject({ total: 1, handled: 1, remaining: 0 })
  })

  it("되돌리기가 취소한 할 일은 처리 흔적이 아니다 — 다시 열린 오늘 할 일이 남은 행은 처리 전(진행률 부풀림 방지)", () => {
    const result = buildTodayContacts(
      input({
        neoRows: [neo({ accountId: "N1" })],
        // 되돌리기로 다시 열린 원래 할 일(오늘 기한).
        tasks: [task({ id: "T1", targetType: "neo_account", targetId: "N1", dueAt: at(-1 * HOUR) })],
        // 결과 저장이 만든 오늘 18:00 다음 일정 → 되돌리기로 취소.
        closedTasksToday: [
          task({
            id: "C1",
            targetType: "neo_account",
            targetId: "N1",
            status: "canceled",
            outcome: TODAY_CONTACT_UNDO_OUTCOME,
            dueAt: "2026-09-25T09:00:00.000Z",
            createdAt: at(-2 * 60_000),
            completedAt: at(-1 * 60_000),
            completedBy: "김운영",
          }),
        ],
      })
    )
    expect(result.rows.map((row) => row.key)).toEqual(["neo:N1"])
    expect(result.rows[0].handled).toBeNull()
    expect(result.rows[0].openTaskIds).toEqual(["T1"])
    expect(result.progress).toMatchObject({ total: 1, handled: 0, remaining: 1 })
  })

  it("손으로 한 취소도 처리가 아니다 — 그 할 일뿐이던 행은 목록에서 빠진다", () => {
    const result = buildTodayContacts(
      input({
        closedTasksToday: [
          task({ id: "T1", status: "canceled", outcome: null, dueAt: at(-1 * DAY), completedAt: at(-1 * HOUR) }),
          task({ id: "T2", status: "done", outcome: "통화 완료", dueAt: at(-1 * DAY), completedAt: at(-1 * HOUR) }),
        ],
      })
    )
    expect(result.rows.map((row) => row.key)).toEqual(["task:T2"])
    expect(result.progress).toMatchObject({ total: 1, handled: 1 })
  })

  it("Compass 에서 오늘 처리된 메타 첫 응답은 분모에서 빼고 따로 센다", () => {
    const result = buildTodayContacts(
      input({
        leads: [lead({ id: "M1", source: "meta_lead_ads", phone: PHONE_A })],
        compass: {
          dueActions: [],
          leadIndex: [indexRow({ id: 5, phone_key: KEY_A })],
          latestContacts: new Map([[KEY_A, { at: at(-1 * HOUR), source: "compass", channel: "call", actor: "이콤" }]]),
        },
      })
    )
    expect(result.rows).toHaveLength(0)
    expect(result.meta.total).toBe(0)
    expect(result.progress.compassHandledToday).toBe(1)
    expect(result.progress.total).toBe(0)
  })
})

describe("오늘 연락 — 담당 필터·원천 상태", () => {
  it("담당 필터는 병합 뒤 행의 담당 키(Home + Compass)로 건다 — 담당 목록은 필터 전 기준", () => {
    const result = buildTodayContacts(
      input({
        leads: [
          lead({ id: "L1", assigned_to: "김담당" }),
          lead({ id: "L2", assigned_to: "최담당", org: "다른 학원" }),
        ],
        compass: { dueActions: [due({ id: 9, owner: "김담당" })], leadIndex: [], latestContacts: new Map() },
        ownerKeys: ["김담당"],
      })
    )
    expect(result.rows.map((row) => row.key).sort()).toEqual(["compass:9", "lead:L1"])
    expect(result.owners).toEqual([
      { ownerName: "김담당", count: 2 },
      { ownerName: "최담당", count: 1 },
    ])
  })

  it("Compass 리드 인덱스가 끊기면 리드는 Home 입력 폴백 + partial", () => {
    const result = buildTodayContacts(
      input({
        leads: [lead({ id: "L1", phone: PHONE_A })],
        compass: { dueActions: [], leadIndex: null, latestContacts: new Map() },
      })
    )
    expect(result.rows[0].primaryAction).toBe("record_outcome_lead")
    expect(result.sources.compass).toBe("partial")
    expect(result.sources.warnings.some((warning) => warning.includes("Compass 리드 매칭"))).toBe(true)
  })

  it("상한을 넘으면 truncated 와 limit 을 싣는다(진행률은 전체 기준)", () => {
    const leads = Array.from({ length: 5 }, (_, index) => lead({ id: `L${index}`, org: `학원${index}` }))
    const result = buildTodayContacts(input({ leads, limit: 3 }))
    expect(result.rows).toHaveLength(3)
    expect(result.truncated).toEqual({ rows: true, limit: 3, totalRows: 5 })
    expect(result.progress.total).toBe(5)
    expect(result.dateKey).toBe(todayContactDateKey(NOW.getTime()))
    expect(result.dateKey).toBe("2026-09-25")
  })

  it("[새 3] 잘렸을 때 자르기 전 행 수(totalRows)는 접힌 리드를 세지 않는다 — progress.total(대상 수)과 다르다", () => {
    // 같은 기관 3건(한 행으로 접힘) + 다른 기관 4건 = 5행 · 대상 7.
    const same = ["A", "B", "C"].map((id, index) => lead({ id, org: "같은 학원", timestamp: at(-(index + 1) * HOUR) }))
    const others = Array.from({ length: 4 }, (_, index) => lead({ id: `O${index}`, org: `다른 학원${index}` }))
    const result = buildTodayContacts(input({ leads: [...same, ...others], limit: 2 }))
    expect(result.rows).toHaveLength(2)
    expect(result.truncated).toEqual({ rows: true, limit: 2, totalRows: 5 })
    expect(result.progress.total).toBe(7)
    // 원천 칩(행 수)도 5 — 7 이 아니다.
    expect(result.counts.bySource.first_response).toBe(5)
  })
})

describe("오늘 연락 — 다음 일정", () => {
  it("프리셋은 KST 벽시계 고정(영업일 보정 없음)", () => {
    const fridayNoon = NOW.getTime()
    expect(resolveTodayContactNextDueAt({ preset: "tomorrow_9" }, fridayNoon)).toBe("2026-09-26T00:00:00.000Z")
    expect(resolveTodayContactNextDueAt({ preset: "in3_10" }, fridayNoon)).toBe("2026-09-28T01:00:00.000Z")
    expect(resolveTodayContactNextDueAt({ preset: "next_monday_10" }, fridayNoon)).toBe("2026-09-28T01:00:00.000Z")
    const mondayMorning = new Date("2026-09-28T00:30:00.000Z").getTime() // 월 09:30 KST
    expect(resolveTodayContactNextDueAt({ preset: "next_monday_10" }, mondayMorning)).toBe("2026-10-05T01:00:00.000Z")
    expect(resolveTodayContactNextDueAt({ dueAt: "2026-10-01T01:00:00.000Z" }, fridayNoon)).toBe("2026-10-01T01:00:00.000Z")
    expect(resolveTodayContactNextDueAt({ dueAt: "나중에" }, fridayNoon)).toBeNull()
    expect(resolveTodayContactNextDueAt(null, fridayNoon)).toBeNull()
  })

  it("기본 제목은 사유 기반", () => {
    expect(defaultTodayContactNextTitle([{ kind: "account_expiry", label: "연장 제안 · 3일 내 만료" }])).toBe("연장 제안 후속")
    expect(defaultTodayContactNextTitle([{ kind: "account_expiry", label: "만료 회복 · 12일 전 만료" }])).toBe("만료 회복 연락")
    expect(defaultTodayContactNextTitle([{ kind: "account_balance", label: "재충전 안내 · 잔액 소진 D-5" }])).toBe("재충전 안내 후속")
    expect(defaultTodayContactNextTitle([{ kind: "task", label: "할 일 · 오늘" }])).toBe("재연락")
  })
})

// ── 교차 리뷰 2라운드 회귀(2026-09-26) ─────────────────────────────────────────────

describe("오늘 연락 — 기록 위치 판정(360·리드 보드와 같은 규칙)", () => {
  it("[3·26] 전환(converted) 리드는 Compass 매칭이 있어도 Home 기록 — 리드 상태를 판정에 넘긴다(규칙 3)", () => {
    const base = {
      tasks: [task({ id: "T1", targetType: "lead" as const, targetId: "L4", dueAt: at(-1 * HOUR) })],
      compass: { dueActions: [], leadIndex: [indexRow({ id: 88, phone_key: KEY_A })], latestContacts: new Map() },
      neoRegisteredLeadIds: new Set<string>(),
    }
    const converted = buildTodayContacts(
      input({
        ...base,
        leads: [lead({ id: "L4", status: "converted", confirmed_at: at(-20 * DAY), phone: PHONE_A, timestamp: at(-40 * DAY) })],
      })
    )
    const row = converted.rows.find((candidate) => candidate.key === "lead:L4")!
    expect(row.primaryAction).toBe("record_outcome_lead")
    // Compass 참조는 보조 링크로 남긴다.
    expect(row.compass?.leadId).toBe(88)
    expect(row.openTaskIds).toEqual(["T1"])

    // 대조: 같은 입력의 진행 중 리드는 Compass 에서 연다.
    const open = buildTodayContacts(
      input({
        ...base,
        leads: [lead({ id: "L4", status: "contacted", confirmed_at: at(-20 * DAY), phone: PHONE_A, timestamp: at(-40 * DAY) })],
      })
    )
    expect(open.rows.find((candidate) => candidate.key === "lead:L4")?.primaryAction).toBe("open_compass")
  })

  it("[24] 종료 리드도 할 일로 행이 되면 Compass 조회 키에 들어간다 — 전화 키 수집은 할 일 대상 리드를 상태와 무관하게", () => {
    const leads = [
      lead({ id: "L1", status: "contacted", confirmed_at: at(-9 * DAY), phone: PHONE_A }),
      lead({ id: "L2", status: "closed", phone: "010-7777-8008", timestamp: at(-60 * DAY) }),
      lead({ id: "L3", status: "closed", phone: "010-5555-6006", timestamp: at(-60 * DAY) }),
      lead({ id: "L5", status: "converted", phone: "010-4444-3003", timestamp: at(-60 * DAY) }),
    ]
    const keys = collectTodayContactPhoneKeys({
      leads,
      neoRows: [neo({ accountId: "N1", phone: PHONE_B })],
      tasks: [task({ id: "T2", targetType: "lead", targetId: "L2" })],
      closedTasksToday: [task({ id: "T5", targetType: "lead", targetId: "L5", status: "done" })],
      dueRows: [due({ id: 9, phone_key: "01099998008" })],
    })
    // 진행 중 리드 · 할 일 대상(종료·전환 포함) · NEO · 다음 액션 행. 할 일 없는 종료 리드(L3)는 넣지 않는다.
    expect([...keys].sort()).toEqual(["01011112002", "01033334004", "01044443003", "01077778008", "01099998008"])
  })

  it("[24] 그 키로 찾은 Compass 매칭은 단계 무관 'Compass에서 열기' — Compass 에서 오늘 연락하면 처리됨", () => {
    const leads = [lead({ id: "L2", status: "closed", phone: "010-7777-8008", timestamp: at(-60 * DAY) })]
    const tasks = [task({ id: "T2", targetType: "lead", targetId: "L2", dueAt: at(6 * HOUR) })]
    const compassCall: LastContactFact = { at: at(-1 * HOUR), source: "compass", channel: "call", actor: "이콤" }
    const result = buildTodayContacts(
      input({
        leads,
        tasks,
        compass: {
          dueActions: [],
          leadIndex: [indexRow({ id: 88, phone_key: "01077778008", stage: "lost" })],
          latestContacts: new Map([["01077778008", compassCall]]),
        },
      })
    )
    const row = result.rows.find((candidate) => candidate.key === "lead:L2")!
    expect(row.primaryAction).toBe("open_compass")
    expect(row.compass?.leadId).toBe(88)
    expect(row.handled?.kind).toBe("compass_activity")
  })
})

describe("오늘 연락 — 전환 고객 할 일 링크", () => {
  it("[30] customer: 대상 할 일 행은 통합 고객 DB 를 원천 고객 + 이름 검색으로 연다(맨 /admin/crm/customers 금지)", () => {
    const result = buildTodayContacts(
      input({
        tasks: [
          task({ id: "T3", targetType: "customer", targetId: "C1", targetLabel: "한빛 학원", dueAt: at(6 * HOUR), title: "[세그먼트] 재활성" }),
        ],
      })
    )
    const row = result.rows.find((candidate) => candidate.key === "customer:C1")!
    expect(row.href).not.toBe("/admin/crm/customers")
    const href = new URL(row.href, "https://classin.kr")
    expect(href.pathname).toBe("/admin/crm/customers/unified")
    expect(href.searchParams.get("source")).toBe("customer")
    expect(href.searchParams.get("q")).toBe("한빛 학원")
    // 담당은 전체(`owner=` 빈 값) — 통합 목록은 owner 생략이 로그인 담당이고 전환 고객 행은 담당 키가 비어, 생략하면
    // 이름 검색이 늘 빈 목록이 된다(2026-10-16 기본 담당 계약, lib/admin/data-owner.ts dataOwnerFromParams).
    expect(href.searchParams.has("owner")).toBe(true)
    expect(href.searchParams.get("owner")).toBe("")
    expect(row.primaryAction).toBe("record_outcome")
    expect(todayContactCustomerHref("  ")).toBe("/admin/crm/customers/unified?source=customer&owner=")
  })
})

describe("오늘 연락 — 같은 번호 Compass 단독 리드", () => {
  it("[19] 같은 번호의 Compass 리드 여럿은 한 행 — 대표는 360 칩과 같은 규칙, 한 번 통화하면 1건 처리", () => {
    const dueActions = [
      due({ id: 1, phone_key: KEY_A, academy: "같은학원", next_action_at: at(-1 * DAY), created_at: at(-30 * DAY) }),
      due({ id: 2, phone_key: KEY_A, academy: "같은학원", next_action_at: at(2 * HOUR), created_at: at(-2 * DAY), last_inflow_at: at(-2 * DAY) }),
    ]
    const leadIndex = [
      indexRow({ id: 1, phone_key: KEY_A, created_at: at(-30 * DAY) }),
      indexRow({ id: 2, phone_key: KEY_A, created_at: at(-2 * DAY), last_inflow_at: at(-2 * DAY) }),
    ]
    const before = buildTodayContacts(input({ compass: { dueActions, leadIndex, latestContacts: new Map() } }))
    expect(before.rows.map((row) => row.key)).toEqual(["compass:2"])
    expect(before.rows[0].compass?.leadId).toBe(2)
    expect(before.rows[0].reasons[0].label).toContain("Compass 다음 액션 2")
    expect(before.progress).toMatchObject({ total: 1, handled: 0, remaining: 1, overdue: 1 })

    const compassCall: LastContactFact = { at: at(-1 * HOUR), source: "compass", channel: "call", actor: "이콤" }
    const after = buildTodayContacts(
      input({ compass: { dueActions, leadIndex, latestContacts: new Map([[KEY_A, compassCall]]) } })
    )
    expect(after.rows.map((row) => row.key)).toEqual(["compass:2"])
    expect(after.progress).toMatchObject({ total: 1, handled: 1, remaining: 0 })
  })

  it("[19] 전화 키가 없는 Compass 단독 행은 예전처럼 리드 id 로 선다", () => {
    const result = buildTodayContacts(
      input({ compass: { dueActions: [due({ id: 1 }), due({ id: 2 })], leadIndex: [], latestContacts: new Map() } })
    )
    expect(result.rows.map((row) => row.key).sort()).toEqual(["compass:1", "compass:2"])
  })

  // 종료 Home 리드 L2(할 일 오늘 18:00) + 같은 번호 Compass 리드 88(다음 액션 오늘 11:00) — 진행 중 리드·NEO 계정 없음.
  const closedLead = lead({ id: "L2", status: "closed", phone: PHONE_A, timestamp: at(-60 * DAY) })
  const closedLeadTask = task({ id: "T1", targetType: "lead", targetId: "L2", title: "[세그먼트] 재활성", dueAt: at(6 * HOUR) })
  const compassDue = due({ id: 88, phone_key: KEY_A, stage: "contact", next_action_at: at(-1 * HOUR) })

  it("[새 2] 같은 번호의 종료 리드 할 일 + Compass 다음 액션은 한 행(lead:) — 같은 Compass 리드를 여는 행이 둘이 되지 않는다", () => {
    const leadIndex = [indexRow({ id: 88, phone_key: KEY_A })]
    const before = buildTodayContacts(
      input({ leads: [closedLead], tasks: [closedLeadTask], compass: { dueActions: [compassDue], leadIndex, latestContacts: new Map() } })
    )
    expect(before.rows.map((row) => row.key)).toEqual(["lead:L2"])
    const row = before.rows[0]
    expect(row.primaryAction).toBe("open_compass")
    expect(row.compass?.leadId).toBe(88)
    expect(row.reasons.map((reason) => reason.kind).sort()).toEqual(["compass_next_action", "task"])
    expect(row.openTaskIds).toEqual(["T1"])
    expect(before.progress).toMatchObject({ total: 1, handled: 0, remaining: 1 })
    expect(before.counts.bySource).toMatchObject({ task: 1, compass_next_action: 1 })

    // Compass 통화 한 번 → 1건 처리(예전: 두 행이 모두 compass_activity 라 handled 2).
    const compassCall: LastContactFact = { at: at(-30 * 60_000), source: "compass", channel: "call", actor: "이콤" }
    const after = buildTodayContacts(
      input({
        leads: [closedLead],
        tasks: [closedLeadTask],
        compass: { dueActions: [compassDue], leadIndex, latestContacts: new Map([[KEY_A, compassCall]]) },
      })
    )
    expect(after.rows.map((row) => row.key)).toEqual(["lead:L2"])
    expect(after.progress).toMatchObject({ total: 1, handled: 1, remaining: 0 })
  })

  it("[새 2] 리드 인덱스가 끊겨도(다음 액션만 옴) 종료 리드 행에 붙인다 — 그 다음 액션으로 Compass 매칭이 확인된다", () => {
    const result = buildTodayContacts(
      input({ leads: [closedLead], tasks: [closedLeadTask], compass: { dueActions: [compassDue], leadIndex: null, latestContacts: new Map() } })
    )
    expect(result.rows.map((row) => row.key)).toEqual(["lead:L2"])
    expect(result.rows[0]).toMatchObject({ primaryAction: "open_compass", compass: { leadId: 88 } })
  })

  it("[새 2] 전환 리드(Home 기록 행)에는 붙이지 않는다 — Compass 다음 액션은 Compass 단독 행으로 따로 선다", () => {
    const converted = { ...closedLead, status: "converted" as const }
    const result = buildTodayContacts(
      input({
        leads: [converted],
        tasks: [closedLeadTask],
        compass: { dueActions: [compassDue], leadIndex: [indexRow({ id: 88, phone_key: KEY_A })], latestContacts: new Map() },
      })
    )
    expect(result.rows.map((row) => row.key).sort()).toEqual(["compass:88", "lead:L2"])
    expect(result.rows.find((row) => row.key === "lead:L2")?.primaryAction).toBe("record_outcome_lead")
    expect(result.rows.find((row) => row.key === "compass:88")?.primaryAction).toBe("open_compass")
  })
})

describe("오늘 연락 — 진행률 분모 안정성", () => {
  it("[20] 같은 기관으로 접은 리드도 분모에 센다 — 대표를 처리해도 분모는 그대로, 남은 수만 준다", () => {
    const base = [
      lead({ id: "A", org: "ABC학원", timestamp: at(-3 * HOUR) }),
      lead({ id: "B", org: "ABC 학원", timestamp: at(-2 * HOUR) }),
      lead({ id: "C", org: "abc학원", timestamp: at(-1 * HOUR) }),
    ]
    const before = buildTodayContacts(input({ leads: base }))
    expect(before.rows).toHaveLength(1)
    expect(before.rows[0].groupedCount).toBe(3)
    expect(before.progress).toMatchObject({ total: 3, handled: 0, remaining: 3 })
    expect(before.progress.byLane.new_response).toEqual({ total: 3, handled: 0 })
    // 원천 칩 건수는 행 수다(가중 없음) — 칩을 누르면 보이는 행은 1개(접힌 수는 groupedCount 로 따로 보인다).
    expect(before.counts.bySource.first_response).toBe(1)

    // A 에 오늘 Home 연락(연락중 전환) — 분모 3 그대로, 처리 1 · 남은 2.
    const afterLeads = [{ ...base[0], status: "contacted" as const, confirmed_at: at(-10 * 60_000) }, base[1], base[2]]
    const after = buildTodayContacts(
      input({
        leads: afterLeads,
        homeContacts: new Map([["lead:A", { at: at(-10 * 60_000), source: "home_log", channel: "call", actor: "김담당" }]]),
      })
    )
    expect(after.progress).toMatchObject({ total: 3, handled: 1, remaining: 2 })
    expect(after.rows.find((row) => row.key === "lead:B")?.groupedCount).toBe(2)
  })

  it("[1·14] 리드 '내일로'(팔로업만 내일 09:00)는 계정 행처럼 '다음 일정 이동'(추정) 처리로 남는다 — 진행률이 뒤로 가지 않는다", () => {
    const tomorrow9 = resolveTodayContactNextDueAt({ preset: "tomorrow_9" }, NOW.getTime()) as string
    const followLead = lead({
      id: "F1",
      status: "contacted",
      confirmed_at: at(-9 * DAY),
      phone: PHONE_A,
      follow_up_at: at(1 * HOUR),
      updated_at: at(-5 * DAY),
    })
    const before = buildTodayContacts(input({ leads: [followLead] }))
    expect(before.rows[0].primaryAction).toBe("record_outcome_lead")
    expect(before.progress).toMatchObject({ total: 1, handled: 0, remaining: 1 })

    const after = buildTodayContacts(input({ leads: [{ ...followLead, follow_up_at: tomorrow9, updated_at: at(-60_000) }] }))
    expect(after.rows.map((row) => row.key)).toEqual(["lead:F1"])
    expect(after.rows[0].handled).toMatchObject({ kind: "rescheduled", source: "home", approximate: true, nextAt: tomorrow9 })
    expect(after.rows[0].reasons[0]).toMatchObject({ kind: "follow_up", label: "팔로업 · 다음 09-26" })
    expect(after.progress).toMatchObject({ total: 1, handled: 1, remaining: 0 })

    // 첫 응답 리드를 미뤄도 같다.
    const fresh = lead({ id: "N1", phone: PHONE_B, timestamp: at(-2 * HOUR) })
    expect(buildTodayContacts(input({ leads: [fresh] })).progress).toMatchObject({ total: 1, remaining: 1 })
    const snoozedFresh = buildTodayContacts(input({ leads: [{ ...fresh, follow_up_at: tomorrow9, updated_at: at(-60_000) }] }))
    expect(snoozedFresh.rows[0]).toMatchObject({ key: "lead:N1", handled: { kind: "rescheduled", approximate: true } })
    expect(snoozedFresh.progress).toMatchObject({ total: 1, handled: 1, remaining: 0 })
  })

  it("[1·14] 다른 편집으로 updated_at 만 바뀐 미래 팔로업 리드 · Compass 매칭 리드(내일로 버튼 없음)는 처리로 세지 않는다", () => {
    const tomorrow9 = resolveTodayContactNextDueAt({ preset: "tomorrow_9" }, NOW.getTime()) as string
    const edited = lead({ id: "E1", status: "contacted", confirmed_at: at(-9 * DAY), follow_up_at: at(3 * DAY), updated_at: at(-60_000) })
    const compassLead = lead({
      id: "E2",
      status: "contacted",
      confirmed_at: at(-9 * DAY),
      phone: PHONE_A,
      follow_up_at: tomorrow9,
      updated_at: at(-60_000),
    })
    const result = buildTodayContacts(
      input({
        leads: [edited, compassLead],
        compass: { dueActions: [], leadIndex: [indexRow({ id: 5, phone_key: KEY_A })], latestContacts: new Map() },
      })
    )
    expect(result.rows).toHaveLength(0)
    expect(result.progress.total).toBe(0)
  })
})

describe("오늘 연락 — Compass 기록 행의 처리 판정([Q1-handled])", () => {
  // 진행 중 리드 L1 — Compass 리드 77 과 같은 번호(주 행동 = Compass에서 열기). 오늘 11:00 Compass 다음 액션.
  const compassLead = lead({ id: "L1", status: "contacted", confirmed_at: at(-9 * DAY), phone: PHONE_A, timestamp: at(-30 * DAY) })
  const compassDueToday = due({ id: 77, phone_key: KEY_A, next_action_at: at(-1 * HOUR), next_action: "견적 재안내" })
  const tomorrow9 = resolveTodayContactNextDueAt({ preset: "tomorrow_9" }, NOW.getTime()) as string
  const compassInput = (overrides: Partial<TodayContactQueueInput> = {}) =>
    input({
      leads: [compassLead],
      compass: {
        dueActions: [compassDueToday],
        leadIndex: [indexRow({ id: 77, phone_key: KEY_A })],
        latestContacts: new Map(),
      },
      ...overrides,
    })

  it.each([
    [
      "Home 에서 미룬 세그먼트 할 일(snoozed · 오늘 수정)",
      {
        tasks: [
          task({
            id: "T1",
            targetType: "lead",
            targetId: "L1",
            title: "[세그먼트] 재활성",
            status: "snoozed",
            snoozedUntil: tomorrow9,
            dueAt: tomorrow9,
            updatedAt: at(-30 * 60_000),
            assignedBy: "김운영",
          }),
        ],
      },
    ],
    [
      "오늘 연락 미루기로 닫은 할 일(취소 + '미룸 →')",
      {
        closedTasksToday: [
          task({
            id: "T1",
            targetType: "lead",
            targetId: "L1",
            title: "[세그먼트] 재활성",
            status: "canceled",
            outcome: todayContactSnoozeOutcome(tomorrow9),
            dueAt: at(6 * HOUR),
            completedAt: at(-30 * 60_000),
            completedBy: "김운영",
          }),
        ],
      },
    ],
    [
      "오늘 완료한 할 일",
      {
        closedTasksToday: [
          task({
            id: "T1",
            targetType: "lead",
            targetId: "L1",
            status: "done",
            dueAt: at(-2 * HOUR),
            completedAt: at(-30 * 60_000),
            completedBy: "김운영",
          }),
        ],
      },
    ],
  ])("Compass 다음 액션이 남은 Compass 리드는 %s 흔적만으로 처리됨이 되지 않는다", (_label, extra) => {
    const result = buildTodayContacts(compassInput(extra as Partial<TodayContactQueueInput>))
    expect(result.rows.map((row) => row.key)).toEqual(["lead:L1"])
    const [row] = result.rows
    expect(row.primaryAction).toBe("open_compass")
    expect(row.reasons.map((reason) => reason.kind)).toEqual(["compass_next_action"])
    expect(row.handled).toBeNull()
    expect(result.progress).toMatchObject({ total: 1, handled: 0, remaining: 1 })
  })

  it("그 행도 Compass 에서 오늘 연락하거나 Home 에 연락을 남기면 처리됨이다", () => {
    const snoozed = task({
      id: "T1",
      targetType: "lead",
      targetId: "L1",
      status: "snoozed",
      snoozedUntil: tomorrow9,
      dueAt: tomorrow9,
      updatedAt: at(-30 * 60_000),
    })
    const compassCall: LastContactFact = { at: at(-10 * 60_000), source: "compass", channel: "call", actor: "이콤" }
    const viaCompass = buildTodayContacts(
      compassInput({
        tasks: [snoozed],
        compass: {
          dueActions: [compassDueToday],
          leadIndex: [indexRow({ id: 77, phone_key: KEY_A })],
          latestContacts: new Map([[KEY_A, compassCall]]),
        },
      })
    )
    expect(viaCompass.rows[0]).toMatchObject({ key: "lead:L1", handled: { kind: "compass_activity", source: "compass" } })
    expect(viaCompass.progress).toMatchObject({ total: 1, handled: 1, remaining: 0 })

    const viaHome = buildTodayContacts(
      compassInput({
        tasks: [snoozed],
        homeContacts: new Map([["lead:L1", { at: at(-10 * 60_000), source: "home_log", channel: "call", actor: "김운영" }]]),
      })
    )
    expect(viaHome.rows[0]).toMatchObject({ key: "lead:L1", handled: { kind: "contact_logged", source: "home" } })
  })

  it("사유가 할 일뿐인 Compass 리드 행은 전처럼 할 일 흔적으로 처리됨이 된다", () => {
    // 종료 리드 L2 + Compass 리드 88(다음 액션 없음) — 행의 사유는 Home 할 일뿐.
    const closedLead = lead({ id: "L2", status: "closed", phone: PHONE_B, timestamp: at(-60 * DAY) })
    const doneToday = task({
      id: "T1",
      targetType: "lead",
      targetId: "L2",
      status: "done",
      dueAt: at(-2 * HOUR),
      completedAt: at(-30 * 60_000),
      completedBy: "김운영",
    })
    const base = {
      leads: [closedLead],
      compass: { dueActions: [], leadIndex: [indexRow({ id: 88, phone_key: KEY_B, stage: "lost" })], latestContacts: new Map() },
    }

    // 흔적만 남은 행(오늘 할 일을 완료).
    const onlyTrace = buildTodayContacts(input({ ...base, closedTasksToday: [doneToday] }))
    expect(onlyTrace.rows.map((row) => row.key)).toEqual(["lead:L2"])
    expect(onlyTrace.rows[0]).toMatchObject({ primaryAction: "open_compass", handled: { kind: "task_done", by: "김운영" } })

    // 오늘 할 일이 하나 더 남아 있어도(사유 = 할 일뿐) 오늘 완료 흔적으로 처리됨 — 기존 동작 유지.
    const withOpenTask = buildTodayContacts(
      input({
        ...base,
        tasks: [task({ id: "T3", targetType: "lead", targetId: "L2", dueAt: at(4 * HOUR) })],
        closedTasksToday: [doneToday],
      })
    )
    expect(withOpenTask.rows[0].reasons.map((reason) => reason.kind)).toEqual(["task"])
    expect(withOpenTask.rows[0]).toMatchObject({ primaryAction: "open_compass", handled: { kind: "task_done" } })
  })
})

describe("오늘 연락 — Compass 첫 응답 행과 Home 할 일 일정(약한 사유 제외)", () => {
  // 신규 리드 L5(contact_page · 2시간 전 유입) — Compass 리드 55 와 같은 번호(주 행동 = Compass에서 열기). 사유 = 첫 응답(약한 사유).
  const freshLead = lead({ id: "L5", phone: PHONE_A, timestamp: at(-2 * HOUR) })
  const tomorrow9 = resolveTodayContactNextDueAt({ preset: "tomorrow_9" }, NOW.getTime()) as string
  // 세그먼트 "오늘 연락에 넣기"가 만든 할 일 — 기한 오늘 18:00 KST.
  const todayEvening = "2026-09-25T09:00:00.000Z"
  const segmentTask = task({
    id: "T1",
    targetType: "lead",
    targetId: "L5",
    title: "[세그먼트] 신규 문의",
    dueAt: todayEvening,
    createdAt: at(-3 * HOUR),
    updatedAt: at(-3 * HOUR),
  })
  const compassInput = (overrides: Partial<TodayContactQueueInput> = {}) =>
    input({
      leads: [freshLead],
      compass: { dueActions: [], leadIndex: [indexRow({ id: 55, phone_key: KEY_A })], latestContacts: new Map() },
      ...overrides,
    })
  const expectPendingFirstResponse = (result: ReturnType<typeof buildTodayContacts>) => {
    expect(result.rows.map((row) => row.key)).toEqual(["lead:L5"])
    const [row] = result.rows
    expect(row.primaryAction).toBe("open_compass")
    expect(row.reasons.map((reason) => reason.kind)).toEqual(["first_response"])
    expect(row.handled).toBeNull()
    expect(result.progress).toMatchObject({ total: 1, handled: 0, remaining: 1 })
  }

  it("할 일을 미루기 전에는 첫 응답 + 할 일 대기 행이다", () => {
    const before = buildTodayContacts(compassInput({ tasks: [segmentTask] }))
    expect(before.rows.map((row) => row.key)).toEqual(["lead:L5"])
    expect(new Set(before.rows[0].reasons.map((reason) => reason.kind))).toEqual(new Set(["first_response", "task"]))
    expect(before.rows[0]).toMatchObject({ primaryAction: "open_compass", handled: null })
    expect(before.progress).toMatchObject({ total: 1, remaining: 1 })
  })

  it("Home 에서 세그먼트 할 일을 내일로 미뤄도(snoozed · 오늘 수정) 첫 응답 대기 행으로 남는다 — 목록·분모에서 빠지지 않는다", () => {
    const snoozed = { ...segmentTask, status: "snoozed" as const, snoozedUntil: tomorrow9, dueAt: tomorrow9, updatedAt: at(-30 * 60_000) }
    const result = buildTodayContacts(compassInput({ tasks: [snoozed] }))
    expectPendingFirstResponse(result)
    // 화면의 다음 연락은 미룬 할 일 그대로 보여 준다.
    expect(result.rows[0].nextContact).toMatchObject({ at: tomorrow9, kind: "task" })
  })

  it("오늘 연락 미루기(취소 + '미룸 →') + 이어받은 내일 할 일도 같다", () => {
    const result = buildTodayContacts(
      compassInput({
        tasks: [task({ id: "T2", targetType: "lead", targetId: "L5", dueAt: tomorrow9, createdAt: at(-30 * 60_000) })],
        closedTasksToday: [
          {
            ...segmentTask,
            status: "canceled",
            outcome: todayContactSnoozeOutcome(tomorrow9),
            completedAt: at(-30 * 60_000),
            completedBy: "김운영",
          },
        ],
      })
    )
    expectPendingFirstResponse(result)
  })

  it("오늘 할 일 없이 미래 할 일만 있어도 같다 — Compass 가 맡은 첫 응답은 Home 할 일 일정으로 가리지 않는다", () => {
    const future = task({ id: "T3", targetType: "lead", targetId: "L5", dueAt: at(2 * DAY), createdAt: at(-1 * DAY), updatedAt: at(-1 * DAY) })
    expectPendingFirstResponse(buildTodayContacts(compassInput({ tasks: [future] })))
  })

  it("Compass 다음 액션이 미래에 잡혀 있으면 전처럼 첫 응답 행을 뺀다", () => {
    const result = buildTodayContacts(
      compassInput({
        compass: {
          dueActions: [],
          leadIndex: [indexRow({ id: 55, phone_key: KEY_A, next_action_at: at(2 * DAY) })],
          latestContacts: new Map(),
        },
      })
    )
    expect(result.rows).toHaveLength(0)
    expect(result.progress.total).toBe(0)
  })

  it("Compass 매칭이 없는 Home 입력 리드는 전처럼 — 미룬 할 일이 '미룸' 처리 흔적, 미래 할 일만 있으면 뺀다", () => {
    const homeLead = { ...freshLead, phone: PHONE_B }
    const snoozed = { ...segmentTask, status: "snoozed" as const, snoozedUntil: tomorrow9, dueAt: tomorrow9, updatedAt: at(-30 * 60_000) }
    const handled = buildTodayContacts(input({ leads: [homeLead], tasks: [snoozed] }))
    expect(handled.rows.map((row) => row.key)).toEqual(["lead:L5"])
    expect(handled.rows[0]).toMatchObject({ primaryAction: "record_outcome_lead", handled: { kind: "task_snoozed" } })
    expect(handled.progress).toMatchObject({ total: 1, handled: 1, remaining: 0 })

    const future = task({ id: "T3", targetType: "lead", targetId: "L5", dueAt: at(2 * DAY), createdAt: at(-1 * DAY), updatedAt: at(-1 * DAY) })
    expect(buildTodayContacts(input({ leads: [homeLead], tasks: [future] })).rows).toHaveLength(0)
  })
})

describe("오늘 연락 — 자리표시·더미 번호는 Compass 조인 키가 아니다(lead-contact-sync 와 같은 규칙 · Compass ADR-0018)", () => {
  // 폼에 더미를 친 Home 리드(담당 김홈)와, 같은 더미 번호를 가진 **남의** Compass 리드(담당 남담당 · 오늘 콜).
  const DUMMY_PHONES = ["010-0000-0000", "010-1234-5678", "010-1111-2222"]
  const REAL_PHONE = "010-2222-0003"
  const keyOf = (phone: string) => phone.replace(/\D/g, "")
  const othersCall: LastContactFact = { at: at(-1 * HOUR), source: "compass", channel: "call", actor: "남담당" }
  const sharedPhoneInput = (phone: string, overrides: Partial<TodayContactQueueInput> = {}) =>
    input({
      leads: [lead({ id: "L1", phone, assigned_to: "김홈" })],
      compass: {
        dueActions: [],
        leadIndex: [indexRow({ id: 999, phone_key: keyOf(phone), owner: "남담당" })],
        latestContacts: new Map([[keyOf(phone), othersCall]]),
      },
      ...overrides,
    })

  it.each(DUMMY_PHONES)("%s 리드는 남의 Compass 리드 링크·담당·오늘 콜을 받지 않는다 — 첫 응답 대기로 남는다", (phone) => {
    const result = buildTodayContacts(sharedPhoneInput(phone))
    const row = result.rows.find((candidate) => candidate.key === "lead:L1")
    expect(row).toBeDefined()
    expect(row!.compass).toBeNull()
    expect(row!.primaryAction).toBe("record_outcome_lead")
    expect(row!.handled).toBeNull()
    expect(row!.lastContact).toBeNull()
    expect(row!.ownerKeys).not.toContain("남담당")
    expect(row!.reasons.map((reason) => reason.kind)).toContain("first_response")
    expect(result.progress).toMatchObject({ total: 1, handled: 0 })
    // 남의 Compass 담당의 '내 담당' 오늘 연락에 끼지 않는다.
    const others = buildTodayContacts(sharedPhoneInput(phone, { ownerKeys: ["남담당"] }))
    expect(others.rows.map((candidate) => candidate.key)).not.toContain("lead:L1")
  })

  it("대조 — 실번호면 같은 키의 Compass 리드에 붙는다(위 단언이 픽스처 탓에 통과하는 게 아님)", () => {
    const row = buildTodayContacts(sharedPhoneInput(REAL_PHONE)).rows.find((candidate) => candidate.key === "lead:L1")
    expect(row?.compass?.leadId).toBe(999)
    expect(row?.primaryAction).toBe("open_compass")
    expect(row?.handled).toMatchObject({ kind: "compass_activity", by: "남담당" })
    expect(row?.ownerKeys).toContain("남담당")
  })

  it("더미 키의 Compass 다음 액션은 같은 더미의 Home 리드·NEO 계정에 붙지 않고, 같은 더미 Compass 리드끼리 한 행으로 접지도 않는다", () => {
    const result = buildTodayContacts(
      input({
        leads: [lead({ id: "L1", phone: "010-0000-0000", assigned_to: "김홈" })],
        neoRows: [neo({ accountId: "N1", phone: "010-0000-0000", expireAt: at(3 * DAY) })],
        compass: {
          dueActions: [
            due({ id: 31, phone_key: "01000000000", owner: "남담당", academy: "남의 학원 가" }),
            due({ id: 32, phone_key: "01000000000", owner: "북담당", academy: "남의 학원 나" }),
          ],
          leadIndex: [
            indexRow({ id: 31, phone_key: "01000000000", owner: "남담당" }),
            indexRow({ id: 32, phone_key: "01000000000", owner: "북담당" }),
          ],
          latestContacts: new Map(),
        },
      })
    )
    expect(result.rows.map((row) => row.key).sort()).toEqual(["compass:31", "compass:32", "lead:L1", "neo:N1"])
    for (const key of ["lead:L1", "neo:N1"]) {
      const row = result.rows.find((candidate) => candidate.key === key)!
      expect(row.compass, key).toBeNull()
      expect(row.reasons.map((reason) => reason.kind), key).not.toContain("compass_next_action")
    }
    expect(result.rows.find((row) => row.key === "compass:32")?.ownerKeys).toEqual(["북담당"])
  })

  it("Compass 조회 키 수집에서도 뺀다 — 더미 키로 조회해 남의 리드를 끌어오지 않는다(저장 값은 그대로)", () => {
    const dummyLead = lead({ id: "L1", phone: "010-0000-0000" })
    const keys = collectTodayContactPhoneKeys({
      leads: [dummyLead, lead({ id: "L2", phone: REAL_PHONE })],
      neoRows: [neo({ accountId: "N1", phone: "010-1234-5678" })],
      tasks: [],
      dueRows: [due({ id: 9, phone_key: "01011112222" })],
    })
    expect(keys).toEqual(["01022220003"])
    expect(dummyLead.phone).toBe("010-0000-0000")
  })
})
