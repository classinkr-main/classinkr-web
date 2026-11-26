import { describe, expect, it, vi } from "vitest"

import {
  parseKrContactsCsv,
  readKrContacts,
  resolveContact,
  type KrContactRow,
  type ResolveContactDeps,
  type StaffMember,
} from "@/lib/internal-cs-chat/contact"

// 한국 담당표를 DB 에서 읽는 연결(deps.loadKrContacts)과 단체방용 역할만 카드(deps.roleOnly), CSV 양식 읽기.
// 모두 지어낸 값이다(실제 사람·고객 기관이 아니다).

const STAFF: StaffMember[] = [
  { displayName: "지사장 가", role: "BRANCH", teamRole: "branch_director", capabilities: [], active: true },
  { displayName: "권한자 나", role: "ADMIN", teamRole: "ops", capabilities: ["hardware.finalize"], active: true },
]

const QUOTE_ROW: KrContactRow = {
  topic: "quote",
  role: "BD 팀 매니저",
  primaryName: "담당자 A",
  backupName: "담당자 B",
  channel: "위컴 1:1",
  prepare: ["고객사", "품목·수량"],
  adminLink: "/admin/quotes",
  verifiedAt: "2026-11-20",
  note: null,
}

function deps(overrides: Partial<ResolveContactDeps> = {}): ResolveContactDeps {
  return { listStaff: vi.fn(async () => STAFF), ...overrides }
}

describe("resolveContact — DB 한국 담당표(loadKrContacts)", () => {
  it("DB 행이 있으면 그 1차·대리 담당·연락 방법·확인일이 카드에 나온다", async () => {
    const loadKrContacts = vi.fn(async () => ({ rows: [QUOTE_ROW], failed: false, warning: null }))
    const card = await resolveContact("견적서 보내 주세요", deps({ loadKrContacts }))
    expect(card.kind).toBe("kr")
    expect(card.who).toBe("BD 팀 매니저 — 담당자 A")
    expect(card.backup).toBe("담당자 B")
    expect(card.channel).toEqual({ label: "위컴 1:1", href: "/admin/quotes" })
    expect(card.verifiedAt).toBe("2026-11-20")
    expect(card.evidence.map((item) => item.kind)).toContain("kr_table")
    expect(card.gaps.join(" ")).not.toContain("읽지 못")
    expect(card.namesHidden).toBeUndefined()
  })

  it("한국 지사 갈래가 아니면 담당표를 읽지 않는다", async () => {
    const loadKrContacts = vi.fn(async () => ({ rows: [QUOTE_ROW], failed: false, warning: null }))
    await resolveContact("T1 카메라 화질이 흐려요", deps({ loadKrContacts }))
    await resolveContact("이번 주 점심 메뉴", deps({ loadKrContacts }))
    expect(loadKrContacts).not.toHaveBeenCalled()
  })

  it("DB 실패(failed)면 빈 표로 답하고 gaps 맨 앞에 실패를 적는다 — 역할·계정 권한 경로는 그대로", async () => {
    const card = await resolveContact(
      "하드웨어 출고 언제 되나요",
      deps({ loadKrContacts: async () => ({ rows: [QUOTE_ROW], failed: true, warning: "표 미적용 안내" }) })
    )
    expect(card.kind).toBe("kr")
    expect(card.gaps[0]).toBe("표 미적용 안내")
    // 빈 표 → hardware.finalize 계정으로 찾는다(지금 동작과 같다).
    expect(card.who).toContain("권한자 나")
    expect(card.evidence.map((item) => item.kind)).not.toContain("kr_table")
  })

  it("읽기가 던져도 답은 나오고 실패가 적힌다", async () => {
    const card = await resolveContact(
      "견적서 보내 주세요",
      deps({
        loadKrContacts: async () => {
          throw new Error("timeout")
        },
      })
    )
    expect(card.kind).toBe("kr")
    expect(card.gaps[0]).toContain("한국 담당자 표를 읽지 못해")
    expect(card.who).toContain("담당자 이름은 담당표에 없음")
  })

  it("1:1 카드는 그 영역의 1차·대리 이름만 싣고 비고는 싣지 않는다(표 전체는 GET 권한 경계 뒤)", async () => {
    const row: KrContactRow = { ...QUOTE_ROW, note: "비고 메모 갑" }
    const card = await resolveContact("견적 문의", deps({ krContacts: [row] }))
    expect(card.who).toContain("담당자 A")
    expect(card.backup).toBe("담당자 B")
    expect(JSON.stringify(card)).not.toContain("비고 메모 갑")
  })

  it("고정 값(krContacts)이 있으면 그것을 쓰고 서버 읽기는 부르지 않는다", async () => {
    const loadKrContacts = vi.fn(async () => ({ rows: [], failed: true, warning: null }))
    const card = await resolveContact("견적 문의", deps({ krContacts: [QUOTE_ROW], loadKrContacts }))
    expect(card.who).toContain("담당자 A")
    expect(loadKrContacts).not.toHaveBeenCalled()
  })
})

describe("resolveContact — roleOnly(위컴 단체방)", () => {
  const NAMES = /담당자 A|담당자 B|지사장 가|권한자 나/

  it("담당표 이름·대리 이름·계정 이름을 싣지 않고 역할만 싣는다", async () => {
    const card = await resolveContact(
      "견적서 보내 주세요",
      deps({ roleOnly: true, loadKrContacts: async () => ({ rows: [QUOTE_ROW], failed: false, warning: null }) })
    )
    expect(card.kind).toBe("kr")
    expect(card.namesHidden).toBe(true)
    expect(card.who).toContain("BD 팀 매니저")
    expect(card.channel.label).toBe("위컴 1:1")
    expect(JSON.stringify(card)).not.toMatch(NAMES)
  })

  it("계정 권한으로 찾은 담당·지사장 이름도 싣지 않는다", async () => {
    const card = await resolveContact("하드웨어 출고 언제 되나요", deps({ roleOnly: true }))
    expect(card.namesHidden).toBe(true)
    expect(card.who).toContain("hardware.finalize")
    expect(JSON.stringify(card)).not.toMatch(NAMES)
  })

  it("연락 방법·준비물 칸에 이름을 적었으면 그 글은 빼고 기본 문구를 쓴다", async () => {
    const row: KrContactRow = { ...QUOTE_ROW, channel: "담당자 A 에게 위컴", prepare: ["담당자 B 승인", "고객사"] }
    const card = await resolveContact("견적 문의", deps({ roleOnly: true, krContacts: [row] }))
    expect(card.channel.label).not.toContain("담당자 A")
    expect(card.prepare).toEqual(["고객사"])
    expect(JSON.stringify(card)).not.toMatch(NAMES)
  })

  it("역할 칸에 이름을 적었으면 그 역할 글은 싣지 않고 문서의 역할(없으면 영역 이름)을 쓴다", async () => {
    // 1차 담당 이름이 든 역할 — 문서 역할(KR_TOPICS)로 바꾼다.
    const named: KrContactRow = { ...QUOTE_ROW, role: "담당자 A 매니저" }
    const quote = await resolveContact("견적 문의", deps({ roleOnly: true, krContacts: [named] }))
    expect(quote.namesHidden).toBe(true)
    expect(quote.who).toBe("BD 팀 (리드→상담→견적→계약 클로징) — 이름은 갈매봇 1:1 로 물어봐 주세요")
    expect(JSON.stringify(quote)).not.toMatch(NAMES)

    // 어드민 계정 이름이 든 역할 · 문서 역할이 없는 영역(세금계산서) — 영역 이름으로.
    const taxRow: KrContactRow = { ...QUOTE_ROW, topic: "tax_invoice", role: "지사장 가 직속", primaryName: "담당자 C", backupName: null }
    const tax = await resolveContact("세금계산서 발행 부탁", deps({ roleOnly: true, krContacts: [taxRow] }))
    expect(tax.who).toBe("세금계산서 담당 — 이름은 갈매봇 1:1 로 물어봐 주세요")
    expect(JSON.stringify(tax)).not.toMatch(/담당자 C|지사장 가/)

    // 이름 없이 역할만 적은 행(계정 권한 경로) · 담당이 없는 행(빈칸 경로)에서도 같다.
    const roleOnlyRow: KrContactRow = { ...QUOTE_ROW, topic: "hw_shipping", role: "권한자 나 팀", primaryName: null, backupName: null }
    const shipping = await resolveContact("하드웨어 출고 언제 되나요", deps({ roleOnly: true, krContacts: [roleOnlyRow] }))
    expect(shipping.who).toBe("hardware.finalize 권한 보유자(출고 확정) — 이름은 갈매봇 1:1 로 물어봐 주세요")
    const emptyStaff = await resolveContact(
      "하드웨어 출고 언제 되나요",
      deps({ roleOnly: true, krContacts: [roleOnlyRow], listStaff: async () => [{ ...STAFF[1], capabilities: [] }] })
    )
    expect(emptyStaff.who).toBe("hardware.finalize 권한 보유자(출고 확정) (담당자 이름은 담당표에 없음)")
    expect(JSON.stringify([shipping, emptyStaff])).not.toMatch(NAMES)
  })

  it("1:1(이름 실음)에서는 역할 칸을 그대로 쓴다", async () => {
    const named: KrContactRow = { ...QUOTE_ROW, role: "담당자 A 매니저" }
    const card = await resolveContact("견적 문의", deps({ krContacts: [named] }))
    expect(card.who).toBe("담당자 A 매니저 — 담당자 A")
  })

  it("모름 카드도 지사장 이름 없이", async () => {
    const card = await resolveContact("이번 주 점심 메뉴", deps({ roleOnly: true }))
    expect(card.kind).toBe("unknown")
    expect(card.namesHidden).toBe(true)
    expect(card.channel.label).toBe("지사장(branch_director)에게 물어 담당표를 채운다")
    expect(JSON.stringify(card)).not.toMatch(NAMES)
  })
})

describe("parseKrContactsCsv — 담당표 양식", () => {
  const HEADER = "업무 영역,예시 질문,1차 담당 역할,1차 담당자,대리 담당자,연락 방법(위컴 방·멘션),준비해 갈 것,관련 어드민 화면 링크,비고,확인일"

  it("1차 담당 역할 칸·따옴표 안 줄바꿈·두 겹 따옴표를 읽는다", () => {
    const parsed = parseKrContactsCsv(
      [HEADER, '견적,"견적은 ""누구""?",BD 팀 매니저,담당자 A,담당자 B,위컴 1:1,"고객사\n품목",/admin/quotes,"비고 첫 줄\n둘째 줄",2026-11-20', "세금계산서,,,담당자 C,,,,,,"].join("\r\n")
    )
    expect(parsed.missingColumns).toEqual([])
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0]).toMatchObject({ topic: "quote", role: "BD 팀 매니저", primaryName: "담당자 A", prepare: ["고객사", "품목"], note: "비고 첫 줄\n둘째 줄" })
    expect(parsed.lines).toEqual([2, 5])
    expect(parsed.rows[1]).toMatchObject({ topic: "tax_invoice", role: null, primaryName: "담당자 C" })
  })

  it("건너뛴 행은 줄 번호와 이유를 남긴다(빈 영역·모르는 영역·담당자 없음·같은 영역 반복)", () => {
    const parsed = parseKrContactsCsv(
      [HEADER, ",질문만,,담당자 A,,,,,,", "없는 영역,,,담당자 A,,,,,,", "견적,,,,,,,,,", "견적,,,담당자 A,,,,,,", "견적,,,담당자 B,,,,,,"].join("\n")
    )
    expect(parsed.rows.map((row) => row.primaryName)).toEqual(["담당자 A"])
    expect(parsed.skipped.map((skip) => [skip.line, skip.reason.slice(0, 6)])).toEqual([
      [2, "업무 영역이"],
      [3, "모르는 업무"],
      [4, "1차 담당자"],
      [6, "같은 업무 "],
    ])
  })

  it("형식이 틀린 확인일·어드민 링크는 비우고 알린다", () => {
    const parsed = parseKrContactsCsv([HEADER, "견적,,,담당자 A,,,,https://example.test/x,,11/20"].join("\n"))
    expect(parsed.rows[0]).toMatchObject({ adminLink: null, verifiedAt: null })
    expect(parsed.notes.map((note) => note.message)).toEqual([expect.stringContaining("확인일"), expect.stringContaining("/admin")])
  })

  it("머리 칸이 없으면 행을 내지 않고 없는 칸을 알린다", () => {
    const parsed = parseKrContactsCsv("이름,전화\n담당자 A,x")
    expect(parsed.rows).toEqual([])
    expect(parsed.missingColumns).toEqual(["업무 영역", "1차 담당자"])
  })

  it("readKrContacts 는 같은 양식의 행만 돌려준다(BOM 포함)", () => {
    expect(readKrContacts(`﻿${HEADER}\n견적,,,담당자 A,,,,,,`)).toEqual([expect.objectContaining({ topic: "quote", primaryName: "담당자 A" })])
  })
})
