import { describe, expect, it } from "vitest"

import {
  readSourceFilterFromParams,
  resolveSourceFilterPreset,
} from "@/components/admin/docs/DocsGapsPanel"

// 보강 큐 소스 딥링크 프리셋(계약 1) — /admin/docs?tab=gaps&source=all|chatbot|internal_cs.
// 두 헬퍼 모두 순수 함수라 URLSearchParams로 직접 검증한다.
describe("docs gaps source deep-link preset", () => {
  describe("readSourceFilterFromParams (마운트 초기값)", () => {
    it("presets valid sources and falls back to all otherwise", () => {
      expect(readSourceFilterFromParams(new URLSearchParams("source=chatbot"))).toBe("chatbot")
      expect(readSourceFilterFromParams(new URLSearchParams("source=internal_cs"))).toBe("internal_cs")
      // 잘못된 값·부재·빈 값은 전부 all — 딥링크 오타가 필터를 이상한 상태로 만들지 않는다.
      expect(readSourceFilterFromParams(new URLSearchParams("source=bogus"))).toBe("all")
      expect(readSourceFilterFromParams(new URLSearchParams("tab=gaps"))).toBe("all")
      expect(readSourceFilterFromParams(new URLSearchParams("source="))).toBe("all")
    })

    it("reads source alongside other query params (실제 딥링크 형태)", () => {
      expect(
        readSourceFilterFromParams(new URLSearchParams("tab=gaps&source=internal_cs"))
      ).toBe("internal_cs")
    })
  })

  describe("resolveSourceFilterPreset (컴포넌트 유지 상태의 URL 변경 반영 규칙)", () => {
    it("applies the preset only when the source param exists", () => {
      // 존재 시 반영 — 값 검증은 readSourceFilterFromParams와 동일 규칙.
      expect(resolveSourceFilterPreset(new URLSearchParams("source=chatbot"))).toBe("chatbot")
      expect(resolveSourceFilterPreset(new URLSearchParams("source=internal_cs"))).toBe("internal_cs")
      expect(resolveSourceFilterPreset(new URLSearchParams("source=bogus"))).toBe("all")
      expect(resolveSourceFilterPreset(new URLSearchParams("source="))).toBe("all")
    })

    it("returns null when source is absent so user chip selections are preserved", () => {
      // 부재 시 null — 사이드바 "문서 보강 큐"(?tab=gaps, source 없음) 재클릭이나 뒤로가기가
      // 사용자가 칩으로 고른 상태를 all로 덮어쓰지 않는다.
      expect(resolveSourceFilterPreset(new URLSearchParams(""))).toBeNull()
      expect(resolveSourceFilterPreset(new URLSearchParams("tab=gaps"))).toBeNull()
    })
  })
})
