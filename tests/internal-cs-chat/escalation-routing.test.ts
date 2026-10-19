import { describe, expect, it } from "vitest"

import {
  buildSmartCustomerDraft,
  buildSmartHandoffMessage,
  buildSmartHqDraft,
  convertKstToBeijingTime,
  extractEscalationContext,
  HQ_DOMAINS,
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
      const text = "T1 카메라 연결이 안 되고 CameraCMS에서 검색은 되는데 접속 실패 뜹니다. 18:30 발생."
      const ctx = extractEscalationContext(text)

      expect(ctx.domain).toBe("camera")
      expect(ctx.contact.primaryContact).toContain("张冰")
      expect(ctx.contact.remoteTool).toContain("SunLogin")
      expect(ctx.contact.wecomMention).toContain("@张冰")
      expect(ctx.beijingTime).toBe("17:30 (北京时间, UTC+8)")
    })

    it("routes Board & touch questions to Wang Lian / Tang Yilei", () => {
      const text = "전자칠판 86인치 2대에서 고스트 터치가 간헐적으로 발생합니다. UID 92489598 쉴라의 영어 다이아그램"
      const ctx = extractEscalationContext(text)

      expect(ctx.domain).toBe("board")
      expect(ctx.contact.primaryContact).toContain("Wang Lian")
      expect(ctx.accountId).toBe("92489598")
      expect(ctx.institution).toBe("쉴라")
    })

    it("routes Network disconnect and code 56/57 to Yu Jie", () => {
      const text = "수업 중 학생 41회 튕김 및 코드 56 오류. 게이트웨이는 정상인데 서버 연결이 불안정합니다."
      const ctx = extractEscalationContext(text)

      expect(ctx.domain).toBe("network")
      expect(ctx.contact.primaryContact).toContain("于杰")
      expect(ctx.errorCode).toBe("56")
      expect(ctx.contact.wecomMention).toContain("@于杰")
    })

    it("routes AI classroom & evaluation questions to Zhang Yaru & He Rui", () => {
      const text = "ClassIn 6.0.9 AI 강의평가 리포트 생성이 지연되고 있습니다."
      const ctx = extractEscalationContext(text)

      expect(ctx.domain).toBe("ai_classroom")
      expect(ctx.contact.primaryContact).toContain("张雅茹")
      expect(ctx.appVersion).toBe("6.0.9")
    })

    it("detects feature requests and tags with 【需求】", () => {
      const text = "전자칠판 판서 색상 프리셋 저장 기능 추가 요청드립니다."
      const ctx = extractEscalationContext(text)

      expect(ctx.issueType).toBe("requirement")
      expect(ctx.issueTypeTag).toBe("【需求】")
    })
  })

  describe("template builders", () => {
    it("builds customer draft without exposing raw IPs or system secrets", () => {
      const text = "정율사관 B3 교실에서 ASIX NIC IP 172.17.0.52 충돌로 인터넷 끊김 발생"
      const ctx = extractEscalationContext(text, { assigneeName: "김철수" })
      const draft = buildSmartCustomerDraft(ctx)

      expect(draft).toContain("정율사관")
      expect(draft).toContain("김철수")
      expect(draft).not.toContain("172.17.0.52")
      expect(draft).not.toContain("ASIX")
      expect(draft).toContain("확인된 현상 및 원인")
    })

    it("builds HQ draft with WeCom mention, buffering phrase, and UTC+8 time", () => {
      const text = "철의국어입시학원 T1 카메라 화질 저하 19:00 발생 UID 97846042"
      const ctx = extractEscalationContext(text)
      const hqDraft = buildSmartHqDraft(ctx)

      expect(hqDraft).toContain("@张冰")
      expect(hqDraft).toContain("百忙之中打扰您")
      expect(hqDraft).toContain("18:00 (北京时间, UTC+8)")
      expect(hqDraft).toContain("97846042")
      expect(hqDraft).toContain("【缺陷】")
    })
  })
})
