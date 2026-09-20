/**
 * korea-holiday-dates — 기간 안의 한국 공휴일 날짜 집합.
 *
 * `lib/korea-holidays.ts` 는 월 단위로 구글 공개 공휴일 캘린더를 읽는다. 화면이 필요한 것은
 * "이 기간에 쉬는 날이 언제인가" 하나라, 월 열거와 실패 흡수를 여기 한 곳에 모은다.
 *
 * 실패 방향은 "덜 막는" 쪽이다 — 원천이 늦거나 서비스 계정 자격이 없으면 빈 집합으로
 * 떨어져 공휴일이 선택 가능일로 열린다. 원천 장애로 달력을 통째로 닫으면 멀쩡한 리드를
 * 잃기 때문인데, 그 대가로 **자격 미설정 상태에서는 연휴가 열린다**. 이 모듈을 쓰는 화면은
 * 운영 환경에 `GOOGLE_SERVICE_ACCOUNT_EMAIL`·`GOOGLE_PRIVATE_KEY` 가 설정돼 있다는 전제를
 * 갖는다(docs/active/contact-showroom-checkout-develop-round2-2026-09-20.md §3-2 S9).
 */

import "server-only"

import { getKoreaHolidayEvents } from "@/lib/korea-holidays"

/** 한 번에 훑는 최대 개월 수. 구매 희망일(+180일)이 7개월이라 넉넉히 둔다. */
const MAX_MONTHS = 24

/**
 * `YYYY-MM-DD` 두 개가 걸치는 연·월 목록.
 *
 * 날짜 산술이 아니라 연·월 증가라 ISO 파싱 유틸이 필요 없다 — 이 모듈이 다른 date 모듈에
 * 의존하지 않게 하려는 의도적인 선택이다.
 */
export function monthsBetween(
  fromIso: string,
  toIso: string
): Array<{ year: number; month: number }> {
  const [fromYear, fromMonth] = fromIso.slice(0, 7).split("-").map(Number)
  const [toYear, toMonth] = toIso.slice(0, 7).split("-").map(Number)

  if (!Number.isFinite(fromYear) || !Number.isFinite(fromMonth)) return []
  if (!Number.isFinite(toYear) || !Number.isFinite(toMonth)) return []

  const months: Array<{ year: number; month: number }> = []
  let year = fromYear
  let month = fromMonth

  while (
    (year < toYear || (year === toYear && month <= toMonth)) &&
    months.length < MAX_MONTHS
  ) {
    months.push({ year, month })
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }

  return months
}

/**
 * 기간 안의 공휴일 날짜(`YYYY-MM-DD`) 집합.
 *
 * 월별 조회를 `allSettled` 로 모아, 실패한 달은 건너뛰고 나머지를 살린다. 한 달이 늦다고
 * 전체를 빈 집합으로 떨어뜨리면 읽을 수 있었던 공휴일까지 잃는다.
 */
export async function loadKoreaHolidayDates(
  fromIso: string,
  toIso: string
): Promise<Set<string>> {
  const holidays = new Set<string>()

  const results = await Promise.allSettled(
    monthsBetween(fromIso, toIso).map((month) => getKoreaHolidayEvents(month))
  )

  for (const result of results) {
    if (result.status !== "fulfilled") continue
    for (const event of result.value) {
      if (event.date) holidays.add(event.date)
    }
  }

  return holidays
}
