import { afterEach, describe, expect, it, vi } from "vitest"

import {
  CS_FIGMA_GUIDES,
  findCsFigmaGuideForQuestion,
  formatCsFigmaGuideAnswer,
} from "@/lib/chatbot/cs-figma-guides"
import { evaluateChatbotQuery } from "@/lib/chatbot/service"
import { getCsFigmaEnrichment } from "@/lib/cs-figma-enrichments"

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

describe("CS Figma guide source", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("matches 현장 녹화 setup questions to the extracted Figma CS guide", () => {
    const guide = findCsFigmaGuideForQuestion("현장 녹화 카메라 설정 순서 알려줘")

    expect(guide).toMatchObject({
      slug: "field-recording-camera-setup",
      title: "현장 녹화 카메라 설정",
      category: "classroom",
      sourceImageFiles: expect.arrayContaining([
        "12/17 실시간 수업 생성 ~ 현장 녹화 확인(PC).png",
      ]),
    })
    expect(guide?.steps.slice(0, 4)).toEqual([
      "수업을 진행할 코스에 입장합니다.",
      "우측 새로 만들기에서 학습 활동 유형 수업을 선택합니다.",
      "수업 옵션에서 온스테이지 인원수를 1V0으로 설정하고 현장 녹화 토글을 켭니다.",
      "등록 후 생성된 수업의 교실 입장 버튼을 누릅니다.",
    ])
  })

  it("answers how-to questions with Figma step order before generic RAG text", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("현장 녹화 카메라 설정 어떻게 해요?", {
      generateAnswer: false,
    })

    expect(result.detectedCategory).toBe("classroom")
    expect(result.answerMode).toBe("direct_answer")
    expect(result.sources[0]).toMatchObject({
      title: "현장 녹화 카메라 설정",
      heading: "사용 순서 안내",
      urlPath: "/docs/teacher/cs-field-recording-camera-setup",
    })
    expect(result.answer).toContain("1. 수업을 진행할 코스에 입장합니다.")
    expect(result.answer).toContain("2. 우측 새로 만들기에서 학습 활동 유형 수업을 선택합니다.")
    expect(result.answer).toContain("확인 포인트")
    expect(result.answer).not.toContain("원본 캡처:")
  })

  it("returns the Figma fast path before external search or generation", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "anon-key")
    vi.stubEnv("SUPABASE_SECRET_KEY", "service-key")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")
    vi.stubEnv("GEMINI_API_KEY", "gemini-key")
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("external fetch should not run"))

    const result = await evaluateChatbotQuery("현장 녹화 카메라 설정 어떻게 해요?")

    expect(result.answerMode).toBe("direct_answer")
    expect(result.sources[0]?.urlPath).toBe("/docs/teacher/cs-field-recording-camera-setup")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not intercept broad troubleshooting or policy questions", () => {
    expect(findCsFigmaGuideForQuestion("학생이 수업에서 계속 나가요")).toBeNull()
    expect(findCsFigmaGuideForQuestion("학생 권한 정책 알려줘")).toBeNull()
    expect(findCsFigmaGuideForQuestion("학생 화면이 안 보여요")).toBeNull()
    expect(findCsFigmaGuideForQuestion("웹 라이브는 모든 요금제에서 되는 건가요?")).toBeNull()
    expect(findCsFigmaGuideForQuestion("수업 녹화와 현장 녹화는 누가 저장 관리할 수 있나요?")).toBeNull()
    expect(findCsFigmaGuideForQuestion("전자칠판 사이즈 어떻게 돼요?")).toBeNull()
    expect(findCsFigmaGuideForQuestion("전자칠판 모델 라인업 알려줘")).toBeNull()
    expect(findCsFigmaGuideForQuestion("클래스인 도입 순서가 궁금해요")).toBeNull()
    expect(findCsFigmaGuideForQuestion("ClassIn 도입 전에 꼭 확인해야 할 22가지 질문이 뭐예요?")).toBeNull()
  })

  it("does not answer from raw placeholder captures", () => {
    expect(findCsFigmaGuideForQuestion("AI Board 사용 방법 알려줘")).toBeNull()
    expect(findCsFigmaGuideForQuestion("New Course 만드는 방법 알려줘")).toBeNull()
    expect(findCsFigmaGuideForQuestion("빈 이미지 내용 확인 방법 알려줘")).toBeNull()
  })

  it("routes recording download questions to the curated recording guide", () => {
    expect(findCsFigmaGuideForQuestion("수업 녹화 다운로드 순서 알려줘")).toMatchObject({
      slug: "recording-download-share",
      title: "수업 녹화 데이터 다운로드와 공유",
    })
  })

  it("routes app download questions to the current cross-platform install guide instead of recording data", () => {
    expect(findCsFigmaGuideForQuestion("클래스인 다운로드 어디서 해요")).toMatchObject({
      slug: "classin-app-download",
      title: "클래스인 앱 다운로드와 설치",
    })
  })

  it("routes newly interpreted onboarding procedures from the current Figma board", () => {
    expect(findCsFigmaGuideForQuestion("클래스인 회원가입 방법 알려줘")).toMatchObject({
      slug: "classin-account-signup",
      title: "클래스인 회원가입",
    })
    expect(findCsFigmaGuideForQuestion("클래스인 계정 삭제는 어디서 해요")).toMatchObject({
      slug: "classin-account-delete",
      title: "클래스인 계정 삭제와 회원 탈퇴",
    })
    expect(findCsFigmaGuideForQuestion("회원가입 때 전화번호나 이메일만 있으면 되나요?")).toBeNull()
  })

  it("routes newly interpreted admin procedures from the current Figma board", () => {
    expect(findCsFigmaGuideForQuestion("편입생 등록 방법 알려줘")).toMatchObject({
      slug: "transfer-student-registration",
      title: "편입생(참관생) 등록",
    })
    expect(findCsFigmaGuideForQuestion("코스 구성원 추가 삭제 순서 알려줘")).toMatchObject({
      slug: "course-member-management",
      title: "코스 구성원 추가와 삭제",
    })
    expect(findCsFigmaGuideForQuestion("코스 전체 학생 채팅 어디서 끄나요")).toMatchObject({
      slug: "course-wide-chat-control",
      title: "코스 전체 학생 채팅 활성화와 비활성화",
    })
    expect(findCsFigmaGuideForQuestion("새 코스 만들고 종료하는 방법 알려줘")).toMatchObject({
      slug: "course-create-and-close",
      title: "코스 생성과 종료",
    })
  })

  it("answers the current transfer-student procedure without external search", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("편입생 등록 방법 알려줘", {
      generateAnswer: false,
    })

    expect(result.answerMode).toBe("direct_answer")
    expect(result.sources[0]).toMatchObject({
      title: "편입생(참관생) 등록",
      heading: "사용 순서 안내",
      urlPath: "/docs/admin/cs-transfer-student-registration",
    })
    expect(result.answer).toContain("3. 코스 상세 화면에서 편입생 항목을 선택하고 추가를 누릅니다.")
    expect(result.answer).not.toMatch(/Figma|캡처|고객사/i)
  })

  it("answers exact procedural digest guides even when titles include numbering or policy words", () => {
    expect(findCsFigmaGuideForQuestion("수업 삭제 방법 알려줘")).toMatchObject({
      slug: "cs-figma-digest-655",
      title: "1. 수업 삭제 방법",
    })
    expect(findCsFigmaGuideForQuestion("기관 공유 드라이브 접근 권한 부여 방법 알려줘")).toMatchObject({
      slug: "cs-figma-digest-940",
      title: "기관 공유 드라이브 접근 권한 부여",
    })
    expect(findCsFigmaGuideForQuestion("코스 닉네임 변경 옵션 어디서 켜요")).toMatchObject({
      slug: "cs-figma-digest-1131",
      title: "코스 내 닉네임 변경 옵션 활성/비활성화",
    })
  })

  it("uses the web live Figma guide for known chat visibility questions", () => {
    const guide = findCsFigmaGuideForQuestion("웹 라이브 채팅이 학생에게 안 보여요")

    expect(guide).toMatchObject({
      slug: "web-live-create",
      title: "웹 라이브 생성 방법",
    })
  })

  it("answers high-value generated CS procedures that would otherwise look like policy, hardware, or log questions", () => {
    expect(findCsFigmaGuideForQuestion("다시보기 유효 기간 설정 방법 알려줘")).toMatchObject({
      slug: "cs-figma-digest-982",
      title: "2. 다시보기 유효 기간 설정",
    })
    expect(findCsFigmaGuideForQuestion("클래스인 스토리지 삭제 방법 알려줘")).toMatchObject({
      slug: "cs-figma-digest-1294",
      title: "클래스인 스토리지 삭제 안내",
    })
    expect(findCsFigmaGuideForQuestion("하위 계정 설정 방법 알려줘")).toMatchObject({
      slug: "cs-figma-digest-919",
      title: "클래스인 관리자 대시보드에서 하위 계정 설정 방법",
    })
    expect(findCsFigmaGuideForQuestion("전자칠판 데이터 로그 보고 방법 알려줘")).toMatchObject({
      slug: "cs-figma-digest-1516",
      title: "전자칠판 데이터 로그 보고",
    })
    expect(findCsFigmaGuideForQuestion("클래스인X 전자칠판 삭제 재설치 방법 알려줘")).toMatchObject({
      slug: "cs-figma-digest-1863",
      title: "클래스인X 삭제/재설치 (전자칠판)",
    })
  })

  it("answers newly imported dashboard, replay, and account procedures from the Figma digest", () => {
    expect(findCsFigmaGuideForQuestion("웹 라이브 생성 방법 (대시보드) 알려줘")).toMatchObject({
      slug: "cs-figma-digest-350",
      title: "웹 라이브 생성 방법 (대시보드)",
    })
    expect(findCsFigmaGuideForQuestion("전자칠판 로컬 녹화 방법 알려줘")).toMatchObject({
      slug: "cs-figma-digest-449",
      title: "클래스인 전자칠판 내 [로컬 녹화] 기능 안내",
    })
    expect(findCsFigmaGuideForQuestion("클래스인 관리자 대시보드에서 계정 세부 사용 내역 확인 방법 알려줘")).toMatchObject({
      slug: "cs-figma-digest-633",
      title: "클래스인 관리자 대시보드에서 계정 세부 사용 내역 확인 방법",
    })
    expect(findCsFigmaGuideForQuestion("대시보드 내에서 수업 다시보기 확인 방법 알려줘")).toMatchObject({
      slug: "cs-figma-digest-1558",
      title: "대시보드 내에서 수업 다시보기 확인 방법 안내",
    })
    expect(findCsFigmaGuideForQuestion("수업 다시보기 시청 기록 확인 방법 알려줘")).toMatchObject({
      slug: "cs-figma-digest-1558",
      title: "대시보드 내에서 수업 다시보기 확인 방법 안내",
    })
    expect(findCsFigmaGuideForQuestion("수업 교사 설정 삭제 방법 알려줘")).toMatchObject({
      slug: "cs-figma-digest-1004",
      title: "대시보드 수업 교사 설졍 & 삭제",
    })
    expect(findCsFigmaGuideForQuestion("코스 교사 변경 방법 알려줘")).toMatchObject({
      slug: "cs-figma-digest-1035",
      title: "코스를 기존 교사에서 다른 교사로 변경해야 할 경우, 아래 내용을 따라와 주세요!",
    })
    expect(findCsFigmaGuideForQuestion("학생 닉네임 동기화 방법 알려줘")).toMatchObject({
      slug: "cs-figma-digest-1102",
      title: "학생 닉네임 동기화 & 추가 안내 가이드",
    })
  })

  it("routes late-joiner replay questions phrased like real CS messages", () => {
    const questions = [
      "학생이 1강 다시보기가 안 뜬다고 합니다",
      "수업 끝나고 코스에 가입한 학생이 이전 강의를 못 봐요",
      "나중에 들어온 학생은 과거 수업 다시보기를 어떻게 열어주나요?",
      "수업 후 가입된 학생들은 이전 수업을 못 보는군요",
    ]

    for (const question of questions) {
      expect(findCsFigmaGuideForQuestion(question), question).toMatchObject({
        slug: "cs-figma-digest-1054",
        title: "새로 들어온 학생도 수업 다시보기 시청",
      })
    }

    expect(findCsFigmaGuideForQuestion("학생 다시보기 시청 기록은 어디서 확인해요")?.slug).not.toBe(
      "cs-figma-digest-1054"
    )
  })

  it("answers late-joiner replay issues with the current setting labels and re-entry step", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("학생이 1강 다시보기가 안 뜬다고 합니다", {
      generateAnswer: false,
    })

    expect(result.detectedCategory).toBe("classroom")
    expect(result.answerMode).toBe("direct_answer")
    expect(result.sources[0]).toMatchObject({
      title: "새로 들어온 학생도 수업 다시보기 시청",
      heading: "사용 순서 안내",
      urlPath: "/docs/admin/cs-figma-digest-1054",
    })
    expect(result.answer).toContain("먼저 학생이 해당 수업이 끝난 뒤 코스에 가입했는지 확인해 주세요.")
    expect(result.answer).toContain("새로 참여한 학생은 이전 수업 데이터를 볼 수 있습니다")
    expect(result.answer).toContain("대상 학생을 코스에서 내보낸 뒤 다시 추가")
    expect(result.answer).toContain("위 순서로도 해결되지 않으면 담당자 상담으로 연결해 드릴 수 있어요.")
    expect(result.answer).not.toMatch(/Figma|원본 캡처|Classin_Hope|EEO-TEST/i)
  })

  it("does not turn policy or capability checks into Figma procedure answers", async () => {
    disableExternalChatbotServices()
    const questions = [
      "하위 계정 권한 정책 설정 방법",
      "공유 드라이브 접근 권한 정책 설정 방법",
      "스토리지 자동 삭제 정책 설정 방법",
      "ClassinX 전자칠판 설치 가능한가요",
      "전자칠판 데이터 로그 보고 가능해요?",
    ]

    for (const question of questions) {
      expect(findCsFigmaGuideForQuestion(question), question).toBeNull()
      const result = await evaluateChatbotQuery(question, { generateAnswer: false })
      expect(result.sources, question).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ heading: "사용 순서 안내" }),
        ])
      )
    }
  })

  it("answers non-curated Figma digest how-to entries from the extracted corpus", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("코스 가입 허용 QR 초대 링크는 어디서 활성화해요?", {
      generateAnswer: false,
    })

    expect(result.answerMode).toBe("direct_answer")
    expect(result.sources[0]).toMatchObject({
      title: "코스 내 초대 활성화(QR, Link 등)",
      heading: "사용 순서 안내",
      urlPath: "/docs/admin/cs-figma-digest-1195",
    })
    expect(result.answer).toContain("1. 화면 좌측 상단의 코스 이름을 클릭해 주세요")
    expect(result.answer).toContain("3단계 CS 주의사항과 안내 화면")
    expect(result.sources[0]?.title).toBe("코스 내 초대 활성화(QR, Link 등)")
  })

  it("prefers invitation activation over student QR scanning when the question asks where to turn on QR invite links", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("코스 가입 QR 초대 링크 어디서 켜요?", {
      generateAnswer: false,
    })

    expect(result.answerMode).toBe("direct_answer")
    expect(result.sources[0]).toMatchObject({
      title: "코스 내 초대 활성화(QR, Link 등)",
      urlPath: "/docs/admin/cs-figma-digest-1195",
    })
    expect(result.answer).toContain("코스 가입 허용")
    expect(result.suggestedQuestions).not.toContain("PC 순서 알려줘")
    expect(result.suggestedQuestions).not.toContain("설정/옵션 순서 알려줘")
  })

  it("prefers curated guides over duplicated generated captures for concise setup questions", () => {
    const guide = findCsFigmaGuideForQuestion("마이크 설정 방법 알려줘")

    expect(guide).toMatchObject({
      slug: "microphone-camera-check",
      title: "교실 내 카메라와 마이크 설정 확인",
    })
  })

  it("keeps the full Figma step order for longer procedures", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("시험 문제 대량 업로드 순서 알려줘", {
      generateAnswer: false,
    })

    expect(result.answerMode).toBe("direct_answer")
    expect(result.sources[0]).toMatchObject({
      title: "시험 문제 대량 업로드와 시험 추가",
      urlPath: "/docs/teacher/cs-bulk-exam-upload",
    })
    expect(result.answer).toContain("7. 필요하면 내 문제 은행에도 저장하기를 체크합니다.")
    expect(result.answer).toContain("8. 확인 후 시험 세부 설정을 마치고 게시를 누릅니다.")
  })

  it("formats guide answers without public URLs or raw source filenames", () => {
    for (const guide of CS_FIGMA_GUIDES) {
      const answer = formatCsFigmaGuideAnswer(guide)
      const enrichment = getCsFigmaEnrichment(guide.docSlug)

      for (const step of guide.steps) {
        expect(step, guide.slug).toBeTruthy()
      }

      const expectedNumberedSteps = enrichment?.stages.length ?? guide.steps.length
      for (let index = 0; index < expectedNumberedSteps; index += 1) {
        expect(answer, guide.slug).toContain(`${index + 1}. `)
      }

      expect(answer, guide.slug).not.toMatch(/https?:\/\//i)
      expect(answer, guide.slug).not.toMatch(/\[[^\]]+\]\(https?:\/\/[^)]+\)/i)
      expect(answer, guide.slug).not.toContain("원본 캡처:")
      for (const sourceImageFile of guide.sourceImageFiles) {
        expect(answer, guide.slug).not.toContain(sourceImageFile)
      }
    }
  })
})
