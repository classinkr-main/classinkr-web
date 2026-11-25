import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  SUPPORT_HOURS_FULL_LABEL,
  describeSupportHoursWait,
  getSupportHoursState,
} from "@/lib/contact/support-hours"

// 챗봇 점검 CX-07: 공개 운영시간을 한 정본에서 꺼내 문의 화면·챗봇 상담 카드·문의 완료 화면이 같이 쓰고,
// 운영시간 밖에는 '바로'·'실시간'을 약속하지 않는다. 시각은 KST 로 센다.

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8")

// 2026-11-25 은 수요일, 2026-11-28 은 토요일이다.
const kst = (iso: string) => new Date(`${iso}+09:00`)

describe("상담 운영시간 상태(KST)", () => {
  it("평일 09:00~18:00 은 운영, 12:00~13:00 은 점심, 그 밖은 닫힘", () => {
    expect(getSupportHoursState(kst("2026-11-25T08:59:00"))).toBe("closed")
    expect(getSupportHoursState(kst("2026-11-25T09:00:00"))).toBe("open")
    expect(getSupportHoursState(kst("2026-11-25T11:59:00"))).toBe("open")
    expect(getSupportHoursState(kst("2026-11-25T12:00:00"))).toBe("lunch")
    expect(getSupportHoursState(kst("2026-11-25T13:00:00"))).toBe("open")
    expect(getSupportHoursState(kst("2026-11-25T17:59:00"))).toBe("open")
    expect(getSupportHoursState(kst("2026-11-25T18:00:00"))).toBe("closed")
    expect(getSupportHoursState(kst("2026-11-25T23:00:00"))).toBe("closed")
    expect(getSupportHoursState(kst("2026-11-26T00:00:00"))).toBe("closed")
    expect(getSupportHoursState(kst("2026-11-28T10:00:00"))).toBe("closed")
  })

  it("UTC 로 같은 순간이어도 KST 기준으로 판정한다", () => {
    // 2026-11-25T01:00Z = KST 10:00(수)
    expect(getSupportHoursState(new Date("2026-11-25T01:00:00Z"))).toBe("open")
    // 2026-11-27T15:30Z = KST 토 00:30
    expect(getSupportHoursState(new Date("2026-11-27T15:30:00Z"))).toBe("closed")
  })

  it("운영시간 안에는 대기 안내가 없고, 밖에는 '바로'·'실시간' 없이 언제 확인하는지 말한다", () => {
    expect(describeSupportHoursWait("open")).toBeNull()
    for (const state of ["lunch", "closed"] as const) {
      const text = describeSupportHoursWait(state) ?? ""
      expect(text).not.toMatch(/바로|실시간/)
      expect(text).toMatch(/순서대로 확인해요/)
    }
    expect(describeSupportHoursWait("closed")).toBe("지금은 운영시간(평일 09:00~18:00)이 아니라 다음 운영시간에 순서대로 확인해요.")
    expect(describeSupportHoursWait("lunch")).toBe("지금은 점심시간(12:00~13:00)이라 13:00부터 순서대로 확인해요.")
  })
})

describe("운영시간 정본을 쓰는 화면", () => {
  it("공개 표기는 예전 문구 그대로다", () => {
    expect(SUPPORT_HOURS_FULL_LABEL).toBe("평일 09:00~18:00 (점심시간 12:00~13:00)")
  })

  it("문의 화면 직접 연락 블록의 표기가 정본과 같다(답 색인이 인용하는 줄이라 글자 그대로 둔다)", () => {
    expect(read("components/contact/ContactDirectChannels.tsx")).toContain(`>${SUPPORT_HOURS_FULL_LABEL}</p>`)
  })

  it("챗봇 상담 카드·문의 완료 화면이 같은 상수를 쓴다", () => {
    const bridge = read("components/ui/chatbot/ConsultationBridge.tsx")
    expect(bridge).toContain("SUPPORT_HOURS_FULL_LABEL")
    expect(bridge).toContain("getSupportHoursState()")
    const contact = read("app/contact/page.tsx")
    expect(contact).toContain("상담 운영시간: {SUPPORT_HOURS_FULL_LABEL}")
    expect(contact).toContain("describeSupportHoursWait(submittedHours)")
  })

  it("상담 카드는 '바로'를 약속하지 않고, '실시간' 버튼 이름은 운영시간 안에만 쓴다", () => {
    const bridge = read("components/ui/chatbot/ConsultationBridge.tsx")
    // 주석은 빼고 화면에 나가는 글만 본다.
    const code = bridge.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    expect(code).not.toContain("바로")
    expect(code).toMatch(/hours === "open" \? "실시간 상담 연결" : "채팅으로 상담 남기기"/)
  })
})

describe("챗봇에서 문의폼으로(CX-18)", () => {
  it("상담 카드의 문의 링크는 폼 첫 화면(#contact-form)으로 간다", () => {
    expect(read("components/ui/chatbot/ConsultationBridge.tsx")).toMatch(/\.toString\(\)\}#contact-form`/)
  })

  it("문의 화면은 요약을 채웠다고 상태 영역으로 알리고, 그때는 '문의 내용' 칸을 맨 위에 둔다", () => {
    const contact = read("app/contact/page.tsx")
    expect(contact).toContain('<CardContent id="contact-form"')
    expect(contact).toContain('<div role="status" className={chatbotPrefill ? "w-full" : "sr-only"}>')
    expect(contact).toContain("챗봇 대화 요약을 아래 &lsquo;문의 내용&rsquo;에 넣어 두었어요.")
    expect(contact).toContain('if (prefill && sourceParam === "chatbot") setChatbotPrefill(true)')
    expect(contact).toContain("{chatbotPrefill ? messageField : null}")
    expect(contact).toContain("{chatbotPrefill ? null : messageField}")
  })
})
