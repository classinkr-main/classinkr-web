import { describe, expect, it } from "vitest"

import { parseKrContactsCsv } from "@/lib/internal-cs-chat/contact"
import { importWritesOf, planKrContactImport } from "@/lib/team-contacts/csv-import"
import {
  containsContactValue,
  kstDateString,
  validateTeamContactInput,
  type TeamContactAreaOption,
  type TeamContactRecord,
} from "@/lib/team-contacts/model"

// 담당자 표 입력 검사와 CSV 가져오기 계획(순수 함수). 값은 지어낸 것이다(실제 사람·연락처 아님).

const AREAS = { KR: new Set(["quote", "contract", "tax_invoice", "hq_escalation"]), HQ: new Set(["camera"]) }
const KR_AREAS: TeamContactAreaOption[] = [
  { key: "quote", label: "견적", usedInAnswers: true },
  { key: "contract", label: "계약", usedInAnswers: true },
  { key: "tax_invoice", label: "세금계산서", usedInAnswers: true },
  { key: "hq_escalation", label: "본사 에스컬레이션", usedInAnswers: false },
]
const HEADER = "업무 영역,예시 질문,1차 담당 역할,1차 담당자,대리 담당자,연락 방법(위컴 방·멘션),준비해 갈 것,관련 어드민 화면 링크,비고,확인일"

function record(overrides: Partial<TeamContactRecord> = {}): TeamContactRecord {
  return {
    id: "row-quote",
    org: "KR",
    area: "quote",
    role: "BD 팀 매니저",
    name: "담당자 A",
    deputy: "담당자 B",
    channel: "위컴 1:1",
    prep: ["고객사"],
    adminLink: "/admin/quotes",
    note: "기존 비고",
    confirmedAt: "2026-11-01",
    confirmedBy: "관리자 갑",
    active: true,
    sortOrder: 0,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...overrides,
  }
}

describe("validateTeamContactInput", () => {
  it("정상 입력을 다듬는다(빈 글은 null, 준비물은 · 로 나눔, 정렬 순서는 숫자)", () => {
    const result = validateTeamContactInput(
      { org: "KR", area: "quote", role: " BD 팀 ", name: "담당자 A", deputy: "", channel: "위컴 1:1", prep: "고객사 · 품목", sortOrder: "20" },
      AREAS
    )
    expect(result).toEqual({
      ok: true,
      value: { org: "KR", area: "quote", role: "BD 팀", name: "담당자 A", deputy: null, channel: "위컴 1:1", prep: ["고객사", "품목"], adminLink: null, note: null, confirmedAt: null, sortOrder: 20 },
    })
  })

  it.each([
    [{ org: "XX", area: "quote", name: "담당자 A" }, "조직"],
    [{ org: "KR", area: "camera", name: "담당자 A" }, "모르는 업무 영역"],
    [{ org: "HQ", area: "quote", name: "담당자 A" }, "모르는 업무 영역"],
    [{ org: "KR", area: "quote" }, "역할이나 1차 담당"],
    [{ org: "KR", area: "quote", name: "담당자 A", channel: "010-0000-0000" }, "연락처 값"],
    [{ org: "KR", area: "quote", name: "담당자 A", note: "메일 a@example.test 로" }, "연락처 값"],
    [{ org: "KR", area: "quote", name: "담당자 A", prep: ["01000000000 로 전화"] }, "연락처 값"],
    [{ org: "KR", area: "quote", name: "담당자 A", channel: "https://example.test/hook" }, "주소"],
    [{ org: "KR", area: "quote", name: "담당자 A", adminLink: "https://example.test" }, "/admin"],
    [{ org: "KR", area: "quote", name: "담당자 A", adminLink: "//admin" }, "/admin"],
    [{ org: "KR", area: "quote", name: "담당자 A", confirmedAt: "2026-02-30" }, "YYYY-MM-DD"],
    [{ org: "KR", area: "quote", name: "담당자 A", sortOrder: -1 }, "정렬 순서"],
    [{ org: "KR", area: "quote", name: "가".repeat(61) }, "60자"],
  ])("거절: %j", (input, message) => {
    const result = validateTeamContactInput(input, AREAS)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(message)
  })

  it("고치기 — 보낸 키만 바꾸고 나머지는 지금 값", () => {
    const result = validateTeamContactInput({ deputy: "담당자 C" }, AREAS, record())
    expect(result.ok && result.value).toMatchObject({ area: "quote", name: "담당자 A", deputy: "담당자 C", note: "기존 비고", confirmedAt: "2026-11-01" })
  })

  it("연락처 꼴 판정 · 한국 날짜", () => {
    expect(containsContactValue("위컴 1:1")).toBe(false)
    expect(containsContactValue("확인 2026-11-20")).toBe(false)
    expect(containsContactValue("+82 10 0000 0000")).toBe(true)
    expect(kstDateString(new Date("2026-11-25T15:00:00Z"))).toBe("2026-11-26")
  })
})

describe("planKrContactImport — CSV 미리보기 계획", () => {
  it("없는 영역은 만들고, 있는 영역은 바뀐 칸만 알리고, 같으면 그대로", () => {
    const parsed = parseKrContactsCsv(
      [
        HEADER,
        "견적,,BD 팀 매니저,담당자 A,담당자 D,위컴 1:1,,,,", // 대리만 바뀜, 빈 칸은 지금 값 유지
        "계약,,,담당자 E,,KR 운영방,계약서 · 견적 번호,/admin/contracts,,2026-11-24",
        "세금계산서,,,담당자 F,,,,,,",
      ].join("\n")
    )
    const plan = planKrContactImport(parsed, [record(), record({ id: "row-tax", area: "tax_invoice", name: "담당자 F", role: null, deputy: null, channel: null, prep: [], adminLink: null, note: null, confirmedAt: null, confirmedBy: null })], {
      areas: AREAS,
      krAreas: KR_AREAS,
    })
    expect(plan.counts).toEqual({ create: 1, update: 1, same: 1, skipped: 0 })
    const byArea = Object.fromEntries(plan.items.map((item) => [item.area, item]))
    expect(byArea.quote).toMatchObject({ action: "update", existingId: "row-quote", changes: ["대리 담당"] })
    expect(byArea.quote.input).toMatchObject({ note: "기존 비고", prep: ["고객사"], adminLink: "/admin/quotes", confirmedAt: "2026-11-01" })
    expect(byArea.contract).toMatchObject({ action: "create", existingId: null, confirmedFromCsv: true })
    expect(byArea.contract.input).toMatchObject({ org: "KR", name: "담당자 E", prep: ["계약서", "견적 번호"], sortOrder: 10 })
    expect(byArea.tax_invoice.action).toBe("same")

    const writes = importWritesOf(plan, "관리자 을")
    expect(writes.map((write) => write.input.area)).toEqual(["quote", "contract"])
    expect(writes.find((write) => write.input.area === "contract")?.confirmedBy).toBe("관리자 을 (CSV)")
    expect(writes.find((write) => write.input.area === "quote")?.confirmedBy).toBe("관리자 갑")
  })

  it("연락처 값이 든 줄은 건너뛰고 이유를 보인다(줄 번호 순)", () => {
    const parsed = parseKrContactsCsv(
      [HEADER, "견적,,,담당자 A,,010-0000-0000,,,,", "없는 영역,,,담당자 B,,,,,,", "계약,,,담당자 C,,,,,,"].join("\n")
    )
    const plan = planKrContactImport(parsed, [], { areas: AREAS, krAreas: KR_AREAS })
    expect(plan.items.map((item) => item.area)).toEqual(["contract"])
    expect(plan.skipped.map((skip) => skip.line)).toEqual([2, 3])
    expect(plan.skipped[0].reason).toContain("연락처 값")
  })

  it("안내에 쓰지 않는 영역(본사 에스컬레이션)은 넣되 표시한다 · 비활성 행은 없는 것으로 본다", () => {
    const parsed = parseKrContactsCsv([HEADER, "본사 에스컬레이션,,,담당자 A,,,,,,", "견적,,,담당자 B,,,,,,"].join("\n"))
    const plan = planKrContactImport(parsed, [record({ active: false })], { areas: AREAS, krAreas: KR_AREAS })
    expect(plan.items.find((item) => item.area === "hq_escalation")?.usedInAnswers).toBe(false)
    expect(plan.items.find((item) => item.area === "quote")?.action).toBe("create")
  })
})
