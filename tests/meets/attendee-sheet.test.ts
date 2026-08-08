// 참석 명단 시트 writer — 순수 로직만 검증한다(네트워크 없음).
//
// 이 스프레드시트는 도시 탭마다 열 구성이 달라서(예: `14. 창원` 은 13열, `D-3 문자` 없음)
// 인덱스 하드코딩이 곧 데이터 오배치다. 그래서 "헤더 이름으로 매핑한다"는 계약 자체를
// **열 순서를 섞은 헤더 행**으로 못 박는다 — 순서를 바꿔도 값이 제 헤더 아래에 있어야 한다.
import { describe, expect, it } from "vitest"

import {
  buildAppendRange,
  buildMeetsAttendeeNote,
  buildMeetsAttendeeRow,
  MEETS_INFLOW_VALUE,
  MEETS_PURCHASE_PROBABILITY_VALUE,
  normalizeKoreanPhone,
  quoteSheetTitle,
  toColumnLetter,
  type MeetsAttendeeInput,
} from "@/lib/meets/attendee-sheet"
import { MEETS_JULY_2026_CITIES } from "@/lib/meets/july-2026"

/** 전주·광주 탭의 실제 헤더 행(3행) */
const LIVE_HEADERS = [
  "연락",
  "지역",
  "기관",
  "성명",
  "직책",
  "연락처",
  "초청장전달",
  "참석여부",
  "D-3 문자",
  "D-1 전화",
  "실제참석",
  "유입경로",
  "구매확률",
  "비고",
]

// 2026-07-27 14:32 KST
const SUBMITTED_AT = new Date("2026-07-27T05:32:00.000Z")

const BASE_INPUT: MeetsAttendeeInput = {
  city: "jeonju",
  name: "김원장",
  org: "클래스인 수학학원",
  role: "원장",
  phone: "01012345678",
  email: "won@example.com",
  submittedAt: SUBMITTED_AT,
}

/** 헤더 이름 → 값. 인덱스를 테스트에 다시 하드코딩하지 않기 위한 헬퍼. */
function toRecord(headers: readonly string[], row: readonly string[]) {
  const record: Record<string, string> = {}
  headers.forEach((header, position) => {
    record[header] = row[position]
  })
  return record
}

describe("buildMeetsAttendeeRow — 헤더 이름 매핑", () => {
  it("실제 탭 헤더 순서에서 각 값이 제 헤더 아래에 들어간다", () => {
    const row = buildMeetsAttendeeRow(LIVE_HEADERS, BASE_INPUT)
    const cells = toRecord(LIVE_HEADERS, row)

    expect(row).toHaveLength(LIVE_HEADERS.length)
    expect(cells["지역"]).toBe("전주")
    expect(cells["기관"]).toBe("클래스인 수학학원")
    expect(cells["성명"]).toBe("김원장")
    expect(cells["직책"]).toBe("원장")
    expect(cells["연락처"]).toBe("010-1234-5678")
  })

  it("헤더 순서를 뒤섞어도 값이 따라간다(인덱스가 아니라 이름으로 매핑)", () => {
    const shuffled = [
      "비고",
      "연락처",
      "지역",
      "구매확률",
      "성명",
      "실제참석",
      "기관",
      "D-1 전화",
      "직책",
      "유입경로",
      "연락",
      "참석여부",
      "D-3 문자",
      "초청장전달",
    ]
    const row = buildMeetsAttendeeRow(shuffled, BASE_INPUT)
    const cells = toRecord(shuffled, row)

    expect(row).toHaveLength(shuffled.length)
    expect(cells["지역"]).toBe("전주")
    expect(cells["기관"]).toBe("클래스인 수학학원")
    expect(cells["성명"]).toBe("김원장")
    expect(cells["직책"]).toBe("원장")
    expect(cells["연락처"]).toBe("010-1234-5678")
    expect(cells["유입경로"]).toBe(MEETS_INFLOW_VALUE)
    expect(cells["구매확률"]).toBe(MEETS_PURCHASE_PROBABILITY_VALUE)
    expect(cells["비고"]).toContain("won@example.com")

    // 정렬 순서와 무관하게 같은 값 집합이 나온다.
    const liveCells = toRecord(LIVE_HEADERS, buildMeetsAttendeeRow(LIVE_HEADERS, BASE_INPUT))
    expect(cells).toEqual(liveCells)
  })

  it("도시에 따라 '지역' 값이 바뀐다", () => {
    const row = buildMeetsAttendeeRow(LIVE_HEADERS, { ...BASE_INPUT, city: "gwangju" })
    expect(toRecord(LIVE_HEADERS, row)["지역"]).toBe("광주")
  })

  it("헤더에 여분 공백/NBSP 가 섞여도 매칭된다", () => {
    const noisy = LIVE_HEADERS.map((header) =>
      header === "D-3 문자" ? "  D-3 문자 " : header
    )
    const row = buildMeetsAttendeeRow(noisy, BASE_INPUT)
    expect(row).toHaveLength(noisy.length)
    expect(toRecord(LIVE_HEADERS, row)["연락처"]).toBe("010-1234-5678")
  })

  it("모르는 헤더 자리는 빈 칸으로 두고 다른 열을 밀어내지 않는다", () => {
    const withExtra = [...LIVE_HEADERS.slice(0, 2), "담당 매니저", ...LIVE_HEADERS.slice(2)]
    const row = buildMeetsAttendeeRow(withExtra, BASE_INPUT)
    const cells = toRecord(withExtra, row)

    expect(row).toHaveLength(withExtra.length)
    expect(cells["담당 매니저"]).toBe("")
    expect(cells["기관"]).toBe("클래스인 수학학원")
    expect(cells["비고"]).toContain("신청 2026-07-27 14:32")
  })
})

describe("buildMeetsAttendeeRow — 헤더 누락", () => {
  it("값을 담아야 하는 헤더가 없으면 어긋난 행을 만들지 않고 던진다", () => {
    const missingPhone = LIVE_HEADERS.filter((header) => header !== "연락처")
    expect(() => buildMeetsAttendeeRow(missingPhone, BASE_INPUT)).toThrow(/연락처/)
  })

  it("누락 에러 메시지에 탭 이름과 읽은 헤더가 함께 담긴다(운영자가 원인을 바로 본다)", () => {
    const broken = ["지역", "기관", "성명"]
    expect(() => buildMeetsAttendeeRow(broken, BASE_INPUT)).toThrow(
      new RegExp(MEETS_JULY_2026_CITIES.jeonju.sheetTabTitle)
    )
    expect(() => buildMeetsAttendeeRow(broken, BASE_INPUT)).toThrow(/직책/)
  })

  it("헤더 행이 통째로 비면 던진다", () => {
    expect(() => buildMeetsAttendeeRow([], BASE_INPUT)).toThrow(/필수 헤더가 없습니다/)
  })

  it("운영자가 나중에 채우는 빈 칸(D-3 문자)만 없는 탭은 그대로 쓸 수 있다", () => {
    // `14. 창원` 처럼 열이 적은 형제 탭 — 유실되는 데이터가 없으므로 던지지 않는다.
    const noD3 = LIVE_HEADERS.filter((header) => header !== "D-3 문자")
    const row = buildMeetsAttendeeRow(noD3, BASE_INPUT)

    expect(row).toHaveLength(noD3.length)
    expect(toRecord(noD3, row)["연락처"]).toBe("010-1234-5678")
  })
})

describe("고정 열", () => {
  it("연락/초청장전달/참석여부/D-3/D-1/실제참석 은 비우고, 유입경로·구매확률은 상수다", () => {
    const cells = toRecord(LIVE_HEADERS, buildMeetsAttendeeRow(LIVE_HEADERS, BASE_INPUT))

    expect(cells["연락"]).toBe("")
    expect(cells["초청장전달"]).toBe("")
    expect(cells["참석여부"]).toBe("")
    expect(cells["D-3 문자"]).toBe("")
    expect(cells["D-1 전화"]).toBe("")
    expect(cells["실제참석"]).toBe("")
    expect(cells["유입경로"]).toBe("랜딩")
    expect(cells["구매확률"]).toBe("10% (Lead)")
  })
})

describe("normalizeKoreanPhone", () => {
  it("숫자만 들어온 휴대폰 번호를 하이픈 형태로 만든다", () => {
    expect(normalizeKoreanPhone("01012345678")).toBe("010-1234-5678")
  })

  it("이미 하이픈이 있으면 그대로 통과한다", () => {
    expect(normalizeKoreanPhone("010-1234-5678")).toBe("010-1234-5678")
  })

  it("공백/점 같은 구분자도 흡수한다", () => {
    expect(normalizeKoreanPhone(" 010 1234 5678 ")).toBe("010-1234-5678")
    expect(normalizeKoreanPhone("010.1234.5678")).toBe("010-1234-5678")
  })

  it("82 국제 표기는 국내 0 접두 형태로 되돌린다", () => {
    expect(normalizeKoreanPhone("+82 10-1234-5678")).toBe("010-1234-5678")
    expect(normalizeKoreanPhone("821012345678")).toBe("010-1234-5678")
    // +82 뒤에 0 까지 붙여 쓰는 흔한 실수도 흡수한다.
    expect(normalizeKoreanPhone("+82-010-1234-5678")).toBe("010-1234-5678")
  })

  it("지역번호(02/063/062)도 자릿수에 맞춰 끊는다", () => {
    expect(normalizeKoreanPhone("0212345678")).toBe("02-1234-5678")
    expect(normalizeKoreanPhone("021234567")).toBe("02-123-4567")
    expect(normalizeKoreanPhone("0632345678")).toBe("063-234-5678")
  })

  it("아는 형태가 아니면 원문을 다듬어 그대로 둔다(멋대로 자르지 않는다)", () => {
    expect(normalizeKoreanPhone(" 0507-1234-5678 ")).toBe("0507-1234-5678")
    expect(normalizeKoreanPhone("")).toBe("")
    expect(normalizeKoreanPhone(null)).toBe("")
  })

  it("결과는 항상 문자열이고 앞자리 0 이 살아 있다(USER_ENTERED 로 숫자화되면 안 되는 값)", () => {
    const value = buildMeetsAttendeeRow(LIVE_HEADERS, BASE_INPUT)[LIVE_HEADERS.indexOf("연락처")]

    expect(typeof value).toBe("string")
    expect(value.startsWith("0")).toBe(true)
    expect(Number(value.replace(/-/g, "")).toString()).not.toBe(value.replace(/-/g, ""))
  })
})

describe("buildMeetsAttendeeNote", () => {
  it("시각 + 이메일 + 어트리뷰션을 한 줄로 합친다", () => {
    const note = buildMeetsAttendeeNote({
      submittedAt: SUBMITTED_AT,
      email: "won@example.com",
      attribution: {
        utmSource: "meta",
        utmMedium: "cpc",
        utmCampaign: "meets-july",
        gclid: "GC123",
        landingPage: "/l/meets-july?utm_source=meta",
      },
    })

    expect(note).toBe(
      "신청 2026-07-27 14:32 · won@example.com · utm_source=meta · utm_medium=cpc · " +
        "utm_campaign=meets-july · gclid=GC123 · landing=/l/meets-july?utm_source=meta"
    )
  })

  it("KST 로 찍는다(UTC 로 새면 날짜가 하루 밀린다)", () => {
    // 2026-07-27 23:10 KST = 2026-07-27T14:10Z
    const note = buildMeetsAttendeeNote({ submittedAt: new Date("2026-07-27T14:10:00.000Z") })
    expect(note).toBe("신청 2026-07-27 23:10")
  })

  it("어트리뷰션이 없으면 구분자가 끝에 남지 않는다", () => {
    const note = buildMeetsAttendeeNote({
      submittedAt: SUBMITTED_AT,
      email: "won@example.com",
      attribution: { utmSource: "", utmMedium: null, gclid: undefined },
    })

    expect(note).toBe("신청 2026-07-27 14:32 · won@example.com")
    expect(note.endsWith("·")).toBe(false)
    expect(note.trimEnd()).toBe(note)
  })

  it("이메일도 어트리뷰션도 없으면 시각만 남는다", () => {
    expect(buildMeetsAttendeeNote({ submittedAt: SUBMITTED_AT })).toBe("신청 2026-07-27 14:32")
  })
})

describe("A1 표기", () => {
  it("마침표·공백이 있는 탭 제목을 따옴표로 감싼다", () => {
    expect(quoteSheetTitle("15. 전주")).toBe("'15. 전주'")
    expect(quoteSheetTitle("it's")).toBe("'it''s'")
  })

  it("열 번호를 열 문자로 바꾼다", () => {
    expect(toColumnLetter(1)).toBe("A")
    expect(toColumnLetter(14)).toBe("N")
    expect(toColumnLetter(26)).toBe("Z")
    expect(toColumnLetter(27)).toBe("AA")
  })

  it("append 범위는 헤더 행(3행)에 앵커링하고 끝 열은 헤더 길이에서 뽑는다", () => {
    expect(buildAppendRange("15. 전주", LIVE_HEADERS.length)).toBe("'15. 전주'!A3:N")
    // 탭이 드리프트해 열이 하나 줄어도 하드코딩된 N 이 아니라 실제 길이를 따른다.
    expect(buildAppendRange("16. 광주", LIVE_HEADERS.length - 1)).toBe("'16. 광주'!A3:M")
  })
})
