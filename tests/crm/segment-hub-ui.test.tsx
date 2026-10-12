/**
 * 세그먼트 허브(C안 ②, 2026-09-25) 화면 — 스파크라인 기하, OR 그룹 편집기, 자동 태그 패널(관리자·드라이런 게이트),
 * 행동 바(리드만 배정·발송 없음), 상세·허브 골격, 조건 막대의 추가 props. DOM 테스트 환경이 없어
 * renderToStaticMarkup + 순수 함수 + 소스 문자열 계약으로 고정한다.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

const searchParamsRef = { current: new URLSearchParams() }

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsRef.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/crm/customers/segments",
}))

vi.mock("@/lib/admin-client", () => ({
  adminFetch: vi.fn(async () => new Response("{}")),
  adminFetchJson: vi.fn(async () => ({})),
  adminFetchJsonCached: vi.fn(async () => ({ segments: [] })),
  clearAdminRequestCache: vi.fn(),
  getCachedAdminJson: vi.fn(() => null),
}))

import SegmentActionBar, {
  SEGMENT_ASSIGN_NEO_REASON,
  SegmentActionResult,
  describeAssignScope,
  segmentActionResultLinks,
  segmentActionsBlockReason,
  segmentAssignBlockReason,
} from "@/components/admin/crm/segments/SegmentActionBar"
import SegmentAutoTagPanel, {
  AUTO_TAG_MANAGER_ONLY_REASON,
  autoTagEnableGate,
  autoTagPreviewKey,
  autoTagRunKey,
  autoTagSourceWarnings,
  autoTagSpecKey,
  suggestAutoTagLabel,
} from "@/components/admin/crm/segments/SegmentAutoTagPanel"
import { autoTagBlockReason, knownDetailAnyOfCounts, knownDetailBySource } from "@/components/admin/crm/segments/segment-hub-api"
import SegmentDetailPanel, { UnreadableSegmentNotice } from "@/components/admin/crm/segments/SegmentDetailPanel"
import SegmentHubClient, { segmentHubSourceNotices } from "@/components/admin/crm/segments/SegmentHubClient"
import SegmentOrGroupsEditor, {
  OR_GROUP_EMPTY_HINT,
  addOrGroup,
  removeOrGroup,
  replaceOrGroup,
} from "@/components/admin/crm/segments/SegmentOrGroupsEditor"
import SegmentTrendSpark, {
  SPARK_END_COLOR,
  buildTrendSparkGeometry,
  trendEmptyCaption,
  trendSparkLabel,
} from "@/components/admin/crm/segments/SegmentTrendSpark"
import SegmentConditionBar, {
  SEGMENT_CONDITION_BAR_DEFAULT_CLASS,
} from "@/components/admin/crm/unified/SegmentConditionBar"
import type {
  SavedSegmentDetailResponse,
  SavedSegmentListItem,
  SavedSegmentLiveStatus,
  SegmentTrendPoint,
} from "@/lib/crm/saved-segment-api"
import type { CrmUnifiedSegmentSummary } from "@/lib/repositories/crm-unified-customers"

const NOW = Date.parse("2026-09-25T03:00:00.000Z")
const SEGMENT_DIR = resolve(process.cwd(), "components/admin/crm/segments")
const read = (file: string) => readFileSync(resolve(SEGMENT_DIR, file), "utf8").replace(/\r\n/g, "\n")

function item(partial: Partial<SavedSegmentListItem> = {}): SavedSegmentListItem {
  return {
    id: "3f1f2d7e-1111-4111-8111-111111111111",
    name: "만료 60일 · 위험 또는 무연락",
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
    lastRunStatus: null,
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

const LIVE_OK: SavedSegmentLiveStatus = { ok: true, compass: "ok", neoStale: false, neoLatestSyncedAt: "2026-09-24T01:00:00.000Z" }
const LIVE_STALE: SavedSegmentLiveStatus = { ok: true, compass: "down", neoStale: true, neoLatestSyncedAt: "2026-08-28T01:00:00.000Z" }

function summary(partial: Partial<CrmUnifiedSegmentSummary> = {}): CrmUnifiedSegmentSummary {
  return {
    spec: {},
    active: false,
    labels: [],
    baseTotal: 340,
    total: 12,
    conditionCounts: {},
    optionCounts: { "expDays:30": 12, "risk:urgent": 3 },
    noContactNoRecordCount: 0,
    facets: { owners: [], regions: [], tags: [] },
    facetHiddenCounts: { owners: 0, regions: 0, tags: 0 },
    ...partial,
  }
}

function point(weekEnd: string, total: number | null, flags: Partial<SegmentTrendPoint> = {}): SegmentTrendPoint {
  return { weekEnd, total, specChanged: false, degraded: false, ...flags }
}

describe("8주 스파크라인 — 끝점 강조·조건 변경 전 흐리게·품질 경고 점선", () => {
  const trend = [
    point("2026-08-07", 40, { specChanged: true }),
    point("2026-08-14", 30),
    point("2026-08-21", null),
    point("2026-08-28", 25, { degraded: true }),
    point("2026-09-04", 26),
    point("2026-09-11", 28),
    point("2026-09-18", 30),
    point("2026-09-25", 33),
  ]

  it("기하 — 기록 없는 주는 비우고, 그 주를 건너는 선·품질 경고 점에 닿는 선은 점선, 조건 변경 전 선은 흐리게", () => {
    const geometry = buildTrendSparkGeometry(trend)
    expect(geometry.points).toHaveLength(7)
    expect(geometry.end?.total).toBe(33)
    expect(geometry.end?.isEnd).toBe(true)
    expect(geometry.segments[0]).toMatchObject({ faded: true, dashed: false })
    // 30(08-14) → 25(08-28): 기록 없는 주를 건너고 도착점이 품질 경고 → 점선
    expect(geometry.segments[1]).toMatchObject({ faded: false, dashed: true })
    expect(geometry.segments[2]).toMatchObject({ faded: false, dashed: true })
    expect(geometry.segments[3]).toMatchObject({ faded: false, dashed: false })
    // 모든 점이 viewBox 안
    for (const p of geometry.points) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(geometry.width)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(geometry.height)
    }
  })

  it("렌더 — role=img + 시작→끝 aria-label, 끝점만 Classin Green, 점마다 호버 제목, 증감", () => {
    const html = renderToStaticMarkup(<SegmentTrendSpark trend={trend} trendDays={50} />)
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="8주 추이 40명에서 33명(조건 변경 전 값 포함 · 품질 경고 주 포함)"')
    expect((html.match(new RegExp(`fill="${SPARK_END_COLOR}"`, "g")) ?? []).length).toBe(1)
    expect(html).toContain('stroke-dasharray="2.5 2"')
    expect(html).toContain('opacity="0.35"')
    expect(html).toContain("<title>09-25 주 · 33명</title>")
    expect(html).toContain("08-07 주 · 40명 (조건 변경 전)")
    // 증감은 지금 조건으로 잰 점만(30 → 33)
    expect(html).toContain(">+3<")
  })

  it("기록이 없으면 그림 대신 'N일째 쌓는 중' / 아직 0일이면 '내일 06시부터 기록'", () => {
    const empty = Array.from({ length: 8 }, (_, index) => point(`2026-09-${String(index + 1).padStart(2, "0")}`, null))
    expect(renderToStaticMarkup(<SegmentTrendSpark trend={empty} trendDays={3} />)).toContain("기록 3일째 쌓는 중")
    expect(renderToStaticMarkup(<SegmentTrendSpark trend={[]} trendDays={0} />)).toContain("내일 06시부터 기록")
    expect(trendEmptyCaption(0)).toBe("내일 06시부터 기록")
    expect(trendSparkLabel([point("2026-09-25", 7)], 2)).toBe("8주 추이 기록 1주 7명")
    // 값이 모두 같으면 가운데 한 줄(급변처럼 보이지 않게)
    const flat = buildTrendSparkGeometry([point("a", 5), point("b", 5)], { height: 26 })
    expect(flat.points.map((p) => p.y)).toEqual([13, 13])
  })
})

describe("OR 그룹 편집기 — 한 단계, 최대 5개, 빈 그룹 안내", () => {
  it("순수 조작 — 추가(상한)·삭제·교체", () => {
    expect(addOrGroup([{}, {}, {}, {}])).toHaveLength(5)
    expect(addOrGroup([{}, {}, {}, {}, {}])).toHaveLength(5)
    expect(removeOrGroup([{ expDays: 14 }, { risk: ["urgent"] }], 0)).toEqual([{ risk: ["urgent"] }])
    expect(replaceOrGroup([{}, {}], 1, { noContactDays: 60 })).toEqual([{}, { noContactDays: 60 }])
  })

  it("그룹마다 조건 막대를 다시 쓰고 '또는'으로 잇는다 — 그룹 머리 줄 인원은 기본 ∧ 그룹", () => {
    const html = renderToStaticMarkup(
      <SegmentOrGroupsEditor
        groups={[{ risk: ["urgent"] }, {}]}
        onChange={() => {}}
        segment={summary()}
        groupCounts={[4, null]}
        loading={false}
      />
    )
    expect(html).toContain('aria-label="OR 그룹 1 조건"')
    expect(html).toContain('aria-label="OR 그룹 2 조건"')
    expect(html).toContain(">또는<")
    expect(html).toContain("1개 적용 · 4명 / 조건 전 340명")
    expect(html).toContain(OR_GROUP_EMPTY_HINT)
    expect(html).toContain("빈 그룹 — 조건을 고르거나 지우세요.")
    expect(html).toContain('aria-label="그룹 1 지우기"')
    expect(html).toContain("OR 그룹 추가")
    expect(html).toContain("그룹 안은 모두(AND), 그룹끼리는 하나라도(OR)")
  })

  it("5개면 추가 버튼을 막고, 읽기 전용이면 추가·지우기 없이 칩도 disabled", () => {
    const full = renderToStaticMarkup(
      <SegmentOrGroupsEditor groups={[{}, {}, {}, {}, {}]} onChange={() => {}} segment={undefined} groupCounts={[]} loading={false} />
    )
    expect(full).toMatch(/disabled=""[^>]*>.*OR 그룹 추가/)
    expect(full).toContain("최대 5개까지입니다.")
    const readOnly = renderToStaticMarkup(
      <SegmentOrGroupsEditor groups={[{ risk: ["urgent"] }]} onChange={() => {}} segment={summary()} groupCounts={[3]} loading={false} readOnly />
    )
    expect(readOnly).not.toContain("OR 그룹 추가")
    expect(readOnly).not.toContain("그룹 지우기")
    expect(readOnly).toMatch(/aria-pressed="true"[^>]*disabled=""/)
  })
})

describe("조건 막대 추가 props — 생략하면 통합 목록 예전 모양 그대로", () => {
  it("기본값 — 겉 틀 클래스·aria-label·안내 문구 불변", () => {
    const html = renderToStaticMarkup(<SegmentConditionBar spec={{}} onChange={() => {}} segment={summary()} total={340} loading={false} />)
    expect(html).toContain(`class="${SEGMENT_CONDITION_BAR_DEFAULT_CLASS}"`)
    expect(html).toContain('aria-label="고객 조건"')
    expect(html).toContain("모두 AND로 묶입니다 · 칩 숫자는 그 조건 하나만 켰을 때 인원")
    expect(html).not.toMatch(/disabled=""/)
  })

  it("허브용 — 제목·aria-label·안내·겉 틀·머리 줄 추가 요소, 읽기 전용이면 초기화 없음·칩 disabled", () => {
    const html = renderToStaticMarkup(
      <SegmentConditionBar
        spec={{ expDays: 30 }}
        onChange={() => {}}
        segment={summary()}
        total={12}
        loading={false}
        title="기본 조건"
        ariaLabel="기본 조건(모두 AND)"
        idleHint="안내"
        className="hub-bar"
        headerExtra={<span>EXTRA</span>}
        readOnly
        testId="bar"
      />
    )
    expect(html).toContain('class="hub-bar"')
    expect(html).toContain('aria-label="기본 조건(모두 AND)"')
    expect(html).toContain('data-testid="bar"')
    expect(html).toContain("기본 조건")
    expect(html).toContain("EXTRA")
    expect(html).not.toContain("조건 초기화")
    expect(html).toMatch(/aria-pressed="true"[^>]*disabled=""[^>]*>30일 이내/)
  })

  it("통합 목록 호출부(CrmUnifiedCustomersClient)는 새 props 없이 그대로 컴파일·동작한다", () => {
    const client = readFileSync(resolve(process.cwd(), "components/admin/crm/CrmUnifiedCustomersClient.tsx"), "utf8")
    const start = client.indexOf("<SegmentConditionBar")
    const block = client.slice(start, client.indexOf("/>", start))
    for (const prop of ["readOnly", "headerExtra", "idleHint", "ariaLabel"]) expect(block).not.toContain(prop)
  })
})

describe("자동 태그 패널 — 관리자만·팀 공유만·켜기 전 드라이런", () => {
  const panel = (segment: SavedSegmentListItem, live: SavedSegmentLiveStatus = LIVE_OK, dirty = false) =>
    renderToStaticMarkup(
      <SegmentAutoTagPanel segment={segment} live={live} dirty={dirty} available nowMs={NOW} onSegmentChange={() => {}} onNotice={() => {}} />
    )

  it("관리자가 아니면 토글을 막고 사유를 보인다", () => {
    const html = panel(item({ canManageAutoTag: false }))
    expect(html).toMatch(/role="switch" aria-checked="false"[^>]*disabled=""/)
    expect(html).toContain(AUTO_TAG_MANAGER_ONLY_REASON)
  })

  it("관리자·팀 공유·저장됨이면 토글이 열려 있다(사유 없음) — '내 것'이면 팀 공유 사유", () => {
    const open = panel(item())
    expect(open).toMatch(/role="switch" aria-checked="false"/)
    expect(open).not.toMatch(/role="switch"[^>]*disabled=""/)
    expect(open).not.toContain('data-testid="segment-auto-tag-block"')
    expect(panel(item({ visibility: "mine" }))).toContain("팀 공유 세그먼트에서만")
    expect(panel(item(), LIVE_OK, true)).toContain("먼저 저장하세요")
  })

  it("켜짐 — '매일 06시 · #라벨' + 떼기 설정 + 마지막 실행 상태, 오늘 실행 미리보기 버튼", () => {
    const html = panel(
      item({
        autoTag: { enabled: true, label: "이탈 위험", untag: false, scheduleLabel: "매일 06시" },
        lastRunStatus: "skipped_neo_stale",
      })
    )
    expect(html).toMatch(/role="switch" aria-checked="true"/)
    expect(html).toContain("매일 06시 · #이탈 위험 · 조건에서 빠지면 떼기 끔")
    expect(html).toContain("건너뜀 — NEO 값 오래됨")
    expect(html).toContain("오늘 실행 미리보기")
    // 드라이런 전에는 적용 버튼이 없다
    expect(html).not.toContain("지금 한 번 적용")
  })

  it("NEO 오래됨·Compass 끊김 경고 — 해당 조건을 쓰는 세그먼트에만", () => {
    const neo = autoTagSourceWarnings(item(), LIVE_STALE)
    expect(neo[0]).toContain("NEO 값이 08-28 기준으로 오래됐습니다")
    expect(neo).toHaveLength(1)
    const contact = autoTagSourceWarnings(item({ spec: { kinds: ["lead"], anyOf: [{ noContactDays: 30 }] } }), LIVE_STALE)
    expect(contact).toEqual(["Compass 연결이 끊기거나 일부만 읽힌 날에는 무연락 조건 자동 태그를 붙이지도 떼지도 않습니다."])
    expect(autoTagSourceWarnings(item(), LIVE_OK)).toEqual([])
    expect(panel(item(), LIVE_STALE)).toContain("동기화 복구 전까지 매일 건너뜁니다")
  })

  it("라벨 기본값·미리보기 키(라벨·떼기·저장 조건을 바꾸면 미리보기 무효)", () => {
    expect(suggestAutoTagLabel("  만료   60일  ")).toBe("만료 60일")
    expect(suggestAutoTagLabel("가".repeat(50))).toHaveLength(40)
    const spec = autoTagSpecKey(item())
    expect(autoTagPreviewKey(" 이탈  위험", false, spec)).toBe(autoTagPreviewKey("이탈 위험", false, spec))
    expect(autoTagPreviewKey("이탈 위험", true, spec)).not.toBe(autoTagPreviewKey("이탈 위험", false, spec))
    // 같은 라벨·떼기라도 저장 조건이 다르면 다른 키
    const changed = autoTagSpecKey(item({ spec: { expDays: 30, kinds: ["neo_account"] } }))
    expect(changed).not.toBe(spec)
    expect(autoTagPreviewKey("이탈 위험", false, changed)).not.toBe(autoTagPreviewKey("이탈 위험", false, spec))
    // 조건 판이 달라도 다른 키, 같은 조건을 다른 순서로 담아도 같은 키(정규형)
    expect(autoTagSpecKey(item({ specVersion: 2 }))).not.toBe(spec)
    expect(autoTagSpecKey(item({ spec: { kinds: ["neo_account"], expDays: 60 } }))).toBe(spec)
    // 켜진 세그먼트의 "오늘 실행 미리보기"·적용 결과 키도 저장 조건에 묶인다
    expect(autoTagRunKey("current", spec)).not.toBe(autoTagRunKey("current", changed))
    expect(autoTagRunKey("current", spec)).not.toBe(autoTagRunKey("applied", spec))
  })

  describe("켜기 게이트 — 드라이런 뒤 조건 변경·저장 전 변경이면 켤 수 없다(리뷰 P2 회귀)", () => {
    const LABEL = "이탈 위험"
    const gate = (
      segment: SavedSegmentListItem,
      options: { previewedWith: SavedSegmentListItem | null; dirty?: boolean; mode?: "view" | "enabling" | "disabling"; labelError?: string | null }
    ) =>
      autoTagEnableGate({
        mode: options.mode ?? "enabling",
        enabled: segment.autoTag.enabled,
        enableBlock: autoTagBlockReason(segment, { dirty: options.dirty ?? false, available: true }),
        previewKey: options.previewedWith ? autoTagPreviewKey(LABEL, false, autoTagSpecKey(options.previewedWith)) : null,
        currentKey: autoTagPreviewKey(LABEL, false, autoTagSpecKey(segment)),
        labelError: options.labelError ?? null,
      })

    const specX = item({ spec: { expDays: 60, kinds: ["neo_account"] } })
    const specY = item({ spec: { expDays: 60, kinds: ["neo_account"], anyOf: [{ risk: ["urgent"] }] }, andOnly: false })

    it("같은 저장 조건으로 드라이런했으면 켤 수 있다", () => {
      expect(gate(specX, { previewedWith: specX })).toEqual({ formOpen: true, previewMatches: true, canEnable: true })
    })

    it("조건 X 로 드라이런 → 조건 Y 로 저장(패널 상태는 남음) → 켜기 막힘, 폼은 열려 '다시 미리보기'", () => {
      expect(gate(specY, { previewedWith: specX })).toEqual({ formOpen: true, previewMatches: false, canEnable: false })
    })

    it("드라이런 뒤 저장하지 않고 조건만 바꾸면(dirty) 폼을 닫고 켜기·드라이런 모두 막는다", () => {
      expect(gate(specX, { previewedWith: specX, dirty: true })).toEqual({ formOpen: false, previewMatches: false, canEnable: false })
    })

    it("보관·표 미적용·'내 것'으로 바뀜 등 다른 차단 사유도 폼을 닫는다", () => {
      const archived = item({ archivedAt: "2026-09-25T00:00:00.000Z" })
      expect(gate(archived, { previewedWith: archived }).canEnable).toBe(false)
      expect(gate(archived, { previewedWith: archived }).formOpen).toBe(false)
      const mine = item({ visibility: "mine" })
      expect(gate(mine, { previewedWith: mine }).formOpen).toBe(false)
      expect(
        autoTagEnableGate({
          mode: "enabling",
          enabled: false,
          enableBlock: autoTagBlockReason(specX, { dirty: false, available: false }),
          previewKey: autoTagPreviewKey(LABEL, false, autoTagSpecKey(specX)),
          currentKey: autoTagPreviewKey(LABEL, false, autoTagSpecKey(specX)),
          labelError: null,
        }).canEnable
      ).toBe(false)
    })

    it("라벨 오류·드라이런 없음·켜기 모드 아님·이미 켜짐이면 켤 수 없다", () => {
      expect(gate(specX, { previewedWith: specX, labelError: "라벨 오류" })).toEqual({ formOpen: true, previewMatches: true, canEnable: false })
      expect(gate(specX, { previewedWith: null }).canEnable).toBe(false)
      expect(gate(specX, { previewedWith: specX, mode: "view" }).formOpen).toBe(false)
      const on = item({ autoTag: { enabled: true, label: LABEL, untag: false, scheduleLabel: "매일 06시" } })
      expect(gate(on, { previewedWith: on }).formOpen).toBe(false)
    })
  })

  it("저장 전 변경(dirty)이면 켜기 폼이 그려지지 않고 사유만 보인다", () => {
    const html = panel(item(), LIVE_OK, true)
    expect(html).not.toContain('data-testid="segment-auto-tag-enable-form"')
    expect(html).toContain("바꾼 조건을 먼저 저장하세요")
  })

  it("소스 계약 — 켜기는 같은 저장 조건·설정의 드라이런 결과가 있을 때만, 드라이런은 가정 설정을 서버에 넘긴다", () => {
    const source = read("SegmentAutoTagPanel.tsx")
    expect(source).toContain("const specKey = autoTagSpecKey(segment)")
    expect(source).toContain("const currentKey = autoTagPreviewKey(label, untag, specKey)")
    expect(source).toContain("if (!canEnable) return")
    expect(source).toContain("disabled={!canEnable || pending !== null}")
    expect(source).toContain("{formOpen ? (")
    expect(source).not.toContain('mode === "enabling" && !enabled ? (')
    // 드라이런은 차단 사유가 있으면 부르지 않고, 결과는 요청 시점의 키로 묶는다
    expect(source).toContain('const blocked = !formOpen ? (enableBlock ?? "자동 태그 켜기 화면이 닫혀 있습니다.") : labelError')
    expect(source).toContain("const key = assume ? currentKey : currentRunKey")
    expect(source).toContain("setPreview({ key, run })")
    // "지금 한 번 적용"도 지금 저장 조건으로 잰 미리보기가 있을 때만
    expect(source).toContain("const canApplyNow = segment.canManageAutoTag && canPreview && preview?.key === currentRunKey")
    expect(source).toContain("if (!canApplyNow) return")
    expect(source).toContain("assumeAutoTag: assume ? { label: normalizedLabel, untag } : undefined")
    expect(source).not.toMatch(/\bconfirm\(|\balert\(/)
    const api = read("segment-hub-api.ts")
    expect(api).toContain("payload.autoTag = { enabled: true, label: options.assumeAutoTag.label, untag: options.assumeAutoTag.untag }")
    expect(api).toContain("adminReadOnly: options.dryRun")
  })
})

describe("행동 바 — 태그·오늘 연락·CSV·담당 배정(리드만), 발송 버튼 없음", () => {
  const bar = (partial: { dirty?: boolean; bySource?: Record<string, number> | null; segment?: SavedSegmentListItem } = {}) =>
    renderToStaticMarkup(
      <SegmentActionBar
        segment={partial.segment ?? item()}
        dirty={partial.dirty ?? false}
        available
        total={31}
        bySource={partial.bySource === undefined ? { lead: 4, neo_account: 27, customer: 0 } : partial.bySource}
        onNotice={() => {}}
      />
    )

  it("버튼 4종과 대상 인원 — 메시지 발송 버튼·자리는 없다", () => {
    const html = bar()
    for (const label of ["태그 붙이기", "오늘 연락에 넣기", "CSV", "담당 배정(리드)"]) expect(html).toContain(label)
    expect(html).toContain("리드 4 · NEO 계정 27")
    expect(html).not.toMatch(/발송|메시지/)
    expect(html).not.toMatch(/disabled=""[^>]*>(?:<svg[^>]*>.*?<\/svg>)?태그 붙이기/)
  })

  it("저장 안 된 변경·보관·새 조건 판이면 전부 막는다", () => {
    expect(bar({ dirty: true })).toContain("바꾼 조건을 저장하거나 되돌린 뒤 실행하세요")
    expect(segmentActionsBlockReason(item({ archivedAt: "x" }), { dirty: false, available: true })).toContain("보관된")
    expect(segmentActionsBlockReason(item({ specReadable: false }), { dirty: false, available: true })).toContain("새 조건 판")
    expect(segmentActionsBlockReason(item(), { dirty: false, available: false })).toContain("표가 아직 적용되지")
    expect(segmentActionsBlockReason(item(), { dirty: false, available: true })).toBeNull()
  })

  it("리드가 없고 NEO 만 있으면 담당 배정을 '외부 CRM 소유' 사유로 막는다", () => {
    const html = bar({ bySource: { lead: 0, neo_account: 27, customer: 0 } })
    expect(html).toContain("외부 CRM 소유")
    expect(html).toMatch(/aria-pressed="false" disabled=""[^>]*title="리드가 없습니다/)
    expect(segmentAssignBlockReason(null)).toBeNull()
    expect(segmentAssignBlockReason({ lead: 1 })).toBeNull()
    expect(segmentAssignBlockReason({ customer: 2 })).toBe("배정할 리드가 없습니다.")
  })

  describe("라이브 평가 실패 상세 — 0 채움을 '모름'으로 다룬다(리뷰 P2 회귀)", () => {
    const detailOf = (partial: Partial<SavedSegmentDetailResponse> = {}): SavedSegmentDetailResponse => ({
      available: true,
      warning: null,
      generatedAt: "2026-09-25T03:00:00.000Z",
      live: LIVE_OK,
      segment: item(),
      anyOfCounts: [4],
      bySource: { lead: 4, neo_account: 27, customer: 0, task: 0 },
      daily: [],
      ...partial,
    })
    // 서버는 evaluateSegmentsLive 가 실패하면 live.ok=false · count=null 인 채 bySource·anyOfCounts 를 0 으로 채워 200 을 준다.
    const failed = detailOf({
      live: { ...LIVE_OK, ok: false },
      segment: item({ count: null }),
      anyOfCounts: [0],
      bySource: { lead: 0, neo_account: 0, customer: 0, task: 0 },
    })

    it("평가 실패·건수 모름·원천 합 0(필드 누락)이면 null, 정상이면 그대로", () => {
      expect(knownDetailBySource(failed)).toBeNull()
      expect(knownDetailAnyOfCounts(failed)).toBeNull()
      expect(knownDetailBySource(detailOf({ live: { ...LIVE_OK, ok: false } }))).toBeNull()
      expect(knownDetailBySource(detailOf({ segment: item({ count: null }) }))).toBeNull()
      expect(knownDetailBySource(detailOf({ bySource: { lead: 0, neo_account: 0, customer: 0, task: 0 } }))).toBeNull()
      expect(knownDetailBySource(null)).toBeNull()
      expect(knownDetailBySource(detailOf())).toEqual({ lead: 4, neo_account: 27, customer: 0, task: 0 })
      expect(knownDetailAnyOfCounts(detailOf())).toEqual([4])
      // 정말 0명인 세그먼트는 0 이 사실이다 — 그대로 둔다(배정 버튼은 '배정할 리드가 없습니다')
      const empty = detailOf({ segment: item({ count: 0 }), bySource: { lead: 0, neo_account: 0, customer: 0, task: 0 } })
      expect(knownDetailBySource(empty)).toEqual({ lead: 0, neo_account: 0, customer: 0, task: 0 })
    })

    it("평가 실패 상세에서는 담당 배정 버튼이 열려 있다(회원 키로 판단)", () => {
      const html = bar({ bySource: knownDetailBySource(failed) })
      expect(html).not.toContain("배정할 리드가 없습니다")
      expect(html).not.toMatch(/aria-pressed="false" disabled=""[^>]*title="(?:리드가 없습니다|배정할 리드가 없습니다)/)
      expect(html).toContain(`title="리드만 배정합니다. ${SEGMENT_ASSIGN_NEO_REASON}"`)
      // 원천 문구도 싣지 않는다('리드 0' 같은 가짜 숫자 없음)
      expect(html).not.toContain("리드 0")
    })

    it("소스 계약 — 상세는 확인된 원천·그룹 건수만 행동 바·그룹 건수에 넘긴다", () => {
      const source = read("SegmentDetailPanel.tsx")
      expect(source).toContain("const detailBySource = knownDetailBySource(detail)")
      expect(source).toContain("const detailAnyOfCounts = knownDetailAnyOfCounts(detail)")
      expect(source).toContain("bySource={detailBySource}")
      expect(source).toContain("alignGroupCounts(draft.groups, detailAnyOfCounts, saved.spec.anyOf ?? [])")
      expect(source).not.toContain("detail?.bySource")
      expect(source).not.toContain("detail.anyOfCounts")
    })
  })

  it("배정 범위 문구 — 배정 가능·차단·NEO/전환 고객 제외", () => {
    const text = describeAssignScope(
      { leadIds: ["a", "b", "c"], neoCount: 5, customerCount: 1, invalidCount: 0 },
      {
        requested: 3,
        manualReviewReady: 2,
        safeLeadIds: ["a", "b"],
        blockedLeadIds: ["c"],
        blockerCounts: { already_assigned: 1 },
        snapshotToken: "t",
        rosterHealthy: true,
        rosterMessage: null,
      }
    )
    expect(text).toBe("리드 3명 중 배정 가능 2명 · 차단 1명(이미 배정 1) · NEO 계정 5명 제외(외부 CRM 소유) · 전환 고객 1명 제외")
  })

  describe("행동 결과는 행동 바 바로 아래 인라인 + 확인 링크([31])", () => {
    it("태그 결과 — '목록에서 보기'(통합 목록 ?tag=)·'태그 관리'(기본 숨김 탭 주소) 링크, 성공은 role=status", () => {
      const html = renderToStaticMarkup(
        <SegmentActionResult result={{ kind: "tag", tone: "success", message: "31명에 #VIP 를 붙였어요", label: "VIP" }} />
      )
      expect(html).toContain('role="status"')
      expect(html).toContain('data-testid="segment-action-result"')
      expect(html).toContain("31명에 #VIP 를 붙였어요")
      expect(html).toContain('href="/admin/crm/customers/unified?tag=VIP"')
      expect(html).toContain("목록에서 보기")
      expect(html).toContain('href="/admin/crm/customers/tags"')
      expect(html).toContain("태그 관리")
    })

    it("일부 실패는 role=alert, 오늘 연락 결과는 현황 링크, 담당 배정은 링크 없음", () => {
      const danger = renderToStaticMarkup(
        <SegmentActionResult result={{ kind: "task", tone: "danger", message: "오늘 연락에 넣음 — 3건 실패" }} />
      )
      expect(danger).toContain('role="alert"')
      expect(danger).toContain('href="/admin/crm"')
      expect(danger).toContain("현황에서 보기")
      expect(segmentActionResultLinks({ kind: "assign", tone: "success", message: "배정" })).toEqual([])
      expect(segmentActionResultLinks({ kind: "tag", tone: "success", message: "x" })).toEqual([
        { label: "태그 관리", href: "/admin/crm/customers/tags" },
      ])
    })

    it("소스 계약 — 태그·오늘 연락·담당 배정 결과는 인라인 상태로(위 배너 onNotice 로 보내지 않는다), CSV 만 배너", () => {
      const source = read("SegmentActionBar.tsx")
      const submitTag = source.slice(source.indexOf("const submitTag"), source.indexOf("const submitTask"))
      const submitTask = source.slice(source.indexOf("const submitTask"), source.indexOf("const exportCsv"))
      const submitAssign = source.slice(source.indexOf("const submitAssign"), source.indexOf("return (\n    <section"))
      for (const block of [submitTag, submitTask, submitAssign]) {
        expect(block).toContain("setResult({")
        expect(block).not.toContain("onNotice(")
      }
      expect(submitTag).toContain('kind: "tag"')
      expect(submitTag).toContain("label,")
      expect(source).toContain("{result ? <SegmentActionResult result={result} onDismiss={() => setResult(null)} /> : null}")
      expect(source).toContain('onNotice(describeCsvExport(exported), "success")')
    })

    it("자동 태그 패널 — 켜져 있으면 붙인 라벨을 확인할 링크(목록·태그 관리)", () => {
      const html = renderToStaticMarkup(
        <SegmentAutoTagPanel
          segment={item({ autoTag: { enabled: true, label: "이탈 위험", untag: false, scheduleLabel: "매일 06시" } })}
          live={LIVE_OK}
          dirty={false}
          available
          nowMs={NOW}
          onSegmentChange={() => {}}
          onNotice={() => {}}
        />
      )
      expect(html).toContain('data-testid="segment-auto-tag-links"')
      expect(html).toContain(`href="/admin/crm/customers/unified?tag=${encodeURIComponent("이탈 위험")}"`)
      expect(html).toContain("#이탈 위험 붙은 고객 보기")
      expect(html).toContain('href="/admin/crm/customers/tags"')
      const off = renderToStaticMarkup(
        <SegmentAutoTagPanel segment={item()} live={LIVE_OK} dirty={false} available nowMs={NOW} onSegmentChange={() => {}} onNotice={() => {}} />
      )
      expect(off).not.toContain('data-testid="segment-auto-tag-links"')
    })
  })

  it("소스 계약 — 할 일 제목·기한 오늘 18시·담당 비움, 배정은 안전 미리보기 토큰으로만", () => {
    const source = read("SegmentActionBar.tsx")
    expect(source).toContain("const dueAt = kstTodayAtIso(SEGMENT_TASK_DUE_KST_HOUR, Date.now())")
    expect(source).toContain("postBulkTasks(members.keys, { title: taskTitle, dueAt })")
    expect(source).toContain("fetchSegmentMembers(segment.id, SEGMENT_TAG_MEMBER_LIMIT)")
    expect(source).toContain("const recheck = await previewLeadAssignment(safeIds)")
    expect(source).toContain("applyLeadAssignment(safeIds, ownerKey, token)")
    const api = read("segment-hub-api.ts")
    expect(api).toContain('mode: "manual_reviewed"')
    expect(api).toContain('"/api/admin/leads/bulk-assign"')
  })
})

describe("상세 — 새 초안·저장본·OR 세그먼트", () => {
  const detail = (listItem: SavedSegmentListItem | null) =>
    renderToStaticMarkup(
      <SegmentDetailPanel
        segmentId={listItem?.id ?? null}
        listItem={listItem}
        live={LIVE_OK}
        available
        nowMs={NOW}
        onSaved={() => {}}
        onArchived={() => {}}
        onClose={() => {}}
        onNotice={() => {}}
        onRefreshList={() => {}}
      />
    )

  it("새 초안 — 이름 입력·기본 조건·OR 편집기, 저장 전이라 행동·자동 태그 대신 안내", () => {
    const html = detail(null)
    expect(html).toContain('id="segment-name"')
    expect(html).toContain('aria-label="기본 조건(모두 AND)"')
    expect(html).toContain('data-testid="segment-or-groups"')
    expect(html).toContain("새 세그먼트 — 저장 전")
    expect(html).toContain("저장하면 태그 붙이기·오늘 연락에 넣기·CSV·담당 배정과 매일 자동 태그를 쓸 수 있습니다.")
    expect(html).not.toContain('data-testid="segment-actions"')
  })

  it("저장본(AND) — 통합 목록 링크·행동 바·자동 태그 패널·보관 버튼", () => {
    const html = detail(item())
    expect(html).toContain("통합 목록에서 열기")
    expect(html).toContain('href="/admin/crm/customers/unified?expDays=60&amp;kinds=neo_account"')
    expect(html).toContain('data-testid="segment-actions"')
    expect(html).toContain('data-testid="segment-auto-tag"')
    expect(html).toContain("저장됨")
    expect(html).toContain("보관")
    expect(html).toContain("만든 사람 박담당")
  })

  it("읽을 수 없는 판(specReadable=false) — 미리보기·조건별 건수·목록 링크·행동 바 없이 안내만, 자동 태그 패널은 남긴다([5])", () => {
    const unreadable = item({
      specVersion: 2,
      specReadable: false,
      listHref: null,
      labels: [],
      lastCount: 30,
      autoTag: { enabled: true, label: "만료", untag: false, scheduleLabel: "매일 06시" },
    })
    const html = detail(unreadable)
    expect(html).toContain('data-testid="segment-unreadable-notice"')
    expect(html).toContain("새 조건 판(v2)")
    expect(html).toContain("30명")
    expect(html).not.toContain("통합 목록에서 열기")
    // 안내 문구에는 끈 항목 이름이 나온다 — 섹션 머리·표(aria-label)로 없는지 본다(읽을 수 있는 판에는 있다).
    const readable = detail(item())
    expect(readable).toMatch(/>결과 미리보기<span/)
    expect(readable).toContain(">조건별 건수<")
    expect(html).not.toMatch(/>결과 미리보기<span/)
    expect(html).not.toContain('aria-label="결과 미리보기"')
    expect(html).not.toContain(">조건별 건수<")
    expect(html).not.toContain('aria-label="기본 조건(모두 AND)"')
    expect(html).not.toContain('data-testid="segment-actions"')
    // 자동 태그는 끌 수 있어야 하므로 패널은 남긴다.
    expect(html).toContain('data-testid="segment-auto-tag"')
    const notice = renderToStaticMarkup(<UnreadableSegmentNotice segment={item({ specVersion: 3, specReadable: false, lastCount: null })} nowMs={NOW} />)
    expect(notice).toContain("새 조건 판(v3)")
    expect(notice).toContain("마지막 기록")
  })

  it("소스 계약 — 읽을 수 없는 판은 미리보기 요청을 하지 않고 목록 링크를 만들지 않는다([5])", () => {
    const source = read("SegmentDetailPanel.tsx")
    expect(source).toContain("const unreadable = Boolean(saved && !saved.specReadable)")
    expect(source).toContain("if (unreadable || filterKey == null || !filter) return")
    expect(source).toContain("}, [filterKey, unreadable])")
    expect(source).toContain("const listHref = draft && !unreadable ? unifiedListHref(draftToFilter(draft)) : null")
    expect(source).toContain("{unreadable ? null : (")
  })

  it("OR 세그먼트 — 통합 목록 링크 + '목록에서는 보기만' 안내, 편집 권한 없으면 읽기 전용", () => {
    const html = detail(item({ spec: { expDays: 60, anyOf: [{ risk: ["urgent"] }] }, andOnly: false, listHref: null, canEdit: false }))
    expect(html).toContain("통합 목록에서 열기")
    expect(html).toContain("OR 포함 — 목록에서는 보기만")
    expect(html).toContain("소유자(또는 팀 세그먼트면 관리자)만 고칠 수 있습니다")
    expect(html).not.toContain("OR 그룹 추가")
    expect(html).toMatch(/id="segment-name"[^>]*disabled=""/)
  })
})

describe("허브 — 골격·원천 안내·URL 상태", () => {
  it("첫 렌더 — 제목·새 세그먼트·범위 칩·로딩 골격(데이터 전)", () => {
    searchParamsRef.current = new URLSearchParams()
    const html = renderToStaticMarkup(<SegmentHubClient />)
    expect(html).toContain(">세그먼트<")
    expect(html).toContain("새 세그먼트")
    expect(html).toContain('aria-label="세그먼트 범위"')
    for (const label of ["전체", "팀 공유", "내 것"]) expect(html).toContain(label)
    expect(html).toContain("보관함")
    expect(html).not.toMatch(/발송/)
  })

  it("원천 안내 — 평가 실패·NEO 오래됨·Compass 끊김·추이 표 경고, 표 미적용이면 따로(배너)", () => {
    const notices = segmentHubSourceNotices({
      available: true,
      trendWarning: "일별 표 미적용",
      live: { ok: false, compass: "down", neoStale: true, neoLatestSyncedAt: "2026-08-28T01:00:00.000Z" },
    })
    expect(notices.map((notice) => notice.tone)).toEqual(["warning", "warning", "info", "info"])
    expect(notices[1].message).toContain("NEO 값이 08-28 기준입니다")
    expect(notices[3].message).toBe("일별 표 미적용")
    expect(segmentHubSourceNotices({ available: false, trendWarning: null, live: LIVE_STALE })).toEqual([])
    expect(segmentHubSourceNotices(null)).toEqual([])
  })

  it("소스 계약 — 선택은 ?id= 만(리드 보드 ?segment= 금지), 표 미적용 배너는 통합 목록 URL 공유 안내", () => {
    const source = read("SegmentHubClient.tsx")
    expect(source).toContain('searchParams.get("id")')
    expect(source).toContain('params.set("id", id)')
    expect(source).not.toContain('get("segment")')
    expect(source).toContain("SEGMENT_NOT_READY_SHARE_HINT")
    expect(read("segment-hub-api.ts")).toContain("그동안 조건은 통합 목록 URL로 공유하세요")
  })

  it("소스 계약 — 목록은 강등 응답을 캐시에 남기지 않는 헬퍼로만 읽는다(직접 adminFetchJsonCached 금지)", () => {
    const source = read("SegmentHubClient.tsx")
    expect(source).toContain("const cached = readCachedSegmentList(url)")
    expect(source).toContain("const next = await fetchSegmentList(url, {")
    expect(source).not.toContain("adminFetchJsonCached")
    expect(source).not.toContain("getCachedAdminJson")
    const api = read("segment-hub-api.ts")
    expect(api).toContain("if (!isSegmentListCacheable(data)) clearAdminRequestCache(url)")
    expect(api).toContain("return data.available && data.live.ok && !data.trendWarning")
  })

  it("페이지 — Suspense 골격 + 허브 클라이언트, 메타 제목", () => {
    const page = readFileSync(resolve(process.cwd(), "app/admin/crm/customers/segments/page.tsx"), "utf8")
    expect(page).toContain("<Suspense fallback={<SegmentsFallback />}>")
    expect(page).toContain("<SegmentHubClient />")
    expect(page).toContain('title: "세그먼트 | Admin CRM"')
  })
})
