import { describe, expect, it } from "vitest"

import { buildLeadPriorityItem, buildNeoAccountPriorityItem, daysFromNow, sortPriorityItems } from "@/lib/crm/priority"
import { buildCompassDemoIndex } from "@/lib/crm/compass-demo-signal"
import type { LeadRecord } from "@/lib/repositories/leads"
import type { NeoCrmCustomerRow } from "@/lib/admin-crm-customers-neo"

const NOW = new Date("2026-06-26T09:00:00.000Z")
const DAY_MS = 24 * 60 * 60 * 1000
/** NOW 기준 ±N 달력일 ISO — 만료·컨택·작업 due 시나리오용. */
const days = (n: number) => new Date(NOW.getTime() + n * DAY_MS).toISOString()

function lead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: "lead-1",
    source: "contact_page",
    name: "홍길동",
    org: "테스트 학원",
    email: "lead@example.com",
    phone: "010-0000-0000",
    timestamp: "2026-06-24T08:00:00.000Z",
    status: "new",
    ...overrides,
  }
}

function account(overrides: Partial<NeoCrmCustomerRow> = {}): NeoCrmCustomerRow {
  return {
    accountId: "acc-1",
    name: "ClassIn 학원",
    ownerId: "owner-1",
    ownerName: "담당자",
    phone: "010-1111-1111",
    balance: 1200,
    expireAt: "2026-06-30T00:00:00.000Z",
    lastClassAt: "2026-06-20T00:00:00.000Z",
    uid: "u-1",
    orderAmount: 100,
    orderCount: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    ...overrides,
  }
}

describe("CRM priority rules", () => {
  it("prioritizes unresponded response-target leads after 48 hours", () => {
    const item = buildLeadPriorityItem(lead(), NOW)

    expect(item?.action).toBe("respond_lead")
    expect(item?.lane).toBe("sales")
    expect(item?.laneLabel).toBe("신규·추가 매출")
    expect(item?.bucket).toBe("today")
    // SLA는 이미 깨졌으므로 "오늘 필수"(p0)가 아니라 "이번 주"(p1) — severity는 티어 파생.
    expect(item?.tier).toBe("p1")
    expect(item?.severity).toBe("high")
    expect(item?.reason).toContain("48시간")
    expect(item?.ownerKeys).toEqual([])
  })

  it("오래 방치된 미응답은 봉우리를 지나 식는다", () => {
    const twoDays = buildLeadPriorityItem(lead(), NOW)
    const twoWeeks = buildLeadPriorityItem(
      lead({ timestamp: new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString() }),
      NOW
    )

    expect(twoWeeks!.score).toBeLessThan(twoDays!.score)
    expect(twoWeeks?.reason).toContain("식음")
  })

  it("연락에 반응한 리드가 방치된 미응답보다 위에 선다", () => {
    const neglected = buildLeadPriorityItem(
      lead({ timestamp: new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString() }),
      NOW
    )
    const responsive = buildLeadPriorityItem(
      lead({
        id: "responsive",
        status: "contacted",
        source: "demo_modal",
        size: "320",
        confirmed_at: new Date(NOW.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      NOW,
      {
        engagement: {
          authenticated: true,
          providers: ["google"],
          downloadCount: 2,
          eventCount: 11,
          contactLogCount: 3,
          lastContactAt: new Date(NOW.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
          lastActivityAt: new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        },
      }
    )

    expect(responsive!.score).toBeGreaterThan(neglected!.score)
    expect(responsive?.reason).toBe("연락 후 재방문")
  })

  it("keeps converted and closed leads out of the queue", () => {
    expect(buildLeadPriorityItem(lead({ status: "converted" }), NOW)).toBeNull()
    expect(buildLeadPriorityItem(lead({ status: "closed" }), NOW)).toBeNull()
  })

  it("prioritizes accounts that expire within 30 days", () => {
    const item = buildNeoAccountPriorityItem(account(), NOW)

    expect(item?.action).toBe("renew_account")
    expect(item?.lane).toBe("renewal")
    expect(item?.bucket).toBe("today")
    // D-4 — p0 임계(D-3) 밖이라 "이번 주". 만료일은 결제 데이터라 신뢰 高.
    expect(item?.tier).toBe("p1")
    expect(item?.trust).toBe("high")
    expect(item?.reason).toContain("일 내 만료")
    expect(item?.score).toBeGreaterThanOrEqual(90)
    expect(item?.ownerKeys).toEqual(["담당자", "owner-1"])
  })

  it("만료 임박 티어 사다리 — D-2는 p0, D-10은 p1, D-25는 p2", () => {
    const d2 = buildNeoAccountPriorityItem(account({ expireAt: days(2) }), NOW)
    const d10 = buildNeoAccountPriorityItem(account({ expireAt: days(10) }), NOW)
    const d25 = buildNeoAccountPriorityItem(account({ expireAt: days(25) }), NOW)

    expect(d2?.tier).toBe("p0")
    expect(d2?.tierLabel).toBe("오늘 필수")
    expect(d2?.severity).toBe("critical")
    expect(d10?.tier).toBe("p1")
    expect(d25?.tier).toBe("p2")
    // 셋 다 만료 축 — 결제 데이터 기반이라 신뢰 高.
    for (const item of [d2, d10, d25]) expect(item?.trust).toBe("high")
  })

  it("만료 경과 티어 — 골든타임(≤14일)은 p1, 15~60일은 p2, 60일 초과는 p3 장기 회복", () => {
    const justExpired = buildNeoAccountPriorityItem(account({ expireAt: days(-5) }), NOW)
    const cooling = buildNeoAccountPriorityItem(account({ expireAt: days(-30) }), NOW)
    const longExpired = buildNeoAccountPriorityItem(account({ expireAt: days(-90) }), NOW)

    expect(justExpired?.tier).toBe("p1")
    expect(justExpired?.action).toBe("recover_expired")
    expect(cooling?.tier).toBe("p2")
    expect(longExpired?.tier).toBe("p3")
    expect(longExpired?.severity).toBe("low")
    expect(longExpired?.bucket).toBe("stale_recovery")
    expect(longExpired?.bucketLabel).toBe("장기 회복")
    expect(longExpired?.score).toBeLessThan(70)
    // 점수(내부 타이브레이커)도 같은 방향 — 살릴 수 있는 건이 죽은 건보다 위.
    expect(justExpired!.score).toBeGreaterThan(longExpired!.score)
  })

  it("prioritizes depleted prepaid balance even when subscription expiry is not near", () => {
    const item = buildNeoAccountPriorityItem(
      account({
        balance: 0,
        expireAt: "2026-12-31T00:00:00.000Z",
        riskLevel: "soon",
        riskReasons: [{ code: "depleted_balance", label: "충전 잔액 소진" }],
      }),
      NOW
    )

    expect(item?.action).toBe("renew_account")
    expect(item?.actionLabel).toBe("충전 안내")
    expect(item?.lane).toBe("customer_care")
    expect(item?.bucket).toBe("today")
    expect(item?.reason).toContain("충전 잔액")
    // 자체 컨택 없이 NEO 수업 기록(6일 전)만 있는 소진 — 기회(p2)·신뢰 低.
    expect(item?.tier).toBe("p2")
    expect(item?.trust).toBe("low")
  })

  it("promotes a purchased customer's demo into the additional-sales lane", () => {
    // 매칭은 전화 정규화 키 동등 비교 — account() 의 phone 과 같은 키에만 붙는다.
    const item = buildNeoAccountPriorityItem(account({ phone: "010-1234-5678" }), NOW, {
      demoIndex: buildCompassDemoIndex(
        {
          demos: [
            { id: 1, lead_id: 77, day: "2026-06-27", status: "booked", owner: "진소망", day_approx: false },
          ],
          phoneKeysByCompassLeadId: new Map([[77, ["01012345678"]]]),
          down: false,
        },
        NOW
      ),
    })

    expect(item?.lane).toBe("sales")
    expect(item?.laneLabel).toBe("신규·추가 매출")
    expect(item?.actionLabel).toBe("데모")
    expect(item?.reason).toBe("내일 데모")
  })

  it("전화가 다르면 데모 신호가 붙지 않는다 — 이름 유사도로 번지지 않는다", () => {
    const item = buildNeoAccountPriorityItem(account({ phone: "010-9999-0000" }), NOW, {
      demoIndex: buildCompassDemoIndex(
        {
          demos: [
            { id: 1, lead_id: 77, day: "2026-06-27", status: "booked", owner: null, day_approx: false },
          ],
          phoneKeysByCompassLeadId: new Map([[77, ["01012345678"]]]),
          down: false,
        },
        NOW
      ),
    })

    expect(item?.lane).not.toBe("sales")
    expect(item?.reason).not.toContain("데모")
  })

  it("재활성(NEO 수업 날짜 단독 근거)은 기회 고정 — p2·신뢰 低·점수 상한 55", () => {
    const item = buildNeoAccountPriorityItem(
      account({
        balance: 1200,
        expireAt: "2026-12-31T00:00:00.000Z",
        lastClassAt: days(-40),
        orderAmount: 0,
      }),
      NOW
    )

    expect(item?.action).toBe("reengage_account")
    expect(item?.tier).toBe("p2")
    expect(item?.trust).toBe("low")
    expect(item!.score).toBeLessThanOrEqual(55)
    expect(item?.reason).toBe("40일 수업 없음 · 잔액 보유")
  })

  it("자체 예정 작업 — 오늘 due는 p0 승격, 미래 due는 p2 강등, 만료 D-3 이내는 강등 예외", () => {
    // 만료 D-10(p1) + 오늘 due 예정 작업 → 오늘 필수로 승격, 근거는 자체 기록이라 신뢰 高.
    const dueToday = buildNeoAccountPriorityItem(account({ expireAt: days(10) }), NOW, {
      ownSignals: { openTaskDueAt: days(0) },
    })
    expect(dueToday?.tier).toBe("p0")
    expect(dueToday?.trust).toBe("high")
    expect(dueToday?.reason).toContain("오늘 예정 작업")

    // 만료 D-10(p1) + D-5 미래 due — 이미 날짜를 잡아둔 건이라 기회로 강등.
    const dueFuture = buildNeoAccountPriorityItem(account({ expireAt: days(10) }), NOW, {
      ownSignals: { openTaskDueAt: days(5) },
    })
    expect(dueFuture?.tier).toBe("p2")
    expect(dueFuture?.reason).toContain("D-5 예정 작업 있음")

    // 만료 D-2 — 돈 손실이 확정되는 시계라 미래 예정 작업이 있어도 강등하지 않는다.
    const expiryPinned = buildNeoAccountPriorityItem(account({ expireAt: days(2) }), NOW, {
      ownSignals: { openTaskDueAt: days(5) },
    })
    expect(expiryPinned?.tier).toBe("p0")
  })

  it("최근 3일 자체 컨택은 p0를 p1로 내린다(중복 전화 방지) — 만료 D-3 이내는 예외", () => {
    // 오늘 due 예정 작업으로 p0가 된 계정 — 2일 전 이미 컨택했으면 이번 주로 내린다.
    const contacted = buildNeoAccountPriorityItem(account({ expireAt: days(10) }), NOW, {
      ownSignals: { openTaskDueAt: days(0), lastContactAt: days(-2) },
    })
    expect(contacted?.tier).toBe("p1")
    expect(contacted?.reason).toContain("2일 전 컨택함")

    // 만료 D-2는 컨택했더라도 마감은 마감 — p0 유지.
    const expiring = buildNeoAccountPriorityItem(account({ expireAt: days(2) }), NOW, {
      ownSignals: { lastContactAt: days(-2) },
    })
    expect(expiring?.tier).toBe("p0")
  })

  it("정렬 캐논 — 티어가 1축, 같은 티어 안에서는 머니 밴드가 가른다", () => {
    // p1 · 잔액 ¥2만(high) — 만료 D-10.
    const p1High = buildNeoAccountPriorityItem(
      account({ accountId: "p1-high", expireAt: days(10), balance: 20_000 }),
      NOW
    )
    // p1 · 금액 원천 없음(unknown) — 같은 만료 D-10.
    const p1Unknown = buildNeoAccountPriorityItem(
      account({ accountId: "p1-unknown", expireAt: days(10), balance: null, orderAmount: 0 }),
      NOW
    )
    // p0 · 금액 원천 없음 — 만료 D-2. 티어가 돈보다 먼저다.
    const p0Unknown = buildNeoAccountPriorityItem(
      account({ accountId: "p0-unknown", expireAt: days(2), balance: null, orderAmount: 0 }),
      NOW
    )

    expect(p1High?.moneyBand).toBe("high")
    expect(p1Unknown?.moneyBand).toBe("unknown")
    expect(p0Unknown?.tier).toBe("p0")

    const sorted = sortPriorityItems(
      [p1Unknown, p1High, p0Unknown].filter((item): item is NonNullable<typeof item> => Boolean(item))
    )
    expect(sorted.map((item) => item.id)).toEqual(["neo:p0-unknown", "neo:p1-high", "neo:p1-unknown"])
  })

  it("daysFromNow는 달력일 기준이다 — 오늘 23시에 내일 09시는 1일", () => {
    // 로컬 시간으로 직접 만들어 러너 타임존과 무관하게 같은 달력일을 가리키게 한다.
    const lateNight = new Date(2026, 5, 26, 23, 0, 0)
    const tomorrowMorning = new Date(2026, 5, 27, 9, 0, 0)

    // 이전 구현(floor((target-now)/24h))은 10시간 차라 0을 돌려줬다 — 스누즈 결함의 뿌리.
    expect(daysFromNow(tomorrowMorning.toISOString(), lateNight.getTime())).toBe(1)
    expect(daysFromNow(lateNight.toISOString(), lateNight.getTime())).toBe(0)
    expect(daysFromNow(new Date(2026, 5, 25, 9, 0, 0).toISOString(), lateNight.getTime())).toBe(-1)
  })

  it("내일로 스누즈한 미응답 리드는 오늘 큐로 복귀하지 않고 점수도 오르지 않는다", () => {
    const afternoon = new Date(2026, 5, 26, 15, 0, 0) // 결함 재현 조건 — 스누즈 시각이 오후
    const unresponded = lead({
      timestamp: new Date(afternoon.getTime() - 49 * 60 * 60 * 1000).toISOString(),
    })

    const before = buildLeadPriorityItem(unresponded, afternoon)
    const snoozed = buildLeadPriorityItem(
      { ...unresponded, follow_up_at: new Date(2026, 5, 27, 9, 0, 0).toISOString() },
      afternoon
    )

    expect(before?.bucket).toBe("today")
    expect(snoozed?.bucket).not.toBe("today")
    expect(snoozed!.score).toBeLessThanOrEqual(before!.score)
    expect(snoozed?.reason).toBe("내일 팔로업 예정")
  })

  it("오늘 날짜의 팔로업은 그대로 오늘 처리에 남는다", () => {
    const morning = new Date(2026, 5, 26, 10, 0, 0)
    const item = buildLeadPriorityItem(
      lead({
        status: "contacted",
        confirmed_at: new Date(2026, 5, 20, 9, 0, 0).toISOString(),
        follow_up_at: new Date(2026, 5, 26, 15, 0, 0).toISOString(),
      }),
      morning
    )

    expect(item?.bucket).toBe("today")
    expect(item?.reason).toBe("오늘 예정된 팔로업")
  })

  it("잔액 소진은 근거 신뢰 순서로 티어를 가른다 — 자체 컨택 p1, NEO 수업만 p2, 둘 다 없으면 p3 휴면", () => {
    const farExpiry = "2026-12-31T00:00:00.000Z" // 만료·연장 분기를 피해 잔액 분기만 태운다
    // ① 자체 컨택 45일 내(30일 전) — 우리 팀 기록이라 신뢰 高, 이번 주에 충전을 안내한다.
    const ownContacted = buildNeoAccountPriorityItem(
      account({ balance: 0, expireAt: farExpiry, lastClassAt: null, orderAmount: 0 }),
      NOW,
      { ownSignals: { lastContactAt: days(-30) } }
    )
    // ② NEO 수업 기록만 45일 내(30일 전) — 본사 보고용 로그라 신뢰 低, 기회로만 둔다.
    const neoOnly = buildNeoAccountPriorityItem(
      account({ balance: 0, expireAt: farExpiry, lastClassAt: days(-30), orderAmount: 0 }),
      NOW
    )
    // ③ 둘 다 없음 — 휴면 관찰. NEO 결측은 "수업 없음"과 다르므로 미기입 가능성을 밝힌다.
    const silent = buildNeoAccountPriorityItem(
      account({ balance: 0, expireAt: farExpiry, lastClassAt: null, orderAmount: 0 }),
      NOW
    )
    const longDormant = buildNeoAccountPriorityItem(
      account({ balance: 0, expireAt: farExpiry, lastClassAt: days(-90), orderAmount: 0 }),
      NOW
    )

    expect(ownContacted?.actionLabel).toBe("충전 안내")
    expect(ownContacted?.tier).toBe("p1")
    expect(ownContacted?.trust).toBe("high")
    expect(ownContacted?.score).toBe(70)
    expect(ownContacted?.reason).toContain("30일 전 컨택")

    expect(neoOnly?.actionLabel).toBe("충전 안내")
    expect(neoOnly?.tier).toBe("p2")
    expect(neoOnly?.trust).toBe("low")
    expect(neoOnly?.score).toBe(62)
    expect(neoOnly?.reason).toBe("충전 잔액 소진 · NEO 수업 기록 기준")

    expect(silent?.actionLabel).toBe("휴면 점검")
    expect(silent?.tier).toBe("p3")
    expect(silent?.trust).toBe("low")
    expect(silent?.score).toBe(38)
    expect(silent?.reason).toBe("잔액 소진 · 수업 기록 없음(NEO 미기입 가능)")

    expect(longDormant?.tier).toBe("p3")
    expect(longDormant?.reason).toBe("잔액 소진 · 최근 수업 없음")
  })

  it("keeps today's operational work ahead of long-stale recovery", () => {
    const todayLead = buildLeadPriorityItem(
      lead({ id: "today", timestamp: "2026-06-26T08:00:00.000Z", source: "contact_page" }),
      NOW
    )
    const staleAccount = buildNeoAccountPriorityItem(
      account({ accountId: "stale", expireAt: "2026-01-01T00:00:00.000Z" }),
      NOW
    )

    const sorted = sortPriorityItems(
      [staleAccount, todayLead].filter((item): item is NonNullable<typeof item> => Boolean(item))
    )

    expect(sorted[0]?.id).toBe("lead:today")
    expect(sorted[1]?.bucket).toBe("stale_recovery")
  })
})

describe("buildNeoAccountPriorityItem — 재충전 임박", () => {
  const base = {
    accountId: "acc-recharge",
    name: "충전제 학원",
    ownerId: "owner-1",
    ownerName: "김담당",
    phone: null,
    balance: 300,
    expireAt: null,
    lastClassAt: "2026-08-20T00:00:00.000Z",
    uid: "uid-1",
    orderAmount: 0,
    orderCount: 0,
    createdAt: null,
    updatedAt: "2026-08-25T00:00:00.000Z",
    riskLevel: "soon" as const,
    riskReasons: [{ code: "recharge_due", label: "재충전 임박 D-12" }],
    depletionInDays: 12,
  }
  const NOW = new Date("2026-08-28T00:00:00.000Z")

  it("잔액이 남아 있어도 소진이 다가오면 연장 레인에 올린다", () => {
    const item = buildNeoAccountPriorityItem(base, NOW)
    expect(item?.action).toBe("recharge_account")
    expect(item?.lane).toBe("renewal")
    expect(item?.bucket).toBe("renewal")
    expect(item?.reason).toBe("잔액 소진 D-12")
  })

  it("일주일 안이면 오늘 처리로 올라온다", () => {
    const item = buildNeoAccountPriorityItem({ ...base, depletionInDays: 3, riskReasons: [{ code: "recharge_due" }] }, NOW)
    expect(item?.bucket).toBe("today")
    expect(item?.score).toBeGreaterThan(90)
  })

  it("만료가 더 급하면 만료가 이긴다", () => {
    const item = buildNeoAccountPriorityItem({ ...base, expireAt: "2026-09-02T00:00:00.000Z" }, NOW)
    expect(item?.action).toBe("renew_account")
  })

  it("예상일이 없으면 재충전 액션을 만들지 않는다", () => {
    const item = buildNeoAccountPriorityItem({ ...base, depletionInDays: null }, NOW)
    expect(item?.action).not.toBe("recharge_account")
  })
})
