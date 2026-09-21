import { readFileSync } from "node:fs"
import path from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import ActivityQuickForm, {
  buildContactChips,
  CONTACT_CHIP_LIMIT,
  type ContactChip,
} from "@/components/admin/crm/rail/ActivityQuickForm"
import { MODE_FIELDS } from "@/components/admin/crm/rail/activity-contract"
import type { RecentCustomer } from "@/lib/crm/recent-customers"
import type { TodayContact } from "@/lib/crm/today-contacts"

// 기획 §14.2 A1 — 한 줄 컴포저: (1) 회의록도 요지 한 줄이 기본(MODE_FIELDS), (2) 최근·오늘 연락
// 고객 칩 원클릭 연결. DOM 테스트 환경이 없어 (a) 순수 병합 함수, (b) 정적 마크업(localStorage mock),
// (c) 소스 계약(핸들러 배선)으로 고정한다 — activity-quick-form-templates.test.tsx와 같은 방식.

const SOURCE = readFileSync(
  path.resolve(__dirname, "../../components/admin/crm/rail/ActivityQuickForm.tsx"),
  "utf8"
)

function stubLocalStorage(recents: RecentCustomer[]) {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => (key === "crm:recent-customers" ? JSON.stringify(recents) : null),
      setItem: () => {},
      removeItem: () => {},
    },
  })
}

function recent(overrides: Partial<RecentCustomer> = {}): RecentCustomer {
  return { key: "lead:lead-1", name: "프리셋 학원", sourceLabel: "리드", source: "lead", ...overrides }
}

function today(overrides: Partial<TodayContact> = {}): TodayContact {
  return {
    key: "neo:acc-1",
    targetType: "neo_account",
    targetId: "acc-1",
    name: "오늘 학원",
    occurredAt: "2026-09-21T01:00:00.000Z",
    ...overrides,
  }
}

describe("A1 — 회의록도 요지 한 줄이 기본 (MODE_FIELDS)", () => {
  it("meeting_minutes의 primary는 body뿐이고, 나머지 서술 필드는 전부 advanced다", () => {
    expect(MODE_FIELDS.meeting_minutes.primary).toEqual(["body"])
    expect(MODE_FIELDS.meeting_minutes.advanced).toEqual(
      expect.arrayContaining(["attendees", "meetingPurpose", "decisions", "blockers", "nextAction", "sentiment", "stageSignal", "tags"])
    )
    expect(MODE_FIELDS.meeting_minutes.advanced).toHaveLength(8)
  })

  it("회의록 모드 안내 문구가 컴포저와 full/compact 필드 스택 양쪽에 있다", () => {
    expect(SOURCE).toContain("요지 한 줄이면 저장됩니다 · 결정·차단·참석자는 +상세")
    expect(SOURCE).toContain('data-testid="composer-meeting-hint"')
    expect(SOURCE).toContain('data-testid="fields-meeting-hint"')
  })

  it("서버 계약(hasUsefulContent)에 의존하는 body 필수 검증 문구는 그대로다", () => {
    // 저장 계약 불변 — 클라 MODE_FIELDS만 바뀐다(플랜 §14.1).
    expect(SOURCE).toContain("제목, 요약, 메모, 다음 액션 또는 녹음파일 중 하나는 필요합니다.")
  })
})

describe("A1 — buildContactChips (순수 병합 함수)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("오늘 기록 대상을 먼저 채우고 '오늘' 표시를 단다", () => {
    const chips = buildContactChips([], [today()])
    expect(chips).toEqual([{ key: "neo:acc-1", targetType: "neo_account", targetId: "acc-1", name: "오늘 학원", tag: "오늘" }])
  })

  it("최근 고객은 '최근' 표시를 달고, 같은 대상이 오늘 목록에도 있으면 '오늘'이 남는다(중복 제거)", () => {
    const chips = buildContactChips([recent({ key: "neo:acc-1", name: "오늘 학원(최근)", source: "neo_account" })], [today()])
    expect(chips).toHaveLength(1)
    expect(chips[0]).toMatchObject({ key: "neo:acc-1", tag: "오늘" })
  })

  it("각 목록 상한(4)을 넘는 항목은 버리고, 합계는 6을 넘지 않는다", () => {
    const todays = Array.from({ length: 5 }, (_, i) => today({ key: `neo:t${i}`, targetId: `t${i}`, name: `오늘 ${i}` }))
    const recents = Array.from({ length: 5 }, (_, i) => recent({ key: `lead:r${i}`, name: `최근 ${i}` }))
    const chips = buildContactChips(recents, todays)
    expect(CONTACT_CHIP_LIMIT).toBe(6)
    expect(chips).toHaveLength(6)
    expect(chips.filter((c) => c.tag === "오늘")).toHaveLength(4)
    expect(chips.filter((c) => c.tag === "최근")).toHaveLength(2)
  })

  it("이름 없는 최근 고객은 거른다", () => {
    const chips = buildContactChips([recent({ name: "  ", key: "lead:blank" })], [])
    expect(chips).toEqual([] as ContactChip[])
  })

  it("입력이 모두 비어 있으면 빈 배열", () => {
    expect(buildContactChips([], [])).toEqual([])
  })
})

describe("A1 — 칩 행 정적 마크업(최근 고객 mock)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("composer 변형은 최근 고객으로 칩 행을 그리고 aria-label·터치 타깃을 갖는다", () => {
    stubLocalStorage([recent()])
    const html = renderToStaticMarkup(<ActivityQuickForm variant="composer" />)
    expect(html).toContain('data-testid="activity-contact-chip-row"')
    expect(html).toContain('aria-label="최근·오늘 연락 고객"')
    expect(html).toContain('role="group"')
    expect(html).toContain("프리셋 학원")
    expect(html).toContain("최근")
    expect(html).toContain("aria-pressed")
  })

  it("compact 변형도 같은 칩 행을 대상 피커 아래에 그린다", () => {
    stubLocalStorage([recent({ key: "neo:acc-2", name: "컴팩트 학원", source: "neo_account" })])
    const html = renderToStaticMarkup(<ActivityQuickForm compact />)
    expect(html).toContain('data-testid="activity-contact-chip-row"')
    expect(html).toContain("컴팩트 학원")
  })

  it("full 변형에는 칩 행이 없다", () => {
    stubLocalStorage([recent()])
    const html = renderToStaticMarkup(<ActivityQuickForm />)
    expect(html).not.toContain('data-testid="activity-contact-chip-row"')
  })

  it("최근 고객이 없으면 칩 행 자체를 그리지 않는다", () => {
    stubLocalStorage([])
    const html = renderToStaticMarkup(<ActivityQuickForm variant="composer" />)
    expect(html).not.toContain('data-testid="activity-contact-chip-row"')
  })

  it("lockTarget이면 최근 고객이 있어도 칩 행을 숨긴다", () => {
    stubLocalStorage([recent()])
    const html = renderToStaticMarkup(
      <ActivityQuickForm variant="composer" lockTarget defaultTargetType="lead" defaultTargetId="lead-9" defaultTargetLabel="고정 학원" />
    )
    expect(html).not.toContain('data-testid="activity-contact-chip-row"')
  })
})

describe("A1 — 칩 클릭 핸들러 배선(소스 계약)", () => {
  it("칩 클릭은 customerPicker onPick과 같은 세 상태(targetType/targetId/targetLabel)를 설정한다", () => {
    const rowStart = SOURCE.indexOf("const contactChipRow =")
    const rowEnd = SOURCE.indexOf(") : null", rowStart) + ") : null".length
    const row = SOURCE.slice(rowStart, rowEnd)
    expect(row).toContain("setTargetType(chip.targetType)")
    expect(row).toContain("setTargetId(chip.targetId)")
    expect(row).toContain("setTargetLabel(chip.name)")
    expect(row).toContain("aria-pressed={active}")
    // 즉시 제출하지 않는다 — 미연결 경고 칩(handleSubmit 즉시 호출)과 다르다.
    expect(row).not.toContain("handleSubmit")
  })

  it("칩 데이터는 buildContactChips(recentContacts, todayContacts)에서 나온다", () => {
    expect(SOURCE).toContain("const contactChips = buildContactChips(recentContacts, todayContacts)")
  })

  it("오늘 기록 대상은 /api/admin/crm/events?limit=50을 SSOT TTL로 캐시해 읽는다", () => {
    expect(SOURCE).toContain("`${EVENTS_URL}?limit=50`")
    expect(SOURCE).toContain("ttlMs: CRM_CACHE_TTL_MS")
    expect(SOURCE).toContain("staleWhileRevalidateMs: CRM_CACHE_SWR_MS")
    expect(SOURCE).toContain("extractTodayContacts(data.rows, Date.now())")
    // 실패는 조용히 최근 고객만 남긴다(보조 기능 — 캡션 불필요).
    const effectStart = SOURCE.indexOf("useEffect(() => {\n    if (!showContactChips) return")
    const effectBlock = SOURCE.slice(effectStart, effectStart + 700)
    expect(effectBlock).toContain(".catch(() => {")
  })
})
