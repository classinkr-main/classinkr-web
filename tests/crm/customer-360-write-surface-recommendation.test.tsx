/**
 * 고객 360 드로어 — 다음 액션 추천 카드의 기록 위치(2026-09-26 교차 리뷰 [29]).
 * Compass 매칭 리드(compassPrimary)에서 녹색 채움 "실행 · 할 일 추가"가 Home 쓰기를 주 행동처럼 보이게 하던 문제:
 *  - Compass 모드: 주 행동은 Compass 새 탭 링크(primary, 채움). Home 할 일 추가는 기능 유지 + 외곽선 보조 +
 *    Home 전용 캡션(컴포저 접기와 같은 규칙).
 *  - Home 정본(NEO 계정·전환 리드·Compass 미매칭): 지금처럼 채움 "실행 · 할 일 추가" + "메모 남기기".
 * DOM 환경이 없어 presentational 컴포넌트의 정적 마크업 + 소스 계약으로 고정한다.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

import {
  C360RecommendationActions,
  C360_RECOMMENDATION_HOME_TASK_LABEL,
  C360_RECOMMENDATION_RUN_LABEL,
} from "@/components/admin/crm/Customer360Drawer"
import { HOME_ONLY_CAPTION } from "@/lib/crm/write-surface"

const HREF = "https://mkt.classin.co.kr/leads?open=77"
const FILLED_GREEN = "bg-[#084734]"

function render(compassHref: string | null, busy = false) {
  return renderToStaticMarkup(
    <C360RecommendationActions
      compassHref={compassHref}
      name="큰학원"
      busy={busy}
      onRunTask={() => {}}
      onFocusComposer={() => {}}
    />
  )
}

/** data-testid 로 여는 태그 하나를 찾는다(속성 순서 무관). */
function openingTag(html: string, testId: string): string {
  const match = html.match(new RegExp(`<(?:a|button)[^>]*data-testid="${testId}"[^>]*>`))
  if (!match) throw new Error(`${testId} 없음`)
  return match[0]
}

describe("추천 카드 — Compass 매칭 리드(compassPrimary)", () => {
  const html = render(HREF)

  it("주 행동은 Compass 새 탭 링크(채움 primary) — 할 일 버튼보다 먼저", () => {
    const link = openingTag(html, "c360-recommendation-open-compass")
    expect(link).toContain(`href="${HREF}"`)
    expect(link).toContain('target="_blank"')
    expect(link).toContain(FILLED_GREEN)
    expect(link).toContain('aria-label="큰학원 Compass에서 열기 (새 탭)"')
    expect(html.indexOf("c360-recommendation-open-compass")).toBeLessThan(html.indexOf("c360-recommendation-add-task"))
  })

  it("Home 할 일 추가는 기능 유지 + 외곽선 보조(채움 아님) + Home 전용 캡션", () => {
    const button = openingTag(html, "c360-recommendation-add-task")
    expect(button).not.toContain(FILLED_GREEN)
    expect(button).toContain("border border-[#D7EBDD] bg-white")
    expect(html).toContain(C360_RECOMMENDATION_HOME_TASK_LABEL)
    expect(html).not.toContain(C360_RECOMMENDATION_RUN_LABEL)
    expect(html).toContain('data-testid="c360-home-only-caption"')
    expect(html).toContain(HOME_ONLY_CAPTION)
    // 채움 CTA 는 Compass 링크 하나뿐.
    expect(html.split(FILLED_GREEN).length - 1).toBe(1)
  })

  it("Compass 모드에서는 Home 컴포저로 보내는 '메모 남기기'를 두지 않는다(컴포저는 접힘 바가 담당)", () => {
    expect(html).not.toContain("메모 남기기")
  })

  it("실행 중이면 할 일 버튼만 비활성", () => {
    const busyHtml = render(HREF, true)
    expect(openingTag(busyHtml, "c360-recommendation-add-task")).toContain('disabled=""')
    expect(openingTag(busyHtml, "c360-recommendation-open-compass")).not.toContain("disabled")
  })
})

describe("추천 카드 — Home 정본(NEO 계정·전환 리드·Compass 미매칭)", () => {
  const html = render(null)

  it("지금처럼 채움 '실행 · 할 일 추가' + '메모 남기기', Compass 링크·Home 전용 캡션 없음", () => {
    const button = openingTag(html, "c360-recommendation-add-task")
    expect(button).toContain(FILLED_GREEN)
    expect(html).toContain(C360_RECOMMENDATION_RUN_LABEL)
    expect(html).toContain("메모 남기기")
    expect(html).not.toContain("c360-recommendation-open-compass")
    expect(html).not.toContain("c360-home-only-caption")
    expect(html).not.toContain("<a")
  })
})

describe("소스 계약 — 드로어가 추천 카드 행동 줄을 판정 결과로 그린다", () => {
  const source = readFileSync(join(process.cwd(), "components/admin/crm/Customer360Drawer.tsx"), "utf8")

  it("compassPrimary 일 때만 Compass 링크를 넘기고, 할 일 실행·컴포저 포커스 경로는 그대로 연결한다", () => {
    expect(source).toContain("<C360RecommendationActions")
    expect(source).toContain("compassHref={compassPrimary ? (writeSurface?.compassHref ?? null) : null}")
    expect(source).toContain("onRunTask={() => void handleRunRecommendation()}")
    expect(source).toContain("onFocusComposer={focusComposer}")
    expect(source).toContain('busy={actingId === "rec"}')
  })

  it("추천 카드 안에 인라인 채움 할 일 버튼이 남아 있지 않다(행동 줄은 한 컴포넌트)", () => {
    // JSX 텍스트로 하드코딩된 "실행 · 할 일 추가" 는 없다 — 문구는 상수(C360_RECOMMENDATION_RUN_LABEL) 한 곳.
    expect(source).not.toMatch(/>\s*실행 · 할 일 추가\s*</)
    expect(source).toContain('export const C360_RECOMMENDATION_RUN_LABEL = "실행 · 할 일 추가"')
    expect(source.split('testId="c360-recommendation-open-compass"').length - 1).toBe(1)
  })
})
