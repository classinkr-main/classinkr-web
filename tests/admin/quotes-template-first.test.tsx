// 견적서 탭 첫 화면 = 템플릿 고르기 (2026-11-20 결정).
//
//  - 왼쪽 견적 목록은 그대로, 오른쪽만 바뀐다: 고른 견적이 없으면 템플릿 고르기, 고르면 그 견적 상세.
//  - ?quote=<id> 딥링크(공유·알림)는 지금처럼 그 견적 상세를 바로 연다.
//  - 카드를 누르면 그 템플릿 id 로 작성기가 열린다.
import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { ReactElement, ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// jsdom 이 없고 Node SSR 에는 이펙트가 없다 — 목록을 "불러온 뒤" 상태를 보려면 패널의 useState 를 씨앗으로 채운다
// (tests/crm/performance-charts-render.test.tsx 와 같은 방식). 번호는 HardwareQuotesPanel 의 useState 선언 순서다:
//   0 composerOpen · 1 composerTemplateId · 2 quotes · 3 loading
// 패널이 부르는 훅·자식은 아래에서 전부 useState 없는 대역으로 바꿔 번호가 밀리지 않는다.
// 순서가 바뀌면 "씨앗 번호가 패널 상태와 맞는다" 테스트가 먼저 깨진다.
const state = vi.hoisted(() => ({
  seeds: new Map<number, unknown>(),
  index: 0,
  setCalls: [] as Array<[number, unknown]>,
}))
const captured = vi.hoisted(() => ({
  composer: null as null | { open: boolean; initialTemplateId?: string },
  picker: null as null | {
    hiddenTemplateIds?: readonly string[]
    onSelect: (templateId: import("@/lib/standard-quote-template").StandardQuoteTemplateId) => void
  },
}))

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = state.index++
      const [value] = actual.useState(state.seeds.has(index) ? state.seeds.get(index) : initial)
      return [value, (next: unknown) => void state.setCalls.push([index, next])]
    },
  }
})
vi.mock("@/lib/admin-client", () => ({ adminFetchJson: vi.fn(), adminFetch: vi.fn() }))
vi.mock("@/lib/portal/portal-fetch", () => ({ portalFetch: vi.fn() }))
vi.mock("@/components/admin/crm/useCrmOwners", () => ({ useCrmOwners: () => ({ owners: [] }) }))
vi.mock("@/components/admin/quote-templates/useQuoteWorkspacePreferences", () => ({
  useQuoteWorkspacePreferences: () => ({
    preferences: { version: 1, showRecentQuotes: true, showTemplates: true, hiddenTemplateIds: ["base:camera_t1"] },
    updatePreferences: vi.fn(),
    storageError: null,
  }),
}))
vi.mock("@/components/admin/documents/DistributorSettlementSection", () => ({
  default: () => <div data-stub="distributor-settlement" />,
}))
vi.mock("@/components/portal/quotes/QuickQuoteComposer", () => ({
  default: (props: { open: boolean; initialTemplateId?: string }) => {
    captured.composer = props
    return null
  },
}))
vi.mock("@/components/admin/documents/QuoteTemplatePicker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/admin/documents/QuoteTemplatePicker")>()
  return {
    ...actual,
    default: (props: Parameters<typeof actual.default>[0]) => {
      captured.picker = props
      return actual.default(props)
    },
  }
})

import HardwareQuotesPanel from "@/components/admin/documents/HardwareQuotesPanel"
import QuoteTemplatePicker from "@/components/admin/documents/QuoteTemplatePicker"
import {
  countHiddenBaseQuoteTemplates,
  listQuoteTemplatePickerGroups,
} from "@/lib/quote-template-picker"
import {
  isRetiredQuoteTemplate,
  isSoftwareQuoteTemplate,
  STANDARD_QUOTE_TEMPLATES,
} from "@/lib/standard-quote-template"

function quoteRow(id: string, quoteNumber: string, customerName: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    quoteNumber,
    title: `${customerName} 전자칠판 86" 견적서`,
    customerName,
    dealTitle: `${customerName} 전자칠판`,
    totalAmount: 6_300_000,
    subtotalAmount: 6_300_000,
    discountAmount: 0,
    taxAmount: 0,
    vatIncluded: true,
    status: "draft",
    shareCount: 0,
    versionCount: 1,
    latestVersionNumber: 1,
    latestShareCreatedAt: null,
    viewCount: 0,
    lastViewedAt: null,
    reviewConfirmedAt: null,
    acceptedAt: null,
    shareUrl: null,
    updatedAt: "2026-11-19T03:00:00Z",
    productLine: "hardware",
    ...overrides,
  }
}

const QUOTES = [
  quoteRow("q-1", "Q-2026-0101", "가람학원", { updatedAt: "2026-11-20T03:00:00Z" }),
  quoteRow("q-2", "Q-2026-0102", "나래학원"),
]

function renderPanel(seeds: Record<number, unknown> = {}) {
  state.seeds = new Map(Object.entries({ 2: QUOTES, 3: false, ...seeds }).map(([key, value]) => [Number(key), value]))
  state.index = 0
  state.setCalls = []
  captured.composer = null
  captured.picker = null
  return renderToStaticMarkup(<HardwareQuotesPanel />).replace(/<!-- -->/g, "")
}

beforeEach(() => {
  state.seeds = new Map()
  state.index = 0
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("견적서 탭 — 첫 화면은 템플릿 고르기", () => {
  it("씨앗 번호가 패널 상태와 맞는다(목록 2건이 왼쪽에 그대로 나온다)", () => {
    const html = renderPanel()
    expect(html).toContain('aria-label="다음 할 일별 견적"')
    expect(html).toContain("Q-2026-0101")
    expect(html).toContain("Q-2026-0102")
    expect(html).not.toContain("견적서를 불러오는 중입니다.")
    expect(captured.composer).toMatchObject({ open: false, initialTemplateId: "board_86" })
  })

  it("처음 들어오면 오른쪽은 템플릿 고르기이고 견적 상세는 없다 — 첫 행을 자동으로 고르지 않는다", () => {
    const html = renderPanel()
    expect(html).toContain('aria-label="견적서 템플릿"')
    expect(html).toContain("견적서 만들기")
    expect(html).not.toContain('aria-label="견적 상세"')
    expect(html).not.toContain("템플릿으로")
    // 왼쪽 목록에 눌린(선택된) 행이 없다.
    expect(html).not.toContain('aria-pressed="true" class="block w-full')
    // 패널이 개인 설정의 숨김 목록을 그대로 넘긴다.
    expect(captured.picker?.hiddenTemplateIds).toEqual(["base:camera_t1"])
    expect(html).not.toContain('data-template-id="camera_t1"')
  })

  it("?quote=<id> 로 들어오면 그 견적 상세가 바로 뜨고, 템플릿 화면으로 돌아가는 버튼이 있다", () => {
    vi.stubGlobal("window", { location: { search: "?tab=hardware&quote=q-2" } })
    const html = renderPanel()
    expect(html).toContain('aria-label="견적 상세"')
    expect(html).toContain("나래학원 · 전자칠판 86&quot; 견적서")
    expect(html).toContain("템플릿으로")
    expect(html).not.toContain('aria-label="견적서 템플릿"')
    expect(html).toContain('data-stub="distributor-settlement"')
  })

  it("목록에 없는 ?quote= 는 첫 행으로 대신 열지 않고 템플릿 화면을 보여 준다", () => {
    vi.stubGlobal("window", { location: { search: "?quote=gone" } })
    const html = renderPanel()
    expect(html).toContain('aria-label="견적서 템플릿"')
    expect(html).not.toContain('aria-label="견적 상세"')
  })

  it("패널 소스에 첫 행 자동 선택이 남아 있지 않다", () => {
    const source = readFileSync(join(process.cwd(), "components/admin/documents/HardwareQuotesPanel.tsx"), "utf8")
    expect(source).not.toContain("?? groups[0]?.items[0]")
  })
})

/** 훅 없는 컴포넌트를 펼쳐 조건에 맞는 요소를 모은다(클릭 핸들러를 직접 부르기 위해). */
function findElements(node: ReactNode, match: (element: ReactElement<Record<string, unknown>>) => boolean) {
  const found: Array<ReactElement<Record<string, unknown>>> = []
  const visit = (current: ReactNode) => {
    if (Array.isArray(current)) return current.forEach(visit)
    if (!current || typeof current !== "object" || !("props" in current)) return
    const element = current as ReactElement<Record<string, unknown>>
    if (match(element)) found.push(element)
    visit(element.props.children as ReactNode)
  }
  visit(node)
  return found
}

describe("템플릿 카드 → 작성기", () => {
  const pickable = STANDARD_QUOTE_TEMPLATES.filter((template) => !isRetiredQuoteTemplate(template.id))

  it("카드는 button 이고, 누르면 그 카드의 템플릿 id 를 넘긴다", () => {
    const onSelect = vi.fn()
    const cards = findElements(
      QuoteTemplatePicker({ hiddenTemplateIds: [], onSelect }),
      (element) => element.type === "button" && typeof element.props["data-template-id"] === "string"
    )
    expect(cards.map((card) => card.props["data-template-id"]).sort()).toEqual(pickable.map((template) => template.id).sort())

    for (const card of cards) {
      onSelect.mockClear()
      ;(card.props.onClick as () => void)()
      expect(onSelect).toHaveBeenCalledExactlyOnceWith(card.props["data-template-id"])
    }
  })

  it("패널은 카드가 넘긴 템플릿 id 로 작성기를 연다", () => {
    renderPanel()
    captured.picker?.onSelect("board_75")
    // 1 = composerTemplateId, 0 = composerOpen
    expect(state.setCalls).toEqual([
      [1, "board_75"],
      [0, true],
    ])

    renderPanel({ 0: true, 1: "board_75" })
    expect(captured.composer).toMatchObject({ open: true, initialTemplateId: "board_75" })
  })
})

describe("템플릿 고르기 — 목록과 표시", () => {
  it("하드웨어 → 소프트웨어 묶음이고, 각 묶음은 대표 템플릿이 맨 앞이다", () => {
    const groups = listQuoteTemplatePickerGroups([])
    expect(groups.map((group) => [group.productLine, group.label, group.supplierLabel])).toEqual([
      ["hardware", "하드웨어", "퀴드러닝"],
      ["software", "소프트웨어", "클래스인"],
    ])
    expect(groups[0].templates[0].id).toBe("board_86")
    expect(groups[1].templates[0].id).toBe("business_recharge")
    // 하드코딩이 아니라 STANDARD_QUOTE_TEMPLATES 에서 읽는다 — 판매 중이면 빠짐없이 한 번씩 나온다.
    const listed = groups.flatMap((group) => group.templates.map((template) => template.id))
    expect([...listed].sort()).toEqual(
      STANDARD_QUOTE_TEMPLATES.filter((template) => !isRetiredQuoteTemplate(template.id)).map((template) => template.id).sort()
    )
    for (const group of groups) {
      for (const template of group.templates) {
        expect(isSoftwareQuoteTemplate(template.id)).toBe(group.productLine === "software")
      }
    }
  })

  it("판매 중단(online_suite)과 숨긴 템플릿은 내놓지 않는다 — 작성기 목록과 같은 기준", () => {
    const groups = listQuoteTemplatePickerGroups(["base:board_75", "base:business_recharge", "some-team-template-uuid"])
    const listed = groups.flatMap((group) => group.templates.map((template) => template.id))
    expect(listed).not.toContain("online_suite")
    expect(listed).not.toContain("board_75")
    // 소프트웨어 묶음은 내놓을 것이 없어 통째로 빠진다.
    expect(groups.map((group) => group.productLine)).toEqual(["hardware"])
    expect(countHiddenBaseQuoteTemplates(["base:board_75", "base:business_recharge", "base:online_suite"])).toBe(2)

    // 작성기(수정 금지 파일)의 기준이 바뀌면 여기도 같이 봐야 한다.
    const composer = readFileSync(join(process.cwd(), "components/portal/quotes/QuickQuoteComposer.tsx"), "utf8")
    expect(composer).toContain("!isRetiredQuoteTemplate(template.id)")
    expect(composer).toContain("!hiddenTemplateIds.includes(`base:${template.id}`)")
  })

  it("카드에 이름·프리셋 이름·'견적서 만들기'가 있고, 팀 템플릿은 작성 창에서 고른다고 안내한다", () => {
    const html = renderToStaticMarkup(<QuoteTemplatePicker onSelect={vi.fn()} />).replace(/<!-- -->/g, "")
    expect(html).toContain("전자칠판 86&quot;")
    expect(html).toContain("교실 기본형 · 86&quot; 번들 · 스탠드형")
    expect(html).toContain("ClassIn Business 충전")
    expect(html).toContain("200만 기본 · 400만 패키지 · 1,000만 패키지")
    expect(html.match(/견적서 만들기/g)).toHaveLength(6)
    expect(html).not.toContain("구독형 AI Suite")
    expect(html).toContain("팀에서 저장한 템플릿은 작성 창의 템플릿 목록에서 고릅니다.")
  })

  it("전부 숨기면 빈 상태와 템플릿 관리 링크를 보여 준다", () => {
    const hidden = STANDARD_QUOTE_TEMPLATES.map((template) => `base:${template.id}`)
    const html = renderToStaticMarkup(<QuoteTemplatePicker hiddenTemplateIds={hidden} onSelect={vi.fn()} />)
    expect(html).toContain("표시할 템플릿이 없습니다.")
    expect(html).toContain('href="/admin/quotes/templates"')
    expect(html).not.toContain("견적서 만들기")
  })
})
