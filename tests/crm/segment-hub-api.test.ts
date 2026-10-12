/**
 * 세그먼트 허브(C안 ②, 2026-09-25) — 클라이언트 순수 헬퍼(components/admin/crm/segments/segment-hub-api.ts).
 * 응답 방어 읽기·초안 검증·URL(or 반복)·행동 대상 분리·기한(오늘 18:00 KST)·문구를 고정한다.
 */
import { describe, expect, it } from "vitest"

import {
  SEGMENT_TASK_TITLE_PREFIX,
  alignGroupCounts,
  autoTagBlockReason,
  baseConditionCountRows,
  buildCreateRequest,
  buildUpdateRequest,
  describeAssignmentBlockers,
  describeAutoTagColumn,
  describeAutoTagStatus,
  describeBySource,
  describeQualityFlags,
  describeRunOutcome,
  draftFromSegment,
  draftToFilter,
  emptySegmentDraft,
  formatDelta,
  formatRunAt,
  isDraftDirty,
  kstTodayAtIso,
  memberTruncationNote,
  normalizeMembersResponse,
  normalizeRunResponse,
  normalizeSegmentDetailResponse,
  normalizeSegmentItem,
  normalizeSegmentListResponse,
  readAnyOfCounts,
  readSummaryAnyOf,
  runSkipReason,
  segmentExportUrl,
  segmentPreviewUrl,
  segmentTaskTitle,
  segmentsListUrl,
  splitMemberKeys,
  trendDelta,
  unifiedListHref,
  validateAutoTagLabel,
  validateSegmentDraft,
} from "@/components/admin/crm/segments/segment-hub-api"
import type { SavedSegmentListItem } from "@/lib/crm/saved-segment-api"

const LEAD_A = "11111111-1111-4111-8111-111111111111"
const LEAD_B = "22222222-2222-4222-8222-222222222222"
const CUSTOMER_A = "33333333-3333-4333-8333-333333333333"

function item(partial: Partial<SavedSegmentListItem> = {}): SavedSegmentListItem {
  return {
    id: "seg-1",
    name: "만료 60일 · 위험",
    description: null,
    visibility: "team",
    owner: { userId: "u1", name: "박담당" },
    isMine: true,
    canEdit: true,
    canManageAutoTag: true,
    spec: { expDays: 60, kinds: ["neo_account"] },
    specVersion: 1,
    specReadable: true,
    andOnly: true,
    labels: ["만료 60일 이내", "종류 고객"],
    listHref: "/admin/crm/customers/unified?expDays=60&kinds=neo_account",
    count: 31,
    lastCount: 30,
    lastEvaluatedAt: "2026-09-24T21:02:00.000Z",
    lastRunStatus: "off",
    lastRunDetail: null,
    autoTag: { enabled: false, label: null, untag: false, scheduleLabel: "매일 06시" },
    trend: [],
    trendDays: 0,
    archivedAt: null,
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z",
    ...partial,
  }
}

describe("응답 방어 읽기 — 평평한 JSON·{data} 봉투·빠진 필드", () => {
  it("목록 — 평평한 응답과 봉투를 모두 읽고, id 없는 행은 버린다", () => {
    const flat = normalizeSegmentListResponse({
      available: true,
      warning: null,
      generatedAt: "2026-09-25T00:00:00.000Z",
      scopeCounts: { all: 3, team: 2, mine: 1 },
      live: { ok: true, compass: "down", neoStale: true, neoLatestSyncedAt: "2026-08-28T01:00:00.000Z" },
      segments: [item(), { name: "id 없음" }],
    })
    expect(flat.segments).toHaveLength(1)
    expect(flat.scopeCounts).toEqual({ all: 3, team: 2, mine: 1 })
    expect(flat.live.compass).toBe("down")
    expect(flat.live.neoStale).toBe(true)

    const wrapped = normalizeSegmentListResponse({ data: { available: false, warning: "표 미적용", segments: [] } })
    expect(wrapped.available).toBe(false)
    expect(wrapped.warning).toBe("표 미적용")
    expect(wrapped.segments).toEqual([])
    expect(wrapped.live).toEqual({ ok: true, compass: "ok", neoStale: false, neoLatestSyncedAt: null })
  })

  it("세그먼트 — andOnly·listHref 가 없으면 조건에서 파생, OR 도 목록 링크(or= 실음)", () => {
    const orItem = normalizeSegmentItem({ id: "s2", name: "OR", spec: { expDays: 60, anyOf: [{ risk: ["urgent"] }, { noContactDays: 60 }] } })
    expect(orItem?.andOnly).toBe(false)
    expect(orItem?.listHref?.startsWith("/admin/crm/customers/unified?")).toBe(true)
    expect(orItem?.listHref).toContain("or=")
    // 서버와 같은 정규형(그룹 쿼리 문자열 사전순: noContactDays=60 < risk=urgent)
    expect(orItem?.labels.at(-1)).toBe("(무연락 60일+) 또는 (위험 긴급)")
    const andItem = normalizeSegmentItem({ id: "s3", name: "AND", spec: { expDays: 30 } })
    expect(andItem?.andOnly).toBe(true)
    expect(andItem?.listHref).toBe("/admin/crm/customers/unified?expDays=30")
    expect(andItem?.visibility).toBe("mine")
    expect(andItem?.autoTag.scheduleLabel).toBe("매일 06시")
    expect(normalizeSegmentItem(null)).toBeNull()
  })

  it("읽을 수 없는 판(specReadable=false) — 서버가 준 listHref:null·labels:[] 를 넓어진 조건으로 되살리지 않는다([5])", () => {
    const unreadable = normalizeSegmentItem({
      id: "s9",
      name: "새 판",
      specVersion: 2,
      specReadable: false,
      listHref: null,
      labels: [],
      spec: { expDays: 60, futureKey: ["x"], anyOf: [{ risk: ["urgent"], futureKey2: 3 }] },
    })
    expect(unreadable?.specReadable).toBe(false)
    expect(unreadable?.specVersion).toBe(2)
    expect(unreadable?.listHref).toBeNull()
    expect(unreadable?.labels).toEqual([])
    // 서버가 labels 를 빠뜨려도 넓어진 spec 에서 파생하지 않는다.
    expect(normalizeSegmentItem({ id: "s10", specVersion: 3, specReadable: false, spec: { expDays: 60 } })?.labels).toEqual([])
    // 읽을 수 있는 판은 예전처럼 서버 값 → 없으면 조건에서 파생.
    expect(normalizeSegmentItem({ id: "s11", specReadable: true, spec: { expDays: 30 } })?.listHref).toBe(
      "/admin/crm/customers/unified?expDays=30"
    )
  })

  it("상세·실행·회원 — 계약 이름(tagged)과 초안 이름(wouldTag)을 모두 읽는다", () => {
    const detail = normalizeSegmentDetailResponse({ segment: item(), anyOfCounts: [4, "7"], bySource: { lead: 2, neo_account: 5 } })
    expect(detail?.anyOfCounts).toEqual([4, 7])
    expect(detail?.bySource).toEqual({ lead: 2, neo_account: 5, customer: 0, task: 0 })
    expect(normalizeSegmentDetailResponse({})).toBeNull()

    const run = normalizeRunResponse({ dryRun: true, total: 40, wouldTag: 12, wouldUntag: 3, autoTagStatus: "applied", flags: ["neo_stale", "bogus"] })
    expect(run.tagged).toBe(12)
    expect(run.untagged).toBe(3)
    expect(run.flags).toEqual(["neo_stale"])
    expect(normalizeRunResponse({ autoTagStatus: "weird" }).autoTagStatus).toBe("off")

    const members = normalizeMembersResponse({ total: 900, keys: [`lead:${LEAD_A}`, 7], truncated: true, limit: 500 })
    expect(members).toEqual({ total: 900, keys: [`lead:${LEAD_A}`], truncated: true, limit: 500 })
  })
})

describe("초안 — 정규형·변경 감지·검증", () => {
  it("빈 OR 그룹은 저장 필터에서 빠지고, 그룹은 정규형 순서로 정렬된다", () => {
    const filter = draftToFilter({ base: { expDays: 60 }, groups: [{ risk: ["urgent"] }, {}, { noContactDays: 60 }] })
    expect(filter.expDays).toBe(60)
    expect(filter.anyOf).toEqual([{ noContactDays: 60 }, { risk: ["urgent"] }])
    expect(draftToFilter({ base: { expDays: 60 }, groups: [{}] })).toEqual({ expDays: 60 })
  })

  it("저장본과 같으면 dirty 아님, 이름·공유 범위·조건이 바뀌면 dirty", () => {
    const saved = item()
    const draft = draftFromSegment(saved)
    expect(isDraftDirty(draft, saved)).toBe(false)
    expect(isDraftDirty({ ...draft, name: " 만료 60일 · 위험 " }, saved)).toBe(false)
    expect(isDraftDirty({ ...draft, visibility: "mine" }, saved)).toBe(true)
    expect(isDraftDirty({ ...draft, base: { expDays: 30, kinds: ["neo_account"] } }, saved)).toBe(true)
    // 빈 그룹을 하나 추가만 해도 "저장 안 됨"(저장 검증이 막는다)
    expect(isDraftDirty({ ...draft, groups: [{}] }, saved)).toBe(true)
    expect(isDraftDirty(emptySegmentDraft(), null)).toBe(true)
  })

  it("검증 — 이름·빈 그룹·빈 조건·자동 태그 중 '내 것' 전환", () => {
    expect(validateSegmentDraft({ ...emptySegmentDraft(), base: { expDays: 30 } })).toBe("세그먼트 이름을 입력하세요.")
    expect(validateSegmentDraft({ ...emptySegmentDraft(), name: "가".repeat(61), base: { expDays: 30 } })).toContain("60자")
    expect(validateSegmentDraft({ ...emptySegmentDraft(), name: "x", base: { expDays: 30 }, groups: [{ risk: ["urgent"] }, {}] })).toContain(
      "빈 OR 그룹(그룹 2)"
    )
    expect(validateSegmentDraft({ ...emptySegmentDraft(), name: "x" })).toContain("조건이 없으면 저장할 수 없습니다")
    expect(validateSegmentDraft({ ...emptySegmentDraft(), name: "x", base: { expDays: 30 }, visibility: "mine" }, { autoTagEnabled: true })).toContain(
      "'내 것'으로 바꿀 수 없습니다"
    )
    expect(validateSegmentDraft({ ...emptySegmentDraft(), name: "x", groups: [{ risk: ["urgent"] }] })).toBeNull()
  })

  it("생성·수정 본문 — 수정은 바뀐 필드만, 조건이 같으면 spec 을 싣지 않는다(추이 끊김 방지)", () => {
    const create = buildCreateRequest({ name: " 새 묶음 ", description: " ", visibility: "team", base: { expDays: 14 }, groups: [] })
    expect(create).toEqual({ name: "새 묶음", description: null, spec: { expDays: 14 }, visibility: "team" })

    const saved = item()
    const draft = draftFromSegment(saved)
    expect(buildUpdateRequest({ ...draft, name: "새 이름" }, saved)).toEqual({ name: "새 이름" })
    expect(buildUpdateRequest(draft, saved)).toEqual({})
    const withOr = buildUpdateRequest({ ...draft, groups: [{ risk: ["urgent"] }] }, saved)
    expect(withOr.spec).toEqual({ expDays: 60, kinds: ["neo_account"], anyOf: [{ risk: ["urgent"] }] })
  })
})

describe("URL — 미리보기·CSV·통합 목록 딥링크(or 반복 규약)", () => {
  const orFilter = { expDays: 60, kinds: ["neo_account" as const], anyOf: [{ risk: ["urgent" as const] }, { noContactDays: 60 }] }

  it("미리보기 — 통합 목록 GET 50행 + 기본 키 + or 반복", () => {
    const url = new URL(segmentPreviewUrl(orFilter), "https://x")
    expect(url.pathname).toBe("/api/admin/crm/customers/unified")
    expect(url.searchParams.get("limit")).toBe("50")
    expect(url.searchParams.get("expDays")).toBe("60")
    expect(url.searchParams.getAll("or")).toEqual(["noContactDays=60", "risk=urgent"])
    expect(segmentPreviewUrl({})).toBe("/api/admin/crm/customers/unified?limit=50&offset=0")
  })

  it("CSV — 같은 조건으로 export, 통합 목록 딥링크도 OR 을 or= 로 싣는다(목록은 보기만)", () => {
    expect(new URL(segmentExportUrl(orFilter), "https://x").searchParams.getAll("or")).toHaveLength(2)
    expect(segmentExportUrl({})).toBe("/api/admin/crm/customers/export")
    expect(new URL(unifiedListHref(orFilter) ?? "", "https://x").searchParams.getAll("or")).toHaveLength(2)
    expect(unifiedListHref({ risk: ["urgent"] })).toBe("/admin/crm/customers/unified?risk=urgent")
  })

  it("목록 URL — 기본(전체·활성)은 파라미터 없음", () => {
    expect(segmentsListUrl("all", false)).toBe("/api/admin/crm/segments")
    expect(segmentsListUrl("mine", true)).toBe("/api/admin/crm/segments?scope=mine&archived=1")
  })
})

describe("조건별 건수 — 단독 건수·OR 그룹 건수 정렬 맞춤", () => {
  it("기본 조건 한 줄씩 단독 건수", () => {
    expect(baseConditionCountRows({ expDays: 60, risk: ["urgent"] }, { expDays: 31, risk: 5 })).toEqual([
      { key: "expDays", label: "만료 60일 이내", count: 31 },
      { key: "risk", label: "위험 긴급", count: 5 },
    ])
  })

  it("서버(정규형 순서) 그룹 건수를 편집기 순서에 맞추고, 빈 그룹은 null", () => {
    const editor = [{ risk: ["urgent" as const] }, {}, { noContactDays: 60 }]
    // 서버 정규형: noContactDays=60 < risk=urgent
    expect(alignGroupCounts(editor, [9, 4])).toEqual([4, null, 9])
    expect(alignGroupCounts(editor, [4, 9], [{ risk: ["urgent"] }, { noContactDays: 60 }])).toEqual([4, null, 9])
    expect(readAnyOfCounts({ anyOfCounts: [3, 1] })).toEqual([3, 1])
    expect(readAnyOfCounts({})).toBeNull()
    expect(readSummaryAnyOf({ anyOf: [{ risk: ["urgent"] }] })).toEqual([{ risk: ["urgent"] }])
    expect(readSummaryAnyOf(undefined)).toBeNull()
  })
})

describe("행동 — 대상 분리·할 일 제목·기한(오늘 18:00 KST)", () => {
  it("회원 키를 리드 id·NEO·전환 고객으로 나눈다(담당 배정은 리드만)", () => {
    const split = splitMemberKeys([`lead:${LEAD_A}`, `lead:${LEAD_A.toUpperCase()}`, "neo:ACC-1", `customer:${CUSTOMER_A}`, `lead:${LEAD_B}`, "junk"])
    expect(split.leadIds).toEqual([LEAD_A, LEAD_B])
    expect(split.neoCount).toBe(1)
    expect(split.customerCount).toBe(1)
    expect(split.invalidCount).toBe(1)
  })

  it("할 일 제목 '[세그먼트] 이름'(120자 상한)", () => {
    expect(segmentTaskTitle(" 만료 60일 ")).toBe(`${SEGMENT_TASK_TITLE_PREFIX} 만료 60일`)
    expect(segmentTaskTitle("가".repeat(200)).length).toBe(120)
  })

  it("기한 — 호스트 타임존과 무관하게 KST 오늘 18:00", () => {
    // 2026-09-25 12:00 KST
    expect(kstTodayAtIso(18, Date.parse("2026-09-25T03:00:00.000Z"))).toBe("2026-09-25T09:00:00.000Z")
    // 2026-09-25 23:30 KST — 아직 25일
    expect(kstTodayAtIso(18, Date.parse("2026-09-25T14:30:00.000Z"))).toBe("2026-09-25T09:00:00.000Z")
    // 2026-09-26 00:30 KST — 26일로 넘어감
    expect(kstTodayAtIso(18, Date.parse("2026-09-25T15:30:00.000Z"))).toBe("2026-09-26T09:00:00.000Z")
  })

  it("회원 상한 안내 — 잘렸을 때만", () => {
    expect(memberTruncationNote({ total: 900, keys: new Array(500).fill("k"), truncated: true })).toBe(
      "전체 900명 중 추천순 앞 500명만(한 번 상한)"
    )
    expect(memberTruncationNote({ total: 3, keys: ["a", "b", "c"], truncated: false })).toBeNull()
  })

  it("담당 배정 차단 사유·원천별 건수 문구", () => {
    expect(describeAssignmentBlockers({ unconfirmed: 2, already_assigned: 0, stale_30d: 1 })).toBe("미확인 2 · 30일+ 지난 리드 1")
    expect(describeAssignmentBlockers({})).toBeNull()
    expect(describeBySource({ lead: 12, neo_account: 30, customer: 0 })).toBe("리드 12 · NEO 계정 30")
    expect(describeBySource(null)).toBeNull()
  })
})

describe("자동 태그 — 막는 사유 순서·라벨 검증·결과 문구", () => {
  it("관리자 아님이 먼저, 그다음 저장 전·보관·조건 판·공유 범위", () => {
    expect(autoTagBlockReason(item({ canManageAutoTag: false }), { dirty: true, available: true })).toContain("관리자(SUPER_ADMIN·ADMIN)만")
    expect(autoTagBlockReason(item(), { dirty: false, available: false })).toContain("표가 아직 적용되지 않아")
    expect(autoTagBlockReason(item(), { dirty: true, available: true })).toContain("먼저 저장")
    expect(autoTagBlockReason(item({ archivedAt: "2026-09-24T00:00:00Z" }), { dirty: false, available: true })).toContain("보관된")
    expect(autoTagBlockReason(item({ specReadable: false }), { dirty: false, available: true })).toContain("새 조건 판")
    expect(autoTagBlockReason(item({ visibility: "mine" }), { dirty: false, available: true })).toContain("팀 공유 세그먼트에서만")
    expect(autoTagBlockReason(item(), { dirty: false, available: true })).toBeNull()
  })

  it("라벨 — 1~40자, 자기 조건에 쓰인 라벨은 거부(스스로를 붙잡는 조건)", () => {
    expect(validateAutoTagLabel("  ", {})).toContain("입력하세요")
    expect(validateAutoTagLabel("가".repeat(41), {})).toContain("40자")
    expect(validateAutoTagLabel("vip", { anyOf: [{ tagsAny: ["VIP"] }] })).toContain("스스로를 붙잡는")
    expect(validateAutoTagLabel("이탈 위험", { expDays: 60 })).toBeNull()
  })

  it("드라이런 '오늘 N명에 붙고 M명에서 뗌', 적용 결과, 건너뜀 사유", () => {
    const base = { total: 40, bySource: { lead: 0, neo_account: 40, customer: 0, task: 0 }, flags: [], failed: 0, invalid: 0 }
    expect(describeRunOutcome({ ...base, dryRun: true, autoTagStatus: "applied", tagged: 12, untagged: 3 })).toBe("오늘 12명에 붙고 3명에서 뗌")
    expect(describeRunOutcome({ ...base, dryRun: false, autoTagStatus: "partial", tagged: 10, untagged: 0, failed: 2 })).toBe(
      "10명에 붙이고 0명에서 뗐습니다 · 실패 2"
    )
    expect(runSkipReason({ autoTagStatus: "skipped_neo_stale" })).toBe("건너뜀 — NEO 값 오래됨")
    expect(runSkipReason({ autoTagStatus: "applied" })).toBeNull()
  })

  it("목록 열 문구 — 켜짐 '매일 06시 · #라벨', 적용 결과 +붙임 −뗌", () => {
    expect(describeAutoTagColumn(item({ autoTag: { enabled: true, label: "이탈 위험", untag: false, scheduleLabel: "매일 06시" } }))).toEqual({
      text: "매일 06시 · #이탈 위험",
      tone: "ok",
    })
    expect(describeAutoTagColumn(item())).toEqual({ text: "없음", tone: "idle" })
    expect(describeAutoTagStatus("applied", { tagged: 5, untagged: 1 })).toEqual({ text: "자동 태그 적용 · +5 −1", tone: "ok" })
    expect(describeAutoTagStatus("applied", { tagged: 5, untagged: 0, blockedUntag: true }).tone).toBe("warning")
    expect(describeAutoTagStatus(null).text).toBe("아직 실행 전")
    expect(describeQualityFlags(["neo_stale", "compass_down"], "2026-08-28T01:00:00.000Z")).toEqual([
      "NEO 값 08-28 기준(오래됨)",
      "Compass 연결 끊김(무연락 건수가 부풀 수 있음)",
    ])
  })
})

describe("시각·추이 문구", () => {
  const now = Date.parse("2026-09-25T03:00:00.000Z") // 12:00 KST

  it("마지막 실행 — 오늘·어제·MM-DD(KST)", () => {
    expect(formatRunAt("2026-09-24T21:02:00.000Z", now)).toBe("오늘 06:02")
    expect(formatRunAt("2026-09-23T21:01:00.000Z", now)).toBe("어제 06:01")
    expect(formatRunAt("2026-09-20T01:00:00.000Z", now)).toBe("09-20 10:00")
    expect(formatRunAt(null, now)).toBe("아직 없음")
  })

  it("8주 증감 — 지금 조건으로 잰 점만, 2점 미만이면 없음", () => {
    const trend = [
      { weekEnd: "2026-08-07", total: 90, specChanged: true, degraded: false },
      { weekEnd: "2026-08-14", total: 20, specChanged: false, degraded: false },
      { weekEnd: "2026-08-21", total: null, specChanged: false, degraded: false },
      { weekEnd: "2026-08-28", total: 31, specChanged: false, degraded: true },
    ]
    expect(trendDelta(trend)).toBe(11)
    expect(formatDelta(11)).toBe("+11")
    expect(formatDelta(-4)).toBe("−4")
    expect(formatDelta(0)).toBe("±0")
    expect(trendDelta(trend.slice(0, 2))).toBeNull()
  })
})
