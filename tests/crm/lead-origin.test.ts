import { describe, expect, it } from "vitest"

import { classifyLeadOrigin } from "@/lib/crm/capture/origin"

describe("classifyLeadOrigin", () => {
  it("광고 source 또는 광고 클릭 ID → ad", () => {
    expect(classifyLeadOrigin("meta_lead_ads", false)).toBe("ad")
    expect(classifyLeadOrigin("google_ads", false)).toBe("ad")
    expect(classifyLeadOrigin("demo_modal", true)).toBe("ad")
  })
  it("팀 수기/내부 캡처 source → team", () => {
    expect(classifyLeadOrigin("admin_manual", false)).toBe("team")
    expect(classifyLeadOrigin("channel_talk", false)).toBe("team")
  })
  it("홈페이지 공개 폼 및 미상 → site", () => {
    expect(classifyLeadOrigin("demo_modal", false)).toBe("site")
    expect(classifyLeadOrigin("contact_page", false)).toBe("site")
    expect(classifyLeadOrigin("newsletter", false)).toBe("site")
    expect(classifyLeadOrigin("", false)).toBe("site")
  })
  it("대소문자/공백 무시", () => {
    expect(classifyLeadOrigin("  Meta_Lead_Ads ", false)).toBe("ad")
  })
})
