import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import SaveStateCaption from "@/components/admin/crm/SaveStateCaption"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"

describe("SaveStateCaption", () => {
  it("keeps a mounted aria-live=polite region in every state (idle included)", () => {
    for (const state of ["idle", "saving", "saved", "failed"] as const) {
      const html = renderToStaticMarkup(<SaveStateCaption id="cap" state={state} />)
      expect(html).toContain('aria-live="polite"')
      expect(html).toContain('role="status"')
      expect(html).toContain('id="cap"')
      expect(html).toContain(`data-state="${state}"`)
    }
  })

  it("idle shows idleText only when given", () => {
    expect(renderToStaticMarkup(<SaveStateCaption state="idle" />)).not.toContain("<span")
    expect(renderToStaticMarkup(<SaveStateCaption state="idle" idleText="바꾸면 바로 저장됩니다" />)).toContain("바꾸면 바로 저장됩니다")
  })

  it("saving shows spinner text, saved shows ok tone check", () => {
    const saving = renderToStaticMarkup(<SaveStateCaption state="saving" />)
    expect(saving).toContain("저장 중...")
    expect(saving).toContain("animate-spin")

    const saved = renderToStaticMarkup(<SaveStateCaption state="saved" />)
    expect(saved).toContain("저장됨")
    expect(saved).toContain(STATUS_TONE_TEXT_CLASS.ok)
  })

  it("failed uses danger tone, custom text and a retry button only with onRetry", () => {
    const withRetry = renderToStaticMarkup(
      <SaveStateCaption state="failed" failedText="담당자를 저장하지 못했습니다" onRetry={() => undefined} />
    )
    expect(withRetry).toContain("담당자를 저장하지 못했습니다")
    expect(withRetry).toContain(STATUS_TONE_TEXT_CLASS.danger)
    expect(withRetry).toContain(">다시 시도</button>")
    expect(withRetry).not.toContain("#B85C33")

    const noRetry = renderToStaticMarkup(<SaveStateCaption state="failed" />)
    expect(noRetry).toContain("저장되지 않았습니다")
    expect(noRetry).not.toContain("<button")
  })
})
