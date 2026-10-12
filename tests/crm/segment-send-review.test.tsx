/**
 * 발송 센터 — 고객 세그먼트(CRM) 모드의 "최종 확인" 레일(발송 1단계 리뷰 후속, 2026-09-25).
 *
 * 결함: ?segment=<uuid> 로 넘어오면 draft.targetTags=[] 인 채 세그먼트 모드가 되는데, 레일이 허브 evaluateDraft 의
 * 태그 대상 기준 체크를 그대로 그려 "전체 active 구독자 N명"·"수신거부 N명은 자동 제외"·"{org} 빈 값 N명"과
 * "발송 가능" 준비도가 레일 헤더("이메일 발송 가능 M명 · 발송 안 함")와 어긋났다.
 * 고정: segmentModeSendReview 가 대상·수신거부·변수 빈 값을 미리보기 기준으로 바꾸고 준비도를 "미리보기 전용"으로 덮는다.
 * 태그 모드 변수 체크는 같은 함수(buildVariableCheck)로 옮겼을 뿐 문구가 그대로다.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import SendInvoiceRail from "@/components/admin/marketing/SendInvoiceRail"
import {
  SEGMENT_PREVIEW_ONLY_READINESS,
  buildVariableCheck,
  segmentModeSendReview,
} from "@/components/admin/marketing/presend-review"
import type { PreSendCheck } from "@/components/admin/marketing/send-center-types"
import { classifySegmentAudience, type SegmentAudiencePreview } from "@/lib/crm/segment-audience"

const ID = "11111111-1111-4111-8111-111111111111"

function preview(partial: Partial<SegmentAudiencePreview> = {}): SegmentAudiencePreview {
  const base = classifySegmentAudience(
    [
      { kind: "lead", email: "a@x.com", phone: "010-1234-5678" },
      { kind: "lead", email: "b@x.com", phone: null },
      { kind: "neo_account", email: null, phone: "010-2222-3333" },
    ],
    (email) => (email === "a@x.com" ? "subscriber_active" : "unsubscribed"),
    { totalRows: 3, truncated: false }
  )
  return {
    ...base,
    generatedAt: "2026-09-25T00:00:00.000Z",
    segment: { id: ID, name: "만료 60일", labels: ["만료 60일 이내"], archived: false },
    channels: { email: "resend", smsConfigured: false },
    sources: "ok",
    viewer: { canSend: true },
    ...partial,
  }
}

const draft = { subject: "{name}님 9월 안내", body: "<p>{org} 원장님께 — https://classin.co.kr/events</p>" }

/** 허브 evaluateDraft 가 세그먼트 모드(targetTags=[])에서 내던 태그 대상 기준 체크의 모양. */
function hubChecks(): PreSendCheck[] {
  return [
    { key: "subject", label: "제목", status: "ok", detail: "제목이 입력되었습니다. (12자)" },
    { key: "body", label: "본문", status: "ok", detail: "본문 길이가 충분합니다. (140자)" },
    buildVariableCheck(draft, [{ org: "" }, { org: "" }, { org: "" }, { org: "A학원" }]),
    { key: "audience", label: "대상", status: "ok", detail: "전체 active 구독자 1,234명" },
    { key: "unsubscribe", label: "수신거부", status: "info", detail: "수신거부 5명은 자동 제외됩니다." },
    { key: "cta", label: "CTA", status: "ok", detail: "본문에서 CTA 링크를 찾았습니다. (https://classin.co.kr/events)" },
    { key: "duplicate", label: "중복 제목", status: "ok", detail: "최근 동일 제목 발송 이력이 없습니다." },
  ]
}

function text(checks: PreSendCheck[]) {
  return checks.map((check) => `${check.label} ${check.detail}`).join("\n")
}

describe("buildVariableCheck — 태그 모드 문구 유지(허브에서 옮김)", () => {
  it("변수 미사용이면 info", () => {
    const check = buildVariableCheck({ subject: "안내", body: "본문" }, [])
    expect(check).toEqual({
      key: "variables",
      label: "변수 치환",
      status: "info",
      detail: "변수 미사용 — 모든 수신자에게 동일한 내용이 발송됩니다.",
    })
  })

  it("대상 기준 {org}/{role} 빈 값 수를 센다", () => {
    const check = buildVariableCheck({ subject: "{org}", body: "{role} {name}" }, [
      { org: "", role: "원장" },
      { org: "B", role: " " },
      { org: "C", role: "강사" },
    ])
    expect(check.status).toBe("ok")
    expect(check.detail).toBe("변수 3종 치환 가능 · {org} 빈 값 1명 · {role} 빈 값 1명 — 빈 값은 공백으로 발송됩니다.")
  })

  it("빈 값이 없으면 '모두 치환 가능'", () => {
    expect(buildVariableCheck({ subject: "{name}", body: "" }, [{ org: "A" }]).detail).toBe("사용한 변수 1종 모두 치환 가능합니다.")
  })

  it("알 수 없는 변수·AI 블록은 경고", () => {
    const unknown = buildVariableCheck({ subject: "{foo} {foo}", body: "{bar}" }, [])
    expect(unknown.status).toBe("warning")
    expect(unknown.detail).toBe("치환되지 않는 변수 {foo}, {bar} — 글자 그대로 발송됩니다.")
    const ai = buildVariableCheck({ subject: "", body: "{ai: 인사}" }, [])
    expect(ai.status).toBe("warning")
    expect(ai.detail).toBe("AI 블록({ai:})은 이 발송 경로에서 치환되지 않습니다.")
  })

  it("대상 없이(null — 세그먼트 모드) 부르면 빈 값 수를 세지 않는다고 적는다", () => {
    const check = buildVariableCheck({ subject: "{org}", body: "" }, null)
    expect(check.status).toBe("ok")
    expect(check.detail).toContain("세그먼트 대상의 빈 값 수는 미리보기에서 세지 않습니다")
    expect(check.detail).not.toContain("빈 값 1명")
  })
})

describe("segmentModeSendReview — 세그먼트 모드 최종 확인", () => {
  it("미리보기 기준으로 대상·수신거부·변수를 바꾸고 준비도는 '미리보기 전용'", () => {
    const base = hubChecks()
    const review = segmentModeSendReview({ checks: base, draft, preview: preview(), status: "ready" })

    expect(review.readiness).toEqual(SEGMENT_PREVIEW_ONLY_READINESS)
    expect(review.readiness.label).toBe("미리보기 전용")
    expect(review.checks.map((check) => check.key)).toEqual([
      "subject",
      "body",
      "variables",
      "audience",
      "unsubscribe",
      "cta",
      "duplicate",
    ])

    const audience = review.checks.find((check) => check.key === "audience")
    expect(audience).toMatchObject({ status: "ok", detail: "고객 세그먼트(CRM) · 이메일 발송 가능 1명(대상 3명) · 발송 안 함" })
    const unsubscribe = review.checks.find((check) => check.key === "unsubscribe")
    expect(unsubscribe?.detail).toBe("제외 1명(해지 1) — 발송 가능 수에서 이미 뺐습니다(구독 중인 주소만 셉니다).")

    const all = text(review.checks)
    expect(all).not.toContain("전체 active 구독자")
    expect(all).not.toContain("1,234명")
    expect(all).not.toContain("자동 제외됩니다")
    expect(all).not.toContain("{org} 빈 값")

    // 초안만 보는 체크는 그대로(같은 객체)
    for (const key of ["subject", "body", "cta", "duplicate"]) {
      expect(review.checks.find((check) => check.key === key)).toBe(base.find((check) => check.key === key))
    }
  })

  it("미리보기 로드 중이면 대상은 '확인하는 중'(info), 수신거부 줄은 뺀다 — 0명으로 보이지 않는다", () => {
    const review = segmentModeSendReview({ checks: hubChecks(), draft, preview: null, status: "loading" })
    const audience = review.checks.find((check) => check.key === "audience")
    expect(audience?.status).toBe("info")
    expect(audience?.detail).toContain("확인하는 중")
    expect(review.checks.some((check) => check.key === "unsubscribe")).toBe(false)
    expect(text(review.checks)).not.toContain("전체 active 구독자")
    expect(review.readiness.label).toBe("미리보기 전용")
  })

  it("미리보기 실패는 경고로 구분한다", () => {
    const review = segmentModeSendReview({ checks: hubChecks(), draft, preview: null, status: "error" })
    const audience = review.checks.find((check) => check.key === "audience")
    expect(audience?.status).toBe("warning")
    expect(audience?.detail).toContain("불러오지 못했습니다")
  })

  it("동의 조회 실패·발송 가능 0명은 경고", () => {
    const unavailable = preview({
      consent: "unavailable",
      email: { ...preview().email, eligible: 0 },
    })
    const consent = segmentModeSendReview({ checks: hubChecks(), draft, preview: unavailable, status: "ready" })
    expect(consent.checks.find((check) => check.key === "audience")).toMatchObject({ status: "warning" })
    expect(consent.checks.find((check) => check.key === "audience")?.detail).toContain("수신 동의 목록을 읽지 못해")

    const zero = segmentModeSendReview({
      checks: hubChecks(),
      draft,
      preview: preview({ email: { ...preview().email, eligible: 0 } }),
      status: "ready",
    })
    expect(zero.checks.find((check) => check.key === "audience")).toMatchObject({ status: "warning" })
  })
})

describe("SendInvoiceRail — 세그먼트 모드 최종 확인 렌더", () => {
  it("레일 체크·준비도가 헤더(이메일 발송 가능 수)와 같은 기준으로 보인다", () => {
    const review = segmentModeSendReview({ checks: hubChecks(), draft, preview: preview(), status: "ready" })
    const html = renderToStaticMarkup(
      <SendInvoiceRail
        draft={{ ...draft, targetTags: [] }}
        audienceMode="segment"
        directEmails={[]}
        audienceCount={1}
        checks={review.checks}
        readiness={review.readiness}
        balance={null}
        messagingStatusLoaded
        onSend={async () => {}}
        sendLoading={false}
      />
    )
    expect(html).toContain("미리보기 전용")
    expect(html).toContain("이메일 발송 가능 1명 · 발송 안 함")
    expect(html).toContain("고객 세그먼트(CRM) · 이메일 발송 가능 1명(대상 3명) · 발송 안 함")
    expect(html).not.toContain("전체 active 구독자")
    expect(html).not.toContain("자동 제외됩니다")
    expect(html).not.toContain("{org} 빈 값")
  })
})

describe("소스 계약 — 발송 센터가 세그먼트 모드 체크를 레일에 넘긴다", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

  it("SendCenter 는 railReview 로 레일을 채우고 허브 체크를 그대로 넘기지 않는다", () => {
    const center = read("components/admin/marketing/SendCenter.tsx")
    expect(center).toContain("segmentModeSendReview({ checks, draft, preview: segmentPreview, status: segmentPreviewStatus })")
    expect(center).toContain("checks={railReview.checks}")
    expect(center).toContain("readiness={railReview.readiness}")
    expect(center).not.toContain("checks={checks}")
    expect(center).not.toContain("readiness={readiness}")
    // 넘김이 바뀌면 옛 세그먼트의 미리보기를 쓰지 않는다
    expect(center).toContain("segmentPreviewSnapshot?.segmentId === segmentHandoff.segmentId")
  })

  it("허브 변수 체크는 같은 함수를 대상 구독자와 함께 부른다", () => {
    const hub = read("components/admin/marketing/MarketingHub.tsx")
    expect(hub).toContain("buildVariableCheck(draft, draftRecipients)")
  })

  it("받는 사람 카드는 로드 중·실패·완료를 구분해 알린다", () => {
    const card = read("components/admin/marketing/SegmentAudienceCard.tsx")
    expect(card).toContain('onPreviewChangeRef.current?.(preview, "ready")')
    expect(card).toContain('onPreviewChangeRef.current?.(null, "error")')
    expect(card).toContain('onPreviewChangeRef.current?.(null, "loading")')
  })
})
