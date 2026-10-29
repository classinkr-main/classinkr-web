/**
 * korea-holiday-dates — 기간 안의 한국 공휴일 날짜 집합.
 *
 * `lib/korea-holidays.ts` 는 월 단위로 구글 공개 공휴일 캘린더를 읽는다. 화면이 필요한 것은
 * "이 기간에 쉬는 날이 언제인가" 하나라, 월 열거와 실패 흡수를 여기 한 곳에 모은다.
 *
 * 두 원천을 합친다.
 *   ① 법정 공휴일 고정 목록(`lib/korea-public-holidays.ts`) — 하한선. 운영 방침이 "공휴일은
 *      쉰다"라, 구글 원천이 비어도 설·추석은 막혀야 한다.
 *   ② 구글 공개 공휴일 캘린더 — 그 위에 더한다. 임시공휴일처럼 짧은 예고로 생기는 날과,
 *      고정 목록이 아직 담지 못한 해를 채운다.
 *
 * ②의 실패 방향은 여전히 "덜 막는" 쪽이다 — 원천이 늦거나 서비스 계정 자격이 없으면 그
 * 몫만 빠진다. 원천 장애로 달력을 통째로 닫으면 멀쩡한 리드를 잃는다. 다만 이제 빠지는 것은
 * 임시공휴일뿐이다(docs/active/contact-showroom-checkout-develop-round2-2026-09-20.md §3-2 S9).
 */

import "server-only"

import { getKoreaHolidayEvents } from "@/lib/korea-holidays"
import {
  KOREA_PUBLIC_HOLIDAYS_COVERED_THROUGH,
  koreaPublicHolidayDatesBetween,
} from "@/lib/korea-public-holidays"

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

/** 고정 목록 만료 경고는 인스턴스당 한 번만 — 요청마다 찍으면 로그가 묻힌다. */
let warnedPastCoverage = false

/**
 * 기간 안의 공휴일 날짜(`YYYY-MM-DD`) 집합.
 *
 * 고정 목록을 먼저 담고 구글 값을 더한다. 구글 월별 조회는 `allSettled` 로 모아, 실패한
 * 달은 건너뛰고 나머지를 살린다. 한 달이 늦다고 전체를 떨어뜨리면 읽을 수 있었던 공휴일까지
 * 잃는다.
 */
export async function loadKoreaHolidayDates(
  fromIso: string,
  toIso: string
): Promise<Set<string>> {
  const holidays = new Set<string>(koreaPublicHolidayDatesBetween(fromIso, toIso))

  if (toIso > KOREA_PUBLIC_HOLIDAYS_COVERED_THROUGH && !warnedPastCoverage) {
    warnedPastCoverage = true
    console.warn(
      `[korea-holiday-dates] 공휴일 고정 목록이 ${KOREA_PUBLIC_HOLIDAYS_COVERED_THROUGH}까지뿐입니다 — 그 뒤 공휴일은 구글 원천에만 의존합니다. lib/korea-public-holidays.ts 에 다음 해 월력요항을 더하세요`
    )
  }

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
