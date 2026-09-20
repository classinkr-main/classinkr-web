/**
 * CRM §13 D3 — 인사이트 "Compass 파이프라인" 섹션(components/admin/crm/insights/CompassPipelineSection.tsx).
 *
 * View 컴포넌트에 모의 CompassSummary를 주입하고 renderToStaticMarkup으로 정적 마크업만 검사한다
 * (vitest.config.ts가 environment:"node"라 jsdom이 없다 — 클릭 상호작용은 테스트하지 않는다).
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CompassPipelineSectionView, type CompassPipelineSectionViewProps } from "@/components/admin/crm/insights/CompassPipelineSection"
import type { CompassSummary } from "@/lib/compass/summary-contract"

const ROOT = process.cwd()
const CRM_INSIGHTS_CLIENT_PATH = path.join(ROOT, "components/admin/crm/CrmInsightsClient.tsx")

function makeSummary(overrides: Partial<CompassSummary> = {}): CompassSummary {
  return {
    period: { key: "7d", since: "2026-09-13T00:00:00+09:00", until: "2026-09-20T00:00:00+09:00" },
    generatedAt: "2026-09-20T01:00:00.000Z",
    down: false,
    truncated: false,
    inflowTotal: 42,
    byPlatform: [
      { key: "meta", label: "메타", count: 20 },
      { key: "naver", label: "네이버", count: 12 },
      { key: "kakao", label: "카카오", count: 10 },
    ],
    metaInflow: 20,
    stages: [],
    lost: 5,
    neoRegistered: 3,
    won: 2,
    careStages: [
      { key: "member", label: "팀원 미팅", count: 4 },
      { key: "leader", label: "팀장 미팅", count: 3 },
      { key: "ceo", label: "대표 미팅", count: 2 },
      { key: "paid", label: "결제완료", count: 2 },
      { key: "closed", label: "종료", count: 1 },
    ],
    bdOpen: 1,
    todayDemoCount: 0,
    byOwner: [
      { owner: "김담당", total: 10, demo: 4, bd: 2, won: 1, lost: 1 },
      { owner: "미배정", total: 3, demo: 0, bd: 0, won: 0, lost: 1 },
    ],
    lostReasons: [
      { key: "price", label: "가격", count: 3 },
      { key: "timing", label: "타이밍", count: 2 },
    ],
    upcomingActions: [],
    upcomingActionCount: 0,
    ...overrides,
  }
}

function renderView(overrides: Partial<CompassPipelineSectionViewProps> = {}) {
  const props: CompassPipelineSectionViewProps = {
    summary: makeSummary(),
    loading: false,
    refreshing: false,
    error: null,
    period: "7d",
    onPeriodChange: () => {},
    onRefresh: () => {},
    ...overrides,
  }
  return renderToStaticMarkup(<CompassPipelineSectionView {...props} />)
}

/**
 * `tagName` 요소 중 속성 `attrMatch`(예: `data-owner="김담당"`)를 가진 것을 여는 태그부터
 * 그 뒤 첫 `</tagName>`까지 그대로 잘라 온다. tr·li처럼 같은 태그가 안에 중첩되지 않는
 * 요소에서는 정확히 그 한 요소다. div처럼 안에 또 div가 있어도(케어 사다리·플랫폼 막대는
 * 바깥 div 안에 트랙 div·색칠 div가 중첩), 확인하려는 값(건수·색상)은 항상 가장 안쪽 div가
 * 닫히기 전에 나오므로 "첫 닫는 태그까지"만으로 충분하고, 다음 형제 요소로 새는 일도 없다.
 * 길이를 추측해 자르는 방식(slice)보다 안전하다 — 실제로 앞서 500자 고정 슬라이스가 메타
 * 플랫폼 막대(점 span까지 있어 더 긺)의 건수를 놓치는 문제가 있었다.
 */
function extractTag(html: string, tagName: string, attrMatch: string) {
  const re = new RegExp(`<${tagName}[^>]*${attrMatch}[^>]*>[\\s\\S]*?<\\/${tagName}>`)
  const match = html.match(re)
  expect(match, `not found: <${tagName} ...${attrMatch}...>`).not.toBeNull()
  return match![0]
}

describe("CompassPipelineSectionView — 헤더", () => {
  it("제목과 기간 칩 3종을 그린다", () => {
    const html = renderView()
    expect(html).toContain("Compass 파이프라인 · 마케팅팀 CRM 정리")
    expect(html).toContain("7일")
    expect(html).toContain("30일")
    expect(html).toContain("90일")
  })

  it("기간 칩이 aria-pressed로 현재 선택을 나타내고 44px(h-11) 터치 타깃을 쓴다", () => {
    const html = renderView({ period: "30d" })
    expect(html).toMatch(/aria-pressed="true"[^>]*>30일/)
    expect(html).toMatch(/aria-pressed="false"[^>]*>7일/)
    expect(html).toMatch(/aria-pressed="false"[^>]*>90일/)
    // 활성 칩도 비활성 칩도 h-11(44px)을 쓴다 — 반응형으로 줄이지 않는다.
    expect(html).toMatch(/aria-pressed="true"[^>]*class="h-11 /)
    expect(html).toMatch(/aria-pressed="false"[^>]*class="h-11 /)
  })

  it("FreshnessCaption에 generatedAt을 넘겨 기준 시각을 그린다", () => {
    const html = renderView()
    expect(html).toContain("기준 ")
  })

  it("truncated면 상한 캡션을 그린다", () => {
    const html = renderView({ summary: makeSummary({ truncated: true }) })
    expect(html).toContain("상한 5,000건 · 일부 누락 가능")
  })

  it("truncated가 아니면 상한 캡션을 그리지 않는다", () => {
    const html = renderView({ summary: makeSummary({ truncated: false }) })
    expect(html).not.toContain("일부 누락 가능")
  })
})

describe("CompassPipelineSectionView — 블록 1 담당별 진행 표", () => {
  it("열 라벨(담당·유입·데모·BD인계·결제·이탈)을 전부 그린다", () => {
    const html = renderView()
    for (const label of ["담당", "유입", "데모", "BD인계", "결제", "이탈"]) {
      expect(html).toContain(`>${label}<`)
    }
  })

  it("행 값을 담당별로 정확히 그린다(tabular-nums 우측 정렬)", () => {
    const html = renderView()
    const kimRow = extractTag(html, "tr", 'data-owner="김담당"')
    expect(kimRow).toContain(">김담당<")
    expect(kimRow).toMatch(/data-col="total"[^>]*>10</)
    expect(kimRow).toMatch(/data-col="demo"[^>]*>4</)
    expect(kimRow).toMatch(/data-col="bd"[^>]*>2</)
    expect(kimRow).toMatch(/data-col="won"[^>]*>1</)
    expect(kimRow).toMatch(/data-col="lost"[^>]*>1</)
    expect(kimRow).toContain("tabular-nums")
  })

  it("합계 행을 그리지 않는다(행 수 = byOwner 길이, 별도 합계 행 없음)", () => {
    const html = renderView()
    const ownerRowCount = (html.match(/<tr[^>]*data-owner="/g) ?? []).length
    expect(ownerRowCount).toBe(2) // 김담당·미배정뿐 — 합계 행이 끼어들지 않는다.
    expect(html).toContain("합계 행 없음")
  })

  it("미배정 행은 흐리게(무채색 저대비) 표시하고 다른 행과 다르게 스타일한다", () => {
    const html = renderView()
    const unassignedRow = extractTag(html, "tr", 'data-owner="미배정"')
    expect(unassignedRow).toContain('data-unassigned="true"')
    expect(unassignedRow).toContain("text-[#1a1a1a]/40")

    const kimRow = extractTag(html, "tr", 'data-owner="김담당"')
    expect(kimRow).not.toContain("data-unassigned")
    expect(kimRow).toContain("text-[#111110]")
  })

  it("담당별 진행 행이 0개면 EmptyState를 그린다", () => {
    const html = renderView({ summary: makeSummary({ byOwner: [] }) })
    expect(html).toContain("담당별 진행을 표시할 데이터가 없습니다.")
  })
})

describe("CompassPipelineSectionView — 블록 2 케어 사다리", () => {
  it("5단계 라벨(COMPASS_CARE_STAGE_LABEL)을 전부 그리고 단일 색(#084734)만 쓴다", () => {
    const html = renderView()
    for (const label of ["팀원 미팅", "팀장 미팅", "대표 미팅", "결제완료", "종료"]) {
      expect(html).toContain(label)
    }
    for (const key of ["member", "leader", "ceo", "paid", "closed"]) {
      const row = extractTag(html, "div", `data-care-stage="${key}"`)
      expect(row).toContain("background-color:#084734")
    }
  })

  it("건수를 막대 안에 직접 표기한다", () => {
    const html = renderView()
    const leaderRow = extractTag(html, "div", 'data-care-stage="leader"')
    expect(leaderRow).toContain(">3<")
  })

  it("전부 0이면 '케어 단계 데이터 없음'을 그린다", () => {
    const html = renderView({
      summary: makeSummary({
        careStages: [
          { key: "member", label: "팀원 미팅", count: 0 },
          { key: "leader", label: "팀장 미팅", count: 0 },
          { key: "ceo", label: "대표 미팅", count: 0 },
          { key: "paid", label: "결제완료", count: 0 },
          { key: "closed", label: "종료", count: 0 },
        ],
      }),
    })
    expect(html).toContain("케어 단계 데이터 없음")
  })
})

describe("CompassPipelineSectionView — 블록 3 유입 플랫폼", () => {
  it("플랫폼 막대에 건수를 직접 표기한다", () => {
    const html = renderView()
    const metaRow = extractTag(html, "div", 'data-platform="meta"')
    expect(metaRow).toContain(">20<")
    const naverRow = extractTag(html, "div", 'data-platform="naver"')
    expect(naverRow).toContain(">12<")
  })

  it("메타 행에만 AD_CHANNEL_COLOR.meta 점을 붙이고 다른 행엔 점이 없다", () => {
    const html = renderView()
    const metaRow = extractTag(html, "div", 'data-platform="meta"')
    expect(metaRow.toLowerCase()).toContain("background-color:#0866ff")
    expect(metaRow).toContain("rounded-full")

    const naverRow = extractTag(html, "div", 'data-platform="naver"')
    expect(naverRow).not.toContain("rounded-full")
  })

  it("막대 색은 항상 브랜드 그린이다(냉색 금지 — 메타 점 예외)", () => {
    const html = renderView()
    const naverRow = extractTag(html, "div", 'data-platform="naver"')
    expect(naverRow).toContain("background-color:#084734")
    const kakaoRow = extractTag(html, "div", 'data-platform="kakao"')
    expect(kakaoRow).toContain("background-color:#084734")
  })

  it("상위 6개만 그리고 inflowTotal 캡션을 남긴다", () => {
    const html = renderView({
      summary: makeSummary({
        byPlatform: Array.from({ length: 9 }).map((_, i) => ({ key: `ch${i}`, label: `채널${i}`, count: 9 - i })),
        inflowTotal: 77,
      }),
    })
    expect(html).toContain('data-platform="ch0"')
    expect(html).toContain('data-platform="ch5"')
    expect(html).not.toContain('data-platform="ch6"')
    expect(html).toContain("기간 내 전체 유입 77건")
  })

  it("플랫폼 데이터가 없으면 안내 문구를 그린다", () => {
    const html = renderView({ summary: makeSummary({ byPlatform: [] }) })
    expect(html).toContain("유입 플랫폼 데이터 없음")
  })
})

describe("CompassPipelineSectionView — 블록 4 이탈 사유 상위 5", () => {
  it("헤더에 이탈 총건수를 표시하고 사유·건수 목록을 그린다", () => {
    const html = renderView()
    expect(html).toContain("이탈 5건")
    const priceRow = extractTag(html, "li", 'data-lost-reason="price"')
    expect(priceRow).toContain("가격")
    expect(priceRow).toContain("3건")
    const timingRow = extractTag(html, "li", 'data-lost-reason="timing"')
    expect(timingRow).toContain("타이밍")
    expect(timingRow).toContain("2건")
  })

  it("이탈이 0건이면 목록 대신 '기간 내 이탈 없음'을 그린다", () => {
    const html = renderView({ summary: makeSummary({ lost: 0, lostReasons: [] }) })
    expect(html).toContain("기간 내 이탈 없음")
    expect(html).not.toContain("data-lost-reason")
  })
})

describe("CompassPipelineSectionView — 상태", () => {
  it("초기 로딩(summary 없음)이면 스켈레톤만 그리고 본문 블록은 없다", () => {
    const html = renderView({ summary: null, loading: true })
    expect(html).toContain('data-testid="compass-skeleton"')
    expect(html).not.toContain("담당별 진행")
    expect(html).not.toContain("케어 사다리")
  })

  it("down이면 숫자를 걷어내고 'Compass 연결 끊김 · 다시 확인' 한 줄만 남긴다", () => {
    const html = renderView({
      summary: makeSummary({
        down: true,
        byOwner: [{ owner: "김담당", total: 999, demo: 999, bd: 999, won: 999, lost: 999 }],
        careStages: [{ key: "member", label: "팀원 미팅", count: 999 }],
      }),
    })
    expect(html).toContain("Compass 연결 끊김")
    expect(html).toContain("다시 확인")
    expect(html).not.toContain("999")
    expect(html).not.toContain("김담당")
    expect(html).not.toContain("담당별 진행")
  })

  it("summary가 없고 error만 있으면 다운으로 취급한다(신뢰할 데이터 없음)", () => {
    const html = renderView({ summary: null, loading: false, error: "network error" })
    expect(html).toContain("Compass 연결 끊김")
  })

  it("summary는 있고(down 아님) 새로고침만 실패하면 본문은 유지하고 인라인 캡션+재시도만 보인다", () => {
    const html = renderView({ summary: makeSummary({ down: false }), error: "최신 데이터를 받지 못했습니다." })
    expect(html).toContain("담당별 진행")
    expect(html).toContain("최신 데이터를 받지 못했습니다.")
    expect(html).toContain("다시 확인")
    expect(html).not.toContain("Compass 연결 끊김")
  })
})

describe("CrmInsightsClient 소스 정리 — P2 후속 · 섹션 배치", () => {
  it("로컬 90_000 TTL 리터럴이 더 이상 없다", () => {
    const source = readFileSync(CRM_INSIGHTS_CLIENT_PATH, "utf8")
    expect(source).not.toContain("90_000")
    expect(source).not.toMatch(/const CACHE_TTL_MS/)
  })

  it("CompassPipelineSection을 담당별 건강도 섹션 아래·점수 정의표 위에 배치한다", () => {
    const source = readFileSync(CRM_INSIGHTS_CLIENT_PATH, "utf8")
    expect(source).toContain('import CompassPipelineSection from "./insights/CompassPipelineSection"')
    const healthIdx = source.indexOf("<CrmHealthByOwnerSection")
    const compassIdx = source.indexOf("<CompassPipelineSection")
    const scoreIdx = source.indexOf("<CrmScoreKindDefinitionsSection")
    expect(healthIdx).toBeGreaterThan(-1)
    expect(compassIdx).toBeGreaterThan(healthIdx)
    expect(scoreIdx).toBeGreaterThan(compassIdx)
  })
})
