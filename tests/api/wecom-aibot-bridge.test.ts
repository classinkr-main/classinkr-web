import { describe, expect, it, vi } from "vitest"

import type { StaffIdentity } from "@/lib/admin-ai/server/actor"
import { collectTurn } from "@/lib/admin-ai/server/orchestrator"
import type { AiBlock, OrderTicket } from "@/lib/admin-ai/types"
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
