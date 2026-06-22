# 챗봇 상단 퍼널 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 사이트 챗봇의 상단 퍼널(발견·오픈·첫질문)을 키운다 — 사이트 2분 체류 시 뜨는 은은한 맥락 말풍선, 페이지별 시작질문, 가격 가드레일, 프로그램적 오픈, 퍼널 계측.

**Architecture:** 챗봇 메시지 상태는 기존 `FloatingChatbot` 안에 두고, "열림·프리필"만 `window` 커스텀 이벤트로 끌어올린다. 트리거·매칭·가격정책 같은 의사결정은 순수 함수(`lib/chatbot/*`)로 분리해 vitest(node)로 단위 테스트하고, React/DOM 결합부(칩 컴포넌트·체류 훅·통합)는 lint+build로 검증한다(리포에 DOM 테스트 인프라 없음).

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Tailwind 4, framer-motion, lucide-react, vitest(node env), 기존 `trackEvent`→`/api/track/event`→`client_events` 계측.

**근거 스펙:** [docs/superpowers/specs/2026-06-22-chatbot-top-funnel-design.md](docs/superpowers/specs/2026-06-22-chatbot-top-funnel-design.md)

---

## 사전 메모 (모든 Task 공통)

- 테스트 단건 실행: `npx vitest run <path>` (이 리포엔 `test` npm 스크립트가 없다. watch 금지 = `run`).
- 품질 게이트: `npx eslint app components lib --max-warnings=0` · `npm run typecheck` · `npm run build`.
- `@/`는 리포 루트 별칭(`vitest.config.ts`/tsconfig). 새 lib 파일은 2-space, `components/ui/*`는 4-space(기존 `FloatingChatbot.tsx` 관례) 들여쓰기.
- 챗봇 카피 규칙: 따뜻한 상담원 어조, **이모지 없음**, 짧고 스캔 가능하게.
- 커밋은 작업 트리의 무관한 변경을 건드리지 말고 **해당 Task 파일만** `git add` 한다.

## 파일 구조

신규:
- `lib/chatbot/page-context.ts` — 라우트→`{teaser, starters, intent, teaserEligible}` 컨피그 + `resolvePageContext` + `mergeStarters`(순수).
- `lib/chatbot/teaser-policy.ts` — 체류 임계값 + `shouldShowTeaser`(순수).
- `lib/chatbot/open-chatbot.ts` — 커스텀 이벤트 상수/타입 + `buildChatbotOpenDetail`(순수) + `openChatbot`(dispatch).
- `lib/chatbot/pricing-policy.ts` — 가격 구성 항목(OPS 제외) + 가드레일 문구(순수 데이터).
- `components/ui/ChatbotTeaser.tsx` — 칩 UI(프리젠테이셔널).
- `components/ui/useChatbotTeaser.ts` — 체류 적립·세션 억제 훅(순수 정책 호출).
- 테스트: `tests/chatbot/page-context.test.ts`, `tests/chatbot/teaser-policy.test.ts`, `tests/chatbot/open-chatbot.test.ts`, `tests/chatbot/pricing-guardrail.test.ts`.

수정:
- `lib/analytics.ts` — `EventNames`에 퍼널 이벤트 5종 추가.
- `lib/classin-positioning.ts` — `answerPrinciples` 가격 원칙 개정 + OPS-내장 원칙 추가.
- `components/ui/FloatingChatbot.tsx` — 말풍선·페이지 시작질문·오픈 이벤트 구독·계측 통합.

---

## Task 1: 페이지 맥락 컨피그 + 매처 (순수)

**Files:**
- Create: `lib/chatbot/page-context.ts`
- Test: `tests/chatbot/page-context.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/chatbot/page-context.test.ts
import { describe, expect, it } from "vitest"

import { resolvePageContext, mergeStarters } from "@/lib/chatbot/page-context"

describe("resolvePageContext", () => {
  it("returns the home context for '/'", () => {
    const ctx = resolvePageContext("/")
    expect(ctx.key).toBe("home")
    expect(ctx.teaserEligible).toBe(true)
    expect(ctx.starters.length).toBeGreaterThan(0)
  })

  it("matches product and docs by prefix", () => {
    expect(resolvePageContext("/product/hw").key).toBe("product")
    expect(resolvePageContext("/docs/getting-started/setup").key).toBe("docs")
    expect(resolvePageContext("/contact").key).toBe("contact")
  })

  it("falls back to a non-eligible default for unknown paths", () => {
    const ctx = resolvePageContext("/some/unknown/page")
    expect(ctx.key).toBe("default")
    expect(ctx.teaserEligible).toBe(false)
  })

  it("treats null pathname as default", () => {
    expect(resolvePageContext(null).key).toBe("default")
  })

  it("never itemizes a final price in teaser copy", () => {
    for (const path of ["/", "/product/hw", "/contact", "/docs/x"]) {
      expect(resolvePageContext(path).teaser).not.toMatch(/원\b|₩|\d{3,}/)
    }
  })
})

describe("mergeStarters", () => {
  it("puts page starters first, then fills with dynamic ones, deduped, capped", () => {
    const merged = mergeStarters(["A", "B"], ["B", "C", "D", "E"], 4)
    expect(merged).toEqual(["A", "B", "C", "D"])
  })

  it("drops empties and trims", () => {
    expect(mergeStarters([" A ", ""], ["A", "  "], 4)).toEqual(["A"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chatbot/page-context.test.ts`
Expected: FAIL — `resolvePageContext`/`mergeStarters` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/chatbot/page-context.ts
export type ChatbotIntent = "demo" | "support"

export interface PageContext {
  key: string
  teaser: string
  starters: string[]
  intent?: ChatbotIntent
  teaserEligible: boolean
}

const HOME: PageContext = {
  key: "home",
  teaser: "도입부터 운영까지, 막히는 지점 편하게 물어보세요.",
  starters: [
    "Classin이 Zoom이나 일반 전자칠판과 뭐가 다른가요?",
    "우리 학원 90일 도입 순서를 어떻게 잡으면 좋을까요?",
    "전자칠판·녹화·EDB·LMS를 수업 흐름으로 쓰는 방법이 궁금해요",
    "요금/견적은 어떤 항목으로 구성되나요?",
  ],
  intent: "demo",
  teaserEligible: true,
}

const PRODUCT: PageContext = {
  key: "product",
  teaser: "전자칠판·녹화·EDB·LMS, 수업 흐름으로 어떻게 쓰는지 정리해드려요.",
  starters: [
    "전자칠판·녹화·EDB·LMS를 수업 흐름으로 쓰는 방법이 궁금해요",
    "Classin 전자칠판은 일반 전자칠판과 뭐가 다른가요?",
    "EDB 교안은 어떻게 재사용하나요?",
    "우리 학원 도입 순서를 어떻게 잡으면 좋을까요?",
  ],
  intent: "demo",
  teaserEligible: true,
}

const CONTACT: PageContext = {
  key: "contact",
  teaser: "상담 전에 미리 정리해드릴까요? 도입·운영·견적 무엇이든요.",
  starters: [
    "도입 전 확인해야 할 것들을 알려주세요",
    "우리 학원 90일 도입 순서가 궁금해요",
    "요금/견적은 어떤 항목으로 구성되나요?",
    "전자칠판 설치·온보딩은 어떻게 진행되나요?",
  ],
  intent: "demo",
  teaserEligible: true,
}

const DOCS: PageContext = {
  key: "docs",
  teaser: "이 문서 관련해서 더 궁금한 점, 바로 물어보세요.",
  starters: [
    "방금 본 내용을 우리 학원 상황에 맞게 정리해줄 수 있나요?",
    "수업 전 10분 루틴은 어떻게 잡나요?",
    "교사 온보딩은 어떤 순서로 하나요?",
    "출결·보강 운영은 어떻게 하나요?",
  ],
  intent: "support",
  teaserEligible: true,
}

const DEFAULT: PageContext = {
  key: "default",
  teaser: "",
  starters: [
    "수업 시스템 OS 관점으로 설명해 주세요",
    "도입 전 확인 질문을 알려주세요",
    "요금과 전자칠판 패키지 견적이 궁금해요",
  ],
  teaserEligible: false,
}

const ENTRIES: Array<{ match: (path: string) => boolean; context: PageContext }> = [
  { match: (p) => p === "/", context: HOME },
  { match: (p) => p.startsWith("/product"), context: PRODUCT },
  { match: (p) => p.startsWith("/contact"), context: CONTACT },
  { match: (p) => p.startsWith("/docs"), context: DOCS },
]

export function resolvePageContext(pathname: string | null | undefined): PageContext {
  const path = pathname ?? ""
  return ENTRIES.find((entry) => entry.match(path))?.context ?? DEFAULT
}

export function mergeStarters(
  pageStarters: string[],
  dynamicStarters: string[],
  limit: number
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of [...pageStarters, ...dynamicStarters]) {
    const trimmed = value?.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
    if (out.length >= limit) break
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/chatbot/page-context.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/chatbot/page-context.ts tests/chatbot/page-context.test.ts
git commit -m "$(printf 'feat(chatbot): add page-context config and starter merge\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: 말풍선 트리거 정책 (순수)

**Files:**
- Create: `lib/chatbot/teaser-policy.ts`
- Test: `tests/chatbot/teaser-policy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/chatbot/teaser-policy.test.ts
import { describe, expect, it } from "vitest"

import { shouldShowTeaser, TEASER_DWELL_THRESHOLD_MS } from "@/lib/chatbot/teaser-policy"

const base = {
  dwellMs: TEASER_DWELL_THRESHOLD_MS,
  isEligible: true,
  shown: false,
  dismissed: false,
  openedBefore: false,
}

describe("shouldShowTeaser", () => {
  it("threshold is 2 minutes", () => {
    expect(TEASER_DWELL_THRESHOLD_MS).toBe(120_000)
  })

  it("shows once eligible and dwell crosses the threshold", () => {
    expect(shouldShowTeaser(base)).toBe(true)
  })

  it("does not show below the threshold", () => {
    expect(shouldShowTeaser({ ...base, dwellMs: TEASER_DWELL_THRESHOLD_MS - 1 })).toBe(false)
  })

  it("does not show on non-eligible pages", () => {
    expect(shouldShowTeaser({ ...base, isEligible: false })).toBe(false)
  })

  it("is suppressed by shown / dismissed / openedBefore", () => {
    expect(shouldShowTeaser({ ...base, shown: true })).toBe(false)
    expect(shouldShowTeaser({ ...base, dismissed: true })).toBe(false)
    expect(shouldShowTeaser({ ...base, openedBefore: true })).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chatbot/teaser-policy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/chatbot/teaser-policy.ts
export const TEASER_DWELL_THRESHOLD_MS = 120_000

export interface TeaserDecisionInput {
  dwellMs: number
  isEligible: boolean
  shown: boolean
  dismissed: boolean
  openedBefore: boolean
}

export function shouldShowTeaser(input: TeaserDecisionInput): boolean {
  return (
    input.isEligible &&
    !input.shown &&
    !input.dismissed &&
    !input.openedBefore &&
    input.dwellMs >= TEASER_DWELL_THRESHOLD_MS
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/chatbot/teaser-policy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/chatbot/teaser-policy.ts tests/chatbot/teaser-policy.test.ts
git commit -m "$(printf 'feat(chatbot): add teaser dwell trigger policy\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: 프로그램적 오픈 유틸 (순수 빌더 + dispatch)

**Files:**
- Create: `lib/chatbot/open-chatbot.ts`
- Test: `tests/chatbot/open-chatbot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/chatbot/open-chatbot.test.ts
import { describe, expect, it } from "vitest"

import { buildChatbotOpenDetail, CHATBOT_OPEN_EVENT } from "@/lib/chatbot/open-chatbot"

describe("buildChatbotOpenDetail", () => {
  it("keeps the source and passes intent through", () => {
    expect(buildChatbotOpenDetail({ source: "cta", intent: "demo" })).toEqual({
      source: "cta",
      intent: "demo",
    })
  })

  it("trims prefill and omits it when empty", () => {
    expect(buildChatbotOpenDetail({ source: "teaser", prefill: "  요금 구성  " })).toEqual({
      source: "teaser",
      prefill: "요금 구성",
    })
    expect(buildChatbotOpenDetail({ source: "button", prefill: "   " })).toEqual({
      source: "button",
    })
  })

  it("exposes a stable event name", () => {
    expect(CHATBOT_OPEN_EVENT).toBe("classin:chatbot-open")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chatbot/open-chatbot.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/chatbot/open-chatbot.ts
export const CHATBOT_OPEN_EVENT = "classin:chatbot-open"

export type ChatbotOpenSource = "button" | "teaser" | "cta"
export type ChatbotOpenIntent = "demo" | "support"

export interface ChatbotOpenInput {
  source: ChatbotOpenSource
  prefill?: string
  intent?: ChatbotOpenIntent
}

export interface ChatbotOpenDetail {
  source: ChatbotOpenSource
  prefill?: string
  intent?: ChatbotOpenIntent
}

export function buildChatbotOpenDetail(input: ChatbotOpenInput): ChatbotOpenDetail {
  const detail: ChatbotOpenDetail = { source: input.source }
  const prefill = input.prefill?.trim()
  if (prefill) detail.prefill = prefill
  if (input.intent) detail.intent = input.intent
  return detail
}

// 클라이언트에서만 호출된다(서버에선 no-op). FloatingChatbot 이 CHATBOT_OPEN_EVENT 를 구독한다.
export function openChatbot(input: ChatbotOpenInput): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<ChatbotOpenDetail>(CHATBOT_OPEN_EVENT, {
      detail: buildChatbotOpenDetail(input),
    })
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/chatbot/open-chatbot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/chatbot/open-chatbot.ts tests/chatbot/open-chatbot.test.ts
git commit -m "$(printf 'feat(chatbot): add programmatic open event util\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: 가격 가드레일 (정책 데이터 + positioning 개정)

**Files:**
- Create: `lib/chatbot/pricing-policy.ts`
- Modify: `lib/classin-positioning.ts` (`answerPrinciples` 배열, 현재 lines ~72-78)
- Test: `tests/chatbot/pricing-guardrail.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/chatbot/pricing-guardrail.test.ts
import { describe, expect, it } from "vitest"

import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import { PRICE_COMPOSITION_ITEMS } from "@/lib/chatbot/pricing-policy"

describe("pricing guardrail", () => {
  it("does not itemize OPS as a price component", () => {
    expect(PRICE_COMPOSITION_ITEMS.some((item) => /OPS/i.test(item))).toBe(false)
  })

  it("price principle drops OPS and routes the final quote to consultation", () => {
    const principles = CLASSIN_POSITIONING.chatbot.answerPrinciples
    const pricePrinciple = principles.find((p) => p.includes("가격"))
    expect(pricePrinciple).toBeDefined()
    expect(pricePrinciple).not.toMatch(/OPS/i)
    expect(pricePrinciple).toContain("상담")
  })

  it("still presents OPS as a built-in strength somewhere", () => {
    const principles = CLASSIN_POSITIONING.chatbot.answerPrinciples
    expect(principles.some((p) => /OPS/i.test(p) && p.includes("내장"))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chatbot/pricing-guardrail.test.ts`
Expected: FAIL — `pricing-policy` 없음 + 현재 가격 원칙이 "OPS"를 포함.

- [ ] **Step 3a: Create the policy module**

```ts
// lib/chatbot/pricing-policy.ts
// 견적 "구성"을 설명할 때 쓰는 항목. OPS 는 전자칠판 내장이라 별도 항목이 아니다.
export const PRICE_COMPOSITION_ITEMS = [
  "카메라·스탠드·벽걸이",
  "소프트웨어 연동",
  "온보딩 범위",
] as const

export const PRICE_FINAL_QUOTE_GUIDANCE =
  "최종 견적과 구체 금액은 단정하지 않고 상담 연결로 맞춤 안내합니다."

export const OPS_BUILTIN_NOTE =
  "전자칠판에 내장된 OPS(윈도우 기반 컴퓨팅)는 별도 견적 항목이 아니라 기본 강점으로 설명합니다."
```

- [ ] **Step 3b: Revise the positioning price principle**

`lib/classin-positioning.ts`의 `answerPrinciples` 배열에서 기존 가격 줄

```ts
    "가격 질문은 OPS, 윈도우 기반 컴퓨팅, 카메라/스탠드, 소프트웨어 연동, 온보딩 범위까지 함께 설명합니다.",
```

을 아래 **두 줄**로 교체한다(OPS 제거 + 상담 라우팅 + 내장 강점 별도 원칙):

```ts
    "가격 질문은 카메라·스탠드·벽걸이, 소프트웨어 연동, 온보딩 범위를 중심으로 구성을 설명하고, 최종 견적과 구체 금액은 단정하지 않고 상담 연결로 맞춤 안내합니다.",
    "전자칠판에 내장된 OPS(윈도우 기반 컴퓨팅)는 별도 견적 항목이 아니라 기본 강점으로 설명합니다.",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/chatbot/pricing-guardrail.test.ts`
Expected: PASS.

또한 기존 가격/정책 회귀가 깨지지 않는지 확인:
Run: `npx vitest run tests/chatbot/answer-policy-regression.test.ts`
Expected: PASS (기존 그대로). 만약 이 테스트가 옛 "OPS" 문구를 단정 검사하면, 그 단언을 새 문구에 맞게 갱신하고 변경 이유를 커밋 메시지에 남긴다.

- [ ] **Step 5: Commit**

```bash
git add lib/chatbot/pricing-policy.ts lib/classin-positioning.ts tests/chatbot/pricing-guardrail.test.ts
git commit -m "$(printf 'feat(chatbot): price guardrail — drop OPS line item, route final quote to consultation\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: 계측 이벤트 이름 추가 (타입)

**Files:**
- Modify: `lib/analytics.ts` (`EventNames` union, 현재 lines 7-17)

- [ ] **Step 1: Extend the union**

`EventNames` 유니온 끝에 5종을 추가한다:

```ts
export type EventNames =
  | "page_view"
  | "click_cta"
  | "submit_demo_request"
  | "submit_newsletter"
  | "download_materials"
  | "view_resource_card"
  | "view_resource"
  | "view_demo_video"
  | "begin_checkout"
  | "purchase"
  | "chatbot_teaser_shown"
  | "chatbot_teaser_clicked"
  | "chatbot_teaser_dismissed"
  | "chatbot_opened"
  | "chatbot_first_question"
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS(타입 전용 변경). 이 이벤트들은 마케팅 픽셀 분기(`submit_*`/`purchase` 등)에 해당하지 않으므로 `trackEvent` 내부 switch/if 수정은 불필요 — 내부 적재(`client_events`)와 gtag/dataLayer 로만 흐른다.

- [ ] **Step 3: Commit**

```bash
git add lib/analytics.ts
git commit -m "$(printf 'feat(analytics): add chatbot funnel event names\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6: 말풍선 칩 컴포넌트 (UI)

**Files:**
- Create: `components/ui/ChatbotTeaser.tsx`

> 리포에 DOM/컴포넌트 테스트 인프라가 없으므로 이 Task는 단위 테스트 대신 lint+build로 검증한다(의사결정 로직은 Task 2에서 테스트됨). 시각 검증은 최종 Task에서 수동으로 한다.

- [ ] **Step 1: Create the component**

```tsx
// components/ui/ChatbotTeaser.tsx
"use client"

import { motion, useReducedMotion } from "framer-motion"
import { X } from "lucide-react"

export function ChatbotTeaser({
    text,
    onOpen,
    onDismiss,
}: {
    text: string
    onOpen: () => void
    onDismiss: () => void
}) {
    const shouldReduceMotion = useReducedMotion()
    if (!text) return null

    return (
        <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            transition={{ duration: shouldReduceMotion ? 0.01 : 0.22, ease: "easeOut" }}
            className="mb-3 flex max-w-[244px] items-center gap-2 rounded-[14px] border border-black/[0.08] bg-white/90 px-3 py-2.5 shadow-[0_10px_24px_rgba(49,48,46,0.10)] backdrop-blur-xl"
        >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#084734]" aria-hidden />
            <button
                type="button"
                onClick={onOpen}
                className="flex-1 text-left text-[12.5px] font-medium leading-snug text-[#3B3835] focus-visible:outline-none"
            >
                {text}
            </button>
            <button
                type="button"
                onClick={onDismiss}
                aria-label="알림 닫기"
                className="shrink-0 text-[#A39E98] transition-colors hover:text-[#615D59] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/25"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </motion.div>
    )
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint components/ui/ChatbotTeaser.tsx --max-warnings=0`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/ui/ChatbotTeaser.tsx
git commit -m "$(printf 'feat(chatbot): add minimal teaser chip component\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 7: 체류 트리거 훅

**Files:**
- Create: `components/ui/useChatbotTeaser.ts`

> 훅은 타이머·`sessionStorage`·`visibilitychange` 부수효과를 다루므로 단위 테스트하지 않는다(node vitest엔 DOM 없음). 순수 판정은 Task 2에서 테스트됨. lint+build로 검증.

- [ ] **Step 1: Create the hook**

```ts
// components/ui/useChatbotTeaser.ts
"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { resolvePageContext } from "@/lib/chatbot/page-context"
import { shouldShowTeaser, TEASER_DWELL_THRESHOLD_MS } from "@/lib/chatbot/teaser-policy"

const STORAGE_KEY = "classin.chatbot.teaser"
const TICK_MS = 1000

interface StoredTeaserState {
    shown: boolean
    dismissed: boolean
    openedBefore: boolean
    dwellMs: number
}

const EMPTY: StoredTeaserState = { shown: false, dismissed: false, openedBefore: false, dwellMs: 0 }

function readState(): StoredTeaserState {
    if (typeof window === "undefined") return { ...EMPTY }
    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY)
        if (!raw) return { ...EMPTY }
        const parsed = JSON.parse(raw) as Partial<StoredTeaserState>
        return {
            shown: Boolean(parsed.shown),
            dismissed: Boolean(parsed.dismissed),
            openedBefore: Boolean(parsed.openedBefore),
            dwellMs: typeof parsed.dwellMs === "number" ? parsed.dwellMs : 0,
        }
    } catch {
        return { ...EMPTY }
    }
}

function writeState(next: StoredTeaserState) {
    if (typeof window === "undefined") return
    try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
        // 프라이빗 모드 등 sessionStorage 불가 → 무시
    }
}

export interface ChatbotTeaserApi {
    show: boolean
    text: string
    intent?: "demo" | "support"
    leadQuestion: string
    dismiss: () => void
    markClicked: () => void
}

export function useChatbotTeaser({
    pathname,
    isOpen,
}: {
    pathname: string | null
    isOpen: boolean
}): ChatbotTeaserApi {
    const stateRef = useRef<StoredTeaserState>(readState())
    const [show, setShow] = useState(false)
    const context = resolvePageContext(pathname)
    const isEligible = context.teaserEligible

    // 탭이 보일 때만 체류 시간을 적립하고, 임계 도달 시 한 번 노출한다.
    useEffect(() => {
        if (typeof window === "undefined") return
        const interval = window.setInterval(() => {
            if (document.visibilityState !== "visible") return
            const prev = stateRef.current
            const dwellMs = Math.min(prev.dwellMs + TICK_MS, TEASER_DWELL_THRESHOLD_MS + TICK_MS)
            let next: StoredTeaserState = { ...prev, dwellMs }
            if (
                shouldShowTeaser({
                    dwellMs,
                    isEligible,
                    shown: next.shown,
                    dismissed: next.dismissed,
                    openedBefore: next.openedBefore,
                })
            ) {
                next = { ...next, shown: true }
                setShow(true)
            }
            stateRef.current = next
            writeState(next)
        }, TICK_MS)
        return () => window.clearInterval(interval)
    }, [isEligible])

    // 비-eligible 페이지로 이동하면 노출을 감춘다(세션당 1회 정책상 재노출은 없음).
    useEffect(() => {
        if (!isEligible) setShow(false)
    }, [isEligible])

    const markOpened = useCallback(() => {
        const next = { ...stateRef.current, openedBefore: true }
        stateRef.current = next
        writeState(next)
        setShow(false)
    }, [])

    const dismiss = useCallback(() => {
        const next = { ...stateRef.current, dismissed: true }
        stateRef.current = next
        writeState(next)
        setShow(false)
    }, [])

    const markClicked = useCallback(() => {
        setShow(false)
    }, [])

    // 챗봇이 (어떤 경로로든) 열리면 다시 뜨지 않게 표시한다.
    useEffect(() => {
        if (isOpen) markOpened()
    }, [isOpen, markOpened])

    return {
        show: show && isEligible,
        text: context.teaser,
        intent: context.intent,
        leadQuestion: context.starters[0] ?? "",
        dismiss,
        markClicked,
    }
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint components/ui/useChatbotTeaser.ts --max-warnings=0`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/ui/useChatbotTeaser.ts
git commit -m "$(printf 'feat(chatbot): add dwell-based teaser hook\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 8: FloatingChatbot 통합

**Files:**
- Modify: `components/ui/FloatingChatbot.tsx`

목표: (1) 페이지 맥락 시작질문, (2) 말풍선 렌더+계측, (3) `classin:chatbot-open` 구독+프리필, (4) 오픈/첫질문 계측.

- [ ] **Step 1: Add imports**

기존 import 블록(`@/lib/classin-positioning` 줄 부근)에 추가:

```tsx
import { trackEvent } from "@/lib/analytics"
import { resolvePageContext, mergeStarters } from "@/lib/chatbot/page-context"
import {
    CHATBOT_OPEN_EVENT,
    openChatbot,
    type ChatbotOpenDetail,
    type ChatbotOpenSource,
} from "@/lib/chatbot/open-chatbot"
import { ChatbotTeaser } from "@/components/ui/ChatbotTeaser"
import { useChatbotTeaser } from "@/components/ui/useChatbotTeaser"
```

- [ ] **Step 2: Page-context starters + teaser hook + open-tracking refs**

`export function FloatingChatbot()` 본문에서 `const hidden = shouldHideChatbot(pathname)` **다음에** 추가:

```tsx
    const pageContext = useMemo(() => resolvePageContext(pathname), [pathname])
    const chatbotTeaser = useChatbotTeaser({ pathname, isOpen })
    const openSourceRef = useRef<ChatbotOpenSource>("button")
    const wasOpenRef = useRef(false)
    const firstQuestionSentRef = useRef(false)
    const teaserShownTrackedRef = useRef(false)
```

그리고 초기 `messages` useState 의 welcome `suggestedQuestions: starterQuestions` 를 페이지 맥락 기반 lazy init 으로 바꾼다:

```tsx
    const [messages, setMessages] = useState<ChatMessage[]>(() => [
        {
            id: "welcome",
            role: "assistant",
            content: CLASSIN_POSITIONING.chatbot.welcome,
            suggestedQuestions: resolvePageContext(pathname).starters.slice(0, STARTER_SUGGESTION_LIMIT),
        },
    ])
```

- [ ] **Step 3: Merge dynamic starters with page context**

`loadStarterQuestions` 이펙트에서 welcome 갱신부를 페이지 맥락 우선 병합으로 바꾼다. 기존:

```tsx
                if (questions.length === 0) return

                setMessages((current) =>
                    current.map((message) =>
                        message.id === "welcome"
                            ? { ...message, suggestedQuestions: questions }
                            : message
                    )
                )
```

를 아래로 교체하고, 이펙트 의존성 배열 `[hidden]` → `[hidden, pageContext]` 로 바꾼다:

```tsx
                const merged = mergeStarters(pageContext.starters, questions, STARTER_SUGGESTION_LIMIT)
                if (merged.length === 0) return

                setMessages((current) =>
                    current.map((message) =>
                        message.id === "welcome"
                            ? { ...message, suggestedQuestions: merged }
                            : message
                    )
                )
```

- [ ] **Step 4: Subscribe to the open event + track opens**

다른 이펙트들 사이(예: Escape 핸들러 이펙트 근처, `if (hidden) return null` **이전**)에 추가:

```tsx
    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<ChatbotOpenDetail>).detail
            openSourceRef.current = detail?.source ?? "cta"
            if (detail?.prefill) setInput(detail.prefill)
            if (detail?.intent === "demo" || detail?.intent === "support") {
                if (detail.intent === "support") setIsDeepConsultation(true)
            }
            setIsOpen(true)
        }
        window.addEventListener(CHATBOT_OPEN_EVENT, handler)
        return () => window.removeEventListener(CHATBOT_OPEN_EVENT, handler)
    }, [])

    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            trackEvent("chatbot_opened", { source: openSourceRef.current })
        }
        wasOpenRef.current = isOpen
    }, [isOpen])

    useEffect(() => {
        if (chatbotTeaser.show && !teaserShownTrackedRef.current) {
            teaserShownTrackedRef.current = true
            trackEvent("chatbot_teaser_shown", { path: pathname })
        }
        if (!chatbotTeaser.show) teaserShownTrackedRef.current = false
    }, [chatbotTeaser.show, pathname])
```

> 주의: 이 이펙트들은 `if (hidden) return null` 보다 **위**에 있어야 React 훅 순서 규칙을 어기지 않는다. `useChatbotTeaser` 호출(Step 2)도 동일하게 early return 위에 있다.

- [ ] **Step 5: Track first question**

`async function sendQuestion(question: string)` 안에서 `const trimmed = question.trim()` 및 `if (!trimmed || isSending) return` **직후**에 추가:

```tsx
        if (!firstQuestionSentRef.current) {
            firstQuestionSentRef.current = true
            trackEvent("chatbot_first_question", { path: pathname })
        }
```

- [ ] **Step 6: FAB click sets source "button"**

FAB `motion.button` 의 `onClick={() => setIsOpen((current) => !current)}` 를 아래로 교체:

```tsx
                    onClick={() => {
                        openSourceRef.current = "button"
                        setIsOpen((current) => !current)
                    }}
```

- [ ] **Step 7: Render the teaser above the FAB**

FAB 컨테이너 `<div className="relative flex h-14 w-14 ...">` **바로 앞에** 추가:

```tsx
            <AnimatePresence>
                {!isOpen && chatbotTeaser.show ? (
                    <ChatbotTeaser
                        text={chatbotTeaser.text}
                        onOpen={() => {
                            trackEvent("chatbot_teaser_clicked", { path: pathname })
                            chatbotTeaser.markClicked()
                            openChatbot({
                                source: "teaser",
                                prefill: chatbotTeaser.leadQuestion,
                                intent: chatbotTeaser.intent,
                            })
                        }}
                        onDismiss={() => {
                            trackEvent("chatbot_teaser_dismissed", { path: pathname })
                            chatbotTeaser.dismiss()
                        }}
                    />
                ) : null}
            </AnimatePresence>
```

> `AnimatePresence`·`useMemo`·`useRef`·`motion` 은 이미 import 되어 있다. 새로 필요한 것은 Step 1의 import 뿐이다.

- [ ] **Step 8: Lint + typecheck + build**

```bash
npx eslint app components lib --max-warnings=0
npm run typecheck
npm run build
```
Expected: 모두 PASS. (eslint exhaustive-deps 경고가 새로 뜨면, 의도적으로 비운 의존성에는 해당 줄에 기존 코드와 동일한 방식으로 처리 — 리포의 다른 이펙트 패턴을 따른다.)

- [ ] **Step 9: Commit**

```bash
git add components/ui/FloatingChatbot.tsx
git commit -m "$(printf 'feat(chatbot): wire teaser, page-context starters, open event, funnel tracking\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 9: 전체 게이트 + 수동 검증

**Files:** 없음(검증만)

- [ ] **Step 1: Full quality gate**

```bash
npx vitest run tests/chatbot
npx eslint app components lib --max-warnings=0
npm run typecheck
npm run build
```
Expected: 모두 PASS.

- [ ] **Step 2: 말풍선 동작 수동 검증**

`npm run dev`(포트 3888) 후 임시로 `lib/chatbot/teaser-policy.ts`의 `TEASER_DWELL_THRESHOLD_MS`를 `5_000`으로 낮춰 빠르게 확인한다(검증 후 **반드시 120_000으로 복구**):
- 홈(`/`)에서 5초 후 우하단 버튼 위에 칩 노출, 한 줄+점+×.
- × 클릭 → 사라지고 새로고침 전까지 재노출 안 됨(`sessionStorage`의 `classin.chatbot.teaser.dismissed`).
- 칩 텍스트 클릭 → 챗봇 열림 + 입력창에 그 페이지 리드 질문 프리필.
- `/contact`·`/product/*`·`/docs/*`에서 카피가 페이지별로 바뀜. 알 수 없는 경로에선 칩이 안 뜸(default 비-eligible).
- 이미 챗봇을 한 번 열면 이후 칩이 안 뜸(`openedBefore`).

- [ ] **Step 3: 프로그램적 오픈 + 계측 수동 검증**

- 콘솔에서 `window.dispatchEvent(new CustomEvent("classin:chatbot-open",{detail:{source:"cta",prefill:"요금 구성이 궁금해요"}}))` → 챗봇 열림 + 프리필.
- 네트워크 탭에서 `/api/track/event` 호출로 `chatbot_teaser_shown`/`chatbot_teaser_clicked`/`chatbot_opened`(source 구분)/`chatbot_first_question` 적재 확인(분석 동의가 켜진 상태에서).

- [ ] **Step 4: Threshold 복구 확인 + 최종 커밋(필요 시)**

`TEASER_DWELL_THRESHOLD_MS === 120_000` 인지 확인. 임시 변경을 했다면 되돌린 상태로 게이트 재실행.

```bash
git status   # 임시 변경 잔여 없음 확인
```

---

## 이 계획에서 의도적으로 제외한 것

- **외부 CTA 시범 연결(스펙 §7/§11)**: `openChatbot()` 메커니즘과 말풍선 소비는 제공하지만, 기존 페이지 CTA를 챗봇 오픈으로 바꾸는 것은 사용자의 "시안 먼저" 취향상 별도 비주얼 검토가 필요하므로 후속 작업으로 남긴다. 유틸은 public 이라 바로 연결 가능.
- **`/pricing` 노출(스펙 D6)**: 현행 hidden 유지 — 변경 없음.
- **로드맵(C 만족·재사용, D 상담·리드 전환)**: 범위 밖.

## Self-Review 메모

- 스펙 커버리지: D2 말풍선(T6/T7/T8) · D3 미니멀 칩(T6) · D4 페이지 카피(T1) · D5 2분 트리거(T2) · D6 /pricing 미노출(변경 없음, T9에서 확인) · D7 OPS 제외·상담 라우팅(T4) · D8 최소 글로벌 오픈(T3/T8) · D9 프로그램 오픈+계측(T3/T5/T8). 첫질문 전환=페이지 시작질문(T1/T8)+first_question 계측(T5/T8).
- 타입 일관성: `ChatbotOpenSource`/`ChatbotOpenDetail`(T3)을 T8이 그대로 import. `resolvePageContext`/`mergeStarters`(T1)·`shouldShowTeaser`/`TEASER_DWELL_THRESHOLD_MS`(T2)를 T7/T8이 동일 시그니처로 사용. 이벤트명 `chatbot_*`(T5)와 `trackEvent` 호출(T8) 일치.
- 플레이스홀더 없음: 모든 코드 스텝에 실제 코드 포함.
