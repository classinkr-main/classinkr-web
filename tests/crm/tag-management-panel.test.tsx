import { readFileSync } from "node:fs"
import path from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// T4 태그 관리 패널. 저장소에 DOM 테스트 환경(jsdom/happy-dom)이 없어 클릭 흐름(이름 변경·병합
// 미리보기·확인)은 정적 마크업(초기 로딩 상태) + 소스 계약(핸들러 배선)으로 고정한다 —
// activity-quick-form-templates.test.tsx와 같은 방식.

vi.mock("@/lib/admin-client", () => ({
  adminFetchJson: vi.fn(async () => ({ updated: 0, removedDuplicates: 0 })),
  adminFetchJsonCached: vi.fn(async () => ({ tags: [], generatedAt: "2026-09-21T00:00:00Z" })),
  getCachedAdminJson: vi.fn(() => null),
}))

import TagManagementPanel from "@/components/admin/crm/TagManagementPanel"

const SOURCE = readFileSync(
  path.resolve(__dirname, "../../components/admin/crm/TagManagementPanel.tsx"),
  "utf8"
)

describe("TagManagementPanel 정적 마크업(초기 로딩 상태)", () => {
  it("제목·설명과 태그 검색 input을 렌더한다", () => {
    const html = renderToStaticMarkup(<TagManagementPanel />)
    expect(html).toContain(">태그 관리<")
    expect(html).toContain('aria-label="태그 검색"')
    expect(html).toContain('placeholder="태그 검색"')
  })

  it("표 헤더 5종(태그·범주·건수·리드/고객 분해·최근 사용)을 렌더한다", () => {
    const html = renderToStaticMarkup(<TagManagementPanel />)
    expect(html).toContain(">태그<")
    expect(html).toContain(">범주<")
    expect(html).toContain(">건수<")
    expect(html).toContain("리드 · NEO · 고객")
    expect(html).toContain(">최근 사용<")
  })

  it("데이터가 오기 전에는 로딩 스켈레톤 행 5개를 그린다", () => {
    const html = renderToStaticMarkup(<TagManagementPanel />)
    const skeletonRows = html.match(/<tr aria-hidden/g) ?? []
    expect(skeletonRows).toHaveLength(5)
  })

  it("선택된 태그가 없으므로 병합 툴바는 렌더하지 않는다", () => {
    const html = renderToStaticMarkup(<TagManagementPanel />)
    expect(html).not.toContain("개 선택됨")
  })

  it("자동 태그 규칙 섹션을 접힌 상태로 렌더한다(T5)", () => {
    const html = renderToStaticMarkup(<TagManagementPanel />)
    expect(html).toContain("자동 태그 규칙")
    expect(html).toContain('aria-expanded="false"')
    // 접혀 있으므로 "지금 미리보기" 버튼은 아직 렌더되지 않는다.
    expect(html).not.toContain("지금 미리보기")
  })
})


describe("TagManagementPanel 소스 계약", () => {
  it("window.confirm을 쓰지 않는다(파괴적 확인은 인라인)", () => {
    expect(SOURCE).not.toContain("window.confirm")
  })

  it("이름 변경 확인·병합 확인 버튼은 Danger 채움(#B43E3E)만 쓴다", () => {
    const renameConfirm = SOURCE.slice(SOURCE.indexOf("commitRename()}"), SOURCE.indexOf("취소", SOURCE.indexOf("commitRename()}")))
    expect(renameConfirm).toContain("bg-[#B43E3E]")
    const mergeConfirm = SOURCE.slice(SOURCE.indexOf("commitMerge()}"), SOURCE.indexOf("취소", SOURCE.indexOf("commitMerge()}")))
    expect(mergeConfirm).toContain("bg-[#B43E3E]")
  })

  it("이름 변경 input은 Enter로 미리보기를 계산하고 Esc로 취소한다", () => {
    const block = SOURCE.slice(SOURCE.indexOf("onKeyDown={(event) => {"), SOURCE.indexOf("aria-label={`${row.tag} 새 이름`}"))
    expect(block).toContain('event.key === "Enter"')
    expect(block).toContain("previewRename()")
    expect(block).toContain('event.key === "Escape"')
    expect(block).toContain("cancelRename()")
  })

  it("이름 변경·병합 모두 dryRun:true로 먼저 미리보기 PATCH를 태운 뒤에만 확인 버튼을 채운다", () => {
    expect(SOURCE).toContain('action: "rename", from: validated.from, to: validated.to, dryRun: true')
    expect(SOURCE).toContain('action: "merge", from: validated.from, to: validated.to, dryRun: true')
    // 커밋(실제 반영) 호출에는 dryRun을 싣지 않는다 — 기본값 false로 실행.
    expect(SOURCE).toContain('action: "rename", from, to }')
    expect(SOURCE).toContain('action: "merge", from, to }')
  })

  it("커밋 성공 뒤에는 항상 force 재조회를 태운다", () => {
    expect((SOURCE.match(/load\(\{ force: true \}\)/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it("체크박스는 태그별 aria-label을 갖고 병합 선택에 쓰인다", () => {
    expect(SOURCE).toContain("aria-label={`태그 ${row.tag} 선택`}")
    expect(SOURCE).toContain("toggleSelected(row.tag)")
  })

  it("EmptyState를 검색 결과 없음·전체 없음 두 문구로 구분해 쓴다", () => {
    expect(SOURCE).toContain("검색 결과가 없습니다")
    expect(SOURCE).toContain("등록된 태그가 없습니다")
  })

  it("행 클릭으로 통합 고객 화면 이동 링크는 넣지 않았다(통합 클라이언트가 ?tag=를 읽지 않음)", () => {
    expect(SOURCE).not.toContain("/admin/crm/customers/unified?tag=")
  })

  // ── T6 범주 셀렉트 ───────────────────────────────────────────────────
  it("범주 셀렉트는 TAG_CATEGORIES 5종을 옵션으로 렌더하고 태그별 aria-label을 갖는다", () => {
    expect(SOURCE).toContain("TAG_CATEGORIES.map((category)")
    expect(SOURCE).toContain("aria-label={`${row.tag} 범주`}")
    expect(SOURCE).toContain('onChange={(event) => void changeCategory(row.tag, event.target.value as TagCategory)}')
  })

  it("범주 셀렉트는 set_category PATCH를 태운다", () => {
    expect(SOURCE).toContain('action: "set_category", tag, category')
  })

  it("risk 범주만 Warning 텍스트 색을 쓰고 다른 범주는 웜 뉴트럴이다", () => {
    const block = SOURCE.slice(SOURCE.indexOf('aria-label={`${row.tag} 범주`}'), SOURCE.indexOf("</select>"))
    expect(block).toContain('STATUS_TONE_TEXT_CLASS.warning')
    expect(block).toContain('"text-[#111110]"')
  })

  it("자동 태그는 정의(isAuto)가 참일 때만 배지를 렌더한다", () => {
    expect(SOURCE).toContain("definitionByTag.get(row.tag)?.isAuto")
    expect(SOURCE).toContain("자동")
  })

  // ── T5 자동 태그 규칙 섹션 ───────────────────────────────────────────
  it("규칙 섹션은 접힘 상태를 aria-expanded로 표기하고 토글 버튼을 갖는다", () => {
    expect(SOURCE).toContain("aria-expanded={rulesOpen}")
    expect(SOURCE).toContain("setRulesOpen((prev) => !prev)")
  })

  it("규칙별로 조건 설명·enabled 토글·마지막 실행·적용/제거 건수를 렌더한다", () => {
    expect(SOURCE).toContain("describeAutoTagRuleCondition(rule)")
    expect(SOURCE).toContain("void toggleRuleEnabled(rule)")
    expect(SOURCE).toContain("formatRuleRunTimestamp(rule.lastRunAt)")
    expect(SOURCE).toContain("formatAutoTagRuleOutcomeLabel(rule.lastApplied ?? 0, rule.lastRemoved ?? 0)")
  })

  it("enabled 토글은 set_rule_enabled PATCH를 태운다", () => {
    expect(SOURCE).toContain('action: "set_rule_enabled", ruleId: rule.id, enabled: !rule.enabled')
  })

  it("\"지금 미리보기\" 버튼은 CRON_SECRET 없이 preview_rules PATCH를 태운다", () => {
    expect(SOURCE).toContain("지금 미리보기")
    expect(SOURCE).toContain('action: "preview_rules"')
    expect(SOURCE).not.toContain("CRON_SECRET")
  })
})
