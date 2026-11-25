import { describe, expect, it, vi } from "vitest"

import {
  KR_CONTACT_ROWS,
  KR_TOPICS,
  readKrContacts,
  resolveContact,
  type CustomerOwnerEvidence,
  type CustomerRef,
  type ResolveContactDeps,
  type StaffMember,
} from "@/lib/internal-cs-chat/contact"
import { HQ_DOMAINS } from "@/lib/internal-cs-chat/escalation-routing"

// 모두 지어낸 값이다(실제 고객사·사람이 아니다). 시험은 갈래(kind)·구조·근거 건수를 단정한다.
const CUSTOMER: CustomerRef = { key: "neo:acct-test-1", name: "테스트고객사A", href: "/admin/crm/customers/neo%3Aacct-test-1" }
const EVIDENCE: CustomerOwnerEvidence = {
  ownerName: "매니저 갑",
  ownerSource: "NEO 계정 담당",
  deals: { total: 3, open: 1, ownerNames: ["매니저 갑", "매니저 을"] },
  orders: 2,
  collections: 4,
  issues: ["구독 만료 임박"],
  activityTotal: 12,
  lastContactAt: "2026-11-20T09:00:00Z",
  lastContactActor: "매니저 을",
  generatedAt: "2026-11-25T00:00:00Z",
  warnings: [],
}
const STAFF: StaffMember[] = [
  { displayName: "지사장 병", role: "BRANCH", teamRole: "branch_director", capabilities: [], active: true },
  { displayName: "권한자 정", role: "ADMIN", teamRole: "ops", capabilities: ["hardware.finalize"], active: true },
  { displayName: "슈퍼 무", role: "SUPER_ADMIN", teamRole: "admin", capabilities: [], active: true },
  { displayName: "퇴사 기", role: "SUPER_ADMIN", teamRole: "admin", capabilities: ["hardware.finalize"], active: false },
]

function deps(overrides: Partial<ResolveContactDeps> = {}): ResolveContactDeps {
  return {
    findCustomersInText: vi.fn(async (question: string) => (question.includes(CUSTOMER.name) ? [CUSTOMER] : [])),
    loadCustomerEvidence: vi.fn(async () => EVIDENCE),
    listStaff: vi.fn(async () => STAFF),
    ...overrides,
  }
}

describe("resolveContact", () => {
  it("① customer in the question → owner with evidence counts and admin links", async () => {
    const card = await resolveContact(`${CUSTOMER.name} 결제 내역 누구에게 물어보나요`, deps())
    expect(card.kind).toBe("customer_owner")
    expect(card.who).toContain(EVIDENCE.ownerName!)
    expect(card.backup).toContain("매니저 을")
    expect(card.channel.href).toBe(CUSTOMER.href)
    expect(card.verifiedAt).toBe(EVIDENCE.generatedAt)
    const byKind = Object.fromEntries(card.evidence.map((item) => [item.kind, item]))
    expect(byKind.owner_assignment.count).toBe(1)
    expect(byKind.deal.count).toBe(3)
    expect(byKind.order.count).toBe(2)
    expect(byKind.payment.count).toBe(4)
    expect(byKind.issue.count).toBe(1)
    expect(byKind.contact_history.count).toBe(12)
    for (const item of card.evidence) {
      if (item.href) expect(item.href.startsWith("/admin/")).toBe(true)
    }
    // 고객 단위 견적·사내 CS 배정은 자료가 없다고 밝힌다.
    expect(card.gaps.join(" ")).toContain("견적")
  })

  it("① uses the open customer when the question names none, and says so when no owner is assigned", async () => {
    const card = await resolveContact(
      "이 고객 결제 문제 있었나요",
      deps({ loadCustomerEvidence: vi.fn(async () => ({ ...EVIDENCE, ownerName: null, deals: { total: 0, open: 0, ownerNames: [] } })) }),
      { openCustomer: CUSTOMER }
    )
    expect(card.kind).toBe("customer_owner")
    expect(card.who).toContain("미지정")
  })

  it("① survives a failing customer lookup without inventing a name", async () => {
    const card = await resolveContact(
      `${CUSTOMER.name} 담당 누구예요`,
      deps({ loadCustomerEvidence: vi.fn(async () => Promise.reject(new Error("db down"))) })
    )
    expect(card.kind).toBe("customer_owner")
    expect(card.who).toContain("미지정")
    expect(card.gaps[0]).toContain("읽지 못했습니다")
  })

  it("② Korean branch work → KR table (empty) falls back to role and admin capability holders", async () => {
    const shipping = await resolveContact("하드웨어 출고 언제 되나요", deps())
    expect(shipping.kind).toBe("kr")
    expect(shipping.who).toContain("권한자 정")
    expect(shipping.who).not.toContain("퇴사 기")
    expect(shipping.backup).toContain("지사장 병")
    expect(shipping.evidence.map((item) => item.kind)).toContain("staff_role")
    expect(shipping.gaps.join(" ")).toContain("한국 담당표")

    const quote = await resolveContact("견적서 문자로 보내주세요", deps())
    expect(quote.kind).toBe("kr")
    expect(quote.reason).toContain("견적")
    expect(quote.who).toContain("담당자 이름은 담당표에 없음")
  })

  it("② a filled KR table row wins over the role lookup", async () => {
    const rows = readKrContacts(
      [
        "업무 영역,예시 질문,1차 담당 역할,1차 담당자,대리 담당자,연락 방법(위컴 방·멘션),준비해 갈 것,관련 어드민 화면 링크,비고,확인일",
        '세금계산서,"발행은, 누구?",,담당 경,담당 신,KR 운영방,사업자 정보·금액,/admin/branch/ledger,,2026-11-20',
      ].join("\n")
    )
    expect(rows).toHaveLength(1)
    const card = await resolveContact("세금계산서 발행 요청", deps({ krContacts: rows }))
    expect(card).toMatchObject({ kind: "kr", backup: "담당 신", verifiedAt: "2026-11-20" })
    expect(card.who).toContain("담당 경")
    expect(card.channel).toEqual({ label: "KR 운영방", href: "/admin/branch/ledger" })
    expect(card.prepare).toEqual(["사업자 정보", "금액"])
  })

  it("③ HQ technical problem → HQ domain card with document source and date", async () => {
    const card = await resolveContact("T1 카메라 화질이 흐려요", deps())
    expect(card.kind).toBe("hq")
    expect(card.who).toContain(HQ_DOMAINS.camera.primaryContact)
    expect(card.channel.label).toContain(HQ_DOMAINS.camera.wecomMention)
    expect(card.verifiedAt).toBe(HQ_DOMAINS.camera.verifiedAt)
    expect(card.evidence[0].label).toContain(HQ_DOMAINS.camera.source)
    expect(card.prepare.join(" ")).toContain("1:1")
  })

  it("④ unknown → no invented name, says who to ask to fill the table", async () => {
    const card = await resolveContact("이번 주 점심 메뉴 정해졌나요", deps())
    expect(card.kind).toBe("unknown")
    expect(card.who).toBe("담당표에 없음")
    expect(card.channel.label).toContain("지사장")
    expect(card.channel.label).toContain("담당표를 채운다")

    const bare = await resolveContact("이번 주 점심 메뉴", {})
    expect(bare.kind).toBe("unknown")
    expect(bare.channel.label).toBe("지사장(branch_director)에게 물어 담당표를 채운다")
  })

  it("is channel-agnostic: plain JSON with the agreed shape", async () => {
    const card = await resolveContact("T1 카메라 화질", deps())
    expect(Object.keys(card).sort()).toEqual(
      ["alternatives", "backup", "channel", "evidence", "gaps", "kind", "prepare", "reason", "verifiedAt", "who"].sort()
    )
    expect(JSON.parse(JSON.stringify(card))).toEqual(card)
  })
})

describe("KR contact table", () => {
  it("ships empty (values are filled by the team) and every topic has a match rule and prepare list", () => {
    expect(KR_CONTACT_ROWS).toEqual([])
    expect(readKrContacts()).toEqual([])
    for (const topic of KR_TOPICS) {
      expect(topic.prepare.length).toBeGreaterThan(0)
      if (topic.adminLink) expect(topic.adminLink.startsWith("/admin/")).toBe(true)
    }
  })

  it("skips template rows without a person and unknown areas", () => {
    const rows = readKrContacts(
      [
        "업무 영역,예시 질문,1차 담당 역할,1차 담당자,대리 담당자,연락 방법(위컴 방·멘션),준비해 갈 것,관련 어드민 화면 링크,비고",
        "견적,고객 견적을 어떻게?,,,,,,/admin/branch,",
        "없는 영역,?,,누군가,,,,,",
        "AS,A/S 판정은?,,담당 자,,,,,",
      ].join("\n")
    )
    expect(rows).toEqual([expect.objectContaining({ topic: "as", primaryName: "담당 자", verifiedAt: null })])
  })
})
