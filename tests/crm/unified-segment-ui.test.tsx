/**
 * 통합 고객 화면 — 조건 칩 줄(SG4) · 마지막 연락 열(CT8) · NEO 신호 줄(SG2) · 행 선택/일괄 행동 · CSV 버튼 ·
 * ?owner= URL 상태(F6)의 표시·순수 헬퍼·소스 계약. DOM 테스트 환경이 없어 renderToStaticMarkup + 순수 함수 +
 * 소스 문자열 계약으로 고정한다.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import SegmentConditionBar, { facetHiddenCaption } from "@/components/admin/crm/unified/SegmentConditionBar"
import CustomerResultsSection, { pageSelectionState } from "@/components/admin/crm/unified/CustomerResultsSection"
import { neoSignalParts } from "@/components/admin/crm/unified/row-visuals"
import {
  BULK_TASK_PRESETS,
  normalizeBulkTagResult,
  normalizeBulkTaskResult,
  bulkResultTone,
  resolveBulkTaskDueAt,
  summarizeBulkTagResult,
  summarizeBulkTaskResult,
  validateBulkTagLabel,
} from "@/components/admin/crm/unified/bulk-actions"
import {
  CSV_COMPASS_DOWN_NOTE,
  CSV_COMPASS_PARTIAL_NOTE,
  canExportUnifiedCsv,
  csvExportCompassNote,
  describeCsvExport,
  readCsvExportHeaders,
} from "@/components/admin/crm/unified/export-csv"
import {
  exportUrl,
  listUrl,
  parseOwnerParam,
  patchUnifiedListParams,
  rowToFlags,
  segmentParamSignature,
  type CrmUnifiedCustomers,
} from "@/components/admin/crm/unified/shared"
import { nextSortState } from "@/components/admin/crm/unified/sort"
import type { CrmUnifiedCustomerRow, CrmUnifiedSegmentSummary } from "@/lib/repositories/crm-unified-customers"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const GENERATED_AT = "2026-09-25T03:00:00.000Z"
const DAY = 86_400_000
const ago = (days: number) => new Date(Date.parse(GENERATED_AT) - days * DAY).toISOString()

function row(partial: Partial<CrmUnifiedCustomerRow>): CrmUnifiedCustomerRow {
  return {
    key: "neo:A",
    source: "neo_account",
    sourceLabel: "고객",
    name: "가나학원",
    contact: null,
    ownerName: "박담당",
    ownerKeys: ["박담당"],
    lifecycle: "active_account",
    statusLabel: "활성 고객",
    stage: null, stageLabel: null, subjectLabel: null, categoryLabel: null,
    tier: null, trust: null, moneyBand: null,
    nextActionLabel: "관계 유지",
    priorityReason: "-",
    score: 10,
    bucket: null,
    moneyLabel: null,
    moneyState: "zero",
    href: "#",
    updatedAt: null,
    expireAt: null,
    balance: 0,
    tags: [],
    origin: null,
    crmRegistered: false,
    provisional: false,
    slaTarget: false,
    firstResponseAt: null,
    createdAt: null,
    ...partial,
  }
}

function data(rows: CrmUnifiedCustomerRow[]): CrmUnifiedCustomers {
  return {
    generatedAt: GENERATED_AT,
    sources: { leadsOk: true, neoAccountsOk: true, warnings: [], statuses: [] },
    summary: { total: rows.length, leadCount: 0, accountCount: rows.length, highPriorityCount: 0, ownerCount: 1 },
    pagination: { limit: 50, offset: 0, returned: rows.length, total: rows.length, hasMore: false, nextOffset: null },
    owners: [],
    rows,
  }
}

function segmentSummary(partial: Partial<CrmUnifiedSegmentSummary> = {}): CrmUnifiedSegmentSummary {
  return {
    spec: {},
    active: false,
    labels: [],
    baseTotal: 340,
    total: 12,
    conditionCounts: {},
    optionCounts: { "expDays:14": 4, "expDays:30": 12, "expDays:60": 31, "risk:urgent": 3, "kinds:lead": 0 },
    noContactNoRecordCount: 0,
    facets: {
      owners: [{ value: "박담당", label: "박담당", count: 20 }],
      regions: [{ value: "부산", label: "부산", count: 9 }],
      tags: [{ value: "VIP", label: "VIP", count: 2 }],
    },
    facetHiddenCounts: { owners: 0, regions: 0, tags: 0 },
    ...partial,
  }
}

describe("SegmentConditionBar — 칩마다 단독 건수, 켜진 칩, 조건 초기화", () => {
  it("프리셋 칩(만료 14·30·60일)에 서버 단독 건수를 붙이고 켜진 칩을 aria-pressed 로 표시한다", () => {
    const html = renderToStaticMarkup(
      <SegmentConditionBar spec={{ expDays: 30 }} onChange={() => {}} segment={segmentSummary()} total={12} loading={false} />
    )
    expect(html).toMatch(/aria-pressed="true"[^>]*>30일 이내<span[^>]*>12</)
    expect(html).toMatch(/aria-pressed="false"[^>]*>14일 이내<span[^>]*>4</)
    expect(html).toContain("조건 초기화")
    expect(html).toContain("1개 적용 · 12명 / 조건 전 340명")
    expect(html).toContain("만료 30일 이내")
    // 담당·지역·라벨은 접힌 목록에서 고른다.
    expect(html).toContain(">담당<")
    expect(html).toContain(">지역<")
    expect(html).toContain(">라벨<")
  })

  it("조건이 없으면 초기화 버튼 없이 안내만", () => {
    const html = renderToStaticMarkup(
      <SegmentConditionBar spec={{}} onChange={() => {}} segment={segmentSummary()} total={340} loading={false} />
    )
    expect(html).not.toContain("조건 초기화")
    expect(html).toContain("칩 숫자는 그 조건 하나만 켰을 때 인원")
  })

  it("URL 로 들어온 비프리셋 값(만료 45일)도 켜진 칩으로 보여 끌 수 있다", () => {
    const html = renderToStaticMarkup(
      <SegmentConditionBar spec={{ expDays: 45 }} onChange={() => {}} segment={undefined} total={null} loading />
    )
    expect(html).toMatch(/aria-pressed="true"[^>]*>45일 이내</)
  })

  it("선택지를 상한까지만 실었으면 목록 아래에 '외 N개 — 검색으로 좁히세요'(숨긴 수가 없으면 문구 없음)", () => {
    const html = renderToStaticMarkup(
      <SegmentConditionBar
        spec={{}}
        onChange={() => {}}
        segment={segmentSummary({ facetHiddenCounts: { owners: 7, regions: 0, tags: 1_234 } })}
        total={340}
        loading={false}
      />
    )
    expect(html).toContain("외 7개 — 검색으로 좁히세요")
    expect(html).toContain("외 1,234개 — 검색으로 좁히세요")
    expect((html.match(/data-testid="facet-hidden-caption"/g) ?? []).length).toBe(2)
    expect(facetHiddenCaption(0)).toBeNull()
    expect(facetHiddenCaption(undefined)).toBeNull()

    const none = renderToStaticMarkup(
      <SegmentConditionBar spec={{}} onChange={() => {}} segment={segmentSummary()} total={340} loading={false} />
    )
    expect(none).not.toContain("검색으로 좁히세요")
    // 옛 응답(facetHiddenCounts 없음)도 깨지지 않는다.
    const legacy = { ...segmentSummary() } as Partial<CrmUnifiedSegmentSummary>
    delete legacy.facetHiddenCounts
    expect(() =>
      renderToStaticMarkup(
        <SegmentConditionBar spec={{}} onChange={() => {}} segment={legacy as CrmUnifiedSegmentSummary} total={1} loading={false} />
      )
    ).not.toThrow()
  })

  it("라벨 방식 토글은 스펙(URL)에서 파생한다 — tagsAll 이면 '모두 가진', tagsAny 면 '하나라도 가진'", () => {
    const all = renderToStaticMarkup(
      <SegmentConditionBar spec={{ tagsAll: ["VIP"] }} onChange={() => {}} segment={segmentSummary()} total={2} loading={false} />
    )
    expect(all).toMatch(/aria-pressed="true"[^>]*>모두 가진</)
    expect(all).toMatch(/aria-pressed="false"[^>]*>하나라도 가진</)
    const any = renderToStaticMarkup(
      <SegmentConditionBar spec={{ tagsAny: ["VIP"] }} onChange={() => {}} segment={segmentSummary()} total={2} loading={false} />
    )
    expect(any).toMatch(/aria-pressed="true"[^>]*>하나라도 가진</)
    expect(any).toMatch(/aria-pressed="false"[^>]*>모두 가진</)
  })

  it("소스 계약 — 방식은 렌더마다 segmentTagMode(spec, 선호)로 파생하고 이펙트로 동기화하지 않는다", () => {
    const source = readFileSync(resolve(process.cwd(), "components/admin/crm/unified/SegmentConditionBar.tsx"), "utf8")
    expect(source).toContain("const tagMode = segmentTagMode(spec, preferredTagMode)")
    expect(source).not.toMatch(/useEffect|useLayoutEffect/)
    expect(source).not.toContain("setTagMode(")
  })
})

describe("결과 표 — 마지막 연락 열 · NEO 신호 줄 · 선택 체크박스", () => {
  const rows = [
    row({
      key: "neo:A",
      lastContactAt: ago(3),
      lastContactSource: "compass",
      lastContactChannel: "call",
      lastContactActor: "진소망",
      depletionInDays: 12,
      billingMode: "consumption",
      riskLevel: "soon",
      riskReasonLabels: ["재충전 임박"],
    }),
    row({ key: "neo:B", name: "다라학원", lastContactAt: null }),
  ]

  function render(selected: string[]) {
    return renderToStaticMarkup(
      <CustomerResultsSection
        data={data(rows)}
        rows={rows}
        loading={false}
        loadingMore={false}
        refreshing={false}
        sort={null}
        onToggleSort={() => undefined}
        onClearSort={() => undefined}
        savedView="all"
        hasActiveFilters={false}
        onResetFilters={() => undefined}
        onOpenDrawer={() => undefined}
        onRowDoubleClick={() => undefined}
        onLoadPage={() => undefined}
        onOpenLeadModal={() => undefined}
        selectedKeys={new Set(selected)}
        onToggleRow={() => undefined}
        onTogglePage={() => undefined}
        toolbarExtra={<span>CSV-SLOT</span>}
      />
    )
  }

  it("'마지막 연락' 열 — '3일 전' + 'Compass 콜 · 담당명', 없으면 '기록 없음'", () => {
    const html = render([])
    expect(html).toContain(">마지막 연락<")
    expect(html).toContain("3일 전")
    expect(html).toContain("Compass 콜 · 진소망")
    expect(html).toContain("기록 없음")
  })

  it("NEO 신호 줄 — 위험·소진·과금(글자색 한 줄), 사유는 title", () => {
    const html = render([])
    expect(html).toContain("위험 임박")
    expect(html).toContain("소진 D-12")
    expect(html).toContain("충전제")
    expect(html).toContain('title="재충전 임박"')
    expect(neoSignalParts(row({ source: "lead", riskLevel: "urgent" }))).toEqual([])
  })

  it("선택 체크박스 — 페이지 전체 선택 + 행별, 툴바 슬롯(CSV)", () => {
    const html = render(["neo:A"])
    expect(html).toContain('aria-label="이 페이지 고객 모두 선택"')
    expect(html).toContain('aria-label="가나학원 선택"')
    expect(html).toContain("CSV-SLOT")
    expect(pageSelectionState(["a", "b"], new Set(["a"]))).toEqual({ selected: 1, all: false, some: true })
    expect(pageSelectionState(["a", "b"], new Set(["a", "b", "z"]))).toEqual({ selected: 2, all: true, some: false })
    expect(pageSelectionState([], new Set())).toEqual({ selected: 0, all: false, some: false })
  })

  it("연락순 정렬 진입 — 첫 클릭은 오래된 순(오름차순), 다시 누르면 반대", () => {
    const first = nextSortState(null, "last_contact")
    expect(first).toEqual({ key: "last_contact", direction: "asc" })
    expect(nextSortState(first, "last_contact")).toEqual({ key: "last_contact", direction: "desc" })
    expect(nextSortState(first, "name")).toEqual({ key: "name", direction: "asc" })
  })
})

describe("일괄 행동 — 평평한 응답(W3 계약)·요약 문구·프리셋", () => {
  it("평평한 JSON 과 { data } 봉투를 모두 읽는다", () => {
    const flat = normalizeBulkTagResult({ applied: 12, skipped: 1, invalid: [], failed: [], action: "add", label: "재계약" })
    expect(flat).toEqual({ applied: 12, skipped: 1, invalid: [], failed: [] })
    expect(normalizeBulkTagResult({ data: { applied: 3, skipped: 0, invalid: ["x"], failed: [] } }).invalid).toEqual(["x"])
    expect(normalizeBulkTaskResult({ created: 5, skipped: 0, invalid: [], failed: ["lead:1"] }).failed).toEqual(["lead:1"])
  })

  it("토스트 문구 — '12명에 '재계약' 태그 · 건너뜀 1', 실패가 있으면 'N건 실패'와 오류 톤", () => {
    expect(summarizeBulkTagResult({ applied: 12, skipped: 1, invalid: [], failed: [] }, "재계약")).toBe("12명에 '재계약' 태그 · 건너뜀 1")
    const partial = { created: 4, skipped: 0, invalid: [], failed: ["a", "b"] }
    expect(summarizeBulkTaskResult(partial, "내일 재통화")).toBe("4명에 할 일 '내일 재통화' · 2건 실패")
    expect(bulkResultTone(partial)).toBe("error")
    expect(bulkResultTone({ failed: [] })).toBe("success")
  })

  it("할 일 프리셋 — 내일 재통화 · 이번 주 연락 · 다음 주 연락(KST 기한)", () => {
    expect(BULK_TASK_PRESETS.map((preset) => preset.label)).toEqual(["내일 재통화", "이번 주 연락", "다음 주 연락"])
    // 2026-09-25(금) 12:00 KST 기준
    const nowMs = Date.parse("2026-09-25T03:00:00.000Z")
    expect(resolveBulkTaskDueAt(BULK_TASK_PRESETS[0], nowMs)).toBe("2026-09-26T01:00:00.000Z")
    expect(resolveBulkTaskDueAt(BULK_TASK_PRESETS[1], nowMs)).toBe("2026-09-25T09:00:00.000Z")
    expect(resolveBulkTaskDueAt(BULK_TASK_PRESETS[2], nowMs)).toBe("2026-09-28T01:00:00.000Z")
  })

  it("태그 입력 검증 — 1~40자", () => {
    expect(validateBulkTagLabel("")).toBe("태그를 입력하세요.")
    expect(validateBulkTagLabel("가".repeat(41))).toContain("40자")
    expect(validateBulkTagLabel("재계약")).toBeNull()
  })
})

describe("CSV 내려받기(클라이언트) — 절단 헤더·역할", () => {
  it("응답 헤더로 절단 여부를 읽고 안내 문구에 전체 건수를 적는다", () => {
    const result = readCsvExportHeaders(
      new Headers({ "X-Export-Rows": "5000", "X-Export-Total": "7210", "X-Export-Truncated": "1", "X-Export-Limit": "5000" })
    )
    // X-Export-Compass 가 없으면(옛 서버) compass=null — 안내를 붙이지 않는다.
    expect(result).toEqual({ rows: 5000, total: 7210, truncated: true, limit: 5000, compass: null })
    expect(describeCsvExport(result)).toBe("CSV 5,000명 내보냄 — 전체 7,210명 중 앞 5,000명(상한)")
    expect(describeCsvExport({ rows: 12, total: 12, truncated: false, limit: 5000 })).toBe("CSV 12명 내보냄")
  })

  it("X-Export-Compass 가 끊김·일부면 토스트에 그 사실을 싣는다(파일에는 주석 줄을 넣지 않는다)", () => {
    const down = readCsvExportHeaders(
      new Headers({ "X-Export-Rows": "12", "X-Export-Total": "12", "X-Export-Truncated": "0", "X-Export-Compass": "down" })
    )
    expect(down.compass).toBe("down")
    expect(describeCsvExport(down)).toBe("CSV 12명 내보냄 · Compass 연결 끊김 — 마지막 연락은 Home 기록만")
    expect(CSV_COMPASS_DOWN_NOTE).toBe("Compass 연결 끊김 — 마지막 연락은 Home 기록만")

    const partialTruncated = readCsvExportHeaders(
      new Headers({ "X-Export-Rows": "5000", "X-Export-Total": "7210", "X-Export-Truncated": "1", "X-Export-Compass": "partial" })
    )
    expect(describeCsvExport(partialTruncated)).toBe(
      `CSV 5,000명 내보냄 — 전체 7,210명 중 앞 5,000명(상한) · ${CSV_COMPASS_PARTIAL_NOTE}`
    )
    for (const status of ["ok", "skipped", "bogus"]) {
      const result = readCsvExportHeaders(new Headers({ "X-Export-Rows": "3", "X-Export-Compass": status }))
      expect(describeCsvExport(result)).toBe("CSV 3명 내보냄")
    }
    expect(csvExportCompassNote(null)).toBeNull()

    // 서버 라우트가 실제로 그 헤더를 보낸다(계약) — 파일 본문에는 안내를 섞지 않는다.
    const route = readFileSync(resolve(process.cwd(), "app/api/admin/crm/customers/export/route.ts"), "utf8")
    expect(route).toContain('"X-Export-Compass": result.meta.compass')
    const client = readFileSync(resolve(process.cwd(), "components/admin/crm/unified/export-csv.ts"), "utf8")
    expect(client).toContain("const csv = text.startsWith(CSV_BOM) ? text : CSV_BOM + text")
  })

  it("세션 역할이 확실히 다른 경우만 버튼을 막는다(모르면 서버가 판단)", () => {
    expect(canExportUnifiedCsv("ADMIN")).toBe(true)
    expect(canExportUnifiedCsv("super_admin")).toBe(true)
    expect(canExportUnifiedCsv("EDITOR")).toBe(false)
    expect(canExportUnifiedCsv(null)).toBe(true)
  })
})

describe("목록·내보내기 URL — 기본값은 싣지 않는다(담당만 예외 — 늘 싣는다)", () => {
  const base = { query: "", source: "all" as const, lifecycle: "all" as const, owner: "", view: "all" as const, tag: "" }

  it("조건·정렬이 없으면 기본 URL 그대로(프리페치 시드·사이드바 예열과 같은 문자열)", () => {
    // 담당은 2026-10-16 기본 담당 계약(생략=로그인 담당, 빈 값=전체)이라 늘 싣는다 — 전체는 `owner=`.
    expect(listUrl({ ...base, segment: {}, sort: null, offset: 0 })).toBe("/api/admin/crm/customers/unified?limit=50&offset=0&owner=")
    // 기본 진입(?owner= 없음 → 내 담당)의 첫 요청 = 프리페치 시드 = 사이드바 예열 문자열.
    expect(listUrl({ ...base, owner: parseOwnerParam(null), segment: {}, sort: null, offset: 0 })).toBe(
      "/api/admin/crm/customers/unified?limit=50&offset=0&owner=__me"
    )
  })

  it("조건·정렬·담당을 정규형으로 싣는다", () => {
    const url = new URL(
      listUrl({ ...base, owner: "김담당", segment: { risk: ["soon", "urgent"], expDays: 30 }, sort: { key: "last_contact", direction: "asc" }, offset: 50 }),
      "https://x"
    )
    expect(url.searchParams.get("owner")).toBe("김담당")
    expect(url.searchParams.get("sort")).toBe("last_contact")
    expect(url.searchParams.get("dir")).toBe("asc")
    expect(url.searchParams.get("expDays")).toBe("30")
    expect(url.searchParams.getAll("risk")).toEqual(["urgent", "soon"])
  })

  it("내보내기 URL — 페이지 파라미터 없음, 선택 키는 keys 로", () => {
    const url = new URL(exportUrl({ ...base, segment: { kinds: ["neo_account"] }, keys: ["neo:A", "lead:1"] }), "https://x")
    expect(url.pathname).toBe("/api/admin/crm/customers/export")
    expect(url.searchParams.has("limit")).toBe(false)
    expect(url.searchParams.getAll("keys")).toEqual(["neo:A", "lead:1"])
    // CSV 도 목록과 같은 담당 범위 — 전체는 `owner=` 로 밝힌다(생략이면 서버가 로그인 담당으로 좁힌다).
    expect(exportUrl(base)).toBe("/api/admin/crm/customers/export?owner=")
    expect(exportUrl({ ...base, owner: "__me" })).toBe("/api/admin/crm/customers/export?owner=__me")
  })

  it("화면 URL 패치 — 담당(?owner=)·조건을 다른 쿼리를 건드리지 않고 한 번에", () => {
    const next = new URLSearchParams(
      patchUnifiedListParams("account=neo%3A1&view=priority&expDays=14", { owner: " 김담당 ", segment: { risk: ["urgent"] } })
    )
    expect(next.get("owner")).toBe("김담당")
    expect(next.get("account")).toBe("neo:1")
    expect(next.get("view")).toBe("priority")
    expect(next.has("expDays")).toBe(false)
    expect(next.getAll("risk")).toEqual(["urgent"])
    // 전체(빈 값)도 지우지 않고 `owner=` 로 남긴다 — 생략은 "내 담당"이라 지우면 다음 착지가 내 담당으로 좁혀진다.
    expect(patchUnifiedListParams("owner=x&tag=VIP", { owner: "" })).toBe("owner=&tag=VIP")
    expect(parseOwnerParam("  ")).toBe("")
    expect(parseOwnerParam(null)).toBe("__me")
    expect(segmentParamSignature(new URLSearchParams("risk=soon&risk=urgent&x=1"))).toBe("risk=urgent&risk=soon")
  })

  it("NEO '휴면' 플래그는 동기화 시각이 아니라 최근 수업일로 본다", () => {
    // ago() 는 GENERATED_AT 기준인데 deriveCustomerFlags 는 Date.now() 로 30일을 센다 — 시계를 고정하지
    // 않으면 작성 뒤 30일이 지나는 순간 "2일 전 수업"도 휴면으로 읽혀 깨진다(2026-10-28 실제 발생).
    vi.useFakeTimers({ now: Date.parse(GENERATED_AT) })
    try {
      const stale = row({ updatedAt: ago(90), lastClassAt: ago(2) })
      expect(rowToFlags(stale)).not.toContain("dormant")
      expect(rowToFlags(row({ updatedAt: ago(1), lastClassAt: ago(60) }))).toContain("dormant")
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("CrmUnifiedCustomersClient 소스 계약 — ?owner=·조건 URL 상태, 서버 정렬, 선택", () => {
  const clientSource = readFileSync(resolve(process.cwd(), "components/admin/crm/CrmUnifiedCustomersClient.tsx"), "utf8").replace(
    /\r\n/g,
    "\n"
  )

  it("담당·조건 초기값을 마운트 시점 URL 에서 읽는다(딥링크 첫 요청부터 실림)", () => {
    expect(clientSource).toContain('const [owner, setOwner] = useState(() => parseOwnerParam(searchParams.get("owner")))')
    expect(clientSource).toContain("useState<CustomerSegmentSpec>(() => parseSegmentSpec(searchParams))")
    expect(clientSource).toContain('owner: searchParams.get("owner") ?? undefined,')
  })

  it("담당은 URL(?owner=)만 정본 — 브라우저 저장값(localStorage)으로 담당을 복원·영속하지 않는다(2026-10-16)", () => {
    // 예전(09-25)에는 "딥링크 착지면 저장된 담당을 복원하지 않는다"였다. 10월 기본 담당 계약이 저장값 복원 자체를
    // 걷었으므로(다른 계정에 새는 문제) 딥링크·일반 진입 모두 URL 하나로 정한다.
    expect(clientSource).not.toMatch(/\blocalStorage\s*\.\s*(getItem|setItem|removeItem)\b/)
    expect(clientSource).not.toMatch(/\bpersistOwner\b/)
    // ?owner= 가 바뀌면(딥링크·뒤로 가기) 같은 파서로 state 를 맞춘다 — 사라지면 로그인 담당(생략=내 담당).
    expect(clientSource).toContain('const next = parseOwnerParam(searchParams.get("owner"))')
  })

  it("정렬·조건은 서버 요청(listUrl)에 싣고 행 순서는 응답 그대로 — 클라이언트 재정렬 없음", () => {
    const start = clientSource.indexOf("const loadPage = useCallback(")
    const block = clientSource.slice(start, clientSource.indexOf("const cached =", start))
    expect(block).toContain("segment: segmentSpec,")
    expect(block).toContain("sort,")
    expect(block).toContain("setSelectedKeys(")
    expect(clientSource).not.toContain("sortRows(")
  })

  it("일괄 행동 뒤에는 같은 페이지를 강제로 다시 불러온다", () => {
    const start = clientSource.indexOf("const handleBulkCompleted = useCallback(")
    const block = clientSource.slice(start, clientSource.indexOf("[data?.pagination.offset, loadPage]", start))
    expect(block).toContain("{ force: true }")
    expect(block).toContain("setToast(")
  })
})
