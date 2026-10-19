import { describe, expect, it } from "vitest"

import {
  buildLeadCapturePayload,
  buildMetaMessage,
  extractLeadValues,
  fieldDataToMap,
  hasMarketingConsent,
  pickField,
  type MetaLeadDetail,
} from "@/lib/meta/lead-ads-payload"

import {
  GOLDEN_CONSENT_CASES,
  GOLDEN_PAYLOAD_CASES,
  GOLDEN_PAYLOAD_KEY_ORDER,
} from "./fixtures/lead-ads-golden-cases"

// 옮긴 모듈을 직접 부른다. 기대값은 라우트 경계 골든(lead-ads-payload.golden.test.ts)과
// 같은 표에서 온다 — 미러·폴백이 모듈을 직접 불러도 웹훅과 같은 payload 가 나와야 한다.

describe("lib/meta/lead-ads-payload (직접 호출)", () => {
  for (const goldenCase of GOLDEN_PAYLOAD_CASES) {
    it(`buildLeadCapturePayload: ${goldenCase.id}`, () => {
      // MetaLeadDetail 은 옮기기 전 그대로의 교차 타입이라 created_time 이 number 로 좁혀진다.
      // Graph 실응답(ISO 문자열)을 쓰는 픽스처는 캐스트로 넘긴다 — 빌더는 created_time 을 읽지 않는다.
      const detail = goldenCase.detail as MetaLeadDetail | undefined
      const payload = buildLeadCapturePayload(goldenCase.value, detail)
      expect(payload).toStrictEqual(goldenCase.expected)
      expect(Object.keys(payload)).toEqual([...GOLDEN_PAYLOAD_KEY_ORDER])
      expect(buildMetaMessage(goldenCase.value, detail)).toBe(
        goldenCase.expected.message
      )
    })
  }

  it("hasMarketingConsent: 동의 판정 표", () => {
    for (const consentCase of GOLDEN_CONSENT_CASES) {
      const fields = fieldDataToMap([{ name: consentCase.key, values: [consentCase.value] }])
      expect(hasMarketingConsent(fields), `${consentCase.key}=${consentCase.value}`).toBe(
        consentCase.expected
      )
    }
  })

  it("fieldDataToMap·pickField: 키는 소문자, 값은 trim 후 빈 값 제외·', ' 결합, 첫 키 우선", () => {
    const fields = fieldDataToMap([
      { name: " Company_Name ", values: [" A ", "", "B"] },
      { name: "company", values: ["C"] },
      { name: "blank", values: ["  "] },
      { values: ["x"] },
    ])
    expect(fields).toEqual({ company_name: "A, B", company: "C" })
    expect(pickField(fields, ["missing", "COMPANY", "company_name"])).toBe("C")
    expect(pickField(fields, ["missing"])).toBeUndefined()
    expect(fieldDataToMap(undefined)).toEqual({})
  })

  it("extractLeadValues: leadgen 필드이면서 leadgen_id 가 있는 변경만 순서대로", () => {
    expect(
      extractLeadValues({
        object: "page",
        entry: [
          {
            changes: [
              { field: "feed", value: { leadgen_id: "1" } },
              { field: "leadgen", value: { leadgen_id: "2", page_id: "p" } },
              { field: "leadgen", value: {} },
            ],
          },
          {},
          { changes: [{ field: "leadgen", value: { leadgen_id: "3" } }] },
        ],
      })
    ).toEqual([{ leadgen_id: "2", page_id: "p" }, { leadgen_id: "3" }])
    expect(extractLeadValues({})).toEqual([])
  })
})
