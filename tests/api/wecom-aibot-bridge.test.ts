import { describe, expect, it, vi } from "vitest"

import type { StaffIdentity } from "@/lib/admin-ai/server/actor"
import type { ConsultationSearchResult } from "@/lib/admin-ai/server/consultations"
import { collectTurn } from "@/lib/admin-ai/server/orchestrator"
import type { AiBlock, OrderTicket } from "@/lib/admin-ai/types"
import type { ContactCard as InternalContactCard } from "@/lib/internal-cs-chat/contact"
import type { InternalEvidenceParts, InternalPublicDocEvidence } from "@/lib/internal-cs-chat/context"
import {
  ACCOUNT_DENIED_TEXT,
  answerWecomMessage,
  GROUP_SCOPE_TEXT,
  NOT_LINKED_TEXT,
  parseInboundMessage,
  stripMentions,
  UNSUPPORTED_TYPE_TEXT,
  wecomActor,
  type BridgeDeps,
  type WecomInboundMessage,
} from "@/lib/wecom/aibot-bridge"
import { parseUserMap, readWecomAibotConfig } from "@/lib/wecom/aibot-config"
import { formatTurnMarkdown, INTERNAL_ONLY_LINE, MAX_CHARS, TRUNCATED_LINE, WRITE_NOT_HERE } from "@/lib/wecom/aibot-format"

import { fakeDeps } from "../admin-ai/server/fakes"

// 위컴 방 어댑터 — 가짜 조율기 자료(DB·모델·네트워크 없음). 사람 이름·연락처·고객 기관 없음.
const SITE = "https://example.test"
const ADMIN: StaffIdentity = { source: "supabase", role: "ADMIN", name: "스태프(샘플)", userId: "user-1", capabilities: [] }

function message(overrides: Partial<WecomInboundMessage> = {}): WecomInboundMessage {
  return { msgid: "m-1", aibotid: "bot-1", chattype: "single", fromUserId: "wx-staff-1", msgtype: "text", text: "@갈매봇 수업 녹화는 어떻게 해?", ...overrides }
}

function bridge(overrides: Partial<BridgeDeps> = {}) {
  const fake = fakeDeps()
  const lookupAdmin = vi.fn(async () => ({ ok: true as const, admin: ADMIN }))
  const deps: BridgeDeps = {
    userMap: new Map([["wx-staff-1", "staff1@example.test"]]),
    lookupAdmin,
    orchestratorDeps: () => fake.deps,
    collectTurn,
    siteUrl: SITE,
    now: () => Date.UTC(2026, 10, 25, 1),
    ...overrides,
  }
  return { deps, lookupAdmin, run: fake.run, preview: fake.preview, execute: fake.execute }
}

describe("위컴 수신 글 읽기", () => {
  it("공식 문서의 칸(msgid·aibotid·chatid·chattype·from.userid·msgtype·text.content·response_url)을 읽는다", () => {
    const parsed = parseInboundMessage({
      msgid: "CAIQ16HMjQYY",
      aibotid: "AIBOTID",
      chatid: "CHATID",
      chattype: "group",
      from: { userid: "USERID" },
      response_url: "https://qyapi.weixin.qq.com/cgi-bin/aibot/response?x=1",
      msgtype: "text",
      text: { content: "@RobotA hello robot" },
    })
    expect(parsed).toEqual({
      msgid: "CAIQ16HMjQYY",
      aibotid: "AIBOTID",
      chatid: "CHATID",
      chattype: "group",
      fromUserId: "USERID",
      msgtype: "text",
      responseUrl: "https://qyapi.weixin.qq.com/cgi-bin/aibot/response?x=1",
      text: "@RobotA hello robot",
    })
    expect(parseInboundMessage({ msgid: "x", aibotid: "b", chattype: "group", msgtype: "text" })).toBeNull()
    expect(parseInboundMessage({ msgid: "x", aibotid: "b", chattype: "other", from: { userid: "u" }, msgtype: "text" })).toBeNull()
  })

  it("compat_info(일반 콜백이 아닐 때만 옴)는 출처 값만 읽는다 — 짧은 영문 소문자가 아니면 other", () => {
    const base = { msgid: "x", aibotid: "b", chattype: "single", from: { userid: "u" }, msgtype: "text", text: { content: "hi" } }
    expect(parseInboundMessage(base)?.compatSource).toBeUndefined()
    expect(parseInboundMessage({ ...base, compat_info: { source: "ai_assistant" } })?.compatSource).toBe("ai_assistant")
    expect(parseInboundMessage({ ...base, compat_info: { source: "x y\nmsg=forged" } })?.compatSource).toBe("other")
    expect(parseInboundMessage({ ...base, compat_info: { source: "channel" } })?.text).toBe("hi")
  })

  it("그림·파일 글은 text 가 없고(null), 멘션은 걷어 낸다", () => {
    expect(parseInboundMessage({ msgid: "x", aibotid: "b", chattype: "single", from: { userid: "u" }, msgtype: "image", image: { url: "u" } })?.text).toBeNull()
    expect(stripMentions("@갈매봇 @다른사람  재고 알려 줘")).toBe("재고 알려 줘")
  })
})

describe("스위치·연결표", () => {
  const FULL = {
    WECOM_AIBOT_TOKEN: "tok",
    WECOM_AIBOT_ENCODING_AES_KEY: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
    WECOM_AIBOT_ID: "bot-1",
    WECOM_AIBOT_USER_MAP: '{"wx-staff-1":"Staff1@Example.test"}',
  }

  it("네 값이 모두 있어야 열린다 — 하나라도 없거나 틀리면 닫힘", () => {
    expect(readWecomAibotConfig(FULL).ok).toBe(true)
    for (const name of Object.keys(FULL)) {
      expect(readWecomAibotConfig({ ...FULL, [name]: "" }).ok, name).toBe(false)
    }
    expect(readWecomAibotConfig({ ...FULL, WECOM_AIBOT_ENCODING_AES_KEY: "short" })).toEqual({ ok: false, reason: "bad_aes_key" })
    expect(readWecomAibotConfig({ ...FULL, WECOM_AIBOT_USER_MAP: "[1]" })).toEqual({ ok: false, reason: "bad_user_map" })
  })

  it("연결표는 이메일을 소문자로, 한 줄이라도 틀리면 전체를 버린다", () => {
    expect(parseUserMap('{"a":"A@Example.test"}')?.get("a")).toBe("a@example.test")
    expect(parseUserMap('{"a":"a@example.test","b":"not-an-email"}')).toBeNull()
    expect(parseUserMap("{}")).toBeNull()
  })
})

describe("보낸 사람과 권한", () => {
  it("연결표에 없는 사람에게는 자료 없이 안내 한 줄만 — 계정 조회·조율기를 부르지 않는다", async () => {
    const { deps, lookupAdmin, run } = bridge()
    const reply = await answerWecomMessage(message({ fromUserId: "wx-unknown" }), deps)
    expect(reply).toEqual({ markdown: NOT_LINKED_TEXT, outcome: "not_linked" })
    expect(lookupAdmin).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it("비활성·역할 없음·갈매봇 역할 밖 계정은 거절한다", async () => {
    for (const lookup of [
      { ok: false as const, reason: "inactive" as const },
      { ok: false as const, reason: "no_role" as const },
      { ok: true as const, admin: { ...ADMIN, role: "PARTNER" } },
    ]) {
      const { deps, run } = bridge({ lookupAdmin: async () => lookup })
      const reply = await answerWecomMessage(message({ text: "T1 재고 몇 대야?" }), deps)
      expect(reply.markdown).toBe(ACCOUNT_DENIED_TEXT)
      expect(run).not.toHaveBeenCalled()
    }
  })

  it("글이 아닌 메시지는 글로 물어 달라고 한다", async () => {
    const { deps } = bridge()
    expect((await answerWecomMessage(message({ msgtype: "image", text: null }), deps)).markdown).toBe(UNSUPPORTED_TYPE_TEXT)
  })

  it("행위자 — 단체방은 범위 없음, 1:1 은 역할 범위에서 연락처 원문(pii)을 뺀다", () => {
    expect(wecomActor(ADMIN, "group").scopes).toEqual([])
    const single = wecomActor({ ...ADMIN, role: "SUPER_ADMIN" }, "single").scopes
    expect(single).toContain("read")
    expect(single).not.toContain("pii")
  })
})

describe("방에서 보이는 것의 경계", () => {
  it("1:1 — 조회 도구까지 쓴다", async () => {
    const { deps, run } = bridge()
    const reply = await answerWecomMessage(message({ text: "T1 재고 몇 대야?" }), deps)
    expect(reply.outcome).toBe("answered")
    expect(reply.markdown.split("\n")[0]).toBe("T1 카메라 가용 재고는 7대입니다.")
    expect(run).toHaveBeenCalled()
  })

  it("단체방 — 조회 요청은 \"1:1 로 물어봐 주세요\", 도구를 부르지 않는다", async () => {
    const { deps, run } = bridge()
    for (const text of ["T1 재고 몇 대야?", "최근 견적 보여 줘", "딜 현황 보여 줘"]) {
      const reply = await answerWecomMessage(message({ chattype: "group", chatid: "room-1", text: `@갈매봇 ${text}` }), deps)
      expect(reply.markdown, text).toContain(GROUP_SCOPE_TEXT)
      expect(reply.markdown, text).not.toMatch(/가온학원|1,100,000|7대/)
    }
    expect(run).not.toHaveBeenCalled()
  })

  it("단체방 — 클래스인 정보 답·담당자는 그대로 낸다", async () => {
    const { deps } = bridge()
    const reply = await answerWecomMessage(message({ chattype: "group", text: "@갈매봇 수업 녹화는 어떻게 해?" }), deps)
    expect(reply.markdown).toContain("수업 녹화")
    expect(reply.markdown).not.toContain(GROUP_SCOPE_TEXT)
  })

  it("단체방 — 고객 이름이 든 담당자 질문에도 고객 담당 이름·고객 키·고객 이름을 내지 않는다(담당자·근거 없음 대체 길 모두)", async () => {
    // 실제 resolveContact 의 customerCard 와 같은 꼴 — 질문에 고객 이름이 있으면 CRM 담당을 돌려준다.
    const CUSTOMER = "샘플고객학원"
    const customerCard = (question: string): InternalContactCard =>
      question.includes(CUSTOMER)
        ? {
            kind: "customer_owner",
            who: "담당 매니저 — 담당샘플갑",
            backup: "딜 담당 — 딜담당샘플을",
            prepare: ["고객사 이름"],
            channel: { label: "고객 화면에서 담당 확인", href: "/admin/crm/customers/x" },
            evidence: [{ kind: "owner_assignment", label: "담당 지정: 담당샘플갑", count: 1, href: "/admin/crm/customers/x" }],
            verifiedAt: null,
            reason: `질문 또는 열린 대화의 고객사 "${CUSTOMER}"`,
            alternatives: ["다른고객샘플"],
            gaps: ["같은 이름의 고객이 2명입니다(lead:abc 외 lead:def)"],
          }
        : { kind: "kr", who: "영업 담당", backup: null, prepare: [], channel: { label: "사내 메신저", href: null }, evidence: [], verifiedAt: null, reason: "한국 지사 업무", alternatives: [], gaps: [] }
    const seen: Array<{ chatType: string; openCustomer: unknown }> = []
    const { deps } = bridge({
      orchestratorDeps: (_admin, chatType) => ({
        ...fakeDeps().deps,
        resolveContact: async (question, openCustomer) => {
          seen.push({ chatType, openCustomer })
          return customerCard(question)
        },
      }),
    })
    for (const text of [`${CUSTOMER} 담당 누구야?`, `${CUSTOMER} 연락처 알려줘`, `${CUSTOMER} 누구한테 물어?`, `그럼 ${CUSTOMER} 담당은?`]) {
      const reply = await answerWecomMessage(message({ chattype: "group", chatid: "room-1", text: `@갈매봇 ${text}` }), deps)
      expect(reply.markdown, text).not.toMatch(/담당샘플갑|딜담당샘플을|샘플고객학원|다른고객샘플|lead:/)
      expect(reply.markdown, text).toContain(GROUP_SCOPE_TEXT)
    }
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((call) => call.chatType === "group" && call.openCustomer === null)).toBe(true)

    // 1:1 은 그대로(역할 범위 안의 담당 안내).
    const single = await answerWecomMessage(message({ text: `${CUSTOMER} 담당 누구야?` }), deps)
    expect(single.markdown).toContain("담당샘플갑")
  })

  it("단체방 — 한국 담당표·어드민 계정의 사람 이름은 나가지 않고 역할만(서버 연결이 놓쳐도 브리지가 막는다)", async () => {
    // 서버 연결이 이름을 실은 카드(namesHidden 없음)를 돌려준 경우 — 담당표 1차·대리 이름과 지사장 이름이 들어 있다.
    const named = (kind: "kr" | "unknown"): InternalContactCard => ({
      kind,
      who: kind === "kr" ? "BD 팀 매니저 — 담당자샘플갑" : "담당표에 없음",
      backup: kind === "kr" ? "담당자샘플을" : null,
      prepare: ["고객사", "품목·수량"],
      channel: { label: kind === "kr" ? "담당자샘플갑 에게 위컴" : "지사장(branch_director) — 지사장샘플병에게 물어 담당표를 채운다", href: "/admin/quotes" },
      evidence: [{ kind: "kr_table", label: "한국 담당표: 견적", count: 1, href: "/admin/quotes" }],
      verifiedAt: "2026-11-20",
      reason: kind === "kr" ? "한국 지사 업무: 견적" : "고객사·한국 업무·본사 기술 영역 어디에도 맞지 않습니다",
      alternatives: [],
      gaps: ["한국 담당표의 \"견적\" 행이 비어 있어 계정 권한으로 찾았습니다. 지사장샘플병"],
    })
    const roleOnly: InternalContactCard = { ...named("kr"), who: "BD 팀 매니저 — 이름은 갈매봇 1:1 로 물어봐 주세요", backup: "지사장(기본 경로)", channel: { label: "위컴 1:1", href: "/admin/quotes" }, gaps: [], namesHidden: true }
    const NAMES = /담당자샘플갑|담당자샘플을|지사장샘플병/
    for (const [question, card] of [
      ["견적서 담당 누구야?", named("kr")],
      ["점심 메뉴 누구한테 물어?", named("unknown")],
    ] as const) {
      const { deps } = bridge({ orchestratorDeps: () => ({ ...fakeDeps().deps, resolveContact: async () => card }) })
      const reply = await answerWecomMessage(message({ chattype: "group", chatid: "room-1", text: `@갈매봇 ${question}` }), deps)
      expect(reply.markdown, question).not.toMatch(NAMES)
      const single = await answerWecomMessage(message({ text: question }), deps)
      expect(single.markdown, question).toMatch(NAMES)
    }
    // 서버 연결이 이미 역할만 실은 카드는 그대로 — 역할·연락 방법 종류가 방에 나간다.
    const { deps } = bridge({ orchestratorDeps: () => ({ ...fakeDeps().deps, resolveContact: async () => roleOnly }) })
    const reply = await answerWecomMessage(message({ chattype: "group", text: "@갈매봇 견적서 담당 누구야?" }), deps)
    expect(reply.markdown).toContain("BD 팀 매니저")
    expect(reply.markdown).toContain("위컴 1:1")
  })

  it("쓰기 요청 — 위컴에서는 실행·미리보기 표를 만들지 않는다(단체방은 1:1 안내, 1:1 은 값이 모자라면 되묻기)", async () => {
    const group = bridge()
    const g = await answerWecomMessage(message({ chattype: "group", text: "T1 카메라 견적 초안 만들어 줘" }), group.deps)
    expect(g.markdown).toContain(GROUP_SCOPE_TEXT)
    expect(group.preview).not.toHaveBeenCalled()
    expect(group.execute).not.toHaveBeenCalled()

    const single = bridge()
    const s = await answerWecomMessage(message({ text: "T1 카메라 3대 다음 주 화요일 배송 예정 잡아 줘" }), single.deps)
    expect(s.outcome).toBe("answered")
    expect(single.execute).not.toHaveBeenCalled()
  })

  it("1:1 쓰기 미리보기 — 요지와 \"어드민에서 확인\" 주소만, 표(ticket)는 싣지 않는다", async () => {
    const order: OrderTicket = {
      id: "o-1",
      type: "hw.movement.plan",
      risk: "R1",
      icon: "stock",
      title: "HW 배송 예정 등록",
      target: { label: "받는 곳(샘플)", meta: "HW 배송 예정" },
      fields: [{ key: "product", label: "품목", value: "T1 카메라" }],
      confirmLabel: "배송 예정 등록",
      doneText: "",
      undo: "none",
      state: "draft",
      createdAt: 0,
      expiresAt: 0,
      server: { ticket: "SECRET-TICKET", directHref: "/admin/hardware", directLabel: "HW 화면 열기" },
    }
    const blocks: AiBlock[] = [
      { kind: "text", text: "배송 예정 T1 카메라 3대를 등록할 준비가 됐습니다. 카드에서 확인하면 실행합니다." },
      { kind: "order", orderId: "o-1" },
    ]
    const { deps } = bridge({
      orchestratorDeps: () => ({ ...fakeDeps().deps, previewWrite: async () => ({ blocks, order }) }),
      collectTurn: async (input, orchestrator) => {
        const result = await orchestrator.previewWrite!("hw_plan", { text: input.text, actor: input.actor, context: null, now: input.now })
        return { blocks: result.blocks, orders: result.order ? [result.order] : [] }
      },
    })
    const reply = await answerWecomMessage(message({ text: "T1 카메라 3대 배송 예정 잡아 줘" }), deps)
    expect(reply.markdown).toContain("HW 배송 예정 등록 미리보기")
    expect(reply.markdown).toContain(WRITE_NOT_HERE)
    expect(reply.markdown).not.toContain("SECRET-TICKET")
    expect(reply.markdown).not.toContain("카드에서 확인하면 실행합니다")
    expect(reply.markdown).toMatch(/https:\/\/example\.test\/admin\//)
  })
})

describe("묻기 근거 — 단체방은 공개 문서만, 1:1 은 그대로", () => {
  // 서버 연결이 내부 근거(정리 지식·선례·내부 문서)를 실어 보낸 경우 — 단체방 답에는 공개 문서만 실려야 한다(브리지 잠금).
  // 모든 문장은 샘플이다. 내부 근거 문장에는 "샘플내부" 표시를 넣어 새는지 본다.
  const PUBLIC_DOC: InternalPublicDocEvidence = {
    kind: "public_doc",
    id: "doc-recording",
    title: "수업 녹화 안내(샘플)",
    heading: "시작하기",
    summary: "수업 녹화는 수업 설정 화면에서 켤 수 있습니다.",
    excerpt: "수업 녹화는 수업 설정 화면에서 켤 수 있습니다. 녹화 항목을 켭니다.",
    urlPath: "/support",
    confirmed: true,
    customerUse: "allowed",
    asOf: null,
    sources: [{ id: "doc-recording", label: "수업 녹화 안내(샘플)" }],
  }
  const INTERNAL_PARTS: InternalEvidenceParts = {
    curated: [
      {
        kind: "curated",
        id: "curated-recording",
        title: "수업 녹화 샘플내부원칙",
        summary: "수업 녹화 문의는 샘플내부원칙에 따라 먼저 기관 설정을 봅니다.",
        status: "confirmed",
        externalUse: "internal_only",
        handling: ["수업 녹화 샘플내부절차를 확인한다"],
        recommendedTags: [],
        confirmed: true,
        customerUse: "internal_only",
        asOf: "2026-10-01",
        sources: [{ id: "docs/sample-internal-2026-10-01.md", label: "샘플내부 문서" }],
      },
    ],
    incidents: [
      {
        kind: "incident",
        id: "incident-recording",
        caseId: "S-1",
        title: "수업 녹화 샘플내부선례",
        summary: "수업 녹화가 꺼진 샘플내부선례입니다.",
        steps: ["샘플내부선례 확인"],
        confirmed: true,
        customerUse: "review",
        asOf: null,
        sources: [{ id: "docs/sample-incident.md", label: "[선례] 샘플내부선례" }],
      },
    ],
    publicDocs: [PUBLIC_DOC],
    internalDocs: [
      {
        kind: "internal_doc",
        id: "internal-recording",
        title: "수업 녹화 샘플내부문서",
        heading: "운영",
        summary: "수업 녹화 샘플내부문서 발췌입니다.",
        excerpt: "수업 녹화 샘플내부문서 발췌입니다.",
        confirmed: null,
        customerUse: "internal_only",
        asOf: null,
        sources: [{ id: "internal-recording", label: "샘플내부문서" }],
      },
    ],
    publicAnswer: null,
    internalDraft: "샘플내부초안 — 내부 문서가 섞인 위젯 답",
  }
  const INTERNAL_MARK = /샘플내부/

  function evidenceBridge(parts: InternalEvidenceParts) {
    const evidence = vi.fn(async () => parts)
    const { deps } = bridge({ orchestratorDeps: () => ({ ...fakeDeps().deps, knowledge: { evidence } }) })
    return { deps, evidence }
  }

  it("단체방 — 내부 근거가 같이 와도 공개 문서로만 답하고 \"내부용\" 줄이 없다", async () => {
    const { deps, evidence } = evidenceBridge(INTERNAL_PARTS)
    const reply = await answerWecomMessage(message({ chattype: "group", chatid: "room-1", text: "@갈매봇 수업 녹화는 어떻게 해?" }), deps)
    expect(evidence).toHaveBeenCalled()
    expect(reply.outcome).toBe("answered")
    expect(reply.markdown).toContain("수업 설정 화면")
    expect(reply.markdown).not.toMatch(INTERNAL_MARK)
    expect(reply.markdown).not.toContain(INTERNAL_ONLY_LINE)
  })

  it("단체방 — 내부 근거만 있으면 근거 없음으로 답한다(내부 문장을 내지 않는다)", async () => {
    const { deps } = evidenceBridge({ ...INTERNAL_PARTS, publicDocs: [] })
    const reply = await answerWecomMessage(message({ chattype: "group", text: "@갈매봇 수업 녹화는 어떻게 해?" }), deps)
    expect(reply.markdown).toContain("근거를 찾지 못했습니다")
    expect(reply.markdown).not.toMatch(INTERNAL_MARK)
  })

  it("1:1 — 내부 근거를 그대로 쓰고 \"내부용\" 줄을 단다", async () => {
    const { deps } = evidenceBridge(INTERNAL_PARTS)
    const reply = await answerWecomMessage(message({ text: "수업 녹화는 어떻게 해?" }), deps)
    expect(reply.markdown).toMatch(INTERNAL_MARK)
    expect(reply.markdown.split("\n")[0]).toBe(INTERNAL_ONLY_LINE)
  })
})

describe("상담 내역 — 단체방은 통째로 막고, 1:1 은 역할대로", () => {
  // 가짜 상담 찾기 결과 — 실제 findConsultations 와 같은 꼴. 이름·요지는 샘플 값.
  const RESULT: ConsultationSearchResult = {
    items: [
      { id: "c-1", source: "channel_talk", date: "2026-11-20", who: "샘플고객학원", summary: "녹화 파일 문의(샘플요지)", status: "종료", href: "/admin/channel-talk", linkKind: "channel_talk_conversation" },
    ],
    total: 4,
    more: 3,
    period: null,
    periodUnsupported: false,
    basis: { customer: "샘플고객학원", customerFrom: "question", keywords: [], scanned: [], capped: false, coverageFrom: null, semantic: false },
    restricted: false,
    partial: false,
    failed: [],
  }

  function consultationBridge() {
    const consultations = vi.fn(async () => RESULT)
    const consultationCount = vi.fn(async () => 3)
    const seen: string[] = []
    const { deps } = bridge({
      orchestratorDeps: (_admin, chatType) => {
        seen.push(chatType)
        const base = fakeDeps().deps
        return { ...base, knowledge: { ...base.knowledge, consultationCount }, consultations }
      },
    })
    return { deps, consultations, consultationCount, seen }
  }

  it("단체방 — 상담 내역 질문은 \"1:1 로\" 안내만, 목록·요지·건수가 나가지 않고 찾기를 부르지 않는다", async () => {
    const { deps, consultations } = consultationBridge()
    for (const text of ["샘플고객학원 상담 최근에 있었나?", "샘플고객학원 상담 이력 보여줘", "지난달 문의 뭐였지?"]) {
      const reply = await answerWecomMessage(message({ chattype: "group", chatid: "room-1", text: `@갈매봇 ${text}` }), deps)
      expect(reply.outcome, text).toBe("answered")
      expect(reply.markdown, text).toContain(GROUP_SCOPE_TEXT)
      expect(reply.markdown, text).not.toMatch(/샘플고객학원|샘플요지|4건|3건|상담 내역 보기/)
    }
    expect(consultations).not.toHaveBeenCalled()
  })

  it("단체방 — 묻기 답에 \"관련 상담 n건\" 줄이 붙지 않고, 건수를 세지도 않는다", async () => {
    const { deps, consultationCount } = consultationBridge()
    const reply = await answerWecomMessage(message({ chattype: "group", text: "@갈매봇 수업 녹화는 어떻게 해?" }), deps)
    expect(reply.markdown).toContain("수업 녹화")
    expect(reply.markdown).not.toMatch(/관련 상담|상담 내역 보기/)
    expect(consultationCount).not.toHaveBeenCalled()
  })

  it("1:1 — 상담 내역 질문은 찾기를 부르고 결론·목록을 싣는다, 묻기 답에는 관련 상담 줄", async () => {
    const { deps, consultations, consultationCount } = consultationBridge()
    const list = await answerWecomMessage(message({ text: "샘플고객학원 상담 최근에 있었나?" }), deps)
    expect(consultations).toHaveBeenCalled()
    expect(list.markdown).toContain("상담 4건을 찾았습니다")
    expect(list.markdown).toContain("샘플요지")
    expect(list.markdown).toMatch(/https:\/\/example\.test\/admin\/channel-talk/)

    const ask = await answerWecomMessage(message({ text: "수업 녹화는 어떻게 해?" }), deps)
    expect(consultationCount).toHaveBeenCalled()
    expect(ask.markdown).toContain("관련 상담 3건")
  })

  it("1:1 — 상담 글을 볼 수 없는 역할(restricted)이면 건수만, 요지·고객 이름은 없다", async () => {
    const restricted: ConsultationSearchResult = { ...RESULT, items: [], restricted: true }
    const { deps } = bridge({ orchestratorDeps: () => ({ ...fakeDeps().deps, consultations: async () => restricted }) })
    const reply = await answerWecomMessage(message({ text: "상담 최근에 있었나?" }), deps)
    expect(reply.markdown).toContain("상담 4건이 있습니다")
    expect(reply.markdown).not.toContain("샘플요지")
  })
})

describe("위컴 글 모양", () => {
  it("사내 근거가 섞인 답에는 맨 앞에 \"내부용 — 그대로 보내지 마세요\"", () => {
    const text = formatTurnMarkdown({
      siteUrl: SITE,
      orders: [],
      blocks: [
        {
          kind: "answer",
          card: {
            title: "답",
            target: { label: "질문" },
            answer: "지사장 승인 뒤 처리합니다.",
            steps: ["사유를 적는다", "승인을 받는다"],
            confidence: "needs-check",
            sources: [{ title: "샘플 정책", kind: "internal", status: "needs-check", externalUse: false }],
          },
        } as AiBlock,
      ],
    })
    const lines = text.split("\n")
    expect(lines[0]).toBe(INTERNAL_ONLY_LINE)
    expect(lines[1]).toBe("**지사장 승인 뒤 처리합니다.**")
    expect(lines).toContain("1. 사유를 적는다")
    expect(lines).toContain("2. 승인을 받는다")
  })

  it("공개 근거만이면 내부용 줄이 없다", () => {
    const text = formatTurnMarkdown({
      siteUrl: SITE,
      orders: [],
      blocks: [
        {
          kind: "answer",
          card: {
            title: "답",
            target: { label: "질문" },
            answer: "설정 화면에서 켭니다.",
            confidence: "confirmed",
            sources: [{ title: "공개 안내", kind: "public", status: "confirmed", externalUse: true }],
          },
        } as AiBlock,
      ],
    })
    expect(text).not.toContain(INTERNAL_ONLY_LINE)
  })

  it("긴 답은 줄 단위로 상한 안에서 자르고 안내 줄을 붙인다", () => {
    const blocks: AiBlock[] = Array.from({ length: 200 }, (_, i) => ({ kind: "text", text: `${i}번째 줄 — 아주 긴 설명이 이어집니다 아주 긴 설명이 이어집니다.` }))
    const text = formatTurnMarkdown({ siteUrl: SITE, orders: [], blocks })
    expect(text.length).toBeLessThanOrEqual(MAX_CHARS)
    expect(text.endsWith(TRUNCATED_LINE)).toBe(true)
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(20480)
  })

  it("등록되지 않은 주소는 링크로 싣지 않는다", () => {
    const text = formatTurnMarkdown({
      siteUrl: SITE,
      orders: [],
      blocks: [{ kind: "deny", card: { title: "막힘", target: { label: "x", meta: "" }, text: "화면에서", openLabel: "열기", openHref: "https://evil.test/x" } }],
    })
    expect(text).not.toContain("evil.test")
  })
})
