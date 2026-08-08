import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// CS 콘솔 위계 재설계 P6 — docs 축.
// 정본: docs/active/cs-admin-console-ia-2026-07-27.md §5 URL 규약.
//
// 두 가지를 지킨다.
//  1. 문서 CRUD 크롬(제목·액션 4버튼·KPI 4카드)은 `가이드 문서` 그룹 밖으로 새지 않는다.
//     이 크롬은 원래 activeTab 분기 바깥에 있어 미해결 큐·AI 품질 검수·추천 질문 화면
//     상단에도 그대로 떴다 — gaps·quality는 props 없이 마운트돼 그 데이터를 쓰지도 않는다.
//  2. `tab`은 콘솔 메뉴 층, `sub`는 화면 안쪽 층이라는 2단 계약.
//
// 렌더 테스트가 아니라 소스 계약 테스트다(이 저장소의 tests/admin 관례).

const page = readFileSync(join(process.cwd(), "app/admin/docs/page.tsx"), "utf8")
const gaps = readFileSync(
  join(process.cwd(), "components/admin/docs/DocsGapsPanel.tsx"),
  "utf8"
)
const quality = readFileSync(
  join(process.cwd(), "components/admin/docs/DocsQualityPanel.tsx"),
  "utf8"
)
const nav = readFileSync(
  join(process.cwd(), "components/admin/cs/CsConsoleNav.tsx"),
  "utf8"
)

describe("docs console chrome scoping (P6)", () => {
  it("gates the guide-group chrome behind isGuideGroupTab", () => {
    // 제목·액션·KPI 세 덩어리 전부 가드 뒤에 있어야 한다.
    expect(page).toContain("{isGuideGroupTab ? (")
    // 크롬 안의 대표 앵커들이 가드 없이 등장하지 않는지 — 각 앵커 앞에 가드가 최소 한 번은 온다.
    for (const anchor of ["문서 센터 관리", "검색 인덱스 재생성", 'label="카테고리"']) {
      const anchorIndex = page.indexOf(anchor)
      expect(anchorIndex).toBeGreaterThan(-1)
      expect(page.slice(0, anchorIndex)).toContain("{isGuideGroupTab ? (")
    }
  })

  it("scopes the data banners to the tabs that actually consume content/analytics", () => {
    expect(page).toContain("const usesDocsPageData = isGuideGroupTab || activeTab === \"recommended\"")
    expect(page).toContain("{usesDocsPageData && error ? (")
    expect(page).toContain("{usesDocsPageData && warnings.length > 0 ? (")
    // 재색인·문서 저장 알림은 트리거가 그룹 크롬 안에만 있다.
    expect(page).toContain("{isGuideGroupTab && reindexNotice ? (")
    expect(page).toContain("{isGuideGroupTab && articleNotice ? (")
  })
})

describe("guide group `성과` tab (P6)", () => {
  it("registers analytics as a guide-group sibling, not a console menu", () => {
    expect(page).toContain('{ value: "analytics", label: "성과"')
    expect(page).toContain('{activeTab === "analytics" ? (')
    // 콘솔 하이라이트가 맞으려면 가이드 문서의 activeWhen에도 들어가야 한다.
    expect(nav).toContain('"/admin/docs?tab=analytics"')
    // 콘솔 가로 메뉴 항목으로는 올라가지 않는다(외부 축 6개 유지).
    expect(nav).not.toContain('href: "/admin/docs?tab=analytics"')
  })

  it("moves the three isolated read widgets out of the documents tab", () => {
    for (const widget of ["검색 상위", "조회 상위", "최근 문서 피드백"]) {
      const occurrences = page.split(widget).length - 1
      expect(occurrences).toBe(1)
      expect(page.slice(0, page.indexOf(widget))).toContain('{activeTab === "analytics" ? (')
    }
    // 카테고리 카드는 클릭 시 문서 목록을 필터하므로 `문서` 탭에 남는다.
    expect(page.slice(0, page.indexOf("setCategoryFilter(category.id)"))).toContain(
      '{activeTab === "documents" ? ('
    )
  })
})

describe("미해결 큐 sub tabs (P6)", () => {
  it("uses the shared AdminTabs with the `sub` url key and a queue default", () => {
    expect(gaps).toContain('useUrlState("sub", DEFAULT_GAP_SUB_TAB)')
    expect(gaps).toContain('const DEFAULT_GAP_SUB_TAB: GapSubTab = "queue"')
    expect(gaps).toContain('variant="subtle"')
    expect(gaps).toContain('from "@/components/admin/AdminTabs"')
  })

  it("keeps the coupled queue flow inside one sub tab", () => {
    // 두 리스트 + AI 초안은 draft 상태 슬롯 하나를 공유한다 — 같은 탭이어야 한다.
    const queueGuard = gaps.indexOf('{activeSub === "queue" ? (')
    expect(queueGuard).toBeGreaterThan(-1)
    // 주석에도 같은 문구가 있어 JSX 앵커로 잡는다.
    for (const anchor of [
      "문서 없는 질문 <span",
      "결과 없는 검색어 <span",
      ">AI 초안 — 검토 후 게시</h2>",
    ]) {
      expect(gaps.indexOf(anchor)).toBeGreaterThan(queueGuard)
    }
    // 패턴 분석은 반대쪽 탭 — 회귀 후보 토글이 아래로 흐르지 않는 독립 블록이다.
    const patternGuard = gaps.indexOf('{activeSub === "patterns" ? (')
    expect(patternGuard).toBeGreaterThan(-1)
    expect(patternGuard).toBeLessThan(queueGuard)
  })

  it("keeps the ?source= deep-link contract landing on the queue tab", () => {
    // source 칩은 queue 탭에 있다. 딥링크는 sub를 싣지 않으므로 기본값(queue)으로 착지한다.
    expect(gaps).toContain("readSourceFilterFromParams")
    expect(gaps).toContain("resolveSourceFilterPreset")
    const chipGuard = gaps.indexOf('{activeSub === "queue" ? (')
    expect(gaps.indexOf("GAP_SOURCE_FILTERS.map")).toBeGreaterThan(chipGuard)
  })
})

describe("AI 품질 검수 exit points (P6)", () => {
  it("drops the duplicate link to the sibling console menu", () => {
    expect(quality).not.toContain("미해결 큐 보기")
    expect(quality).not.toContain("/admin/docs?tab=gaps")
    // 하위탭은 넣지 않는다 — 독립 섹션 2개뿐이라 과하다.
    expect(quality).not.toContain("useUrlState")
  })
})
