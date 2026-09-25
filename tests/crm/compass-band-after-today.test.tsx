import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  CompassSummaryBlock,
  filterActionsAfterToday,
  kstTodayEndMs,
  summarizeActionsAfterToday,
} from "@/components/admin/compass/CompassPipelineBand"
import type { CompassSummary, CompassSummaryActionRow } from "@/lib/compass/summary-contract"

// C안 ①(2026-09-25) — CRM 홈 Compass 밴드의 임박 액션 목록은 "오늘 끝 이후"만 보인다.
// 오늘·지난 Compass 다음 액션은 "오늘 연락" 목록이 흡수하므로 같은 행동을 두 곳에 두지 않는다(플레이북 04 §3).
// 기본값(actionsAfterToday 없음)은 기존 동작 그대로 — tests/crm/compass-pipeline-band.test.tsx 가 지킨다.

const NOW = Date.parse("2026-09-25T03:00:00.000Z") // 2026-09-25 12:00 KST

function action(id: number, nextActionAt: string | null): CompassSummaryActionRow {
  return {
    compassLeadId: id,
    academy: `학원${id}`,
    name: null,
    stage: "consult",
    nextAction: "재통화",
    nextActionAt,
    owner: "박영업",
    caller: null,
    url: `https://mkt.classin.co.kr/leads/${id}`,
  }
}

function summary(upcomingActions: CompassSummaryActionRow[]): CompassSummary {
  return {
    period: { key: "7d", since: "2026-09-18T00:00:00.000Z", until: "2026-09-25T03:00:00.000Z" },
    generatedAt: "2026-09-25T02:59:00.000Z",
    down: false,
    truncated: false,
    inflowTotal: 0,
    byPlatform: [],
    metaInflow: 0,
    stages: [],
    lost: 0,
    neoRegistered: 0,
    won: 0,
    careStages: [],
    bdOpen: 0,
    todayDemoCount: 0,
    byOwner: [],
    lostReasons: [],
    upcomingActions,
    upcomingActionCount: upcomingActions.length,
  }
}

const TODAY_LATER = action(1, "2026-09-25T08:00:00.000Z") // 오늘 17:00 KST
const PAST = action(2, "2026-09-25T01:00:00.000Z") // 오늘 10:00 KST(지남)
const TOMORROW = action(3, "2026-09-26T01:00:00.000Z") // 내일 10:00 KST
const NO_TIME = action(4, null)

describe("Compass 밴드 — 임박 목록은 오늘 끝 이후만(CRM 홈)", () => {
  it("KST 오늘 끝 = 내일 00:00 KST", () => {
    expect(new Date(kstTodayEndMs(NOW)).toISOString()).toBe("2026-09-25T15:00:00.000Z")
  })

  it("오늘·지난·시각 없음은 빼고 내일 이후만 남긴다", () => {
    expect(filterActionsAfterToday([TODAY_LATER, PAST, TOMORROW, NO_TIME], NOW).map((row) => row.compassLeadId)).toEqual([3])
  })

  it("actionsAfterToday 면 목록 머리·안내가 바뀌고 오늘 몫은 '오늘 연락'으로 보낸다", () => {
    const html = renderToStaticMarkup(
      <CompassSummaryBlock
        summary={summary([TODAY_LATER, PAST, TOMORROW])}
        loading={false}
        error={null}
        period="7d"
        onPeriodChange={() => {}}
        onRetry={() => {}}
        nowMs={NOW}
        actionsAfterToday
      />
    )
    expect(html).toContain("다음 액션 · 내일 이후 1건")
    // CRM 홈에서 "오늘 연락" 패널은 밴드 아래에 있다(리뷰 [27] — '위'는 실제 배치와 반대였다).
    expect(html).toContain("오늘·지난 다음 액션은 아래 ‘오늘 연락’에 있습니다.")
    expect(html).not.toContain("위 ‘오늘 연락’")
    expect(html).toContain("학원3")
    expect(html).not.toContain("학원1")
    expect(html).not.toContain("학원2")
  })

  describe("서버가 자른 상위 8건 위에서 거르면 생기는 거짓 '없음'(리뷰 P1)", () => {
    // 09:00 KST — 오늘 10:00~19:00 에 10건, 내일 5건. 서버는 오름차순 상위 8건만 싣는다(전부 오늘).
    const AT_0900 = Date.parse("2026-09-25T00:00:00.000Z")
    const todayTen = Array.from({ length: 10 }, (_, i) =>
      action(100 + i, new Date(Date.parse("2026-09-25T01:00:00.000Z") + i * 3_600_000).toISOString())
    )
    const tomorrowFive = Array.from({ length: 5 }, (_, i) =>
      action(200 + i, new Date(Date.parse("2026-09-26T01:00:00.000Z") + i * 3_600_000).toISOString())
    )
    const all = [...todayTen, ...tomorrowFive]

    function truncatedSummary(received: CompassSummaryActionRow[], total: number): CompassSummary {
      return { ...summary(received), upcomingActionCount: total }
    }

    it("받은 8건이 모두 오늘이면 내일 이후 건수는 모름(null) — 0 이 아니다", () => {
      const view = summarizeActionsAfterToday(all.slice(0, 8), all.length, AT_0900)
      expect(view.rows).toEqual([])
      expect(view.count).toBeNull()
      expect(view.beyondLimit).toBe(7)
    })

    it("받은 것 중 가장 늦은 액션이 오늘 끝 이후면 잘린 나머지도 전부 내일 이후 — 정확한 건수", () => {
      // 오늘 6건 + 내일 5건 → 상위 8 = 오늘 6 + 내일 2, 잘린 3건은 내일
      const mixed = [...todayTen.slice(0, 6), ...tomorrowFive]
      const view = summarizeActionsAfterToday(mixed.slice(0, 8), mixed.length, AT_0900)
      expect(view.rows.map((row) => row.compassLeadId)).toEqual([200, 201])
      expect(view.count).toBe(5)
    })

    it("잘리지 않았으면 거른 결과가 그대로 건수", () => {
      const view = summarizeActionsAfterToday([TODAY_LATER, TOMORROW], 2, NOW)
      expect(view.count).toBe(1)
      expect(view.beyondLimit).toBe(0)
    })

    it("모름이면 '없음' 대신 셀 수 없다고 밝히고 Compass 로 보낸다", () => {
      const html = renderToStaticMarkup(
        <CompassSummaryBlock
          summary={truncatedSummary(all.slice(0, 8), all.length)}
          loading={false}
          error={null}
          period="7d"
          onPeriodChange={() => {}}
          onRetry={() => {}}
          nowMs={AT_0900}
          actionsAfterToday
        />
      )
      expect(html).toContain("다음 액션 · 내일 이후 건수 확인 필요")
      expect(html).toContain("받은 상위 8건이 모두 오늘까지의 액션입니다")
      expect(html).toContain("없는 것이 아닙니다")
      expect(html).not.toContain("내일 이후 0건")
      expect(html).not.toContain("예정된 액션 없음")
      expect(html).toContain('href="https://mkt.classin.co.kr/leads?sort=next_action_at"')
    })

    it("정확한 건수가 받은 행보다 크면 머리에 전체·상위를, 아래에 나머지 안내를 단다", () => {
      const mixed = [...todayTen.slice(0, 6), ...tomorrowFive]
      const html = renderToStaticMarkup(
        <CompassSummaryBlock
          summary={truncatedSummary(mixed.slice(0, 8), mixed.length)}
          loading={false}
          error={null}
          period="7d"
          onPeriodChange={() => {}}
          onRetry={() => {}}
          nowMs={AT_0900}
          actionsAfterToday
        />
      )
      expect(html).toContain("다음 액션 · 내일 이후 5건 · 상위 2")
      expect(html).toContain("내일 이후 나머지 3건은 이 목록에 없습니다")
      expect(html).toContain("학원200")
      expect(html).not.toContain("학원100")
    })
  })

  it("기본값은 기존 동작(오늘 것도 보인다)", () => {
    const html = renderToStaticMarkup(
      <CompassSummaryBlock
        summary={summary([TODAY_LATER, TOMORROW])}
        loading={false}
        error={null}
        period="7d"
        onPeriodChange={() => {}}
        onRetry={() => {}}
        nowMs={NOW}
      />
    )
    expect(html).toContain("학원1")
    expect(html).toContain("다음 액션 임박 2건")
  })

  it("CRM 홈이 밴드에 actionsAfterToday 를, 주간 패널에 지연·오늘 숨김을 넘긴다", () => {
    const home = readFileSync(join(process.cwd(), "components/admin/crm/home/CrmHomeClient.tsx"), "utf8")
    expect(home).toMatch(/<CompassPipelineBand[\s\S]*?actionsAfterToday[\s\S]*?\/>/)
    expect(home).toContain('const HOME_WEEK_AHEAD_HIDDEN_BUCKETS: WeekAheadBucket[] = ["overdue", "today"]')
    // 숨김은 "오늘 연락"이 그 할 일을 다 담았을 때만(잘림·할 일 원천 실패·담당 필터면 다시 보인다 — 도달성 불변).
    expect(home).toContain("hideBuckets={todayCoversTasks ? HOME_WEEK_AHEAD_HIDDEN_BUCKETS : undefined}")
  })

  it("밴드의 오늘 몫 숨김도 '오늘 연락'이 실제로 담았을 때만 — 무조건 켜지 않는다(리뷰 [4]·[27])", () => {
    const home = readFileSync(join(process.cwd(), "components/admin/crm/home/CrmHomeClient.tsx"), "utf8")
    // 담당 필터·Compass 끊김/일부 실패·잘림·목록 실패면 패널이 false 를 알린다(todayContactsCoverCompassActions).
    expect(home).toMatch(/<CompassPipelineBand[\s\S]*?actionsAfterToday=\{todayCoversCompass\}[\s\S]*?\/>/)
    expect(home).not.toMatch(/^\s*actionsAfterToday\s*$/m)
    expect(home).toContain("onCompassCoverageChange={setTodayCoversCompass}")
    // 첫 응답 전에는 숨김(주간 패널과 같게 — 나타났다 사라지는 깜빡임 방지)
    expect(home).toContain("const [todayCoversCompass, setTodayCoversCompass] = useState(true)")
    // 밴드가 "오늘 연락"보다 먼저(위) 그려진다 — 안내 문구 '아래'의 근거
    expect(home.indexOf("<CompassPipelineBand")).toBeLessThan(home.indexOf("<CrmTodayContactsPanel"))
  })

  it("덮지 못하면(actionsAfterToday=false) 오늘·지난 액션을 그대로 보이고 '오늘 연락으로 보낸다'는 안내를 달지 않는다", () => {
    const html = renderToStaticMarkup(
      <CompassSummaryBlock
        summary={summary([TODAY_LATER, PAST, TOMORROW])}
        loading={false}
        error={null}
        period="7d"
        onPeriodChange={() => {}}
        onRetry={() => {}}
        nowMs={NOW}
        actionsAfterToday={false}
      />
    )
    expect(html).toContain("학원1")
    expect(html).toContain("학원2")
    expect(html).toContain("학원3")
    expect(html).not.toContain("‘오늘 연락’에 있습니다")
  })
})
