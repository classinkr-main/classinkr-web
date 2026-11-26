// 견적서 탭 = 템플릿 화면, 히스토리 탭 = 저장한 견적 (2026-11-23 정정).
//
//  - 견적서 탭(view="templates"): 왼쪽 템플릿 목록 + 오른쪽 첫 템플릿 미리보기. 줄을 누르면 미리보기가 바뀌고,
//    "이 템플릿으로 작성"이 그 템플릿 id 로 작성기를 연다.
//  - 히스토리 탭(view="history"): 예전 견적 목록 화면 그대로 — 단계 묶음, 첫 견적 자동 선택, 오른쪽 견적 상세.
//  - ?quote=<id> 딥링크는 히스토리에서 그 견적 상세를 연다(탭 정규화는 quotes-document-tabs.test.tsx).
import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { ReactElement, ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// jsdom 이 없고 Node SSR 에는 이펙트가 없다 — 목록을 "불러온 뒤" 상태를 보려면 패널의 useState 를 씨앗으로 채운다
// (tests/crm/performance-charts-render.test.tsx 와 같은 방식). 번호는 HardwareQuotesPanel 의 useState 선언 순서다:
//   0 composerOpen · 1 composerTemplate · 2 quotes · 3 loading
// 패널이 부르는 훅·자식은 아래에서 전부 useState 없는 대역으로 바꿔 번호가 밀리지 않는다.
// 순서가 바뀌면 "씨앗 번호가 패널 상태와 맞는다" 테스트가 먼저 깨진다.
const state = vi.hoisted(() => ({
  seeds: new Map<number, unknown>(),
  index: 0,
  setCalls: [] as Array<[number, unknown]>,
}))
const captured = vi.hoisted(() => ({
  composer: null as null | {
    open: boolean
    initialTemplateId?: string
    initialPresetId?: string | null
    initialQuantity?: number
    onCreated?: (payload: unknown) => Promise<void> | void
  },
  picker: null as null | {
    hiddenTemplateIds?: readonly string[]
    onCompose: (selection: import("@/components/admin/documents/QuoteTemplatePicker").QuoteTemplatePickerSelection) => void
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
  default: (props: NonNullable<typeof captured.composer>) => {
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
import {
  QuoteTemplatePickerView,
  type QuoteTemplatePickerSelection,
} from "@/components/admin/documents/QuoteTemplatePicker"
import {
  buildQuoteTemplatePreview,
  countHiddenBaseQuoteTemplates,
  filterQuoteTemplatePickerGroups,
  getDefaultQuoteTemplatePresetId,
  listQuoteTemplatePickerGroups,
} from "@/lib/quote-template-picker"
import {
  buildConfigurableStandardQuoteDetails,
  getStandardQuoteDefaultSelections,
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

type PanelProps = Parameters<typeof HardwareQuotesPanel>[0]

function renderPanel(props: PanelProps = {}, seeds: Record<number, unknown> = {}) {
  state.seeds = new Map(Object.entries({ 2: QUOTES, 3: false, ...seeds }).map(([key, value]) => [Number(key), value]))
  state.index = 0
  state.setCalls = []
  captured.composer = null
  captured.picker = null
  return renderToStaticMarkup(<HardwareQuotesPanel {...props} />).replace(/<!-- -->/g, "")
}

/** 훅 없는 컴포넌트를 펼쳐 조건에 맞는 요소를 모은다(클릭 핸들러를 직접 부르기 위해). */
function findElements(node: ReactNode, match: (element: ReactElement<Record<string, unknown>>) => boolean) {
  const found: Array<ReactElement<Record<string, unknown>>> = []
  const visit = (current: ReactNode) => {
    if (Array.isArray(current)) return current.forEach(visit)
    if (!current || typeof current !== "object" || !("props" in current)) return
    const element = current as ReactElement<Record<string, unknown>>
    if (typeof element.type === "function") {
      return visit((element.type as (props: Record<string, unknown>) => ReactNode)(element.props))
    }
    if (match(element)) found.push(element)
    visit(element.props.children as ReactNode)
  }
  visit(node)
  return found
}

function textOf(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (!node || typeof node !== "object" || !("props" in node)) return ""
  return textOf((node as ReactElement<{ children?: ReactNode }>).props.children)
}

function viewProps(overrides: Partial<Parameters<typeof QuoteTemplatePickerView>[0]> = {}) {
  return {
    hiddenTemplateIds: [] as string[],
    searchTerm: "",
    productLine: "all" as const,
    selection: null as QuoteTemplatePickerSelection | null,
    onSearchTermChange: vi.fn(),
    onProductLineChange: vi.fn(),
    onSelect: vi.fn(),
    onSelectPreset: vi.fn(),
    onCompose: vi.fn(),
    ...overrides,
  }
}

function renderView(overrides: Partial<Parameters<typeof QuoteTemplatePickerView>[0]> = {}) {
  return renderToStaticMarkup(<QuoteTemplatePickerView {...viewProps(overrides)} />).replace(/<!-- -->/g, "")
}

/** 미리보기 칸(오른쪽)만 잘라 본다 — 왼쪽 목록의 글자와 섞이지 않게. */
function previewOf(html: string) {
  const start = html.indexOf('aria-label="템플릿 미리보기"')
  expect(start).toBeGreaterThan(-1)
  return html.slice(start)
}

const pickable = STANDARD_QUOTE_TEMPLATES.filter((template) => !isRetiredQuoteTemplate(template.id))

beforeEach(() => {
  state.seeds = new Map()
  state.index = 0
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("견적서 탭 — 템플릿 목록과 첫 템플릿 미리보기", () => {
  it("첫 화면은 왼쪽 템플릿 목록 + 오른쪽 첫 템플릿 미리보기이고, 견적 목록·상세는 없다", () => {
    const html = renderPanel({ view: "templates" })
    expect(html).toContain('aria-label="견적서 템플릿"')
    expect(html).toContain('aria-label="템플릿 미리보기"')
    expect(html).not.toContain('aria-label="다음 할 일별 견적"')
    expect(html).not.toContain('aria-label="견적 상세"')
    expect(html).not.toContain("Q-2026-0101")
    expect(html).not.toContain("삭제함")

    // 기본 선택은 목록 첫 줄(하드웨어 대표 템플릿) — 그 줄만 눌린 상태다.
    expect(html.match(/aria-pressed="true" class="block w-full/g)).toHaveLength(1)
    expect(html).toMatch(/data-template-id="board_86"[^>]*aria-pressed="true"/)
    const preview = previewOf(html)
    expect(preview).toContain("전자칠판 86&quot; 견적서")
    expect(preview).toContain("이 템플릿으로 작성")
    expect(preview).toContain("HW · 퀴드러닝")
    expect(preview).toContain("6,300,000원")

    // 패널이 개인 설정의 숨김 목록을 그대로 넘긴다. 작성기는 이 화면에도 있다(닫힌 채).
    expect(captured.picker?.hiddenTemplateIds).toEqual(["base:camera_t1"])
    expect(html).not.toContain('data-template-id="camera_t1"')
    expect(captured.composer).toMatchObject({ open: false, initialTemplateId: "board_86" })
  })

  it("목록은 검색·유형 필터·묶음 띠·줄(이름 + 프리셋 이름)로 이루어진다", () => {
    const html = renderView()
    expect(html).toContain('placeholder="템플릿 이름"')
    const hardware = pickable.filter((template) => !isSoftwareQuoteTemplate(template.id)).length
    const software = pickable.length - hardware
    const filters = [...html.matchAll(/<button type="button" aria-pressed="(?:true|false)" class="py-1\.5[^>]*>(.*?)<\/button>/g)].map(
      (match) => match[1].replace(/<[^>]+>/g, "")
    )
    expect(filters).toEqual([`전체 ${pickable.length}`, `SW ${software}`, `HW ${hardware}`])
    expect(html.indexOf(">하드웨어<")).toBeGreaterThan(-1)
    expect(html.indexOf(">소프트웨어<")).toBeGreaterThan(html.indexOf(">하드웨어<"))
    expect(html).toContain("교실 기본형 · 86&quot; 번들 · 스탠드형")
    expect(html).toContain("200만 기본")
    expect(html).not.toContain("400만 패키지")
    expect(html).not.toContain("구독형 AI Suite")
    expect(html).toContain("팀에서 저장한 템플릿은 작성 창의 템플릿 목록에서 고릅니다.")

    const rows = findElements(
      QuoteTemplatePickerView(viewProps()),
      (element) => element.type === "button" && typeof element.props["data-template-id"] === "string"
    )
    expect(rows.map((row) => row.props["data-template-id"]).sort()).toEqual(pickable.map((template) => template.id).sort())
  })

  it("줄을 누르면 그 템플릿(과 기본 구성)이 선택으로 넘어가고, 선택이 바뀌면 미리보기가 바뀐다", () => {
    const onSelect = vi.fn()
    const rows = findElements(
      QuoteTemplatePickerView(viewProps({ onSelect })),
      (element) => element.type === "button" && typeof element.props["data-template-id"] === "string"
    )
    for (const row of rows) {
      onSelect.mockClear()
      ;(row.props.onClick as () => void)()
      const templateId = row.props["data-template-id"] as QuoteTemplatePickerSelection["templateId"]
      expect(onSelect).toHaveBeenCalledExactlyOnceWith({
        templateId,
        presetId: getDefaultQuoteTemplatePresetId(templateId),
        quantity: 1,
      })
    }

    const html = renderView({ selection: { templateId: "recording_studio_75", presetId: null, quantity: 1 } })
    expect(html).toMatch(/data-template-id="recording_studio_75"[^>]*aria-pressed="true"/)
    expect(html).toMatch(/data-template-id="board_86"[^>]*aria-pressed="false"/)
    const preview = previewOf(html)
    expect(preview).toContain("올인원 녹화수업 세트 75&quot; 견적서")
    expect(preview).toContain("7,400,000원")
    expect(preview).not.toContain("전자칠판 86&quot; 견적서")

    const software = previewOf(renderView({ selection: { templateId: "business_recharge", presetId: null, quantity: 1 } }))
    expect(software).toContain("SW · 이이오클래스인코리아 유한회사")
    expect(software).toContain("2,000,000원")
  })

  it("구성(프리셋)을 바꾸면 미리보기가 그 프리셋 기준으로 바뀐다", () => {
    const props = viewProps()
    const chips = findElements(
      QuoteTemplatePickerView(props),
      (element) => element.type === "button" && typeof element.props["data-preset-id"] === "string"
    )
    expect(chips.map((chip) => chip.props["data-preset-id"])).toEqual(["board_86_classroom", "board_86_bundle", "board_86_stand"])
    // 기본 선택은 작성 창이 처음 여는 구성과 같은 프리셋이다.
    expect(chips.map((chip) => chip.props["aria-pressed"])).toEqual([true, false, false])
    ;(chips[1].props.onClick as () => void)()
    expect(props.onSelectPreset).toHaveBeenCalledExactlyOnceWith({ templateId: "board_86", presetId: "board_86_bundle", quantity: 1 })

    const base = previewOf(renderView())
    expect(base).toContain("6,300,000원")
    expect(base).not.toContain("T1 카메라")
    expect(base).not.toContain("작성 창은 기본 구성으로 열립니다.")

    const bundle = previewOf(renderView({ selection: { templateId: "board_86", presetId: "board_86_bundle", quantity: 1 } }))
    expect(bundle).toContain("8,000,000원")
    expect(bundle).toMatch(/data-preset-id="board_86_bundle"[^>]*aria-pressed="true"/)
    expect(bundle).toMatch(/data-preset-id="board_86_classroom"[^>]*aria-pressed="false"/)
    expect(bundle).toContain("T1 카메라")
    expect(bundle).toContain("벽걸이 설치")
    expect(bundle).not.toContain("작성 창은 기본 구성으로 열립니다.")
  })

  it("미리보기 값은 템플릿 정의에서 계산한다 — 작성기의 첫 시트와 같은 호출", () => {
    for (const template of pickable) {
      for (const preset of [undefined, ...(template.quickPresets ?? [])]) {
        const expected = buildConfigurableStandardQuoteDetails({
          templateId: template.id,
          input: { templateId: template.id, presetId: preset?.id },
          optionSelections: { ...getStandardQuoteDefaultSelections(template.id), ...(preset?.optionSelections ?? {}) },
          baseQuantity: 1,
        })
        const preview = buildQuoteTemplatePreview(template.id, preset?.id)
        expect(preview.totalAmount).toBe(expected.grandTotalAmount)
        expect(preview.lines.map((line) => line.name)).toEqual(expected.lineItems?.map((line) => line.itemName))
        expect(preview.lines.filter((line) => line.kind === "priced").reduce((sum, line) => sum + (line.amount ?? 0), 0)).toBe(
          expected.subtotalAmount
        )
      }
      expect(buildQuoteTemplatePreview(template.id).quantity).toBe(1)
    }
    // 안내 행은 금액·수량을 찍지 않고, 별도 청구 행은 합계에 넣지 않는다.
    expect(buildQuoteTemplatePreview("recording_studio").lines.at(-1)).toMatchObject({ kind: "note", quantity: null, amount: null })
    const camera = buildQuoteTemplatePreview("camera_t1")
    expect(camera.lines.at(-1)).toMatchObject({ name: "카메라 설치", kind: "pending", amount: null })
    expect(camera.pendingAmountNote).toBe("별도 청구 예정 항목은 합계에서 제외됩니다.")
    const composer = readFileSync(join(process.cwd(), "components/portal/quotes/QuickQuoteComposer.tsx"), "utf8")
    expect(composer).toContain("buildStandardQuoteFromPreset(templateId, presetId, baseQuantity, patch)")
  })
})

describe("이 템플릿으로 작성 → 작성기", () => {
  it("버튼은 지금 고른 템플릿과 기본 수량을 넘긴다", () => {
    for (const template of pickable) {
      const props = viewProps({ selection: { templateId: template.id, presetId: null, quantity: 1 } })
      const buttons = findElements(
        QuoteTemplatePickerView(props),
        (element) => element.type === "button" && textOf(element).includes("이 템플릿으로 작성")
      )
      expect(buttons).toHaveLength(1)
      ;(buttons[0].props.onClick as () => void)()
      expect(props.onCompose).toHaveBeenCalledExactlyOnceWith({ templateId: template.id, presetId: null, quantity: 1 })
    }
  })

  it("수량 변경은 선택한 구성을 보존하고 미리보기 합계와 작성기에 전달된다", () => {
    const selection = { templateId: "board_86", presetId: "board_86_bundle", quantity: 3 } as const
    const props = viewProps({ selection })
    const view = QuoteTemplatePickerView(props)
    const inputs = findElements(view, (element) => element.type === "input" && element.props.type === "number")
    expect(inputs).toHaveLength(1)
    ;(inputs[0].props.onChange as (event: unknown) => void)({ target: { value: "4", valueAsNumber: 4 } })
    expect(props.onSelectPreset).toHaveBeenCalledExactlyOnceWith({ ...selection, quantity: 4 })
    const buttons = findElements(view, (element) => element.type === "button" && textOf(element).includes("이 템플릿으로 작성"))
    ;(buttons[0].props.onClick as () => void)()
    expect(props.onCompose).toHaveBeenCalledExactlyOnceWith(selection)
    expect(previewOf(renderView({ selection }))).toContain("24,000,000원")
    const billedLines = buildQuoteTemplatePreview("board_86", "board_86_bundle", 3).lines
      .filter((line) => (line.amount ?? 0) > 0)
    expect(billedLines.map((line) => line.quantity)).toEqual([3, 3, 3])
  })

  it("패널은 넘겨받은 빠른 구성과 수량으로 작성기를 연다", () => {
    renderPanel({ view: "templates" })
    const selection = { templateId: "board_75", presetId: "board_75_t1_addon", quantity: 3 } as const
    captured.picker?.onCompose(selection)
    // 1 = composerTemplate, 0 = composerOpen
    expect(state.setCalls).toEqual([
      [1, selection],
      [0, true],
    ])

    renderPanel({ view: "templates" }, { 0: true, 1: selection })
    expect(captured.composer).toMatchObject({ open: true, initialTemplateId: "board_75", initialPresetId: "board_75_t1_addon", initialQuantity: 3 })
  })

  it("작성기가 저장하면 그 견적을 선택하고 페이지에 알린다(페이지가 히스토리 탭으로 넘긴다)", async () => {
    const onQuoteCreated = vi.fn()
    renderPanel({ view: "templates", onQuoteCreated })
    await captured.composer?.onCreated?.({
      document: { id: "q-new", quote_number: "Q-2026-0200", status: "draft", updated_at: "2026-11-23T01:00:00Z" },
      version: { title: "새 견적", total_amount: 6_300_000, subtotal: 6_300_000, tax_amount: 0, structured_json: null, version_number: 1 },
      customer: { name: "다온학원" },
      deal: { title: "다온학원 전자칠판" },
      share: null,
      templateId: "board_86",
    })
    expect(onQuoteCreated).toHaveBeenCalledExactlyOnceWith("q-new")
    expect(state.setCalls.some(([, value]) => value === "q-new")).toBe(true)

    const page = readFileSync(join(process.cwd(), "app/admin/quotes/page.tsx"), "utf8")
    expect(page).toContain("onQuoteCreated={handleQuoteCreated}")
    expect(page).toMatch(/const handleQuoteCreated = [^]*?setActiveTab\("history"\)/)
  })
})

describe("히스토리 탭 — 저장한 견적 목록과 상세", () => {
  it("씨앗 번호가 패널 상태와 맞는다(목록 2건이 단계 묶음 아래 왼쪽에 나온다)", () => {
    const html = renderPanel({ view: "history" })
    expect(html).toContain('aria-label="다음 할 일별 견적"')
    expect(html).toContain("Q-2026-0101")
    expect(html).toContain("Q-2026-0102")
    expect(html).toContain("검토 후 발송")
    expect(html).toContain("삭제함")
    expect(html).not.toContain("견적서를 불러오는 중입니다.")
    expect(html).not.toContain('aria-label="견적서 템플릿"')
    expect(html).not.toContain("템플릿으로")
    expect(captured.composer).toMatchObject({ open: false, initialTemplateId: "board_86" })
  })

  it("첫 묶음의 첫 견적을 자동으로 고른다 — view 를 안 주면 히스토리다", () => {
    for (const html of [renderPanel({ view: "history" }), renderPanel()]) {
      expect(html).toContain('aria-label="견적 상세"')
      expect(html).toContain("가람학원 · 전자칠판 86&quot; 견적서")
      expect(html.match(/aria-pressed="true" class="block w-full/g)).toHaveLength(1)
      expect(html).toContain('data-stub="distributor-settlement"')
    }
    const source = readFileSync(join(process.cwd(), "components/admin/documents/HardwareQuotesPanel.tsx"), "utf8")
    expect(source).toContain("?? groups[0]?.items[0]")
    expect(source).not.toContain("QuoteTemplatePickerReturn")
  })

  it("?tab=hardware&quote=<id> 로 들어오면 그 견적 상세가 뜬다", () => {
    vi.stubGlobal("window", { location: { search: "?tab=hardware&quote=q-2" } })
    const html = renderPanel({ view: "history" })
    expect(html).toContain('aria-label="견적 상세"')
    expect(html).toContain("나래학원 · 전자칠판 86&quot; 견적서")
    expect(html).not.toContain("가람학원 · 전자칠판 86&quot; 견적서")
  })

  it("목록에 없는 ?quote= 는 첫 견적으로 대신 연다", () => {
    vi.stubGlobal("window", { location: { search: "?quote=gone" } })
    expect(renderPanel({ view: "history" })).toContain("가람학원 · 전자칠판 86&quot; 견적서")
  })
})

describe("템플릿 목록 — 원천과 거르기", () => {
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
    expect([...listed].sort()).toEqual(pickable.map((template) => template.id).sort())
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

  it("검색은 템플릿 이름으로, 필터는 유형으로 거른다 — 걸러진 목록의 첫 줄이 선택이 된다", () => {
    const groups = listQuoteTemplatePickerGroups([])
    expect(
      filterQuoteTemplatePickerGroups(groups, { query: " 녹화 " }).flatMap((group) => group.templates.map((template) => template.id))
    ).toEqual(["recording_studio", "recording_studio_75"])
    expect(filterQuoteTemplatePickerGroups(groups, { productLine: "software" }).map((group) => group.productLine)).toEqual(["software"])
    expect(filterQuoteTemplatePickerGroups(groups, { query: "없는 이름" })).toEqual([])

    const software = renderView({ productLine: "software" })
    expect(software).toMatch(/data-template-id="business_recharge"[^>]*aria-pressed="true"/)
    expect(previewOf(software)).toContain("ClassIn Business 충전 견적서")

    const none = renderView({ searchTerm: "없는 이름" })
    expect(none).toContain("조건에 맞는 템플릿이 없습니다.")
    expect(none).toContain("왼쪽에서 템플릿을 고르세요.")
    expect(none).not.toContain("이 템플릿으로 작성")
  })

  it("전부 숨기면 빈 상태와 템플릿 관리 링크를 보여 준다", () => {
    const hidden = STANDARD_QUOTE_TEMPLATES.map((template) => `base:${template.id}`)
    const html = renderView({ hiddenTemplateIds: hidden })
    expect(html).toContain("표시할 템플릿이 없습니다.")
    expect(html).toContain('href="/admin/quotes/templates"')
    expect(html).not.toContain("이 템플릿으로 작성")
  })
})
