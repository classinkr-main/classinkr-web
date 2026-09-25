// 저장 세그먼트 순수 규칙(세그먼트 허브, 2026-09-25) — 검증·자동 태그 가드 우선순위·급변·떼기 상한·8주 추이·
// 가시성·편집 권한·마커·KST 날짜.
import { describe, expect, it } from "vitest"

import {
  AUTO_TAG_MAX_MEMBERS,
  CRM_SEGMENT_DAILY_KST_HOUR,
  CRM_SEGMENT_DAILY_UTC_SLOT,
  addDaysToDateKey,
  autoTagResultStatus,
  buildSegmentWeeklyTrend,
  canEditSavedSegment,
  canManageSavedSegmentAutoTag,
  decideAutoTag,
  isSavedSegmentVisibleTo,
  isSegmentCountSpike,
  kstDateKeyOf,
  parseSegmentAutoTagMarker,
  previousSegmentTotal,
  segmentAutoTagMarker,
  segmentUntagLimit,
  validateSavedSegmentInput,
  type AutoTagDecisionInput,
} from "@/lib/crm/saved-segments"

describe("크론 시각·마커·날짜", () => {
  it("KST 06시 = UTC 슬롯 21", () => {
    expect(CRM_SEGMENT_DAILY_KST_HOUR).toBe(6)
    expect(CRM_SEGMENT_DAILY_UTC_SLOT).toBe(21)
  })

  it("마커 왕복 — auto:seg:<id>", () => {
    expect(segmentAutoTagMarker("abc")).toBe("auto:seg:abc")
    expect(parseSegmentAutoTagMarker("auto:seg:abc")).toBe("abc")
    expect(parseSegmentAutoTagMarker("김담당")).toBeNull()
    expect(parseSegmentAutoTagMarker(null)).toBeNull()
  })

  it("KST 날짜 키 — UTC 21시는 다음 날", () => {
    expect(kstDateKeyOf(new Date("2026-09-24T21:00:00.000Z"))).toBe("2026-09-25")
    expect(kstDateKeyOf(new Date("2026-09-24T14:59:59.000Z"))).toBe("2026-09-24")
    expect(addDaysToDateKey("2026-03-01", -1)).toBe("2026-02-28")
  })
})

describe("validateSavedSegmentInput", () => {
  const spec = { expDays: 30 }

  it("생성 — 이름·조건 필수, 공유 범위 기본은 내 것", () => {
    const result = validateSavedSegmentInput({ name: "  만료   30일 ", spec }, "create")
    expect(result).toEqual({ ok: true, value: { name: "만료 30일", spec: { expDays: 30 }, visibility: "mine" } })
    expect(validateSavedSegmentInput({ spec }, "create")).toMatchObject({ ok: false })
    expect(validateSavedSegmentInput({ name: "x".repeat(61), spec }, "create")).toMatchObject({ ok: false })
  })

  it("빈 조건·빈 OR 그룹·그룹 상한 초과는 거부", () => {
    expect(validateSavedSegmentInput({ name: "a", spec: {} }, "create")).toMatchObject({ ok: false })
    expect(validateSavedSegmentInput({ name: "a", spec: { expDays: 30, anyOf: [{}] } }, "create")).toMatchObject({
      ok: false,
      error: expect.stringContaining("비어 있는"),
    })
    expect(
      validateSavedSegmentInput({ name: "a", spec: { anyOf: [1, 2, 3, 4, 5, 6].map((d) => ({ noContactDays: d })) } }, "create")
    ).toMatchObject({ ok: false })
  })

  it("자동 태그 — 팀 공유 필수 · 라벨 필수 · 자기 조건 라벨이면 거부(스스로를 붙잡는 조건)", () => {
    expect(
      validateSavedSegmentInput({ name: "a", spec, autoTag: { enabled: true, label: "만료임박" } }, "create")
    ).toMatchObject({ ok: false, error: expect.stringContaining("팀 공유") })
    expect(
      validateSavedSegmentInput({ name: "a", spec, visibility: "team", autoTag: { enabled: true } }, "create")
    ).toMatchObject({ ok: false, error: expect.stringContaining("라벨") })
    expect(
      validateSavedSegmentInput(
        { name: "a", spec: { tagsAll: ["VIP"] }, visibility: "team", autoTag: { enabled: true, label: "vip" } },
        "create"
      )
    ).toMatchObject({ ok: false, error: expect.stringContaining("스스로") })
    expect(
      validateSavedSegmentInput({ name: "a", spec, visibility: "team", autoTag: { enabled: true, label: " 만료  임박 " } }, "create")
    ).toMatchObject({ ok: true, value: { autoTag: { enabled: true, label: "만료 임박" } } })
  })

  it("수정 — 현재 값과 합쳐 자동 태그 제약을 본다(내 것으로 바꾸면 거부, 보관 중이면 거부)", () => {
    const current = { visibility: "team" as const, spec, autoTagEnabled: true, autoTagLabel: "만료임박", archived: false }
    expect(validateSavedSegmentInput({ visibility: "mine" }, "update", current)).toMatchObject({ ok: false })
    expect(validateSavedSegmentInput({ visibility: "mine", autoTag: { enabled: false } }, "update", current)).toMatchObject({
      ok: true,
    })
    expect(
      validateSavedSegmentInput({ autoTag: { enabled: true } }, "update", { ...current, autoTagEnabled: false, archived: true })
    ).toMatchObject({ ok: false, error: expect.stringContaining("보관") })
    // 이름만 바꾸면 조건·공유는 건드리지 않는다.
    expect(validateSavedSegmentInput({ name: "새 이름" }, "update", current)).toEqual({ ok: true, value: { name: "새 이름" } })
  })
})

describe("decideAutoTag — 가드 우선순위", () => {
  const base: AutoTagDecisionInput = {
    enabled: true,
    readable: true,
    usesNeoSignals: false,
    flags: [],
    total: 10,
    truncated: false,
    previousTotal: null,
    overBudget: false,
  }

  it("off → unreadable → neo_stale → degraded → too_many → spike → time_budget → apply", () => {
    expect(decideAutoTag({ ...base, enabled: false, readable: false })).toBe("off")
    expect(decideAutoTag({ ...base, readable: false, flags: ["neo_stale"], usesNeoSignals: true })).toBe("skipped_unreadable")
    expect(decideAutoTag({ ...base, usesNeoSignals: true, flags: ["neo_stale", "compass_down"] })).toBe("skipped_neo_stale")
    expect(decideAutoTag({ ...base, flags: ["compass_partial"], total: AUTO_TAG_MAX_MEMBERS + 1 })).toBe("skipped_degraded")
    expect(decideAutoTag({ ...base, flags: ["source_incomplete"] })).toBe("skipped_degraded")
    expect(decideAutoTag({ ...base, total: AUTO_TAG_MAX_MEMBERS + 1, previousTotal: 20 })).toBe("skipped_too_many")
    expect(decideAutoTag({ ...base, truncated: true })).toBe("skipped_too_many")
    expect(decideAutoTag({ ...base, total: 61, previousTotal: 20, overBudget: true })).toBe("skipped_spike")
    expect(decideAutoTag({ ...base, overBudget: true })).toBe("skipped_time_budget")
    expect(decideAutoTag(base)).toBe("apply")
  })

  it("NEO 조건이 없으면 neo_stale 플래그로 멈추지 않는다", () => {
    expect(decideAutoTag({ ...base, flags: ["neo_stale"], usesNeoSignals: false })).toBe("apply")
  })

  it("급변 가드 — 전날 20명 이상에서 3배 초과 증가 또는 1/3 미만 감소", () => {
    expect(isSegmentCountSpike(61, 20)).toBe(true)
    expect(isSegmentCountSpike(60, 20)).toBe(false)
    expect(isSegmentCountSpike(6, 20)).toBe(true)
    expect(isSegmentCountSpike(7, 20)).toBe(false)
    expect(isSegmentCountSpike(500, 19)).toBe(false)
    expect(isSegmentCountSpike(0, null)).toBe(false)
  })

  it("떼기 상한 — max(50, 붙여 둔 행 × 50%)", () => {
    expect(segmentUntagLimit(0)).toBe(50)
    expect(segmentUntagLimit(80)).toBe(50)
    expect(segmentUntagLimit(301)).toBe(151)
  })

  it("적용 결과 상태", () => {
    expect(autoTagResultStatus({ tagged: 3, untagged: 0, failed: 0 })).toBe("applied")
    expect(autoTagResultStatus({ tagged: 3, untagged: 0, failed: 1 })).toBe("partial")
    expect(autoTagResultStatus({ tagged: 0, untagged: 0, failed: 2 })).toBe("failed")
  })
})

describe("8주 추이·직전 건수", () => {
  const today = "2026-09-25"

  it("주 끝 = 오늘, 오늘-7 …(오래된 주 → 최근 주), 창 안 마지막 점, 조건 변경·품질 표시", () => {
    const trend = buildSegmentWeeklyTrend(
      [
        { date: "2026-09-25", total: 30, specHash: "h2", flags: [] },
        { date: "2026-09-24", total: 29, specHash: "h2", flags: [] },
        { date: "2026-09-17", total: 20, specHash: "h1", flags: ["compass_down"] },
        { date: "2026-09-12", total: 18, specHash: "h1", flags: ["truncated"] },
        { date: "2026-07-01", total: 5, specHash: "h1", flags: [] },
      ],
      "h2",
      today
    )
    expect(trend).toHaveLength(8)
    expect(trend[7]).toEqual({ weekEnd: "2026-09-25", total: 30, specChanged: false, degraded: false })
    expect(trend[6]).toEqual({ weekEnd: "2026-09-18", total: 20, specChanged: true, degraded: true })
    // truncated 는 건수 품질 플래그가 아니다(회원 키만 잘림).
    expect(trend[5]).toEqual({ weekEnd: "2026-09-11", total: null, specChanged: false, degraded: false })
    expect(trend[0].weekEnd).toBe("2026-08-07")
    expect(trend.filter((point) => point.total != null)).toHaveLength(2)
  })

  it("직전 건수 — 같은 조건, 오늘보다 이른 가장 최근 점(7일 안)", () => {
    const points = [
      { date: "2026-09-25", total: 99, specHash: "h", flags: [] },
      { date: "2026-09-23", total: 40, specHash: "h", flags: [] },
      { date: "2026-09-24", total: 41, specHash: "other", flags: [] },
      { date: "2026-09-10", total: 5, specHash: "h", flags: [] },
    ]
    expect(previousSegmentTotal(points, "h", today)).toBe(40)
    expect(previousSegmentTotal(points.slice(3), "h", today)).toBeNull()
  })
})

describe("가시성·편집 권한", () => {
  const owner = { userId: "u-owner", isStaffAdmin: false }
  const other = { userId: "u-other", isStaffAdmin: false }
  const admin = { userId: "u-admin", isStaffAdmin: true }
  const mine = { visibility: "mine" as const, ownerUserId: "u-owner" }
  const team = { visibility: "team" as const, ownerUserId: "u-owner" }

  it("내 것은 소유자만 본다 — 관리자도 못 본다", () => {
    expect(isSavedSegmentVisibleTo(mine, owner)).toBe(true)
    expect(isSavedSegmentVisibleTo(mine, other)).toBe(false)
    expect(isSavedSegmentVisibleTo(mine, admin)).toBe(false)
    expect(isSavedSegmentVisibleTo(mine, { userId: null, isStaffAdmin: true })).toBe(false)
    expect(isSavedSegmentVisibleTo(team, other)).toBe(true)
  })

  it("편집 — 소유자, 또는 팀 세그먼트면 관리자", () => {
    expect(canEditSavedSegment(team, owner)).toBe(true)
    expect(canEditSavedSegment(team, other)).toBe(false)
    expect(canEditSavedSegment(team, admin)).toBe(true)
    expect(canEditSavedSegment(mine, admin)).toBe(false)
  })

  it("자동 태그 관리 — 관리자만(소유자라도 관리자가 아니면 불가)", () => {
    expect(canManageSavedSegmentAutoTag(team, owner)).toBe(false)
    expect(canManageSavedSegmentAutoTag(team, admin)).toBe(true)
    expect(canManageSavedSegmentAutoTag({ visibility: "mine", ownerUserId: "u-admin" }, admin)).toBe(true)
  })
})
