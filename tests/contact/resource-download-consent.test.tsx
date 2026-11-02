import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ResourceDownloadForm } from "@/app/resources/[slug]/ResourceDownloadForm"

describe("자료 다운로드 동의", () => {
  it("필수 개인정보 동의와 선택 마케팅 동의를 모두 미선택 상태로 표시한다", () => {
    const html = renderToStaticMarkup(<ResourceDownloadForm resource={{
      slug: "academy-system-checklist",
      title: "운영 진단",
      gate: "email",
      estimatedMinutes: 18,
      itemCount: 34,
      hasPdfFile: true,
    }} />)

    const inputs = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? []
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toContain("required")
    expect(inputs[1]).not.toContain("required")
    for (const input of inputs) expect(input).not.toContain("checked")
    expect(html).toContain("[필수] 자료 제공")
    expect(html).toContain("[선택] Classin")
  })
})
