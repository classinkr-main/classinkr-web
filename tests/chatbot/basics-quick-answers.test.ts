import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  BASIC_QUICK_ANSWERS,
  findBasicQuickAnswers,
  isPlainFactQuestion,
} from "@/lib/chatbot/quick-answers-basics"
import { evaluateChatbotQuery, WEAK_SOURCE_DRAFT_ANSWER } from "@/lib/chatbot/service"
import { getDocPath, listDocs } from "@/lib/docs"

interface FirstContactCase {
  id: string
  group: string
  question: string
  expectTopic: string | null
}

const evalSet = JSON.parse(
  readFileSync(join(process.cwd(), "data/chatbot-first-contact-set.json"), "utf8")
) as { cases: FirstContactCase[] }

type Answer = Awaited<ReturnType<typeof evaluateChatbotQuery>>

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

// 첫 방문자가 한 줄로 묻는 사실 질문은 검수된 답과 공개 문서에 이어져야 한다.
// 2026-11-13 점검에서 이런 질문 180개 가운데 76%가 엉뚱한 문서 조각·오분류·되묻기로 나갔다.
describe("basics quick answers dataset", () => {
  it("keeps unique ids", () => {
    const ids = BASIC_QUICK_ANSWERS.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^basics-[a-z0-9-]+$/)
  })

  it("grounds every answer in a published public doc, or declares it has none", () => {
    const publicDocPaths = new Set(
      listDocs()
        .filter((doc) => doc.status !== "draft" && !doc.noindex && (doc.visibility ?? "public") === "public")
        .map((doc) => getDocPath(doc))
    )

    for (const entry of BASIC_QUICK_ANSWERS) {
      if (entry.docPath === null) continue
      expect(publicDocPaths.has(entry.docPath), `${entry.id} → ${entry.docPath}`).toBe(true)
    }
    // 문서 근거 없이 정책으로만 답하는 항목이 늘어나면 사실이 문서에서 떨어져 나간다는 신호다.
    expect(BASIC_QUICK_ANSWERS.filter((entry) => entry.docPath === null).length).toBeLessThanOrEqual(3)
  })

  it("points to a consultation button only when the answer shows one", () => {
    for (const entry of BASIC_QUICK_ANSWERS) {
      const text = entry.answer.join("\n")
      const mentionsDemoButton = text.includes("[도입 상담 남기기]")
      const mentionsSupportButton = text.includes("[실시간 상담 연결]")

      if (entry.handoff === "demo") expect(mentionsDemoButton, entry.id).toBe(true)
      if (entry.handoff === "support") expect(mentionsSupportButton, entry.id).toBe(true)
      if (!entry.handoff) {
        expect(mentionsDemoButton, entry.id).toBe(false)
        expect(mentionsSupportButton, entry.id).toBe(false)
      }
    }
  })

  it("never promises prices or asks for identifiers, and stays short and plain", () => {
    for (const entry of BASIC_QUICK_ANSWERS) {
      const text = entry.answer.join("\n")

      expect(entry.answer.length, entry.id).toBeGreaterThanOrEqual(1)
      expect(entry.answer.length, entry.id).toBeLessThanOrEqual(3)
      expect(text.length, entry.id).toBeLessThanOrEqual(420)
      // 가격·할인·환불 약속, 외부 주소·연락처, 굵게·이모지 금지
      expect(text, entry.id).not.toMatch(/\d[\d,]*\s*(?:원|만\s*원)(?![가-힣])/)
      expect(text, entry.id).not.toMatch(/https?:\/\/|www\./)
      expect(text, entry.id).not.toMatch(/\d{2,3}-\d{3,4}-\d{4}|@classin\.com/)
      expect(text, entry.id).not.toMatch(/\*\*|[\u{1F300}-\u{1FAFF}]/u)
      expect(text, entry.id).not.toMatch(/(?:무료로|할인해|환불해)\s*드릴게요|최적의|완벽하게|원스톱/)
      // 식별 정보를 채팅창에 적으라고 하지 않는다
      expect(text, entry.id).not.toMatch(
        /(?:아이디|전화번호|휴대폰\s*번호|비밀번호|시리얼|카드\s*번호|계좌)(?:와|과|를|을)?[^.\n]{0,20}(?:적어|입력해|남겨|보내)\s*주세요/
      )
      expect(entry.suggestedQuestions.length, entry.id).toBeGreaterThanOrEqual(2)
    }
  })

  it("keeps the agreed stance on origin, named customers and capacity", () => {
    const answerOf = (id: string) => BASIC_QUICK_ANSWERS.find((entry) => entry.id === id)!.answer.join("\n")

    // 회사 국적: 회사 소개(/about) 페이지에 공개된 사무소 위치를 그대로 말한다(글로벌 HQ 싱가포르, EEO 본사·R&D 센터 베이징,
    // 한국 법인 서울 목동). "공개 안내에 없다"고 하지 않고, 중국 회사다·아니다로 단정해 이름 붙이지도 않는다.
    for (const id of ["basics-company-origin", "basics-china-company-data"]) {
      expect(answerOf(id)).toContain("EEO")
      expect(answerOf(id)).toContain("이이오클래스인코리아")
      expect(answerOf(id)).toContain("싱가포르")
      expect(answerOf(id)).toContain("베이징")
      expect(answerOf(id)).toContain("회사 소개 페이지 기준")
      expect(answerOf(id)).not.toMatch(/본사\s*소재지[^.]{0,20}공개\s*안내에[^.]{0,12}(?:없|않)/)
      expect(answerOf(id)).not.toMatch(/중국\s*(?:회사|기업)(?:이|가|는)?\s*(?:맞|아니)|중국\s*(?:회사|기업)(?:예요|입니다|이에요)/)
    }
    // 대표 이름은 문서에 적힌 표기 그대로
    expect(answerOf("basics-company-ceo")).toContain("Song Junbo")
    // 특정 학원의 사용 여부는 확인하지 않는다
    expect(answerOf("basics-named-academy")).toContain("확인해 드릴 수 없어요")
    expect(answerOf("basics-named-academy")).not.toMatch(/세정|세\*\*/)
    // 최대 인원: 요금제마다 다르다는 점과 소개 자료 수치를 함께 말한다
    expect(answerOf("basics-max-participants")).toContain("요금제마다")
    expect(answerOf("basics-max-participants")).toContain("소개 자료")
    // 서버 위치: 어느 나라라고 말하지 않는다
    expect(answerOf("basics-data-server-location")).toContain("추측으로 말씀드리지")
    expect(answerOf("basics-data-server-location")).not.toMatch(/(?:한국|국내|중국|미국|해외)\s*서버에\s*(?:저장|있)/)
  })
})

describe("basics quick answers guard", () => {
  it("only takes short questions without a trouble signal", () => {
    expect(isPlainFactQuestion("맥북에도 깔리나요?")).toBe(true)
    // "~하면 안 되나요?"는 허락을 묻는 말이다
    expect(isPlainFactQuestion("전자칠판 꼭 사야하나요? 그냥 앱만 쓰면 안 되나요")).toBe(true)
    expect(isPlainFactQuestion("맥북에 깔았는데 실행이 안 돼요")).toBe(false)
    expect(isPlainFactQuestion("녹화본 다운로드 버튼이 회색이에요")).toBe(false)
  })

  it("leaves symptom and situational questions to the existing answers", () => {
    const questions = [
      "죄송한데요, 녹화본을 다운로드하려고 하는데 다운로드 버튼이 회색으로 비활성화되어 있습니다. 제 권한 문제일까요?",
      "정말 죄송한데요, 녹화본 다운로드를 눌렀더니 파일이 0KB로 받아집니다. 여러 번 해 봐도 같아요.",
      "갤럭시탭 S7(안드로이드 12)에서 화면 공유를 누르면 '지원되지 않는 기기'라고 뜹니다.",
      "캐시 삭제 방법대로 했는데도 수업 자료(PDF) 미리보기가 이전 버전으로 보입니다. 파일은 새 버전으로 교체했고요.",
      "학생 하나가 다시보기 영상을 다른 데 퍼뜨렸다는 얘기가 들립니다! 이거 막는 기능은 있는 겁니까 없는 겁니까!",
      "교실에 전자칠판 없이 노트북만으로도 하이브리드 수업 됩니까? 최소로 필요한 장비가 뭐예요?",
      "맥북에 깔았는데 로그인이 안 돼요",
      "대시보드 없이 학생 등록 돼요?",
    ]

    for (const question of questions) {
      expect(findBasicQuickAnswers(question.toLowerCase()), question).toEqual([])
    }
  })

  it("does not take over answers that were already curated and tested", () => {
    // 무료 체험, 소프트웨어 요금·플랜, 포지셔닝 비교, 정체 질문은 기존 검수 답이 맡는다.
    const questions = [
      "무료 체험 있나요?",
      "소프트웨어만 쓸 수 있나요?",
      "구독형이랑 충전형 차이가 뭐예요?",
      "계정당 플랜 비용은 어떻게 봐야 해요?",
      "클래스인이 다른 서비스랑 다른 점은 뭐예요?",
      "줌이랑 뭐가 달라요?",
      "뭐하는 회사야",
      "기본 스토리지 용량과 추가 단가는 얼마인가요?",
    ]

    for (const question of questions) {
      expect(findBasicQuickAnswers(question.toLowerCase()), question).toEqual([])
    }
  })

  it("answers both parts when two facts are asked together", () => {
    const matches = findBasicQuickAnswers("클래스인 맥북에도 깔리나요? 학생은 아이패드 쓰는데")
    expect(matches.map((entry) => entry.id)).toEqual(["basics-mac-support", "basics-mobile-device-support"])
  })
})

describe("first-contact fact questions", () => {
  const answers = new Map<string, Answer>()

  beforeAll(async () => {
    disableExternalChatbotServices()
    for (const testCase of evalSet.cases) {
      answers.set(testCase.id, await evaluateChatbotQuery(testCase.question, { generateAnswer: false }))
    }
  }, 120_000)

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it("keeps the eval set well-formed", () => {
    const ids = evalSet.cases.map((testCase) => testCase.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThanOrEqual(192)

    const topicIds = new Set(BASIC_QUICK_ANSWERS.map((entry) => entry.id))
    for (const testCase of evalSet.cases) {
      if (testCase.expectTopic) expect(topicIds.has(testCase.expectTopic), testCase.id).toBe(true)
    }
    // 모든 기본 사실 답이 적어도 한 질문으로 검증된다
    const covered = new Set(evalSet.cases.map((testCase) => testCase.expectTopic).filter(Boolean))
    const uncovered = [...topicIds].filter((id) => !covered.has(id))
    expect(uncovered).toEqual([])
  })

  it("never falls back to the generic clarify template or a weak doc suggestion", () => {
    const weak = evalSet.cases
      .filter((testCase) =>
        ["fallback", "doc_suggestion", "clarifying_question"].includes(answers.get(testCase.id)?.answerMode ?? "")
      )
      .map((testCase) => `${testCase.id}: ${testCase.question}`)
    expect(weak).toEqual([])
  })

  it("routes each question to the expected basics answer", () => {
    const missed: string[] = []

    for (const testCase of evalSet.cases) {
      const first = findBasicQuickAnswers(testCase.question.toLowerCase())[0]
      const answer = answers.get(testCase.id)?.answer ?? ""

      if (testCase.expectTopic === null) {
        // 기존 답이 맡는 질문: 기본 사실 답의 첫 문단으로 시작하면 가로챈 것이다.
        if (first && answer.startsWith(first.answer[0])) missed.push(`${testCase.id}: 기본 사실 답이 가로챔(${first.id})`)
        continue
      }
      const expected = BASIC_QUICK_ANSWERS.find((entry) => entry.id === testCase.expectTopic)!
      // 말투 계층이 앞에 공감 한마디를 붙일 수 있어 포함 여부로 본다.
      if (first?.id !== expected.id || !answer.includes(expected.answer[0])) {
        missed.push(`${testCase.id}: 기대=${expected.id} 먼저 맞은 답=${first?.id ?? "-"}`)
      }
    }

    expect(missed).toEqual([])
  })

  it("cites the grounding doc as the source of a basics answer", () => {
    for (const testCase of evalSet.cases) {
      if (!testCase.expectTopic) continue
      const expected = BASIC_QUICK_ANSWERS.find((entry) => entry.id === testCase.expectTopic)!
      if (!expected.docPath) continue
      expect(answers.get(testCase.id)?.sources[0]?.urlPath, testCase.id).toBe(expected.docPath)
    }
  })

  it("fixes the answers collected as wrong on 2026-11-13", () => {
    const answerOf = (id: string) => answers.get(id)!

    // 어느 나라 제품 → 드라이브 사용법이 나갔다
    expect(answerOf("shot-01").answer).toContain("EEO")
    expect(answerOf("shot-01").answer).not.toContain("드라이브")
    // 전자칠판 필수 여부 → 일반 전자칠판과 다른 점이 나갔다
    expect(answerOf("shot-02").answer.startsWith("아니요, 전자칠판은 필수가 아니에요.")).toBe(true)
    // 대표 → 스타터 가이드가 나갔다
    expect(answerOf("shot-03").answer).toContain("Song Junbo")
    expect(answerOf("shot-03").answer).not.toContain("스타터 가이드")
    // 원가 → OPS 구성 설명이 나갔다
    expect(answerOf("shot-04").answer).toContain("원가")
    expect(answerOf("shot-04").answer).toContain("안내하지 않아요")
    expect(answerOf("shot-04").answer).not.toMatch(/\d\s*원/)
    // 보관 기간 → 녹화 종류 구분이 나갔다
    expect(answerOf("shot-05").answer).toContain("자동 삭제")
    expect(answerOf("shot-05").answer).not.toMatch(/\d+\s*(?:개월|달|일)\s*(?:동안|간)?\s*보관/)
    // 최대 인원 → '접속' 때문에 로그인 문제 안내가 나갔다
    expect(answerOf("shot-06").answer).toContain("요금제마다")
    expect(answerOf("shot-06").answer).not.toContain("로그인이 안 되시는군요")
    expect(answerOf("shot-06").detectedCategory).not.toBe("troubleshooting")
    // 줌 대비 가격 → 가격 답이 맨 뒤로 밀렸다
    expect(answerOf("shot-07").answer.split("\n")[0]).toContain("숫자로 말씀드릴 수 없어요")
    // 특정 학원 → 스타터 가이드가 나갔다. 사용 여부를 확인해 주지 않는다.
    expect(answerOf("shot-08").answer).toContain("확인해 드릴 수 없어요")
    expect(answerOf("shot-08").answer).not.toMatch(/세정|세\*\*/)
    // 중국 회사·서버 → 실시간 수업과 녹화 수업 설명이 나갔다
    expect(answerOf("shot-09").answer).toContain("추측으로 말씀드리지")
    expect(answerOf("shot-09").answer).toContain("베이징")
    expect(answerOf("shot-09").answer).not.toMatch(/중국입니다|한국입니다|중국\s*회사가\s*아니|(?:한국|중국)\s*서버에\s*저장/)
    // 맥북 → 되묻기가 나갔다
    expect(answerOf("shot-10").answer.startsWith("네, 맥북에도 설치할 수 있어요.")).toBe(true)
    expect(answerOf("shot-10").answer).toContain("Apple Silicon")
    // 주어 없는 회사 질문 → 되묻기가 나갔다
    expect(answerOf("shot-11").answer).toContain("EEO")
  })
})

describe("weak sources and word hijacks", () => {
  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it("does not paste a weakly matched doc chunk as the answer", async () => {
    disableExternalChatbotServices()

    for (const question of ["클래스인 배경화면 뭐 있어요", "클래스인 음악 틀 수 있나요"]) {
      const result = await evaluateChatbotQuery(question, { generateAnswer: false })

      expect(result.answerMode, question).toBe("doc_suggestion")
      expect(result.answer, question).toBe(WEAK_SOURCE_DRAFT_ANSWER)
      expect(result.answer, question).not.toContain("관련 안내를 정리해드리면")
      expect(result.unresolved, question).toBe(true)
    }
  })

  it("does not read 접속 or 로그인 in a fact question as a login problem", async () => {
    disableExternalChatbotServices()

    for (const question of [
      "한 교실에 최대 몇 명까지 접속할 수 있나요?",
      "클래스인 접속하려면 비용 드나요",
      "클래스인 접속 인원 많으면 느려지나요",
      "수업 접속 방식은 몇 가지예요?",
    ]) {
      const result = await evaluateChatbotQuery(question, { generateAnswer: false })
      expect(result.answer, question).not.toContain("로그인이 안 되시는군요")
    }
  })

  it("still answers real login trouble", async () => {
    disableExternalChatbotServices()

    for (const question of ["비밀번호 재설정하고 싶어요", "로그인/비밀번호 문제를 해결하고 싶어요"]) {
      const result = await evaluateChatbotQuery(question, { generateAnswer: false })
      expect(result.detectedCategory, question).toBe("troubleshooting")
      expect(result.answer, question).toContain("비밀번호")
    }
    const loginFailure = await evaluateChatbotQuery("접속이 안 돼요", { generateAnswer: false })
    expect(loginFailure.detectedCategory).toBe("troubleshooting")
    expect(loginFailure.answer).toContain("로그인")
  })

  it("does not route cost or retention questions to the hardware or permission checklists", async () => {
    disableExternalChatbotServices()

    const cost = await evaluateChatbotQuery("OPS 따로 사면 얼마예요?", { generateAnswer: false })
    expect(cost.answer).not.toContain("외장 PC 없이 ClassIn 수업 환경을 구동")

    const retention = await evaluateChatbotQuery("녹화본은 몇 달 저장되나요?", { generateAnswer: false })
    expect(retention.answer).not.toContain("목적이 달라서 먼저 구분")
  })

  it("does not read 망할 일 as a to-do list or 해외로 나가요 as a disconnect", async () => {
    disableExternalChatbotServices()

    const stability = await evaluateChatbotQuery("클래스인 망할 일은 없겠죠? 규모가 어때요", { generateAnswer: false })
    expect(stability.answer).not.toContain("찾는 일정이 안 보이면")

    const transfer = await evaluateChatbotQuery("클래스인 우리 아이 영상 해외로 나가요?", { generateAnswer: false })
    expect(transfer.answer).not.toContain("수업이 끊기거나 튕기면")
  })
})
