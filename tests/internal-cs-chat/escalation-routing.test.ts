import { describe, expect, it } from "vitest"

import {
  buildSmartHandoffMessage,
  buildSmartHqDraft,
  convertKstToBeijingTime,
  DRAFT_PLACEHOLDER,
  extractEscalationContext,
} from "@/lib/internal-cs-chat/escalation-routing"

describe("escalation-routing", () => {
  describe("convertKstToBeijingTime", () => {
    it("converts HH:mm KST correctly to Beijing UTC+8 (-1 hour)", () => {
      expect(convertKstToBeijingTime("18:30")).toBe("17:30 (北京时间, UTC+8)")
      expect(convertKstToBeijingTime("09:00")).toBe("08:00 (北京时间, UTC+8)")
      expect(convertKstToBeijingTime("00:15")).toBe("23:15 (北京时间, UTC+8)")
    })

    it("returns null for empty input", () => {
      expect(convertKstToBeijingTime(null)).toBeNull()
      expect(convertKstToBeijingTime("")).toBeNull()
    })
  })

  describe("extractEscalationContext", () => {
    it("routes Camera questions to Zhang Bing & SunLogin", () => {
      const ctx = extractEscalationContext({
        userMessages: ["T1 카메라 연결이 안 되고 CameraCMS에서 검색은 되는데 접속 실패 뜹니다. 18:30 발생."],
      })

      expect(ctx.domain).toBe("camera")
      expect(ctx.contact.primaryContact).toContain("张冰")
      expect(ctx.contact.remoteTool).toContain("SunLogin")
      expect(ctx.contact.wecomMention).toContain("@张冰")
      expect(ctx.beijingTime).toBe("17:30 (北京时间, UTC+8)")
    })

    it("routes Board & touch questions to Wang Lian / Tang Yilei and records only that an account ID exists", () => {
      const ctx = extractEscalationContext({
        userMessages: ["전자칠판 86인치 2대에서 고스트 터치가 간헐적으로 발생합니다. UID 92489598"],
      })

      expect(ctx.domain).toBe("board")
      expect(ctx.contact.primaryContact).toContain("Wang Lian")
      expect(ctx.hasAccountId).toBe(true)
      expect(JSON.stringify(ctx)).not.toContain("92489598")
    })

    it("routes Network disconnect and code 56/57 to Yu Jie", () => {
      const ctx = extractEscalationContext({
        userMessages: ["수업 중 학생 41회 튕김 및 코드 56 오류. 게이트웨이는 정상인데 서버 연결이 불안정합니다."],
      })

      expect(ctx.domain).toBe("network")
      expect(ctx.contact.primaryContact).toContain("于杰")
      expect(ctx.errorCode).toBe("56")
      expect(ctx.contact.wecomMention).toContain("@于杰")
    })

    it("routes AI classroom & evaluation questions to Zhang Yaru & He Rui", () => {
      const ctx = extractEscalationContext({ userMessages: ["ClassIn 6.0.9 AI 강의평가 리포트 생성이 지연되고 있습니다."] })

      expect(ctx.domain).toBe("ai_classroom")
      expect(ctx.contact.primaryContact).toContain("张雅茹")
      expect(ctx.appVersion).toBe("6.0.9")
    })

    it("detects feature requests and tags with 【需求】", () => {
      const ctx = extractEscalationContext({ userMessages: ["전자칠판 판서 색상 프리셋 저장 기능 추가 요청드립니다."] })

      expect(ctx.issueType).toBe("requirement")
      expect(ctx.issueTypeTag).toBe("【需求】")
    })

    it("takes the institution only from customer_context, never from the user's or AI's text", () => {
      const fromText = extractEscalationContext({ userMessages: ["학원: 가나다어학원 전자칠판 터치 불량"] })
      expect(fromText.institution).toBeNull()

      const fromContext = extractEscalationContext({
        userMessages: ["전자칠판 터치 불량"],
        customerContext: { institution: "테스트 기관 A" },
      })
      expect(fromContext.institution).toBe("테스트 기관 A")
    })
  })

  describe("template builders", () => {
    // 지어낸 값: 전화·이메일·3-3-6 계좌·UID·생년월일.
    const PII_MESSAGE = [
      "T1 카메라 화질이 19:00부터 떨어집니다. 담당 선생님 연락처 010-2345-6789, parent@example.com",
      "환불은 신한 110-123-456789 로 부탁드립니다. UID 12345678, 생년월일 1990-01-01",
    ].join("\n")
    const RAW_VALUES = ["010-2345-6789", "parent@example.com", "110-123-456789", "12345678", "1990-01-01"]
    const UNPERFORMED_FACTS = ["점검을 완료", "已排查", "검토 완료", "임시 안내 완료"]

    function piiContext(priority: string | null = "normal") {
      return extractEscalationContext({
        userMessages: [PII_MESSAGE],
        customerContext: { institution: "테스트 기관 A", contactPhone: "010-9999-8888" },
        title: "카메라 화질 문의",
        tags: ["area:camera"],
        priority,
        assigneeName: "CS 담당자",
      })
    }

    it("keeps raw PII out of the HQ and handoff drafts and reports how many values were masked", () => {
      const ctx = piiContext()
      const drafts = [buildSmartHqDraft(ctx), buildSmartHandoffMessage(ctx)]
      for (const draft of drafts) {
        for (const raw of RAW_VALUES) expect(draft).not.toContain(raw)
        expect(draft).not.toContain("010-9999-8888")
      }
      // 전화·이메일·계좌·UID·생년월일 5건
      expect(ctx.redactionCount).toBe(5)
    })

    it("never states checks that were not performed and leaves placeholders instead", () => {
      const ctx = piiContext()
      const drafts = [buildSmartHqDraft(ctx), buildSmartHandoffMessage(ctx)].join("\n")
      for (const phrase of UNPERFORMED_FACTS) expect(drafts).not.toContain(phrase)
      expect(drafts).toContain(DRAFT_PLACEHOLDER)
    })

    it("does not pick up institution or time quoted in an AI answer — AI text is not an input", () => {
      // AI 답(다른 고객 선례 인용)을 넣을 칸이 입력 형에 없다. 사용자 글에 시각이 없으면 시각 칸은 비어 있다.
      const ctx = extractEscalationContext({ userMessages: ["녹화 파일이 안 보여요"] })
      const hq = buildSmartHqDraft(ctx)
      expect(ctx.kstTime).toBeNull()
      expect(ctx.institution).toBeNull()
      expect(hq).toContain("- 机构 : 확인 필요")
      expect(hq).toContain("확인 필요 (北京时间, UTC+8)")
    })

    it("follows conversation.priority in the handoff draft instead of a fixed HIGH", () => {
      expect(buildSmartHandoffMessage(piiContext("normal"))).toContain("우선순위 / 태그: NORMAL / area:camera")
      expect(buildSmartHandoffMessage(piiContext("normal"))).not.toContain("HIGH")
      expect(buildSmartHandoffMessage(piiContext(null))).toContain(`우선순위 / 태그: ${DRAFT_PLACEHOLDER} / area:camera`)
    })

    it("builds HQ draft with WeCom mention, buffering phrase, UTC+8 time and no account value", () => {
      const ctx = extractEscalationContext({ userMessages: ["T1 카메라 화질 저하 19:00 발생 UID 97846042"] })
      const hqDraft = buildSmartHqDraft(ctx)

      expect(hqDraft).toContain("@张冰")
      expect(hqDraft).toContain("百忙之中打扰您")
      expect(hqDraft).toContain("18:00 (北京时间, UTC+8)")
      expect(hqDraft).not.toContain("97846042")
      expect(hqDraft).toContain("대화에 계정 ID 있음")
      expect(hqDraft).toContain("【缺陷】")
    })
  })
})
