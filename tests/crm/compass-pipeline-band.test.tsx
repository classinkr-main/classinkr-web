import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import CompassPipelineBand, {
  CompassSummaryBlock,
  formatActionEta,
} from "@/components/admin/crm/home/CompassPipelineBand"
import { leadSegmentHref } from "@/lib/crm/lead-segments"
import type { CompassSummary, CompassSummaryActionRow } from "@/lib/compass/summary-contract"

// §13 D2 — 홈 Compass 밴드 확장. CompassSummaryBlock은 summary를 순수 prop으로 받으므로
// renderToStaticMarkup(이 저장소에 jsdom이 없다 — vitest.config.ts environment: "node")만으로
// 세그먼트 타일·퍼널·플랫폼 막대·액션 목록·down 강등·기간 칩을 정적 마크업 계약으로 고정한다.

const NOW = Date.parse("2026-09-20T03:00:00.000Z") // 2026-09-20 12:00 KST — 낮 시간이라 KST 하루 경계가 명확하다.

function buildAction(overrides: Partial<CompassSummaryActionRow> = {}): CompassSummaryActionRow {
  return {
    compassLeadId: 1,
    academy: "클래스인학원",
    name: "김담당",
    stage: "demo",
    nextAction: "데모 준비물 확인",
    nextActionAt: new Date(NOW + 2 * 60 * 60 * 1000).toISOString(),
    owner: "박영업",
    caller: "이콜",
    url: "https://mkt.classin.co.kr/leads?open=1",
    ...overrides,
  }
}

function buildSummary(overrides: Partial<CompassSummary> = {}): CompassSummary {
  return {
    period: { key: "7d", since: "2026-09-13T00:00:00.000Z", until: "2026-09-20T03:00:00.000Z" },
    generatedAt: "2026-09-20T02:59:00.000Z",
    down: false,
    truncated: false,
    inflowTotal: 512,
    byPlatform: [
      { key: "meta", label: "메타", count: 418 },
      { key: "naver", label: "네이버", count: 256 },
      { key: "google", label: "구글", count: 193 },
      { key: "offline", label: "오프라인", count: 144 },
      { key: "other", label: "기타", count: 88 },
      { key: "kakao", label: "카카오", count: 12 }, // 상위 5 절단 확인용 6번째 행
    ],
    metaInflow: 418,
    stages: [
      { key: "new", label: "신규유입", count: 901 },
      { key: "contact", label: "컨택", count: 742 },
      { key: "consult", label: "상담", count: 563 },
      { key: "demo", label: "데모", count: 384 },
      { key: "quote", label: "견적", count: 205 },
      { key: "bd", label: "BD인계", count: 126 },
      { key: "won", label: "결제", count: 47 },
    ],
    lost: 63,
    neoRegistered: 339,
    won: 52,
    careStages: [
      { key: "member", label: "팀원 미팅", count: 0 },
      { key: "leader", label: "팀장 미팅", count: 0 },
      { key: "ceo", label: "대표 미팅", count: 0 },
      { key: "paid", label: "결제완료", count: 0 },
      { key: "closed", label: "종료", count: 0 },
    ],
    bdOpen: 127,
    todayDemoCount: 4,
    byOwner: [],
    lostReasons: [],
    upcomingActions: [buildAction()],
    upcomingActionCount: 1,
    ...overrides,
  }
}

const NOOP = () => {}

describe("CompassSummaryBlock 세그먼트 타일", () => {
  it("4개 타일과 leadSegmentHref 딥링크를 렌더한다", () => {
    const html = renderToStaticMarkup(
      <CompassSummaryBlock summary={buildSummary()} loading={false} error={null} period="7d" onPeriodChange={NOOP} onRetry={NOOP} nowMs={NOW} />
    )
    expect(html).toContain("메타 광고 유입")
    expect(html).toContain("BD인계 진행")
    expect(html).toContain("NeoCRM 등록")
    expect(html).toContain("결제")
    expect(html).toContain(leadSegmentHref("meta_ads"))
    expect(html).toContain(leadSegmentHref("bd_handover"))
    expect(html).toContain(leadSegmentHref("existing"))
    expect(html).toContain(leadSegmentHref("customer"))
    // 기간 힌트 — BD인계만 전 기간, 나머지는 선택 기간 유입 기준.
    expect(html).toContain("전 기간")
    expect(html).toContain("7일 유입 기준")
  })

  it("truncated면 건수 뒤 + 와 상한 캡션을 보여준다", () => {
    const html = renderToStaticMarkup(
      <CompassSummaryBlock summary={buildSummary({ truncated: true })} loading={false} error={null} period="7d" onPeriodChange={NOOP} onRetry={NOOP} />
    )
    expect(html).toContain("상한 5,000건에 닿아 일부 누락 가능")
    expect(html).toContain("418+")
  })
})

describe("CompassSummaryBlock 단계 퍼널", () => {
  it("COMPASS_FUNNEL_STAGES 7개 라벨을 모두 렌더한다", () => {
    const html = renderToStaticMarkup(
      <CompassSummaryBlock summary={buildSummary()} loading={false} error={null} period="7d" onPeriodChange={NOOP} onRetry={NOOP} />
    )
    for (const label of ["신규유입", "컨택", "상담", "데모", "견적", "BD인계", "결제"]) {
      expect(html).toContain(label)
    }
    expect(html).toContain("이탈 63건 별도")
  })
})

describe("CompassSummaryBlock 유입 플랫폼", () => {
  it("상위 5개 행을 건수와 함께 직접 표기한다(6번째 행은 절단)", () => {
    const html = renderToStaticMarkup(
      <CompassSummaryBlock summary={buildSummary()} loading={false} error={null} period="7d" onPeriodChange={NOOP} onRetry={NOOP} />
    )
    expect(html).toContain(">418<")
    expect(html).toContain(">256<")
    expect(html).toContain(">193<")
    expect(html).toContain(">144<")
    expect(html).toContain(">88<")
    // 상위 5 밖(카카오 12건)은 표시되지 않는다.
    expect(html).not.toContain("카카오")
  })
})

describe("CompassSummaryBlock 다음 액션 임박 목록", () => {
  it("학원명·다음 액션·D-시간·담당(caller 우선)·단계 라벨·새 탭 링크를 보여준다", () => {
    const html = renderToStaticMarkup(
      <CompassSummaryBlock summary={buildSummary()} loading={false} error={null} period="7d" onPeriodChange={NOOP} onRetry={NOOP} nowMs={NOW} />
    )
    expect(html).toContain("다음 액션 임박 1건 · 상위 8")
    expect(html).toContain("클래스인학원")
    expect(html).toContain("데모 준비물 확인")
    expect(html).toContain("2시간 후")
    expect(html).toContain("이콜") // caller 우선(owner "박영업"보다 앞선다)
    expect(html).toContain("데모") // COMPASS_STAGE_LABEL["demo"]
    expect(html).toContain('href="https://mkt.classin.co.kr/leads?open=1"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain("noopener")
  })

  it("학원명이 없으면 이름으로 대체한다", () => {
    const html = renderToStaticMarkup(
      <CompassSummaryBlock
        summary={buildSummary({ upcomingActions: [buildAction({ academy: null, name: "이름만있음" })] })}
        loading={false}
        error={null}
        period="7d"
        onPeriodChange={NOOP}
        onRetry={NOOP}
        nowMs={NOW}
      />
    )
    expect(html).toContain("이름만있음")
  })

  it("0건이면 EmptyState를 보여준다", () => {
    const html = renderToStaticMarkup(
      <CompassSummaryBlock
        summary={buildSummary({ upcomingActions: [], upcomingActionCount: 0 })}
        loading={false}
        error={null}
        period="7d"
        onPeriodChange={NOOP}
        onRetry={NOOP}
      />
    )
    expect(html).toContain("48시간 내 예정된 액션 없음")
  })
})

describe("CompassSummaryBlock down 강등", () => {
  it("summary.down이 true면 숫자를 전부 걷어내고 '연결 끊김 · 다시 확인' 한 줄만 남긴다", () => {
    const html = renderToStaticMarkup(
      <CompassSummaryBlock summary={buildSummary({ down: true })} loading={false} error={null} period="7d" onPeriodChange={NOOP} onRetry={NOOP} />
    )
    expect(html).toContain("Compass 연결 끊김")
    expect(html).toContain("다시 확인")
    expect(html).not.toContain("메타 광고 유입")
    expect(html).not.toContain("BD인계 진행")
    expect(html).not.toContain("신규유입")
    expect(html).not.toContain(">418<")
    expect(html).not.toContain("클래스인학원")
  })

  it("데이터 없이 조회 자체가 실패해도(down 계약: !data && error) 같은 방식으로 강등한다", () => {
    const html = renderToStaticMarkup(
      <CompassSummaryBlock summary={null} loading={false} error="network error" period="7d" onPeriodChange={NOOP} onRetry={NOOP} />
    )
    expect(html).toContain("Compass 연결 끊김")
    expect(html).not.toContain("메타 광고 유입")
  })

  it("로딩 중(cold)이면 숫자 대신 스켈레톤을 그린다", () => {
    const html = renderToStaticMarkup(
      <CompassSummaryBlock summary={null} loading={true} error={null} period="7d" onPeriodChange={NOOP} onRetry={NOOP} />
    )
    expect(html).toContain("animate-pulse")
    expect(html).not.toContain("메타 광고 유입")
    expect(html).not.toContain("Compass 연결 끊김")
  })
})

describe("CompassSummaryBlock 기간 칩", () => {
  it("COMPASS_SUMMARY_PERIODS 3개를 렌더하고 현재 기간만 aria-pressed=true", () => {
    const html = renderToStaticMarkup(
      <CompassSummaryBlock summary={buildSummary()} loading={false} error={null} period="30d" onPeriodChange={NOOP} onRetry={NOOP} />
    )
    const chip = (label: string) => {
      const match = new RegExp(`<button([^>]*)>${label}</button>`).exec(html)
      if (!match) throw new Error(`기간 칩을 찾지 못했다: ${label}`)
      return match[1]
    }
    expect(chip("7일")).toContain('aria-pressed="false"')
    expect(chip("30일")).toContain('aria-pressed="true"')
    expect(chip("90일")).toContain('aria-pressed="false"')
    // 44px 터치 타깃(min-h-11).
    expect(chip("30일")).toContain("min-h-11")
  })

  it("기본 기간은 7d다(COMPASS_SUMMARY_DEFAULT_PERIOD)", () => {
    const html = renderToStaticMarkup(
      <CompassPipelineBand data={null} loading={false} error={null} onRetry={NOOP} />
    )
    const match = new RegExp(`<button([^>]*)>7일</button>`).exec(html)
    expect(match?.[1]).toContain('aria-pressed="true"')
  })
})

describe("formatActionEta", () => {
  it("같은 날 몇 시간 이내면 'N시간 후'", () => {
    expect(formatActionEta(new Date(NOW + 2 * 60 * 60 * 1000).toISOString(), NOW)).toBe("2시간 후")
  })

  it("같은 날 1시간 미만이면 'N분 후'", () => {
    expect(formatActionEta(new Date(NOW + 20 * 60 * 1000).toISOString(), NOW)).toBe("20분 후")
  })

  it("KST 다음 날이면 '내일 HH:MM'", () => {
    // NOW = 2026-09-20 12:00 KST. 2026-09-21T01:00:00Z = 2026-09-21 10:00 KST(내일).
    const tomorrowTenAmKst = Date.parse("2026-09-21T01:00:00.000Z")
    expect(formatActionEta(new Date(tomorrowTenAmKst).toISOString(), NOW)).toBe("내일 10:00")
  })

  it("nextActionAt이 없으면 '시간 미정'", () => {
    expect(formatActionEta(null, NOW)).toBe("시간 미정")
  })

  it("이미 지난 시각이면 '지남'으로 표기한다(0으로 위장하지 않음)", () => {
    expect(formatActionEta(new Date(NOW - 30 * 60 * 1000).toISOString(), NOW)).toBe("30분 지남")
  })
})

describe("CompassPipelineBand 콜드 렌더 — 기존 3숫자 계약 유지", () => {
  it("data=null·loading=true에서도 기존 라벨 3개가 깨지지 않고, 요약 블록은 로딩 스켈레톤을 보인다", () => {
    const html = renderToStaticMarkup(<CompassPipelineBand data={null} loading={true} error={null} onRetry={NOOP} />)
    expect(html).toContain("오늘 데모")
    expect(html).toContain("다음 액션 임박")
    expect(html).toContain("BD인계 진행")
    expect(html).toContain("마케팅 파이프라인(Compass)")
    expect(html).toContain("animate-pulse")
  })

  it("compass-pipeline이 down이어도 렌더가 깨지지 않는다(요약 블록은 별도 상태)", () => {
    const html = renderToStaticMarkup(
      <CompassPipelineBand data={{ down: true, todayDemoCount: 0, upcomingActionCount: 0, bdOpenCount: 0, generatedAt: "" }} loading={false} error={null} onRetry={NOOP} />
    )
    expect(html).toContain("Compass 연결 끊김")
  })
})
