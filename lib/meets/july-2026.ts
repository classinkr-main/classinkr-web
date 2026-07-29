/**
 * july-2026.ts — "Classin Meets · 2026년 7월" 설명회의 **신청 가능한** 도시 SSOT.
 *
 * 랜딩(public/l/meets-july/index.html)과 신청 API, 참석 명단 시트 writer 가
 * 같은 값을 보게 하는 단일 진실원이다. 화면 문구는 랜딩 HTML 이 소유하고,
 * 여기서는 서버가 판정·기록에 쓰는 값(도시 키·날짜·장소·시트 탭)만 고정한다.
 *
 * 이미 끝난 도시(청주·창원)는 **일부러 넣지 않는다**. 이 모듈은 "지금 접수 가능한
 * 집합"이고, API 는 여기에 없는 값을 전부 400 으로 거절한다. 지난 회차를 여기에
 * 되살리면 종료된 행사에 신청이 들어오고 명단 시트도 오염된다.
 *
 * server-only 를 붙이지 않는다(순수 상수·순수 함수, 테스트에서 직접 검증).
 */

/** 참석 명단 스프레드시트 "[KR] 설명회 참석 명단" */
const DEFAULT_MEETS_ATTENDEE_SHEET_ID = "1AAp7LJEaqm4O4YbILct8e_YABf8SEMhMURTXnUstvmc"

/**
 * 실제 쓰기 대상 스프레드시트 id. 스테이징/리허설에서 다른 파일로 돌리려면
 * MEETS_ATTENDEE_SHEET_ID 를 설정한다.
 *
 * 상수(MEETS_ATTENDEE_SHEET_ID)는 모듈 로드 시점에 한 번 굳으므로, 런타임에
 * 주입되는 env 까지 반영해야 하는 writer 는 항상 getMeetsAttendeeSheetId() 를 쓴다.
 */
export function getMeetsAttendeeSheetId(): string {
  return process.env.MEETS_ATTENDEE_SHEET_ID?.trim() || DEFAULT_MEETS_ATTENDEE_SHEET_ID
}

export const MEETS_ATTENDEE_SHEET_ID = getMeetsAttendeeSheetId()

/** 신청 가능한 도시 키 — 랜딩의 data-city / name="city" 값과 1:1 이다. */
export type MeetsCityKey = "jeonju" | "gwangju"

export interface MeetsCityConfig {
  key: MeetsCityKey
  /** 명단 시트 '지역' 열에 그대로 들어가는 한글 도시명 */
  name: string
  nameEn: string
  /** 행사일(KST 기준 달력 날짜) */
  date: string
  /** 요일 한 글자 — 화면 라벨 조합용 */
  weekday: string
  /** 24시간 표기 시작 시각 */
  time: string
  /** 사람이 읽는 시각 라벨(랜딩 문구와 동일) */
  timeLabel: string
  venue: string
  address: string
  /** 참석 명단 스프레드시트의 탭 제목 — 마침표·공백 포함, A1 표기에서 따옴표 필수 */
  sheetTabTitle: string
  /** 탭 gid — 운영자가 링크로 바로 열 때 쓴다 */
  sheetGid: number
  /** CRM(leads.notes 이벤트 토큰)에 남기는 도시별 슬러그 */
  leadEventSlug: string
}

export const MEETS_JULY_2026_CITIES: Record<MeetsCityKey, MeetsCityConfig> = {
  jeonju: {
    key: "jeonju",
    name: "전주",
    nameEn: "Jeonju",
    date: "2026-07-30",
    weekday: "목",
    time: "11:00",
    timeLabel: "오전 11시",
    venue: "전주소통협력센터",
    address: "전북 전주시 완산구 홍산로 276",
    sheetTabTitle: "15. 전주",
    sheetGid: 369696773,
    leadEventSlug: "meets-july-jeonju",
  },
  gwangju: {
    key: "gwangju",
    name: "광주",
    nameEn: "Gwangju",
    date: "2026-07-31",
    weekday: "금",
    time: "11:00",
    timeLabel: "오전 11시",
    venue: "벼리다 국어학원",
    address: "광주 서구 군분로179번길 13-8",
    sheetTabTitle: "16. 광주",
    sheetGid: 2077238552,
    leadEventSlug: "meets-july-gwangju",
  },
}

export const MEETS_JULY_2026_CITY_KEYS = Object.keys(MEETS_JULY_2026_CITIES) as MeetsCityKey[]

/** 신청 가능한 도시 키인지 — 좁히기(type guard) 용도 */
export function isMeetsCityKey(value: unknown): value is MeetsCityKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MEETS_JULY_2026_CITIES, value)
}

/**
 * 클라이언트가 보낸 임의 값을 도시 키로 파싱한다. 모르는 값은 null —
 * 호출부는 반드시 null 을 400 으로 되돌려야 한다(기본값으로 흘려보내지 말 것).
 */
export function parseMeetsCityKey(value: unknown): MeetsCityKey | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  return isMeetsCityKey(normalized) ? normalized : null
}

/** 파싱 + 조회를 한 번에. 모르는 도시는 null. */
export function getMeetsCity(value: unknown): MeetsCityConfig | null {
  const key = parseMeetsCityKey(value)
  return key ? MEETS_JULY_2026_CITIES[key] : null
}

/** "전주 · 7월 30일(목) 오전 11시 · 전주소통협력센터" — 알림/리드 메시지용 한 줄 라벨 */
export function formatMeetsCityLabel(city: MeetsCityConfig): string {
  const [, month, day] = city.date.split("-")
  return `${city.name} · ${Number(month)}월 ${Number(day)}일(${city.weekday}) ${city.timeLabel} · ${city.venue}`
}
