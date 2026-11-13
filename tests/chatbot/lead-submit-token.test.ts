import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { stripLeadSubmitTokens } from "@/lib/chatbot/lead-token"

const root = path.resolve(__dirname, "../..")
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8")

describe("stripLeadSubmitTokens — 챗봇 답변의 [LEAD_SUBMIT] 토큰은 리드를 만들지 않고 지운다", () => {
  it("완성된 토큰을 지우고 stripped=true", () => {
    const answer = "신청 도와드릴게요.\n\n[LEAD_SUBMIT:name=홍길동,phone=010-0000-0000,org=테스트학원,event=세미나]"
    const out = stripLeadSubmitTokens(answer)
    expect(out.stripped).toBe(true)
    expect(out.answer).toBe("신청 도와드릴게요.")
    expect(out.answer).not.toContain("010-0000-0000")
  })

  it("스트림이 잘려 닫히지 않은 토큰도 지운다", () => {
    const out = stripLeadSubmitTokens("안내드릴게요. [LEAD_SUBMIT:name=홍길동,phone=010")
    expect(out).toEqual({ answer: "안내드릴게요.", stripped: true })
  })

  it("토큰이 없으면 그대로", () => {
    const answer = "ClassIn 은 수업 전·중·후를 한곳에서 운영합니다."
    expect(stripLeadSubmitTokens(answer)).toEqual({ answer, stripped: false })
  })
})

describe("챗봇 리드 우회 경로 제거 (소스 계약)", () => {
  it("service.ts 는 saveLead·leads 리포지토리를 직접 부르지 않는다", () => {
    const service = read("lib/chatbot/service.ts")
    expect(service).not.toMatch(/saveLead/)
    expect(service).not.toMatch(/repositories\/leads/)
    expect(service).not.toMatch(/chatbot_assist_registration/)
    expect(service).toMatch(/stripLeadSubmitTokens/)
  })

  it("llm.ts 프롬프트에 LEAD_SUBMIT 생성 지시가 없다", () => {
    expect(read("lib/chatbot/llm.ts")).not.toMatch(/LEAD_SUBMIT/)
  })

  it("프롬프트가 대화 속 신청 접수를 약속하게 하지 않는다 — 접수는 문의 폼에서만 된다", () => {
    // 2026-11-12 점검: 온보딩 지시에 "무료체험 대리 신청을 완료해 드리겠다"는 언질이 남아, 접수 경로가 없는데
    // 챗봇이 신청을 대신 끝내 주겠다고 말할 수 있었다.
    const llm = read("lib/chatbot/llm.ts")
    expect(llm).not.toMatch(/신청을 완료해 드리겠다'고 자연스러운/)
    expect(llm).not.toMatch(/대리 신청을 완료해 드리겠다/)
    expect(llm).toMatch(/\[도입 상담 남기기\] 버튼\(문의 폼\)/)
  })

  it("문의 폼은 source 를 하드코딩하지 않고 ?source=chatbot 을 보존한다", () => {
    const page = read("app/contact/page.tsx")
    expect(page).toMatch(/resolveContactLeadSource\(sourceParam\)/)
    expect(page).not.toMatch(/source:\s*"contact_page"/)
  })
})
