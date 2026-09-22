/**
 * korea-public-holidays — 법정 공휴일 고정 목록(하한선).
 *
 * 운영 방침(2026-09-22): 쇼룸과 설치는 공휴일에 쉰다.
 *
 * 공휴일 원천은 구글 공개 공휴일 캘린더(`lib/korea-holidays.ts`)인데, 서비스 계정 자격이
 * 없거나 원천이 늦으면 빈 값으로 떨어진다 — 어드민 캘린더 화면 전체를 막지 않으려는 규약이다.
 * 그 규약이 예약 화면에도 그대로 적용돼, 자격이 없는 환경에서는 설·추석이 예약 가능일로
 * 열렸다. 방침이 "쉰다"인 이상 원천 상태와 무관하게 막혀야 하므로, 법정 공휴일은 이 목록을
 * 하한선으로 두고 구글 값은 그 위에 더한다(`lib/korea-holiday-dates.ts`). 구글이 더해 주는
 * 것은 임시공휴일처럼 짧은 예고로 생기는 날이다.
 *
 * 출처: 「월력요항」(우주항공청·한국천문연구원, 2026년판·2027년판)과 「관공서의 공휴일에
 * 관한 규정」 개정(대통령령 제36290호, 2026-05-11 시행 — 노동절·제헌절 공휴일 지정, 두 날
 * 모두 대체공휴일 적용).
 *
 * 대조값(일요일 포함, 일요일과 겹친 공휴일은 한 번만 센다):
 *   - 2026년 72일 — 2026년 월력요항(2025년 발표) 70일 + 노동절·제헌절
 *   - 2027년 72일 — 2027년 월력요항(2026년 발표)
 * 이 목록으로 같은 수가 나오는지 `tests/lib/korea-public-holidays.test.ts` 가 확인한다.
 *
 * ## 갱신
 *
 * 다음 해 월력요항은 매년 6월 무렵 발표된다. 발표되면 한 해치를 더하고
 * `KOREA_PUBLIC_HOLIDAYS_COVERED_THROUGH` 를 옮긴다. 목록이 구매 희망일 창(오늘 +180일)보다
 * 짧아지면 위 테스트가 실패하고, 운영에서는 `loadKoreaHolidayDates` 가 경고를 남긴다.
 */

export interface KoreaPublicHoliday {
  /** `YYYY-MM-DD` (KST 달력 날짜) */
  date: string
  name: string
}

/** 이 목록이 빠짐없이 담고 있는 마지막 날짜. 이 뒤는 구글 원천에만 의존한다. */
export const KOREA_PUBLIC_HOLIDAYS_COVERED_THROUGH = "2027-12-31"

export const KOREA_PUBLIC_HOLIDAYS: readonly KoreaPublicHoliday[] = [
  // ── 2026 ──
  { date: "2026-01-01", name: "신정" },
  { date: "2026-02-16", name: "설날 연휴" },
  { date: "2026-02-17", name: "설날" },
  { date: "2026-02-18", name: "설날 연휴" },
  { date: "2026-03-01", name: "삼일절" },
  { date: "2026-03-02", name: "대체공휴일(삼일절)" },
  { date: "2026-05-01", name: "노동절" },
  { date: "2026-05-05", name: "어린이날" },
  { date: "2026-05-24", name: "부처님오신날" },
  { date: "2026-05-25", name: "대체공휴일(부처님오신날)" },
  { date: "2026-06-03", name: "전국동시지방선거" },
  { date: "2026-06-06", name: "현충일" },
  { date: "2026-07-17", name: "제헌절" },
  { date: "2026-08-15", name: "광복절" },
  { date: "2026-08-17", name: "대체공휴일(광복절)" },
  { date: "2026-09-24", name: "추석 연휴" },
  { date: "2026-09-25", name: "추석" },
  // 토요일이지만 설·추석은 일요일·공휴일과 겹칠 때만 대체공휴일이 생긴다.
  { date: "2026-09-26", name: "추석 연휴" },
  { date: "2026-10-03", name: "개천절" },
  { date: "2026-10-05", name: "대체공휴일(개천절)" },
  { date: "2026-10-09", name: "한글날" },
  { date: "2026-12-25", name: "성탄절" },

  // ── 2027 ──
  { date: "2027-01-01", name: "신정" },
  { date: "2027-02-06", name: "설날 연휴" },
  { date: "2027-02-07", name: "설날" },
  { date: "2027-02-08", name: "설날 연휴" },
  { date: "2027-02-09", name: "대체공휴일(설날)" },
  { date: "2027-03-01", name: "삼일절" },
  { date: "2027-05-01", name: "노동절" },
  { date: "2027-05-03", name: "대체공휴일(노동절)" },
  { date: "2027-05-05", name: "어린이날" },
  { date: "2027-05-13", name: "부처님오신날" },
  // 현충일은 대체공휴일 대상이 아니다.
  { date: "2027-06-06", name: "현충일" },
  { date: "2027-07-17", name: "제헌절" },
  { date: "2027-07-19", name: "대체공휴일(제헌절)" },
  { date: "2027-08-15", name: "광복절" },
  { date: "2027-08-16", name: "대체공휴일(광복절)" },
  { date: "2027-09-14", name: "추석 연휴" },
  { date: "2027-09-15", name: "추석" },
  { date: "2027-09-16", name: "추석 연휴" },
  { date: "2027-10-03", name: "개천절" },
  { date: "2027-10-04", name: "대체공휴일(개천절)" },
  { date: "2027-10-09", name: "한글날" },
  { date: "2027-10-11", name: "대체공휴일(한글날)" },
  { date: "2027-12-25", name: "성탄절" },
  { date: "2027-12-27", name: "대체공휴일(성탄절)" },
]

/** 기간(양 끝 포함) 안의 법정 공휴일 날짜. `YYYY-MM-DD` 는 문자열 비교가 곧 날짜 비교다. */
export function koreaPublicHolidayDatesBetween(fromIso: string, toIso: string): string[] {
  return KOREA_PUBLIC_HOLIDAYS.filter(
    (holiday) => holiday.date >= fromIso && holiday.date <= toIso
  ).map((holiday) => holiday.date)
}
