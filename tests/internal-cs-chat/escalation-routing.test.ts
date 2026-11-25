import { describe, expect, it } from "vitest"

import {
  buildSmartHandoffMessage,
  buildSmartHqDraft,
  convertKstToBeijingTime,
  DRAFT_PLACEHOLDER,
  classifyHqDomain,
  domainForTag,
  extractEscalationContext,
  HQ_DOMAIN_KEYS,
  HQ_DOMAINS,
} from "@/lib/internal-cs-chat/escalation-routing"

// 시험은 담당자 이름 대신 도메인 키와 표의 구조를 단정한다(2026-11 B2, R14). 담당 교체로 이름이 바뀌어도
// 분류·초안 조립이 맞으면 통과해야 한다. 표의 값 자체는 근거 문서(source)와 기준일(verifiedAt)로 관리한다.

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
    it("routes Camera questions to the camera domain with its remote tool and mention", () => {
      const ctx = extractEscalationContext({
        userMessages: ["T1 카메라 연결이 안 되고 CameraCMS에서 검색은 되는데 접속 실패 뜹니다. 18:30 발생."],
      })

      expect(ctx.domain).toBe("camera")
      expect(ctx.contact).toBe(HQ_DOMAINS.camera)
      expect(ctx.contact.remoteTool).toContain("SunLogin")
      expect(ctx.confidence).toBe("high")
      expect(ctx.beijingTime).toBe("17:30 (北京时间, UTC+8)")
    })

    it("routes Board & touch questions to the board domain and records only that an account ID exists", () => {
      const ctx = extractEscalationContext({
        userMessages: ["전자칠판 86인치 2대에서 고스트 터치가 간헐적으로 발생합니다. UID 92489598"],
      })

      expect(ctx.domain).toBe("board")
      expect(ctx.contact).toBe(HQ_DOMAINS.board)
      expect(ctx.hasAccountId).toBe(true)
      expect(JSON.stringify(ctx)).not.toContain("92489598")
    })

    it("routes Network disconnect and code 56/57 to the network domain", () => {
      const ctx = extractEscalationContext({
        userMessages: ["수업 중 학생 41회 튕김 및 코드 56 오류. 게이트웨이는 정상인데 서버 연결이 불안정합니다."],
      })

      expect(ctx.domain).toBe("network")
      expect(ctx.contact).toBe(HQ_DOMAINS.network)
      expect(ctx.errorCode).toBe("56")
    })

    it("routes AI classroom & evaluation questions to the ai_classroom domain", () => {
      const ctx = extractEscalationContext({ userMessages: ["ClassIn 6.0.9 AI 강의평가 리포트 생성이 지연되고 있습니다."] })

      expect(ctx.domain).toBe("ai_classroom")
      expect(ctx.contact).toBe(HQ_DOMAINS.ai_classroom)
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

      expect(hqDraft).toContain(HQ_DOMAINS.camera.wecomMention)
      expect(hqDraft).toContain(`담당표 근거: ${HQ_DOMAINS.camera.source}`)
      expect(hqDraft).toContain("百忙之中打扰您")
      expect(hqDraft).toContain("18:00 (北京时间, UTC+8)")
      expect(hqDraft).not.toContain("97846042")
      expect(hqDraft).toContain("대화에 계정 ID 있음")
      expect(hqDraft).toContain("【缺陷】")
    })
  })

  describe("HQ contact table shape (R14)", () => {
    it("every row has a document source, a document date and a mention for its primary contact", () => {
      for (const key of HQ_DOMAIN_KEYS) {
        const row = HQ_DOMAINS[key]
        expect(row.domain).toBe(key)
        expect(row.source).toMatch(/^docs\/active\/cs-error-cases-(?:index|workflow-rules)-2026-10-02\.md:\d+/)
        expect(row.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(row.wecomMention.startsWith("@")).toBe(true)
        expect(row.recommendedTag).toMatch(/^area:[a-z_]+$/)
      }
    })

    it("has no placeholder mention without a document basis", () => {
      for (const key of HQ_DOMAIN_KEYS) expect(HQ_DOMAINS[key].wecomMention).not.toContain("HQ-Tech")
    })

    it("covers the §7 areas that were missing (remote/hardware 1st line, API lead, infra, security, course data log, homework TAPD)", () => {
      for (const key of ["hardware_remote", "api", "infra_data", "security_account", "course_data_log", "homework_tapd"]) {
        expect(HQ_DOMAIN_KEYS).toContain(key)
      }
      // API 메일 창구(datasub·콜백·VA)는 위컴이 아니라 메일로 — 주소는 코드에 두지 않는다.
      expect(HQ_DOMAINS.api.channelNote).toContain("datasub")
      expect(HQ_DOMAINS.api.channelNote).not.toMatch(/[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
    })

    it("billing lists one person (§7: name with alias) and mentions only that person", () => {
      expect(HQ_DOMAINS.billing.primaryContact).not.toContain(",")
      expect(HQ_DOMAINS.billing.wecomMention.split("@").filter(Boolean)).toHaveLength(1)
    })
  })

  describe("classifyHqDomain (score-based, R20)", () => {
    // 도메인마다 닿는 입력이 적어도 하나 있다(general 은 아무 규칙에도 안 걸릴 때).
    const REACH: Record<string, string> = {
      general: "안녕하세요 문의드립니다",
      network: "수업 중 코드 54 로 학생이 튕깁니다",
      hardware_remote: "원격 지원 요청드립니다 하드웨어 1차 확인 부탁",
      camera: "T1 카메라 화질이 흐립니다",
      board: "전자칠판 고스트 터치",
      hardware_as: "전자칠판 액정 파손으로 A/S 보증 판정 요청",
      software_pen: "판서 필기가 밀립니다",
      ai_classroom: "AI 강의평가 리포트가 안 나와요",
      lms_agentin: "LMS 숙제 채점이 안 됩니다",
      homework_tapd: "숙제 화면 렌더링이 깨져요",
      ai_risk: "AI 리스크 모니터 오탐이 많아요",
      api: "Open API 콜백이 안 옵니다",
      infra_data: "데이터 저장 지역이 어디인가요",
      sms: "SMS 인증번호가 안 와요",
      billing: "인보이스 결제 금액 문의",
      security_account: "백엔드 계정 권한 문의",
      cloud_cdn: "클라우드 드라이브 업로드 실패",
      course_data_log: "삭제한 학생이 청강생으로 남아요",
      recording: "클라우드 녹화 4001 오류",
      mirroring: "무선 미러링이 안 됩니다",
    }

    it("reaches every domain in the table with at least one input", () => {
      expect(Object.keys(REACH).sort()).toEqual([...HQ_DOMAIN_KEYS].sort())
      for (const [domain, text] of Object.entries(REACH)) {
        expect({ text, domain: classifyHqDomain(text).domain }).toEqual({ text, domain })
      }
    })

    it.each([
      ["매핑 설정이 안 돼요", "network"],
      ["타이핑이 느려요", "network"],
      ["쇼핑몰 연동", "network"],
      ["Oops 오류가 뜨고 stops 됩니다", "board"],
      ["견적서 문자로 보내주세요", "sms"],
    ])("does not misroute a single word: %s (not %s)", (text, wrong) => {
      expect(classifyHqDomain(text).domain).not.toBe(wrong)
    })

    it("lets the stronger signal win: recording beats a lone 끊김", () => {
      expect(classifyHqDomain("녹화 중 끊김이 있어요").domain).toBe("recording")
    })

    it("still treats a real ping as network", () => {
      expect(classifyHqDomain("핑 테스트 결과 손실이 큽니다 네트워크 확인").domain).toBe("network")
      expect(classifyHqDomain("ping 200ms 끊김").domain).toBe("network")
    })

    it("marks Korean branch work (quote, deposit, tax invoice, shipping) as krTopic", () => {
      for (const text of ["견적서 문자로 보내주세요", "세금계산서 발행", "입금 확인 부탁", "출고 언제 되나요", "홈페이지 견적 페이지 오류"]) {
        expect({ text, kr: classifyHqDomain(text).krTopic }).toEqual({ text, kr: true })
      }
      expect(classifyHqDomain("T1 카메라 화질").krTopic).toBe(false)
    })

    it("returns two candidates when the score is low or close", () => {
      const low = classifyHqDomain("끊김")
      expect(low.domain).toBe("general")
      expect(low.confidence).toBe("low")
      expect(low.candidates[0]?.domain).toBe("network")

      const close = classifyHqDomain("녹화 파일 미러링")
      expect(close.confidence).toBe("low")
      expect(close.candidates.map((item) => item.domain).sort()).toEqual(["mirroring", "recording"])

      const none = classifyHqDomain("안녕하세요")
      expect(none).toMatchObject({ domain: "general", confidence: "none", candidates: [] })
    })

    it("handles area: tags for every domain (recommendedTag and area:<key>)", () => {
      for (const key of HQ_DOMAIN_KEYS) {
        expect(domainForTag(HQ_DOMAINS[key].recommendedTag)).toBe(key)
        expect(domainForTag(`area:${key}`)).toBe(key)
        expect(classifyHqDomain("안녕하세요", [HQ_DOMAINS[key].recommendedTag])).toMatchObject({ domain: key, fromTag: true })
      }
      expect(domainForTag("area:company")).toBeNull()
    })

    it("with several area tags picks the one the text supports (not simply the last tag)", () => {
      expect(classifyHqDomain("T1 카메라 화질", ["area:camera", "area:billing"]).domain).toBe("camera")
      expect(classifyHqDomain("T1 카메라 화질", ["area:billing", "area:camera"]).domain).toBe("camera")
      expect(classifyHqDomain("안녕하세요", ["area:sms", "area:billing"]).domain).toBe("sms")
    })

    it("does not read Oops/stops as an OPS device", () => {
      const ctx = extractEscalationContext({ userMessages: ["Oops 화면이 stops 됩니다"] })
      expect(ctx.deviceModel).toBeNull()
    })
  })
})
