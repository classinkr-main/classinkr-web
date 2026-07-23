# 캠페인 행사 갤러리 뷰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/campaigns?tab=events`에 리스트 뷰를 유지한 채 컴팩트 갤러리 뷰(옵션 토글) + 검색/필터 + 클릭 시 상세 모달(홈페이지 링크 + 신규 "관련 자료" 링크)을 추가한다.

**Architecture:** 지금 하나로 뭉쳐 있는 `EventFunnelCard`를 `EventCardHeader`(배지/제목/기간) + `EventDetailContent`(설명·경제지표·퍼널·관련 자료)로 쪼개 `components/admin/campaigns/`에 둔다. 리스트 카드와 신규 상세 모달이 이 두 컴포넌트를 그대로 재사용해 두 뷰가 항상 같은 정보를 보여준다. 신규 `EventGalleryCard`(미니멀 커버)·`EventDetailModal`(중앙 오버레이)도 같은 디렉터리에 추가한다. "관련 자료" 링크는 `EventMetrics`(파일 기반 `data/event-metrics.json`, Supabase 마이그레이션 불필요)에 `relatedLinks` 필드로 저장한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, vitest(환경 `node`, React 렌더 하네스 없음 → `renderToStaticMarkup` + 문자열 매칭으로 컴포넌트 테스트).

**설계 근거 문서:** [docs/active/campaign-events-gallery-design-2026-07-20.md](../active/campaign-events-gallery-design-2026-07-20.md)

**계획 수립 중 확정한 사소한 결정 2가지** (설계 문서엔 없던 디테일):
1. CSV 내보내기(`eventExport`)는 지금처럼 `sortedEvents`(필터 미적용) 기준 그대로 둔다. 검색/상태/카테고리 필터는 화면 표시에만 영향.
2. "관련 자료"는 리스트 카드·모달 모두 "N개" 텍스트가 아니라 실제 클릭 가능한 작은 링크 칩으로 렌더링한다(하나의 렌더 경로만 유지 — count 전용 모드를 따로 만들지 않음).

---

## File Structure

**Create:**
- `components/admin/campaigns/event-format.ts` — 공용 포맷 함수(`statusTone`, `formatRange`, `previewText`, `won`, `pct`, `KRW`, `formatMetaDate`)
- `components/admin/campaigns/FunnelStage.tsx` — 퍼널 단계 바 (기존 로컬 컴포넌트 이전)
- `components/admin/campaigns/EventCardHeader.tsx` — 배지·제목·기간 헤더 (리스트 카드/모달 공용)
- `components/admin/campaigns/EventDetailContent.tsx` — 상세 본문(설명·경제지표·퍼널·서브지표·귀속힌트·홈페이지 링크·관련 자료) (리스트 카드/모달 공용)
- `components/admin/campaigns/EventGalleryCard.tsx` — 갤러리 미니멀 커버 카드 (신규)
- `components/admin/campaigns/EventDetailModal.tsx` — 상세 모달 셸 (신규)
- `components/admin/campaigns/filter-events.ts` — 검색/상태/카테고리 필터 순수 함수 (신규)
- `tests/api/admin-event-metrics-related-links.test.ts`
- `tests/campaigns/event-format.test.ts`
- `tests/campaigns/funnel-stage.test.tsx`
- `tests/campaigns/event-card-header.test.tsx`
- `tests/campaigns/event-detail-content.test.tsx`
- `tests/campaigns/filter-events.test.ts`
- `tests/campaigns/event-gallery-card.test.tsx`
- `tests/campaigns/event-detail-modal.test.tsx`

**Modify:**
- `lib/types/event-metrics.ts` — `RelatedLink` 타입 + `EventMetrics.relatedLinks` 필드
- `app/api/admin/event-metrics/[id]/route.ts` — `sanitizeRelatedLinks` + PATCH 화이트리스트에 반영
- `lib/repositories/event-metrics.ts` — `relatedLinks` 기본값/보정 로직 (`adSpendEntries`와 동일 패턴)
- `app/admin/campaigns/page.tsx` — import 정리, `EventFunnelCard` 리팩터, `MetricsEditor`에 관련 자료 편집 섹션 추가, 상태/툴바/렌더 분기 추가

---

## Task 1: `RelatedLink` 타입 + 서버 sanitizer

**Files:**
- Modify: `lib/types/event-metrics.ts`
- Modify: `app/api/admin/event-metrics/[id]/route.ts`
- Test: `tests/api/admin-event-metrics-related-links.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/api/admin-event-metrics-related-links.test.ts` 생성:

```ts
import { describe, expect, it } from "vitest"
import { sanitizeRelatedLinks } from "@/app/api/admin/event-metrics/[id]/route"

describe("sanitizeRelatedLinks", () => {
  it("keeps valid {label,url} entries and trims whitespace", () => {
    const result = sanitizeRelatedLinks([
      { label: "  블로그 후기  ", url: " https://blog.classin.co.kr/incheon " },
    ])
    expect(result).toEqual([{ label: "블로그 후기", url: "https://blog.classin.co.kr/incheon" }])
  })

  it("drops entries with an empty label", () => {
    const result = sanitizeRelatedLinks([{ label: "  ", url: "https://example.com" }])
    expect(result).toEqual([])
  })

  it("drops entries whose url is not http(s)", () => {
    const result = sanitizeRelatedLinks([
      { label: "위험한 링크", url: "javascript:alert(1)" },
      { label: "상대경로", url: "/local/path" },
    ])
    expect(result).toEqual([])
  })

  it("returns [] for non-array input", () => {
    expect(sanitizeRelatedLinks(undefined)).toEqual([])
    expect(sanitizeRelatedLinks("not-an-array")).toEqual([])
  })

  it("caps at 10 entries", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      label: `링크 ${i}`,
      url: `https://example.com/${i}`,
    }))
    expect(sanitizeRelatedLinks(many)).toHaveLength(10)
  })
})
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npx vitest run tests/api/admin-event-metrics-related-links.test.ts`
Expected: FAIL — `sanitizeRelatedLinks is not a function` (아직 export되지 않음)

- [ ] **Step 3: `RelatedLink` 타입 추가**

`lib/types/event-metrics.ts`에서 `AdSpendEntry` 인터페이스 바로 아래에 추가:

```ts
export interface RelatedLink {
  label: string
  url: string
}
```

`EventMetrics` 인터페이스의 `adSpendEntries: AdSpendEntry[]` 줄 바로 아래에 추가:

```ts
  // 관련 자료 (블로그·보도자료 등 외부 링크, 수동 입력)
  relatedLinks: RelatedLink[]
```

`DEFAULT_EVENT_METRICS`의 `adSpendEntries: [],` 줄 바로 아래에 추가:

```ts
  relatedLinks: [],
```

- [ ] **Step 4: route.ts에 sanitizer 추가 + PATCH에 반영**

`app/api/admin/event-metrics/[id]/route.ts` 상단 import에 `RelatedLink` 추가:

```ts
import type { AdSpendEntry, RelatedLink } from "@/lib/types/event-metrics"
```

`sanitizeAdSpend` 함수 바로 아래에 추가(`export` 필수 — 테스트에서 직접 import):

```ts
export function sanitizeRelatedLinks(value: unknown): RelatedLink[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry): RelatedLink | null => {
      if (!entry || typeof entry !== "object") return null
      const obj = entry as Record<string, unknown>
      const label = typeof obj.label === "string" ? obj.label.trim() : ""
      const url = typeof obj.url === "string" ? obj.url.trim() : ""
      if (!label || !/^https?:\/\//i.test(url)) return null
      return { label, url }
    })
    .filter((entry): entry is RelatedLink => entry !== null)
    .slice(0, 10)
}
```

`PATCH` 핸들러 안 `patch` 객체(`adSpendEntries: sanitizeAdSpend(body.adSpendEntries),` 줄 바로 아래)에 추가:

```ts
      relatedLinks: sanitizeRelatedLinks(body.relatedLinks),
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/api/admin-event-metrics-related-links.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: 커밋**

```bash
git add lib/types/event-metrics.ts app/api/admin/event-metrics/[id]/route.ts tests/api/admin-event-metrics-related-links.test.ts
git commit -m "feat(campaigns): EventMetrics에 relatedLinks 필드 + 서버 검증 추가"
```

---

## Task 2: 저장소 기본값/보정

**Files:**
- Modify: `lib/repositories/event-metrics.ts`

이 파일은 `data/event-metrics.json`을 직접 읽고 쓰는 fs 기반 저장소이고 `DATA_DIR`이 `process.cwd()`에 고정돼 있어(주입 불가) 이 저장소는 지금도 전용 테스트가 없다(`adSpendEntries` 보정 로직도 테스트 없음 — 동일 패턴 유지, fs를 목킹하는 새 테스트 하네스를 이번 범위에서 새로 만들지 않는다). 검증은 Step 2의 수동 확인 + Task 12의 전체 브라우저 회귀로 대체한다.

- [ ] **Step 1: `getEventMetrics`에 보정 추가**

`lib/repositories/event-metrics.ts`의 `getEventMetrics` 함수 안, `adSpendEntries: Array.isArray(existing.adSpendEntries) ? existing.adSpendEntries : [],` 줄 바로 아래에 추가:

```ts
      relatedLinks: Array.isArray(existing.relatedLinks) ? existing.relatedLinks : [],
```

- [ ] **Step 2: `getAllEventMetrics`에 보정 추가**

같은 파일 `getAllEventMetrics` 함수 안, 동일한 `adSpendEntries: Array.isArray(metrics.adSpendEntries) ? metrics.adSpendEntries : [],` 줄 바로 아래에 추가:

```ts
      relatedLinks: Array.isArray(metrics.relatedLinks) ? metrics.relatedLinks : [],
```

- [ ] **Step 3: `saveEventMetrics`에 병합 로직 추가**

같은 파일 `saveEventMetrics` 함수 안, `adSpendEntries: patch.adSpendEntries ?? current.adSpendEntries ?? [],` 줄 바로 아래에 추가:

```ts
    relatedLinks: patch.relatedLinks ?? current.relatedLinks ?? [],
```

- [ ] **Step 4: 수동 확인**

Run: `npx tsc --noEmit` (또는 `npm run build`의 타입체크 단계) — 컴파일 에러 없어야 함. `data/event-metrics.json`에 기존 항목이 있다면 `relatedLinks` 없이도 API가 500 없이 응답하는지는 Task 12에서 브라우저로 재확인.

- [ ] **Step 5: 커밋**

```bash
git add lib/repositories/event-metrics.ts
git commit -m "feat(campaigns): event-metrics 저장소에 relatedLinks 보정 추가"
```

---

## Task 3: 공용 포맷 헬퍼 + FunnelStage 추출

**Files:**
- Create: `components/admin/campaigns/event-format.ts`
- Create: `components/admin/campaigns/FunnelStage.tsx`
- Modify: `app/admin/campaigns/page.tsx`
- Test: `tests/campaigns/event-format.test.ts`
- Test: `tests/campaigns/funnel-stage.test.tsx`

`page.tsx`(현재 2585줄)에서 순수 함수 몇 개와 `FunnelStage` 컴포넌트를 그대로 옮기고, `page.tsx`는 옮긴 것을 import해서 쓰도록 바꾼다. 동작은 바뀌지 않는 순수 리팩터.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/campaigns/event-format.test.ts` 생성:

```ts
import { describe, expect, it } from "vitest"
import { formatRange, previewText, statusTone, won, pct } from "@/components/admin/campaigns/event-format"

describe("formatRange", () => {
  it("formats a single day with M/D", () => {
    expect(formatRange("2026-07-18T00:00:00.000Z", null)).toBe("7/18")
  })
  it("formats a range as start ~ end", () => {
    expect(formatRange("2026-07-18T00:00:00.000Z", "2026-07-20T00:00:00.000Z")).toBe("7/18 ~ 7/20")
  })
})

describe("previewText", () => {
  it("returns null for empty/whitespace input", () => {
    expect(previewText(null)).toBeNull()
    expect(previewText("   ")).toBeNull()
  })
  it("truncates beyond maxLength with an ellipsis", () => {
    const long = "a".repeat(200)
    const result = previewText(long, 160)
    expect(result?.length).toBe(160)
    expect(result?.endsWith("…")).toBe(true)
  })
})

describe("statusTone", () => {
  it("returns a distinct class string per status", () => {
    expect(statusTone("진행 중")).toContain("emerald")
    expect(statusTone("예정")).toContain("blue")
    expect(statusTone("마감")).not.toContain("emerald")
  })
})

describe("won/pct", () => {
  it("renders — for null/undefined", () => {
    expect(won(null)).toBe("—")
    expect(pct(undefined)).toBe("—")
  })
  it("formats a number", () => {
    expect(pct(42)).toBe("42%")
  })
})
```

`tests/campaigns/funnel-stage.test.tsx` 생성:

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { FunnelStage } from "@/components/admin/campaigns/FunnelStage"

describe("FunnelStage", () => {
  it("renders label and value", () => {
    const html = renderToStaticMarkup(<FunnelStage label="리드" value={42} />)
    expect(html).toContain("리드")
    expect(html).toContain("42")
  })

  it("shows a conversion rate when prevValue is given", () => {
    const html = renderToStaticMarkup(<FunnelStage label="신청" value={20} prevValue={40} />)
    expect(html).toContain("50%")
  })
})
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npx vitest run tests/campaigns/event-format.test.ts tests/campaigns/funnel-stage.test.tsx`
Expected: FAIL — 모듈을 찾을 수 없음(`Cannot find module '@/components/admin/campaigns/event-format'`)

- [ ] **Step 3: `event-format.ts` 작성**

`components/admin/campaigns/event-format.ts` 생성 — `app/admin/campaigns/page.tsx`의 기존 구현을 그대로 옮긴다(동작 변경 없음):

```ts
import type { EventStatus } from "@/lib/types/public-events"

export const KRW = new Intl.NumberFormat("ko-KR")
const KRW_CURRENCY = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
})
export const won = (n: number | null | undefined) => (n == null ? "—" : KRW_CURRENCY.format(Math.round(n)))
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${n}%`)
export const compact = new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 })

export function previewText(value: string | null | undefined, maxLength = 160) {
  const text = value?.replace(/\s+/g, " ").trim()
  if (!text) return null
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

export function money(value: number | null | undefined, currency = "USD") {
  if (value == null) return "—"
  if (currency === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  }
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

export function statusTone(status: EventStatus): string {
  switch (status) {
    case "진행 중":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "예정":
      return "bg-blue-50 text-blue-700 border-blue-200"
    case "마감":
      return "bg-[#f0f0ec] text-[#1a1a1a]/40 border-[#e8e8e4]"
  }
}

export function formatRange(startsAt: string, endsAt: string | null) {
  const s = new Date(startsAt)
  const sLabel = `${s.getMonth() + 1}/${s.getDate()}`
  if (!endsAt) return sLabel
  const e = new Date(endsAt)
  const eLabel = `${e.getMonth() + 1}/${e.getDate()}`
  return `${sLabel} ~ ${eLabel}`
}

export function formatMetaDate(value?: string) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`
}
```

- [ ] **Step 4: `FunnelStage.tsx` 작성**

`components/admin/campaigns/FunnelStage.tsx` 생성 — `page.tsx`의 기존 `FunnelStage` 함수를 그대로 옮긴다:

```tsx
import { KRW } from "./event-format"

export function FunnelStage({
  label,
  value,
  prevValue,
  tone = "neutral",
}: {
  label: string
  value: number
  prevValue?: number | null
  tone?: "neutral" | "primary"
}) {
  const rate =
    prevValue != null && prevValue > 0 && value > 0 ? Math.round((value / prevValue) * 100) : null
  const bar =
    prevValue != null && prevValue > 0
      ? Math.max(8, Math.min(100, Math.round((value / prevValue) * 100)))
      : value > 0
        ? 100
        : 8
  const accent = tone === "primary" ? "bg-[#084734]" : "bg-[#111110]"
  return (
    <div className="rounded-xl border border-[#e8e8e4] bg-white px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium text-[#1a1a1a]/50">{label}</p>
        {rate != null && (
          <span className="text-[10px] font-medium text-[#1a1a1a]/35">{rate}%</span>
        )}
      </div>
      <p className="mt-1 text-[18px] font-bold leading-none tracking-[-0.02em] text-[#111110]">
        {KRW.format(value)}
      </p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#f0f0ec]">
        <div className={`h-full ${accent}`} style={{ width: `${bar}%` }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/campaigns/event-format.test.ts tests/campaigns/funnel-stage.test.tsx`
Expected: PASS (9 tests)

- [ ] **Step 6: `page.tsx`에서 로컬 정의 제거하고 import로 교체**

`app/admin/campaigns/page.tsx`에서 다음 로컬 정의를 **삭제**한다(원래 105~156줄 부근, `KRW`/`KRW_CURRENCY`/`won`/`pct`/`compact`/`previewText`/`money`/`statusTone`/`formatRange`/`formatMetaDate` — `formatMetaDate`는 355~360줄 부근에 따로 있음)와 `FunnelStage` 함수 정의(673~709줄 부근) 전체를 삭제한다.

파일 상단 import 블록(`import { textMatchesEventToken } ...` 근처)에 추가:

```ts
import { FunnelStage } from "@/components/admin/campaigns/FunnelStage"
import {
  KRW,
  compact,
  formatMetaDate,
  formatRange,
  money,
  pct,
  previewText,
  statusTone,
  won,
} from "@/components/admin/campaigns/event-format"
```

- [ ] **Step 7: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공. (미사용 import·정의 중복 등 ESLint 경고가 뜨면 그 자리에서 정리)

- [ ] **Step 8: 커밋**

```bash
git add components/admin/campaigns/event-format.ts components/admin/campaigns/FunnelStage.tsx app/admin/campaigns/page.tsx tests/campaigns/event-format.test.ts tests/campaigns/funnel-stage.test.tsx
git commit -m "refactor(campaigns): 포맷 헬퍼·FunnelStage를 components/admin/campaigns로 추출"
```

---

## Task 4: `EventCardHeader` 컴포넌트

**Files:**
- Create: `components/admin/campaigns/EventCardHeader.tsx`
- Test: `tests/campaigns/event-card-header.test.tsx`

**Files 참고 (원본):** `app/admin/campaigns/page.tsx`의 `EventFunnelCard` 헤더 블록(917~948줄 부근, `{/* header */}` 주석)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/campaigns/event-card-header.test.tsx` 생성:

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { EventCardHeader } from "@/components/admin/campaigns/EventCardHeader"
import type { PublicEvent } from "@/lib/types/public-events"

function makeEvent(overrides: Partial<PublicEvent> = {}): PublicEvent {
  return {
    id: "evt-1",
    title: "Classin Meets Incheon",
    description: null,
    category: "오프라인 행사",
    tag: null,
    startsAt: "2026-07-18T00:00:00.000Z",
    endsAt: null,
    location: "인천",
    ctaLabel: "신청하기",
    ctaHref: null,
    imagePath: null,
    imageUrl: null,
    highlight: false,
    statusOverride: null,
    status: "진행 중",
    publicationStatus: "published",
    slug: "classin-meets-incheon",
    contentMarkdown: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("EventCardHeader", () => {
  it("renders status, category, title, date range and location", () => {
    const html = renderToStaticMarkup(<EventCardHeader event={makeEvent()} />)
    expect(html).toContain("진행 중")
    expect(html).toContain("오프라인 행사")
    expect(html).toContain("Classin Meets Incheon")
    expect(html).toContain("7/18")
    expect(html).toContain("인천")
  })

  it("renders a tag pill only when tag is set", () => {
    const withoutTag = renderToStaticMarkup(<EventCardHeader event={makeEvent()} />)
    expect(withoutTag).not.toContain("FEF3EE")
    const withTag = renderToStaticMarkup(<EventCardHeader event={makeEvent({ tag: "얼리버드" })} />)
    expect(withTag).toContain("얼리버드")
  })

  it("renders the actions slot when provided", () => {
    const html = renderToStaticMarkup(
      <EventCardHeader event={makeEvent()} actions={<button>성과 입력</button>} />
    )
    expect(html).toContain("성과 입력")
  })
})
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npx vitest run tests/campaigns/event-card-header.test.tsx`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 구현**

`components/admin/campaigns/EventCardHeader.tsx` 생성:

```tsx
import type { ReactNode } from "react"
import type { PublicEvent } from "@/lib/types/public-events"
import { formatRange, statusTone } from "./event-format"

export function EventCardHeader({
  event,
  actions,
}: {
  event: PublicEvent
  actions?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone(event.status)}`}
          >
            {event.status}
          </span>
          <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[11px] font-medium text-[#1a1a1a]/55">
            {event.category}
          </span>
          {event.tag && (
            <span className="rounded-full bg-[#FEF3EE] px-2 py-0.5 text-[11px] font-medium text-[#B85C33]">
              {event.tag}
            </span>
          )}
        </div>
        <h3 className="truncate text-[15px] font-bold tracking-[-0.01em] text-[#111110]">
          {event.title}
        </h3>
        <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
          {formatRange(event.startsAt, event.endsAt)}
          {event.location ? ` · ${event.location}` : ""}
        </p>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/campaigns/event-card-header.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add components/admin/campaigns/EventCardHeader.tsx tests/campaigns/event-card-header.test.tsx
git commit -m "feat(campaigns): EventCardHeader 컴포넌트 추가"
```

---

## Task 5: `EventDetailContent` 컴포넌트 (+ 홈페이지 링크 / 관련 자료)

**Files:**
- Create: `components/admin/campaigns/EventDetailContent.tsx`
- Test: `tests/campaigns/event-detail-content.test.tsx`

**Files 참고 (원본):** `app/admin/campaigns/page.tsx`의 `EventFunnelCard`·`buildFunnel` (880~1111줄 부근), `lib/types/event-metrics.ts`의 `computeEconomics`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/campaigns/event-detail-content.test.tsx` 생성:

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { EventDetailContent } from "@/components/admin/campaigns/EventDetailContent"
import { DEFAULT_EVENT_METRICS, type EventMetrics } from "@/lib/types/event-metrics"
import type { PublicEvent } from "@/lib/types/public-events"

function makeEvent(overrides: Partial<PublicEvent> = {}): PublicEvent {
  return {
    id: "evt-1",
    title: "Classin Meets Incheon",
    description: "인천권 원장님 대상 오프라인 세미나",
    category: "오프라인 행사",
    tag: null,
    startsAt: "2026-07-18T00:00:00.000Z",
    endsAt: null,
    location: "인천",
    ctaLabel: "신청하기",
    ctaHref: null,
    imagePath: null,
    imageUrl: null,
    highlight: false,
    statusOverride: null,
    status: "진행 중",
    publicationStatus: "published",
    slug: "classin-meets-incheon",
    contentMarkdown: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  }
}

function makeMetrics(overrides: Partial<EventMetrics> = {}): EventMetrics {
  return { ...DEFAULT_EVENT_METRICS, eventId: "evt-1", updatedAt: "2026-07-19T00:00:00.000Z", ...overrides }
}

describe("EventDetailContent", () => {
  it("renders description preview and lead source label", () => {
    const html = renderToStaticMarkup(
      <EventDetailContent event={makeEvent()} metrics={makeMetrics()} attributedLeadCount={3} duringLeadCount={0} />
    )
    expect(html).toContain("인천권 원장님 대상")
    expect(html).toContain("명시 매칭 3건")
  })

  it("renders a homepage link when the event has a slug", () => {
    const html = renderToStaticMarkup(
      <EventDetailContent event={makeEvent()} metrics={makeMetrics()} attributedLeadCount={0} duringLeadCount={0} />
    )
    expect(html).toContain("/events/classin-meets-incheon")
  })

  it("omits the homepage link when slug is null", () => {
    const html = renderToStaticMarkup(
      <EventDetailContent
        event={makeEvent({ slug: null })}
        metrics={makeMetrics()}
        attributedLeadCount={0}
        duringLeadCount={0}
      />
    )
    expect(html).not.toContain("/events/")
  })

  it("renders related links as anchors when present, and hides the section when empty", () => {
    const withLinks = renderToStaticMarkup(
      <EventDetailContent
        event={makeEvent()}
        metrics={makeMetrics({
          relatedLinks: [{ label: "블로그 후기", url: "https://blog.classin.co.kr/incheon" }],
        })}
        attributedLeadCount={0}
        duringLeadCount={0}
      />
    )
    expect(withLinks).toContain("블로그 후기")
    expect(withLinks).toContain("https://blog.classin.co.kr/incheon")

    const withoutLinks = renderToStaticMarkup(
      <EventDetailContent event={makeEvent()} metrics={makeMetrics()} attributedLeadCount={0} duringLeadCount={0} />
    )
    expect(withoutLinks).not.toContain("관련 자료")
  })
})
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npx vitest run tests/campaigns/event-detail-content.test.tsx`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 구현**

`components/admin/campaigns/EventDetailContent.tsx` 생성 — `page.tsx`의 `buildFunnel` 함수와 `EventFunnelCard` 본문(950~1108줄)을 그대로 옮기고, 끝에 관련 자료 블록을 추가한다:

```tsx
import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { FunnelStage } from "./FunnelStage"
import { KRW, formatMetaDate, pct, previewText, won } from "./event-format"
import {
  computeEconomics,
  type EventFunnel,
  type EventMetrics,
} from "@/lib/types/event-metrics"
import type { PublicEvent } from "@/lib/types/public-events"

export function buildFunnel(
  event: PublicEvent,
  metrics: EventMetrics,
  attributedCount: number,
  duringCount: number
): EventFunnel {
  const leads = attributedCount + duringCount
  return {
    impressions: metrics.impressionsCount ?? 0,
    leads,
    applications: metrics.applicationsCount ?? 0,
    qualifiedLeads: metrics.qualifiedLeadsCount ?? 0,
    attendees: metrics.attendeesCount ?? 0,
    deals: metrics.dealsCount ?? 0,
  }
}

export function EventDetailContent({
  event,
  metrics,
  attributedLeadCount,
  duringLeadCount,
}: {
  event: PublicEvent
  metrics: EventMetrics
  attributedLeadCount: number
  duringLeadCount: number
}) {
  const funnel = buildFunnel(event, metrics, attributedLeadCount, duringLeadCount)
  const economics = computeEconomics(funnel, metrics)

  const targetProgress =
    metrics.targetLeads != null && metrics.targetLeads > 0
      ? Math.min(100, Math.round((funnel.leads / metrics.targetLeads) * 100))
      : null
  const detailPreview = previewText(event.description) ?? previewText(event.contentMarkdown)
  const publicHref = event.slug ? `/events/${event.slug}` : null
  const dealCustomersPreview = previewText(metrics.dealCustomers, 120)
  const retrospectivePreview = previewText(metrics.retrospective, 180)
  const shareMemoPreview = previewText(metrics.shareMemo, 180)
  const leadSourceLabel =
    attributedLeadCount > 0 && duringLeadCount > 0
      ? `명시 ${KRW.format(attributedLeadCount)} · 기간 ${KRW.format(duringLeadCount)}건`
      : attributedLeadCount > 0
        ? `명시 매칭 ${KRW.format(attributedLeadCount)}건`
        : duringLeadCount > 0
          ? `기간 fallback ${KRW.format(duringLeadCount)}건`
          : "집계 리드 없음"

  return (
    <>
      <div className="mb-3 border-y border-[#f0f0ec] py-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/35">
              행사 정보
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/60">
              {detailPreview ?? "설명 또는 상세 본문이 아직 입력되지 않았습니다."}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#1a1a1a]/45">
              <span>CTA: {event.ctaLabel}</span>
              {event.ctaHref && <span className="max-w-[220px] truncate">링크: {event.ctaHref}</span>}
              {publicHref && (
                <Link
                  href={publicHref}
                  className="inline-flex items-center gap-1 font-medium text-[#084734] hover:underline"
                >
                  상세 페이지
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
          <dl className="grid gap-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#1a1a1a]/40">공개 상태</dt>
              <dd className="font-semibold text-[#111110]">
                {event.publicationStatus === "published" ? "공개" : "초안"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#1a1a1a]/40">리드 집계</dt>
              <dd className="font-semibold text-[#111110]">{leadSourceLabel}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#1a1a1a]/40">성사 고객</dt>
              <dd className="font-semibold text-[#111110]">
                {metrics.closedCustomerCount != null ? `${KRW.format(metrics.closedCustomerCount)}곳` : "미입력"}
              </dd>
            </div>
            {dealCustomersPreview && (
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-[#1a1a1a]/40">고객</dt>
                <dd className="min-w-0 text-right font-semibold text-[#111110]">{dealCustomersPreview}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#1a1a1a]/40">성과 업데이트</dt>
              <dd className="font-semibold text-[#111110]">
                {metrics.updatedAt ? formatMetaDate(metrics.updatedAt) : "미입력"}
              </dd>
            </div>
          </dl>
        </div>
        {(metrics.notes || retrospectivePreview || shareMemoPreview) && (
          <div className="mt-2 grid gap-2 lg:grid-cols-3">
            {metrics.notes && (
              <p className="rounded-lg bg-[#fafaf8] px-3 py-2 text-[11px] leading-relaxed text-[#1a1a1a]/55">
                <span className="font-semibold text-[#111110]">내부 메모</span>
                <span className="ml-2">{metrics.notes}</span>
              </p>
            )}
            {retrospectivePreview && (
              <p className="rounded-lg bg-[#fafaf8] px-3 py-2 text-[11px] leading-relaxed text-[#1a1a1a]/55">
                <span className="font-semibold text-[#111110]">회고</span>
                <span className="ml-2">{retrospectivePreview}</span>
              </p>
            )}
            {shareMemoPreview && (
              <p className="rounded-lg bg-[#ECFDF5] px-3 py-2 text-[11px] leading-relaxed text-[#084734]">
                <span className="font-semibold">공유 포인트</span>
                <span className="ml-2">{shareMemoPreview}</span>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#1a1a1a]/35">광고비</p>
          <p className="mt-0.5 text-[14px] font-bold text-[#111110]">{won(economics.adSpendTotal)}</p>
        </div>
        <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#1a1a1a]/35">매출</p>
          <p className="mt-0.5 text-[14px] font-bold text-[#111110]">{metrics.dealsRevenue != null ? won(economics.revenue) : "—"}</p>
        </div>
        <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#1a1a1a]/35">CPL</p>
          <p className="mt-0.5 text-[14px] font-bold text-[#111110]">{economics.cpl != null ? won(economics.cpl) : "—"}</p>
        </div>
        <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#1a1a1a]/35">ROI</p>
          <p
            className={`mt-0.5 text-[14px] font-bold ${
              economics.roi == null
                ? "text-[#1a1a1a]/30"
                : economics.roi >= 0
                  ? "text-[#084734]"
                  : "text-[#B85C33]"
            }`}
          >
            {pct(economics.roi)}
          </p>
        </div>
      </div>

      {targetProgress != null && (
        <div className="mb-3 rounded-xl bg-[#ECFDF5] px-3 py-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-[#084734]">리드 목표 달성</span>
            <span className="text-[#084734]">
              {KRW.format(funnel.leads)} / {KRW.format(metrics.targetLeads ?? 0)} · {targetProgress}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
            <div className="h-full bg-[#084734]" style={{ width: `${targetProgress}%` }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        <FunnelStage label="노출" value={funnel.impressions} />
        <FunnelStage label="리드" value={funnel.leads} prevValue={funnel.impressions || null} tone="primary" />
        <FunnelStage label="신청" value={funnel.applications} prevValue={funnel.leads || null} />
        <FunnelStage label="유효 리드" value={funnel.qualifiedLeads} prevValue={funnel.applications || null} />
        <FunnelStage label="참석" value={funnel.attendees} prevValue={funnel.qualifiedLeads || null} />
        <FunnelStage label="딜" value={funnel.deals} prevValue={funnel.attendees || null} tone="primary" />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-lg border border-[#e8e8e4] px-2.5 py-1.5">
          <span className="text-[#1a1a1a]/40">유효 전환</span>
          <span className="ml-1 font-semibold text-[#111110]">{pct(economics.leadConversionRate)}</span>
        </div>
        <div className="rounded-lg border border-[#e8e8e4] px-2.5 py-1.5">
          <span className="text-[#1a1a1a]/40">참석률</span>
          <span className="ml-1 font-semibold text-[#111110]">{pct(economics.attendanceRate)}</span>
        </div>
        <div className="rounded-lg border border-[#e8e8e4] px-2.5 py-1.5">
          <span className="text-[#1a1a1a]/40">딜 전환</span>
          <span className="ml-1 font-semibold text-[#111110]">{pct(economics.dealConversionRate)}</span>
        </div>
      </div>

      {attributedLeadCount === 0 && duringLeadCount > 0 && (
        <p className="mt-3 text-[11px] text-[#1a1a1a]/40">
          ⓘ 행사 기간 내 리드 {duringLeadCount}건을 fallback 집계로 사용 중. 정확한 집계를 위해 리드의 source/notes에{" "}
          <code className="rounded bg-[#f0f0ec] px-1 font-mono text-[10px] text-[#111110]">
            event:{event.slug ?? event.id}
          </code>{" "}
          토큰을 추가하세요.
        </p>
      )}

      {metrics.relatedLinks.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/35">
            관련 자료
          </span>
          {metrics.relatedLinks.map((link, idx) => (
            <a
              key={`${link.url}-${idx}`}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-[#e8e8e4] bg-[#fafaf8] px-2.5 py-1 text-[11px] font-medium text-[#084734] hover:bg-[#ECFDF5]"
            >
              {link.label}
              <ExternalLink className="h-3 w-3" />
            </a>
          ))}
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/campaigns/event-detail-content.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add components/admin/campaigns/EventDetailContent.tsx tests/campaigns/event-detail-content.test.tsx
git commit -m "feat(campaigns): EventDetailContent 컴포넌트 추가 (관련 자료 링크 포함)"
```

---

## Task 6: `EventFunnelCard`을 Header+DetailContent 조합으로 리팩터 (리스트 뷰 회귀 확인)

**Files:**
- Modify: `app/admin/campaigns/page.tsx`

- [ ] **Step 1: `EventFunnelCard` 본문 교체**

`app/admin/campaigns/page.tsx`의 `EventFunnelCard` 함수(880~1111줄 부근, `// ─── event card ───` 주석 아래) 전체를 아래로 교체한다. 기존 `buildFunnel` 함수는 Task 5에서 `EventDetailContent.tsx`로 옮겨 `export`했으므로 `page.tsx`에서 **삭제**한다(207~223줄 부근, `assignEventLeads` 아래 `buildFunnel` 정의).

```tsx
function EventFunnelCard({
  event,
  metrics,
  attributedLeadCount,
  duringLeadCount,
  onEdit,
}: {
  event: PublicEvent
  metrics: EventMetrics
  attributedLeadCount: number
  duringLeadCount: number
  onEdit: () => void
}) {
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
      <EventCardHeader
        event={event}
        actions={
          <button
            onClick={onEdit}
            className="shrink-0 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a]/60 transition-colors hover:text-[#111110]"
          >
            성과 입력
          </button>
        }
      />
      <EventDetailContent
        event={event}
        metrics={metrics}
        attributedLeadCount={attributedLeadCount}
        duringLeadCount={duringLeadCount}
      />
    </div>
  )
}
```

파일 상단 import 블록에 추가:

```ts
import { EventCardHeader } from "@/components/admin/campaigns/EventCardHeader"
import { EventDetailContent } from "@/components/admin/campaigns/EventDetailContent"
```

`buildFunnel`을 페이지 다른 곳(`aggregate`·`roiChartData`·`sortedEvents`의 `eventSort === "roi"` 분기 등, 1587~1750줄 부근)에서도 호출하고 있으므로 그 호출부의 `buildFunnel` import는 아래로 교체:

```ts
import { buildFunnel } from "@/components/admin/campaigns/EventDetailContent"
```

(`buildFunnel`은 Task 5에서 이미 `export`된 상태이므로 이 import만 추가하면 된다.)

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 3: 브라우저로 리스트 뷰 회귀 확인**

`npm run dev` 실행 후 `/admin/campaigns?tab=events` 접속:
- 카드 3개(Classin Meets Incheon/Gwang-ju/Busan)가 리팩터 전과 시각적으로 동일하게 보이는지 확인(배지·제목·기간·성과 입력 버튼·경제지표 4칸·퍼널 6단계 모두).
- "성과 입력" 클릭 → 드로어가 그대로 열리는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add app/admin/campaigns/page.tsx components/admin/campaigns/EventDetailContent.tsx
git commit -m "refactor(campaigns): EventFunnelCard가 EventCardHeader+EventDetailContent를 조합하도록 변경"
```

---

## Task 7: `MetricsEditor`에 "관련 자료" 편집 섹션 추가

**Files:**
- Modify: `app/admin/campaigns/page.tsx`

**참고 (원본 패턴):** 같은 파일의 "광고비 (채널별)" 섹션(1269~1335줄 부근) — add/remove 리스트 UI를 그대로 복제한다.

- [ ] **Step 1: `MetricsEditor` state에 `relatedLinks` 추가**

`MetricsEditor` 함수 안, `const [adSpend, setAdSpend] = useState<AdSpendEntry[]>(metrics.adSpendEntries ?? [])` 줄 바로 아래에 추가:

```ts
  const [relatedLinks, setRelatedLinks] = useState<RelatedLink[]>(metrics.relatedLinks ?? [])
```

파일 상단 import에서 `AdSpendEntry` 타입을 가져오는 줄에 `RelatedLink` 추가:

```ts
  type AdChannel,
  type AdSpendEntry,
  type EventFunnel,
  type EventMetrics,
  type RelatedLink,
```

- [ ] **Step 2: 저장 payload에 반영**

`handleSave` 함수 안 `adminFetchJson<EventMetrics>` 호출의 body 객체, `adSpendEntries: adSpend,` 줄 바로 아래에 추가:

```ts
            relatedLinks,
```

- [ ] **Step 3: add/remove 핸들러 추가**

`addAdEntry`/`updateAdEntry`/`removeAdEntry` 함수 바로 아래에 추가:

```ts
  function addRelatedLink() {
    setRelatedLinks((arr) => [...arr, { label: "", url: "" }])
  }
  function updateRelatedLink(idx: number, patch: Partial<RelatedLink>) {
    setRelatedLinks((arr) => arr.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }
  function removeRelatedLink(idx: number) {
    setRelatedLinks((arr) => arr.filter((_, i) => i !== idx))
  }
```

- [ ] **Step 4: 섹션 JSX 추가**

"광고비 (채널별)" `<section>` 바로 아래, "메모 / 회고" `<section>` 바로 위에 삽입:

```tsx
          {/* 관련 자료 */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1a1a1a]/50">
                관련 자료
              </h3>
              <button
                onClick={addRelatedLink}
                className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/60 hover:text-[#111110]"
              >
                <Plus className="w-3 h-3" />
                링크 추가
              </button>
            </div>
            {relatedLinks.length === 0 ? (
              <p className="py-3 text-center text-[12px] text-[#1a1a1a]/30">
                블로그·보도자료 등 관련 글 URL을 추가하세요.
              </p>
            ) : (
              <div className="space-y-2">
                {relatedLinks.map((link, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_1.4fr_auto] items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-2 py-1.5"
                  >
                    <input
                      type="text"
                      placeholder="라벨 (예: 블로그 후기)"
                      aria-label="관련 자료 라벨"
                      value={link.label}
                      onChange={(e) => updateRelatedLink(idx, { label: e.target.value })}
                      className="rounded-md border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px]"
                    />
                    <input
                      type="url"
                      placeholder="https://..."
                      aria-label="관련 자료 URL"
                      value={link.url}
                      onChange={(e) => updateRelatedLink(idx, { url: e.target.value })}
                      className="rounded-md border border-[#e8e8e4] bg-white px-2 py-1.5 text-[12px]"
                    />
                    <button
                      onClick={() => removeRelatedLink(idx)}
                      aria-label="관련 자료 삭제"
                      className="rounded-md p-1.5 text-[#1a1a1a]/40 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
```

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 6: 브라우저로 수동 확인**

`/admin/campaigns?tab=events`에서 아무 카드나 "성과 입력" 클릭 → "관련 자료" 섹션에서 "링크 추가" → 라벨/URL 입력 → 저장 → 드로어를 다시 열어 값이 유지되는지 확인. `http://` 없이 저장 시도하면(서버 sanitizer가 걸러내므로) 해당 항목만 조용히 사라지는지도 확인.

- [ ] **Step 7: 커밋**

```bash
git add app/admin/campaigns/page.tsx
git commit -m "feat(campaigns): 성과 입력 드로어에 관련 자료 링크 편집 섹션 추가"
```

---

## Task 8: `filterEvents` 순수 함수

**Files:**
- Create: `components/admin/campaigns/filter-events.ts`
- Test: `tests/campaigns/filter-events.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/campaigns/filter-events.test.ts` 생성:

```ts
import { describe, expect, it } from "vitest"
import { filterEvents } from "@/components/admin/campaigns/filter-events"
import type { PublicEvent } from "@/lib/types/public-events"

function makeEvent(overrides: Partial<PublicEvent> = {}): PublicEvent {
  return {
    id: "evt-1",
    title: "Classin Meets Incheon",
    description: null,
    category: "오프라인 행사",
    tag: null,
    startsAt: "2026-07-18T00:00:00.000Z",
    endsAt: null,
    location: "인천",
    ctaLabel: "신청하기",
    ctaHref: null,
    imagePath: null,
    imageUrl: null,
    highlight: false,
    statusOverride: null,
    status: "진행 중",
    publicationStatus: "published",
    slug: "classin-meets-incheon",
    contentMarkdown: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  }
}

const events = [
  makeEvent({ id: "1", title: "Classin Meets Incheon", status: "진행 중", category: "오프라인 행사" }),
  makeEvent({ id: "2", title: "Classin Meets Gwang-ju", status: "예정", category: "오프라인 행사" }),
  makeEvent({ id: "3", title: "여름 웨비나: AI 시대 학원", status: "마감", category: "웨비나" }),
]

describe("filterEvents", () => {
  it("returns all events when search/status/category are all default", () => {
    expect(filterEvents(events, { search: "", status: "all", category: "all" })).toHaveLength(3)
  })

  it("matches title case-insensitively as a substring", () => {
    const result = filterEvents(events, { search: "gwang", status: "all", category: "all" })
    expect(result.map((e) => e.id)).toEqual(["2"])
  })

  it("filters by status", () => {
    const result = filterEvents(events, { search: "", status: "마감", category: "all" })
    expect(result.map((e) => e.id)).toEqual(["3"])
  })

  it("filters by category", () => {
    const result = filterEvents(events, { search: "", status: "all", category: "웨비나" })
    expect(result.map((e) => e.id)).toEqual(["3"])
  })

  it("combines search, status and category with AND", () => {
    const result = filterEvents(events, { search: "classin", status: "예정", category: "오프라인 행사" })
    expect(result.map((e) => e.id)).toEqual(["2"])
  })
})
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npx vitest run tests/campaigns/filter-events.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 구현**

`components/admin/campaigns/filter-events.ts` 생성:

```ts
import type { EventCategory, EventStatus, PublicEvent } from "@/lib/types/public-events"

export interface EventFilterOptions {
  search: string
  status: EventStatus | "all"
  category: EventCategory | "all"
}

export function filterEvents(events: PublicEvent[], opts: EventFilterOptions): PublicEvent[] {
  const needle = opts.search.trim().toLowerCase()
  return events.filter((event) => {
    if (needle && !event.title.toLowerCase().includes(needle)) return false
    if (opts.status !== "all" && event.status !== opts.status) return false
    if (opts.category !== "all" && event.category !== opts.category) return false
    return true
  })
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/campaigns/filter-events.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add components/admin/campaigns/filter-events.ts tests/campaigns/filter-events.test.ts
git commit -m "feat(campaigns): 검색/상태/카테고리 필터 순수 함수 추가"
```

---

## Task 9: `EventGalleryCard` 컴포넌트

**Files:**
- Create: `components/admin/campaigns/EventGalleryCard.tsx`
- Test: `tests/campaigns/event-gallery-card.test.tsx`

이미지 도메인은 `next.config.ts`의 `remotePatterns`에 `**.supabase.co/storage/v1/object/**`가 이미 허용돼 있으므로(참고: `app/events/EventsClient.tsx`의 `event.imageUrl` 사용부) `next/image`를 그대로 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/campaigns/event-gallery-card.test.tsx` 생성:

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { EventGalleryCard } from "@/components/admin/campaigns/EventGalleryCard"
import type { PublicEvent } from "@/lib/types/public-events"

function makeEvent(overrides: Partial<PublicEvent> = {}): PublicEvent {
  return {
    id: "evt-1",
    title: "Classin Meets Incheon",
    description: null,
    category: "오프라인 행사",
    tag: null,
    startsAt: "2026-07-18T00:00:00.000Z",
    endsAt: null,
    location: "인천",
    ctaLabel: "신청하기",
    ctaHref: null,
    imagePath: null,
    imageUrl: "https://xyzco.supabase.co/storage/v1/object/public/event-images/incheon.jpg",
    highlight: false,
    statusOverride: null,
    status: "진행 중",
    publicationStatus: "published",
    slug: "classin-meets-incheon",
    contentMarkdown: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("EventGalleryCard", () => {
  it("renders title, status and date/category — no funnel numbers", () => {
    const html = renderToStaticMarkup(<EventGalleryCard event={makeEvent()} onOpen={() => {}} />)
    expect(html).toContain("Classin Meets Incheon")
    expect(html).toContain("진행 중")
    expect(html).toContain("7/18")
    expect(html).toContain("오프라인 행사")
  })

  it("renders a placeholder cover when imageUrl is null", () => {
    const html = renderToStaticMarkup(<EventGalleryCard event={makeEvent({ imageUrl: null })} onOpen={() => {}} />)
    expect(html).not.toContain("<img")
  })

  it("is a clickable button", () => {
    const html = renderToStaticMarkup(<EventGalleryCard event={makeEvent()} onOpen={() => {}} />)
    expect(html).toContain('type="button"')
  })
})
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npx vitest run tests/campaigns/event-gallery-card.test.tsx`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 구현**

`components/admin/campaigns/EventGalleryCard.tsx` 생성:

```tsx
import Image from "next/image"
import { Calendar as CalendarIcon } from "lucide-react"
import type { PublicEvent } from "@/lib/types/public-events"
import { formatRange, statusTone } from "./event-format"

export function EventGalleryCard({
  event,
  onOpen,
}: {
  event: PublicEvent
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white text-left transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
    >
      <div className="relative h-28 w-full overflow-hidden bg-[#084734]">
        {event.imageUrl ? (
          <Image
            src={event.imageUrl}
            alt={event.title}
            fill
            className="object-cover transition-transform group-hover:scale-[1.03]"
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0b5c43] to-[#084734]">
            <CalendarIcon className="h-6 w-6 text-white/50" />
          </div>
        )}
        <span
          className={`absolute left-2 top-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(event.status)}`}
        >
          {event.status}
        </span>
      </div>
      <div className="p-3">
        <p className="truncate text-[13px] font-bold text-[#111110]">{event.title}</p>
        <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
          {formatRange(event.startsAt, event.endsAt)} · {event.category}
        </p>
      </div>
    </button>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/campaigns/event-gallery-card.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add components/admin/campaigns/EventGalleryCard.tsx tests/campaigns/event-gallery-card.test.tsx
git commit -m "feat(campaigns): EventGalleryCard(미니멀 커버) 컴포넌트 추가"
```

---

## Task 10: `EventDetailModal` 컴포넌트

**Files:**
- Create: `components/admin/campaigns/EventDetailModal.tsx`
- Test: `tests/campaigns/event-detail-modal.test.tsx`

**참고 (원본 셸 패턴):** 같은 파일의 `MetricsEditor` 바깥 컨테이너(1192~1205줄 부근 — `fixed inset-0 z-50 ...` 오버레이 + `rounded-t-2xl ... sm:rounded-2xl` 패널)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/campaigns/event-detail-modal.test.tsx` 생성:

```tsx
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { EventDetailModal } from "@/components/admin/campaigns/EventDetailModal"
import { DEFAULT_EVENT_METRICS } from "@/lib/types/event-metrics"
import type { PublicEvent } from "@/lib/types/public-events"

function makeEvent(overrides: Partial<PublicEvent> = {}): PublicEvent {
  return {
    id: "evt-1",
    title: "Classin Meets Incheon",
    description: null,
    category: "오프라인 행사",
    tag: null,
    startsAt: "2026-07-18T00:00:00.000Z",
    endsAt: null,
    location: "인천",
    ctaLabel: "신청하기",
    ctaHref: null,
    imagePath: null,
    imageUrl: null,
    highlight: false,
    statusOverride: null,
    status: "진행 중",
    publicationStatus: "published",
    slug: "classin-meets-incheon",
    contentMarkdown: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("EventDetailModal", () => {
  it("renders the header, a prominent homepage link and the edit button", () => {
    const html = renderToStaticMarkup(
      <EventDetailModal
        event={makeEvent()}
        metrics={{ ...DEFAULT_EVENT_METRICS, eventId: "evt-1", updatedAt: "" }}
        attributedLeadCount={0}
        duringLeadCount={0}
        onClose={() => {}}
        onEdit={() => {}}
      />
    )
    expect(html).toContain("Classin Meets Incheon")
    expect(html).toContain("홈페이지에서 보기")
    expect(html).toContain("/events/classin-meets-incheon")
    expect(html).toContain("성과 입력")
  })

  it("omits the homepage button when the event has no slug", () => {
    const html = renderToStaticMarkup(
      <EventDetailModal
        event={makeEvent({ slug: null })}
        metrics={{ ...DEFAULT_EVENT_METRICS, eventId: "evt-1", updatedAt: "" }}
        attributedLeadCount={0}
        duringLeadCount={0}
        onClose={() => {}}
        onEdit={() => {}}
      />
    )
    expect(html).not.toContain("홈페이지에서 보기")
  })
})
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npx vitest run tests/campaigns/event-detail-modal.test.tsx`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 구현**

`components/admin/campaigns/EventDetailModal.tsx` 생성:

```tsx
import Link from "next/link"
import { ExternalLink, X } from "lucide-react"
import { EventCardHeader } from "./EventCardHeader"
import { EventDetailContent } from "./EventDetailContent"
import type { EventMetrics } from "@/lib/types/event-metrics"
import type { PublicEvent } from "@/lib/types/public-events"

export function EventDetailModal({
  event,
  metrics,
  attributedLeadCount,
  duringLeadCount,
  onClose,
  onEdit,
}: {
  event: PublicEvent
  metrics: EventMetrics
  attributedLeadCount: number
  duringLeadCount: number
  onClose: () => void
  onEdit: () => void
}) {
  const publicHref = event.slug ? `/events/${event.slug}` : null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <EventCardHeader event={event} />
          </div>
          <button onClick={onClose} aria-label="닫기" className="shrink-0 text-[#1a1a1a]/40 hover:text-[#111110]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {publicHref && (
          <div className="border-b border-[#e8e8e4] px-4 py-3 sm:px-6">
            <Link
              href={publicHref}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#063d2a]"
            >
              홈페이지에서 보기
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        <div className="max-h-[calc(100dvh-14rem)] overflow-y-auto px-4 py-5 sm:px-6">
          <EventDetailContent
            event={event}
            metrics={metrics}
            attributedLeadCount={attributedLeadCount}
            duringLeadCount={duringLeadCount}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#e8e8e4] px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-[#1a1a1a]/55 hover:text-[#111110]">
            닫기
          </button>
          <button
            onClick={onEdit}
            className="rounded-lg bg-[#111110] px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#084734]"
          >
            성과 입력
          </button>
        </div>
      </div>
    </div>
  )
}
```

`EventCardHeader`가 헤더 자체에 `mb-3`을 갖고 있어 모달 헤더 컨테이너 안에서 여백이 이중으로 보이면, `EventCardHeader`에 `className`으로 마진을 덮어쓸 필요 없이 이 모달의 헤더 wrapper(`div.min-w-0.flex-1`)에는 추가 마진을 주지 않았으므로 그대로 둔다(리스트 카드와 다른 상하 패딩 컨텍스트이므로 시각적으로 자연스러운지 Step 5에서 눈으로 확인).

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/campaigns/event-detail-modal.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add components/admin/campaigns/EventDetailModal.tsx tests/campaigns/event-detail-modal.test.tsx
git commit -m "feat(campaigns): EventDetailModal(중앙 오버레이 상세) 컴포넌트 추가"
```

---

## Task 11: 갤러리 뷰 + 툴바(검색/필터/뷰 전환) 배선

**Files:**
- Modify: `app/admin/campaigns/page.tsx`

지금까지 만든 컴포넌트를 `events` 탭 렌더 블록(2485~2564줄 부근)에 실제로 연결한다. 이 태스크는 상태가 있는 배선이라 자동 렌더 테스트가 없다 — Step 마지막에 브라우저로 전체 시나리오를 확인한다.

- [ ] **Step 1: import 추가**

파일 상단 import 블록에 추가:

```ts
import { Search, LayoutGrid, List as ListIcon, Link2 } from "lucide-react"
import { EventGalleryCard } from "@/components/admin/campaigns/EventGalleryCard"
import { EventDetailModal } from "@/components/admin/campaigns/EventDetailModal"
import { filterEvents } from "@/components/admin/campaigns/filter-events"
```

(기존 `lucide-react` import 블록에 `Search, LayoutGrid, List as ListIcon, Link2`를 합쳐도 된다 — 별개 import문으로 추가해도 번들링에는 차이 없음.)

- [ ] **Step 2: 상태 추가**

`AdminCampaignsPage` 함수 안, `const [editing, setEditing] = useState<PublicEvent | null>(null)` 줄 바로 아래에 추가:

```ts
  const [viewParam, setViewParam] = useUrlState("view", "list")
  const galleryView = viewParam === "gallery"
  const [eventSearch, setEventSearch] = useState("")
  const [eventStatusFilter, setEventStatusFilter] = useState<EventStatus | "all">("all")
  const [eventCategoryFilter, setEventCategoryFilter] = useState<EventCategory | "all">("all")
  const [viewingEvent, setViewingEvent] = useState<PublicEvent | null>(null)
```

`EventStatus`/`EventCategory`는 이미 `@/lib/types/public-events`에서 import 중(`EVENT_CATEGORIES`는 아직 미사용 — 아래 Step 4에서 씀). 상단 import를 확인해 없으면 추가:

```ts
import { EVENT_CATEGORIES, type EventCategory } from "@/lib/types/public-events"
```

(`EventStatus`는 이미 import돼 있음 — 53줄 부근 `import type { PublicEvent, EventStatus } from "@/lib/types/public-events"`.)

- [ ] **Step 3: `visibleEvents` 파생값 추가**

`sortedEvents` useMemo(1660~1689줄) 바로 아래에 추가:

```ts
  const visibleEvents = useMemo(
    () =>
      filterEvents(sortedEvents, {
        search: eventSearch,
        status: eventStatusFilter,
        category: eventCategoryFilter,
      }),
    [sortedEvents, eventSearch, eventStatusFilter, eventCategoryFilter]
  )
```

`viewingEvent`가 갱신된 데이터(예: 성과 입력 저장 직후)를 반영하도록, `editing` 저장 콜백 근처에 있는 `onSaved={(saved) => setMetricsMap((m) => ({ ...m, [saved.eventId]: saved }))}`는 그대로 두되(이미 `metricsMap`을 갱신하므로 `EventDetailModal`이 다시 열릴 때 최신 값을 받는다), 새로 추가할 `onEdit`에서 `setViewingEvent(null)`도 같이 호출해 모달이 편집 드로어와 겹치지 않게 한다(Step 5 참고).

- [ ] **Step 4: 툴바 교체 — 뷰 토글 + 검색/필터**

`events` 탭 렌더 블록(2485줄 `{activeTab === "events" && (` 부근)의 툴바 `<div className="mb-3 flex flex-wrap items-center gap-2">...</div>`(2487~2526줄)를 아래로 교체한다. 기존 정렬 pill·기간 토글·CSV 버튼은 그대로 유지하되 2번째 행으로 옮긴다:

```tsx
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-[15px] font-semibold text-[#111110]">행사별 퍼널 상세</h2>
            <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label="행사 보기 방식">
              <button
                type="button"
                onClick={() => setViewParam("list")}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
                  !galleryView ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
                }`}
              >
                <ListIcon className="h-3.5 w-3.5" />
                리스트
              </button>
              <button
                type="button"
                onClick={() => setViewParam("gallery")}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
                  galleryView ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                갤러리
              </button>
            </div>
            <CampaignExportButton
              columns={eventExport.columns}
              rows={eventExport.rows}
              filename="campaign-events"
              label="행사 CSV"
              disabled={loading}
            />
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#f0f0ec] bg-[#fafaf8] px-3 py-2">
            <div className="flex min-w-[160px] flex-1 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 text-[#1a1a1a]/35" />
              <input
                type="text"
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                placeholder="행사명 검색..."
                className="w-full text-[12px] outline-none placeholder:text-[#1a1a1a]/35"
              />
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-[#e8e8e4] bg-white p-0.5">
              {(["all", "진행 중", "예정", "마감"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setEventStatusFilter(s)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                    eventStatusFilter === s ? "bg-[#fafaf8] text-[#111110]" : "text-[#1a1a1a]/45 hover:text-[#111110]"
                  }`}
                >
                  {s === "all" ? "전체" : s}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-[#e8e8e4] bg-white p-0.5">
              <button
                type="button"
                onClick={() => setEventCategoryFilter("all")}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                  eventCategoryFilter === "all" ? "bg-[#fafaf8] text-[#111110]" : "text-[#1a1a1a]/45 hover:text-[#111110]"
                }`}
              >
                전체
              </button>
              {EVENT_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEventCategoryFilter(c)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                    eventCategoryFilter === c ? "bg-[#fafaf8] text-[#111110]" : "text-[#1a1a1a]/45 hover:text-[#111110]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-1 rounded-xl border border-[#e8e8e4] bg-white p-0.5">
              {(["date", "leads", "deals", "roi"] as const).map((s) => {
                const label = { date: "날짜", leads: "리드", deals: "딜", roi: "ROI" }[s]
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEventSort(s)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                      eventSort === s
                        ? "bg-white text-[#111110] shadow-sm"
                        : "text-[#1a1a1a]/45 hover:text-[#111110]"
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                setPeriod((p) => (p === "all" ? "active" : "all"))
              }}
              className="flex items-center gap-1 text-[12px] font-medium text-[#1a1a1a]/45 hover:text-[#111110]"
            >
              {period === "all" ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {period === "all" ? "축소" : "전체 기간 보기"}
            </button>
          </div>
```

- [ ] **Step 5: 리스트/갤러리 렌더 분기 + 상세 모달**

같은 블록의 `{loading ? (...) : sortedEvents.length === 0 ? (...) : (<div className="space-y-3">{sortedEvents.map(...)}</div>)}` (2530~2562줄)을 아래로 교체:

```tsx
          {loading ? (
            <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] py-16 text-center text-[13px] text-[#1a1a1a]/30">
              불러오는 중...
            </div>
          ) : sortedEvents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] py-12 text-center">
              <p className="text-[14px] font-medium text-[#111110]">표시할 행사가 없습니다</p>
              <p className="mx-auto mt-1 max-w-md text-[12px] text-[#1a1a1a]/40">
                기간 필터를 바꾸거나 행사 관리에서 새 행사를 등록하세요.
              </p>
            </div>
          ) : visibleEvents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] py-12 text-center">
              <p className="text-[14px] font-medium text-[#111110]">필터에 맞는 행사가 없습니다</p>
              <button
                type="button"
                onClick={() => {
                  setEventSearch("")
                  setEventStatusFilter("all")
                  setEventCategoryFilter("all")
                }}
                className="mt-2 text-[12px] font-medium text-[#084734] hover:underline"
              >
                필터 초기화
              </button>
            </div>
          ) : galleryView ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleEvents.map((event) => (
                <EventGalleryCard key={event.id} event={event} onOpen={() => setViewingEvent(event)} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleEvents.map((event) => {
                const metrics = metricsMap[event.id] ?? {
                  ...DEFAULT_EVENT_METRICS,
                  eventId: event.id,
                  updatedAt: "",
                }
                const leadStats = eventLeadStats.get(event.id) ?? { attributed: 0, during: 0 }
                return (
                  <EventFunnelCard
                    key={event.id}
                    event={event}
                    metrics={metrics}
                    attributedLeadCount={leadStats.attributed}
                    duringLeadCount={leadStats.during}
                    onEdit={() => setEditing(event)}
                  />
                )
              })}
            </div>
          )}
```

(리스트 뷰는 이제 `sortedEvents` 대신 `visibleEvents`를 쓴다 — 필터가 기본값일 때 `visibleEvents === filterEvents(sortedEvents, {search:"",status:"all",category:"all"})`이고 이는 `sortedEvents`와 항목이 동일하므로 필터를 안 건드리면 리스트 뷰는 지금과 100% 동일하게 보인다.)

이 블록 바로 다음, `{editing && (<MetricsEditor .../>)}` 앞에 상세 모달 렌더를 추가:

```tsx
      {viewingEvent && (
        <EventDetailModal
          event={viewingEvent}
          metrics={
            metricsMap[viewingEvent.id] ?? {
              ...DEFAULT_EVENT_METRICS,
              eventId: viewingEvent.id,
              updatedAt: "",
            }
          }
          attributedLeadCount={(eventLeadStats.get(viewingEvent.id) ?? { attributed: 0, during: 0 }).attributed}
          duringLeadCount={(eventLeadStats.get(viewingEvent.id) ?? { attributed: 0, during: 0 }).during}
          onClose={() => setViewingEvent(null)}
          onEdit={() => {
            const target = viewingEvent
            setViewingEvent(null)
            setEditing(target)
          }}
        />
      )}
```

- [ ] **Step 6: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 7: 브라우저로 전체 시나리오 확인**

`npm run dev` → `/admin/campaigns?tab=events`:
1. 기본 진입 시 리스트 뷰(변경 없음) 확인.
2. "갤러리" 클릭 → URL이 `?tab=events&view=gallery`로 바뀌고 미니멀 카드 그리드로 전환되는지 확인. 새로고침해도 갤러리 유지되는지 확인.
3. 검색창에 "gwang" 입력 → 1건만 남는지 확인. 상태 필터 "마감", 카테고리 필터 순서대로 클릭해 각각 걸러지는지 확인. 필터를 조합했을 때 0건이면 "필터에 맞는 행사가 없습니다" + 초기화 버튼이 뜨는지, 클릭 시 원복되는지 확인.
4. 갤러리 카드 클릭 → 중앙 모달이 열리고 제목·홈페이지 링크·퍼널·(있다면) 관련 자료가 보이는지 확인.
5. 모달의 "성과 입력" 클릭 → 모달이 닫히고 편집 드로어가 열리는지, 드로어에서 저장 후 다시 카드를 열었을 때 값이 반영되는지 확인.
6. "리스트"로 돌아가서 카드가 리팩터 전과 동일하게 보이는지 재확인(Task 6에서 이미 확인했지만 필터 배선 후 재확인).

- [ ] **Step 8: 커밋**

```bash
git add app/admin/campaigns/page.tsx
git commit -m "feat(campaigns): 행사 탭에 갤러리 뷰 + 검색/필터 + 상세 모달 배선"
```

---

## Task 12: 최종 회귀 — 품질 게이트 전체 통과

**Files:** 없음(검증 전용)

- [ ] **Step 1: 전체 테스트**

Run: `npm run test`
Expected: 전체 PASS (기존 스위트 + 이번에 추가한 8개 파일 포함, 회귀 없음)

- [ ] **Step 2: 린트**

Run: `npx eslint app components lib --max-warnings=0`
Expected: 경고/에러 0

- [ ] **Step 3: 빌드**

Run: `npm run build`
Expected: 성공

- [ ] **Step 4: 브라우저 최종 확인**

`/admin/campaigns?tab=events`에서 Task 11 Step 7의 시나리오를 모바일 뷰포트(375px)로도 한 번 더 확인 — 갤러리 그리드가 1열로 접히는지, 툴바가 줄바꿈되는지, 상세 모달이 바텀시트로 뜨는지.

- [ ] **Step 5: 커밋 (필요 시)**

이 태스크에서 코드 변경이 없다면 커밋할 것도 없다. 회귀 수정이 있었다면:

```bash
git add -A
git commit -m "fix(campaigns): 최종 회귀 점검에서 발견된 문제 수정"
```
