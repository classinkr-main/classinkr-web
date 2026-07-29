/**
 * attendee-sheet.ts — "[KR] 설명회 참석 명단" 스프레드시트에 신청자 1행을 덧붙이는 writer.
 *
 * ── 왜 헤더 이름으로 매핑하는가 ────────────────────────────────────────────
 * 이 스프레드시트의 도시 탭들은 **열 구성이 서로 다르다**. 예를 들어 `14. 창원` 은
 * 13열이고 `D-3 문자` 열이 아예 없다. 그래서 인덱스를 상수로 박으면 탭 하나만 바뀌어도
 * 전화번호가 '직책' 칸에 들어가는 식으로 조용히 어긋난다. 쓰기 시점에 3행(헤더)을 읽고
 * **헤더 이름으로** 값을 배치하며, 값을 담아야 하는 헤더가 없으면 쓰지 않고 던진다.
 *
 * ── 탭 레이아웃(전주/광주 확인 기준) ──────────────────────────────────────
 *   1행: 비율 수식(=H2/G2 등)
 *   2행: 집계 수식(=COUNTA(A4:A), =SUM(G4:G) …) — 전부 열린 범위라 아래로 덧붙이면 자동 확장
 *   3행: 헤더
 *   4행~: 데이터
 * append 범위를 3행(헤더)에 앵커링한다. A열 1행부터 잡으면 1~2행 수식 프리앰블과
 * 데이터가 하나의 연속 블록이라는 우연에 기대게 된다 — 헤더를 표의 시작으로 못박아야
 * 마지막 데이터 행 바로 아래에 들어가는 것이 보장된다.
 *
 * ── 왜 valueInputOption: "RAW" 인가 ───────────────────────────────────────
 * "USER_ENTERED" 는 Sheets 가 셀 값을 사용자 입력처럼 파싱한다. `01012345678` 같은
 * 순수 숫자열은 수로 해석돼 **앞의 0 이 사라진다**(1012345678). 명단의 연락처는 항상
 * 텍스트여야 하므로 파싱 자체를 끄는 RAW 를 쓴다. 하이픈 형태로 정규화하는 것과
 * RAW 두 겹으로 막는다 — 정규화가 실패해 숫자열이 그대로 남는 경우가 있어서다.
 */

import "server-only"

import { formatBusinessDateTimeLabel } from "@/lib/business-time"
import { sheets } from "@/lib/google"
import {
  getMeetsAttendeeSheetId,
  MEETS_JULY_2026_CITIES,
  type MeetsCityConfig,
  type MeetsCityKey,
} from "@/lib/meets/july-2026"

/* ── 헤더 계약 ──────────────────────────────────────────────────────────── */

/**
 * 값을 실제로 담는 헤더. 이 중 하나라도 대상 탭에 없으면 데이터가 유실되므로 던진다.
 */
export const REQUIRED_MEETS_HEADERS = [
  "지역",
  "기관",
  "성명",
  "직책",
  "연락처",
  "유입경로",
  "구매확률",
  "비고",
] as const

/**
 * 운영자가 나중에 채우는 빈 칸. 탭에 없어도 유실되는 데이터가 없으므로
 * (헤더 이름으로 배치하니 어긋나지도 않는다) 없으면 그냥 건너뛴다.
 * `14. 창원` 처럼 `D-3 문자` 가 없는 탭도 이 규칙 덕에 그대로 쓸 수 있다.
 */
export const OPTIONAL_MEETS_HEADERS = [
  "연락",
  "초청장전달",
  "참석여부",
  "D-3 문자",
  "D-1 전화",
  "실제참석",
] as const

/** 랜딩 신청은 전부 같은 유입 경로·구매 확률로 들어간다(운영자가 이후 갱신). */
export const MEETS_INFLOW_VALUE = "랜딩"
export const MEETS_PURCHASE_PROBABILITY_VALUE = "10% (Lead)"

/** 헤더가 있는 행 번호(1~2행은 수식 프리앰블). append 범위의 앵커이기도 하다. */
export const MEETS_HEADER_ROW_NUMBER = 3
/** 헤더 읽기 범위의 마지막 열 — 어떤 탭이든 덮도록 넉넉히 잡는다. */
const HEADER_READ_RANGE_LAST_COLUMN = "AZ"

/** 비고 한 줄의 구분자 — 값 안에 잘 나오지 않는 문자를 쓴다. */
const NOTE_SEPARATOR = " · "
const NOTE_MAX_LENGTH = 900

/* ── 입력 타입 ──────────────────────────────────────────────────────────── */

export interface MeetsAttendeeAttribution {
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmTerm?: string | null
  utmContent?: string | null
  gclid?: string | null
  fbclid?: string | null
  landingPage?: string | null
  referrer?: string | null
}

export interface MeetsAttendeeInput {
  city: MeetsCityKey
  name: string
  org: string
  role: string
  phone: string
  email?: string | null
  /** 신청 시각. 생략하면 호출 시점. 테스트는 항상 고정 값을 넣는다. */
  submittedAt?: Date
  attribution?: MeetsAttendeeAttribution | null
}

export interface AppendMeetsAttendeeResult {
  /** Sheets 가 돌려준 실제 기록 범위 — 로그로 남겨 수기 대조에 쓴다. */
  appendedRange: string
  spreadsheetId: string
  sheetTabTitle: string
}

/* ── 전화번호 정규화 ────────────────────────────────────────────────────── */

/**
 * 한국 전화번호를 하이픈 표기 문자열로 정규화한다.
 *  - `01012345678`        → `010-1234-5678`
 *  - `010-1234-5678`      → 그대로
 *  - `+82 10-1234-5678`   → `010-1234-5678` (82 접두 → 국내 0 접두)
 *  - `8201012345678`      → `010-1234-5678` (82 + 0 중복도 흡수)
 * 아는 형태가 아니면 **원문을 다듬어 그대로** 돌려준다(멋대로 자르지 않는다).
 * 반환값은 항상 문자열이고, 앞의 0 을 보존한다.
 */
export function normalizeKoreanPhone(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) return ""

  let digits = trimmed.replace(/\D/g, "")
  if (!digits) return trimmed

  // 국제 표기(+82 / 0082 / 82…) → 국내 0 접두. `82` 뒤에 남는 0 은 중복이라 걷어낸다.
  if (digits.startsWith("0082")) digits = digits.slice(4)
  if (digits.startsWith("82") && digits.length >= 11) {
    digits = `0${digits.slice(2).replace(/^0+/, "")}`
  }

  const grouped = groupKoreanPhoneDigits(digits)
  return grouped ?? trimmed
}

function groupKoreanPhoneDigits(digits: string): string | null {
  // 서울(02)은 국번이 2자리
  if (digits.startsWith("02")) {
    if (digits.length === 10) return `02-${digits.slice(2, 6)}-${digits.slice(6)}`
    if (digits.length === 9) return `02-${digits.slice(2, 5)}-${digits.slice(5)}`
    return null
  }

  if (digits.startsWith("0")) {
    if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  return null
}

/* ── 헤더 유틸 ──────────────────────────────────────────────────────────── */

/** 시트에서 읽은 헤더 셀 정규화 — 이중 공백·NBSP 때문에 매칭이 깨지지 않게. */
function normalizeHeaderCell(value: unknown): string {
  if (typeof value !== "string") return ""
  return value.replace(/[\u00a0\u200b]/g, " ").replace(/\s+/g, " ").trim()
}

function buildHeaderIndex(headerRow: readonly unknown[]): Map<string, number> {
  const index = new Map<string, number>()
  headerRow.forEach((cell, position) => {
    const header = normalizeHeaderCell(cell)
    // 중복 헤더는 첫 번째 열을 쓴다.
    if (header && !index.has(header)) index.set(header, position)
  })
  return index
}

/* ── 비고 한 줄 ─────────────────────────────────────────────────────────── */

const ATTRIBUTION_LABELS: Array<[keyof MeetsAttendeeAttribution, string]> = [
  ["utmSource", "utm_source"],
  ["utmMedium", "utm_medium"],
  ["utmCampaign", "utm_campaign"],
  ["utmTerm", "utm_term"],
  ["utmContent", "utm_content"],
  ["gclid", "gclid"],
  ["fbclid", "fbclid"],
  ["landingPage", "landing"],
  ["referrer", "ref"],
]

/**
 * 비고 셀 한 줄: `신청 2026-07-27 14:32 · a@b.com · utm_source=meta · gclid=…`
 * 비어 있는 조각은 통째로 빠지고, 구분자가 끝에 남지 않는다.
 */
export function buildMeetsAttendeeNote(input: {
  submittedAt?: Date
  email?: string | null
  attribution?: MeetsAttendeeAttribution | null
}): string {
  const submittedAt = input.submittedAt ?? new Date()
  const parts: string[] = [`신청 ${formatBusinessDateTimeLabel(submittedAt.toISOString())}`]

  const email = (input.email ?? "").trim()
  if (email) parts.push(email)

  const attribution = input.attribution ?? {}
  for (const [field, label] of ATTRIBUTION_LABELS) {
    const value = (attribution[field] ?? "").toString().trim()
    if (value) parts.push(`${label}=${value}`)
  }

  return parts.join(NOTE_SEPARATOR).slice(0, NOTE_MAX_LENGTH)
}

/* ── 행 조립(순수 함수 — 여기에는 I/O 가 없다) ──────────────────────────── */

/**
 * 대상 탭의 실제 헤더 행 + 신청 정보 → 그 탭의 열 순서에 맞춘 값 배열.
 * 모르는 헤더 자리는 빈 문자열로 둔다(다른 열을 밀어내지 않는다).
 *
 * 값을 담아야 하는 헤더가 없으면 던진다 — 어긋난 행을 쓰느니 실패하는 게 낫다.
 */
export function buildMeetsAttendeeRow(
  headerRow: readonly unknown[],
  input: MeetsAttendeeInput
): string[] {
  const city = MEETS_JULY_2026_CITIES[input.city]
  if (!city) {
    throw new Error(`알 수 없는 설명회 도시입니다: ${String(input.city)}`)
  }

  const headerIndex = buildHeaderIndex(headerRow)
  const missing = REQUIRED_MEETS_HEADERS.filter((header) => !headerIndex.has(header))
  if (missing.length > 0) {
    throw new Error(
      `참석 명단 탭 '${city.sheetTabTitle}' 에 필수 헤더가 없습니다: ${missing.join(", ")} ` +
        `(읽은 헤더: ${headerRow.map((cell) => normalizeHeaderCell(cell)).filter(Boolean).join(" | ") || "없음"})`
    )
  }

  const valuesByHeader: Record<string, string> = {
    // 운영자가 나중에 배정하는 담당자 칸 — 자동 입력하지 않는다.
    연락: "",
    지역: city.name,
    기관: input.org.trim(),
    성명: input.name.trim(),
    직책: input.role.trim(),
    연락처: normalizeKoreanPhone(input.phone),
    초청장전달: "",
    참석여부: "",
    "D-3 문자": "",
    "D-1 전화": "",
    실제참석: "",
    유입경로: MEETS_INFLOW_VALUE,
    구매확률: MEETS_PURCHASE_PROBABILITY_VALUE,
    비고: buildMeetsAttendeeNote({
      submittedAt: input.submittedAt,
      email: input.email,
      attribution: input.attribution,
    }),
  }

  const row = new Array<string>(headerRow.length).fill("")
  for (const [header, value] of Object.entries(valuesByHeader)) {
    const position = headerIndex.get(header)
    if (position === undefined) continue
    row[position] = value
  }

  return row
}

/* ── A1 표기 ────────────────────────────────────────────────────────────── */

/** 탭 제목을 A1 표기용으로 인용한다. `15. 전주` 처럼 마침표·공백이 있으면 필수. */
export function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`
}

/** 1-based 열 번호 → 열 문자(1 → A, 27 → AA). */
export function toColumnLetter(columnNumber: number): string {
  if (!Number.isInteger(columnNumber) || columnNumber < 1) {
    throw new Error(`열 번호가 올바르지 않습니다: ${columnNumber}`)
  }
  let remaining = columnNumber
  let letter = ""
  while (remaining > 0) {
    const mod = (remaining - 1) % 26
    letter = String.fromCharCode(65 + mod) + letter
    remaining = Math.floor((remaining - mod) / 26)
  }
  return letter
}

/**
 * 헤더 행(3행)에 앵커링한 append 범위 — 마지막 열은 읽어온 헤더 길이에서 뽑는다.
 * `'15. 전주'!A3:N` 형태. A1(=A열 1행)부터 잡으면 1~2행 수식 프리앰블과 데이터가
 * 하나의 연속 블록이라는 우연에 기대게 된다.
 */
export function buildAppendRange(sheetTabTitle: string, headerLength: number): string {
  return `${quoteSheetTitle(sheetTabTitle)}!A${MEETS_HEADER_ROW_NUMBER}:${toColumnLetter(headerLength)}`
}

/* ── I/O ────────────────────────────────────────────────────────────────── */

function assertGoogleCredentials() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error(
      "Google 서비스 계정 자격증명이 없습니다(GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)."
    )
  }
}

/** 대상 탭의 헤더 행(3행)을 읽는다. 비어 있으면 던진다. */
export async function readMeetsAttendeeHeaderRow(
  city: MeetsCityConfig,
  spreadsheetId = getMeetsAttendeeSheetId()
): Promise<string[]> {
  const range = `${quoteSheetTitle(city.sheetTabTitle)}!A${MEETS_HEADER_ROW_NUMBER}:${HEADER_READ_RANGE_LAST_COLUMN}${MEETS_HEADER_ROW_NUMBER}`
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range })
  const headerRow = (response.data.values?.[0] ?? []).map((cell) => normalizeHeaderCell(cell))

  // 오른쪽 끝 빈 셀은 잘라낸다(읽기 범위를 AZ 까지 넉넉히 잡았으므로).
  while (headerRow.length > 0 && headerRow[headerRow.length - 1] === "") headerRow.pop()

  if (headerRow.length === 0) {
    throw new Error(`참석 명단 탭 '${city.sheetTabTitle}' 의 ${MEETS_HEADER_ROW_NUMBER}행 헤더를 읽지 못했습니다.`)
  }

  return headerRow
}

/**
 * 참석 명단 탭에 신청자 1행을 덧붙인다.
 * 실패는 전부 throw — 호출부가 "시트 기록 실패"를 사용자에게 정직하게 돌려줘야 한다.
 */
export async function appendMeetsAttendee(
  input: MeetsAttendeeInput
): Promise<AppendMeetsAttendeeResult> {
  const city = MEETS_JULY_2026_CITIES[input.city]
  if (!city) {
    throw new Error(`알 수 없는 설명회 도시입니다: ${String(input.city)}`)
  }

  assertGoogleCredentials()

  const spreadsheetId = getMeetsAttendeeSheetId()
  const headerRow = await readMeetsAttendeeHeaderRow(city, spreadsheetId)
  const values = buildMeetsAttendeeRow(headerRow, input)

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: buildAppendRange(city.sheetTabTitle, headerRow.length),
    // RAW: Sheets 파싱을 끄고 연락처의 앞자리 0 을 보존한다(상단 주석 참고).
    valueInputOption: "RAW",
    // 마지막 데이터 행 아래에 행을 '삽입' 한다 — 2행 집계 수식(A4:A 등)이 함께 확장된다.
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  })

  return {
    appendedRange: response.data.updates?.updatedRange ?? "",
    spreadsheetId,
    sheetTabTitle: city.sheetTabTitle,
  }
}
