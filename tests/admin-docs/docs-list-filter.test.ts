import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// `/admin/docs` 문서 목록의 "찾기 쉬움" 계약.
//
// 실측 배경(프로덕션 2026-08-26, docs_articles 144행):
//   - visibility: public 60 / unlisted 59 / internal 25
//   - updated_by: seed-docs 62 / sync-channel-documents 58 / seed-internal-canon 12 / 사람 12
//   - 편집자의 실제 작업 대상 = 공개 사이트 목록에 뜨는 60편(published · public · !noindex)
//
// 렌더 테스트가 아니라 소스 계약 테스트다(이 저장소의 tests/admin·tests/admin-docs 관례).
const page = readFileSync(join(process.cwd(), "app/admin/docs/page.tsx"), "utf8")
const lib = readFileSync(join(process.cwd(), "lib/admin-docs.ts"), "utf8")
const publicUtils = readFileSync(join(process.cwd(), "app/docs/_utils.tsx"), "utf8")
const publicContent = readFileSync(join(process.cwd(), "lib/docs-content.ts"), "utf8")

describe("가시성 필터", () => {
  it("기존 필터 상수 관례대로 VISIBILITY_FILTERS를 둔다", () => {
    expect(page).toContain("const VISIBILITY_FILTERS = [")
    for (const value of ["all", "public", "unlisted", "internal"]) {
      expect(page).toContain(`{ value: "${value}",`)
    }
  })

  it("select와 필터 술어 양쪽에 연결한다", () => {
    expect(page).toContain("{VISIBILITY_FILTERS.map((option) => (")
    expect(page).toContain('aria-label="가시성 필터"')
    expect(page).toContain(
      'visibilityFilter === "all" || article.visibility === visibilityFilter'
    )
    // useMemo 의존성에서 빠지면 셀렉트를 바꿔도 목록이 안 갱신된다.
    expect(page).toContain("visibilityFilter,\n  ])")
  })
})

describe("`공개 가이드만` 빠른 필터", () => {
  it("공개 사이트 노출 기준(published · public · !noindex)과 같은 정의를 쓴다", () => {
    expect(page).toContain(
      'article.status === "published" && article.visibility === "public" && !article.noindex'
    )

    // 정의의 출처 — 어느 한쪽이 바뀌면 이 테스트가 먼저 깨져야 한다.
    expect(publicUtils).toContain('(doc.visibility ?? "public") === "public" && !doc.noindex')
    expect(publicContent).toContain(
      'const PUBLISHED_DOC_STATUS_VALUES = ["published", "PUBLISHED"]'
    )
  })

  it("기본값은 꺼짐이라 기존 동작(전체 목록)이 그대로다", () => {
    expect(page).toContain("const [publicGuidesOnly, setPublicGuidesOnly] = useState(false)")
  })

  it("켜고 끄면 상태·가시성 셀렉트가 함께 움직여 화면과 실제 필터가 어긋나지 않는다", () => {
    expect(page).toContain("function togglePublicGuidesOnly()")
    expect(page).toContain('setStatusFilter(next ? "published" : "all")')
    expect(page).toContain('setVisibilityFilter(next ? "public" : "all")')
    // 반대 방향 — 셀렉트를 직접 만지면 토글이 풀린다.
    expect(page).toContain('if (value !== "published") setPublicGuidesOnly(false)')
    expect(page).toContain('if (value !== "public") setPublicGuidesOnly(false)')
  })

  it("저장된 뷰가 새 축을 잃지 않고, 축이 없던 옛 뷰도 기본값으로 복원한다", () => {
    expect(page).toContain("visibilityFilter?: string")
    expect(page).toContain("publicGuidesOnly?: boolean")
    expect(page).toContain('setVisibilityFilter(view.visibilityFilter ?? "all")')
    expect(page).toContain("setPublicGuidesOnly(view.publicGuidesOnly ?? false)")
  })
})

describe("출처 라벨", () => {
  it("요약 타입과 조회 컬럼에 updated_by가 실려 온다", () => {
    expect(lib).toContain("updatedBy: string | null")
    expect(lib).toContain("chatbot_summary, updated_by, updated_at")
    expect(lib).toContain("updatedBy: article.updated_by ?? null")
    // 정적 폴백에는 편집자 정보가 없다 — 추측하지 않는다.
    expect(lib).toContain("updatedBy: null,")
  })

  it("자동 파이프라인 3종을 라벨로 매핑하고 나머지는 전부 사람으로 본다", () => {
    for (const key of [
      "seed-docs",
      "sync-channel-documents",
      "seed-internal-canon",
      "cs-knowledge-promotion",
    ]) {
      expect(page).toContain(`"${key}":`)
    }
    expect(page).toContain("function getDocSource(")
    expect(page).toContain('return { label: "직접 편집", editor: key, byHuman: true }')
  })

  it("파스텔 채움 배지가 아니라 글자색 + 1px 선으로 구분한다(DESIGN.md 어드민 라벨 단순화)", () => {
    expect(page).toContain('<th className="px-4 py-3 font-semibold">업데이트 · 출처</th>')
    expect(page).toContain("border-l border-[#084734] pl-1.5 font-semibold text-[#084734]")
    // 출처를 StatusBadge(둥근 알약 + 배경 채움)로 그리지 않는다.
    expect(page).not.toContain("<StatusBadge label={source.label}")
  })
})

describe("검토 주기 경고 피로", () => {
  it("신선도 기준은 검토일·수정일 중 더 최근 값이다", () => {
    // 이전: lastReviewedAt ?? updatedAt — 시드가 박아 둔 옛 검토일이 최근 수정을 가렸다.
    expect(lib).toContain("function getReviewAgeDays(")
    expect(lib).toContain("return Math.min(...ages)")
    expect(lib).toContain(
      "const reviewAge = getReviewAgeDays(article.lastReviewedAt, article.updatedAt)"
    )
    expect(lib).not.toContain("getDaysSince(article.lastReviewedAt ?? article.updatedAt)")
  })

  it("주기 초과를 aiIssues(붉은 칩 줄)에서 빼고 중립 텍스트로 내린다", () => {
    expect(lib).not.toContain('aiIssues.push("검토 주기 초과")')
    expect(lib).toContain("reviewAgeDays: number | null")
    expect(lib).toContain("reviewAgeDays: reviewAge")
    expect(page).toContain("검토 {formatNumber(article.reviewAgeDays)}일 경과")
    expect(page).toContain('className="mt-1 text-[11px] text-[#1a1a1a]/30"')
  })

  it("stale 플래그 자체는 남아 준비 상태 필터가 계속 동작한다", () => {
    expect(lib).toContain("stale,")
    expect(page).toContain('(readinessFilter === "stale" && article.stale)')
  })
})

describe("행 수 대응", () => {
  it("공용 ShowMore/useVisibleCount를 재사용한다", () => {
    expect(page).toContain('import ShowMore, { useVisibleCount } from "@/components/admin/ui/ShowMore"')
    expect(page).toContain("const ARTICLE_PAGE_SIZE = 40")
    expect(page).toContain("useVisibleCount(filteredArticles.length, ARTICLE_PAGE_SIZE)")
    expect(page).toContain("filteredArticles.slice(0, visibleArticleCount)")
    // 실제 렌더는 잘린 배열로 돈다.
    expect(page).toContain("visibleArticles.map((article) => {")
  })

  it("필터 결과 수 표시를 유지한다", () => {
    expect(page).toContain("{formatNumber(filteredArticles.length)}개 표시")
  })

  it("전체 선택은 화면에 그려진 행만 대상으로 한다", () => {
    // 아직 펼치지 않은 행까지 선택되면 일괄 수정이 보이지 않는 문서에 적용된다.
    expect(page).toContain("visibleArticles.every((article) => selectedArticleIds.includes(article.id))")
    expect(page).toContain("...visibleArticles.map((article) => article.id)")
    expect(page).not.toContain("filteredArticles.every((article) => selectedArticleIds.includes(article.id))")
  })
})
